"use server"

import { requireUser } from "@/lib/auth-helpers"
import { setPasswordSchema, hashPassword } from "@/lib/auth-credentials"
import { setUserPasswordIfNull } from "@/repositories/auth.repo"
import { prisma } from "@/lib/db"
import { BusinessError } from "@/lib/errors"

export async function setPasswordAction(
  _prevState: { error: string } | { success: true } | null,
  formData: FormData,
): Promise<{ error: string } | { success: true } | null> {
  const user = await requireUser()

  const parsed = setPasswordSchema.safeParse({ password: formData.get("password") })
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message }
  }

  const hash = await hashPassword(parsed.data.password)

  try {
    await setUserPasswordIfNull(user.id, hash)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "PASSWORD_ALREADY_SET") {
      return { error: "already" }
    }
    throw e
  }

  if (user.activeOrganizationId) {
    await prisma.auditLog.create({
      data: {
        organizationId: user.activeOrganizationId,
        actorUserId: user.id,
        action: "auth.password.set",
      },
    })
  }

  return { success: true }
}
