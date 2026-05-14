"use client"

import { startTransition, useActionState, useState } from "react"
import { unirseComoEspectador, aceptarInvitacion } from "./actions"
import { SignOutButton } from "@/components/auth/SignOutButton"
import messages from "@/messages/es.json"

const m = messages.auth.onboarding
const s = m.selectDistrito
const errors = m.errors

type Org = { id: string; nombre: string; slug: string }

function errorMessage(code: string | undefined): string | null {
  if (!code) return null
  if (code === "SLUG_TAKEN") return errors.slugTaken
  if (code === "INVITACION_INVALIDA") return errors.invitacionInvalida
  if (code === "EMAIL_NO_COINCIDE") return errors.emailNoCoincide
  if (code === "ORG_NO_ENCONTRADA") return errors.orgNoEncontrada
  if (code === "ORG_REQUERIDA") return errors.orgRequerida
  return code
}

export function OnboardingClient({ orgs }: { orgs: Org[] }) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [showTokenForm, setShowTokenForm] = useState(false)

  const [joinState, joinDispatch, joinPending] = useActionState(unirseComoEspectador, null)
  const [tokenState, tokenAction, tokenPending] = useActionState(aceptarInvitacion, null)

  return (
    <div className="w-full max-w-lg space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">{s.title}</h1>
        <p className="mt-1 text-sm text-white/70">{s.subtitle}</p>
      </div>

      {/* District list */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        {orgs.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="font-medium text-gray-700">{s.empty}</p>
            <p className="mt-1 text-sm text-gray-400">{s.emptyHint}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {orgs.map((org) => {
              const isThis = selectedOrgId === org.id
              return (
                <li key={org.id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{org.nombre}</p>
                    <p className="text-xs text-gray-400">@{org.slug}</p>
                  </div>
                  <button
                    type="button"
                    disabled={joinPending}
                    onClick={() => {
                      setSelectedOrgId(org.id)
                      startTransition(() => {
                        const fd = new FormData()
                        fd.set("organizationId", org.id)
                        joinDispatch(fd)
                      })
                    }}
                    className="shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50 transition-colors"
                  >
                    {joinPending && isThis ? s.joining : s.joinButton}
                  </button>
                </li>
              )
            })}
          </ul>
        )}

        {joinState?.error && (
          <p className="px-5 py-3 text-sm text-red-600 border-t border-gray-100">
            {errorMessage(joinState.error)}
          </p>
        )}
      </div>

      {/* Invitation token toggle */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTokenForm((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {s.hasCode}
          <svg
            className={`h-4 w-4 text-gray-400 transition-transform ${showTokenForm ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showTokenForm && (
          <form action={tokenAction} className="px-5 pb-5 space-y-3 border-t border-gray-100">
            <div className="pt-4">
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

            {tokenState?.error && (
              <p className="text-sm text-red-600">{errorMessage(tokenState.error)}</p>
            )}

            <button
              type="submit"
              disabled={tokenPending}
              className="w-full rounded-lg border border-brand px-4 py-2.5 text-sm font-medium text-brand hover:bg-brand-light disabled:opacity-50 transition-colors"
            >
              {tokenPending ? "Procesando..." : m.joinDistrito.submit}
            </button>
          </form>
        )}
      </div>

      {/* Sign out */}
      <div className="text-center">
        <SignOutButton
          label="Cerrar sesión"
          className="text-sm text-white/60 hover:text-white/90 transition-colors"
        />
      </div>
    </div>
  )
}
