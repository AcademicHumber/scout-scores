import { requireOrg } from "@/lib/auth-helpers"
import { listEventos } from "@/repositories/evento.repo"
import Link from "next/link"

function formatFecha(iso: Date): string {
  return new Date(iso).toLocaleDateString("es-BO", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  })
}

export default async function EventosPublicosPage() {
  const org = await requireOrg()

  const eventos = await listEventos(org.organizationId, { estados: ["PUBLICADO"] })

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Eventos</h1>
        <p className="mt-1 text-gray-500">Resultados publicados del distrito</p>
      </div>

      {eventos.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="font-semibold text-gray-500">Aún no hay eventos publicados.</p>
          <p className="mt-1 text-sm text-gray-400">Los resultados aparecerán aquí cuando el admin publique un evento.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {eventos.map((evento) => (
            <Link
              key={evento.id}
              href={`/eventos/${evento.id}/resultados`}
              className="flex items-center justify-between rounded-xl border bg-white p-5 shadow-sm hover:border-brand/40 hover:shadow-md transition-all group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-brand transition-colors">
                  {evento.nombre}
                </p>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-sm text-gray-500">
                  <span>{formatFecha(evento.fechaInicio)}</span>
                  {evento.lugar && <span>· {evento.lugar}</span>}
                </div>
              </div>
              <div className="ml-4 flex-shrink-0">
                <span className="rounded-full bg-blue-100 px-3 py-0.5 text-sm font-medium text-blue-700">
                  Ver resultados →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
