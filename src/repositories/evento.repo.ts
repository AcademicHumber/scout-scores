import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import { slugify } from "@/lib/slug"
import type { EventoEstado, ActividadTipo } from "@/generated/prisma/enums"
import { Decimal } from "@prisma/client/runtime/client"

// ─── Types ───────────────────────────────────────────────────────────────────

async function _findById(organizationId: string, id: string) {
  return prisma.evento.findFirst({
    where: { id, organizationId },
    include: { actividades: { orderBy: { orden: "asc" } } },
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
  const actividades = await prisma.actividad.findMany({ where: { eventoId } })
  if (actividades.length === 0) {
    throw new BusinessError("PESOS_INVALIDOS", { sumaActual: 0, faltante: 100, sinActividades: true })
  }
  const suma = actividades.reduce((acc, a) => acc.plus(a.pesoRelativo), new Decimal(0))
  const diff = suma.minus(100).abs()
  if (diff.greaterThan(0.01)) {
    throw new BusinessError("PESOS_INVALIDOS", {
      sumaActual: suma.toNumber(),
      faltante: new Decimal(100).minus(suma).toNumber(),
    })
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function isEventoLocked(_eventoId: string): Promise<boolean> {
  // Plan 6b activará esto cuando exista el modelo Posta con ScoreSheet.
  return false
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
}

// ─── Actividades ──────────────────────────────────────────────────────────────

type ActividadData = {
  nombre: string
  descripcion?: string
  tipo: ActividadTipo
  pesoRelativo: Decimal
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

  let updated: Awaited<ReturnType<typeof prisma.actividad.update>>

  await prisma.$transaction(async (tx) => {
    updated = await tx.actividad.update({
      where: { id: actividadId },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo,
        pesoRelativo: data.pesoRelativo,
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
