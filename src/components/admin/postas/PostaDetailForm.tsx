"use client"

import { useActionState, useEffect, useState } from "react"
import { updatePostaAction, deletePostaAction } from "@/app/(app)/admin/postas/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.postas

type Material = { nombre: string; cantidad?: string }

type Props = {
  posta: {
    id: string
    nombre: string
    descripcion: string | null
    duracionMinutos: number | null
    templateId: string | null
    template: { id: string; nombre: string; archivedAt: Date | null } | null
    materiales: Material[]
    asignacionesCount: number
  }
  templates: Array<{ id: string; nombre: string; archivedAt: Date | null }>
}

export function PostaDetailForm({ posta, templates }: Props) {
  const [updateState, updateAction, updatePending] = useActionState(updatePostaAction, {})
  const [deleteState, deleteAction, deletePending] = useActionState(deletePostaAction, {})
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const [nombre, setNombre] = useState(posta.nombre)
  const [descripcion, setDescripcion] = useState(posta.descripcion ?? "")
  const [duracionMinutos, setDuracionMinutos] = useState(posta.duracionMinutos?.toString() ?? "")
  const [templateId, setTemplateId] = useState(posta.templateId ?? "")
  const [materiales, setMateriales] = useState<Material[]>(posta.materiales)

  const [savedNombre, setSavedNombre] = useState(posta.nombre)
  const [savedDescripcion, setSavedDescripcion] = useState(posta.descripcion ?? "")
  const [savedDuracion, setSavedDuracion] = useState(posta.duracionMinutos?.toString() ?? "")
  const [savedTemplateId, setSavedTemplateId] = useState(posta.templateId ?? "")
  const [savedMateriales, setSavedMateriales] = useState(JSON.stringify(posta.materiales))

  const isDirty =
    nombre !== savedNombre ||
    descripcion !== savedDescripcion ||
    duracionMinutos !== savedDuracion ||
    templateId !== savedTemplateId ||
    JSON.stringify(materiales) !== savedMateriales

  useEffect(() => {
    if (updateState.posta) {
      setSavedNombre(updateState.posta.nombre)
      setSavedDescripcion(updateState.posta.descripcion ?? "")
      setSavedDuracion(updateState.posta.duracionMinutos?.toString() ?? "")
      setSavedTemplateId(updateState.posta.templateId ?? "")
      const mats = Array.isArray(updateState.posta.materiales)
        ? (updateState.posta.materiales as Material[])
        : []
      setSavedMateriales(JSON.stringify(mats))
    }
  }, [updateState])

  function addMaterial() {
    setMateriales((prev) => [...prev, { nombre: "" }])
  }

  function updateMaterial(idx: number, field: keyof Material, value: string) {
    setMateriales((prev) => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m))
  }

  function removeMaterial(idx: number) {
    setMateriales((prev) => prev.filter((_, i) => i !== idx))
  }

  const canDelete = posta.asignacionesCount === 0

  return (
    <div className="space-y-4">
      {(updateState.error || deleteState.error) && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {updateState.error ?? deleteState.error}
        </div>
      )}

      <form action={updateAction} className="space-y-4">
        <input type="hidden" name="postaId" value={posta.id} />
        <input type="hidden" name="materiales" value={JSON.stringify(materiales)} />

        {/* Nombre */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{m.fields.nombre}</label>
          <input
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            maxLength={100}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Descripción */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{m.fields.descripcion}</label>
          <textarea
            name="descripcion"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Duración */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{m.fields.duracionMinutos}</label>
          <input
            name="duracionMinutos"
            type="number"
            value={duracionMinutos}
            onChange={(e) => setDuracionMinutos(e.target.value)}
            min={1}
            max={480}
            className="w-full sm:w-32 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Plantilla */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{m.fields.plantilla}</label>
          <select
            name="templateId"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="">{m.fields.plantillaSinAsignar}</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}{t.archivedAt ? " [archivada]" : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Materiales */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">{m.fields.materiales}</label>
          <div className="space-y-2">
            {materiales.map((mat, idx) => (
              <div key={idx} className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
                <input
                  value={mat.nombre}
                  onChange={(e) => updateMaterial(idx, "nombre", e.target.value)}
                  placeholder={m.fields.materialNombre}
                  maxLength={100}
                  className="flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <div className="flex gap-2">
                  <input
                    value={mat.cantidad ?? ""}
                    onChange={(e) => updateMaterial(idx, "cantidad", e.target.value)}
                    placeholder={m.fields.materialCantidad}
                    maxLength={50}
                    className="flex-1 sm:w-40 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <button type="button" onClick={() => removeMaterial(idx)}
                    className="shrink-0 rounded px-2 text-red-400 hover:bg-red-50">✕</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addMaterial} className="text-sm text-brand hover:underline">
              {m.fields.agregarMaterial}
            </button>
          </div>
        </div>

        {isDirty && (
          <button
            type="submit"
            disabled={updatePending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {updatePending ? "Guardando..." : "Guardar cambios"}
          </button>
        )}
      </form>

      {/* Eliminar */}
      <div className="border-t pt-4">
        {canDelete ? (
          showDeleteConfirm ? (
            <form action={deleteAction} className="flex items-center gap-2">
              <input type="hidden" name="postaId" value={posta.id} />
              <span className="text-sm text-gray-600">¿Eliminar esta posta definitivamente?</span>
              <button type="submit" disabled={deletePending}
                className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
                {deletePending ? "..." : "Eliminar"}
              </button>
              <button type="button" onClick={() => setShowDeleteConfirm(false)}
                className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
            </form>
          ) : (
            <button type="button" onClick={() => setShowDeleteConfirm(true)}
              className="text-sm text-red-500 hover:underline">
              Eliminar posta
            </button>
          )
        ) : (
          <p className="text-sm text-gray-400">
            Esta posta está asignada a {posta.asignacionesCount} evento{posta.asignacionesCount !== 1 ? "s" : ""} — no se puede eliminar.
          </p>
        )}
      </div>
    </div>
  )
}
