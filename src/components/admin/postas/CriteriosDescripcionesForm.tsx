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
  const [activeId, setActiveId] = useState(templates[0]?.id)

  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Esta posta todavía no está asignada a ninguna actividad con plantilla — la leyenda se puede cargar una vez que lo esté.
      </p>
    )
  }

  const active = templates.find((t) => t.id === activeId) ?? templates[0]!

  return (
    <div className="space-y-4">
      {templates.length > 1 && (
        <div className="relative">
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveId(t.id)}
                className={[
                  "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
                  t.id === active.id
                    ? "bg-brand text-white"
                    : "border border-gray-200 text-gray-600 hover:border-brand/40 hover:bg-brand/5 hover:text-brand",
                ].join(" ")}
              >
                {t.nombre}
              </button>
            ))}
          </div>
          {/* Fade hint that content scrolls */}
          <div className="pointer-events-none absolute right-0 top-0 h-full w-8 bg-gradient-to-l from-white" />
        </div>
      )}

      <div className="space-y-4">
        {active.modo === "PUNTAJE_UNICO" ? (
          <LeyendaRow
            key={`${active.id}-unico`}
            postaId={postaId}
            scope="unico"
            valores={active.valoresValidos}
            initial={criteriosDescripciones.unico ?? {}}
          />
        ) : (
          active.criterios.map((c) => (
            <div key={`${active.id}-${c.id}`}>
              <p className="mb-1 text-xs font-medium text-gray-500">{c.nombre}</p>
              <LeyendaRow
                postaId={postaId}
                scope={c.id}
                valores={
                  c.tipo === "DESEMPATE" && active.valoresValidosDesempate.length > 0
                    ? active.valoresValidosDesempate
                    : active.valoresValidos
                }
                initial={criteriosDescripciones.criterios?.[c.id] ?? {}}
              />
            </div>
          ))
        )}
      </div>
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
    <form action={action} className="space-y-2 rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <input type="hidden" name="postaId" value={postaId} />
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="valores" value={JSON.stringify(values)} />

      <div className="space-y-2">
        {valores.map((v) => (
          <div key={v} className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-2 border-gray-200 bg-white text-sm font-bold text-gray-700">
              {v}
            </span>
            <input
              value={values[String(v)] ?? ""}
              onChange={(e) => setValues((prev) => ({ ...prev, [String(v)]: e.target.value }))}
              placeholder="Qué significa este puntaje"
              maxLength={200}
              className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 pt-1">
        {isDirty && (
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {pending ? "Guardando..." : "Guardar"}
          </button>
        )}
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
      </div>
    </form>
  )
}
