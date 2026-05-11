"use client"

import { useActionState, useEffect } from "react"
import Link from "next/link"
import { PasswordInput } from "@/components/auth/PasswordInput"
import { signupAction } from "./actions"
import messages from "@/messages/es.json"

const m = messages.auth.signup
const errors = m.errors as Record<string, string>

export function CredentialsSignupForm() {
  const [state, dispatch, isPending] = useActionState(signupAction, null)

  const errorMsg = state?.error
    ? (errors[state.error] ?? errors.generic)
    : null

  return (
    <form action={dispatch} className="space-y-4">
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
