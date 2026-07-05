"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { PasswordInput } from "@/components/auth/PasswordInput"
import { signupAction } from "./actions"
import messages from "@/messages/es.json"

const m = messages.auth.signup
const errors = m.errors as Record<string, string>

// Duplica las condiciones de signupSchema (src/lib/auth-credentials.ts) para dar feedback
// inmediato sin ir al servidor. Los mismos códigos de error (nameRequired/emailInvalid/
// passwordTooShort) se usan del lado del servidor, así el mensaje es idéntico sin importar
// quién frena el submit — la validación real y autoritativa sigue siendo la del servidor.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD_LENGTH = 8

function validateClientSide(name: string, email: string, password: string): string | null {
  if (name.trim().length === 0) return "nameRequired"
  if (!EMAIL_RE.test(email)) return "emailInvalid"
  if (password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort"
  return null
}

export function CredentialsSignupForm() {
  const [state, dispatch, isPending] = useActionState(signupAction, null)
  // Inputs controlados: React resetea los campos no controlados de un <form action>
  // apenas la action termina, incluso cuando devuelve un error de validación en vez de
  // lanzar — sin este estado, un error obliga a reescribir todo el formulario.
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [clientError, setClientError] = useState<string | null>(null)

  const errorCode = clientError ?? state?.error
  const errorMsg = errorCode ? (errors[errorCode] ?? errors.generic) : null

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const code = validateClientSide(name, email, password)
    if (code) {
      e.preventDefault()
      setClientError(code)
    } else {
      setClientError(null)
    }
  }

  return (
    <form action={dispatch} onSubmit={handleSubmit} noValidate className="space-y-4">
      <div className="space-y-1">
        <label htmlFor="name" className="block text-sm font-medium text-gray-700">
          {m.nameLabel}
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value)
            setClientError(null)
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <div className="space-y-1">
        <label htmlFor="email" className="block text-sm font-medium text-gray-700">
          {m.emailLabel}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setClientError(null)
          }}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      <PasswordInput
        id="password"
        name="password"
        label={m.passwordLabel}
        hint={m.passwordHint}
        autoComplete="new-password"
        required
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setClientError(null)
        }}
      />

      {errorMsg && (
        <p className="text-sm text-red-600" role="alert">
          {errorMsg}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand/90 disabled:opacity-60 transition-colors"
      >
        {isPending ? "Creando cuenta..." : m.submitButton}
      </button>

      <p className="text-center text-sm text-gray-500">
        {m.haveAccountPrompt}{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          {m.loginLink}
        </Link>
      </p>
    </form>
  )
}
