"use client"

import { useState } from "react"
import { AsignacionRow } from "./AsignacionRow"
import { AsignacionPostaDialog } from "./AsignacionPostaDialog"
import messages from "@/messages/es.json"

const m = messages.admin.eventos.postas

type Template = { id: string; nombre: string; archivedAt: Date | null } | null

type Asignacion = {
  id: string
  postaId: string
  posta: { nombre: string; templateId: string | null; template: Template }
  juezUserId: string | null
  juezUser: { id: string; name: string | null; email: string } | null
  encargado: string | null
  ayudantes: string | null
  weight: string
  orden: number
}

type PostaDisponible = {
  id: string
  nombre: string
  templateId: string | null
  template: Template
  duracionMinutos: number | null
  asignadaEnActividad: string | null
}

type Props = {
  actividadId: string
  asignaciones: Asignacion[]
  isLocked: boolean
  postasDisponibles: PostaDisponible[]
  jueces: Array<{ userId: string; name: string | null; email: string }>
}

export function AsignacionesInActividad({ actividadId, asignaciones, isLocked, postasDisponibles, jueces }: Props) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingAsignacion, setEditingAsignacion] = useState<Asignacion | null>(null)

  function openCreate() {
    setEditingAsignacion(null)
    setDialogOpen(true)
  }

  function openEdit(asignacion: Asignacion) {
    setEditingAsignacion(asignacion)
    setDialogOpen(true)
  }

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{m.title}</p>
        {!isLocked && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand hover:bg-brand/20"
          >
            {m.asignar}
          </button>
        )}
      </div>

      {asignaciones.length === 0 ? (
        <p className="text-xs text-gray-400">{m.empty}</p>
      ) : (
        <div className="space-y-1">
          {asignaciones.map((asig, idx) => (
            <AsignacionRow
              key={asig.id}
              asignacion={asig}
              isFirst={idx === 0}
              isLast={idx === asignaciones.length - 1}
              isLocked={isLocked}
              onEdit={() => openEdit(asig)}
            />
          ))}
        </div>
      )}

      {dialogOpen && (
        <AsignacionPostaDialog
          actividadId={actividadId}
          asignacion={editingAsignacion}
          postasDisponibles={postasDisponibles}
          jueces={jueces}
          onClose={() => setDialogOpen(false)}
        />
      )}
    </div>
  )
}
