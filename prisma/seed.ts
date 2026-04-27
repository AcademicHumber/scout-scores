import {
  PrismaClient,
  Role,
  CategoriaScout,
  InvitationStatus,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createId } from "@paralleldrive/cuid2";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  // ── 1. Distrito demo ────────────────────────────────────────────────────────
  const distrito = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { nombre: "Distrito Scout Demo", slug: "demo" },
  });

  // ── 2. Grupos scouts ────────────────────────────────────────────────────────
  const gruposData = [
    { slug: "juan-pablo-ii", nombre: "Grupo Scout Juan Pablo II" },
    { slug: "don-bosco", nombre: "Grupo Scout Don Bosco" },
    { slug: "san-jorge", nombre: "Grupo Scout San Jorge" },
  ] as const;

  const grupos = await Promise.all(
    gruposData.map((g) =>
      prisma.grupoScout.upsert({
        where: {
          organizationId_slug: { organizationId: distrito.id, slug: g.slug },
        },
        update: { nombre: g.nombre },
        create: { ...g, organizationId: distrito.id },
      }),
    ),
  );

  const [jpii, donBosco, sanJorge] = grupos;

  // ── 3. Users demo + Memberships ─────────────────────────────────────────────
  const usersData = [
    {
      email: "admin@demo.local",
      name: "Admin Demo",
      role: Role.ADMIN,
      grupoScoutId: undefined as string | undefined,
    },
    {
      email: "juez1@demo.local",
      name: "Juez Uno",
      role: Role.JUEZ,
      grupoScoutId: undefined as string | undefined,
    },
    {
      email: "juez2@demo.local",
      name: "Juez Dos",
      role: Role.JUEZ,
      grupoScoutId: undefined as string | undefined,
    },
    {
      email: "jefe-jpii@demo.local",
      name: "Jefe Juan Pablo II",
      role: Role.JEFE_PATRULLA,
      grupoScoutId: jpii.id,
    },
  ];

  const users = await Promise.all(
    usersData.map(async ({ email, name, role, grupoScoutId }) => {
      const user = await prisma.user.upsert({
        where: { email },
        update: { name },
        create: { email, name },
      });
      await prisma.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: distrito.id } },
        update: { role, grupoScoutId: grupoScoutId ?? null },
        create: {
          userId: user.id,
          organizationId: distrito.id,
          role,
          grupoScoutId: grupoScoutId ?? null,
        },
      });
      return user;
    }),
  );

  const [adminUser, , , jefeUser] = users;

  // ── 4. MiembroScout: 12 personas ────────────────────────────────────────────
  // Fechas calculadas desde 2026-04-27:
  //   Lobatos: nacidos 2016-2019 (7-10 años)
  //   Exploradores: nacidos 2012-2015 (11-14 años)
  //   Pioneros: nacidos 2009-2011 (15-17 años)
  //   Dirigente: vinculado al User jefe-jpii@demo.local
  const miembrosData: Array<{
    nombre: string;
    fechaNacimiento: Date;
    categoria: CategoriaScout;
    grupoScoutId: string;
    userId?: string;
  }> = [
    // Juan Pablo II: 4 lobatos
    { nombre: "Tomás García", fechaNacimiento: new Date("2018-03-10"), categoria: CategoriaScout.LOBATO, grupoScoutId: jpii.id },
    { nombre: "Valentina López", fechaNacimiento: new Date("2017-07-22"), categoria: CategoriaScout.LOBATO, grupoScoutId: jpii.id },
    { nombre: "Mateo Sánchez", fechaNacimiento: new Date("2016-11-05"), categoria: CategoriaScout.LOBATO, grupoScoutId: jpii.id },
    { nombre: "Isabella Martínez", fechaNacimiento: new Date("2019-01-30"), categoria: CategoriaScout.LOBATO, grupoScoutId: jpii.id },
    // Don Bosco: 4 exploradores
    { nombre: "Lucas Fernández", fechaNacimiento: new Date("2013-06-14"), categoria: CategoriaScout.EXPLORADOR, grupoScoutId: donBosco.id },
    { nombre: "Sofía Rodríguez", fechaNacimiento: new Date("2012-09-03"), categoria: CategoriaScout.EXPLORADOR, grupoScoutId: donBosco.id },
    { nombre: "Santiago Gómez", fechaNacimiento: new Date("2014-04-19"), categoria: CategoriaScout.EXPLORADOR, grupoScoutId: donBosco.id },
    { nombre: "Camila Torres", fechaNacimiento: new Date("2015-12-08"), categoria: CategoriaScout.EXPLORADOR, grupoScoutId: donBosco.id },
    // San Jorge: 3 pioneros
    { nombre: "Agustín Díaz", fechaNacimiento: new Date("2010-02-17"), categoria: CategoriaScout.PIONERO, grupoScoutId: sanJorge.id },
    { nombre: "Martina Ruiz", fechaNacimiento: new Date("2009-08-25"), categoria: CategoriaScout.PIONERO, grupoScoutId: sanJorge.id },
    { nombre: "Felipe Morales", fechaNacimiento: new Date("2011-05-11"), categoria: CategoriaScout.PIONERO, grupoScoutId: sanJorge.id },
    // Juan Pablo II: 1 dirigente vinculado al User jefe-jpii@demo.local
    { nombre: "Jefe Juan Pablo II", fechaNacimiento: new Date("1990-04-15"), categoria: CategoriaScout.DIRIGENTE, grupoScoutId: jpii.id, userId: jefeUser.id },
  ];

  await Promise.all(
    miembrosData.map((m) =>
      // Upsert no trivial: MiembroScout no tiene clave única natural; usamos
      // findFirst + create para idempotencia (por nombre + grupo).
      prisma.miembroScout
        .findFirst({
          where: { nombre: m.nombre, grupoScoutId: m.grupoScoutId, organizationId: distrito.id },
        })
        .then((existing) =>
          existing
            ? prisma.miembroScout.update({
                where: { id: existing.id },
                data: { fechaNacimiento: m.fechaNacimiento, categoria: m.categoria, userId: m.userId ?? null },
              })
            : prisma.miembroScout.create({
                data: {
                  organizationId: distrito.id,
                  grupoScoutId: m.grupoScoutId,
                  nombre: m.nombre,
                  fechaNacimiento: m.fechaNacimiento,
                  categoria: m.categoria,
                  userId: m.userId ?? null,
                },
              }),
        ),
    ),
  );

  // ── 5. Invitaciones pendientes ───────────────────────────────────────────────
  const sevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const invitacionesData = [
    { email: "futuro-juez@demo.local", role: Role.JUEZ },
    { email: "espectador@demo.local", role: Role.ESPECTADOR },
  ];

  const invitations = await Promise.all(
    invitacionesData.map((inv) =>
      prisma.invitation.upsert({
        where: {
          token: `seed-token-${inv.email}`,
        },
        update: { status: InvitationStatus.PENDING, expiresAt: sevenDays },
        create: {
          organizationId: distrito.id,
          email: inv.email,
          role: inv.role,
          token: `seed-token-${inv.email}`,
          status: InvitationStatus.PENDING,
          expiresAt: sevenDays,
        },
      }),
    ),
  );

  // ── 6. AuditLog: 5 entradas ─────────────────────────────────────────────────
  // Idempotencia: buscamos por (organizationId, action, targetId) antes de crear.
  const auditEntries = [
    {
      actorUserId: adminUser.id,
      action: "organization.created",
      targetType: "Organization",
      targetId: distrito.id,
      metadata: { nombre: distrito.nombre },
    },
    {
      actorUserId: adminUser.id,
      action: "grupoScout.created",
      targetType: "GrupoScout",
      targetId: jpii.id,
      metadata: { nombre: jpii.nombre },
    },
    {
      actorUserId: adminUser.id,
      action: "grupoScout.created",
      targetType: "GrupoScout",
      targetId: donBosco.id,
      metadata: { nombre: donBosco.nombre },
    },
    {
      actorUserId: adminUser.id,
      action: "grupoScout.created",
      targetType: "GrupoScout",
      targetId: sanJorge.id,
      metadata: { nombre: sanJorge.nombre },
    },
    {
      actorUserId: adminUser.id,
      action: "invitation.sent",
      targetType: "Invitation",
      targetId: invitations[0].id,
      metadata: { email: invitations[0].email, role: invitations[0].role },
    },
  ];

  await Promise.all(
    auditEntries.map((entry) =>
      prisma.auditLog
        .findFirst({
          where: {
            organizationId: distrito.id,
            action: entry.action,
            targetId: entry.targetId,
          },
        })
        .then((existing) =>
          existing
            ? Promise.resolve(existing)
            : prisma.auditLog.create({
                data: { organizationId: distrito.id, ...entry },
              }),
        ),
    ),
  );

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.organization.count(),
    prisma.grupoScout.count({ where: { organizationId: distrito.id } }),
    prisma.user.count(),
    prisma.membership.count({ where: { organizationId: distrito.id } }),
    prisma.miembroScout.count({ where: { organizationId: distrito.id } }),
    prisma.invitation.count({ where: { organizationId: distrito.id, status: InvitationStatus.PENDING } }),
    prisma.auditLog.count({ where: { organizationId: distrito.id } }),
  ]);

  console.log(`
✓ Seed completado — ${distrito.nombre} (${distrito.id})
  Organizaciones : ${counts[0]}
  Grupos scouts  : ${counts[1]}
  Users          : ${counts[2]}
  Memberships    : ${counts[3]}
  MiembrosScout  : ${counts[4]}
  Invitaciones   : ${counts[5]} PENDING
  AuditLogs      : ${counts[6]}
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
