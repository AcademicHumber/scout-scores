import {
  PrismaClient,
  Role,
  CategoriaScout,
  InvitationStatus,
  EventoEstado,
  ActividadTipo,
  PatrullaCategoria,
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

  // ── 7. ScoreTemplate demo ────────────────────────────────────────────────────
  const templateConstruccion = await prisma.scoreTemplate.upsert({
    where: { organizationId_nombre: { organizationId: distrito.id, nombre: "Construcción básica" } },
    update: {},
    create: {
      organizationId: distrito.id,
      nombre: "Construcción básica",
      descripcion: "Criterios para evaluar construcciones con palos y cuerdas",
      modo: "CRITERIOS",
      categoria: "CONSTRUCCION",
      valoresValidos: [1, 2, 3, 4, 5],
      valoresValidosDesempate: [1, 2, 3],
      criterios: {
        create: [
          { nombre: "Técnica de amarres", tipo: "PUNTUABLE", orden: 1 },
          { nombre: "Solidez estructural", tipo: "PUNTUABLE", orden: 2 },
          { nombre: "Presentación", tipo: "PUNTUABLE", orden: 3 },
          { nombre: "Espíritu scout", tipo: "DESEMPATE", orden: 4 },
        ],
      },
    },
  });

  const templateCocina = await prisma.scoreTemplate.upsert({
    where: { organizationId_nombre: { organizationId: distrito.id, nombre: "Cocina de campamento" } },
    update: {},
    create: {
      organizationId: distrito.id,
      nombre: "Cocina de campamento",
      descripcion: "Evaluación de preparación de alimentos en campamento",
      modo: "CRITERIOS",
      categoria: "COCINA",
      valoresValidos: [1, 2, 3, 4, 5],
      valoresValidosDesempate: [1, 2, 3],
      criterios: {
        create: [
          { nombre: "Sabor", tipo: "PUNTUABLE", orden: 1 },
          { nombre: "Presentación", tipo: "PUNTUABLE", orden: 2 },
          { nombre: "Higiene", tipo: "PUNTUABLE", orden: 3 },
        ],
      },
    },
  });

  // ── 8. Postas del distrito (biblioteca) ──────────────────────────────────────
  const postasData = [
    {
      nombre: "Amarres básicos",
      descripcion: "Evaluación de nudos de amarre cuadrado y diagonal con cuerdas de 5mm",
      duracionMinutos: 15,
      templateId: templateConstruccion.id,
      materiales: [
        { nombre: "Cuerdas de 5mm", cantidad: "20 metros" },
        { nombre: "Palos de 1m", cantidad: "10 unidades" },
      ],
    },
    {
      nombre: "Torre de pionerismo",
      descripcion: "Construcción de una torre de al menos 1.5m usando palos y cuerdas",
      duracionMinutos: 30,
      templateId: templateConstruccion.id,
      materiales: [
        { nombre: "Palos de 2m", cantidad: "6 unidades" },
        { nombre: "Cuerdas de 8mm", cantidad: "15 metros" },
      ],
    },
    {
      nombre: "Desayuno de campamento",
      descripcion: "Preparación de un desayuno completo en fogón",
      duracionMinutos: 45,
      templateId: templateCocina.id,
      materiales: [
        { nombre: "Utensilios de cocina", cantidad: "1 set" },
        { nombre: "Ingredientes", cantidad: "según receta" },
      ],
    },
    {
      nombre: "Orientación con brújula",
      descripcion: "Navegación por puntos usando brújula y mapa topográfico",
      duracionMinutos: 20,
      templateId: null,
      materiales: [
        { nombre: "Brújulas", cantidad: "1 por participante" },
        { nombre: "Mapas topográficos", cantidad: "1 por patrulla" },
      ],
    },
  ];

  const postas = await Promise.all(
    postasData.map((p) =>
      prisma.posta
        .findFirst({ where: { organizationId: distrito.id, nombre: p.nombre } })
        .then((existing) =>
          existing
            ? prisma.posta.update({ where: { id: existing.id }, data: { descripcion: p.descripcion, duracionMinutos: p.duracionMinutos, templateId: p.templateId, materiales: p.materiales } })
            : prisma.posta.create({ data: { organizationId: distrito.id, ...p, materiales: p.materiales } }),
        ),
    ),
  );

  const [postaAmarres, postaTorre, postaDesayuno] = postas;

  // ── 9. Evento demo con actividades, asignaciones y patrullas ─────────────────
  const slugEvento = "campamento-distrital-2026";
  let evento = await prisma.evento.findFirst({ where: { organizationId: distrito.id, slug: slugEvento } });

  if (!evento) {
    const [juez1User, juez2User] = users.slice(1, 3);

    evento = await prisma.evento.create({
      data: {
        organizationId: distrito.id,
        nombre: "Campamento Distrital 2026",
        slug: slugEvento,
        descripcion: "Campamento anual del distrito con pruebas de habilidades scouts",
        lugar: "Campo Escuela La Montaña",
        fechaInicio: new Date("2026-08-15"),
        fechaFin: new Date("2026-08-17"),
        estado: EventoEstado.BORRADOR,
      },
    });

    // Actividades
    const actConstruccion = await prisma.actividad.create({
      data: {
        eventoId: evento.id,
        nombre: "Construcción y pionerismo",
        tipo: ActividadTipo.CONSTRUCCION,
        pesoRelativo: 60,
        orden: 1,
      },
    });

    const actCocina = await prisma.actividad.create({
      data: {
        eventoId: evento.id,
        nombre: "Cocina de campamento",
        tipo: ActividadTipo.COCINA,
        pesoRelativo: 40,
        orden: 2,
      },
    });

    // AsignacionPostas
    await prisma.asignacionPosta.createMany({
      data: [
        {
          id: createId(),
          postaId: postaAmarres!.id,
          actividadId: actConstruccion.id,
          juezUserId: juez1User!.id,
          encargado: "Carlos López",
          ayudantes: "María García",
          weight: 1.0,
          orden: 1,
        },
        {
          id: createId(),
          postaId: postaTorre!.id,
          actividadId: actConstruccion.id,
          juezUserId: juez2User!.id,
          encargado: "Roberto Silva",
          weight: 1.5,
          orden: 2,
        },
        {
          id: createId(),
          postaId: postaDesayuno!.id,
          actividadId: actCocina.id,
          juezUserId: juez1User!.id,
          encargado: "Ana Torres",
          weight: 1.0,
          orden: 1,
        },
      ],
    });

    // Patrullas
    await prisma.patrulla.createMany({
      data: [
        { id: createId(), eventoId: evento.id, grupoScoutId: jpii.id, nombre: "Halcones", categoria: PatrullaCategoria.EXPLORADOR },
        { id: createId(), eventoId: evento.id, grupoScoutId: donBosco.id, nombre: "Águilas", categoria: PatrullaCategoria.EXPLORADOR },
        { id: createId(), eventoId: evento.id, grupoScoutId: sanJorge.id, nombre: "Cóndores", categoria: PatrullaCategoria.PIONERO },
      ],
    });

    await prisma.auditLog.create({
      data: {
        organizationId: distrito.id,
        actorUserId: adminUser.id,
        action: "evento.created",
        targetType: "Evento",
        targetId: evento.id,
        metadata: { nombre: evento.nombre },
      },
    });
  }

  // ── Resumen ──────────────────────────────────────────────────────────────────
  const counts = await Promise.all([
    prisma.organization.count(),
    prisma.grupoScout.count({ where: { organizationId: distrito.id } }),
    prisma.user.count(),
    prisma.membership.count({ where: { organizationId: distrito.id } }),
    prisma.miembroScout.count({ where: { organizationId: distrito.id } }),
    prisma.invitation.count({ where: { organizationId: distrito.id, status: InvitationStatus.PENDING } }),
    prisma.auditLog.count({ where: { organizationId: distrito.id } }),
    prisma.posta.count({ where: { organizationId: distrito.id } }),
    prisma.evento.count({ where: { organizationId: distrito.id } }),
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
  Postas         : ${counts[7]}
  Eventos        : ${counts[8]}
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
