import { unstable_cache } from "next/cache"
import { forOrg, prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"

export function listGrupos(organizationId: string) {
  return unstable_cache(
    async () => forOrg(organizationId).grupoScout.findMany({ orderBy: { nombre: "asc" } }),
    ["grupos", organizationId],
    { tags: [cacheTags.grupos(organizationId)] },
  )()
}

export function findGrupoById(organizationId: string, id: string) {
  return unstable_cache(
    async () => forOrg(organizationId).grupoScout.findFirst({ where: { id } }),
    ["grupo", organizationId, id],
    { tags: [cacheTags.grupos(organizationId)] },
  )()
}

export async function countGrupos(organizationId: string) {
  return prisma.grupoScout.count({ where: { organizationId } })
}

export async function createGrupo(
  organizationId: string,
  data: { nombre: string; slug: string },
  actorUserId: string,
): Promise<void> {
  const existing = await prisma.grupoScout.findFirst({ where: { organizationId, slug: data.slug } })
  if (existing) throw new BusinessError("SLUG_TAKEN")

  await prisma.$transaction(async (tx) => {
    const grupo = await tx.grupoScout.create({ data: { ...data, organizationId } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "grupo.created",
        targetType: "GrupoScout",
        targetId: grupo.id,
        metadata: { nombre: grupo.nombre, slug: grupo.slug },
      },
    })
  })
}

export async function updateGrupo(
  organizationId: string,
  id: string,
  data: { nombre: string; slug: string },
  actorUserId: string,
): Promise<void> {
  const grupo = await prisma.grupoScout.findFirst({ where: { id, organizationId } })
  if (!grupo) throw new BusinessError("NOT_FOUND")

  if (grupo.slug !== data.slug) {
    const existing = await prisma.grupoScout.findFirst({ where: { organizationId, slug: data.slug } })
    if (existing) throw new BusinessError("SLUG_TAKEN")
  }

  await prisma.$transaction(async (tx) => {
    await tx.grupoScout.update({ where: { id }, data: { nombre: data.nombre, slug: data.slug } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "grupo.updated",
        targetType: "GrupoScout",
        targetId: id,
        metadata: { nombre: data.nombre, slug: data.slug },
      },
    })
  })
}

export async function deleteGrupo(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  const grupo = await prisma.grupoScout.findFirst({ where: { id, organizationId } })
  if (!grupo) throw new BusinessError("NOT_FOUND")

  const [miembros, memberships, invitations, patrullas] = await Promise.all([
    prisma.miembroScout.count({ where: { grupoScoutId: id, organizationId } }),
    prisma.membership.count({ where: { grupoScoutId: id, organizationId } }),
    prisma.invitation.count({ where: { grupoScoutId: id, organizationId, status: "PENDING" } }),
    prisma.patrulla.count({ where: { grupoScoutId: id } }),
  ])

  if (miembros > 0) throw new BusinessError("HAS_MIEMBROS", { count: miembros })
  if (memberships > 0) throw new BusinessError("HAS_MEMBERSHIPS", { count: memberships })
  if (invitations > 0) throw new BusinessError("HAS_INVITATIONS", { count: invitations })
  if (patrullas > 0) throw new BusinessError("HAS_PATRULLAS", { count: patrullas })

  await prisma.$transaction(async (tx) => {
    await tx.grupoScout.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "grupo.deleted",
        targetType: "GrupoScout",
        targetId: id,
        metadata: { nombre: grupo.nombre },
      },
    })
  })
}
