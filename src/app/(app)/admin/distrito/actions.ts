"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { unstable_update } from "@/auth"
import { updateDistrito as dbUpdateDistrito } from "@/repositories/distrito.repo"
import { revalidateTag } from "next/cache"
import { cacheTags } from "@/repositories/cache-tags"

const schema = z.object({ nombre: z.string().min(2).max(100) })

export async function updateDistrito(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = schema.safeParse({ nombre: formData.get("nombre") })
  if (!parsed.success) return { error: "Nombre inválido (mínimo 2, máximo 100 caracteres)" }

  await dbUpdateDistrito(org.organizationId, parsed.data.nombre, org.userId)
  await unstable_update({ refreshMemberships: true })
  revalidateTag(cacheTags.distrito(org.organizationId))
  return { success: true }
}
