"use client"
import { useActionState, useState } from "react"
import { createTemplate } from "@/app/(app)/admin/plantillas/actions"
import messages from "@/messages/es.json"

const m = messages.admin.plantillas

type CriterioInput = { nombre: string; descripcion: string; tipo: "PUNTUABLE" | "DESEMPATE" }

const CATEGORIA_DEFAULTS: Record<
  string,
  {
    modo: "CRITERIOS" | "PUNTAJE_UNICO"
    valoresValidos: string[]
    valoresValidosDesempate: string[]
    usarEscalaDesempate: boolean
  }
> = {
  COMPETICION: {
    modo: "PUNTAJE_UNICO",
    valoresValidos: ["5", "7", "10"],
    valoresValidosDesempate: ["0", "1", "2", "3"],
    usarEscalaDesempate: true,
  },
  CONSTRUCCION: {
    modo: "CRITERIOS",
    valoresValidos: ["5", "7", "10"],
    valoresValidosDesempate: [],
    usarEscalaDesempate: false,
  },
  COCINA: {
    modo: "CRITERIOS",
    valoresValidos: ["5", "7", "10"],
    valoresValidosDesempate: [],
    usarEscalaDesempate: false,
  },
}

export function TemplateForm() {
  const [state, action, pending] = useActionState(createTemplate, null)

  const [categoria, setCategoria] = useState("")
  const [modo, setModo] = useState<"CRITERIOS" | "PUNTAJE_UNICO">("CRITERIOS")
  const [valoresValidos, setValoresValidos] = useState<string[]>(["5", "7", "10"])
  const [valorInput, setValorInput] = useState("")
  const [usarEscalaDesempate, setUsarEscalaDesempate] = useState(false)
  const [valoresDesempate, setValoresDesempate] = useState<string[]>([])
  const [valorDesempateInput, setValorDesempateInput] = useState("")
  const [criterios, setCriterios] = useState<CriterioInput[]>([])

  function handleCategoriaChange(cat: string) {
    setCategoria(cat)
    const defaults = CATEGORIA_DEFAULTS[cat]
    if (defaults) {
      setModo(defaults.modo)
      setValoresValidos(defaults.valoresValidos)
      setUsarEscalaDesempate(defaults.usarEscalaDesempate)
      setValoresDesempate(defaults.valoresValidosDesempate)
    }
  }

  function addValor() {
    const v = valorInput.trim()
    if (v && !valoresValidos.includes(v)) setValoresValidos((prev) => [...prev, v].sort((a, b) => Number(a) - Number(b)))
    setValorInput("")
  }

  function removeValor(v: string) {
    setValoresValidos((prev) => prev.filter((x) => x !== v))
  }

  function addValorDesempate() {
    const v = valorDesempateInput.trim()
    if (v && !valoresDesempate.includes(v))
      setValoresDesempate((prev) => [...prev, v].sort((a, b) => Number(a) - Number(b)))
    setValorDesempateInput("")
  }

  function removeValorDesempate(v: string) {
    setValoresDesempate((prev) => prev.filter((x) => x !== v))
  }

  function addCriterio() {
    const tipo: "PUNTUABLE" | "DESEMPATE" = modo === "PUNTAJE_UNICO" ? "DESEMPATE" : "PUNTUABLE"
    setCriterios((prev) => [...prev, { nombre: "", descripcion: "", tipo }])
  }

  function updateCriterio(idx: number, field: keyof CriterioInput, value: string) {
    setCriterios((prev) => prev.map((c, i) => (i === idx ? { ...c, [field]: value } : c)))
  }

  function removeCriterio(idx: number) {
    setCriterios((prev) => prev.filter((_, i) => i !== idx))
  }

  const escalaDesempateFinal = usarEscalaDesempate ? valoresDesempate : []

  return (
    <form action={action} className="space-y-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{state.error}</div>
      )}

      {/* Nombre */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.nombre}</label>
        <input
          name="nombre"
          required
          minLength={2}
          maxLength={100}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Descripción */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.descripcion}</label>
        <textarea
          name="descripcion"
          maxLength={500}
          rows={2}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
      </div>

      {/* Categoría */}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">{m.form.categoria}</label>
        <select
          name="categoria"
          required
          value={categoria}
          onChange={(e) => handleCategoriaChange(e.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        >
          <option value="">{m.form.selectCategoria}</option>
          {Object.entries(m.categoria).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {/* Modo */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">{m.form.modo}</p>
        <div className="space-y-2">
          {(["CRITERIOS", "PUNTAJE_UNICO"] as const).map((m_) => (
            <label key={m_} className="flex cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="modo"
                value={m_}
                checked={modo === m_}
                onChange={() => setModo(m_)}
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
        <p className="mb-2 text-xs text-gray-500">{m.form.valoresValidosHelp}</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {valoresValidos.map((v) => (
            <span key={v} className="flex items-center gap-1 rounded-full bg-brand/10 px-3 py-1 text-sm text-brand">
              {v}
              <button type="button" onClick={() => removeValor(v)} className="ml-1 text-brand/60 hover:text-red-500">
                ×
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            value={valorInput}
            onChange={(e) => setValorInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValor())}
            placeholder="ej: 10"
            className="w-32 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          <button type="button" onClick={addValor} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
            {m.form.addValor}
          </button>
        </div>
        {/* Hidden inputs para el form */}
        {valoresValidos.map((v, i) => (
          <input key={i} type="hidden" name="valoresValidos" value={v} />
        ))}
      </div>

      {/* Toggle escala secundaria */}
      <div>
        <label className="flex cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={usarEscalaDesempate}
            onChange={(e) => setUsarEscalaDesempate(e.target.checked)}
            className="accent-brand"
          />
          <span className="text-sm font-medium text-gray-700">{m.form.valoresValidosDesempateToggle}</span>
        </label>

        {usarEscalaDesempate && (
          <div className="mt-3 rounded-lg border bg-gray-50 p-4">
            <p className="mb-1 text-sm font-medium text-gray-700">{m.form.valoresValidosDesempate}</p>
            <p className="mb-2 text-xs text-gray-500">{m.form.valoresValidosDesempateHelp}</p>
            <div className="mb-2 flex flex-wrap gap-2">
              {valoresDesempate.map((v) => (
                <span key={v} className="flex items-center gap-1 rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">
                  {v}
                  <button type="button" onClick={() => removeValorDesempate(v)} className="ml-1 text-purple-400 hover:text-red-500">
                    ×
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="number"
                step="any"
                value={valorDesempateInput}
                onChange={(e) => setValorDesempateInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addValorDesempate())}
                placeholder="ej: 3"
                className="w-32 rounded-lg border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button type="button" onClick={addValorDesempate} className="rounded-lg border px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                {m.form.addValor}
              </button>
            </div>
          </div>
        )}

        {/* Hidden inputs para escala desempate (vacíos si no se usa = [] heredar) */}
        {escalaDesempateFinal.map((v, i) => (
          <input key={i} type="hidden" name="valoresValidosDesempate" value={v} />
        ))}
        {escalaDesempateFinal.length === 0 && (
          <input type="hidden" name="valoresValidosDesempate" value="" />
        )}
      </div>

      {/* Criterios */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700">
          {modo === "PUNTAJE_UNICO" ? m.form.criteriosDesempate : m.form.criterios}
        </p>

        {criterios.length > 0 && (
          <div className="mb-3 space-y-3">
            {criterios.map((c, idx) => (
              <div key={idx} className="rounded-lg border bg-gray-50 p-3">
                <div className="mb-2 flex gap-3">
                  <div className="flex-1">
                    <input
                      placeholder={m.form.criterioNombre}
                      value={c.nombre}
                      onChange={(e) => updateCriterio(idx, "nombre", e.target.value)}
                      className="w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                      name={`criterios[${idx}][nombre]`}
                    />
                  </div>
                  <div>
                    <select
                      value={c.tipo}
                      onChange={(e) => updateCriterio(idx, "tipo", e.target.value)}
                      disabled={modo === "PUNTAJE_UNICO"}
                      className="rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand disabled:bg-gray-100 disabled:text-gray-400"
                      name={`criterios[${idx}][tipo]`}
                    >
                      {modo !== "PUNTAJE_UNICO" && (
                        <option value="PUNTUABLE">{m.form.criterioPUNTUABLE}</option>
                      )}
                      <option value="DESEMPATE">{m.form.criterioDESEMPATE}</option>
                    </select>
                  </div>
                  <button type="button" onClick={() => removeCriterio(idx)} className="text-gray-400 hover:text-red-500">
                    {m.form.removeCriterio}
                  </button>
                </div>
                <input
                  placeholder={m.form.criterioDescripcion}
                  value={c.descripcion}
                  onChange={(e) => updateCriterio(idx, "descripcion", e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  name={`criterios[${idx}][descripcion]`}
                />
              </div>
            ))}
          </div>
        )}

        <button type="button" onClick={addCriterio} className="rounded-lg border border-dashed px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
          + {modo === "PUNTAJE_UNICO" ? m.form.addCriterioDesempate : m.form.addCriterio}
        </button>
      </div>

      <div className="pt-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Creando..." : m.form.submit}
        </button>
      </div>
    </form>
  )
}
