import { requireRole } from "@/lib/auth-helpers"
import { findPostaById } from "@/repositories/posta.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PostaDetailForm } from "@/components/admin/postas/PostaDetailForm"
import { CriteriosDescripcionesForm } from "@/components/admin/postas/CriteriosDescripcionesForm"
import { updatePostaAction, deletePostaAction } from "./actions"
import messages from "@/messages/es.json"

const m = messages.admin.postas

function formatFecha(date: Date) {
  return new Date(date).toLocaleDateString("es-BO", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  })
}

export default async function PostaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const org = await requireRole(["ADMIN"])
  const { id } = await params

  const posta = await findPostaById(org.organizationId, id)

  if (!posta) notFound()

  const materiales = Array.isArray(posta.materiales)
    ? (posta.materiales as Array<{ nombre: string; cantidad?: string }>)
    : []

  const templatesVistos = new Set<string>()
  const templates = []
  for (const asig of posta.asignaciones) {
    const template = asig.actividad.template
    if (!template || templatesVistos.has(template.id)) continue
    templatesVistos.add(template.id)
    templates.push({
      id: template.id,
      nombre: template.nombre,
      modo: template.modo,
      valoresValidos: template.valoresValidos.map(Number),
      valoresValidosDesempate: template.valoresValidosDesempate.map(Number),
      criterios: template.criterios.map((c) => ({ id: c.id, nombre: c.nombre, tipo: c.tipo })),
    })
  }

  const criteriosDescripciones = (posta.criteriosDescripciones ?? {}) as {
    criterios?: Record<string, Record<string, string>>
    unico?: Record<string, string>
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link href="/admin/postas" className="text-sm text-gray-500 hover:text-gray-700">
          ← {m.title}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">{posta.nombre}</h1>
      </div>

      {/* Datos de la posta */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <PostaDetailForm
          posta={{
            id: posta.id,
            nombre: posta.nombre,
            descripcion: posta.descripcion,
            duracionMinutos: posta.duracionMinutos,
            materiales,
            asignacionesCount: posta.asignaciones.length,
          }}
          updateAction={updatePostaAction}
          deleteAction={deletePostaAction}
        />
      </div>

      {/* Historial */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{m.historial.title}</h2>

        {posta.asignaciones.length === 0 ? (
          <p className="text-sm text-gray-500">{m.historial.empty}</p>
        ) : (
          <div className="divide-y">
            {posta.asignaciones.map((asig) => (
              <div key={asig.id} className="py-3 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium text-gray-900">{asig.actividad.evento.nombre}</p>
                    <p className="text-xs text-gray-500">
                      Actividad: {asig.actividad.nombre}
                      {asig.juezUser && ` · Juez: ${asig.juezUser.name ?? asig.juezUser.email}`}
                      {asig.encargado && ` · Enc: ${asig.encargado}`}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatFecha(asig.actividad.evento.fechaInicio)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Leyenda de puntajes */}
      <div className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Leyenda de puntajes</h2>
        <p className="mb-4 text-sm text-gray-500">
          Qué significa cada puntaje posible para esta posta (ej: &quot;10 = llegó primero&quot;). Se muestra al juez al cargar la planilla.
        </p>
        <CriteriosDescripcionesForm
          postaId={posta.id}
          templates={templates}
          criteriosDescripciones={criteriosDescripciones}
        />
      </div>
    </div>
  )
}
