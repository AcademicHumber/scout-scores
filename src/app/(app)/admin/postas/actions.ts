"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { createPosta } from "@/repositories/posta.repo"
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

export type CreatePostaState = { error?: string; fieldErrors?: Record<string, string[]> }

export async function createPostaAction(
  _prev: CreatePostaState,
  formData: FormData,
): Promise<CreatePostaState> {
  const org = await requireRole(["ADMIN"])

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

  let createdId: string
  try {
    const created = await createPosta(org.organizationId, result.data, org.userId)
    createdId = created.id
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "NOMBRE_POSTA_DUPLICADO") return { error: "Ya existe una posta con ese nombre en el distrito" }
    }
    throw err
  }

  redirect(`/admin/postas/${createdId}`)
}
