"use client"

import { useCallback, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useSyncEngine } from "@/lib/offline/sync-engine"
import {
  getAllActivePendingOps,
  discardPendingOp,
  reEnqueueConflict,
  updatePendingOp,
} from "@/lib/offline/queue"
import { getSnapshotEntry } from "@/lib/offline/db"
import { JuezLink } from "@/lib/offline/juez-router"
import type { PendingOp } from "@/lib/offline/db"

type OpWithContext = PendingOp & {
  postaNombre: string
  patrullaNombre: string
}

function localizeError(code: string | null): string | null {
  if (!code) return null
  const map: Record<string, string> = {
    CRITERIOS_FALTANTES: "Hay criterios sin completar",
    VALOR_FUERA_DE_ESCALA: "Un valor no está en la escala permitida",
    PLANILLA_YA_ENVIADA: "La planilla ya fue enviada por otra vía",
    POSTA_NO_ENCONTRADA: "La posta ya no existe en el sistema",
    VALIDATION_ERROR: "Error de validación de datos",
  }
  return map[code] ?? code
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const hhmm = d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
  return isToday ? `Hoy ${hhmm}` : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" }) + " " + hhmm
}

function StatusBadge({ op }: { op: PendingOp }) {
  if (op.status === "conflict") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
        En conflicto
      </span>
    )
  }
  if (op.status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
        Sincronizando…
      </span>
    )
  }
  if (op.lastError) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
        Con error
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600">
      Pendiente
    </span>
  )
}

function OpCard({
  op,
  isOffline,
  onDiscard,
  onRetry,
  onResend,
}: {
  op: OpWithContext
  isOffline: boolean
  onDiscard: (id: string) => Promise<void>
  onRetry: (id: string) => Promise<void>
  onResend: (id: string, version: number) => Promise<void>
}) {
  const [busy, setBusy] = useState(false)

  async function handle(fn: () => Promise<void>) {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  const typeBadgeClass =
    op.type === "submit"
      ? "bg-[#622599] text-white"
      : "bg-gray-200 text-gray-700"

  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
      {/* Type + status row */}
      <div className="mb-2 flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeBadgeClass}`}>
          {op.type === "submit" ? "Planilla" : "Borrador"}
        </span>
        <StatusBadge op={op} />
        <span className="ml-auto text-[11px] text-gray-400">{formatTime(op.createdAt)}</span>
      </div>

      {/* Posta / Patrulla */}
      <p className="font-semibold text-gray-800 text-sm leading-tight">{op.postaNombre}</p>
      <p className="text-xs text-gray-500 mt-0.5">{op.patrullaNombre}</p>

      {/* Error message */}
      {op.lastError && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2">
          <svg className="mt-px h-3.5 w-3.5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-[11px] text-amber-700 leading-snug">{localizeError(op.lastError)}</span>
        </div>
      )}

      {/* Conflict message */}
      {op.status === "conflict" && (
        <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2">
          <svg className="mt-px h-3.5 w-3.5 shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span className="text-[11px] text-red-700 leading-snug">
            La planilla fue modificada por el administrador mientras no había conexión. Podés reenviar con los datos actuales o descartar.
          </span>
        </div>
      )}

      {/* Attempts */}
      {op.attempts > 1 && (
        <p className="mt-1.5 text-[11px] text-gray-400">{op.attempts} intentos realizados</p>
      )}

      {/* Actions */}
      {op.status !== "syncing" && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => handle(() => onDiscard(op.clientOpId))}
            className="flex-1 rounded-xl border border-gray-200 bg-gray-50 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Descartar
          </button>

          {op.status === "conflict" ? (
            <button
              type="button"
              disabled={busy || isOffline}
              onClick={() => {
                const version = (op.conflictData as { currentVersion: number } | null)?.currentVersion ?? op.expectedVersion
                handle(() => onResend(op.clientOpId, version))
              }}
              className="flex-1 rounded-xl bg-[#622599] py-2 text-xs font-medium text-white hover:bg-[#7a2fbf] disabled:opacity-40 transition-colors"
            >
              {isOffline ? "Sin red" : "Reenviar"}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy || isOffline}
              onClick={() => handle(() => onRetry(op.clientOpId))}
              className="flex-1 rounded-xl bg-[#622599] py-2 text-xs font-medium text-white hover:bg-[#7a2fbf] disabled:opacity-40 transition-colors"
            >
              {isOffline ? "Sin red" : "Reintentar"}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function PendingOpsView() {
  const { data: session } = useSession()
  const userId = session?.user?.id as string | undefined
  const organizationId = (session?.user as { organizationId?: string } | undefined)?.organizationId

  const { status: syncStatus, syncNow } = useSyncEngine(userId, organizationId)
  const isOffline = syncStatus === "offline"

  const [ops, setOps] = useState<OpWithContext[] | null>(null)

  const loadOps = useCallback(async () => {
    const raw = await getAllActivePendingOps()
    const enriched = await Promise.all(
      raw.map(async (op) => {
        const entry = await getSnapshotEntry(op.asignacionId, op.patrullaId)
        return {
          ...op,
          postaNombre: entry?.posta?.nombre ?? `Posta ${op.asignacionId.slice(0, 6)}`,
          patrullaNombre: entry?.patrulla?.nombre ?? `Patrulla ${op.patrullaId.slice(0, 6)}`,
        }
      }),
    )
    setOps(enriched)
  }, [])

  useEffect(() => {
    loadOps()
  }, [loadOps])

  async function handleDiscard(clientOpId: string) {
    await discardPendingOp(clientOpId)
    setOps((prev) => prev?.filter((o) => o.clientOpId !== clientOpId) ?? null)
  }

  async function handleRetry(clientOpId: string) {
    await updatePendingOp(clientOpId, { attempts: 0, lastError: null })
    await syncNow()
    await loadOps()
  }

  async function handleResend(clientOpId: string, version: number) {
    await reEnqueueConflict(clientOpId, version)
    await syncNow()
    await loadOps()
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="mb-5">
        <JuezLink
          href="/juez/eventos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#622599]"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Eventos
        </JuezLink>
      </div>

      <h1 className="mb-1 text-2xl font-bold tracking-tight text-gray-900">Operaciones pendientes</h1>
      <p className="mb-6 text-sm text-gray-500">
        Cambios guardados en este dispositivo que aún no se sincronizaron con el servidor.
      </p>

      {/* Loading skeleton */}
      {ops === null && (
        <div className="space-y-3 animate-pulse">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="mb-2 flex gap-2">
                <div className="h-4 w-16 rounded-full bg-gray-200" />
                <div className="h-4 w-12 rounded-full bg-gray-100" />
              </div>
              <div className="h-4 w-2/3 rounded bg-gray-200 mb-1" />
              <div className="h-3 w-1/3 rounded bg-gray-100" />
              <div className="mt-3 flex gap-2">
                <div className="h-9 flex-1 rounded-xl bg-gray-100" />
                <div className="h-9 flex-1 rounded-xl bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {ops !== null && ops.length === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-green-200 bg-green-50 p-10 text-center">
          <svg className="mx-auto mb-3 h-8 w-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-semibold text-green-700">Todo sincronizado</p>
          <p className="mt-1 text-sm text-green-600">No hay operaciones pendientes.</p>
        </div>
      )}

      {/* Ops list */}
      {ops !== null && ops.length > 0 && (
        <div className="space-y-3">
          {ops.map((op) => (
            <OpCard
              key={op.clientOpId}
              op={op}
              isOffline={isOffline}
              onDiscard={handleDiscard}
              onRetry={handleRetry}
              onResend={handleResend}
            />
          ))}
        </div>
      )}
    </div>
  )
}
