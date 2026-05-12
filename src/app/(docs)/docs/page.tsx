import { RoleCard } from "@/components/docs/RoleCard"
import { docRoles } from "@/components/docs/DocsNav"

export const metadata = {
  title: "Documentación — Puntajes Scout",
  description: "Guías de uso del sistema de puntajes para eventos scouts.",
}

export default function DocsHomePage() {
  return (
    <div>
      {/* Hero */}
      <div className="mb-10">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[#f3edf7] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#622599]">
          Sistema de puntajes
        </div>
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-gray-900">
          Documentación de<br />
          <span className="text-[#622599]">Puntajes Scout</span>
        </h1>
        <p className="max-w-xl text-base leading-relaxed text-gray-500">
          Guías de uso para cada rol del sistema. Elegí tu rol para ver cómo empezar,
          qué podés hacer y cómo aprovechar cada función durante el evento.
        </p>
      </div>

      {/* Divider */}
      <div className="mb-8 flex items-center gap-3">
        <div className="h-px flex-1 bg-gray-100" />
        <span className="text-xs font-medium uppercase tracking-widest text-gray-400">Elegí tu rol</span>
        <div className="h-px flex-1 bg-gray-100" />
      </div>

      {/* Role cards grid */}
      <div className="grid gap-4 sm:grid-cols-2">
        {docRoles.map((role) => (
          <RoleCard key={role.href} role={role} />
        ))}
      </div>

      {/* Footer note */}
      <div className="mt-12 rounded-xl border border-dashed border-gray-200 px-6 py-5 text-center">
        <p className="text-sm text-gray-400">
          ¿No tenés cuenta todavía?{" "}
          <a href="/registro" className="font-medium text-[#622599] hover:underline">
            Crear cuenta
          </a>{" "}
          o contactá al administrador de tu distrito para recibir una invitación.
        </p>
      </div>
    </div>
  )
}
