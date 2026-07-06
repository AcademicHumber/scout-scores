"use client"

import { useActionState } from "react"
import { addActividadAction } from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos

type Template = { id: string; nombre: string; archivedAt: Date | null }

type Props = { eventoId: string; templates: Template[] }

export function AddActividadForm({ eventoId, templates }: Props) {
  const [state, action, pending] = useActionState(addActividadAction, {})

  return (
    <form action={action} className="space-y-3 rounded-lg border bg-gray-50 p-4">
      <h4 className="text-sm font-semibold text-gray-700">{m.actividades.addTitle}</h4>

      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {state.error}
        </div>
      )}

      <input type="hidden" name="eventoId" value={eventoId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{m.actividades.row.nombre}</label>
          <input
            name="nombre"
            type="text"
            required
            maxLength={100}
            className="w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {state.fieldErrors?.nombre && (
            <p className="mt-0.5 text-xs text-red-600">{state.fieldErrors.nombre[0]}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{m.actividades.row.tipo}</label>
          <select
            name="tipo"
            required
            className="w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          >
            {(["COMPETICION", "CONSTRUCCION", "COCINA", "OTRO"] as const).map((t) => (
              <option key={t} value={t}>{m.actividades.tipo[t]}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{m.actividades.row.peso}</label>
          <input
            name="pesoRelativo"
            type="number"
            required
            min="0.01"
            max="100"
            step="0.01"
            className="w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          />
          {state.fieldErrors?.pesoRelativo && (
            <p className="mt-0.5 text-xs text-red-600">{state.fieldErrors.pesoRelativo[0]}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{m.actividades.row.descripcion}</label>
          <input
            name="descripcion"
            type="text"
            maxLength={1000}
            className="w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">{m.actividades.row.plantilla}</label>
          <select
            name="templateId"
            className="w-full rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          >
            <option value="">{m.actividades.row.plantillaSinAsignar}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "..." : m.actividades.addSubmit}
      </button>
    </form>
  )
}
