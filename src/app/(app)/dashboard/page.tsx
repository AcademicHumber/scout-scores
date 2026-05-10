import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-helpers"
import { MembershipRefresher } from "./MembershipRefresher"

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (user?.activeRole === "JUEZ") {
    redirect("/juez/eventos")
  }

  const hasMemberships = (user?.memberships?.length ?? 0) > 0

  return (
    <div className="space-y-6">
      {/* Si el JWT aún no tiene memberships (caso post-onboarding), forzar refresh */}
      {!hasMemberships && <MembershipRefresher />}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Bienvenido, {user?.name ?? "usuario"}
        </h1>
        {user?.activeOrganizationNombre && (
          <p className="mt-1 text-gray-600">
            Distrito: <span className="font-medium">{user.activeOrganizationNombre}</span>
          </p>
        )}
        {user?.activeRole && (
          <p className="text-sm text-gray-500">Rol: {user.activeRole}</p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-500 text-sm">
        El dashboard de eventos llegará en el Plan 2.
      </div>
    </div>
  )
}
