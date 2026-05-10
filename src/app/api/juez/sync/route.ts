import { NextResponse } from "next/server"
import { z } from "zod"
import { requireRoleApi } from "@/lib/auth-helpers"
import { saveScoreSheet, submitScoreSheet } from "@/repositories/score-sheet.repo"
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"
// Excepción justificada (conv. 14): esta route es el endpoint de sync PWA, no un feature de UI.
import { prisma } from "@/lib/db"
import type { Prisma } from "@/generated/prisma/client"

// ─── Zod schema ──────────────────────────────────────────────────────────────

const SyncOpSchema = z.object({
  clientOpId: z.string().uuid(),
  type: z.enum(["save", "submit"]),
  asignacionId: z.string().min(1),
  patrullaId: z.string().min(1),
  payload: z.object({
    entries: z
      .array(z.object({ criterionId: z.string().min(1), valor: z.string() }))
      .default([]),
    puntajeUnico: z.string().nullable().default(null),
  }),
  expectedVersion: z.number().int().nonnegative(),
  clientId: z.string().optional(),
  clientSubmittedAt: z.string().datetime().optional(),
})

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const auth = await requireRoleApi(["JUEZ", "ADMIN"])
  if (!auth.ok) return auth.response

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, code: "INVALID_JSON" }, { status: 400 })
  }

  const parsed = SyncOpSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, code: "VALIDATION_ERROR", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 422 },
    )
  }

  const { clientOpId, type, asignacionId, patrullaId, payload, expectedVersion, clientId, clientSubmittedAt } =
    parsed.data

  // ── Idempotencia: si ya procesamos esta op, devolver resultado anterior ──
  const existing = await prisma.syncOpLog.findUnique({ where: { clientOpId } })
  if (existing) {
    return NextResponse.json(existing.result)
  }

  const data = {
    entries: payload.entries.map((e) => ({ criterionId: e.criterionId, valor: new Decimal(e.valor) })),
    puntajeUnico: payload.puntajeUnico ? new Decimal(payload.puntajeUnico) : null,
  }
  const syncMeta = {
    expectedVersion,
    clientId,
    clientSubmittedAt: clientSubmittedAt ? new Date(clientSubmittedAt) : undefined,
  }

  try {
    let result: Record<string, unknown>
    let scoreSheetId: string
    let version: number

    if (type === "save") {
      const saved = await saveScoreSheet(
        auth.organizationId,
        asignacionId,
        patrullaId,
        data,
        auth.userId,
        auth.role === "ADMIN",
        syncMeta,
      )
      scoreSheetId = saved.id
      version = saved.version
      result = { ok: true, type: "save", scoreSheetId: saved.id, version: saved.version }
    } else {
      const submitted = await submitScoreSheet(
        auth.organizationId,
        asignacionId,
        patrullaId,
        data,
        auth.userId,
        auth.role === "ADMIN",
        syncMeta,
      )
      scoreSheetId = submitted.id
      version = submitted.version
      result = {
        ok: true,
        type: "submit",
        scoreSheetId: submitted.id,
        version: submitted.version,
        totalPuntuable: Number(submitted.totalPuntuable),
        totalDesempate: Number(submitted.totalDesempate),
      }
    }

    // Persistir resultado para idempotencia (limpia entradas >7 días on-write)
    await prisma.$transaction([
      prisma.syncOpLog.create({ data: { clientOpId, scoreSheetId, version, result: result as Prisma.InputJsonObject } }),
      prisma.syncOpLog.deleteMany({
        where: { processedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
    ])

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof BusinessError) {
      if (err.code === "VERSION_CONFLICT") {
        return NextResponse.json({ ok: false, code: "VERSION_CONFLICT", current: err.meta }, { status: 409 })
      }
      if (err.code === "FORBIDDEN_NO_ASIGNADO") {
        return NextResponse.json({ ok: false, code: err.code }, { status: 403 })
      }
      // Errores de validación de negocio (escala, criterios, etc.)
      return NextResponse.json({ ok: false, code: err.code, meta: err.meta }, { status: 422 })
    }
    throw err
  }
}
