import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"
import { isEventoLocked } from "./evento.repo"

// ─── Types ────────────────────────────────────────────────────────────────────

async function _listByActividad(organizationId: string, actividadId: string) {
  return prisma.posta.findMany({
    where: {
      actividadId,
      actividad: { evento: { organizationId } },
    },
    include: {
      template: { select: { id: true, nombre: true, archivedAt: true } },
      juezUser: { select: { id: true, name: true, email: true } },
    },
    orderBy: { orden: "asc" },
  })
}

export type PostaConTemplateYJuez = Awaited<ReturnType<typeof _listByActividad>>[number]

// ─── Reads ────────────────────────────────────────────────────────────────────

export function listPostasByActividad(organizationId: string, actividadId: string) {
  return unstable_cache(
    async () => _listByActividad(organizationId, actividadId),
    ["postas", organizationId, actividadId],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

export function findPostaById(organizationId: string, postaId: string) {
  return unstable_cache(
    async () =>
      prisma.posta.findFirst({
        where: { id: postaId, actividad: { evento: { organizationId } } },
        include: {
          template: { select: { id: true, nombre: true, archivedAt: true } },
          juezUser: { select: { id: true, name: true, email: true } },
        },
      }),
    ["posta", organizationId, postaId],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

// ─── Helpers de validación ────────────────────────────────────────────────────

async function requirePosta(organizationId: string, postaId: string) {
  const posta = await prisma.posta.findFirst({
    where: { id: postaId, actividad: { evento: { organizationId } } },
    include: { actividad: { select: { eventoId: true } } },
  })
  if (!posta) throw new BusinessError("POSTA_NO_ENCONTRADA")
  return posta
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type CreatePostaData = {
  nombre: string
  descripcion?: string
  weight?: Decimal
  templateId?: string | null
}

export async function createPosta(
  organizationId: string,
  actividadId: string,
  data: CreatePostaData,
  actorUserId: string,
): Promise<{ id: string }> {
  const actividad = await prisma.actividad.findFirst({
    where: { id: actividadId, evento: { organizationId } },
    include: { evento: { select: { id: true } } },
  })
  if (!actividad) throw new BusinessError("ACTIVIDAD_NO_ENCONTRADA")

  if (await isEventoLocked(actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  if (data.templateId) {
    const template = await prisma.scoreTemplate.findFirst({
      where: { id: data.templateId, organizationId, archivedAt: null },
    })
    if (!template) throw new BusinessError("PLANTILLA_INVALIDA")
  }

  const maxOrden = await prisma.posta.aggregate({
    where: { actividadId },
    _max: { orden: true },
  })
  const nextOrden = (maxOrden._max.orden ?? 0) + 1

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const posta = await tx.posta.create({
      data: {
        actividadId,
        nombre: data.nombre,
        descripcion: data.descripcion,
        weight: data.weight ?? new Decimal(1.0),
        templateId: data.templateId ?? null,
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
        metadata: { actividadId, nombre: posta.nombre },
      },
    })
    createdId = posta.id
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return { id: createdId! }
}

type UpdatePostaData = {
  nombre: string
  descripcion?: string
  weight: Decimal
}

export async function updatePosta(
  organizationId: string,
  postaId: string,
  data: UpdatePostaData,
  actorUserId: string,
) {
  const posta = await requirePosta(organizationId, postaId)

  if (await isEventoLocked(posta.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.posta.update({
      where: { id: postaId },
      data: { nombre: data.nombre, descripcion: data.descripcion, weight: data.weight },
      include: {
        template: { select: { id: true, nombre: true, archivedAt: true } },
        juezUser: { select: { id: true, name: true, email: true } },
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.updated",
        targetType: "Posta",
        targetId: postaId,
        metadata: { nombre: data.nombre, weight: data.weight.toNumber() },
      },
    })
    return result
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return updated
}

export async function deletePosta(
  organizationId: string,
  postaId: string,
  actorUserId: string,
): Promise<void> {
  const posta = await requirePosta(organizationId, postaId)

  if (await isEventoLocked(posta.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const actividadId = posta.actividadId

  await prisma.$transaction(async (tx) => {
    await tx.posta.delete({ where: { id: postaId } })

    const restantes = await tx.posta.findMany({
      where: { actividadId },
      orderBy: { orden: "asc" },
    })
    for (let i = 0; i < restantes.length; i++) {
      if (restantes[i]!.orden !== i + 1) {
        await tx.posta.update({ where: { id: restantes[i]!.id }, data: { orden: i + 1 } })
      }
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.deleted",
        targetType: "Posta",
        targetId: postaId,
        metadata: { actividadId, nombre: posta.nombre },
      },
    })
  })

  revalidateTag(cacheTags.eventos(organizationId))
}

export async function reorderPosta(
  organizationId: string,
  postaId: string,
  direction: "up" | "down",
  actorUserId: string,
): Promise<void> {
  const posta = await requirePosta(organizationId, postaId)

  if (await isEventoLocked(posta.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  const postas = await prisma.posta.findMany({
    where: { actividadId: posta.actividadId },
    orderBy: { orden: "asc" },
  })

  const current = postas.find((p) => p.id === postaId)!
  const targetOrden = direction === "up" ? current.orden - 1 : current.orden + 1
  const swap = postas.find((p) => p.orden === targetOrden)
  if (!swap) return

  await prisma.$transaction(async (tx) => {
    await tx.posta.update({ where: { id: current.id }, data: { orden: -1 } })
    await tx.posta.update({ where: { id: swap.id }, data: { orden: current.orden } })
    await tx.posta.update({ where: { id: current.id }, data: { orden: targetOrden } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.reordered",
        targetType: "Posta",
        targetId: postaId,
        metadata: { actividadId: posta.actividadId, direction, fromOrden: current.orden, toOrden: targetOrden },
      },
    })
  })

  revalidateTag(cacheTags.eventos(organizationId))
}

export async function assignTemplate(
  organizationId: string,
  postaId: string,
  templateId: string | null,
  actorUserId: string,
) {
  const posta = await requirePosta(organizationId, postaId)

  if (await isEventoLocked(posta.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  if (templateId !== null) {
    const template = await prisma.scoreTemplate.findFirst({
      where: { id: templateId, organizationId, archivedAt: null },
    })
    if (!template) throw new BusinessError("PLANTILLA_INVALIDA")
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.posta.update({
      where: { id: postaId },
      data: { templateId },
      include: {
        template: { select: { id: true, nombre: true, archivedAt: true } },
        juezUser: { select: { id: true, name: true, email: true } },
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "posta.templateAssigned",
        targetType: "Posta",
        targetId: postaId,
        metadata: { templateId },
      },
    })
    return result
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return updated
}

export async function assignJuez(
  organizationId: string,
  postaId: string,
  juezUserId: string | null,
  actorUserId: string,
) {
  const posta = await requirePosta(organizationId, postaId)

  if (await isEventoLocked(posta.actividad.eventoId)) throw new BusinessError("EVENTO_LOCKED")

  if (juezUserId !== null) {
    const membership = await prisma.membership.findFirst({
      where: { userId: juezUserId, organizationId, role: { in: ["JUEZ", "ADMIN"] } },
    })
    if (!membership) throw new BusinessError("JUEZ_INVALIDO")
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.posta.update({
      where: { id: postaId },
      data: { juezUserId },
      include: {
        template: { select: { id: true, nombre: true, archivedAt: true } },
        juezUser: { select: { id: true, name: true, email: true } },
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: juezUserId ? "posta.juezAssigned" : "posta.juezUnassigned",
        targetType: "Posta",
        targetId: postaId,
        metadata: { juezUserId },
      },
    })
    return result
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return updated
}
