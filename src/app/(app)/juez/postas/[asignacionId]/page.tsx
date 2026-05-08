import Link from "next/link"
import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { listPatrullasParaPosta } from "@/repositories/score-sheet.repo"
import { BusinessError } from "@/lib/errors"

export default async function JuezPostaPage({
  params,
}: {
  params: Promise<{ asignacionId: string }>
}) {
  const { asignacionId } = await params
  const org = await requireRole(["JUEZ", "ADMIN"])

  let patrullas
  try {
    patrullas = await listPatrullasParaPosta(org.organizationId, asignacionId, org.userId, org.role === "ADMIN")
  } catch (err) {
    if (err instanceof BusinessError && (err.code === "ASIGNACION_NO_ENCONTRADA" || err.code === "FORBIDDEN_NO_ASIGNADO")) {
      notFound()
    }
    throw err
  }

  const enviadas = patrullas.filter((p) => p.scoreSheet?.estado === "ENVIADA").length
  const borradores = patrullas.filter((p) => p.scoreSheet?.estado === "BORRADOR").length

  return (
    <div>
      <div className="mb-4">
        <Link href="/juez/eventos" className="text-sm text-brand hover:underline">
          ← Mis eventos
        </Link>
      </div>

      <div className="mb-2 flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">Patrullas</h1>
        <span className="text-sm text-gray-500">
          {enviadas}/{patrullas.length} enviadas
          {borradores > 0 && ` · ${borradores} borrador${borradores !== 1 ? "es" : ""}`}
        </span>
      </div>

      {patrullas.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-500">No hay patrullas en este evento.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {patrullas.map((row) => {
            const sheet = row.scoreSheet
            const estadoBadge =
              !sheet
                ? { label: "Sin cargar", cls: "bg-gray-100 text-gray-500" }
                : sheet.estado === "ENVIADA"
                ? { label: "Enviada", cls: "bg-green-100 text-green-700" }
                : { label: "Borrador", cls: "bg-amber-100 text-amber-700" }

            return (
              <li key={row.patrullaId}>
                <Link
                  href={`/juez/postas/${asignacionId}/${row.patrullaId}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3 hover:border-brand hover:shadow-sm transition-all min-h-[56px]"
                >
                  <div>
                    <p className="font-medium text-gray-900">{row.patrullaNombre}</p>
                    <p className="text-sm text-gray-400">{row.grupoScoutNombre}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {sheet?.estado === "ENVIADA" && sheet.puntajeMostrado != null && (
                      <span className="text-base font-semibold text-gray-800">
                        {Number(sheet.puntajeMostrado).toFixed(2)}
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${estadoBadge.cls}`}>
                      {estadoBadge.label}
                    </span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
