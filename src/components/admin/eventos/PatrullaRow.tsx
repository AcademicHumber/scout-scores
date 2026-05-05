"use client"

import { useActionState, useEffect, useState } from "react"
import { updatePatrullaAction, deletePatrullaAction } from "@/app/(app)/admin/eventos/[id]/actions"
import messages from "@/messages/es.json"
import type { PatrullaCategoria } from "@/generated/prisma/enums"

const m = messages.admin.eventos.patrullas

const CATEGORIAS = ["LOBATO", "EXPLORADOR", "PIONERO", "ROVER"] as const

type Props = {
  patrulla: {
    id: string
    nombre: string
    grupoScoutId: string
    grupoScout: { id: string; nombre: string }
    categoria: PatrullaCategoria | null
  }
  grupos: Array<{ id: string; nombre: string }>
}

export function PatrullaRow({ patrulla, grupos }: Props) {
  const [editState, editAction, editPending] = useActionState(updatePatrullaAction, {})
  const [deleteState, deleteAction, deletePending] = useActionState(deletePatrullaAction, {})

  const [nombre, setNombre] = useState(patrulla.nombre)
  const [grupoScoutId, setGrupoScoutId] = useState(patrulla.grupoScoutId)
  const [categoria, setCategoria] = useState<PatrullaCategoria | "">(patrulla.categoria ?? "")

  const [savedNombre, setSavedNombre] = useState(patrulla.nombre)
  const [savedGrupoScoutId, setSavedGrupoScoutId] = useState(patrulla.grupoScoutId)
  const [savedCategoria, setSavedCategoria] = useState<PatrullaCategoria | "">(patrulla.categoria ?? "")

  const isDirty = nombre !== savedNombre || grupoScoutId !== savedGrupoScoutId || categoria !== savedCategoria

  useEffect(() => {
    if (editState.patrulla) {
      setSavedNombre(editState.patrulla.nombre)
      setSavedGrupoScoutId(editState.patrulla.grupoScoutId)
      setSavedCategoria(editState.patrulla.categoria ?? "")
    }
  }, [editState])

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const errorMsg = editState.error ?? deleteState.error

  return (
    <div className="rounded-lg border bg-white p-2">
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
          maxLength={80}
          placeholder={m.row.nombre}
          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />

        {/* Grupo */}
        <select
          value={grupoScoutId}
          onChange={(e) => setGrupoScoutId(e.target.value)}
          className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        >
          {grupos.map((g) => (
            <option key={g.id} value={g.id}>{g.nombre}</option>
          ))}
        </select>

        {/* Categoría */}
        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value as PatrullaCategoria | "")}
          className="rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        >
          <option value="">{m.row.categoriaPlaceholder}</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{m.categoria[c]}</option>
          ))}
        </select>

        {/* Guardar */}
        {isDirty && (
          <form action={editAction}>
            <input type="hidden" name="patrullaId" value={patrulla.id} />
            <input type="hidden" name="nombre" value={nombre} />
            <input type="hidden" name="grupoScoutId" value={grupoScoutId} />
            <input type="hidden" name="categoria" value={categoria} />
            <button
              type="submit"
              disabled={editPending}
              className="rounded bg-brand px-2 py-1 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
            >
              {editPending ? "..." : m.row.save}
            </button>
          </form>
        )}

        {/* Eliminar */}
        {showDeleteConfirm ? (
          <form action={deleteAction} className="flex items-center gap-1">
            <input type="hidden" name="patrullaId" value={patrulla.id} />
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
              className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
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
        )}
      </div>
    </div>
  )
}
