import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"
import { isEventoLocked } from "./evento.repo"
import type { Role } from "@/generated/prisma/enums"

// ─── Types ────────────────────────────────────────────────────────────────────

async function _listPostas(organizationId: string) {
  return prisma.posta.findMany({
    where: { organizationId },
    include: {
      _count: { select: { asignaciones: true } },
    },
    orderBy: { nombre: "asc" },
  })
}

async function _findPostaById(organizationId: string, postaId: string) {
  return prisma.posta.findFirst({
    where: { id: postaId, organizationId },
    include: {
      asignaciones: {
        include: {
          actividad: {
            include: {
              evento: { select: { id: true, nombre: true, fechaInicio: true, estado: true } },
              template: {
                include: { criterios: { orderBy: { orden: "asc" } } },
              },
            },
          },
          juezUser: { select: { id: true, name: true, email: true } },
        },
        orderBy: { actividad: { evento: { fechaInicio: "desc" } } },
      },
    },
  })
}

async function _listPostasCreadasPor(organizationId: string, userId: string) {
  return prisma.posta.findMany({
    where: { organizationId, creadoPorUserId: userId },
    include: {
      _count: { select: { asignaciones: true } },
    },
    orderBy: { nombre: "asc" },
  })
}

export type PostaCreadaPor = Awaited<ReturnType<typeof _listPostasCreadasPor>>[number]

async function _listPostasParaEvento(organizationId: string, eventoId: string) {
  const [postas, asignacionesDelEvento] = await Promise.all([
    prisma.posta.findMany({
      where: { organizationId },
      orderBy: { nombre: "asc" },
    }),
    prisma.asignacionPosta.findMany({
      where: { actividad: { eventoId } },
      include: { actividad: { select: { nombre: true } } },
    }),
  ])

  const asignadasMap = new Map(
    asignacionesDelEvento.map((a) => [a.postaId, a.actividad.nombre]),
  )

  return postas.map((p) => ({
    ...p,
    asignadaEnActividad: asignadasMap.get(p.id) ?? null,
  }))
}

export type PostaConTemplate = Awaited<ReturnType<typeof _listPostas>>[number]
export type PostaDetalle = Awaited<ReturnType<typeof _findPostaById>>
export type PostaParaEvento = Awaited<ReturnType<typeof _listPostasParaEvento>>[number]

async function _listAsignacionesByActividad(organizationId: string, actividadId: string) {
  return prisma.asignacionPosta.findMany({
    where: {
      actividadId,
      actividad: { evento: { organizationId } },
    },
    include: {
      posta: true,
      juezUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { orden: "asc" },
  })
}

export type AsignacionConPosta = Awaited<ReturnType<typeof _listAsignacionesByActividad>>[number]

// ─── Reads — Posta standalone ─────────────────────────────────────────────────

export function listPostas(organizationId: string) {
  return unstable_cache(
    async () => _listPostas(organizationId),
    ["postas", organizationId],
    { tags: [cacheTags.postas(organizationId)] },
  )()
}

export function listPostasCreadasPor(organizationId: string, userId: string) {
  return unstable_cache(
    async () => _listPostasCreadasPor(organizationId, userId),
    ["postasCreadasPor", organizationId, userId],
    { tags: [cacheTags.postas(organizationId)] },
  )()
}

export function findPostaById(organizationId: string, postaId: string) {
  return unstable_cache(
    async () => _findPostaById(organizationId, postaId),
    ["posta", organizationId, postaId],
    { tags: [cacheTags.postas(organizationId)] },
  )()
}

export function listPostasParaEvento(organizationId: string, eventoId: string) {
  return unstable_cache(
    async () => _listPostasParaEvento(organizationId, eventoId),
    ["postasParaEvento", organizationId, eventoId],
    { tags: [cacheTags.postas(organizationId), cacheTags.eventos(organizationId)] },
  )()
}

// ─── Reads — AsignacionPosta ──────────────────────────────────────────────────

export function listAsignacionesByActividad(organizationId: string, actividadId: string) {
  return unstable_cache(
    async () => _listAsignacionesByActividad(organizationId, actividadId),
    ["asignaciones", organizationId, actividadId],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

// ─── Helpers de validación ────────────────────────────────────────────────────

async function requirePosta(organizationId: string, postaId: string) {
  const posta = await prisma.posta.findFirst({ where: { id: postaId, organizationId } })
  if (!posta) throw new BusinessError("POSTA_NO_ENCONTRADA")
  return posta
}

function requireOwnership(
  posta: { creadoPorUserId: string | null },
  actorUserId: string,
  actorRole: Role,
) {
  if (actorRole !== "ADMIN" && posta.creadoPorUserId !== actorUserId) {
    throw new BusinessError("POSTA_NO_PROPIA")
  }
}

async function requireAsignacion(organizationId: string, asignacionId: string) {
  const asignacion = await prisma.asignacionPosta.findFirst({
    where: { id: asignacionId, actividad: { evento: { organizationId } } },
    include: { actividad: { select: { eventoId: true, nombre: true } } },
  })
  if (!asignacion) throw new BusinessError("ASIGNACION_NO_ENCONTRADA")
  return asignacion
}

// ─── Mutations — Posta standalone ─────────────────────────────────────────────

type Material = { nombre: string; cantidad?: string }

type CreatePostaData = {
  nombre: string
  descripcion?: string
  duracionMinutos?: number | null
  materiales?: Material[]
}

export async function createPosta(
  organizationId: string,
  data: CreatePostaData,
  actorUserId: string,
): Promise<{ id: string }> {
  let createdId: string

  await prisma.$transaction(async (tx) => {
    const posta = await tx.posta.create({
      data: {
        organizationId,
        nombre: data.nombre,
        descripcion: data.descripcion ?? null,
        duracionMinutos: data.duracionMinutos ?? null,
        materiales: data.materiales ?? [],
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.created",
        targetType: "Posta",
        targetId: posta.id,
        metadata: { nombre: posta.nombre },
      },
    })
    createdId = posta.id
  }).catch((e: { code?: string }) => {
    if (e?.code === "P2002") throw new BusinessError("NOMBRE_POSTA_DUPLICADO")
    throw e
  })

  revalidateTag(cacheTags.postas(organizationId))
  return { id: createdId! }
}

type CrearPostaYAsignarData = {
  nombre: string
  descripcion?: string
  duracionMinutos?: number | null
  materiales?: Material[]
  encargado?: string | null
  ayudantes?: string | null
  criteriosDescripciones?: CriteriosDescripciones
}

// Crea una Posta y la auto-asigna a una actividad en una única transacción — pensado
// para el flujo del juez (Plan 16), donde ambos pasos deben ser atómicos: si la
// posta se crea pero la asignación falla, no debe quedar una posta huérfana sin usar.
export async function crearPostaYAsignar(
  organizationId: string,
  actividadId: string,
  data: CrearPostaYAsignarData,
  actorUserId: string,
): Promise<{ postaId: string; asignacionId: string }> {
  const actividad = await prisma.actividad.findFirst({
    where: { id: actividadId, evento: { organizationId } },
    select: { eventoId: true },
  })
  if (!actividad) throw new BusinessError("ACTIVIDAD_NO_ENCONTRADA")

  if (await isEventoLocked(actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const maxOrden = await prisma.asignacionPosta.aggregate({
    where: { actividadId },
    _max: { orden: true },
  })
  const nextOrden = (maxOrden._max.orden ?? 0) + 1

  let postaId: string
  let asignacionId: string

  await prisma.$transaction(async (tx) => {
    const posta = await tx.posta.create({
      data: {
        organizationId,
        nombre: data.nombre,
        descripcion: data.descripcion ?? null,
        duracionMinutos: data.duracionMinutos ?? null,
        materiales: data.materiales ?? [],
        criteriosDescripciones: data.criteriosDescripciones ?? {},
        creadoPorUserId: actorUserId,
      },
    })
    const asignacion = await tx.asignacionPosta.create({
      data: {
        postaId: posta.id,
        actividadId,
        juezUserId: actorUserId,
        encargado: data.encargado ?? null,
        ayudantes: data.ayudantes ?? null,
        orden: nextOrden,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.created",
        targetType: "Posta",
        targetId: posta.id,
        metadata: { nombre: posta.nombre, origen: "juez" },
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "asignacionPosta.created",
        targetType: "AsignacionPosta",
        targetId: asignacion.id,
        metadata: { postaId: posta.id, actividadId, origen: "juez" },
      },
    })
    postaId = posta.id
    asignacionId = asignacion.id
  }).catch((e: { code?: string }) => {
    if (e?.code === "P2002") throw new BusinessError("NOMBRE_POSTA_DUPLICADO")
    throw e
  })

  revalidateTag(cacheTags.postas(organizationId))
  revalidateTag(cacheTags.eventos(organizationId))
  return { postaId: postaId!, asignacionId: asignacionId! }
}

type UpdatePostaData = CreatePostaData

export async function updatePosta(
  organizationId: string,
  postaId: string,
  data: UpdatePostaData,
  actorUserId: string,
  actorRole: Role,
) {
  const posta = await requirePosta(organizationId, postaId)
  requireOwnership(posta, actorUserId, actorRole)

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.posta.update({
      where: { id: postaId },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion ?? null,
        duracionMinutos: data.duracionMinutos ?? null,
        materiales: data.materiales ?? [],
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.updated",
        targetType: "Posta",
        targetId: postaId,
        metadata: { nombre: data.nombre },
      },
    })
    return result
  }).catch((e: { code?: string }) => {
    if (e?.code === "P2002") throw new BusinessError("NOMBRE_POSTA_DUPLICADO")
    throw e
  })

  revalidateTag(cacheTags.postas(organizationId))
  return updated
}

type CriteriosDescripciones = {
  criterios?: Record<string, Record<string, string>>
  unico?: Record<string, string>
}

type CriteriosDescripcionesScope = { criterioId: string } | { unico: true }

export async function updateCriteriosDescripciones(
  organizationId: string,
  postaId: string,
  scope: CriteriosDescripcionesScope,
  valores: Record<string, string>,
  actorUserId: string,
  actorRole: Role,
): Promise<void> {
  const posta = await requirePosta(organizationId, postaId)
  requireOwnership(posta, actorUserId, actorRole)
  const current = (posta.criteriosDescripciones ?? {}) as CriteriosDescripciones

  const updatedJson: CriteriosDescripciones =
    "unico" in scope
      ? { ...current, unico: valores }
      : { ...current, criterios: { ...(current.criterios ?? {}), [scope.criterioId]: valores } }

  await prisma.$transaction(async (tx) => {
    await tx.posta.update({
      where: { id: postaId },
      data: { criteriosDescripciones: updatedJson },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.criteriosDescripcionesUpdated",
        targetType: "Posta",
        targetId: postaId,
        metadata: { scope: "unico" in scope ? "unico" : scope.criterioId },
      },
    })
  })

  revalidateTag(cacheTags.postas(organizationId))
  // findEventoById también lee posta.criteriosDescripciones (para el badge de
  // "leyenda incompleta" en AsignacionRow) y está cacheado bajo eventos:orgId.
  revalidateTag(cacheTags.eventos(organizationId))
}

export async function deletePosta(
  organizationId: string,
  postaId: string,
  actorUserId: string,
  actorRole: Role,
): Promise<void> {
  const posta = await requirePosta(organizationId, postaId)
  requireOwnership(posta, actorUserId, actorRole)

  const asignaciones = await prisma.asignacionPosta.findMany({
    where: { postaId },
    include: { actividad: { include: { evento: { select: { nombre: true } } } } },
  })

  if (asignaciones.length > 0) {
    const eventos = [...new Set(asignaciones.map((a) => a.actividad.evento.nombre))]
    throw new BusinessError("POSTA_EN_USO", { eventos })
  }

  await prisma.$transaction(async (tx) => {
    await tx.posta.delete({ where: { id: postaId } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.deleted",
        targetType: "Posta",
        targetId: postaId,
        metadata: { nombre: posta.nombre },
      },
    })
  })

  revalidateTag(cacheTags.postas(organizationId))
}

// ─── Mutations — AsignacionPosta ──────────────────────────────────────────────

type AsignarPostaData = {
  postaId: string
  juezUserId?: string | null
  encargado?: string | null
  ayudantes?: string | null
  weight?: Decimal
}

export async function asignarPosta(
  organizationId: string,
  actividadId: string,
  data: AsignarPostaData,
  actorUserId: string,
): Promise<{ id: string }> {
  const actividad = await prisma.actividad.findFirst({
    where: { id: actividadId, evento: { organizationId } },
    select: { eventoId: true },
  })
  if (!actividad) throw new BusinessError("ACTIVIDAD_NO_ENCONTRADA")

  await requirePosta(organizationId, data.postaId)

  if (await isEventoLocked(actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  // Validar que la posta no esté ya en otra actividad del mismo evento
  const conflicto = await prisma.asignacionPosta.findFirst({
    where: {
      postaId: data.postaId,
      actividad: { eventoId: actividad.eventoId },
      NOT: { actividadId },
    },
    include: { actividad: { select: { nombre: true } } },
  })
  if (conflicto) {
    throw new BusinessError("POSTA_YA_ASIGNADA_EN_EVENTO", {
      actividadNombre: conflicto.actividad.nombre,
    })
  }

  if (data.juezUserId) {
    const membership = await prisma.membership.findFirst({
      where: { userId: data.juezUserId, organizationId, role: { in: ["JUEZ", "ADMIN"] } },
    })
    if (!membership) throw new BusinessError("JUEZ_INVALIDO")
  }

  const maxOrden = await prisma.asignacionPosta.aggregate({
    where: { actividadId },
    _max: { orden: true },
  })
  const nextOrden = (maxOrden._max.orden ?? 0) + 1

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const asignacion = await tx.asignacionPosta.create({
      data: {
        postaId: data.postaId,
        actividadId,
        juezUserId: data.juezUserId ?? null,
        encargado: data.encargado ?? null,
        ayudantes: data.ayudantes ?? null,
        weight: data.weight ?? new Decimal(1.0),
        orden: nextOrden,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "asignacionPosta.created",
        targetType: "AsignacionPosta",
        targetId: asignacion.id,
        metadata: { postaId: data.postaId, actividadId },
      },
    })
    createdId = asignacion.id
  }).catch((e: { code?: string }) => {
    // Red de seguridad contra la carrera entre el pre-check de arriba y este create:
    // dos jueces asignando casi simultáneamente la misma posta a la misma actividad.
    if (e?.code === "P2002") throw new BusinessError("POSTA_YA_ASIGNADA_EN_EVENTO")
    throw e
  })

  revalidateTag(cacheTags.eventos(organizationId))
  revalidateTag(cacheTags.postas(organizationId))
  return { id: createdId! }
}

type UpdateAsignacionData = {
  juezUserId?: string | null
  encargado?: string | null
  ayudantes?: string | null
  weight?: Decimal
}

export async function updateAsignacion(
  organizationId: string,
  asignacionId: string,
  data: UpdateAsignacionData,
  actorUserId: string,
) {
  const asignacion = await requireAsignacion(organizationId, asignacionId)

  if (await isEventoLocked(asignacion.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  if (data.juezUserId) {
    const membership = await prisma.membership.findFirst({
      where: { userId: data.juezUserId, organizationId, role: { in: ["JUEZ", "ADMIN"] } },
    })
    if (!membership) throw new BusinessError("JUEZ_INVALIDO")
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.asignacionPosta.update({
      where: { id: asignacionId },
      data: {
        juezUserId: data.juezUserId ?? null,
        encargado: data.encargado ?? null,
        ayudantes: data.ayudantes ?? null,
        weight: data.weight ?? new Decimal(1.0),
      },
      include: {
        posta: { select: { nombre: true } },
        juezUser: { select: { id: true, name: true, email: true } },
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "asignacionPosta.updated",
        targetType: "AsignacionPosta",
        targetId: asignacionId,
        metadata: { juezUserId: data.juezUserId },
      },
    })
    return result
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return updated
}

export async function desasignarPosta(
  organizationId: string,
  asignacionId: string,
  actorUserId: string,
): Promise<void> {
  const asignacion = await requireAsignacion(organizationId, asignacionId)

  if (await isEventoLocked(asignacion.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const actividadId = asignacion.actividadId

  await prisma.$transaction(async (tx) => {
    await tx.asignacionPosta.delete({ where: { id: asignacionId } })

    // Renumerar orden restante
    const restantes = await tx.asignacionPosta.findMany({
      where: { actividadId },
      orderBy: { orden: "asc" },
    })
    for (let i = 0; i < restantes.length; i++) {
      if (restantes[i]!.orden !== i + 1) {
        await tx.asignacionPosta.update({ where: { id: restantes[i]!.id }, data: { orden: i + 1 } })
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "asignacionPosta.deleted",
        targetType: "AsignacionPosta",
        targetId: asignacionId,
        metadata: { actividadId },
      },
    })
  })

  revalidateTag(cacheTags.eventos(organizationId))
  revalidateTag(cacheTags.postas(organizationId))
}

export async function reorderAsignacion(
  organizationId: string,
  asignacionId: string,
  direction: "up" | "down",
  actorUserId: string,
): Promise<void> {
  const asignacion = await requireAsignacion(organizationId, asignacionId)

  if (await isEventoLocked(asignacion.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const todas = await prisma.asignacionPosta.findMany({
    where: { actividadId: asignacion.actividadId },
    orderBy: { orden: "asc" },
  })

  const current = todas.find((a) => a.id === asignacionId)!
  const targetOrden = direction === "up" ? current.orden - 1 : current.orden + 1
  const swap = todas.find((a) => a.orden === targetOrden)
  if (!swap) return

  await prisma.$transaction(async (tx) => {
    await tx.asignacionPosta.update({ where: { id: current.id }, data: { orden: -1 } })
    await tx.asignacionPosta.update({ where: { id: swap.id }, data: { orden: current.orden } })
    await tx.asignacionPosta.update({ where: { id: current.id }, data: { orden: targetOrden } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "asignacionPosta.reordered",
        targetType: "AsignacionPosta",
        targetId: asignacionId,
        metadata: { actividadId: asignacion.actividadId, direction },
      },
    })
  })

  revalidateTag(cacheTags.eventos(organizationId))
}
