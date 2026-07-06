"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { updatePosta, deletePosta, updateCriteriosDescripciones } from "@/repositories/posta.repo"
import { BusinessError } from "@/lib/errors"

const MaterialSchema = z.object({
  nombre: z.string().min(1).max(100).trim(),
  cantidad: z.string().max(50).trim().optional(),
})

const PostaSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(1000).optional(),
  duracionMinutos: z.coerce.number().int().min(1).max(480).optional().nullable(),
  materiales: z.array(MaterialSchema).default([]),
})

export type UpdatePostaState = {
  error?: string
  fieldErrors?: Record<string, string[]>
  posta?: { id: string; nombre: string; descripcion: string | null; duracionMinutos: number | null; materiales: unknown }
}

export async function updatePostaAction(
  _prev: UpdatePostaState,
  formData: FormData,
): Promise<UpdatePostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string

  const materialesRaw = formData.get("materiales") as string
  let materiales: Array<{ nombre: string; cantidad?: string }> = []
  try {
    materiales = materialesRaw ? JSON.parse(materialesRaw) : []
  } catch {
    materiales = []
  }

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: (formData.get("descripcion") as string) || undefined,
    duracionMinutos: (formData.get("duracionMinutos") as string) || undefined,
    materiales,
  }

  const result = PostaSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const updated = await updatePosta(org.organizationId, postaId, result.data, org.userId)
    return {
      posta: {
        id: updated.id,
        nombre: updated.nombre,
        descripcion: updated.descripcion,
        duracionMinutos: updated.duracionMinutos,
        materiales: updated.materiales,
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "NOMBRE_POSTA_DUPLICADO") return { error: "Ya existe una posta con ese nombre en el distrito" }
      if (err.code === "POSTA_NO_ENCONTRADA") return { error: "Posta no encontrada" }
    }
    throw err
  }
}

export type DeletePostaState = { error?: string }

export async function deletePostaAction(
  _prev: DeletePostaState,
  formData: FormData,
): Promise<DeletePostaState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string

  try {
    await deletePosta(org.organizationId, postaId, org.userId)
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "POSTA_EN_USO") {
        const eventos = (err.meta?.eventos as string[])?.join(", ") ?? ""
        return { error: `La posta está en uso en: ${eventos}. Desasignala primero.` }
      }
      if (err.code === "POSTA_NO_ENCONTRADA") return { error: "Posta no encontrada" }
    }
    throw err
  }

  redirect("/admin/postas")
}

const CriteriosDescripcionesSchema = z.object({
  scope: z.string().min(1),
  valores: z.record(z.string(), z.string()),
})

export type UpdateCriteriosDescripcionesState = { error?: string; success?: boolean }

export async function updateCriteriosDescripcionesAction(
  _prev: UpdateCriteriosDescripcionesState,
  formData: FormData,
): Promise<UpdateCriteriosDescripcionesState> {
  const org = await requireRole(["ADMIN"])
  const postaId = formData.get("postaId") as string

  let valores: Record<string, string> = {}
  try {
    valores = JSON.parse((formData.get("valores") as string) || "{}")
  } catch {
    valores = {}
  }

  const result = CriteriosDescripcionesSchema.safeParse({
    scope: formData.get("scope") as string,
    valores,
  })
  if (!result.success) {
    return { error: "Datos inválidos" }
  }

  const scope = result.data.scope === "unico" ? { unico: true as const } : { criterioId: result.data.scope }

  try {
    await updateCriteriosDescripciones(org.organizationId, postaId, scope, result.data.valores, org.userId)
    return { success: true }
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "POSTA_NO_ENCONTRADA") return { error: "Posta no encontrada" }
    }
    throw err
  }
}
