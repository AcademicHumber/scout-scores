"use client"

import { useActionState } from "react"
import { regenerateSnapshotAction } from "@/app/(app)/admin/eventos/[id]/leaderboard/actions"

type Props = {
  eventoId: string
  snapshot: { generatedAt: Date; generatedByName: string | null } | null
  isStale: boolean
}

type State = { success: true; generatedAt: string } | { error: string } | null

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString("es-BO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "UTC",
  })
}

export function SnapshotControls({ eventoId, snapshot, isStale }: Props) {
  const [state, dispatch, isPending] = useActionState<State, FormData>(
    regenerateSnapshotAction,
    null,
  )

  const generatedAt = state && "success" in state
    ? state.generatedAt
    : snapshot?.generatedAt ?? null

  return (
    <div className="space-y-3">
      {isStale && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="text-base">⚠</span>
          <span>El snapshot público está desactualizado respecto a las planillas actuales.</span>
        </div>
      )}

      {generatedAt ? (
        <div className="text-sm text-gray-600">
          Snapshot generado el {formatDate(generatedAt)}
          {snapshot?.generatedByName && (
            <span className="text-gray-400"> por {snapshot.generatedByName}</span>
          )}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No se generó ningún snapshot aún.</p>
      )}

      {state && "error" in state && (
        <p className="text-sm text-red-600">{state.error}</p>
      )}

      <form action={dispatch}>
        <input type="hidden" name="eventoId" value={eventoId} />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {isPending ? "Generando…" : generatedAt ? "Regenerar snapshot" : "Generar snapshot"}
        </button>
      </form>
    </div>
  )
}
