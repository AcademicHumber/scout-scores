import { requireRole } from "@/lib/auth-helpers"
import { findPostaById } from "@/repositories/posta.repo"
import { listScoreTemplates } from "@/repositories/score-template.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import { PostaDetailForm } from "@/components/admin/postas/PostaDetailForm"
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

  const [posta, allTemplates] = await Promise.all([
    findPostaById(org.organizationId, id),
    listScoreTemplates(org.organizationId),
  ])

  if (!posta) notFound()

  const templates = allTemplates
    .filter((t) => !t.archivedAt || t.id === posta.templateId)
    .map((t) => ({ id: t.id, nombre: t.nombre, archivedAt: t.archivedAt }))

  const materiales = Array.isArray(posta.materiales)
    ? (posta.materiales as Array<{ nombre: string; cantidad?: string }>)
    : []

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
            templateId: posta.templateId,
            template: posta.template,
            materiales,
            asignacionesCount: posta.asignaciones.length,
          }}
          templates={templates}
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
    </div>
  )
}
