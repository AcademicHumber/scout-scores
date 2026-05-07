import Link from "next/link"
import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { listPostasParaJuez } from "@/repositories/score-sheet.repo"

export default async function JuezEventoPage({
  params,
}: {
  params: Promise<{ eventoId: string }>
}) {
  const { eventoId } = await params
  const org = await requireRole(["JUEZ", "ADMIN"])
  const postas = await listPostasParaJuez(org.organizationId, eventoId, org.userId, org.role === "ADMIN")

  if (postas === null) notFound()

  return (
    <div>
      <div className="mb-6">
        <Link href="/juez/eventos" className="text-sm text-brand hover:underline">
          ← Mis eventos
        </Link>
        <h1 className="text-xl font-bold text-gray-900 mt-2">Mis postas en este evento</h1>
      </div>

      {postas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No tenés postas asignadas en este evento.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {postas.map((posta) => (
            <li key={posta.asignacionId}>
              <Link
                href={`/juez/postas/${posta.asignacionId}`}
                className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-brand hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900">{posta.postaNombre}</p>
                    <p className="text-sm text-gray-500 mt-0.5">{posta.actividadNombre}</p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    {posta.plantillaModo && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        {posta.plantillaModo === "CRITERIOS" ? "Por criterios" : "Puntaje único"}
                      </span>
                    )}
                    <span className="text-sm font-medium text-gray-700">
                      {posta.enviadas}/{posta.totalPatrullas} enviadas
                    </span>
                    {posta.borradores > 0 && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        {posta.borradores} borrador{posta.borradores !== 1 ? "es" : ""}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
