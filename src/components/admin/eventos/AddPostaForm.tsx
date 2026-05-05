"use client"

import { useActionState } from "react"
import { addPostaAction } from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos.postas

type Props = { actividadId: string }

export function AddPostaForm({ actividadId }: Props) {
  const [state, action, pending] = useActionState(addPostaAction, {})

  return (
    <form action={action} className="mt-2 space-y-1">
      <input type="hidden" name="actividadId" value={actividadId} />

      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex gap-2">
        <input
          name="nombre"
          required
          minLength={2}
          maxLength={100}
          placeholder={m.addTitle}
          className="flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <input
          name="weight"
          type="number"
          defaultValue="1"
          min="0.01"
          max="999.99"
          step="0.01"
          className="w-20 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          title={m.row.weight}
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "..." : m.addSubmit}
        </button>
      </div>
    </form>
  )
}
