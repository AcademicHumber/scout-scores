"use client"

import { useActionState } from "react"
import { createDistrito } from "../actions"
import messages from "@/messages/es.json"

const m = messages.auth.onboarding
const errors = m.errors

function errorMessage(code: string | undefined): string | null {
  if (!code) return null
  if (code === "SLUG_TAKEN") return errors.slugTaken
  return code
}

export default function CrearDistritoPage() {
  const [state, action, pending] = useActionState(createDistrito, null)

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-white">{m.createDistrito.title}</h1>
        <p className="mt-1 text-sm text-white/70">{m.createDistrito.description}</p>
      </div>

      <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
        <form action={action} className="space-y-3">
          <div>
            <label htmlFor="nombre" className="block text-sm font-medium text-gray-700">
              {m.createDistrito.nombreLabel}
            </label>
            <input
              id="nombre"
              name="nombre"
              type="text"
              required
              minLength={2}
              maxLength={100}
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700">
              {m.createDistrito.slugLabel}
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              required
              minLength={2}
              maxLength={50}
              pattern="[a-z0-9\-]+"
              placeholder="mi-distrito"
              className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>

          {state?.error && (
            <p className="text-sm text-red-600">{errorMessage(state.error)}</p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 transition-colors"
          >
            {pending ? "Creando..." : m.createDistrito.submit}
          </button>
        </form>
      </div>
    </div>
  )
}
