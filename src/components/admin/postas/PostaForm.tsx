"use client"

import { useActionState, useState } from "react"
import { createPostaAction } from "@/app/(app)/admin/postas/actions"
import messages from "@/messages/es.json"

const m = messages.admin.postas

type Material = { nombre: string; cantidad?: string }

export function PostaForm() {
  const [state, action, pending] = useActionState(createPostaAction, {})
  const [materiales, setMateriales] = useState<Material[]>([])

  function addMaterial() {
    setMateriales((prev) => [...prev, { nombre: "" }])
  }

  function updateMaterial(idx: number, field: keyof Material, value: string) {
    setMateriales((prev) => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }

  function removeMaterial(idx: number) {
    setMateriales((prev) => prev.filter((_, i) => i !== idx))
  }

  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</div>
      )}

      <input type="hidden" name="materiales" value={JSON.stringify(materiales)} />

      {/* Nombre */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {m.fields.nombre} <span className="text-red-500">*</span>
        </label>
        <input
          name="nombre"
          required
          maxLength={100}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        {state.fieldErrors?.nombre && (
          <p className="mt-0.5 text-xs text-red-600">{state.fieldErrors.nombre[0]}</p>
        )}
      </div>

      {/* Descripción */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.fields.descripcion}</label>
        <textarea
          name="descripcion"
          rows={3}
          maxLength={1000}
          className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Duración */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.fields.duracionMinutos}</label>
        <input
          name="duracionMinutos"
          type="number"
          min={1}
          max={480}
          className="w-full sm:w-32 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Materiales */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">{m.fields.materiales}</label>
        <div className="space-y-2">
          {materiales.map((mat, idx) => (
            <div key={idx} className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
              <input
                value={mat.nombre}
                onChange={(e) => updateMaterial(idx, "nombre", e.target.value)}
                placeholder={m.fields.materialNombre}
                maxLength={100}
                className="flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
              />
              <div className="flex gap-2">
                <input
                  value={mat.cantidad ?? ""}
                  onChange={(e) => updateMaterial(idx, "cantidad", e.target.value)}
                  placeholder={m.fields.materialCantidad}
                  maxLength={50}
                  className="flex-1 sm:w-40 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <button
                  type="button"
                  onClick={() => removeMaterial(idx)}
                  className="shrink-0 rounded px-2 text-red-400 hover:bg-red-50"
                >✕</button>
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={addMaterial}
            className="text-sm text-brand hover:underline"
          >
            {m.fields.agregarMaterial}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
      >
        {pending ? "Guardando..." : "Crear posta"}
      </button>
    </form>
  )
}
