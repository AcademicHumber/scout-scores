import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"

export function findDistrito(organizationId: string) {
  return unstable_cache(
    async () =>
      prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { nombre: true, slug: true },
      }),
    ["distrito", organizationId],
    { tags: [cacheTags.distrito(organizationId)] },
  )()
}

export async function updateDistrito(
  organizationId: string,
  nombre: string,
  actorUserId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: organizationId },
      data: { nombre },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "organization.updated",
        targetType: "Organization",
        targetId: organizationId,
        metadata: { nombre },
      },
    })
  })
}
