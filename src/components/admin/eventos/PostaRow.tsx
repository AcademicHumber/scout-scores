"use client"

import { useActionState, useEffect, useState } from "react"
import {
  updatePostaAction,
  deletePostaAction,
  reorderPostaAction,
  assignTemplateAction,
  assignJuezAction,
} from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.eventos.postas

type Template = { id: string; nombre: string; archivedAt: Date | null } | null
type Juez = { id: string; name: string | null; email: string } | null

type PostaData = {
  id: string
  nombre: string
  descripcion: string | null
  weight: string
  templateId: string | null
  template: Template
  juezUserId: string | null
  juezUser: Juez
  orden: number
}

type Props = {
  posta: PostaData
  isFirst: boolean
  isLast: boolean
  isLocked: boolean
  templates: Array<{ id: string; nombre: string }>
  jueces: Array<{ userId: string; name: string | null; email: string }>
}

export function PostaRow({ posta, isFirst, isLast, isLocked, templates, jueces }: Props) {
  const [editState, editAction, editPending] = useActionState(updatePostaAction, {})
  const [deleteState, deleteAction, deletePending] = useActionState(deletePostaAction, {})
  const [, upAction, upPending] = useActionState(reorderPostaAction, {})
  const [, downAction, downPending] = useActionState(reorderPostaAction, {})
  const [templateState, templateAction, templatePending] = useActionState(assignTemplateAction, {})
  const [juezState, juezAction, juezPending] = useActionState(assignJuezAction, {})

  const [nombre, setNombre] = useState(posta.nombre)
  const [descripcion, setDescripcion] = useState(posta.descripcion ?? "")
  const [weight, setWeight] = useState(posta.weight)

  const [savedNombre, setSavedNombre] = useState(posta.nombre)
  const [savedDescripcion, setSavedDescripcion] = useState(posta.descripcion ?? "")
  const [savedWeight, setSavedWeight] = useState(posta.weight)

  const [currentTemplate, setCurrentTemplate] = useState(posta.template)
  const [selectedTemplateId, setSelectedTemplateId] = useState(posta.templateId ?? "")
  const [selectedJuezId, setSelectedJuezId] = useState(posta.juezUserId ?? "")

  const isDirty = nombre !== savedNombre || descripcion !== savedDescripcion || weight !== savedWeight

  useEffect(() => {
    if (editState.posta) {
      setSavedNombre(editState.posta.nombre)
      setSavedDescripcion(editState.posta.descripcion ?? "")
      setSavedWeight(editState.posta.weight)
    }
  }, [editState])

  useEffect(() => {
    if (templateState.posta) {
      setCurrentTemplate(templateState.posta.template)
      setSelectedTemplateId(templateState.posta.templateId ?? "")
    }
  }, [templateState])

  useEffect(() => {
    if (juezState.posta) {
      setSelectedJuezId(juezState.posta.juezUserId ?? "")
    }
  }, [juezState])

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const errorMsg = editState.error ?? deleteState.error ?? templateState.error ?? juezState.error

  return (
    <div className="ml-4 rounded border-l-2 border-brand/20 bg-gray-50 p-2">
      {errorMsg && (
        <div className="mb-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {/* Nombre */}
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          maxLength={100}
          className="min-w-0 flex-1 rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder={m.row.nombre}
          disabled={isLocked}
        />

        {/* Peso */}
        <input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          min="0.01"
          max="999.99"
          step="0.01"
          title={m.row.weight}
          className="w-20 rounded border bg-white px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          disabled={isLocked}
        />

        {/* Guardar (solo si dirty) */}
        {isDirty && !isLocked && (
          <form action={editAction}>
            <input type="hidden" name="postaId" value={posta.id} />
            <input type="hidden" name="nombre" value={nombre} />
            <input type="hidden" name="descripcion" value={descripcion} />
            <input type="hidden" name="weight" value={weight} />
            <button
              type="submit"
              disabled={editPending}
              className="rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {editPending ? "..." : m.row.save}
            </button>
          </form>
        )}

        {/* Reordenar */}
        <form action={upAction}>
          <input type="hidden" name="postaId" value={posta.id} />
          <input type="hidden" name="direction" value="up" />
          <button
            type="submit"
            disabled={isFirst || upPending || isLocked}
            title={m.row.moveUp}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
          >
            ▲
          </button>
        </form>
        <form action={downAction}>
          <input type="hidden" name="postaId" value={posta.id} />
          <input type="hidden" name="direction" value="down" />
          <button
            type="submit"
            disabled={isLast || downPending || isLocked}
            title={m.row.moveDown}
            className="rounded p-1 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
          >
            ▼
          </button>
        </form>

        {/* Eliminar */}
        {!isLocked && (
          showDeleteConfirm ? (
            <form action={deleteAction} className="flex items-center gap-1">
              <input type="hidden" name="postaId" value={posta.id} />
              <button
                type="submit"
                disabled={deletePending}
                className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletePending ? "..." : "Confirmar"}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-200"
              >
                Cancelar
              </button>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              title={m.row.delete}
              className="rounded p-1 text-red-500 hover:bg-red-50"
            >
              ✕
            </button>
          )
        )}
      </div>

      {/* Descripción */}
      <div className="mt-1">
        <input
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={500}
          className="w-full rounded border bg-white px-2 py-0.5 text-xs text-gray-500 focus:outline-none focus:ring-1 focus:ring-brand"
          placeholder={m.row.descripcion}
          disabled={isLocked}
        />
      </div>

      {/* Plantilla y juez */}
      <div className="mt-1 flex flex-wrap gap-2">
        {/* Plantilla */}
        <form action={templateAction} className="flex items-center gap-1">
          <input type="hidden" name="postaId" value={posta.id} />
          <span className="text-xs text-gray-500">{m.row.plantilla}:</span>
          {currentTemplate?.archivedAt && (
            <span className="text-xs text-amber-600">[Archivada]</span>
          )}
          <select
            name="templateId"
            value={selectedTemplateId}
            onChange={(e) => {
              setSelectedTemplateId(e.target.value)
              const form = e.target.closest("form") as HTMLFormElement
              form?.requestSubmit()
            }}
            disabled={isLocked || templatePending}
            className="rounded border bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            <option value="">{m.row.plantillaSinAsignar}</option>
            {currentTemplate && !templates.find((t) => t.id === currentTemplate.id) && (
              <option value={currentTemplate.id}>{currentTemplate.nombre}</option>
            )}
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.nombre}</option>
            ))}
          </select>
        </form>

        {/* Juez */}
        <form action={juezAction} className="flex items-center gap-1">
          <input type="hidden" name="postaId" value={posta.id} />
          <span className="text-xs text-gray-500">{m.row.juez}:</span>
          <select
            name="juezUserId"
            value={selectedJuezId}
            onChange={(e) => {
              setSelectedJuezId(e.target.value)
              const form = e.target.closest("form") as HTMLFormElement
              form?.requestSubmit()
            }}
            disabled={isLocked || juezPending}
            className="rounded border bg-white px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand disabled:opacity-50"
          >
            <option value="">{m.row.juezSinAsignar}</option>
            {jueces.map((j) => (
              <option key={j.userId} value={j.userId}>{j.name ?? j.email}</option>
            ))}
          </select>
        </form>
      </div>
    </div>
  )
}
