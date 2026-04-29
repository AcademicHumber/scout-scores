"use client"
import { useActionState } from "react"
import { createGrupo } from "./actions"
import messages from "@/messages/es.json"

export function GrupoCreateForm() {
  const [state, action, pending] = useActionState(createGrupo, null)

  return (
    <form action={action} className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">{messages.admin.grupos.createTitle}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {messages.admin.grupos.nombreLabel}
          </label>
          <input
            name="nombre"
            required
            minLength={2}
            maxLength={100}
            placeholder="Ej: Tropa San Martín"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {messages.admin.grupos.slugLabel}
          </label>
          <input
            name="slug"
            required
            minLength={2}
            maxLength={50}
            pattern="[a-z0-9-]+"
            placeholder="ej: tropa-san-martin"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      </div>
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Grupo creado correctamente</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Creando..." : messages.admin.grupos.submit}
      </button>
    </form>
  )
}
