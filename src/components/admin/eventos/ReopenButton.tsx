"use client"

import { useActionState, useEffect, startTransition } from "react"
import { useRouter } from "next/navigation"
import { reopenScoreSheetAction, type ReopenState } from "@/app/(app)/admin/eventos/[id]/planillas/actions"

type Props = {
  scoreSheetId: string
  patrullaNombre: string
}

export function ReopenButton({ scoreSheetId, patrullaNombre }: Props) {
  const router = useRouter()
  const [state, dispatch, pending] = useActionState(reopenScoreSheetAction, {} as ReopenState)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success, router])

  function handleClick() {
    if (!confirm(`¿Reabrir la planilla de "${patrullaNombre}"? El juez podrá editarla nuevamente.`)) return
    const fd = new FormData()
    fd.set("scoreSheetId", scoreSheetId)
    startTransition(() => dispatch(fd))
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="rounded px-2 py-1 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors disabled:opacity-60"
      >
        {pending ? "Reabriendo…" : "Reabrir"}
      </button>
      {state.error && (
        <p className="mt-1 text-xs text-red-600">{state.error}</p>
      )}
    </div>
  )
}
