"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { BusinessError } from "@/lib/errors"
import {
  createInvitation as dbCreateInvitation,
  revokeInvitation as dbRevokeInvitation,
} from "@/repositories/invitation.repo"
import { revalidateTag } from "next/cache"
import { cacheTags } from "@/repositories/cache-tags"

const createSchema = z.object({
  email: z.string().email("Email inválido").toLowerCase(),
  role: z.enum(["ADMIN", "JUEZ", "ESPECTADOR", "JEFE_PATRULLA"]),
  grupoScoutId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
})

export async function createInvitation(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    grupoScoutId: formData.get("grupoScoutId") || undefined,
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  let token: string
  try {
    const result = await dbCreateInvitation(
      org.organizationId,
      {
        email: parsed.data.email,
        role: parsed.data.role,
        grupoScoutId: parsed.data.grupoScoutId,
      },
      org.userId,
    )
    token = result.token
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "INVALID_GRUPO") return { error: "Grupo inválido" }
      if (e.code === "ALREADY_MEMBER") return { error: "Ese email ya es miembro del distrito" }
      if (e.code === "ALREADY_INVITED")
        return { error: "Ya hay una invitación pendiente para ese email. Revocala primero." }
    }
    throw e
  }

  revalidateTag(cacheTags.invitations(org.organizationId))
  return { success: true, token }
}

export async function revokeInvitation(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  try {
    await dbRevokeInvitation(org.organizationId, id, org.userId)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "NOT_FOUND") {
      return { error: "Invitación no encontrada o ya procesada" }
    }
    throw e
  }

  revalidateTag(cacheTags.invitations(org.organizationId))
  return { success: true }
}
