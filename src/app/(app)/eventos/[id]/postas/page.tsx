import { requireRole } from "@/lib/auth-helpers"
import { findEventoById } from "@/repositories/evento.repo"
import { listPostasParaEvento } from "@/repositories/posta.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PlanificacionActividadCard } from "@/components/juez/postas/PlanificacionActividadCard"
import messages from "@/messages/es.json"
import type { ActividadTipo } from "@/generated/prisma/enums"

const m = messages.eventos.planificacion

export default async function EventoPostasPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const { id } = await params

  const evento = await findEventoById(org.organizationId, id)
  if (!evento || evento.estado !== "BORRADOR") notFound()

  const postasDisponibles = await listPostasParaEvento(org.organizationId, id)

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-12">
      <div>
        <Link href="/eventos" className="text-sm text-gray-500 hover:text-gray-700">
          {m.volver}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{evento.nombre}</h1>
        <p className="mt-1 text-sm text-gray-500">{m.subtitle}</p>
      </div>

      {evento.actividades.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-white px-5 py-4 text-sm text-gray-400">
          {m.actividades.empty}
        </p>
      ) : (
        <div className="space-y-4">
          {evento.actividades.map((actividad) => {
            const template = actividad.template
              ? {
                  modo: actividad.template.modo,
                  valoresValidos: actividad.template.valoresValidos.map(Number),
                  valoresValidosDesempate: actividad.template.valoresValidosDesempate.map(Number),
                  criterios: actividad.template.criterios.map((c) => ({
                    id: c.id,
                    nombre: c.nombre,
                    tipo: c.tipo,
                  })),
                }
              : null

            return (
              <PlanificacionActividadCard
                key={actividad.id}
                actividadId={actividad.id}
                nombre={actividad.nombre}
                tipo={actividad.tipo as ActividadTipo}
                templateNombre={actividad.template?.nombre ?? null}
                template={template}
                asignaciones={actividad.asignaciones.map((a) => ({
                  id: a.id,
                  postaNombre: a.posta.nombre,
                  juezNombre: a.juezUser?.name ?? a.juezUser?.email ?? null,
                  esPropia: a.posta.creadoPorUserId === org.userId,
                }))}
                postasDisponibles={postasDisponibles.map((p) => ({
                  id: p.id,
                  nombre: p.nombre,
                  duracionMinutos: p.duracionMinutos,
                  asignadaEnActividad: p.asignadaEnActividad,
                }))}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}
