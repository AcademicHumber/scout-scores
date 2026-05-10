"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getPendingOpsByStatus } from "@/lib/offline/db"
import { reEnqueueConflict, discardConflict } from "@/lib/offline/queue"
import { useSyncEngine } from "@/lib/offline/sync-engine"
import messages from "@/messages/es.json"

const t = messages.juez.conflicto

type Props = {
  asignacionId: string
  patrullaId: string
}

type ConflictOp = {
  clientOpId: string
  conflictData: Record<string, unknown> | null
}

export function ConflictBanner({ asignacionId, patrullaId }: Props) {
  const [conflictOp, setConflictOp] = useState<ConflictOp | null>(null)
  const { syncNow } = useSyncEngine()
  const router = useRouter()

  useEffect(() => {
    async function checkConflict() {
      const ops = await getPendingOpsByStatus("conflict")
      const op = ops.find((o) => o.asignacionId === asignacionId && o.patrullaId === patrullaId)
      if (op) {
        setConflictOp({ clientOpId: op.clientOpId, conflictData: op.conflictData })
      } else {
        setConflictOp(null)
      }
    }
    checkConflict()
  }, [asignacionId, patrullaId])

  if (!conflictOp) return null

  async function handleReenviar() {
    if (!conflictOp) return
    const currentVersion = typeof conflictOp.conflictData?.currentVersion === "number"
      ? conflictOp.conflictData.currentVersion
      : 0
    await reEnqueueConflict(conflictOp.clientOpId, currentVersion)
    setConflictOp(null)
    await syncNow()
  }

  async function handleDescartar() {
    if (!conflictOp) return
    await discardConflict(conflictOp.clientOpId)
    setConflictOp(null)
    router.refresh()
  }

  return (
    // m-auto necesario con Tailwind v4 (lección 21): el preflight pisa margin: auto del UA stylesheet
    <div className="rounded-2xl bg-red-50 border border-red-200 p-5 space-y-4">
      <div>
        <p className="font-bold text-red-900 text-base">{t.titulo}</p>
        <p className="text-sm text-red-700 mt-1">{t.mensaje}</p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={handleDescartar}
          className="flex-1 min-h-[48px] rounded-xl border-2 border-red-200 bg-white text-red-700 font-semibold text-sm hover:bg-red-50 active:scale-[0.99] transition-all"
        >
          {t.descartar}
        </button>
        <button
          type="button"
          onClick={handleReenviar}
          className="flex-1 min-h-[48px] rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 active:scale-[0.99] transition-all shadow-sm"
        >
          {t.reenviar}
        </button>
      </div>
    </div>
  )
}
