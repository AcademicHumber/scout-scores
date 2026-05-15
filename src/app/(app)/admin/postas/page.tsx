import { requireRole } from "@/lib/auth-helpers"
import { listPostas } from "@/repositories/posta.repo"
import Link from "next/link"
import messages from "@/messages/es.json"

const m = messages.admin.postas

export default async function PostasPage() {
  const org = await requireRole(["ADMIN"])
  const postas = await listPostas(org.organizationId)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
          <p className="mt-1 text-sm text-gray-500 pr-2">{m.subtitle}</p>
        </div>
        <Link
          href="/admin/postas/nueva"
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
        >
          {m.nuevoCTA}
        </Link>
      </div>

      {postas.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-500">
          {m.empty}
        </div>
      ) : (
        <div className="space-y-2">
          {postas.map((p) => (
            <Link
              key={p.id}
              href={`/admin/postas/${p.id}`}
              className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm hover:border-brand/40 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{p.nombre}</p>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-500">
                  {p.template ? (
                    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">{p.template.nombre}</span>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">{m.fields.plantillaSinAsignar}</span>
                  )}
                  {p.duracionMinutos && <span>{p.duracionMinutos} min</span>}
                </div>
              </div>
              <div className="ml-4 shrink-0 text-right text-xs text-gray-400">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                  {p._count.asignaciones} evento{p._count.asignaciones !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
