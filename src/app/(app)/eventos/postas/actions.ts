"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { updatePosta, deletePosta } from "@/repositories/posta.repo"
import { BusinessError } from "@/lib/errors"
import type { UpdatePostaState, DeletePostaState } from "@/app/(app)/admin/postas/[id]/actions"
import messages from "@/messages/es.json"

const me = messages.eventos.errors

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

export async function updatePostaComoJuezAction(
  _prev: UpdatePostaState,
  formData: FormData,
): Promise<UpdatePostaState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
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
    const updated = await updatePosta(org.organizationId, postaId, result.data, org.userId, org.role)
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
      if (err.code === "NOMBRE_POSTA_DUPLICADO") return { error: me.nombreDuplicado }
      if (err.code === "POSTA_NO_ENCONTRADA") return { error: me.postaNoEncontrada }
      if (err.code === "POSTA_NO_PROPIA") return { error: me.postaNoPropia }
    }
    throw err
  }
}

export async function deletePostaComoJuezAction(
  _prev: DeletePostaState,
  formData: FormData,
): Promise<DeletePostaState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const postaId = formData.get("postaId") as string

  try {
    await deletePosta(org.organizationId, postaId, org.userId, org.role)
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "POSTA_EN_USO") {
        const eventos = (err.meta?.eventos as string[])?.join(", ") ?? ""
        return { error: `La posta está en uso en: ${eventos}. Desasignala primero.` }
      }
      if (err.code === "POSTA_NO_ENCONTRADA") return { error: me.postaNoEncontrada }
      if (err.code === "POSTA_NO_PROPIA") return { error: me.postaNoPropia }
    }
    throw err
  }

  redirect("/eventos/postas")
}
