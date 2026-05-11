import { auth, signIn } from "@/auth"
import { redirect } from "next/navigation"
import { Suspense } from "react"
import { CredentialsLoginForm } from "./CredentialsLoginForm"
import messages from "@/messages/es.json"

const m = messages.auth.login

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  async function loginConGoogle() {
    "use server"
    await signIn("google", { redirectTo: "/dashboard" })
  }

  return (
    <div className="w-full max-w-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
          <p className="text-sm text-gray-500">{m.subtitle}</p>
        </div>

        {/* Form de credenciales — necesita Suspense por useSearchParams */}
        <Suspense>
          <CredentialsLoginForm />
        </Suspense>

        {/* Botón Google */}
        <form action={loginConGoogle}>
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12.545 10.239v3.821h5.445c-.712 2.315-2.647 3.972-5.445 3.972a6.033 6.033 0 110-12.064c1.498 0 2.866.549 3.921 1.453l2.814-2.814A9.969 9.969 0 0012.545 2C7.021 2 2.543 6.477 2.543 12s4.478 10 10.002 10c8.396 0 10.249-7.85 9.426-11.748l-9.426-.013z"
                fill="currentColor"
              />
            </svg>
            {m.googleButton}
          </button>
        </form>
      </div>
    </div>
  )
}
