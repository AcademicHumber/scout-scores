import { z } from "zod"
import { revalidateTag } from "next/cache"
import { prisma } from "@/lib/db"
import { cacheTags } from "@/repositories/cache-tags"

const emailSchema = z.string().email()

export async function aceptarInvitacionEnSignIn(userId: string, email: string) {
  const parsed = emailSchema.safeParse(email)
  if (!parsed.success) return

  const normalizedEmail = parsed.data.toLowerCase()

  const invitaciones = await prisma.invitation.findMany({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
      status: "PENDING",
      expiresAt: { gt: new Date() },
    },
  })

  for (const inv of invitaciones) {
    await prisma.$transaction(async (tx) => {
      const existingMembership = await tx.membership.findFirst({
        where: { userId, organizationId: inv.organizationId },
      })
      if (existingMembership) return

      await tx.membership.create({
        data: {
          userId,
          organizationId: inv.organizationId,
          role: inv.role,
          grupoScoutId: inv.grupoScoutId,
        },
      })

      await tx.invitation.update({
        where: { id: inv.id },
        data: { status: "ACCEPTED", acceptedAt: new Date() },
      })

      await tx.auditLog.create({
        data: {
          organizationId: inv.organizationId,
          actorUserId: userId,
          action: "invitation.accepted",
          targetType: "Invitation",
          targetId: inv.id,
          metadata: { role: inv.role },
        },
      })
    })

    revalidateTag(cacheTags.memberships(inv.organizationId))
  }
}
