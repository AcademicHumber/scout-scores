import { unstable_cache, revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import type { PatrullaCategoria } from "@/generated/prisma/enums"

// ─── Types ────────────────────────────────────────────────────────────────────

async function _listByEvento(organizationId: string, eventoId: string) {
  return prisma.patrulla.findMany({
    where: { eventoId, evento: { organizationId } },
    include: { grupoScout: { select: { id: true, nombre: true } } },
    orderBy: { createdAt: "asc" },
  })
}

export type PatrullaConGrupo = Awaited<ReturnType<typeof _listByEvento>>[number]

// ─── Reads ────────────────────────────────────────────────────────────────────

export function listPatrullasByEvento(organizationId: string, eventoId: string) {
  return unstable_cache(
    async () => _listByEvento(organizationId, eventoId),
    ["patrullas", organizationId, eventoId],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

export function findPatrullaById(organizationId: string, patrullaId: string) {
  return unstable_cache(
    async () =>
      prisma.patrulla.findFirst({
        where: { id: patrullaId, evento: { organizationId } },
        include: { grupoScout: { select: { id: true, nombre: true } } },
      }),
    ["patrulla", organizationId, patrullaId],
    { tags: [cacheTags.eventos(organizationId)] },
  )()
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requirePatrulla(organizationId: string, patrullaId: string) {
  const patrulla = await prisma.patrulla.findFirst({
    where: { id: patrullaId, evento: { organizationId } },
  })
  if (!patrulla) throw new BusinessError("PATRULLA_NO_ENCONTRADA")
  return patrulla
}

async function validateGrupo(organizationId: string, grupoScoutId: string) {
  const grupo = await prisma.grupoScout.findFirst({ where: { id: grupoScoutId, organizationId } })
  if (!grupo) throw new BusinessError("GRUPO_SCOUT_INVALIDO")
}

// ─── Mutations ────────────────────────────────────────────────────────────────

type CreatePatrullaData = {
  nombre: string
  grupoScoutId: string
  categoria?: PatrullaCategoria | null
}

export async function createPatrulla(
  organizationId: string,
  eventoId: string,
  data: CreatePatrullaData,
  actorUserId: string,
): Promise<{ id: string }> {
  const evento = await prisma.evento.findFirst({ where: { id: eventoId, organizationId } })
  if (!evento) throw new BusinessError("NOT_FOUND")

  await validateGrupo(organizationId, data.grupoScoutId)

  const existing = await prisma.patrulla.findFirst({ where: { eventoId, nombre: data.nombre } })
  if (existing) throw new BusinessError("PATRULLA_NOMBRE_DUPLICADO")

  let createdId: string

  await prisma.$transaction(async (tx) => {
    const patrulla = await tx.patrulla.create({
      data: {
        eventoId,
        grupoScoutId: data.grupoScoutId,
        nombre: data.nombre,
        categoria: data.categoria ?? null,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "patrulla.created",
        targetType: "Patrulla",
        targetId: patrulla.id,
        metadata: { eventoId, nombre: patrulla.nombre, grupoScoutId: data.grupoScoutId },
      },
    })
    createdId = patrulla.id
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return { id: createdId! }
}

type UpdatePatrullaData = {
  nombre: string
  grupoScoutId: string
  categoria?: PatrullaCategoria | null
}

export async function updatePatrulla(
  organizationId: string,
  patrullaId: string,
  data: UpdatePatrullaData,
  actorUserId: string,
) {
  const patrulla = await requirePatrulla(organizationId, patrullaId)

  await validateGrupo(organizationId, data.grupoScoutId)

  const existing = await prisma.patrulla.findFirst({
    where: { eventoId: patrulla.eventoId, nombre: data.nombre, id: { not: patrullaId } },
  })
  if (existing) throw new BusinessError("PATRULLA_NOMBRE_DUPLICADO")

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.patrulla.update({
      where: { id: patrullaId },
      data: { nombre: data.nombre, grupoScoutId: data.grupoScoutId, categoria: data.categoria ?? null },
      include: { grupoScout: { select: { id: true, nombre: true } } },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "patrulla.updated",
        targetType: "Patrulla",
        targetId: patrullaId,
        metadata: { nombre: data.nombre, grupoScoutId: data.grupoScoutId, categoria: data.categoria },
      },
    })
    return result
  })

  revalidateTag(cacheTags.eventos(organizationId))
  return updated
}

export async function deletePatrulla(
  organizationId: string,
  patrullaId: string,
  actorUserId: string,
): Promise<void> {
  const patrulla = await requirePatrulla(organizationId, patrullaId)

  await prisma.$transaction(async (tx) => {
    await tx.patrulla.delete({ where: { id: patrullaId } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "patrulla.deleted",
        targetType: "Patrulla",
        targetId: patrullaId,
        metadata: { eventoId: patrulla.eventoId, nombre: patrulla.nombre },
      },
    })
  })

  revalidateTag(cacheTags.eventos(organizationId))
}
