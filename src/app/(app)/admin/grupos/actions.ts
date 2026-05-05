"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { BusinessError } from "@/lib/errors"
import {
  createGrupo as dbCreateGrupo,
  updateGrupo as dbUpdateGrupo,
  deleteGrupo as dbDeleteGrupo,
} from "@/repositories/grupo.repo"
import { revalidateTag } from "next/cache"
import { cacheTags } from "@/repositories/cache-tags"

const slugSchema = z
  .string()
  .regex(/^[a-z0-9-]+$/, "Solo letras minúsculas, números y guiones")
  .min(2)
  .max(50)
const createSchema = z.object({
  nombre: z.string().min(2).max(100),
  slug: slugSchema,
})
const updateSchema = createSchema.extend({ id: z.string().min(1) })

export async function createGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = createSchema.safeParse({
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    await dbCreateGrupo(org.organizationId, parsed.data, org.userId)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "SLUG_TAKEN") {
      return { error: "Ya existe un grupo con ese identificador" }
    }
    throw e
  }

  revalidateTag(cacheTags.grupos(org.organizationId))
  revalidateTag(cacheTags.memberships(org.organizationId))
  return { success: true }
}

export async function updateGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" }

  try {
    await dbUpdateGrupo(
      org.organizationId,
      parsed.data.id,
      { nombre: parsed.data.nombre, slug: parsed.data.slug },
      org.userId,
    )
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "SLUG_TAKEN") return { error: "Ya existe un grupo con ese identificador" }
      if (e.code === "NOT_FOUND") return { error: "Grupo no encontrado" }
    }
    throw e
  }

  revalidateTag(cacheTags.grupos(org.organizationId))
  revalidateTag(cacheTags.memberships(org.organizationId))
  return { success: true }
}

export async function deleteGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  try {
    await dbDeleteGrupo(org.organizationId, id, org.userId)
  } catch (e) {
    if (e instanceof BusinessError) {
      if (e.code === "NOT_FOUND") return { error: "Grupo no encontrado" }
      if (e.code === "HAS_MIEMBROS")
        return { error: `No se puede borrar: tiene ${e.meta?.count} miembro(s) scout vinculado(s)` }
      if (e.code === "HAS_MEMBERSHIPS")
        return { error: `No se puede borrar: tiene ${e.meta?.count} usuario(s) asignado(s)` }
      if (e.code === "HAS_INVITATIONS")
        return { error: `Hay ${e.meta?.count} invitación(es) pendiente(s) a este grupo. Revocalas primero.` }
      if (e.code === "HAS_PATRULLAS")
        return { error: `No se puede borrar: el grupo tiene ${e.meta?.count} patrulla(s) inscripta(s) en eventos. Eliminá las patrullas primero.` }
    }
    throw e
  }

  revalidateTag(cacheTags.grupos(org.organizationId))
  revalidateTag(cacheTags.memberships(org.organizationId))
  return { success: true }
}
