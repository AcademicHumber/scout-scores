"use client"
import { useActionState, useState, useEffect } from "react"
import { updateCriterio, deleteCriterio, reorderCriterio } from "@/app/(app)/admin/plantillas/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

type Props = {
  templateId: string
  criterio: { id: string; nombre: string; descripcion: string | null; tipo: "PUNTUABLE" | "DESEMPATE"; orden: number }
  totalCriterios: number
  modo: "CRITERIOS" | "PUNTAJE_UNICO"
  locked: boolean
  escalaLabel: string
  escalaDesempateLabel: string | null
}

export function CriterioRow({ templateId, criterio, totalCriterios, modo, locked, escalaLabel, escalaDesempateLabel }: Props) {
  const [updateState, updateAction, updatePending] = useActionState(updateCriterio, null)
  const [deleteState, deleteAction] = useActionState(deleteCriterio, null)
  const [reorderState, reorderAction] = useActionState(reorderCriterio, null)

  const [nombre, setNombre] = useState(criterio.nombre)
  const [descripcion, setDescripcion] = useState(criterio.descripcion ?? "")
  const [tipo, setTipo] = useState(criterio.tipo)

  const [savedNombre, setSavedNombre] = useState(criterio.nombre)
  const [savedDescripcion, setSavedDescripcion] = useState(criterio.descripcion ?? "")
  const [savedTipo, setSavedTipo] = useState(criterio.tipo)

  useEffect(() => {
    if (updateState?.success) {
      setSavedNombre(updateState.nombre as string)
      setSavedDescripcion((updateState.descripcion as string | undefined) ?? "")
      setSavedTipo(updateState.tipo as "PUNTUABLE" | "DESEMPATE")
    }
  }, [updateState])

  const isDirty = nombre !== savedNombre || descripcion !== savedDescripcion || tipo !== savedTipo

  const escalaInfo =
    criterio.tipo === "DESEMPATE" && escalaDesempateLabel
      ? escalaDesempateLabel
      : escalaLabel

  if (deleteState?.success) return null

  return (
    <div className="rounded-lg border bg-white p-4">
      <div className="mb-2 flex items-start gap-3">
        {/* Orden */}
        <div className="mt-1 flex flex-col gap-1">
          <form action={reorderAction}>
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="criterioId" value={criterio.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={locked || criterio.orden === 1}
              title={m.detail.moveUp}
              className="block text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              ▲
            </button>
          </form>
          <form action={reorderAction}>
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="criterioId" value={criterio.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={locked || criterio.orden === totalCriterios}
              title={m.detail.moveDown}
              className="block text-xs text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              ▼
            </button>
          </form>
          <span className="text-center text-xs text-gray-300">{criterio.orden}</span>
        </div>

        {/* Campos */}
        <div className="flex-1 space-y-2">
          <div className="flex gap-2">
            <input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={locked}
              className="flex-1 rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-50"
            />
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "PUNTUABLE" | "DESEMPATE")}
              disabled={locked || modo === "PUNTAJE_UNICO"}
              className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-50"
            >
              {modo !== "PUNTAJE_UNICO" && (
                <option value="PUNTUABLE">{m.criteriosTipo.PUNTUABLE}</option>
              )}
              <option value="DESEMPATE">{m.criteriosTipo.DESEMPATE}</option>
            </select>
            <span className="hidden items-center rounded bg-gray-100 px-2 py-1 text-xs text-gray-500 sm:flex">
              {escalaInfo}
            </span>
          </div>
          <input
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            disabled={locked}
            placeholder={m.form.criterioDescripcion}
            className="w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-50"
          />
        </div>

        {/* Eliminar */}
        {!locked && (
          <form action={deleteAction}>
            <input type="hidden" name="templateId" value={templateId} />
            <input type="hidden" name="criterioId" value={criterio.id} />
            <button type="submit" className="mt-1 text-sm text-gray-400 hover:text-red-500">
              {m.form.removeCriterio}
            </button>
          </form>
        )}
      </div>

      {/* Fila de acciones inline */}
      {!locked && (
        <div className="mt-2 flex items-center gap-3">
          {isDirty && (
            <form action={updateAction}>
              <input type="hidden" name="templateId" value={templateId} />
              <input type="hidden" name="criterioId" value={criterio.id} />
              <input type="hidden" name="nombre" value={nombre} />
              <input type="hidden" name="descripcion" value={descripcion} />
              <input type="hidden" name="tipo" value={tipo} />
              <button
                type="submit"
                disabled={updatePending}
                className="rounded-lg bg-brand px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-60"
              >
                {updatePending ? "..." : m.detail.saveMetadata}
              </button>
            </form>
          )}
          {updateState?.success && !isDirty && (
            <span className="text-xs text-green-600">{m.detail.saved}</span>
          )}
          {updateState?.error && (
            <span className="text-xs text-red-600">{updateState.error}</span>
          )}
          {deleteState?.error && (
            <span className="text-xs text-red-600">{deleteState.error}</span>
          )}
          {reorderState?.error && (
            <span className="text-xs text-red-600">{reorderState.error}</span>
          )}
        </div>
      )}
    </div>
  )
}
