import { requireRole } from "@/lib/auth-helpers"
import { findEventoById } from "@/repositories/evento.repo"
import { listPostasParaEvento } from "@/repositories/posta.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { CrearPostaForm } from "@/components/juez/postas/CrearPostaForm"
import messages from "@/messages/es.json"

const md = messages.eventos.planificacion.dialog

export default async function NuevaPostaPage({
  params,
}: {
  params: Promise<{ id: string; actividadId: string }>
}) {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const { id, actividadId } = await params

  const evento = await findEventoById(org.organizationId, id)
  if (!evento || evento.estado !== "BORRADOR") notFound()

  const actividad = evento.actividades.find((a) => a.id === actividadId)
  if (!actividad) notFound()

  const postasDisponibles = await listPostasParaEvento(org.organizationId, id)

  const template = actividad.template
    ? {
        id: actividad.template.id,
        nombre: actividad.template.nombre,
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
    <div className="mx-auto max-w-2xl space-y-6 pb-12">
      <div>
        <Link href={`/eventos/${id}/postas`} className="text-sm text-gray-500 hover:text-gray-700">
          ← {evento.nombre}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">
          {md.title.replace("{{actividad}}", actividad.nombre)}
        </h1>
      </div>

      <CrearPostaForm
        eventoId={id}
        actividadId={actividad.id}
        template={template}
        postasDisponibles={postasDisponibles.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          duracionMinutos: p.duracionMinutos,
          asignadaEnActividad: p.asignadaEnActividad,
        }))}
      />
    </div>
  )
}
