"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import messages from "@/messages/es.json"
import type { PostaConTemplate } from "@/repositories/posta.repo"

const m = messages.admin.postas

type PlantillaFilter = "todas" | "con" | "sin"

const FILTROS: { value: PlantillaFilter; label: string }[] = [
  { value: "todas", label: m.filtros.todas },
  { value: "con",   label: m.filtros.conPlantilla },
  { value: "sin",   label: m.filtros.sinPlantilla },
]

type Props = {
  postas: PostaConTemplate[]
}

export function PostasSearchPanel({ postas }: Props) {
  const [search, setSearch] = useState("")
  const [plantillaFilter, setPlantillaFilter] = useState<PlantillaFilter>("todas")

  const countsForSearch = useMemo(() => {
    const q = search.toLowerCase().trim()
    let todas = 0, con = 0, sin = 0
    for (const p of postas) {
      if (q && !p.nombre.toLowerCase().includes(q)) continue
      todas++
      if (p.template) con++; else sin++
    }
    return { todas, con, sin }
  }, [postas, search])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return postas.filter((p) => {
      if (plantillaFilter === "con" && !p.template) return false
      if (plantillaFilter === "sin" && p.template) return false
      if (q && !p.nombre.toLowerCase().includes(q)) return false
      return true
    })
  }, [postas, search, plantillaFilter])

  return (
    <div className="space-y-3">
      {/* Buscador */}
      <div className="flex items-center gap-3 rounded-2xl border-2 border-gray-100 bg-white px-4 shadow-sm transition-colors focus-within:border-brand focus-within:shadow-md">
        <svg
          className="h-4 w-4 shrink-0 text-gray-400"
          fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={m.buscar}
          className="flex-1 bg-transparent py-3.5 text-sm text-gray-800 outline-none placeholder:text-gray-400"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            aria-label="Limpiar búsqueda"
            className="shrink-0 rounded-full p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-500"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Chips de plantilla */}
      <div className="overflow-x-auto pb-1">
        <div className="flex gap-2 min-w-max">
          {FILTROS.map((f) => (
            <button
              key={f.value}
              onClick={() => setPlantillaFilter(f.value)}
              className={`flex min-h-[40px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-medium transition-all active:scale-95 ${
                plantillaFilter === f.value
                  ? "bg-brand text-white shadow-md"
                  : "border border-gray-200 bg-white text-gray-600 shadow-sm hover:border-brand/40 hover:text-brand"
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
                plantillaFilter === f.value ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
              }`}>
                {countsForSearch[f.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Encabezado de resultados */}
      <div className="flex items-center justify-between px-0.5">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-400">
          {FILTROS.find((f) => f.value === plantillaFilter)?.label}
        </p>
        <p className="text-xs text-gray-400">
          {filtered.length === postas.length
            ? `${postas.length} postas`
            : `${filtered.length} de ${postas.length}`}
        </p>
      </div>

      {/* Lista o estado vacío */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white py-14 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-400">{m.sinResultados}</p>
          <p className="mt-1 text-xs text-gray-300">{m.sinResultadosHint}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <Link
              key={p.id}
              href={`/admin/postas/${p.id}`}
              className="flex items-center justify-between rounded-xl border bg-white px-4 py-3 shadow-sm hover:border-brand/40 hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium text-gray-900">{p.nombre}</p>
                <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-gray-500">
                  {p.template ? (
                    <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">{p.template.nombre}</span>
                  ) : (
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500">{m.fields.plantillaSinAsignar}</span>
                  )}
                  {p.duracionMinutos && <span>{p.duracionMinutos} min</span>}
                </div>
              </div>
              <div className="ml-4 shrink-0 text-right text-xs text-gray-400">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium">
                  {p._count.asignaciones} evento{p._count.asignaciones !== 1 ? "s" : ""}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
