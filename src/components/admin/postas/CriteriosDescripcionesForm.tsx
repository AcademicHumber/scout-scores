"use client"

import { useActionState, useEffect, useState } from "react"
import { updateCriteriosDescripcionesAction } from "@/app/(app)/admin/postas/[id]/actions"

type Criterio = { id: string; nombre: string; tipo: "PUNTUABLE" | "DESEMPATE" }

type TemplateInfo = {
  id: string
  nombre: string
  modo: "CRITERIOS" | "PUNTAJE_UNICO"
  valoresValidos: number[]
  valoresValidosDesempate: number[]
  criterios: Criterio[]
}

type CriteriosDescripciones = {
  criterios?: Record<string, Record<string, string>>
  unico?: Record<string, string>
}

type Props = {
  postaId: string
  templates: TemplateInfo[]
  criteriosDescripciones: CriteriosDescripciones
}

export function CriteriosDescripcionesForm({ postaId, templates, criteriosDescripciones }: Props) {
  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Esta posta todavía no está asignada a ninguna actividad con plantilla — la leyenda se puede cargar una vez que lo esté.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      {templates.map((t) => (
        <div key={t.id} className="space-y-3">
          <p className="text-sm font-medium text-gray-700">{t.nombre}</p>
          {t.modo === "PUNTAJE_UNICO" ? (
            <LeyendaRow
              postaId={postaId}
              scope="unico"
              valores={t.valoresValidos}
              initial={criteriosDescripciones.unico ?? {}}
            />
          ) : (
            <div className="space-y-4">
              {t.criterios.map((c) => (
                <div key={c.id}>
                  <p className="mb-1 text-xs font-medium text-gray-500">{c.nombre}</p>
                  <LeyendaRow
                    postaId={postaId}
                    scope={c.id}
                    valores={
                      c.tipo === "DESEMPATE" && t.valoresValidosDesempate.length > 0
                        ? t.valoresValidosDesempate
                        : t.valoresValidos
                    }
                    initial={criteriosDescripciones.criterios?.[c.id] ?? {}}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function LeyendaRow({
  postaId,
  scope,
  valores,
  initial,
}: {
  postaId: string
  scope: string
  valores: number[]
  initial: Record<string, string>
}) {
  const [state, action, pending] = useActionState(updateCriteriosDescripcionesAction, {})
  const [values, setValues] = useState<Record<string, string>>(initial)
  const [saved, setSaved] = useState<Record<string, string>>(initial)

  useEffect(() => {
    if (state.success) setSaved(values)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

  const isDirty = JSON.stringify(values) !== JSON.stringify(saved)

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="postaId" value={postaId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="valores" value={JSON.stringify(values)} />
      {valores.map((v) => (
        <div key={v}>
          <label className="mb-0.5 block text-xs text-gray-400">{v}</label>
          <input
            value={values[String(v)] ?? ""}
            onChange={(e) => setValues((prev) => ({ ...prev, [String(v)]: e.target.value }))}
            placeholder="Qué significa este puntaje"
            maxLength={200}
            className="w-44 rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand"
          />
        </div>
      ))}
      {isDirty && (
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-brand px-2 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {pending ? "..." : "Guardar"}
        </button>
      )}
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  )
}
