"use server"
import { z } from "zod"
import { requireRole, requireUser } from "@/lib/auth-helpers"
import { unstable_update } from "@/auth"
import { BusinessError } from "@/lib/errors"
import {
  updateMembership as dbUpdateMembership,
  deleteMembership,
} from "@/repositories/membership.repo"
import { revalidateTag } from "next/cache"
import { cacheTags } from "@/repositories/cache-tags"

const updateSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["ADMIN", "JUEZ", "ESPECTADOR", "JEFE_PATRULLA"]),
  grupoScoutId: z
    .string()
    .min(1)
    .optional()
    .or(z.literal("").transform(() => undefined)),
})

export async function updateMembership(_prev: unknown, formData: FormData) {
  const [org, user] = await Promise.all([requireRole(["ADMIN"]), requireUser()])
  const parsed = updateSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
    grupoScoutId: formData.get("grupoScoutId") || undefined,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  try {
    const { affectedUserId } = await dbUpdateMembership(
      org.organizationId,
      parsed.data.membershipId,
      { role: parsed.data.role, grupoScoutId: parsed.data.grupoScoutId ?? null },
      user.id,
    )
    if (affectedUserId === user.id) {
      await unstable_update({ refreshMemberships: true })
    }
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "LAST_ADMIN") return { error: "No podés quitar el último ADMIN del distrito" }
      if (e.code === "NOT_FOUND") return { error: "Miembro no encontrado" }
      if (e.code === "INVALID_GRUPO") return { error: "Grupo inválido" }
    }
    throw e
  }

  return {
    success: true,
    membership: {
      role: parsed.data.role,
      grupoScoutId: parsed.data.grupoScoutId ?? null,
    },
  }
}

export async function removeMembership(_prev: unknown, formData: FormData) {
  const [org, user] = await Promise.all([requireRole(["ADMIN"]), requireUser()])
  const id = z.string().min(1).parse(formData.get("id"))

  try {
    const { affectedUserId } = await deleteMembership(org.organizationId, id, user.id)
    if (affectedUserId === user.id) {
      await unstable_update({ refreshMemberships: true })
    }
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "LAST_ADMIN") return { error: "No podés expulsar al último ADMIN del distrito" }
      if (e.code === "NOT_FOUND") return { error: "Miembro no encontrado" }
    }
    throw e
  }

  revalidateTag(cacheTags.memberships(org.organizationId))
  return { success: true }
}
