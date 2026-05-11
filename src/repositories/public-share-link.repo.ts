import { unstable_cache, revalidateTag } from "next/cache"
import { randomBytes } from "crypto"
import { prisma } from "@/lib/db"
import { cacheTags } from "./cache-tags"
import { BusinessError } from "@/lib/errors"
import type { EventLeaderboardSnapshotWithData } from "./leaderboard.repo"

function generateToken(): string {
  return randomBytes(18).toString("base64url")
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export function findActivePublicShareLink(
  organizationId: string,
  eventoId: string,
): Promise<{ token: string; createdAt: Date } | null> {
  return unstable_cache(
    async () => {
      const link = await prisma.publicShareLink.findFirst({
        where: { eventoId, organizationId, revokedAt: null },
        select: { token: true, createdAt: true },
      })
      return link
    },
    ["public-share-link", organizationId, eventoId],
    { tags: [cacheTags.publicShareLinks(organizationId)] },
  )()
}

// Resuelve un token público a su evento + snapshot.
// Devuelve null si no existe, "REVOKED" si está revocado.
export async function resolvePublicShareToken(
  token: string,
): Promise<{ organizationId: string; eventoId: string; snapshot: EventLeaderboardSnapshotWithData } | "REVOKED" | null> {
  const link = await prisma.publicShareLink.findUnique({
    where: { token },
    include: {
      evento: {
        include: {
          leaderboardSnapshot: true,
        },
      },
    },
  })

  if (!link) return null
  if (link.revokedAt !== null) return "REVOKED"

  const snapshot = link.evento.leaderboardSnapshot
  if (!snapshot) return null

  return {
    organizationId: link.organizationId,
    eventoId: link.eventoId,
    snapshot: snapshot as EventLeaderboardSnapshotWithData,
  }
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export async function createOrRotatePublicShareLink(
  organizationId: string,
  eventoId: string,
  actorUserId: string,
): Promise<{ token: string }> {
  const existing = await prisma.publicShareLink.findFirst({
    where: { eventoId, revokedAt: null },
    select: { id: true },
  })

  const now = new Date()
  const token = generateToken()

  await prisma.$transaction(async (tx) => {
    if (existing) {
      // Revocar el link activo antes de crear el nuevo
      await tx.publicShareLink.update({
        where: { id: existing.id },
        data: { revokedAt: now, revokedByUserId: actorUserId },
      })
      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId,
          action: "evento.publicShareLinkRotated",
          targetType: "Evento",
          targetId: eventoId,
          metadata: { revokedLinkId: existing.id },
        },
      })
    }

    await tx.publicShareLink.create({
      data: {
        organizationId,
        eventoId,
        token,
        createdByUserId: actorUserId,
      },
    })

    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.publicShareLinkCreated",
        targetType: "Evento",
        targetId: eventoId,
        metadata: { token },
      },
    })
  })

  revalidateTag(cacheTags.publicShareLinks(organizationId))
  return { token }
}

export async function revokePublicShareLink(
  organizationId: string,
  eventoId: string,
  actorUserId: string,
): Promise<void> {
  const existing = await prisma.publicShareLink.findFirst({
    where: { eventoId, organizationId, revokedAt: null },
    select: { id: true },
  })

  if (!existing) throw new BusinessError("NO_ACTIVE_LINK")

  const now = new Date()

  await prisma.$transaction(async (tx) => {
    await tx.publicShareLink.update({
      where: { id: existing.id },
      data: { revokedAt: now, revokedByUserId: actorUserId },
    })
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId,
        action: "evento.publicShareLinkRevoked",
        targetType: "Evento",
        targetId: eventoId,
        metadata: { revokedLinkId: existing.id },
      },
    })
  })

  revalidateTag(cacheTags.publicShareLinks(organizationId))
}
