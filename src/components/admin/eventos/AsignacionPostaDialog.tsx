"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { asignarPostaAction, updateAsignacionAction } from "@/app/(app)/admin/eventos/[id]/actions"

type Template = { id: string; nombre: string; archivedAt: Date | null } | null

type Asignacion = {
  id: string
  postaId: string
  posta: { nombre: string; templateId: string | null; template: Template }
  juezUserId: string | null
  encargado: string | null
  ayudantes: string | null
  weight: string
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
  asignacion: Asignacion | null
  postasDisponibles: PostaDisponible[]
  jueces: Array<{ userId: string; name: string | null; email: string }>
  onClose: () => void
}

export function AsignacionPostaDialog({ actividadId, asignacion, postasDisponibles, jueces, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const isEditing = asignacion !== null

  const [asignarState, asignarAction, asignarPending] = useActionState(asignarPostaAction, {})
  const [updateState, updateAction, updatePending] = useActionState(updateAsignacionAction, {})

  const [selectedPostaId, setSelectedPostaId] = useState(asignacion?.postaId ?? "")
  const [juezUserId, setJuezUserId] = useState(asignacion?.juezUserId ?? "")
  const [encargado, setEncargado] = useState(asignacion?.encargado ?? "")
  const [ayudantes, setAyudantes] = useState(asignacion?.ayudantes ?? "")
  const [weight, setWeight] = useState(asignacion?.weight ?? "1")

  const state = isEditing ? updateState : asignarState
  const isPending = isEditing ? updatePending : asignarPending

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  // Cerrar al completar sin error
  useEffect(() => {
    if (asignarState.success || updateState.asignacion) {
      onClose()
    }
  }, [asignarState, updateState, onClose])

  const postaSeleccionada = postasDisponibles.find((p) => p.id === selectedPostaId)

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-full max-w-lg rounded-xl border bg-white p-0 shadow-xl backdrop:bg-black/40"
    >
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditing ? "Editar asignación" : "Asignar posta a actividad"}
        </h2>
      </div>

      <form action={isEditing ? updateAction : asignarAction} className="space-y-4 px-6 py-4">
        {isEditing ? (
          <input type="hidden" name="asignacionId" value={asignacion.id} />
        ) : (
          <input type="hidden" name="actividadId" value={actividadId} />
        )}

        {state.error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {state.error}
          </div>
        )}

        {/* Selector de posta (solo en creación) */}
        {!isEditing && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Posta <span className="text-red-500">*</span>
            </label>
            <select
              name="postaId"
              value={selectedPostaId}
              onChange={(e) => setSelectedPostaId(e.target.value)}
              required
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            >
              <option value="">— Seleccionar posta —</option>
              {postasDisponibles.map((p) => (
                <option key={p.id} value={p.id} disabled={!!p.asignadaEnActividad}>
                  {p.nombre}{p.asignadaEnActividad ? ` (ya asignada en ${p.asignadaEnActividad})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Nombre de la posta en modo edición */}
        {isEditing && (
          <div className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="font-medium">{asignacion.posta.nombre}</span>
            {asignacion.posta.template && (
              <span className="ml-2 text-xs text-gray-500">— {asignacion.posta.template.nombre}</span>
            )}
          </div>
        )}

        {/* Previsualización de posta seleccionada */}
        {!isEditing && postaSeleccionada && (
          <div className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-0.5">
            {postaSeleccionada.template && (
              <p>Plantilla: <span className="font-medium">{postaSeleccionada.template.nombre}</span></p>
            )}
            {!postaSeleccionada.template && (
              <p className="text-amber-600">Sin plantilla asignada</p>
            )}
            {postaSeleccionada.duracionMinutos && (
              <p>Duración estimada: {postaSeleccionada.duracionMinutos} min</p>
            )}
          </div>
        )}

        {/* Juez */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Juez</label>
          <select
            name="juezUserId"
            value={juezUserId}
            onChange={(e) => setJuezUserId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">(sin asignar)</option>
            {jueces.map((j) => (
              <option key={j.userId} value={j.userId}>{j.name ?? j.email}</option>
            ))}
          </select>
        </div>

        {/* Encargado */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Encargado</label>
          <input
            name="encargado"
            type="text"
            value={encargado}
            onChange={(e) => setEncargado(e.target.value)}
            maxLength={100}
            placeholder="Nombre del encargado (opcional)"
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Ayudantes */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Ayudantes</label>
          <input
            name="ayudantes"
            type="text"
            value={ayudantes}
            onChange={(e) => setAyudantes(e.target.value)}
            maxLength={300}
            placeholder="Nombres separados por coma (opcional)"
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Peso */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Peso relativo</label>
          <input
            name="weight"
            type="number"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            min="0.01"
            max="999.99"
            step="0.01"
            className="w-32 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <p className="mt-0.5 text-xs text-gray-400">Multiplicador relativo entre postas (default 1.0)</p>
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending || (!isEditing && !selectedPostaId)}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {isPending ? "..." : isEditing ? "Guardar cambios" : "Asignar"}
          </button>
        </div>
      </form>
    </dialog>
  )
}
