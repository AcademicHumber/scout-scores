"use client"

import { useActionState } from "react"
import { PasswordInput } from "@/components/auth/PasswordInput"
import { setPasswordAction } from "./actions"
import messages from "@/messages/es.json"

const m = messages.auth.perfil.seguridad.setPassword
const errMsgs = m.errors as Record<string, string>

export function SetPasswordForm() {
  const [state, dispatch, isPending] = useActionState(setPasswordAction, null)

  if (state && "success" in state) {
    return (
      <p className="text-sm text-green-700 bg-green-50 rounded-lg px-4 py-3">
        {m.success}
      </p>
    )
  }

  const errorMsg = state && "error" in state ? (errMsgs[state.error] ?? m.errors.generic) : null

  return (
    <form action={dispatch} className="space-y-4 max-w-sm">
      <PasswordInput
        id="password"
        name="password"
        label={m.passwordLabel}
        hint="Mínimo 8 caracteres"
        autoComplete="new-password"
        required
      />

      {errorMsg && (
        <p className="text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-60 transition-colors"
      >
        {isPending ? "Guardando..." : m.submit}
      </button>
    </form>
  )
}
