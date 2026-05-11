"use server"

import { requireRole } from "@/lib/auth-helpers"
import { generateLeaderboardSnapshot } from "@/repositories/leaderboard.repo"
import {
  createOrRotatePublicShareLink,
  revokePublicShareLink,
} from "@/repositories/public-share-link.repo"
import { BusinessError } from "@/lib/errors"

type SnapshotState = { success: true; generatedAt: string } | { error: string } | null

export async function regenerateSnapshotAction(
  _prev: SnapshotState,
  formData: FormData,
): Promise<SnapshotState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string

  try {
    const { generatedAt } = await generateLeaderboardSnapshot(
      org.organizationId,
      eventoId,
      org.userId,
    )
    return { success: true, generatedAt: generatedAt.toISOString() }
  } catch (e) {
    if (e instanceof BusinessError) return { error: e.message }
    throw e
  }
}

type ShareLinkState = { success: true; token?: string } | { error: string } | null

export async function rotatePublicShareLinkAction(
  _prev: ShareLinkState,
  formData: FormData,
): Promise<ShareLinkState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string

  try {
    const { token } = await createOrRotatePublicShareLink(
      org.organizationId,
      eventoId,
      org.userId,
    )
    return { success: true, token }
  } catch (e) {
    if (e instanceof BusinessError) return { error: e.message }
    throw e
  }
}

export async function revokePublicShareLinkAction(
  _prev: ShareLinkState,
  formData: FormData,
): Promise<ShareLinkState> {
  const org = await requireRole(["ADMIN"])
  const eventoId = formData.get("eventoId") as string

  try {
    await revokePublicShareLink(org.organizationId, eventoId, org.userId)
    return { success: true }
  } catch (e) {
    if (e instanceof BusinessError) return { error: e.message }
    throw e
  }
}
