"use server"

import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { saveScoreSheet, submitScoreSheet } from "@/repositories/score-sheet.repo"
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"

const SaveSchema = z.object({
  entries: z
    .array(z.object({ criterionId: z.string().min(1), valor: z.string() }))
    .default([]),
  puntajeUnico: z.string().nullable().default(null),
})

export type SaveScoreSheetState = {
  success?: true
  error?: string
  fieldErrors?: Record<string, string[]>
  enviado?: { totalPuntuable: string; totalDesempate: string }
}

function mapError(err: BusinessError): SaveScoreSheetState {
  const map: Record<string, string> = {
    ASIGNACION_NO_ENCONTRADA: "Posta no encontrada",
    FORBIDDEN_NO_ASIGNADO: "No tenés permiso para cargar esta posta",
    EVENTO_NO_ACTIVO: "El evento no está activo",
    VALOR_FUERA_DE_ESCALA: "Hay valores fuera de la escala válida",
    PUNTAJE_UNICO_REQUERIDO: "Falta cargar el puntaje",
    CRITERIOS_FALTANTES: `Faltan criterios por completar`,
    CRITERIO_NO_ENCONTRADO: "Criterio no encontrado",
  }
  return { error: map[err.code] ?? "Error inesperado" }
}

function parseFormData(formData: FormData) {
  return {
    entries: JSON.parse((formData.get("entries") as string) || "[]"),
    puntajeUnico: (formData.get("puntajeUnico") as string) || null,
  }
}

export async function saveScoreSheetAction(
  _prev: SaveScoreSheetState,
  formData: FormData,
): Promise<SaveScoreSheetState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const asignacionId = formData.get("asignacionId") as string
  const patrullaId = formData.get("patrullaId") as string

  const result = SaveSchema.safeParse(parseFormData(formData))
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await saveScoreSheet(
      org.organizationId,
      asignacionId,
      patrullaId,
      {
        entries: result.data.entries.map((e) => ({
          criterionId: e.criterionId,
          valor: new Decimal(e.valor),
        })),
        puntajeUnico: result.data.puntajeUnico ? new Decimal(result.data.puntajeUnico) : null,
      },
      org.userId,
      org.role === "ADMIN",
    )
    return { success: true }
  } catch (err) {
    if (err instanceof BusinessError) return mapError(err)
    throw err
  }
}

export async function submitScoreSheetAction(
  _prev: SaveScoreSheetState,
  formData: FormData,
): Promise<SaveScoreSheetState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const asignacionId = formData.get("asignacionId") as string
  const patrullaId = formData.get("patrullaId") as string

  const result = SaveSchema.safeParse(parseFormData(formData))
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const { totalPuntuable, totalDesempate } = await submitScoreSheet(
      org.organizationId,
      asignacionId,
      patrullaId,
      {
        entries: result.data.entries.map((e) => ({
          criterionId: e.criterionId,
          valor: new Decimal(e.valor),
        })),
        puntajeUnico: result.data.puntajeUnico ? new Decimal(result.data.puntajeUnico) : null,
      },
      org.userId,
      org.role === "ADMIN",
    )
    return {
      success: true,
      enviado: {
        totalPuntuable: totalPuntuable.toString(),
        totalDesempate: totalDesempate.toString(),
      },
    }
  } catch (err) {
    if (err instanceof BusinessError) return mapError(err)
    throw err
  }
}
