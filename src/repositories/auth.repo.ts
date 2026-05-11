// Excepción documentada (CLAUDE.md #14): operaciones pre-tenant (signup/login).
// No aplica forOrg() — el User existe antes que cualquier Organization context.
import { prisma } from "@/lib/db"
import { BusinessError } from "@/lib/errors"
import { LOCKOUT_THRESHOLD, LOCKOUT_DURATION_MS } from "@/lib/auth-credentials"
import type { Account } from "@/generated/prisma/client"

export async function findUserByEmailRaw(email: string) {
  return prisma.user.findUnique({ where: { email } })
}

export async function createUserWithPassword({
  email,
  name,
  passwordHash,
}: {
  email: string
  name: string
  passwordHash: string
}) {
  return prisma.user.create({
    data: {
      email,
      name,
      passwordHash,
      emailVerified: new Date(),
    },
  })
}

export async function setUserPasswordIfNull(userId: string, passwordHash: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  if (!user) throw new BusinessError("NOT_FOUND")
  if (user.passwordHash) throw new BusinessError("PASSWORD_ALREADY_SET")
  return prisma.user.update({ where: { id: userId }, data: { passwordHash } })
}

export async function recordFailedAttempt(email: string): Promise<{ locked: boolean }> {
  const attempt = await prisma.authAttempt.upsert({
    where: { email },
    create: { email, failCount: 1, lastTryAt: new Date() },
    update: { failCount: { increment: 1 }, lastTryAt: new Date() },
  })

  if (attempt.failCount >= LOCKOUT_THRESHOLD) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS)
    await prisma.authAttempt.update({ where: { email }, data: { lockedUntil } })
    return { locked: true }
  }

  return { locked: false }
}

export async function clearFailedAttempts(email: string) {
  await prisma.authAttempt.upsert({
    where: { email },
    create: { email, failCount: 0, lastTryAt: new Date() },
    update: { failCount: 0 },
  })
}

export async function isLocked(email: string): Promise<boolean> {
  const attempt = await prisma.authAttempt.findUnique({ where: { email } })
  if (!attempt?.lockedUntil) return false
  return attempt.lockedUntil > new Date()
}

export async function linkGoogleAccount(
  userId: string,
  account: Pick<
    Account,
    | "type"
    | "provider"
    | "providerAccountId"
    | "access_token"
    | "refresh_token"
    | "expires_at"
    | "token_type"
    | "scope"
    | "id_token"
  >,
) {
  return prisma.account.create({
    data: {
      userId,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      access_token: account.access_token ?? null,
      refresh_token: account.refresh_token ?? null,
      expires_at: account.expires_at ?? null,
      token_type: account.token_type ?? null,
      scope: account.scope ?? null,
      id_token: account.id_token ?? null,
    },
  })
}
