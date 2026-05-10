"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSyncEngine, type SyncStatus } from "./sync-engine"

type JuezDataState<T> =
  | { status: "loading"; data: null; firstTimeOffline: false }
  | { status: "ready"; data: T; firstTimeOffline: false }
  | { status: "empty"; data: null; firstTimeOffline: boolean }

export type UseJuezDataResult<T> = JuezDataState<T> & {
  refresh: () => void
  syncStatus: SyncStatus
}

// Hook genérico que combina una lectura del IDB con el sync engine.
// reader: función async que devuelve T | null (null = no encontrado).
// emptyCheck: devuelve true si T existe pero está vacío (ej: array vacío).
// Cuando IDB está vacío y lastHydratedAt === 0 y estamos online → mantiene "loading"
// (el sync está en curso). Si offline y lastHydratedAt === 0 → firstTimeOffline: true.
export function useJuezData<T>(
  reader: () => Promise<T | null>,
  emptyCheck: (data: T) => boolean,
  userId?: string,
  organizationId?: string,
): UseJuezDataResult<T> {
  const { lastHydratedAt, status: syncStatus } = useSyncEngine(userId, organizationId)
  const [state, setState] = useState<JuezDataState<T>>({
    status: "loading",
    data: null,
    firstTimeOffline: false,
  })
  const [reloadTrigger, setReloadTrigger] = useState(0)

  const readerRef = useRef(reader)
  readerRef.current = reader
  const emptyCheckRef = useRef(emptyCheck)
  emptyCheckRef.current = emptyCheck

  useEffect(() => {
    let cancelled = false

    readerRef.current().then((data) => {
      if (cancelled) return

      if (data === null || emptyCheckRef.current(data)) {
        if (!navigator.onLine) {
          setState({ status: "empty", data: null, firstTimeOffline: lastHydratedAt === 0 })
        } else if (lastHydratedAt === 0) {
          // Online and never synced: first sync is in progress — keep loading
          setState({ status: "loading", data: null, firstTimeOffline: false })
        } else {
          setState({ status: "empty", data: null, firstTimeOffline: false })
        }
      } else {
        setState({ status: "ready", data, firstTimeOffline: false })
      }
    })

    return () => { cancelled = true }
  }, [lastHydratedAt, reloadTrigger])

  const refresh = useCallback(() => {
    setReloadTrigger((n) => n + 1)
  }, [])

  return { ...state, refresh, syncStatus }
}
