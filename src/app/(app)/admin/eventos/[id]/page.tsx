import { requireRole } from "@/lib/auth-helpers"
import { findEventoById, isEventoLocked } from "@/repositories/evento.repo"
import { listJuecesAsignables } from "@/repositories/membership.repo"
import { listScoreTemplates } from "@/repositories/score-template.repo"
import { listGrupos } from "@/repositories/grupo.repo"
import { notFound } from "next/navigation"
import Link from "next/link"
import messages from "@/messages/es.json"
import { EventoMetadataForm } from "@/components/admin/eventos/EventoMetadataForm"
import { EventoEstadoControls } from "@/components/admin/eventos/EventoEstadoControls"
import { ActividadRow } from "@/components/admin/eventos/ActividadRow"
import { AddActividadForm } from "@/components/admin/eventos/AddActividadForm"
import { DeleteEventoForm } from "@/components/admin/eventos/DeleteEventoForm"
import { PatrullasList } from "@/components/admin/eventos/PatrullasList"
import type { EventoEstado } from "@/generated/prisma/enums"

const m = messages.admin.eventos

const ESTADO_COLORS: Record<EventoEstado, string> = {
  BORRADOR:  "bg-gray-100 text-gray-700",
  ACTIVO:    "bg-green-100 text-green-700",
  CERRADO:   "bg-amber-100 text-amber-700",
  PUBLICADO: "bg-blue-100 text-blue-700",
}

function formatFechas(fechaInicio: Date, fechaFin: Date | null): string {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }
  const locale = "es-BO"
  if (!fechaFin) return new Date(fechaInicio).toLocaleDateString(locale, opts)
  const inicio = new Date(fechaInicio)
  const fin = new Date(fechaFin)
  if (inicio.getUTCMonth() === fin.getUTCMonth() && inicio.getUTCFullYear() === fin.getUTCFullYear()) {
    return `${inicio.getUTCDate()}–${fin.toLocaleDateString(locale, opts)}`
  }
  return `${inicio.toLocaleDateString(locale, opts)} – ${fin.toLocaleDateString(locale, opts)}`
}

export default async function EventoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const org = await requireRole(["ADMIN"])
  const { id } = await params

  const [evento, locked, jueces, allTemplates, grupos] = await Promise.all([
    findEventoById(org.organizationId, id),
    isEventoLocked(id),
    listJuecesAsignables(org.organizationId),
    listScoreTemplates(org.organizationId),
    listGrupos(org.organizationId),
  ])

  if (!evento) notFound()

  // Solo plantillas activas (no archivadas) para los selects de postas
  const templates = allTemplates.filter((t) => !t.archivedAt).map((t) => ({ id: t.id, nombre: t.nombre }))

  const suma = evento.actividades.reduce(
    (acc, a) => acc + parseFloat(a.pesoRelativo.toString()),
    0,
  )
  const pesosOk = Math.abs(suma - 100) <= 0.01

  const fechaInicioStr = new Date(evento.fechaInicio).toISOString().split("T")[0]!
  const fechaFinStr = evento.fechaFin
    ? new Date(evento.fechaFin).toISOString().split("T")[0]!
    : null

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      {/* Header */}
      <div>
        <Link href="/admin/eventos" className="text-sm text-gray-500 hover:text-gray-700">
          ← {m.title}
        </Link>
        <div className="mt-2 flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{evento.nombre}</h1>
          <span className={`mt-1 rounded-full px-3 py-0.5 text-sm font-medium ${ESTADO_COLORS[evento.estado]}`}>
            {m.estadoBadge[evento.estado]}
          </span>
        </div>
        <p className="mt-1 text-gray-500">{formatFechas(evento.fechaInicio, evento.fechaFin)}</p>
        {evento.lugar && <p className="text-sm text-gray-400">{evento.lugar}</p>}
      </div>

      {/* Información general */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{m.detail.metadataTitle}</h2>
        <EventoMetadataForm
          eventoId={evento.id}
          initialNombre={evento.nombre}
          initialDescripcion={evento.descripcion}
          initialLugar={evento.lugar}
          initialFechaInicio={fechaInicioStr}
          initialFechaFin={fechaFinStr}
        />
      </section>

      {/* Estado del evento */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">{m.detail.estadoTitle}</h2>
        <EventoEstadoControls
          eventoId={evento.id}
          estado={evento.estado}
          actividades={evento.actividades.map((a) => ({ pesoRelativo: a.pesoRelativo.toString() }))}
          patrullasCount={evento.patrullas.length}
        />
      </section>

      {/* Actividades */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{m.detail.actividadesTitle}</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className={pesosOk ? "text-green-600 font-medium" : "text-amber-600"}>
              {suma.toFixed(2)}% / 100%
            </span>
          </div>
        </div>

        {evento.actividades.length === 0 ? (
          <p className="mb-4 text-sm text-gray-500">{m.actividades.empty}</p>
        ) : (
          <div className="mb-4 space-y-2">
            {evento.actividades.map((a, idx) => (
              <ActividadRow
                key={a.id}
                actividad={{
                  id: a.id,
                  nombre: a.nombre,
                  descripcion: a.descripcion,
                  tipo: a.tipo,
                  pesoRelativo: a.pesoRelativo.toString(),
                  orden: a.orden,
                  postas: a.postas.map((p) => ({
                    id: p.id,
                    nombre: p.nombre,
                    descripcion: p.descripcion,
                    weight: p.weight.toString(),
                    templateId: p.templateId,
                    template: p.template,
                    juezUserId: p.juezUserId,
                    juezUser: p.juezUser,
                    orden: p.orden,
                  })),
                }}
                eventoId={evento.id}
                isFirst={idx === 0}
                isLast={idx === evento.actividades.length - 1}
                isLocked={locked}
                templates={templates}
                jueces={jueces}
              />
            ))}
          </div>
        )}

        {!locked && <AddActividadForm eventoId={evento.id} />}
      </section>

      {/* Patrullas */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">{m.patrullas.title}</h2>
          <span className="text-sm text-gray-500">
            {evento.patrullas.length} inscripta{evento.patrullas.length !== 1 ? "s" : ""}
          </span>
        </div>
        <PatrullasList
          eventoId={evento.id}
          patrullas={evento.patrullas.map((p) => ({
            id: p.id,
            nombre: p.nombre,
            grupoScoutId: p.grupoScoutId,
            grupoScout: p.grupoScout,
            categoria: p.categoria,
          }))}
          grupos={grupos.map((g) => ({ id: g.id, nombre: g.nombre }))}
        />
      </section>

      {/* Acciones peligrosas (solo en BORRADOR) */}
      {evento.estado === "BORRADOR" && (
        <section className="rounded-xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-red-700">{m.detail.deleteTitle}</h2>
          <DeleteEventoForm eventoId={evento.id} nombre={evento.nombre} />
        </section>
      )}
    </div>
  )
}
