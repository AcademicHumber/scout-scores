"use client"

import { useActionState, useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import {
  saveScoreSheetAction,
  submitScoreSheetAction,
  type SaveScoreSheetState,
} from "@/app/(app)/juez/postas/[asignacionId]/actions"

type Criterio = {
  id: string
  nombre: string
  descripcion: string | null
  tipo: "PUNTUABLE" | "DESEMPATE"
  orden: number
}

type Template = {
  id: string
  modo: "CRITERIOS" | "PUNTAJE_UNICO"
  valoresValidos: unknown[]
  valoresValidosDesempate: unknown[]
  criterios: Criterio[]
}

type Props = {
  asignacionId: string
  patrullaId: string
  patrullaNombre: string
  backHref: string
  template: Template | null
  initialPuntajeUnico?: number | null
  initialEntries?: { criterionId: string; valor: number }[]
  isEnviada?: boolean
  totalPuntuable?: string | null
  totalDesempate?: string | null
}

function toNumberList(vals: unknown[]): number[] {
  return vals.map((v) => Number(v))
}

function ScaleButtons({
  valores,
  selected,
  onSelect,
  disabled,
}: {
  valores: number[]
  selected: number | null
  onSelect: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {valores.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => !disabled && onSelect(v)}
          disabled={disabled}
          className={[
            "min-h-[48px] min-w-[52px] rounded-lg border-2 text-base font-semibold transition-colors",
            selected === v
              ? "border-brand bg-brand text-white"
              : "border-gray-200 bg-white text-gray-700 hover:border-brand hover:text-brand",
            disabled ? "opacity-60 cursor-not-allowed" : "",
          ].join(" ")}
        >
          {v}
        </button>
      ))}
    </div>
  )
}

export function ScoreSheetForm({
  asignacionId,
  patrullaId,
  patrullaNombre,
  backHref,
  template,
  initialPuntajeUnico,
  initialEntries,
  isEnviada,
  totalPuntuable,
  totalDesempate,
}: Props) {
  const router = useRouter()

  const initMap = new Map<string, number>(
    (initialEntries ?? []).map((e) => [e.criterionId, e.valor]),
  )

  const [puntajeUnico, setPuntajeUnico] = useState<number | null>(initialPuntajeUnico ?? null)
  const [entries, setEntries] = useState<Map<string, number>>(initMap)
  const [showDesempate, setShowDesempate] = useState(false)

  const initialSaveState: SaveScoreSheetState = {}
  const initialSubmitState: SaveScoreSheetState = {}

  const [saveState, saveDispatch, savePending] = useActionState(saveScoreSheetAction, initialSaveState)
  const [submitState, submitDispatch, submitPending] = useActionState(submitScoreSheetAction, initialSubmitState)

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    if (saveState.success) {
      setToastMsg("Borrador guardado")
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMsg(null), 3000)
    }
  }, [saveState])

  useEffect(() => {
    if (submitState.success && submitState.enviado) {
      router.push(backHref)
    }
  }, [submitState, router, backHref])

  function buildFormData(): FormData {
    const fd = new FormData()
    fd.set("asignacionId", asignacionId)
    fd.set("patrullaId", patrullaId)
    const entriesArr = Array.from(entries.entries()).map(([criterionId, valor]) => ({
      criterionId,
      valor: String(valor),
    }))
    fd.set("entries", JSON.stringify(entriesArr))
    fd.set("puntajeUnico", puntajeUnico != null ? String(puntajeUnico) : "")
    return fd
  }

  const errorMsg = saveState.error ?? submitState.error
  const isPending = savePending || submitPending
  const disabled = isPending || isEnviada

  const valores = template ? toNumberList(template.valoresValidos) : []
  const valoresDesempate = template
    ? toNumberList(
        template.valoresValidosDesempate.length > 0
          ? template.valoresValidosDesempate
          : template.valoresValidos,
      )
    : []

  const criteriosPuntuables = (template?.criterios ?? []).filter((c) => c.tipo === "PUNTUABLE")
  const criteriosDesempate = (template?.criterios ?? []).filter((c) => c.tipo === "DESEMPATE")

  return (
    <div className="space-y-6">
      <div className="mb-2">
        <h1 className="text-xl font-bold text-gray-900">
          {isEnviada ? "Puntaje enviado" : "Cargar puntaje"} — {patrullaNombre}
        </h1>
      </div>

      {isEnviada && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-4">
          <p className="font-semibold text-green-800">Planilla enviada</p>
          <p className="text-sm text-green-700 mt-0.5">
            Total: {totalPuntuable ?? "—"}
            {totalDesempate && Number(totalDesempate) > 0 && ` · Desempate: ${totalDesempate}`}
          </p>
          <p className="text-sm text-green-600 mt-1">
            Si necesitás corregirla, pedile al admin que la reabra.
          </p>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {toastMsg && (
        <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
          {toastMsg}
        </div>
      )}

      {template?.modo === "PUNTAJE_UNICO" ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Puntaje</label>
          <ScaleButtons
            valores={valores}
            selected={puntajeUnico}
            onSelect={setPuntajeUnico}
            disabled={disabled}
          />
        </div>
      ) : (
        <div className="space-y-5">
          {criteriosPuntuables.map((c) => (
            <div key={c.id}>
              <div className="flex items-center gap-2 mb-2">
                <label className="text-sm font-medium text-gray-800">{c.nombre}</label>
                <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                  Puntuable
                </span>
              </div>
              {c.descripcion && (
                <p className="text-xs text-gray-500 mb-2">{c.descripcion}</p>
              )}
              <ScaleButtons
                valores={valores}
                selected={entries.get(c.id) ?? null}
                onSelect={(v) => setEntries(new Map(entries).set(c.id, v))}
                disabled={disabled}
              />
            </div>
          ))}
        </div>
      )}

      {criteriosDesempate.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowDesempate(!showDesempate)}
            className="text-sm text-brand hover:underline flex items-center gap-1"
          >
            {showDesempate ? "▲" : "▼"} Criterios de desempate ({criteriosDesempate.length})
          </button>
          {showDesempate && (
            <div className="mt-3 space-y-4 pl-2 border-l-2 border-gray-200">
              {criteriosDesempate.map((c) => (
                <div key={c.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-sm font-medium text-gray-700">{c.nombre}</label>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                      Desempate
                    </span>
                  </div>
                  <ScaleButtons
                    valores={valoresDesempate}
                    selected={entries.get(c.id) ?? null}
                    onSelect={(v) => setEntries(new Map(entries).set(c.id, v))}
                    disabled={disabled}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!isEnviada && (
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            disabled={isPending}
            onClick={() => saveDispatch(buildFormData())}
            className="flex-1 min-h-[48px] rounded-lg border border-gray-300 bg-white text-gray-700 font-medium text-sm hover:bg-gray-50 transition-colors disabled:opacity-60"
          >
            {savePending ? "Guardando…" : "Guardar borrador"}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => submitDispatch(buildFormData())}
            className="flex-1 min-h-[48px] rounded-lg bg-brand text-white font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {submitPending ? "Enviando…" : "Enviar"}
          </button>
        </div>
      )}
    </div>
  )
}
