"use client"

import { useActionState, useEffect, useState } from "react"
import { updateActividadAction, deleteActividadAction, reorderActividadAction } from "@/app/(app)/admin/eventos/[id]/actions"
import { AsignacionesInActividad } from "./AsignacionesInActividad"
import messages from "@/messages/es.json"
import type { ActividadTipo } from "@/generated/prisma/enums"

const m = messages.admin.eventos

type Asignacion = {
  id: string
  postaId: string
  posta: { nombre: string }
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
  duracionMinutos: number | null
  asignadaEnActividad: string | null
}

type Template = { id: string; nombre: string; archivedAt: Date | null }

type Actividad = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: ActividadTipo
  pesoRelativo: string
  templateId: string | null
  orden: number
  asignaciones: Asignacion[]
}

type Props = {
  actividad: Actividad
  eventoId: string
  isFirst: boolean
  isLast: boolean
  isLocked: boolean
  postasDisponibles: PostaDisponible[]
  jueces: Array<{ userId: string; name: string | null; email: string }>
  templates: Template[]
}

export function ActividadRow({ actividad, eventoId, isFirst, isLast, isLocked, postasDisponibles, jueces, templates }: Props) {
  const [editState, editAction, editPending] = useActionState(updateActividadAction, {})
  const [deleteState, deleteAction, deletePending] = useActionState(deleteActividadAction, {})
  const [, upAction, upPending] = useActionState(reorderActividadAction, {})
  const [, downAction, downPending] = useActionState(reorderActividadAction, {})

  const [nombre, setNombre] = useState(actividad.nombre)
  const [descripcion, setDescripcion] = useState(actividad.descripcion ?? "")
  const [tipo, setTipo] = useState<ActividadTipo>(actividad.tipo)
  const [peso, setPeso] = useState(actividad.pesoRelativo)
  const [templateId, setTemplateId] = useState(actividad.templateId ?? "")

  const [savedNombre, setSavedNombre] = useState(actividad.nombre)
  const [savedDescripcion, setSavedDescripcion] = useState(actividad.descripcion ?? "")
  const [savedTipo, setSavedTipo] = useState<ActividadTipo>(actividad.tipo)
  const [savedPeso, setSavedPeso] = useState(actividad.pesoRelativo)
  const [savedTemplateId, setSavedTemplateId] = useState(actividad.templateId ?? "")

  const isDirty =
    nombre !== savedNombre ||
    descripcion !== savedDescripcion ||
    tipo !== savedTipo ||
    peso !== savedPeso ||
    templateId !== savedTemplateId

  useEffect(() => {
    if (editState.actividad) {
      setSavedNombre(editState.actividad.nombre)
      setSavedDescripcion(editState.actividad.descripcion ?? "")
      setSavedTipo(editState.actividad.tipo)
      setSavedPeso(editState.actividad.pesoRelativo)
      setSavedTemplateId(editState.actividad.templateId ?? "")
    }
  }, [editState])

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  return (
    <div className="rounded-lg border bg-white p-3">
      {(editState.error || deleteState.error) && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {editState.error ?? deleteState.error}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        {/* Nombre */}
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
          className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder={m.actividades.row.nombre}
        />

        {/* Tipo */}
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value as ActividadTipo)}
          className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {(["COMPETICION", "CONSTRUCCION", "COCINA", "OTRO"] as const).map((t) => (
            <option key={t} value={t}>{m.actividades.tipo[t]}</option>
          ))}
        </select>

        {/* Peso */}
        <input
          type="number"
          value={peso}
          onChange={(e) => setPeso(e.target.value)}
          min="0.01"
          max="100"
          step="0.01"
          className="w-24 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder={m.actividades.row.peso}
        />

        {/* Acciones */}
        <div className="flex items-center gap-1">
          {isDirty && (
            <form action={editAction}>
              <input type="hidden" name="eventoId" value={eventoId} />
              <input type="hidden" name="actividadId" value={actividad.id} />
              <input type="hidden" name="nombre" value={nombre} />
              <input type="hidden" name="descripcion" value={descripcion} />
              <input type="hidden" name="tipo" value={tipo} />
              <input type="hidden" name="pesoRelativo" value={peso} />
              <input type="hidden" name="templateId" value={templateId} />
              <button
                type="submit"
                disabled={editPending}
                className="rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
              >
                {editPending ? "..." : m.actividades.row.save}
              </button>
            </form>
          )}

          <form action={upAction}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="actividadId" value={actividad.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" disabled={isFirst || upPending || isLocked} title={m.actividades.row.moveUp}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30">▲</button>
          </form>

          <form action={downAction}>
            <input type="hidden" name="eventoId" value={eventoId} />
            <input type="hidden" name="actividadId" value={actividad.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" disabled={isLast || downPending || isLocked} title={m.actividades.row.moveDown}
              className="rounded p-1 text-gray-500 hover:bg-gray-100 disabled:opacity-30">▼</button>
          </form>

          {!isLocked && (
            showDeleteConfirm ? (
              <form action={deleteAction} className="flex items-center gap-1">
                <input type="hidden" name="eventoId" value={eventoId} />
                <input type="hidden" name="actividadId" value={actividad.id} />
                <button type="submit" disabled={deletePending}
                  className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50">
                  {deletePending ? "..." : "Confirmar"}
                </button>
                <button type="button" onClick={() => setShowDeleteConfirm(false)}
                  className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100">
                  Cancelar
                </button>
              </form>
            ) : (
              <button type="button" onClick={() => setShowDeleteConfirm(true)} title={m.actividades.row.delete}
                className="rounded p-1 text-red-500 hover:bg-red-50">✕</button>
            )
          )}
        </div>
      </div>

      <div className="mt-2">
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={1000}
          className="w-full rounded border px-2 py-1 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder={m.actividades.row.descripcion}
        />
      </div>

      <div className="mt-2 flex items-center gap-2">
        <label className="text-xs font-medium text-gray-500">{m.actividades.row.plantilla}</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">{m.actividades.row.plantillaSinAsignar}</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nombre}{t.archivedAt ? " [archivada]" : ""}
            </option>
          ))}
        </select>
      </div>

      <AsignacionesInActividad
        actividadId={actividad.id}
        asignaciones={actividad.asignaciones}
        isLocked={isLocked}
        postasDisponibles={postasDisponibles}
        jueces={jueces}
      />
    </div>
  )
}
