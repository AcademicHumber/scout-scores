"use client"

import {
  type PendingOp,
  enqueuePendingOp,
  getPendingOpsByStatus,
  updatePendingOp,
  deletePendingOp,
} from "./db"

type SyncResult =
  | { ok: true; type: "save" | "submit"; scoreSheetId: string; version: number }
  | { ok: false; code: string; current?: Record<string, unknown> }

// Encola una nueva operación. Si ya existe (misma clientOpId), sobreescribe.
export async function enqueueOp(op: PendingOp): Promise<void> {
  await enqueuePendingOp(op)
}

// Mutex global: evita que dos instancias de useSyncEngine drenen en paralelo.
let _draining = false

// Procesa la cola de ops "pending" una a una, en orden de creación.
// Devuelve cuántas ops se procesaron exitosamente.
export async function drain(): Promise<{ sent: number; conflicted: number }> {
  if (_draining) return { sent: 0, conflicted: 0 }
  _draining = true

  try {
    return await _drainInner()
  } finally {
    _draining = false
  }
}

async function _drainInner(): Promise<{ sent: number; conflicted: number }> {
  const pending = (await getPendingOpsByStatus("pending")).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  )
  let sent = 0
  let conflicted = 0

  for (const op of pending) {
    await updatePendingOp(op.clientOpId, { status: "syncing" })

    try {
      const res = await fetch("/api/juez/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientOpId: op.clientOpId,
          type: op.type,
          asignacionId: op.asignacionId,
          patrullaId: op.patrullaId,
          payload: op.payload,
          expectedVersion: op.expectedVersion,
          clientId: op.clientId,
          clientSubmittedAt: op.clientSubmittedAt,
        }),
      })

      const result: SyncResult = await res.json()

      if (res.ok && result.ok) {
        await deletePendingOp(op.clientOpId)
        sent++
      } else if (res.status === 409 && !result.ok && result.code === "VERSION_CONFLICT") {
        await markConflict(op.clientOpId, result.current ?? null)
        conflicted++
      } else {
        // Error de validación u otro — marcar como pendiente con error
        const code = !result.ok ? result.code : undefined
        await updatePendingOp(op.clientOpId, {
          status: "pending",
          attempts: op.attempts + 1,
          lastError: code ?? `HTTP ${res.status}`,
        })
      }
    } catch (err) {
      // Error de red — volver a pending
      await updatePendingOp(op.clientOpId, {
        status: "pending",
        attempts: op.attempts + 1,
        lastError: err instanceof Error ? err.message : "Network error",
      })
    }
  }

  return { sent, conflicted }
}

export async function markConflict(
  clientOpId: string,
  conflictData: Record<string, unknown> | null,
): Promise<void> {
  await updatePendingOp(clientOpId, { status: "conflict", conflictData })
}

// Re-encola una op en conflicto con un nuevo expectedVersion (juez decide "Reenviar")
export async function reEnqueueConflict(
  clientOpId: string,
  newExpectedVersion: number,
): Promise<void> {
  await updatePendingOp(clientOpId, {
    status: "pending",
    expectedVersion: newExpectedVersion,
    conflictData: null,
    lastError: null,
  })
}

// Descarta una op en conflicto (juez decide "Descartar")
export async function discardConflict(clientOpId: string): Promise<void> {
  await deletePendingOp(clientOpId)
}

export { getPendingOpsByStatus, deletePendingOp, updatePendingOp }
