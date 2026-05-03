"use client"

import { useActionState, useEffect, useState } from "react"
import { updateMetadataAction } from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos

type Props = {
  eventoId: string
  initialNombre: string
  initialDescripcion: string | null
  initialLugar: string | null
  initialFechaInicio: string
  initialFechaFin: string | null
}

export function EventoMetadataForm({
  eventoId,
  initialNombre,
  initialDescripcion,
  initialLugar,
  initialFechaInicio,
  initialFechaFin,
}: Props) {
  const [state, action, pending] = useActionState(updateMetadataAction, {})
  const [saved, setSaved] = useState(false)
  const [multiDia, setMultiDia] = useState(!!initialFechaFin)

  useEffect(() => {
    if (state && !state.error && !state.fieldErrors) {
      setSaved(true)
      const t = setTimeout(() => setSaved(false), 2000)
      return () => clearTimeout(t)
    }
  }, [state])

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={eventoId} />

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
          defaultValue={initialNombre}
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
          defaultValue={initialDescripcion ?? ""}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.lugar}</label>
        <input
          name="lugar"
          type="text"
          maxLength={200}
          defaultValue={initialLugar ?? ""}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.fechaInicio}</label>
        <input
          name="fechaInicio"
          type="date"
          required
          defaultValue={initialFechaInicio}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div className="flex items-center gap-2">
        <input
          id="multiDiaEdit"
          type="checkbox"
          checked={multiDia}
          onChange={(e) => setMultiDia(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand"
        />
        <label htmlFor="multiDiaEdit" className="text-sm text-gray-700">{m.form.multiDiaToggle}</label>
      </div>

      {multiDia && (
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.fechaFin}</label>
          <input
            name="fechaFin"
            type="date"
            defaultValue={initialFechaFin ?? ""}
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
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Guardando..." : saved ? "Guardado ✓" : m.form.saveMetadata}
      </button>
    </form>
  )
}
