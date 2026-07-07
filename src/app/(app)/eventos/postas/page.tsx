import { requireRole } from "@/lib/auth-helpers"
import { listPostasCreadasPor } from "@/repositories/posta.repo"
import Link from "next/link"
import messages from "@/messages/es.json"

const m = messages.eventos.misPostas

export default async function MisPostasPage() {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const postas = await listPostasCreadasPor(org.organizationId, org.userId)

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <Link href="/eventos" className="text-sm text-gray-500 hover:text-gray-700">
          ← Eventos
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{m.title}</h1>
        <p className="mt-1 text-sm text-gray-500">{m.subtitle}</p>
      </div>

      {postas.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white px-5 py-4 text-sm text-gray-400">
          {m.empty}
        </p>
      ) : (
        <div className="space-y-3">
          {postas.map((posta) => (
            <Link
              key={posta.id}
              href={`/eventos/postas/${posta.id}`}
              className="flex items-center justify-between rounded-xl border bg-white p-5 shadow-sm hover:border-brand/40 hover:shadow-md transition-all group"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-brand transition-colors">
                  {posta.nombre}
                </p>
                {posta.descripcion && (
                  <p className="mt-0.5 truncate text-sm text-gray-500">{posta.descripcion}</p>
                )}
              </div>
              <span className="ml-4 shrink-0 rounded-full bg-gray-100 px-3 py-0.5 text-sm text-gray-600">
                {posta._count.asignaciones === 1
                  ? m.asignaciones.replace("{{count}}", "1")
                  : m.asignacionesPlural.replace("{{count}}", String(posta._count.asignaciones))}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
