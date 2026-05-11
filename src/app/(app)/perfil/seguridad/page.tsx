import { requireUser } from "@/lib/auth-helpers"
import { findUserByEmailRaw } from "@/repositories/auth.repo"
import { SetPasswordForm } from "./SetPasswordForm"
import messages from "@/messages/es.json"

const m = messages.auth.perfil.seguridad

export default async function SeguridadPage() {
  const user = await requireUser()
  const dbUser = await findUserByEmailRaw(user.email!)

  const tienePassword = Boolean(dbUser?.passwordHash)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
        <p className="text-sm text-gray-500 mt-1">{m.subtitle}</p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-base font-semibold text-gray-900">{m.setPassword.title}</h2>
        {tienePassword ? (
          <p className="text-sm text-gray-600">{m.hasPassword}</p>
        ) : (
          <SetPasswordForm />
        )}
      </div>
    </div>
  )
}
