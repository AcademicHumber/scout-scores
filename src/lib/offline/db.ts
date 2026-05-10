"use client"

import { openDB, type DBSchema, type IDBPDatabase } from "idb"
import type { SnapshotEntry } from "@/repositories/score-sheet.repo"

// ─── IDB schema ───────────────────────────────────────────────────────────────

interface JuezDB extends DBSchema {
  meta: {
    key: string
    value: {
      key: string
      value: string | number | null
    }
  }
  snapshot: {
    key: string // `${asignacionId}:${patrullaId}`
    value: SnapshotEntry & { fetchedAt: string }
    indexes: { "by-eventoId": string; "by-asignacionId": string }
  }
  pendingOps: {
    key: string // clientOpId (UUID)
    value: PendingOp
    indexes: { "by-status": PendingOpStatus }
  }
}

export type PendingOpStatus = "pending" | "syncing" | "conflict" | "done"

export type PendingOp = {
  clientOpId: string
  type: "save" | "submit"
  asignacionId: string
  patrullaId: string
  payload: {
    entries: { criterionId: string; valor: string }[]
    puntajeUnico: string | null
  }
  expectedVersion: number
  clientId: string
  clientSubmittedAt: string // ISO string
  createdAt: string         // ISO string — para ordenar el drain en secuencia
  status: PendingOpStatus
  attempts: number
  lastError: string | null
  conflictData: Record<string, unknown> | null
}

// ─── DB singleton ─────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBPDatabase<JuezDB>> | null = null

export function getDB(): Promise<IDBPDatabase<JuezDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JuezDB>("puntajes-scout-juez", 2, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          db.createObjectStore("meta", { keyPath: "key" })
          const snapStore = db.createObjectStore("snapshot", { keyPath: "id" } as never)
          snapStore.createIndex("by-eventoId", "eventoId")
          snapStore.createIndex("by-asignacionId", "asignacionId")
          const opsStore = db.createObjectStore("pendingOps", { keyPath: "clientOpId" })
          opsStore.createIndex("by-status", "status")
        }
        if (oldVersion < 2) {
          // Shape of snapshot entries changed (added evento/actividad fields);
          // wipe and re-hydrate on first sync. pendingOps and meta are preserved.
          transaction.objectStore("snapshot").clear()
        }
      },
    })
  }
  return dbPromise
}

// ─── Meta helpers ─────────────────────────────────────────────────────────────

export async function getMeta(key: string): Promise<string | number | null> {
  const db = await getDB()
  const record = await db.get("meta", key)
  return record?.value ?? null
}

export async function setMeta(key: string, value: string | number | null): Promise<void> {
  const db = await getDB()
  await db.put("meta", { key, value })
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

export function snapshotKey(asignacionId: string, patrullaId: string): string {
  return `${asignacionId}:${patrullaId}`
}

export async function getSnapshotEntry(
  asignacionId: string,
  patrullaId: string,
): Promise<(SnapshotEntry & { fetchedAt: string }) | undefined> {
  const db = await getDB()
  return db.get("snapshot", snapshotKey(asignacionId, patrullaId))
}

export async function putSnapshotEntries(
  entries: (SnapshotEntry & { fetchedAt: string })[],
): Promise<void> {
  const db = await getDB()
  const tx = db.transaction("snapshot", "readwrite")
  await Promise.all([
    ...entries.map((e) => tx.store.put({ ...e, id: snapshotKey(e.asignacionId, e.patrullaId) } as never)),
    tx.done,
  ])
}

export async function clearSnapshot(): Promise<void> {
  const db = await getDB()
  await db.clear("snapshot")
}

// ─── PendingOps helpers ───────────────────────────────────────────────────────

export async function enqueuePendingOp(op: PendingOp): Promise<void> {
  const db = await getDB()
  await db.put("pendingOps", op)
}

export async function getPendingOp(clientOpId: string): Promise<PendingOp | undefined> {
  const db = await getDB()
  return db.get("pendingOps", clientOpId)
}

export async function getPendingOpsByStatus(status: PendingOpStatus): Promise<PendingOp[]> {
  const db = await getDB()
  return db.getAllFromIndex("pendingOps", "by-status", status)
}

export async function updatePendingOp(
  clientOpId: string,
  updates: Partial<PendingOp>,
): Promise<void> {
  const db = await getDB()
  const existing = await db.get("pendingOps", clientOpId)
  if (!existing) return
  await db.put("pendingOps", { ...existing, ...updates })
}

export async function deletePendingOp(clientOpId: string): Promise<void> {
  const db = await getDB()
  await db.delete("pendingOps", clientOpId)
}

export async function countPendingOps(): Promise<number> {
  const db = await getDB()
  return db.countFromIndex("pendingOps", "by-status", "pending")
}
