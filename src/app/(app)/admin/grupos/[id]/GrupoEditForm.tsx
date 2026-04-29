"use client"
import { useActionState } from "react"
import { updateGrupo, deleteGrupo } from "../actions"
import messages from "@/messages/es.json"

interface Props {
  grupo: { id: string; nombre: string; slug: string }
}

export function GrupoEditForm({ grupo }: Props) {
  const [updateState, updateAction, updatePending] = useActionState(updateGrupo, null)
  const [deleteState, deleteAction, deletePending] = useActionState(deleteGrupo, null)

  function handleDelete(e: React.FormEvent<HTMLFormElement>) {
    const ok = window.confirm(
      messages.admin.grupos.deleteConfirm.replace("{{nombre}}", grupo.nombre),
    )
    if (!ok) e.preventDefault()
  }

  return (
    <div className="max-w-lg space-y-6">
      <form action={updateAction} className="space-y-5 rounded-xl border bg-white p-5 shadow-sm">
        <input type="hidden" name="id" value={grupo.id} />
        <h2 className="text-lg font-semibold text-gray-900">Editar grupo</h2>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {messages.admin.grupos.nombreLabel}
          </label>
          <input
            name="nombre"
            defaultValue={grupo.nombre}
            required
            minLength={2}
            maxLength={100}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {messages.admin.grupos.slugLabel}
          </label>
          <input
            name="slug"
            defaultValue={grupo.slug}
            required
            minLength={2}
            maxLength={50}
            pattern="[a-z0-9-]+"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
        {updateState?.error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{updateState.error}</p>
        )}
        {updateState?.success && (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">Cambios guardados</p>
        )}
        <button
          type="submit"
          disabled={updatePending}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {updatePending ? "Guardando..." : messages.admin.grupos.submit}
        </button>
      </form>

      <form action={deleteAction} onSubmit={handleDelete} className="rounded-xl border border-red-200 bg-red-50 p-5">
        <input type="hidden" name="id" value={grupo.id} />
        <h3 className="mb-2 text-sm font-semibold text-red-800">Zona peligrosa</h3>
        {deleteState?.error && (
          <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700">{deleteState.error}</p>
        )}
        <button
          type="submit"
          disabled={deletePending}
          className="rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
        >
          {deletePending ? "Borrando..." : "Borrar grupo"}
        </button>
      </form>
    </div>
  )
}
