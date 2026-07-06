"use client"

import { useState } from "react"
import { CrearPostaDialog } from "./CrearPostaDialog"
import messages from "@/messages/es.json"

const m = messages.eventos.planificacion
const mt = messages.admin.eventos.actividades.tipo

type Asignacion = {
  id: string
  postaNombre: string
  juezNombre: string | null
  esPropia: boolean
}

type PostaDisponible = {
  id: string
  nombre: string
  duracionMinutos: number | null
  asignadaEnActividad: string | null
}

type TemplateInfo = {
  modo: "CRITERIOS" | "PUNTAJE_UNICO"
  valoresValidos: number[]
  valoresValidosDesempate: number[]
  criterios: Array<{ id: string; nombre: string; tipo: "PUNTUABLE" | "DESEMPATE" }>
} | null

type Props = {
  actividadId: string
  nombre: string
  tipo: keyof typeof mt
  templateNombre: string | null
  template: TemplateInfo
  asignaciones: Asignacion[]
  postasDisponibles: PostaDisponible[]
}

export function PlanificacionActividadCard({
  actividadId,
  nombre,
  tipo,
  templateNombre,
  template,
  asignaciones,
  postasDisponibles,
}: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold text-gray-900">{nombre}</h3>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-gray-500">
            <span className="rounded-full bg-gray-100 px-2 py-0.5">{mt[tipo]}</span>
            <span>{templateNombre ?? m.actividades.sinPlantilla}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="min-h-[44px] shrink-0 rounded-lg bg-brand/10 px-3 py-2 text-sm font-medium text-brand hover:bg-brand/20"
        >
          {m.cargarPosta}
        </button>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
          {m.actividades.asignacionesTitle}
        </p>
        {asignaciones.length === 0 ? (
          <p className="text-xs text-gray-400">{m.actividades.asignacionesEmpty}</p>
        ) : (
          <ul className="space-y-1.5">
            {asignaciones.map((asig) => (
              <li
                key={asig.id}
                className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border-l-2 border-brand/20 bg-gray-50 px-2 py-1.5 text-sm"
              >
                <span className="font-medium text-gray-800">{asig.postaNombre}</span>
                <span className="text-xs text-gray-500">
                  {asig.juezNombre ?? m.actividades.sinJuez}
                </span>
                {asig.esPropia && (
                  <span className="rounded bg-brand/10 px-1.5 py-0.5 text-xs font-medium text-brand">
                    {m.actividades.tuPosta}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {dialogOpen && (
        <CrearPostaDialog
          actividadId={actividadId}
          actividadNombre={nombre}
          template={template}
          postasDisponibles={postasDisponibles}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
