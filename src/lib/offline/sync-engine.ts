"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { drain } from "./queue"
import {
  countPendingOps,
  getPendingOpsByStatus,
} from "./db"
import { hydrateSnapshot } from "./snapshot"

export type SyncStatus = "online" | "offline" | "syncing" | "conflict" | "idle"

export type SyncEngineState = {
  status: SyncStatus
  pendingCount: number
  conflictCount: number
  lastHydratedAt: number
  syncNow: () => Promise<void>
}

// Hook principal del sync engine.
// Orquesta drain() + snapshot hydration ante eventos de conectividad y visibilitychange.
// Props: userId y organizationId del usuario autenticado (para detectar cambios de tenant).
export function useSyncEngine(userId?: string, organizationId?: string): SyncEngineState {
  // null = aún no montado (SSR). Se resuelve en el primer useEffect.
  const [isOnline, setIsOnline] = useState<boolean | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [conflictCount, setConflictCount] = useState(0)
  const [lastHydratedAt, setLastHydratedAt] = useState(0)
  const syncingRef = useRef(false)

  const refreshCounts = useCallback(async () => {
    const pending = await countPendingOps()
    const conflicts = await getPendingOpsByStatus("conflict")
    setPendingCount(pending)
    setConflictCount(conflicts.length)
  }, [])

  const syncNow = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return
    syncingRef.current = true
    setSyncing(true)

    try {
      // Hidratar snapshot primero (detecta cambio de tenant y hace wipe si necesario)
      if (userId && organizationId) {
        try {
          await hydrateSnapshot(userId, organizationId)
          setLastHydratedAt(Date.now())
        } catch {
          // Si el snapshot falla (red inestable), continuar con drain igual
        }
      }
      await drain()
    } finally {
      syncingRef.current = false
      setSyncing(false)
      await refreshCounts()
    }
  }, [refreshCounts, userId, organizationId])

  // Leer el estado real de red tras el mount (evita mismatch SSR/client)
  useEffect(() => {
    setIsOnline(navigator.onLine)
  }, [])

  // Actualizar estado online
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      syncNow()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    return () => {
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [syncNow])

  // visibilitychange: sync cuando la app vuelve a foreground (iOS)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        syncNow()
      }
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [syncNow])

  // Hidratación y drain inicial al montar (ya estamos online al entrar al layout de juez)
  // También corre cuando userId/organizationId cambian (cambio de tenant)
  useEffect(() => {
    syncNow()
  }, [syncNow])

  // Refresh periódico de contadores (para reflejar ops agregadas externamente)
  useEffect(() => {
    refreshCounts()
    const interval = setInterval(refreshCounts, 5000)
    return () => clearInterval(interval)
  }, [refreshCounts])

  // Determinar status derivado (null = pre-mount, no hay info de red todavía)
  let status: SyncStatus
  if (isOnline === null) {
    status = "idle"
  } else if (!isOnline) {
    status = "offline"
  } else if (syncing) {
    status = "syncing"
  } else if (conflictCount > 0) {
    status = "conflict"
  } else {
    status = "online"
  }

  return { status, pendingCount, conflictCount, lastHydratedAt, syncNow }
}
