import {
  PrismaClient,
  Role,
  CategoriaScout,
  InvitationStatus,
  EventoEstado,
  ActividadTipo,
  PatrullaCategoria,
  ScoreSheetEstado,
} from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createId } from "@paralleldrive/cuid2";
import { hash } from "bcryptjs";

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
  // admin@demo.local tiene password "demo1234" para poder loguear sin Google en dev.
  const adminPasswordHash = await hash("demo1234", 10);

  const usersData = [
    {
      email: "admin@demo.local",
      name: "Admin Demo",
      role: Role.ADMIN,
      grupoScoutId: undefined as string | undefined,
      passwordHash: adminPasswordHash,
      emailVerified: new Date(),
    },
    {
      email: "juez1@demo.local",
      name: "Juez Uno",
      role: Role.JUEZ,
      grupoScoutId: undefined as string | undefined,
      passwordHash: undefined as string | undefined,
      emailVerified: undefined as Date | undefined,
    },
    {
      email: "juez2@demo.local",
      name: "Juez Dos",
      role: Role.JUEZ,
      grupoScoutId: undefined as string | undefined,
      passwordHash: undefined as string | undefined,
      emailVerified: undefined as Date | undefined,
    },
    {
      email: "jefe-jpii@demo.local",
      name: "Jefe Juan Pablo II",
      role: Role.JEFE_PATRULLA,
      grupoScoutId: jpii.id,
      passwordHash: undefined as string | undefined,
      emailVerified: undefined as Date | undefined,
    },
  ];

  const users = await Promise.all(
    usersData.map(async ({ email, name, role, grupoScoutId, passwordHash, emailVerified }) => {
      const user = await prisma.user.upsert({
        where: { email },
        update: { name, ...(passwordHash ? { passwordHash, emailVerified } : {}) },
        create: { email, name, ...(passwordHash ? { passwordHash, emailVerified } : {}) },
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

  const templatePuntajeUnico = await prisma.scoreTemplate.upsert({
    where: { organizationId_nombre: { organizationId: distrito.id, nombre: "Orientación con brújula" } },
    update: {},
    create: {
      organizationId: distrito.id,
      nombre: "Orientación con brújula",
      descripcion: "Evaluación directa de orientación en campo",
      modo: "PUNTAJE_UNICO",
      categoria: "OTRO",
      valoresValidos: [0, 25, 50, 75, 100],
      valoresValidosDesempate: [],
      criterios: {
        create: [
          { nombre: "Trabajo en equipo", tipo: "DESEMPATE", orden: 1 },
        ],
      },
    },
  });

  // ── 8. Postas del distrito (biblioteca) ──────────────────────────────────────
  // Leyenda de puntajes (Plan 15): criteriosDescripciones queda vacío acá porque
  // depende de los criterionId reales, que recién se conocen tras crear las
  // actividades y sus asignaciones — se completa más abajo (paso 9b).
  const postasData = [
    {
      nombre: "Amarres básicos",
      descripcion: "Evaluación de nudos de amarre cuadrado y diagonal con cuerdas de 5mm",
      duracionMinutos: 15,
      materiales: [
        { nombre: "Cuerdas de 5mm", cantidad: "20 metros" },
        { nombre: "Palos de 1m", cantidad: "10 unidades" },
      ],
    },
    {
      nombre: "Torre de pionerismo",
      descripcion: "Construcción de una torre de al menos 1.5m usando palos y cuerdas",
      duracionMinutos: 30,
      materiales: [
        { nombre: "Palos de 2m", cantidad: "6 unidades" },
        { nombre: "Cuerdas de 8mm", cantidad: "15 metros" },
      ],
    },
    {
      nombre: "Desayuno de campamento",
      descripcion: "Preparación de un desayuno completo en fogón",
      duracionMinutos: 45,
      materiales: [
        { nombre: "Utensilios de cocina", cantidad: "1 set" },
        { nombre: "Ingredientes", cantidad: "según receta" },
      ],
    },
    {
      nombre: "Orientación con brújula",
      descripcion: "Navegación por puntos usando brújula y mapa topográfico",
      duracionMinutos: 20,
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
            ? prisma.posta.update({ where: { id: existing.id }, data: { descripcion: p.descripcion, duracionMinutos: p.duracionMinutos, materiales: p.materiales } })
            : prisma.posta.create({ data: { organizationId: distrito.id, ...p, materiales: p.materiales } }),
        ),
    ),
  );

  const [postaAmarres, postaTorre, postaDesayuno, postaOrientacion] = postas;

  // ── 9. Evento demo con actividades, asignaciones, patrullas y planillas ────────
  const slugEvento = "campamento-distrital-2026";
  const [juez1User, juez2User] = users.slice(1, 3);

  let evento = await prisma.evento.findFirst({
    where: { organizationId: distrito.id, slug: slugEvento },
    include: {
      actividades: { include: { asignaciones: true } },
      patrullas: true,
    },
  });

  if (!evento) {
    const eventoBase = await prisma.evento.create({
      data: {
        organizationId: distrito.id,
        nombre: "Campamento Distrital 2026",
        slug: slugEvento,
        descripcion: "Campamento anual del distrito con pruebas de habilidades scouts",
        lugar: "Campo Escuela La Montaña",
        fechaInicio: new Date("2026-08-15"),
        fechaFin: new Date("2026-08-17"),
        estado: EventoEstado.ACTIVO,
        activatedAt: new Date("2026-08-14"),
      },
    });

    // Actividades — cada una define su propia plantilla (Plan 15): todas las
    // postas asignadas a una actividad puntúan con el mismo criterio.
    const actConstruccion = await prisma.actividad.create({
      data: {
        eventoId: eventoBase.id,
        nombre: "Construcción y pionerismo",
        tipo: ActividadTipo.CONSTRUCCION,
        pesoRelativo: 50,
        templateId: templateConstruccion.id,
        orden: 1,
      },
    });

    const actCocina = await prisma.actividad.create({
      data: {
        eventoId: eventoBase.id,
        nombre: "Cocina de campamento",
        tipo: ActividadTipo.COCINA,
        pesoRelativo: 30,
        templateId: templateCocina.id,
        orden: 2,
      },
    });

    const actOrientacion = await prisma.actividad.create({
      data: {
        eventoId: eventoBase.id,
        nombre: "Orientación y navegación",
        tipo: ActividadTipo.OTRO,
        pesoRelativo: 20,
        templateId: templatePuntajeUnico.id,
        orden: 3,
      },
    });

    // AsignacionPostas
    const asig1 = await prisma.asignacionPosta.create({
      data: {
        id: createId(),
        postaId: postaAmarres!.id,
        actividadId: actConstruccion.id,
        juezUserId: juez1User!.id,
        encargado: "Carlos López",
        ayudantes: "María García",
        weight: 1.0,
        orden: 1,
      },
    });
    const asig2 = await prisma.asignacionPosta.create({
      data: {
        id: createId(),
        postaId: postaTorre!.id,
        actividadId: actConstruccion.id,
        juezUserId: juez2User!.id,
        encargado: "Roberto Silva",
        weight: 1.5,
        orden: 2,
      },
    });
    const asig3 = await prisma.asignacionPosta.create({
      data: {
        id: createId(),
        postaId: postaDesayuno!.id,
        actividadId: actCocina.id,
        juezUserId: juez1User!.id,
        encargado: "Ana Torres",
        weight: 1.0,
        orden: 1,
      },
    });
    await prisma.asignacionPosta.create({
      data: {
        id: createId(),
        postaId: postaOrientacion!.id,
        actividadId: actOrientacion.id,
        juezUserId: juez2User!.id,
        encargado: "Laura Méndez",
        weight: 1.0,
        orden: 1,
      },
    });

    // Patrullas
    const pat1 = await prisma.patrulla.create({ data: { id: createId(), eventoId: eventoBase.id, grupoScoutId: jpii.id, nombre: "Halcones", categoria: PatrullaCategoria.EXPLORADOR } });
    const pat2 = await prisma.patrulla.create({ data: { id: createId(), eventoId: eventoBase.id, grupoScoutId: donBosco.id, nombre: "Águilas", categoria: PatrullaCategoria.EXPLORADOR } });
    const pat3 = await prisma.patrulla.create({ data: { id: createId(), eventoId: eventoBase.id, grupoScoutId: sanJorge.id, nombre: "Cóndores", categoria: PatrullaCategoria.PIONERO } });

    // ScoreSheets demo: asig1 (juez1, CRITERIOS, weight 1.0)
    //   Halcones → ENVIADA con totales calculados
    //   Águilas  → BORRADOR sin totales
    const criteriosConstruccion = await prisma.templateCriterion.findMany({
      where: { templateId: templateConstruccion.id },
      orderBy: { orden: "asc" },
    });
    const [cTecnica, cSolidez, cPresentacion, cEspiritu] = criteriosConstruccion;

    // Leyenda de puntajes (Plan 15): qué significa cada valor de la escala,
    // por criterio (postaAmarres, template CRITERIOS) y por eje único
    // (postaOrientacion, template PUNTAJE_UNICO) — demuestra que no se mezclan.
    await prisma.posta.update({
      where: { id: postaAmarres!.id },
      data: {
        criteriosDescripciones: {
          criterios: {
            [cTecnica!.id]: { "1": "Nudos sueltos, se deshacen al tensar", "3": "Nudos correctos con alguna imperfección", "5": "Nudos perfectos y firmes" },
            [cSolidez!.id]: { "1": "La estructura colapsa al tacto", "3": "Se mantiene en pie pero con holguras", "5": "Totalmente rígida, soporta peso" },
          },
        },
      },
    });
    await prisma.posta.update({
      where: { id: postaOrientacion!.id },
      data: {
        criteriosDescripciones: {
          unico: {
            "0": "No completó el circuito",
            "25": "Completó menos de la mitad de los puntos",
            "50": "Completó la mitad de los puntos",
            "75": "Completó casi todos los puntos",
            "100": "Completó todos los puntos con precisión",
          },
        },
      },
    });

    const sheetHalconesEnviada = await prisma.scoreSheet.create({
      data: {
        asignacionPostaId: asig1.id,
        patrullaId: pat1.id,
        estado: ScoreSheetEstado.ENVIADA,
        totalPuntuable: 12, // (4+4+4) × weight 1.0
        totalDesempate: 3,  // espíritu scout = 3
        enviadaAt: new Date("2026-08-15T10:30:00"),
        enviadaByUserId: juez1User!.id,
        entries: {
          create: [
            { criterionId: cTecnica!.id, valor: 4 },
            { criterionId: cSolidez!.id, valor: 4 },
            { criterionId: cPresentacion!.id, valor: 4 },
            { criterionId: cEspiritu!.id, valor: 3 },
          ],
        },
      },
    });

    await prisma.scoreSheet.create({
      data: {
        asignacionPostaId: asig1.id,
        patrullaId: pat2.id,
        estado: ScoreSheetEstado.BORRADOR,
        entries: {
          create: [
            { criterionId: cTecnica!.id, valor: 3 },
            { criterionId: cSolidez!.id, valor: 3 },
            // Presentación sin cargar (borrador puede estar incompleto)
          ],
        },
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: distrito.id,
        actorUserId: adminUser.id,
        action: "evento.created",
        targetType: "Evento",
        targetId: eventoBase.id,
        metadata: { nombre: eventoBase.nombre },
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: distrito.id,
        actorUserId: adminUser.id,
        action: "evento.activated",
        targetType: "Evento",
        targetId: eventoBase.id,
        metadata: {},
      },
    });
    await prisma.auditLog.create({
      data: {
        organizationId: distrito.id,
        actorUserId: juez1User!.id,
        action: "scoreSheet.submitted",
        targetType: "ScoreSheet",
        targetId: sheetHalconesEnviada.id,
        metadata: { patrulla: "Halcones", totalPuntuable: "12", totalDesempate: "3" },
      },
    });

    evento = await prisma.evento.findFirst({
      where: { id: eventoBase.id },
      include: {
        actividades: { include: { asignaciones: true } },
        patrullas: true,
      },
    });
  } else if (evento.estado === EventoEstado.BORRADOR) {
    // Si ya existe pero está en BORRADOR, activarlo para que la vista del juez lo muestre
    await prisma.evento.update({
      where: { id: evento.id },
      data: { estado: EventoEstado.ACTIVO, activatedAt: new Date() },
    });
  }

  // ── 10. ScoreSheets demo (idempotente) ─────────────────────────────────────
  // Buscar la asignacion de "Amarres básicos" en el evento demo
  const eventoConAsignaciones = await prisma.evento.findFirst({
    where: { organizationId: distrito.id, slug: slugEvento },
    include: {
      actividades: {
        include: {
          asignaciones: {
            include: { posta: true },
          },
        },
      },
      patrullas: { orderBy: { nombre: "asc" } },
    },
  });

  if (eventoConAsignaciones) {
    const todasAsignaciones = eventoConAsignaciones.actividades.flatMap((a) => a.asignaciones);
    const asigAmarres = todasAsignaciones.find((a) => a.posta.nombre === "Amarres básicos");
    const patrullaHalcones = eventoConAsignaciones.patrullas.find((p) => p.nombre === "Halcones");
    const patrullaAguilas = eventoConAsignaciones.patrullas.find((p) => p.nombre === "Águilas");

    if (asigAmarres && patrullaHalcones && patrullaAguilas) {
      const criteriosConstruccion = await prisma.templateCriterion.findMany({
        where: { templateId: templateConstruccion.id },
        orderBy: { orden: "asc" },
      });
      const [cTecnica, cSolidez, cPresentacion, cEspiritu] = criteriosConstruccion;

      // Planilla ENVIADA para Halcones
      const existeHalcones = await prisma.scoreSheet.findUnique({
        where: { asignacionPostaId_patrullaId: { asignacionPostaId: asigAmarres.id, patrullaId: patrullaHalcones.id } },
      });
      if (!existeHalcones) {
        const sheetEnviada = await prisma.scoreSheet.create({
          data: {
            asignacionPostaId: asigAmarres.id,
            patrullaId: patrullaHalcones.id,
            estado: ScoreSheetEstado.ENVIADA,
            totalPuntuable: 12,
            totalDesempate: 3,
            enviadaAt: new Date("2026-08-15T10:30:00"),
            enviadaByUserId: juez1User!.id,
            entries: {
              create: [
                { criterionId: cTecnica!.id, valor: 4 },
                { criterionId: cSolidez!.id, valor: 4 },
                { criterionId: cPresentacion!.id, valor: 4 },
                { criterionId: cEspiritu!.id, valor: 3 },
              ],
            },
          },
        });
        await prisma.auditLog.create({
          data: {
            organizationId: distrito.id,
            actorUserId: juez1User!.id,
            action: "scoreSheet.submitted",
            targetType: "ScoreSheet",
            targetId: sheetEnviada.id,
            metadata: { patrulla: "Halcones", totalPuntuable: "12", totalDesempate: "3" },
          },
        });
      }

      // Planilla BORRADOR para Águilas
      const existeAguilas = await prisma.scoreSheet.findUnique({
        where: { asignacionPostaId_patrullaId: { asignacionPostaId: asigAmarres.id, patrullaId: patrullaAguilas.id } },
      });
      if (!existeAguilas) {
        await prisma.scoreSheet.create({
          data: {
            asignacionPostaId: asigAmarres.id,
            patrullaId: patrullaAguilas.id,
            estado: ScoreSheetEstado.BORRADOR,
            entries: {
              create: [
                { criterionId: cTecnica!.id, valor: 3 },
                { criterionId: cSolidez!.id, valor: 3 },
              ],
            },
          },
        });
      }
    }
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
    prisma.scoreSheet.count(),
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
  ScoreSheets    : ${counts[9]}

  Credenciales demo: admin@demo.local / demo1234
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
