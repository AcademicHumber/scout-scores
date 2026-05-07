"use server"

import { requireRole } from "@/lib/auth-helpers"
import { reopenScoreSheet } from "@/repositories/score-sheet.repo"
import { BusinessError } from "@/lib/errors"

export type ReopenState = { success?: true; error?: string }

export async function reopenScoreSheetAction(
  _prev: ReopenState,
  formData: FormData,
): Promise<ReopenState> {
  const org = await requireRole(["ADMIN"])
  const scoreSheetId = formData.get("scoreSheetId") as string

  try {
    await reopenScoreSheet(org.organizationId, scoreSheetId, org.userId)
    return { success: true }
  } catch (err) {
    if (err instanceof BusinessError) {
      const map: Record<string, string> = {
        SCORE_SHEET_NO_ENCONTRADA: "Planilla no encontrada",
        SCORE_SHEET_NO_ENVIADA: "La planilla ya está en borrador",
      }
      return { error: map[err.code] ?? "Error inesperado" }
    }
    throw err
  }
}
