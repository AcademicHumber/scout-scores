import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import type { Role } from "@/generated/prisma/client"

// forOrg() loses Prisma's include generics; use prisma.* directly with explicit organizationId.

export function listJuecesAsignables(organizationId: string) {
  return unstable_cache(
    async () => {
      const memberships = await prisma.membership.findMany({
        where: { organizationId, role: { in: ["JUEZ", "ADMIN"] } },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { user: { name: "asc" } },
      })
      return memberships.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      }))
    },
    ["juecesAsignables", organizationId],
    { tags: [cacheTags.memberships(organizationId)] },
  )()
}

export function listMembershipsWithUsers(organizationId: string) {
  return unstable_cache(
    async () =>
      prisma.membership.findMany({
        where: { organizationId },
        include: {
          user: { select: { name: true, email: true, image: true } },
          grupoScout: { select: { nombre: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
    ["memberships", organizationId],
    { tags: [cacheTags.memberships(organizationId)] },
  )()
}

export async function countMemberships(organizationId: string) {
  return prisma.membership.count({ where: { organizationId } })
}

export async function findMembershipById(organizationId: string, id: string) {
  return prisma.membership.findFirst({ where: { id, organizationId } })
}

export async function updateMembership(
  organizationId: string,
  id: string,
  data: { role: Role; grupoScoutId: string | null },
  actorUserId: string,
): Promise<{ affectedUserId: string }> {
  const target = await prisma.membership.findFirst({ where: { id, organizationId } })
  if (!target) throw new BusinessError("NOT_FOUND")

  if (data.grupoScoutId) {
    const grupo = await prisma.grupoScout.findFirst({
      where: { id: data.grupoScoutId, organizationId },
    })
    if (!grupo) throw new BusinessError("INVALID_GRUPO")
  }

  if (data.role !== "ADMIN") {
    const otherAdmins = await prisma.membership.count({
      where: { organizationId, role: "ADMIN", id: { not: id } },
    })
    if (otherAdmins === 0) throw new BusinessError("LAST_ADMIN")
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id },
      data: { role: data.role, grupoScoutId: data.grupoScoutId },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "membership.updated",
        targetType: "Membership",
        targetId: id,
        metadata: {
          fromRole: target.role,
          toRole: data.role,
          fromGrupo: target.grupoScoutId,
          toGrupo: data.grupoScoutId,
        },
      },
    })
  })

  return { affectedUserId: target.userId }
}

export async function deleteMembership(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<{ affectedUserId: string }> {
  const target = await prisma.membership.findFirst({ where: { id, organizationId } })
  if (!target) throw new BusinessError("NOT_FOUND")

  const otherAdmins = await prisma.membership.count({
    where: { organizationId, role: "ADMIN", id: { not: id } },
  })
  if (otherAdmins === 0) throw new BusinessError("LAST_ADMIN")

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id } })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "membership.removed",
        targetType: "Membership",
        targetId: id,
        metadata: { removedUserId: target.userId, role: target.role },
      },
    })
  })

  return { affectedUserId: target.userId }
}
