"use client"
import { useActionState } from "react"
import { updateDistrito } from "./actions"
import messages from "@/messages/es.json"

interface Props {
  nombre: string
  slug: string
}

export function DistritoForm({ nombre, slug }: Props) {
  const [state, action, pending] = useActionState(updateDistrito, null)

  return (
    <form action={action} className="space-y-5">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {messages.admin.distrito.nombreLabel}
        </label>
        <input
          name="nombre"
          defaultValue={nombre}
          required
          minLength={2}
          maxLength={100}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {messages.admin.distrito.slugLabel}
        </label>
        <input
          value={slug}
          readOnly
          disabled
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500"
        />
      </div>
      {state?.error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      {state?.success && (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Cambios guardados correctamente
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Guardando..." : messages.admin.distrito.submit}
      </button>
    </form>
  )
}
