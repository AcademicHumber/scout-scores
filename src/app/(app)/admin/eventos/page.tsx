import { requireRole } from "@/lib/auth-helpers"
import { listEventos } from "@/repositories/evento.repo"
import Link from "next/link"
import messages from "@/messages/es.json"
import type { EventoEstado } from "@/generated/prisma/enums"

const m = messages.admin.eventos

const FILTER_TABS: { key: "all" | EventoEstado; label: string }[] = [
  { key: "all", label: m.filters.all },
  { key: "BORRADOR", label: m.filters.BORRADOR },
  { key: "ACTIVO", label: m.filters.ACTIVO },
  { key: "CERRADO", label: m.filters.CERRADO },
  { key: "PUBLICADO", label: m.filters.PUBLICADO },
]

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

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>
}) {
  const org = await requireRole(["ADMIN"])
  const params = await searchParams
  const estadoFilter = params.estado as EventoEstado | undefined

  const eventos = await listEventos(
    org.organizationId,
    estadoFilter ? { estados: [estadoFilter] } : undefined,
  )

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{m.title}</h1>
          <p className="text-gray-600 pr-2">{m.subtitle}</p>
        </div>
        <Link
          href="/admin/eventos/nuevo"
          className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
        >
          {m.nuevoCTA}
        </Link>
      </div>

      {/* Tabs de estado */}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b">
        {FILTER_TABS.map(({ key, label }) => {
          const isActive = (key === "all" && !estadoFilter) || key === estadoFilter
          const href = key === "all" ? "/admin/eventos" : `/admin/eventos?estado=${key}`
          return (
            <Link
              key={key}
              href={href}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-brand text-brand"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      {eventos.length === 0 ? (
        <div className="py-16 text-center">
          <p className="mb-4 text-gray-500">{m.empty}</p>
          <Link
            href="/admin/eventos/nuevo"
            className="shrink-0 whitespace-nowrap rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90"
          >
            {m.nuevoCTA}
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {eventos.map((evento) => {
            const suma = evento.actividades.reduce(
              (acc, a) => acc + parseFloat(a.pesoRelativo.toString()),
              0,
            )
            const pesosOk = Math.abs(suma - 100) <= 0.01
            const pesosOver = suma > 100.01

            return (
              <Link
                key={evento.id}
                href={`/admin/eventos/${evento.id}`}
                className="rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 line-clamp-2">{evento.nombre}</h3>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${ESTADO_COLORS[evento.estado]}`}>
                    {m.estadoBadge[evento.estado]}
                  </span>
                </div>
                <p className="mb-1 text-sm text-gray-500">{formatFechas(evento.fechaInicio, evento.fechaFin)}</p>
                {evento.lugar && (
                  <p className="mb-2 truncate text-xs text-gray-400">{evento.lugar}</p>
                )}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{evento.actividades.length} actividades</span>
                  <span className={
                    pesosOk    ? "text-green-600" :
                    pesosOver  ? "text-red-600" :
                                 "text-amber-600"
                  }>
                    {suma.toFixed(0)}% / 100%
                  </span>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
