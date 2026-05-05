"use client"

import { useActionState } from "react"
import { addPatrullaAction } from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos.patrullas

const CATEGORIAS = ["LOBATO", "EXPLORADOR", "PIONERO", "ROVER"] as const

type Props = {
  eventoId: string
  grupos: Array<{ id: string; nombre: string }>
}

export function AddPatrullaForm({ eventoId, grupos }: Props) {
  const [state, action, pending] = useActionState(addPatrullaAction, {})

  return (
    <form action={action} className="mt-2 space-y-1">
      <input type="hidden" name="eventoId" value={eventoId} />

      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input
          name="nombre"
          required
          minLength={2}
          maxLength={80}
          placeholder={m.row.nombre}
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <select
          name="grupoScoutId"
          required
          className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">{m.row.grupoScout}</option>
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre}</option>
          ))}
        </select>
        <select
          name="categoria"
          className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">{m.row.categoriaPlaceholder}</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{m.categoria[c]}</option>
          ))}
        </select>
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
