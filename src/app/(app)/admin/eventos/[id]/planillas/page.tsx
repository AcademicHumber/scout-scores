import Link from "next/link"
import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth-helpers"
import { listPlanillasPorEventoAdmin } from "@/repositories/score-sheet.repo"
import { findEventoById } from "@/repositories/evento.repo"
import { ReopenButton } from "@/components/admin/eventos/ReopenButton"
import type { EventoEstado } from "@/generated/prisma/enums"

const ESTADO_COLORS: Record<EventoEstado, string> = {
  BORRADOR:  "bg-gray-100 text-gray-700",
  ACTIVO:    "bg-green-100 text-green-700",
  CERRADO:   "bg-amber-100 text-amber-700",
  PUBLICADO: "bg-blue-100 text-blue-700",
}

const ESTADO_LABELS: Record<EventoEstado, string> = {
  BORRADOR:  "Borrador",
  ACTIVO:    "Activo",
  CERRADO:   "Cerrado",
  PUBLICADO: "Publicado",
}

export default async function PlanillasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const org = await requireRole(["ADMIN"])

  const [evento, grupos] = await Promise.all([
    findEventoById(org.organizationId, id),
    listPlanillasPorEventoAdmin(org.organizationId, id),
  ])

  if (!evento) notFound()

  const totalPlanillas = grupos.reduce((acc, g) => acc + g.filas.length, 0)
  const totalEnviadas = grupos.reduce(
    (acc, g) => acc + g.filas.filter((f) => f.scoreSheet?.estado === "ENVIADA").length,
    0,
  )

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <Link href={`/admin/eventos/${id}`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {evento.nombre}
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Planillas del evento</h1>
          <span className={`mt-1 rounded-full px-3 py-0.5 text-sm font-medium ${ESTADO_COLORS[evento.estado]}`}>
            {ESTADO_LABELS[evento.estado]}
          </span>
        </div>
        <p className="mt-1 text-gray-500">Estado de carga de puntajes por posta y patrulla</p>
      </div>

      {/* Resumen global */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            {totalEnviadas} de {totalPlanillas} planillas enviadas
          </span>
          <span className="text-sm text-gray-500">
            {totalPlanillas > 0 ? Math.round((totalEnviadas / totalPlanillas) * 100) : 0}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-brand h-2 rounded-full transition-all"
            style={{ width: totalPlanillas > 0 ? `${(totalEnviadas / totalPlanillas) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-xl border bg-white p-8 text-center">
          <p className="text-gray-500">No hay postas asignadas en este evento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <section key={grupo.asignacionId} className="rounded-xl border bg-white shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b bg-gray-50">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                  {grupo.actividadNombre}
                </p>
                <div className="flex items-center justify-between mt-0.5">
                  <h2 className="text-base font-semibold text-gray-900">{grupo.postaNombre}</h2>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    {grupo.juezNombre && <span>Juez: {grupo.juezNombre}</span>}
                    {grupo.plantillaModo && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                        {grupo.plantillaModo === "CRITERIOS" ? "Por criterios" : "Puntaje único"}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Patrulla</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Estado</th>
                      <th className="px-4 py-2 text-right font-medium text-gray-500">Puntaje</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Enviada por</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Hora</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-500">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.filas.map((fila) => {
                      const sheet = fila.scoreSheet
                      const estadoLabel = !sheet
                        ? "Sin cargar"
                        : sheet.estado === "ENVIADA"
                        ? "Enviada"
                        : "Borrador"
                      const estadoClass = !sheet
                        ? "bg-gray-100 text-gray-500"
                        : sheet.estado === "ENVIADA"
                        ? "bg-green-100 text-green-700"
                        : "bg-amber-100 text-amber-700"

                      return (
                        <tr key={fila.patrullaId} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{fila.patrullaNombre}</p>
                            <p className="text-xs text-gray-400">{fila.grupoScoutNombre}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estadoClass}`}>
                              {estadoLabel}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-gray-700">
                            {sheet?.estado === "ENVIADA" && sheet.totalPuntuable != null
                              ? Number(sheet.totalPuntuable).toFixed(2)
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {sheet?.enviadaByNombre ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {sheet?.enviadaAt
                              ? new Date(sheet.enviadaAt).toLocaleTimeString("es-AR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {sheet?.estado === "ENVIADA" ? (
                              <ReopenButton
                                scoreSheetId={sheet.id}
                                patrullaNombre={fila.patrullaNombre}
                              />
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
