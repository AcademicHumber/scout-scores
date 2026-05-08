import Link from "next/link"
import { requireRole } from "@/lib/auth-helpers"
import { listEventosParaJuez } from "@/repositories/score-sheet.repo"

export default async function JuezEventosPage() {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const eventos = await listEventosParaJuez(org.organizationId, org.userId, org.role === "ADMIN")

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 mb-1">Mis eventos</h1>
      <p className="text-sm text-gray-500 mb-6">Eventos activos donde tenés postas asignadas</p>

      {eventos.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No tenés postas asignadas en eventos activos.</p>
          <p className="text-sm text-gray-400 mt-1">Avisale al admin si pensás que es un error.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {eventos.map((evento) => (
            <li key={evento.id}>
              <Link
                href={`/juez/eventos/${evento.id}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-brand hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{evento.nombre}</p>
                    {evento.lugar && (
                      <p className="text-sm text-gray-500 mt-0.5">{evento.lugar}</p>
                    )}
                    <p className="text-sm text-gray-400 mt-0.5">
                      {new Date(evento.fechaInicio).toLocaleDateString("es-AR", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-brand/10 px-3 py-1 text-sm font-medium text-brand">
                    {evento.postasCount === 1
                      ? "1 posta"
                      : `${evento.postasCount} postas`}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
