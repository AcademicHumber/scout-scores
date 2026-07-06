import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import { slugify } from "@/lib/slug"
import type { EventoEstado, ActividadTipo } from "@/generated/prisma/enums"
import { Decimal } from "@prisma/client/runtime/client"
import { generateLeaderboardSnapshot } from "./leaderboard.repo"
import { createOrRotatePublicShareLink } from "./public-share-link.repo"

// ─── Types ───────────────────────────────────────────────────────────────────

async function _findById(organizationId: string, id: string) {
  return prisma.evento.findFirst({
    where: { id, organizationId },
    include: {
      actividades: {
        orderBy: { orden: "asc" },
        include: {
          template: {
            select: {
              id: true,
              nombre: true,
              archivedAt: true,
              modo: true,
              criterios: { select: { id: true, tipo: true } },
            },
          },
          asignaciones: {
            orderBy: { orden: "asc" },
            include: {
              posta: true,
              juezUser: { select: { id: true, name: true, email: true } },
            },
          },
        },
      },
      patrullas: {
        orderBy: { createdAt: "asc" },
        include: { grupoScout: { select: { id: true, nombre: true } } },
      },
    },
  })
}

export type EventoConActividades = Awaited<ReturnType<typeof _findById>>

// ─── Slug ─────────────────────────────────────────────────────────────────────

async function generateUniqueSlug(organizationId: string, nombre: string): Promise<string> {
  const base = slugify(nombre)
  const existing = await prisma.evento.findFirst({ where: { organizationId, slug: base } })
  if (!existing) return base

  let suffix = 2
  while (suffix <= 100) {
    const candidate = `${base}-${suffix}`
    const found = await prisma.evento.findFirst({ where: { organizationId, slug: candidate } })
    if (!found) return candidate
    suffix++
  }
  throw new BusinessError("NOMBRE_DUPLICADO")
}

// ─── Máquina de estados ───────────────────────────────────────────────────────

const validTransitions: Record<EventoEstado, EventoEstado[]> = {
  BORRADOR:  ["ACTIVO"],
  ACTIVO:    ["CERRADO"],
  CERRADO:   ["PUBLICADO"],
  PUBLICADO: [],
}

async function canTransitionToActivo(eventoId: string): Promise<void> {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    include: {
      actividades: {
        select: {
          id: true,
          nombre: true,
          pesoRelativo: true,
          templateId: true,
          asignaciones: { select: { id: true } },
        },
      },
      patrullas: { select: { id: true } },
    },
  })
  if (!evento) throw new BusinessError("NOT_FOUND")

  const errores: Array<{ code: string; meta?: Record<string, unknown> }> = []

  // 1. Pesos = 100
  if (evento.actividades.length === 0) {
    errores.push({ code: "PESOS_INVALIDOS", meta: { sumaActual: 0, faltante: 100, sinActividades: true } })
  } else {
    const suma = evento.actividades.reduce((acc, a) => acc.plus(a.pesoRelativo), new Decimal(0))
    const diff = suma.minus(100).abs()
    if (diff.greaterThan(0.01)) {
      errores.push({
        code: "PESOS_INVALIDOS",
        meta: { sumaActual: suma.toNumber(), faltante: new Decimal(100).minus(suma).toNumber() },
      })
    }
  }

  // 2. Cada actividad ≥ 1 asignación de posta
  const actividadesSinPostas = evento.actividades.filter((a) => a.asignaciones.length === 0)
  if (actividadesSinPostas.length > 0) {
    errores.push({
      code: "ACTIVIDAD_SIN_POSTAS",
      meta: { actividades: actividadesSinPostas.map((a) => ({ id: a.id, nombre: a.nombre })) },
    })
  }

  // 3. Cada actividad tiene plantilla asignada
  const actividadesSinPlantilla = evento.actividades
    .filter((a) => a.templateId === null)
    .map((a) => ({ id: a.id, nombre: a.nombre }))
  if (actividadesSinPlantilla.length > 0) {
    errores.push({ code: "ACTIVIDAD_SIN_PLANTILLA", meta: { actividades: actividadesSinPlantilla } })
  }

  // 4. ≥ 1 patrulla
  if (evento.patrullas.length === 0) {
    errores.push({ code: "EVENTO_SIN_PATRULLAS" })
  }

  if (errores.length > 0) {
    throw new BusinessError("PRE_ACTIVACION_INCOMPLETA", { errores })
  }
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function listEventos(
  organizationId: string,
  opts?: { estados?: EventoEstado[] },
) {
  return unstable_cache(
    async () => {
      const where = opts?.estados?.length
        ? { organizationId, estado: { in: opts.estados } }
        : { organizationId }
      return prisma.evento.findMany({
        where,
        include: { actividades: { orderBy: { orden: "asc" } } },
        orderBy: { fechaInicio: "desc" },
      })
    },
    ["eventos", organizationId, JSON.stringify(opts?.estados ?? [])],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

export function findEventoById(organizationId: string, id: string) {
  return unstable_cache(
    async () => _findById(organizationId, id),
    ["evento", organizationId, id],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

export async function countEventosActivos(organizationId: string): Promise<number> {
  return prisma.evento.count({ where: { organizationId, estado: "ACTIVO" } })
}

export async function isEventoLocked(eventoId: string): Promise<boolean> {
  const count = await prisma.scoreSheet.count({
    where: {
      estado: "ENVIADA",
      asignacionPosta: { actividad: { eventoId } },
    },
  })
  return count > 0
}

type CierreIncompletoFaltante = {
  postaNombre: string
  actividadNombre: string
  patrullaNombre: string
  estado: "SIN_CARGAR" | "BORRADOR"
}

async function canTransitionToCerrado(eventoId: string): Promise<void> {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    include: {
      actividades: {
        include: {
          asignaciones: {
            include: {
              posta: { select: { id: true, nombre: true } },
              scoreSheets: { select: { patrullaId: true, estado: true } },
            },
          },
        },
      },
      patrullas: { select: { id: true, nombre: true } },
    },
  })
  if (!evento) throw new BusinessError("NOT_FOUND")

  const faltantes: CierreIncompletoFaltante[] = []

  for (const actividad of evento.actividades) {
    for (const asignacion of actividad.asignaciones) {
      for (const patrulla of evento.patrullas) {
        const sheet = asignacion.scoreSheets.find((s) => s.patrullaId === patrulla.id)
        if (!sheet) {
          faltantes.push({
            postaNombre: asignacion.posta.nombre,
            actividadNombre: actividad.nombre,
            patrullaNombre: patrulla.nombre,
            estado: "SIN_CARGAR",
          })
        } else if (sheet.estado === "BORRADOR") {
          faltantes.push({
            postaNombre: asignacion.posta.nombre,
            actividadNombre: actividad.nombre,
            patrullaNombre: patrulla.nombre,
            estado: "BORRADOR",
          })
        }
      }
    }
  }

  if (faltantes.length > 0) {
    throw new BusinessError("CIERRE_INCOMPLETO", { faltantes })
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type CreateEventoData = {
  nombre: string
  descripcion?: string
  lugar?: string
  fechaInicio: Date
  fechaFin?: Date
}

export async function createEvento(
  organizationId: string,
  data: CreateEventoData,
  actorUserId: string,
): Promise<{ id: string; slug: string }> {
  if (data.fechaFin && data.fechaFin < data.fechaInicio) {
    throw new BusinessError("FECHA_INVALIDA")
  }

  const slug = await generateUniqueSlug(organizationId, data.nombre)

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const evento = await tx.evento.create({
      data: {
        organizationId,
        nombre: data.nombre,
        slug,
        descripcion: data.descripcion,
        lugar: data.lugar,
        fechaInicio: data.fechaInicio,
        fechaFin: data.fechaFin,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.created",
        targetType: "Evento",
        targetId: evento.id,
        metadata: { nombre: evento.nombre, slug: evento.slug },
      },
    })
    createdId = evento.id
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return { id: createdId!, slug }
}

export async function updateEventoMetadata(
  organizationId: string,
  id: string,
  data: CreateEventoData,
  actorUserId: string,
): Promise<void> {
  const evento = await prisma.evento.findFirst({ where: { id, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  if (data.fechaFin && data.fechaFin < data.fechaInicio) {
    throw new BusinessError("FECHA_INVALIDA")
  }

  await prisma.$transaction(async (tx) => {
    await tx.evento.update({
      where: { id },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        lugar: data.lugar,
        fechaInicio: data.fechaInicio,
        fechaFin: data.fechaFin ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.updated",
        targetType: "Evento",
        targetId: id,
        metadata: { nombre: data.nombre },
      },
    })
  })
  revalidateTag(cacheTags.eventos(organizationId))
}

export async function deleteEvento(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  const evento = await prisma.evento.findFirst({ where: { id, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  if (evento.estado !== "BORRADOR") {
    throw new BusinessError("NO_DELETABLE", { estadoActual: evento.estado })
  }

  await prisma.$transaction(async (tx) => {
    await tx.evento.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.deleted",
        targetType: "Evento",
        targetId: id,
        metadata: { nombre: evento.nombre, estado: evento.estado },
      },
    })
  })
  revalidateTag(cacheTags.eventos(organizationId))
}

export async function transicionarEstado(
  organizationId: string,
  id: string,
  target: EventoEstado,
  actorUserId: string,
): Promise<void> {
  const evento = await prisma.evento.findFirst({ where: { id, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  const allowed = validTransitions[evento.estado]
  if (!allowed.includes(target)) {
    throw new BusinessError("INVALID_TRANSITION", { from: evento.estado, to: target })
  }

  if (target === "ACTIVO") {
    await canTransitionToActivo(id)
  }
  if (target === "CERRADO") {
    await canTransitionToCerrado(id)
  }

  const now = new Date()
  const timestampField =
    target === "ACTIVO"    ? { activatedAt: now } :
    target === "CERRADO"   ? { closedAt: now } :
    target === "PUBLICADO" ? { publishedAt: now } :
    {}

  await prisma.$transaction(async (tx) => {
    await tx.evento.update({
      where: { id },
      data: { estado: target, ...timestampField },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.transitioned",
        targetType: "Evento",
        targetId: id,
        metadata: { from: evento.estado, to: target },
      },
    })
  })
  revalidateTag(cacheTags.eventos(organizationId))

  // Al publicar: generar snapshot y crear link público activo si no existe.
  // Se ejecuta fuera de la transacción (secuencial). Si falla, el evento queda
  // PUBLICADO sin snapshot — la vista admin permite regenerar manualmente.
  if (target === "PUBLICADO") {
    await generateLeaderboardSnapshot(organizationId, id, actorUserId)

    const existingLink = await prisma.publicShareLink.findFirst({
      where: { eventoId: id, revokedAt: null },
    })
    if (!existingLink) {
      await createOrRotatePublicShareLink(organizationId, id, actorUserId)
    }
  }
}

// ─── Actividades ──────────────────────────────────────────────────────────────

type ActividadData = {
  nombre: string
  descripcion?: string
  tipo: ActividadTipo
  pesoRelativo: Decimal
  templateId?: string | null
}

async function validateTemplateId(organizationId: string, templateId: string | null | undefined) {
  if (!templateId) return
  const template = await prisma.scoreTemplate.findFirst({
    where: { id: templateId, organizationId, archivedAt: null },
  })
  if (!template) throw new BusinessError("PLANTILLA_INVALIDA")
}

export async function addActividad(
  organizationId: string,
  eventoId: string,
  data: ActividadData,
  actorUserId: string,
): Promise<{ id: string }> {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  if (await isEventoLocked(eventoId)) throw new BusinessError("EVENTO_LOCKED")

  await validateTemplateId(organizationId, data.templateId)

  const maxOrden = await prisma.actividad.aggregate({
    where: { eventoId },
    _max: { orden: true },
  })
  const nextOrden = (maxOrden._max.orden ?? 0) + 1

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const actividad = await tx.actividad.create({
      data: {
        eventoId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo,
        pesoRelativo: data.pesoRelativo,
        templateId: data.templateId ?? null,
        orden: nextOrden,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.actividadAdded",
        targetType: "Actividad",
        targetId: actividad.id,
        metadata: { eventoId, nombre: actividad.nombre, tipo: actividad.tipo, pesoRelativo: data.pesoRelativo.toNumber() },
      },
    })
    createdId = actividad.id
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return { id: createdId! }
}

export async function updateActividad(
  organizationId: string,
  eventoId: string,
  actividadId: string,
  data: ActividadData,
  actorUserId: string,
) {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  if (await isEventoLocked(eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const actividad = await prisma.actividad.findFirst({ where: { id: actividadId, eventoId } })
  if (!actividad) throw new BusinessError("ACTIVIDAD_NO_ENCONTRADA")

  await validateTemplateId(organizationId, data.templateId)

  let updated: Awaited<ReturnType<typeof prisma.actividad.update>>

  await prisma.$transaction(async (tx) => {
    updated = await tx.actividad.update({
      where: { id: actividadId },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo,
        pesoRelativo: data.pesoRelativo,
        templateId: data.templateId ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.actividadUpdated",
        targetType: "Actividad",
        targetId: actividadId,
        metadata: { eventoId, nombre: data.nombre, tipo: data.tipo, pesoRelativo: data.pesoRelativo.toNumber() },
      },
    })
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return updated!
}

export async function deleteActividad(
  organizationId: string,
  eventoId: string,
  actividadId: string,
  actorUserId: string,
): Promise<void> {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  if (await isEventoLocked(eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const actividad = await prisma.actividad.findFirst({ where: { id: actividadId, eventoId } })
  if (!actividad) throw new BusinessError("ACTIVIDAD_NO_ENCONTRADA")

  await prisma.$transaction(async (tx) => {
    await tx.actividad.delete({ where: { id: actividadId } })

    // Renumerar restantes para mantener orden contiguo.
    const restantes = await tx.actividad.findMany({
      where: { eventoId },
      orderBy: { orden: "asc" },
    })
    for (let i = 0; i < restantes.length; i++) {
      if (restantes[i]!.orden !== i + 1) {
        await tx.actividad.update({ where: { id: restantes[i]!.id }, data: { orden: i + 1 } })
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.actividadDeleted",
        targetType: "Actividad",
        targetId: actividadId,
        metadata: { eventoId, nombre: actividad.nombre },
      },
    })
  })
  revalidateTag(cacheTags.eventos(organizationId))
}

export async function reorderActividad(
  organizationId: string,
  eventoId: string,
  actividadId: string,
  direction: "up" | "down",
  actorUserId: string,
): Promise<void> {
  const evento = await prisma.evento.findFirst({
    where: { id: eventoId, organizationId },
    include: { actividades: { orderBy: { orden: "asc" } } },
  })
  if (!evento) throw new BusinessError("NOT_FOUND")

  if (await isEventoLocked(eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const actividad = evento.actividades.find((a) => a.id === actividadId)
  if (!actividad) throw new BusinessError("ACTIVIDAD_NO_ENCONTRADA")

  const targetOrden = direction === "up" ? actividad.orden - 1 : actividad.orden + 1
  const swap = evento.actividades.find((a) => a.orden === targetOrden)
  if (!swap) return // ya es primera o última

  await prisma.$transaction(async (tx) => {
    await tx.actividad.update({ where: { id: actividad.id }, data: { orden: -1 } })
    await tx.actividad.update({ where: { id: swap.id }, data: { orden: actividad.orden } })
    await tx.actividad.update({ where: { id: actividad.id }, data: { orden: targetOrden } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.actividadReordered",
        targetType: "Actividad",
        targetId: actividadId,
        metadata: { eventoId, direction, fromOrden: actividad.orden, toOrden: targetOrden },
      },
    })
  })
  revalidateTag(cacheTags.eventos(organizationId))
}
