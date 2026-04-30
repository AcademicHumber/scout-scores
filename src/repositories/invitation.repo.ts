import { prisma } from "@/lib/db"
import { BusinessError } from "@/lib/errors"
import { createId } from "@paralleldrive/cuid2"
import type { Role } from "@/generated/prisma/client"

const INVITATION_TTL_DAYS = 7

// Sin unstable_cache: markInvitationsExpired() escribe justo antes de esta lectura,
// lo que haría el cache incorrecto. Mover markInvitationsExpired a un cron es el prerequisito.
export function listInvitations(organizationId: string) {
  return prisma.invitation.findMany({
    where: { organizationId },
    include: { grupoScout: { select: { nombre: true } } },
    orderBy: { createdAt: "desc" },
  })
}

export async function countPendingInvitations(organizationId: string) {
  return prisma.invitation.count({ where: { organizationId, status: "PENDING" } })
}

export async function findInvitationById(organizationId: string, id: string) {
  return prisma.invitation.findFirst({ where: { id, organizationId, status: "PENDING" } })
}

export async function findPendingInvitationByEmail(organizationId: string, email: string) {
  return prisma.invitation.findFirst({ where: { organizationId, email, status: "PENDING" } })
}

export async function markInvitationsExpired(organizationId: string): Promise<void> {
  await prisma.invitation.updateMany({
    where: { organizationId, status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  })
}

export async function createInvitation(
  organizationId: string,
  data: { email: string; role: Role; grupoScoutId?: string },
  actorUserId: string,
): Promise<{ token: string }> {
  if (data.grupoScoutId) {
    const grupo = await prisma.grupoScout.findFirst({
      where: { id: data.grupoScoutId, organizationId },
    })
    if (!grupo) throw new BusinessError("INVALID_GRUPO")
  }

  const yaMiembro = await prisma.membership.findFirst({
    where: { organizationId, user: { email: data.email } },
  })
  if (yaMiembro) throw new BusinessError("ALREADY_MEMBER")

  await markInvitationsExpired(organizationId)

  const yaInvitada = await prisma.invitation.findFirst({
    where: { organizationId, email: data.email, status: "PENDING" },
  })
  if (yaInvitada) throw new BusinessError("ALREADY_INVITED")

  const token = createId()
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000)

  const invitation = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        organizationId,
        email: data.email,
        role: data.role,
        grupoScoutId: data.grupoScoutId ?? null,
        token,
        expiresAt,
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "invitation.created",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { email: inv.email, role: inv.role },
      },
    })
    return inv
  })

  return { token: invitation.token }
}

export async function revokeInvitation(
  organizationId: string,
  id: string,
  actorUserId: string,
): Promise<void> {
  const inv = await prisma.invitation.findFirst({ where: { id, organizationId, status: "PENDING" } })
  if (!inv) throw new BusinessError("NOT_FOUND")

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "invitation.revoked",
        targetType: "Invitation",
        targetId: id,
        metadata: { email: inv.email },
      },
    })
  })
}
