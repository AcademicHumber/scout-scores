"use client"

import { useActionState, useEffect, useState, useRef, startTransition } from "react"
import { useRouter } from "next/navigation"
import {
  saveScoreSheetAction,
  submitScoreSheetAction,
  type SaveScoreSheetState,
} from "@/app/(juez)/juez/postas/[asignacionId]/actions"
import messages from "@/messages/es.json"

const t = messages.juez.planilla

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
    <div className="flex flex-wrap gap-2.5">
      {valores.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => !disabled && onSelect(v)}
          disabled={disabled}
          className={[
            "min-h-[56px] min-w-[60px] rounded-xl border-2 text-lg font-bold transition-all",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-1",
            selected === v
              ? "border-brand bg-brand text-white shadow-md scale-[1.04]"
              : "border-gray-200 bg-white text-gray-700 hover:border-brand/60 hover:text-brand active:scale-95",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
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
  const initialSaveState: SaveScoreSheetState = {}
  const initialSubmitState: SaveScoreSheetState = {}

  const [saveState, saveDispatch, savePending] = useActionState(saveScoreSheetAction, initialSaveState)
  const [submitState, submitDispatch, submitPending] = useActionState(submitScoreSheetAction, initialSubmitState)

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    if (saveState.success) {
      setToastMsg(t.toastBorrador)
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
      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">
          {isEnviada ? t.titleEnviada : t.titleNueva}
        </p>
        <h1 className="text-2xl font-bold text-gray-900 leading-tight mt-0.5">{patrullaNombre}</h1>
      </div>

      {isEnviada && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-5">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-green-100 border border-green-300 flex items-center justify-center shrink-0 mt-0.5">
              <span className="text-green-600 text-sm font-bold">✓</span>
            </div>
            <div>
              <p className="font-bold text-green-900 text-base">{t.enviadaBanner}</p>
              <p className="text-sm text-green-700 mt-0.5">
                Total: <strong>{totalPuntuable ?? "—"}</strong>
                {totalDesempate && Number(totalDesempate) > 0 && (
                  <span> · Desempate: <strong>{totalDesempate}</strong></span>
                )}
              </p>
              <p className="text-xs text-green-600 mt-1">{t.enviadaHint}</p>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {toastMsg && (
        <div className="rounded-2xl bg-green-50 border border-green-200 p-4 text-sm text-green-700 font-medium">
          {toastMsg}
        </div>
      )}

      {template?.modo === "PUNTAJE_UNICO" ? (
        <div>
          <label className="block text-base font-semibold text-gray-800 mb-3">{t.puntajeUnicoLabel}</label>
          <ScaleButtons
            valores={valores}
            selected={puntajeUnico}
            onSelect={setPuntajeUnico}
            disabled={disabled}
          />
        </div>
      ) : (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            {t.criteriosPuntuables}
          </p>
          <div className="space-y-6">
            {criteriosPuntuables.map((c) => (
              <div key={c.id}>
                <label className="block text-base font-semibold text-gray-800 mb-2">{c.nombre}</label>
                {c.descripcion && (
                  <p className="text-sm text-gray-500 mb-2">{c.descripcion}</p>
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
        </div>
      )}

      {criteriosDesempate.length > 0 && (
        <div className="border-t border-gray-200 pt-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">
            {t.criteriosDesempate}
          </p>
          <div className="space-y-6">
            {criteriosDesempate.map((c) => (
              <div key={c.id}>
                <label className="block text-base font-semibold text-gray-700 mb-2">{c.nombre}</label>
                {c.descripcion && (
                  <p className="text-sm text-gray-500 mb-2">{c.descripcion}</p>
                )}
                <ScaleButtons
                  valores={valoresDesempate}
                  selected={entries.get(c.id) ?? null}
                  onSelect={(v) => setEntries(new Map(entries).set(c.id, v))}
                  disabled={disabled}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {!isEnviada && (
        <div className="flex gap-3 pt-2 pb-6">
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => saveDispatch(buildFormData()))}
            className="flex-1 min-h-[56px] rounded-2xl border-2 border-gray-200 bg-white text-gray-700 font-semibold text-base hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {savePending ? t.guardando : t.guardarBorrador}
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => startTransition(() => submitDispatch(buildFormData()))}
            className="flex-1 min-h-[56px] rounded-2xl bg-brand text-white font-bold text-base hover:bg-brand-dark active:scale-[0.98] transition-all disabled:opacity-50 shadow-sm"
          >
            {submitPending ? t.enviando : t.enviar}
          </button>
        </div>
      )}
    </div>
  )
}
