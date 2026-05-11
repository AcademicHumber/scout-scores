"use client"

import { useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import Link from "next/link"
import { PasswordInput } from "@/components/auth/PasswordInput"
import messages from "@/messages/es.json"

const m = messages.auth.login

function getErrorMessage(code: string | null): string | null {
  if (!code) return null
  if (code === "CredentialsSignin") return m.errors.credentialsSignin
  if (code === "AccessDenied") return m.errors.locked
  return m.errors.generic
}

export function CredentialsLoginForm() {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const searchParams = useSearchParams()
  const errorCode = searchParams.get("error")

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await signIn("credentials", {
        email: fd.get("email") as string,
        password: fd.get("password") as string,
        redirect: false,
      })
      if (result?.error) {
        router.replace(`/login?error=${result.error}`)
      } else {
        router.replace("/dashboard")
      }
    })
  }

  const errorMsg = getErrorMessage(errorCode)

  return (
    <div className="space-y-5">
      <form onSubmit={handleSubmit} className="space-y-4">
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
          autoComplete="current-password"
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
          {isPending ? "Ingresando..." : m.submitButton}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-gray-200" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-white px-2 text-gray-400">{m.orSeparator}</span>
        </div>
      </div>

      <p className="text-center text-sm text-gray-500">
        {m.noAccountPrompt}{" "}
        <Link href="/registro" className="font-medium text-brand hover:underline">
          {m.registerLink}
        </Link>
      </p>
    </div>
  )
}
