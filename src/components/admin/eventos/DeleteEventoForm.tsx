"use client"

import { useActionState, useState } from "react"
import { deleteEventoAction } from "@/app/(app)/admin/eventos/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos

type Props = { eventoId: string; nombre: string }

export function DeleteEventoForm({ eventoId, nombre }: Props) {
  const [state, action, pending] = useActionState(deleteEventoAction, {})
  const [confirm, setConfirm] = useState(false)

  if (!confirm) {
    return (
      <button
        type="button"
        onClick={() => setConfirm(true)}
        className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        {m.detail.deleteButton}
      </button>
    )
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="id" value={eventoId} />
      <p className="text-sm text-gray-700">
        {m.detail.deleteConfirm.replace("{{nombre}}", nombre)}
      </p>
      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {pending ? "Eliminando..." : "Sí, eliminar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(false)}
          className="rounded-lg border px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
