"use client"

import { useActionState } from "react"
import { transicionarEstadoAction } from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos

type Actividad = { pesoRelativo: string }
type Estado = "BORRADOR" | "ACTIVO" | "CERRADO" | "PUBLICADO"

type Props = {
  eventoId: string
  estado: Estado
  actividades: Actividad[]
  patrullasCount: number
}

const ESTADOS: Estado[] = ["BORRADOR", "ACTIVO", "CERRADO", "PUBLICADO"]

export function EventoEstadoControls({ eventoId, estado, actividades, patrullasCount }: Props) {
  const [state, action, pending] = useActionState(transicionarEstadoAction, {})

  const suma = actividades.reduce((acc, a) => acc + parseFloat(a.pesoRelativo), 0)
  const pesosOk = actividades.length > 0 && Math.abs(suma - 100) <= 0.01
  const puedeActivar = pesosOk && patrullasCount > 0

  const nextTarget: Estado | null =
    estado === "BORRADOR" ? "ACTIVO" :
    estado === "ACTIVO"   ? "CERRADO" :
    estado === "CERRADO"  ? "PUBLICADO" :
    null

  return (
    <div className="space-y-4">
      {/* Línea del tiempo */}
      <div className="overflow-x-auto -mx-1 px-1 pb-0.5">
        <div className="flex items-center gap-1.5 min-w-max">
          {ESTADOS.map((s, idx) => {
            const done = ESTADOS.indexOf(estado) > idx
            const active = s === estado
            return (
              <div key={s} className="flex items-center gap-1.5">
                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  done    ? "bg-green-500 text-white" :
                  active  ? "bg-brand text-white" :
                            "bg-gray-200 text-gray-500"
                }`}>
                  {done ? "✓" : idx + 1}
                </div>
                <span className={`text-xs whitespace-nowrap ${active ? "font-semibold text-brand" : "text-gray-500"}`}>
                  {m.estadoBadge[s]}
                </span>
                {idx < ESTADOS.length - 1 && (
                  <div className={`h-px w-4 shrink-0 ${done ? "bg-green-500" : "bg-gray-200"}`} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Indicador de pesos (solo en BORRADOR) */}
      {estado === "BORRADOR" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">
              {m.detail.pesosLabel.replace("{{suma}}", suma.toFixed(2))}
            </span>
            {Math.abs(suma - 100) <= 0.01 ? (
              <span className="text-green-600 text-xs font-medium">{m.detail.pesosOk}</span>
            ) : suma < 100 ? (
              <span className="text-amber-600 text-xs">
                {m.detail.pesosFaltantes.replace("{{faltante}}", (100 - suma).toFixed(2))}
              </span>
            ) : (
              <span className="text-red-600 text-xs">
                {m.detail.pesosExcedidos.replace("{{exceso}}", (suma - 100).toFixed(2))}
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full rounded-full transition-all ${
                Math.abs(suma - 100) <= 0.01 ? "bg-green-500" :
                suma > 100 ? "bg-red-500" : "bg-amber-400"
              }`}
              style={{ width: `${Math.min(suma, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Errores del servidor */}
      {state.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
          {state.error}
        </div>
      )}
      {state.pesosError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.pesosError.sinActividades
            ? m.errors.pesosSinActividades
            : m.errors.pesosInvalidos
                .replace("{{sumaActual}}", state.pesosError.sumaActual.toFixed(2))
                .replace("{{faltante}}", state.pesosError.faltante.toFixed(2))}
        </div>
      )}

      {/* Botón de transición */}
      {nextTarget && (
        <form action={action}>
          <input type="hidden" name="id" value={eventoId} />
          <input type="hidden" name="target" value={nextTarget} />
          <button
            type="submit"
            disabled={pending || (nextTarget === "ACTIVO" && !puedeActivar)}
            title={
              nextTarget === "ACTIVO" && !puedeActivar
                ? !pesosOk
                  ? m.detail.transicionDisabledTooltip
                  : "Inscribí al menos una patrulla antes de activar"
                : undefined
            }
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "..." :
              nextTarget === "ACTIVO"    ? m.detail.transicion.activar :
              nextTarget === "CERRADO"   ? m.detail.transicion.cerrar :
              nextTarget === "PUBLICADO" ? m.detail.transicion.publicar :
              ""}
          </button>
        </form>
      )}
    </div>
  )
}
