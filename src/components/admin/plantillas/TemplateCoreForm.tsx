"use client"
import { useActionState, useState, useEffect } from "react"
import { updateCore } from "@/app/(app)/admin/plantillas/[id]/actions"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

type Props = {
  template: {
    id: string
    modo: "CRITERIOS" | "PUNTAJE_UNICO"
    valoresValidos: string[]
    valoresValidosDesempate: string[]
  }
  locked: boolean
}

export function TemplateCoreForm({ template, locked }: Props) {
  const [state, action, pending] = useActionState(updateCore, null)

  const [modo, setModo] = useState(template.modo)
  const [valoresValidos, setValoresValidos] = useState<string[]>(template.valoresValidos)
  const [valorInput, setValorInput] = useState("")
  const [usarEscalaDesempate, setUsarEscalaDesempate] = useState(template.valoresValidosDesempate.length > 0)
  const [valoresDesempate, setValoresDesempate] = useState<string[]>(template.valoresValidosDesempate)
  const [valorDesempateInput, setValorDesempateInput] = useState("")

  const [savedModo, setSavedModo] = useState(template.modo)
  const [savedVv, setSavedVv] = useState<string[]>(template.valoresValidos)
  const [savedVvd, setSavedVvd] = useState<string[]>(template.valoresValidosDesempate)

  useEffect(() => {
    if (state?.success) {
      setSavedModo(state.modo as "CRITERIOS" | "PUNTAJE_UNICO")
      setSavedVv(state.valoresValidos as string[])
      setSavedVvd(state.valoresValidosDesempate as string[])
    }
  }, [state])

  const isDirty =
    modo !== savedModo ||
    JSON.stringify(valoresValidos) !== JSON.stringify(savedVv) ||
    JSON.stringify(usarEscalaDesempate ? valoresDesempate : []) !== JSON.stringify(savedVvd)

  function addValor() {
    const v = valorInput.trim()
    if (v && !valoresValidos.includes(v)) setValoresValidos((p) => [...p, v].sort((a, b) => Number(a) - Number(b)))
    setValorInput("")
  }

  function addValorDesempate() {
    const v = valorDesempateInput.trim()
    if (v && !valoresDesempate.includes(v)) setValoresDesempate((p) => [...p, v].sort((a, b) => Number(a) - Number(b)))
    setValorDesempateInput("")
  }

  const escalaDesempateFinal = usarEscalaDesempate ? valoresDesempate : []

  const bloqueantes = state?.error === "MODO_INCOMPATIBLE" ? (state.criteriosBloqueantes as string) : null

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="id" value={template.id} />

      {bloqueantes && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {m.detail.modoIncompatibleNotice} <strong>{bloqueantes}</strong>
        </div>
      )}

      {locked && (
        <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">{m.detail.lockedNotice}</div>
      )}

      {/* Modo */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">{m.form.modo}</p>
        <div className="space-y-2">
          {(["CRITERIOS", "PUNTAJE_UNICO"] as const).map((m_) => (
            <label key={m_} className={`flex cursor-pointer items-center gap-3 ${locked ? "opacity-50" : ""}`}>
              <input
                type="radio"
                name="modo"
                value={m_}
                checked={modo === m_}
                onChange={() => !locked && setModo(m_)}
                disabled={locked}
                className="accent-brand"
              />
              <span className="text-sm text-gray-700">
                {m_ === "CRITERIOS" ? m.form.modoCriterios : m.form.modoPuntajeUnico}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Escala principal */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.valoresValidos}</label>
        <div className="mb-2 flex flex-wrap gap-2">
          {valoresValidos.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-sm text-brand">
              {v}
              {!locked && (
                <button type="button" onClick={() => setValoresValidos((p) => p.filter((x) => x !== v))} className="ml-1 text-brand/60 hover:text-red-500">×</button>
              )}
            </span>
          ))}
        </div>
        {!locked && (
          <div className="flex gap-2">
            <input type="number" step="any" value={valorInput} onChange={(e) => setValorInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValor())}
              placeholder="ej: 10" className="w-32 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
            <button type="button" onClick={addValor} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
              {m.form.addValor}
            </button>
          </div>
        )}
        {valoresValidos.map((v, i) => (
          <input key={i} type="hidden" name="valoresValidos" value={v} />
        ))}
      </div>

      {/* Escala desempate */}
      <div>
        <label className={`flex cursor-pointer items-center gap-3 ${locked ? "opacity-50" : ""}`}>
          <input type="checkbox" checked={usarEscalaDesempate} onChange={(e) => !locked && setUsarEscalaDesempate(e.target.checked)} disabled={locked} className="accent-brand" />
          <span className="text-sm font-medium text-gray-700">{m.form.valoresValidosDesempateToggle}</span>
        </label>

        {usarEscalaDesempate && (
          <div className="mt-3 rounded-lg border bg-gray-50 p-4">
            <p className="mb-1 text-sm font-medium text-gray-700">{m.form.valoresValidosDesempate}</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {valoresDesempate.map((v) => (
                <span key={v} className="flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
                  {v}
                  {!locked && (
                    <button type="button" onClick={() => setValoresDesempate((p) => p.filter((x) => x !== v))} className="ml-1 text-purple-400 hover:text-red-500">×</button>
                  )}
                </span>
              ))}
            </div>
            {!locked && (
              <div className="flex gap-2">
                <input type="number" step="any" value={valorDesempateInput} onChange={(e) => setValorDesempateInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValorDesempate())}
                  placeholder="ej: 3" className="w-32 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand" />
                <button type="button" onClick={addValorDesempate} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  {m.form.addValor}
                </button>
              </div>
            )}
          </div>
        )}

        {escalaDesempateFinal.map((v, i) => (
          <input key={i} type="hidden" name="valoresValidosDesempate" value={v} />
        ))}
        {escalaDesempateFinal.length === 0 && (
          <input type="hidden" name="valoresValidosDesempate" value="" />
        )}
      </div>

      {!locked && (
        <div className="flex items-center gap-3">
          {isDirty && (
            <button type="submit" disabled={pending}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
              {pending ? "..." : m.detail.saveCore}
            </button>
          )}
          {state?.success && !isDirty && (
            <span className="text-sm text-green-600">{m.detail.saved}</span>
          )}
          {state?.error && state.error !== "MODO_INCOMPATIBLE" && (
            <span className="text-sm text-red-600">{state.error}</span>
          )}
        </div>
      )}
    </form>
  )
}
