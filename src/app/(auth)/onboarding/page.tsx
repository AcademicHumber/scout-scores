"use client"

import { useActionState } from "react"
import { createDistrito, aceptarInvitacion } from "./actions"
import messages from "@/messages/es.json"

const m = messages.auth.onboarding
const errors = m.errors

function errorMessage(code: string | undefined): string | null {
  if (!code) return null
  if (code === "SLUG_TAKEN") return errors.slugTaken
  if (code === "INVITACION_INVALIDA") return errors.invitacionInvalida
  if (code === "EMAIL_NO_COINCIDE") return errors.emailNoCoincide
  return code
}

export default function OnboardingPage() {
  const [createState, createAction, createPending] = useActionState(createDistrito, null)
  const [joinState, joinAction, joinPending] = useActionState(aceptarInvitacion, null)

  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">{m.title}</h1>
        <p className="mt-1 text-sm text-white/70">{m.subtitle}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Crear nuevo Distrito */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {m.createDistrito.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{m.createDistrito.description}</p>
          </div>

          <form action={createAction} className="space-y-3">
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

            {createState?.error && (
              <p className="text-sm text-red-600">{errorMessage(createState.error)}</p>
            )}

            <button
              type="submit"
              disabled={createPending}
              className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 transition-colors"
            >
              {createPending ? "Creando..." : m.createDistrito.submit}
            </button>
          </form>
        </div>

        {/* Código de invitación */}
        <div className="bg-white rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {m.joinDistrito.title}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{m.joinDistrito.description}</p>
          </div>

          <form action={joinAction} className="space-y-3">
            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                {m.joinDistrito.tokenLabel}
              </label>
              <input
                id="token"
                name="token"
                type="text"
                required
                className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            {joinState?.error && (
              <p className="text-sm text-red-600">{errorMessage(joinState.error)}</p>
            )}

            <button
              type="submit"
              disabled={joinPending}
              className="w-full rounded-lg border border-brand px-4 py-3 text-sm font-medium text-brand hover:bg-brand-light disabled:opacity-50 transition-colors"
            >
              {joinPending ? "Uniéndome..." : m.joinDistrito.submit}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
