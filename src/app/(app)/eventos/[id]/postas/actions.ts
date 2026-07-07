"use server"

import { z } from "zod"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { crearPostaYAsignar, asignarPosta } from "@/repositories/posta.repo"
import { BusinessError } from "@/lib/errors"
import messages from "@/messages/es.json"

const me = messages.eventos.errors

function mapError(code: string): string {
  const map: Record<string, string> = {
    ACTIVIDAD_NO_ENCONTRADA: me.actividadNoEncontrada,
    EVENTO_LOCKED: me.eventoLocked,
    NOMBRE_POSTA_DUPLICADO: me.nombreDuplicado,
    POSTA_YA_ASIGNADA_EN_EVENTO: me.postaYaAsignada,
    POSTA_NO_ENCONTRADA: me.postaNoEncontrada,
    JUEZ_INVALIDO: me.juezInvalido,
  }
  return map[code] ?? "Error inesperado"
}

const MaterialSchema = z.object({
  nombre: z.string().min(1).max(100).trim(),
  cantidad: z.string().max(50).trim().optional(),
})

const CriteriosDescripcionesSchema = z.object({
  criterios: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  unico: z.record(z.string(), z.string()).optional(),
})

const CrearPostaSchema = z.object({
  nombre: z.string().trim().min(2).max(100),
  descripcion: z.string().trim().max(1000).optional(),
  duracionMinutos: z.coerce.number().int().min(1).max(480).optional().nullable(),
  materiales: z.array(MaterialSchema).default([]),
  encargado: z.string().trim().max(100).optional(),
  ayudantes: z.string().trim().max(300).optional(),
  criteriosDescripciones: CriteriosDescripcionesSchema.optional(),
})

export type CrearPostaJuezState = {
  error?: string
  fieldErrors?: Record<string, string[]>
}

export async function crearPostaComoJuezAction(
  _prev: CrearPostaJuezState,
  formData: FormData,
): Promise<CrearPostaJuezState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const actividadId = formData.get("actividadId") as string
  const eventoId = formData.get("eventoId") as string

  let materiales: unknown[] = []
  try {
    materiales = JSON.parse((formData.get("materiales") as string) || "[]")
  } catch {
    materiales = []
  }

  let criteriosDescripciones: unknown
  try {
    criteriosDescripciones = JSON.parse((formData.get("criteriosDescripciones") as string) || "{}")
  } catch {
    criteriosDescripciones = {}
  }

  const raw = {
    nombre: formData.get("nombre") as string,
    descripcion: (formData.get("descripcion") as string) || undefined,
    duracionMinutos: (formData.get("duracionMinutos") as string) || undefined,
    materiales,
    encargado: (formData.get("encargado") as string) || undefined,
    ayudantes: (formData.get("ayudantes") as string) || undefined,
    criteriosDescripciones,
  }

  const result = CrearPostaSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await crearPostaYAsignar(org.organizationId, actividadId, result.data, org.userId)
  } catch (err) {
    if (err instanceof BusinessError) return { error: mapError(err.code) }
    throw err
  }

  redirect(`/eventos/${eventoId}/postas`)
}

const AsignarExistenteSchema = z.object({
  postaId: z.string().min(1),
})

export type AsignarExistenteJuezState = { error?: string }

export async function asignarPostaExistenteComoJuezAction(
  _prev: AsignarExistenteJuezState,
  formData: FormData,
): Promise<AsignarExistenteJuezState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const actividadId = formData.get("actividadId") as string
  const eventoId = formData.get("eventoId") as string

  const result = AsignarExistenteSchema.safeParse({ postaId: formData.get("postaId") as string })
  if (!result.success) return { error: "Datos inválidos" }

  try {
    await asignarPosta(
      org.organizationId,
      actividadId,
      { postaId: result.data.postaId, juezUserId: org.userId },
      org.userId,
    )
  } catch (err) {
    if (err instanceof BusinessError) return { error: mapError(err.code) }
    throw err
  }

  redirect(`/eventos/${eventoId}/postas`)
}
