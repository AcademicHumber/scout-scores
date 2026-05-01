"use client"
import { useActionState, useState, useEffect } from "react"
import { addCriterio } from "@/app/(app)/admin/plantillas/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

type Props = {
  templateId: string
  modo: "CRITERIOS" | "PUNTAJE_UNICO"
  locked: boolean
}

export function AddCriterioForm({ templateId, modo, locked }: Props) {
  const [state, action, pending] = useActionState(addCriterio, null)
  const [nombre, setNombre] = useState("")
  const [tipo, setTipo] = useState<"PUNTUABLE" | "DESEMPATE">(modo === "PUNTAJE_UNICO" ? "DESEMPATE" : "PUNTUABLE")
  const [descripcion, setDescripcion] = useState("")

  useEffect(() => {
    if (state && "success" in state && state.success) {
      setNombre("")
      setDescripcion("")
      setTipo(modo === "PUNTAJE_UNICO" ? "DESEMPATE" : "PUNTUABLE")
    }
  }, [state, modo])

  if (locked) return null

  return (
    <form action={action} className="rounded-lg border border-dashed p-4">
      <p className="mb-3 text-sm font-medium text-gray-600">
        + {modo === "PUNTAJE_UNICO" ? m.form.addCriterioDesempate : m.form.addCriterio}
      </p>
      <input type="hidden" name="templateId" value={templateId} />
      <div className="space-y-2">
        <div className="flex gap-2">
          <input
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder={m.form.criterioNombre}
            required
            minLength={2}
            maxLength={100}
            className="flex-1 rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
          />
          <select
            name="tipo"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "PUNTUABLE" | "DESEMPATE")}
            disabled={modo === "PUNTAJE_UNICO"}
            className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-100"
          >
            {modo !== "PUNTAJE_UNICO" && (
              <option value="PUNTUABLE">{m.criteriosTipo.PUNTUABLE}</option>
            )}
            <option value="DESEMPATE">{m.criteriosTipo.DESEMPATE}</option>
          </select>
        </div>
        <input
          name="descripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          placeholder={m.form.criterioDescripcion}
          maxLength={500}
          className="w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
        />
        {state?.error && <p className="text-xs text-red-600">{state.error}</p>}
        <button
          type="submit"
          disabled={pending || !nombre.trim()}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Agregando..." : m.form.addCriterio}
        </button>
      </div>
    </form>
  )
}
