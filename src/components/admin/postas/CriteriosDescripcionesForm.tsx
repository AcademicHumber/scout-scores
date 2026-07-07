"use client"

import { useActionState, useEffect, useState } from "react"
import type { UpdateCriteriosDescripcionesState } from "@/app/(app)/admin/postas/[id]/actions"
import { LeyendaValores } from "./LeyendaValores"

type Criterio = { id: string; nombre: string; tipo: "PUNTUABLE" | "DESEMPATE" }

export type TemplateInfo = {
  id: string
  nombre: string
  modo: "CRITERIOS" | "PUNTAJE_UNICO"
  valoresValidos: number[]
  valoresValidosDesempate: number[]
  criterios: Criterio[]
}

export type CriteriosDescripciones = {
  criterios?: Record<string, Record<string, string>>
  unico?: Record<string, string>
}

type UpdateCriteriosDescripcionesAction = (
  prevState: UpdateCriteriosDescripcionesState,
  formData: FormData,
) => Promise<UpdateCriteriosDescripcionesState>

type Props = {
  templates: TemplateInfo[]
  criteriosDescripciones: CriteriosDescripciones
} & (
  | { mode: "persist"; postaId: string; updateAction: UpdateCriteriosDescripcionesAction }
  | { mode: "controlled"; onChange: (value: CriteriosDescripciones) => void }
)

export function CriteriosDescripcionesForm(props: Props) {
  const { templates, criteriosDescripciones } = props
  const [activeId, setActiveId] = useState(templates[0]?.id)

  if (templates.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Esta posta todavía no está asignada a ninguna actividad con plantilla — la leyenda se puede cargar una vez que lo esté.
      </p>
    )
  }

  const active = templates.find((t) => t.id === activeId) ?? templates[0]!

  function setScope(scope: string, valores: Record<string, string>) {
    if (props.mode !== "controlled") return
    props.onChange(
      scope === "unico"
        ? { ...criteriosDescripciones, unico: valores }
        : { ...criteriosDescripciones, criterios: { ...(criteriosDescripciones.criterios ?? {}), [scope]: valores } },
    )
  }

  function renderScope(scope: string, valores: number[], initial: Record<string, string>) {
    if (props.mode === "persist") {
      return (
        <PersistedLeyendaScope
          postaId={props.postaId}
          scope={scope}
          valores={valores}
          initial={initial}
          updateAction={props.updateAction}
        />
      )
    }
    return (
      <ControlledLeyendaScope
        valores={valores}
        initial={initial}
        onChange={(value) => setScope(scope, value)}
      />
    )
  }

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
          <div key={`${active.id}-unico`}>
            {renderScope("unico", active.valoresValidos, criteriosDescripciones.unico ?? {})}
          </div>
        ) : (
          active.criterios.map((c) => (
            <div key={`${active.id}-${c.id}`}>
              <p className="mb-1 text-xs font-medium text-gray-500">{c.nombre}</p>
              {renderScope(
                c.id,
                c.tipo === "DESEMPATE" && active.valoresValidosDesempate.length > 0
                  ? active.valoresValidosDesempate
                  : active.valoresValidos,
                criteriosDescripciones.criterios?.[c.id] ?? {},
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function ControlledLeyendaScope({
  valores,
  initial,
  onChange,
}: {
  valores: number[]
  initial: Record<string, string>
  onChange: (value: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(initial)

  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
      <LeyendaValores
        valores={valores}
        values={values}
        onChange={(valor, texto) => {
          const next = { ...values, [valor]: texto }
          setValues(next)
          onChange(next)
        }}
      />
    </div>
  )
}

function PersistedLeyendaScope({
  postaId,
  scope,
  valores,
  initial,
  updateAction,
}: {
  postaId: string
  scope: string
  valores: number[]
  initial: Record<string, string>
  updateAction: UpdateCriteriosDescripcionesAction
}) {
  const [state, action, pending] = useActionState(updateAction, {})
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

      <LeyendaValores
        valores={valores}
        values={values}
        onChange={(valor, texto) => setValues((prev) => ({ ...prev, [valor]: texto }))}
      />

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
