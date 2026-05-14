import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/auth-helpers"
import { MembershipRefresher } from "./MembershipRefresher"

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (user?.activeRole === "JUEZ") {
    redirect("/juez/eventos")
  }

  if (user?.activeRole === "JEFE_PATRULLA" || user?.activeRole === "ESPECTADOR") {
    redirect("/eventos")
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

      {user?.activeRole === "ADMIN" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/admin"
            className="rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-sm font-medium text-gray-500">Panel</p>
            <p className="mt-1 text-xl font-bold text-brand">Administración</p>
            <p className="mt-1 text-sm text-gray-500">Gestionar distrito, grupos, eventos y miembros</p>
          </Link>
          <Link
            href="/eventos"
            className="rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <p className="text-sm font-medium text-gray-500">Ver</p>
            <p className="mt-1 text-xl font-bold text-brand">Eventos publicados</p>
            <p className="mt-1 text-sm text-gray-500">Resultados y rankings disponibles al público</p>
          </Link>
        </div>
      )}

      {!user?.activeRole && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Tu cuenta aún no tiene un rol asignado en este distrito. Pedile al administrador que te invite.
        </div>
      )}

      <Link
        href="/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm text-gray-600 shadow-sm hover:bg-gray-50 hover:text-gray-900 transition-colors"
      >
        <svg className="h-4 w-4 text-[#622599]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        Ver documentación
        <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </Link>
    </div>
  )
}
