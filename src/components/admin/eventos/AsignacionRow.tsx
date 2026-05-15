"use client"

import { useActionState, useState } from "react"
import { desasignarPostaAction, reorderAsignacionAction } from "@/app/(app)/admin/eventos/[id]/actions"
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

type Props = {
  asignacion: Asignacion
  isFirst: boolean
  isLast: boolean
  isLocked: boolean
  onEdit: () => void
}

export function AsignacionRow({ asignacion, isFirst, isLast, isLocked, onEdit }: Props) {
  const [deleteState, deleteAction, deletePending] = useActionState(desasignarPostaAction, {})
  const [, upAction, upPending] = useActionState(reorderAsignacionAction, {})
  const [, downAction, downPending] = useActionState(reorderAsignacionAction, {})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const template = asignacion.posta.template
  const juez = asignacion.juezUser

  return (
    <div className="ml-1 flex flex-wrap items-center gap-x-3 gap-y-1 rounded border-l-2 border-brand/20 bg-gray-50 px-2 py-1.5">
      {deleteState.error && (
        <p className="w-full text-xs text-red-600">{deleteState.error}</p>
      )}

      {/* Nombre posta */}
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
        {asignacion.posta.nombre}
      </span>

      {/* Template badge */}
      {template ? (
        <span className="rounded bg-brand/10 px-1.5 py-0.5 text-xs text-brand">
          {template.nombre}{template.archivedAt ? " [archivada]" : ""}
        </span>
      ) : (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">{m.sinPlantilla}</span>
      )}

      {/* Juez */}
      <span className="text-xs text-gray-500">
        {juez ? `Juez: ${juez.name ?? juez.email}` : m.sinJuez}
      </span>

      {/* Encargado */}
      {asignacion.encargado && (
        <span className="text-xs text-gray-500">Enc: {asignacion.encargado}</span>
      )}

      {/* Peso (solo si ≠ 1) */}
      {asignacion.weight !== "1" && asignacion.weight !== "1.00" && (
        <span className="text-xs text-gray-400">×{asignacion.weight}</span>
      )}

      {/* Acciones */}
      <div className="ml-auto flex items-center gap-0.5">
        {/* Reordenar */}
        <form action={upAction}>
          <input type="hidden" name="asignacionId" value={asignacion.id} />
          <input type="hidden" name="direction" value="up" />
          <button type="submit" disabled={isFirst || upPending || isLocked}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded text-sm text-gray-400 hover:bg-gray-200 disabled:opacity-30">▲</button>
        </form>
        <form action={downAction}>
          <input type="hidden" name="asignacionId" value={asignacion.id} />
          <input type="hidden" name="direction" value="down" />
          <button type="submit" disabled={isLast || downPending || isLocked}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded text-sm text-gray-400 hover:bg-gray-200 disabled:opacity-30">▼</button>
        </form>

        {/* Editar */}
        {!isLocked && (
          <button type="button" onClick={onEdit}
            className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded text-sm text-gray-500 hover:bg-gray-200" title="Editar asignación">
            ✎
          </button>
        )}

        {/* Desasignar */}
        {!isLocked && (
          showDeleteConfirm ? (
            <form action={deleteAction} className="flex items-center gap-1">
              <input type="hidden" name="asignacionId" value={asignacion.id} />
              <button type="submit" disabled={deletePending}
                className="rounded bg-red-600 px-2 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50 min-h-[36px]">
                {deletePending ? "..." : "Confirmar"}
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="rounded px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 min-h-[36px]">Cancelar</button>
            </form>
          ) : (
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              title="Desasignar posta"
              className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded text-sm text-red-400 hover:bg-red-50">✕</button>
          )
        )}
      </div>
    </div>
  )
}
