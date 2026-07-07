"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import {
  crearPostaComoJuezAction,
  asignarPostaExistenteComoJuezAction,
} from "@/app/(app)/eventos/[id]/postas/actions"
import {
  CriteriosDescripcionesForm,
  type TemplateInfo,
  type CriteriosDescripciones,
} from "@/components/admin/postas/CriteriosDescripcionesForm"
import messages from "@/messages/es.json"

const mf = messages.admin.postas.fields
const md = messages.eventos.planificacion.dialog

type Material = { nombre: string; cantidad?: string }

type PostaDisponible = {
  id: string
  nombre: string
  duracionMinutos: number | null
  asignadaEnActividad: string | null
}

type Props = {
  eventoId: string
  actividadId: string
  template: TemplateInfo | null
  postasDisponibles: PostaDisponible[]
}

export function CrearPostaForm({ eventoId, actividadId, template, postasDisponibles }: Props) {
  const [crearState, crearAction, crearPending] = useActionState(crearPostaComoJuezAction, {})
  const [asignarState, asignarAction, asignarPending] = useActionState(asignarPostaExistenteComoJuezAction, {})

  const [nombre, setNombre] = useState("")
  const [selected, setSelected] = useState<PostaDisponible | null>(null)
  const [materiales, setMateriales] = useState<Material[]>([])
  const [criteriosDescripciones, setCriteriosDescripciones] = useState<CriteriosDescripciones>({})

  const volverHref = `/eventos/${eventoId}/postas`

  const query = nombre.trim().toLowerCase()
  const matches = query.length >= 2 && !selected
    ? postasDisponibles.filter((p) => p.nombre.toLowerCase().includes(query)).slice(0, 5)
    : []

  if (selected) {
    return (
      <form action={asignarAction} className="space-y-6">
        <input type="hidden" name="eventoId" value={eventoId} />
        <input type="hidden" name="actividadId" value={actividadId} />
        <input type="hidden" name="postaId" value={selected.id} />

        <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          {asignarState.error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {asignarState.error}
            </div>
          )}

          <div className="rounded-lg border border-brand/20 bg-brand/5 px-3 py-2.5 text-sm">
            <p className="font-medium text-gray-900">{selected.nombre}</p>
            {selected.duracionMinutos && (
              <p className="mt-0.5 text-xs text-gray-500">Duración estimada: {selected.duracionMinutos} min</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-sm text-brand hover:underline"
          >
            {md.crearNueva}
          </button>
        </div>

        <div className="flex justify-end gap-2">
          <Link href={volverHref} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
            {md.cancelar}
          </Link>
          <button
            type="submit"
            disabled={asignarPending}
            className="min-h-[44px] rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
          >
            {asignarPending ? md.guardando : md.asignar}
          </button>
        </div>
      </form>
    )
  }

  return (
    <form action={crearAction} className="space-y-6">
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="actividadId" value={actividadId} />
      <input type="hidden" name="materiales" value={JSON.stringify(materiales)} />
      <input type="hidden" name="criteriosDescripciones" value={JSON.stringify(criteriosDescripciones)} />

      <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
        {crearState.error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {crearState.error}
          </div>
        )}

        {/* Nombre + autocomplete */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {md.nombreLabel} <span className="text-red-500">*</span>
          </label>
          <input
            name="nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            maxLength={100}
            placeholder={md.nombrePlaceholder}
            autoComplete="off"
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
          {crearState.fieldErrors?.nombre && (
            <p className="mt-0.5 text-xs text-red-600">{crearState.fieldErrors.nombre[0]}</p>
          )}

          {matches.length > 0 && (
            <div className="mt-2 space-y-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
              <p className="text-xs font-medium text-amber-800">{md.coincidenciaTitle}</p>
              {matches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelected(p)}
                  className="flex w-full min-h-[40px] items-center justify-between rounded-md border border-amber-200 bg-white px-2.5 py-1.5 text-left text-sm hover:border-brand/40 hover:bg-brand/5"
                >
                  <span className="truncate font-medium text-gray-800">{p.nombre}</span>
                  <span className="ml-2 shrink-0 text-xs text-brand">{md.usarExistente}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Descripción */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{mf.descripcion}</label>
          <textarea
            name="descripcion"
            rows={3}
            maxLength={1000}
            className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Duración */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">{mf.duracionMinutos}</label>
          <input
            name="duracionMinutos"
            type="number"
            min={1}
            max={480}
            className="w-full sm:w-32 rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          />
        </div>

        {/* Materiales */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">{mf.materiales}</label>
          <div className="space-y-2">
            {materiales.map((mat, idx) => (
              <div key={idx} className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
                <input
                  value={mat.nombre}
                  onChange={(e) => setMateriales((prev) => prev.map((m, i) => i === idx ? { ...m, nombre: e.target.value } : m))}
                  placeholder={mf.materialNombre}
                  maxLength={100}
                  className="flex-1 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                />
                <div className="flex gap-2">
                  <input
                    value={mat.cantidad ?? ""}
                    onChange={(e) => setMateriales((prev) => prev.map((m, i) => i === idx ? { ...m, cantidad: e.target.value } : m))}
                    placeholder={mf.materialCantidad}
                    maxLength={50}
                    className="flex-1 sm:w-40 rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                  />
                  <button
                    type="button"
                    onClick={() => setMateriales((prev) => prev.filter((_, i) => i !== idx))}
                    className="shrink-0 rounded px-2 text-red-400 hover:bg-red-50"
                  >✕</button>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setMateriales((prev) => [...prev, { nombre: "" }])}
              className="text-sm text-brand hover:underline"
            >
              {mf.agregarMaterial}
            </button>
          </div>
        </div>

        {/* Encargado / Ayudantes */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{md.encargado}</label>
            <input
              name="encargado"
              type="text"
              maxLength={100}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{md.ayudantes}</label>
            <input
              name="ayudantes"
              type="text"
              maxLength={300}
              className="w-full rounded border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
        </div>
      </div>

      {/* Leyenda de puntajes: su propia sección, siempre visible */}
      {template && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-1 text-lg font-semibold text-gray-900">Leyenda de puntajes</h2>
          <p className="mb-4 text-sm text-gray-500">{md.leyendaHint}</p>
          <CriteriosDescripcionesForm
            mode="controlled"
            templates={[template]}
            criteriosDescripciones={criteriosDescripciones}
            onChange={setCriteriosDescripciones}
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Link href={volverHref} className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
          {md.cancelar}
        </Link>
        <button
          type="submit"
          disabled={crearPending}
          className="min-h-[44px] rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand/90 disabled:opacity-50"
        >
          {crearPending ? md.guardando : md.guardar}
        </button>
      </div>
    </form>
  )
}
