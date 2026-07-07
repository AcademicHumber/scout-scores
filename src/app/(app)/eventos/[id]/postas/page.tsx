import { requireRole } from "@/lib/auth-helpers"
import { findEventoById } from "@/repositories/evento.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PlanificacionActividadCard } from "@/components/juez/postas/PlanificacionActividadCard"
import { SoloMisPostasToggle } from "@/components/juez/postas/SoloMisPostasToggle"
import messages from "@/messages/es.json"
import type { ActividadTipo } from "@/generated/prisma/enums"

const m = messages.eventos.planificacion

export default async function EventoPostasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ soloMias?: string }>
}) {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const { id } = await params
  const { soloMias } = await searchParams
  const filtroActivo = soloMias === "1"

  const evento = await findEventoById(org.organizationId, id)
  if (!evento || evento.estado !== "BORRADOR") notFound()

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <Link href="/eventos" className="text-sm text-gray-500 hover:text-gray-700">
          {m.volver}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{evento.nombre}</h1>
        <p className="mt-1 text-sm text-gray-500">{m.subtitle}</p>
      </div>

      {evento.actividades.length > 0 && (
        <div className="flex justify-end">
          <SoloMisPostasToggle active={filtroActivo} />
        </div>
      )}

      {evento.actividades.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white px-5 py-4 text-sm text-gray-400">
          {m.actividades.empty}
        </p>
      ) : (
        <div className="space-y-4">
          {evento.actividades.map((actividad) => {
            const asignaciones = actividad.asignaciones
              .map((a) => ({
                id: a.id,
                postaId: a.posta.id,
                postaNombre: a.posta.nombre,
                juezNombre: a.juezUser?.name ?? a.juezUser?.email ?? null,
                esPropia: a.posta.creadoPorUserId === org.userId,
              }))
              .filter((a) => !filtroActivo || a.esPropia)

            return (
              <PlanificacionActividadCard
                key={actividad.id}
                eventoId={evento.id}
                actividadId={actividad.id}
                nombre={actividad.nombre}
                tipo={actividad.tipo as ActividadTipo}
                templateNombre={actividad.template?.nombre ?? null}
                asignaciones={asignaciones}
                asignacionesEmptyMessage={
                  filtroActivo ? m.actividades.asignacionesEmptyFiltro : m.actividades.asignacionesEmpty
                }
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
