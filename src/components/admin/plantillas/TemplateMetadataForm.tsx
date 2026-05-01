"use client"
import { useActionState, useState, useEffect } from "react"
import { updateMetadata } from "@/app/(app)/admin/plantillas/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

type Props = {
  template: {
    id: string
    nombre: string
    descripcion: string | null
    categoria: string
  }
}

export function TemplateMetadataForm({ template }: Props) {
  const [state, action, pending] = useActionState(updateMetadata, null)

  const [nombre, setNombre] = useState(template.nombre)
  const [descripcion, setDescripcion] = useState(template.descripcion ?? "")
  const [categoria, setCategoria] = useState(template.categoria)

  const [savedNombre, setSavedNombre] = useState(template.nombre)
  const [savedDescripcion, setSavedDescripcion] = useState(template.descripcion ?? "")
  const [savedCategoria, setSavedCategoria] = useState(template.categoria)

  useEffect(() => {
    if (state?.success) {
      setSavedNombre(state.nombre as string)
      setSavedDescripcion((state.descripcion as string | undefined) ?? "")
      setSavedCategoria(state.categoria as string)
    }
  }, [state])

  const isDirty = nombre !== savedNombre || descripcion !== savedDescripcion || categoria !== savedCategoria

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={template.id} />

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.nombre}</label>
        <input
          name="nombre"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
          minLength={2}
          maxLength={100}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.descripcion}</label>
        <textarea
          name="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          maxLength={500}
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.categoria}</label>
        <select
          name="categoria"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          {Object.entries(m.categoria).map(([k, label]) => (
            <option key={k} value={k}>{label}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        {isDirty && (
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "..." : m.detail.saveMetadata}
          </button>
        )}
        {state?.success && !isDirty && (
          <span className="text-sm text-green-600">{m.detail.saved}</span>
        )}
        {state?.error && (
          <span className="text-sm text-red-600">{state.error}</span>
        )}
      </div>
    </form>
  )
}
