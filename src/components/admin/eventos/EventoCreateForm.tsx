"use client"

import { useActionState, useState } from "react"
import { createEventoAction } from "@/app/(app)/admin/eventos/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos

export function EventoCreateForm() {
  const [state, action, pending] = useActionState(createEventoAction, {})
  const [multiDia, setMultiDia] = useState(false)

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.nombre}</label>
        <input
          name="nombre"
          type="text"
          required
          maxLength={100}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {state.fieldErrors?.nombre && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.nombre[0]}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.descripcion}</label>
        <textarea
          name="descripcion"
          rows={3}
          maxLength={1000}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.lugar}</label>
        <input
          name="lugar"
          type="text"
          maxLength={200}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.fechaInicio}</label>
        <input
          name="fechaInicio"
          type="date"
          required
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {state.fieldErrors?.fechaInicio && (
          <p className="mt-1 text-xs text-red-600">{state.fieldErrors.fechaInicio[0]}</p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          id="multiDia"
          type="checkbox"
          checked={multiDia}
          onChange={(e) => setMultiDia(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <label htmlFor="multiDia" className="text-sm text-gray-700">{m.form.multiDiaToggle}</label>
      </div>

      {multiDia && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.fechaFin}</label>
          <input
            name="fechaFin"
            type="date"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {state.fieldErrors?.fechaFin && (
            <p className="mt-1 text-xs text-red-600">{state.fieldErrors.fechaFin[0]}</p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Creando..." : m.form.submit}
      </button>
    </form>
  )
}
