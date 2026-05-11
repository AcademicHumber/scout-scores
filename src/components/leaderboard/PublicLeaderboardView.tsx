"use client"

import { useState } from "react"
import type { LeaderboardSnapshotData } from "@/repositories/leaderboard.repo"
import { GrupoTabs } from "./GrupoTabs"
import { Podium } from "./Podium"
import { LeaderboardTable } from "./LeaderboardTable"

type Props = {
  snapshot: LeaderboardSnapshotData
  highlightGrupoId?: string
  isPublic?: boolean
}

function formatFechaEvento(inicio: string, fin: string | null): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  }
  const locale = "es-BO"
  const startStr = new Date(inicio).toLocaleDateString(locale, opts)
  if (!fin) return startStr

  const finDate = new Date(fin)
  const startDate = new Date(inicio)
  if (finDate.toDateString() === startDate.toDateString()) return startStr

  const endStr = finDate.toLocaleDateString(locale, opts)
  return `${startStr} – ${endStr}`
}

function formatGeneradoEn(iso: string): string {
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "UTC",
  })
}

export function PublicLeaderboardView({
  snapshot,
  highlightGrupoId,
  isPublic = true,
}: Props) {
  const { ranking, grupos, eventoNombre, eventoLugar, eventoFechaInicio, eventoFechaFin, organizationNombre, generadoEn } = snapshot

  const initialTab = highlightGrupoId ?? null
  const [selectedGrupo, setSelectedGrupo] = useState<string | null>(initialTab)

  const filtered = selectedGrupo
    ? ranking.filter((r) => r.grupoScoutId === selectedGrupo)
    : ranking

  // Top 3 solo cuando se muestra "Todos" y hay ≥ 3 patrullas
  const showPodium = !selectedGrupo && ranking.length >= 3
  const top3 = showPodium ? ranking.slice(0, 3) : []
  const tableRows = showPodium ? filtered.slice(3) : filtered

  const fechaStr = formatFechaEvento(eventoFechaInicio, eventoFechaFin)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      {/* Hero */}
      <header className="relative overflow-hidden px-4 pt-12 pb-10 sm:pt-16 sm:pb-14">
        {/* Decorative grid lines */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-5"
          style={{
            backgroundImage: "linear-gradient(90deg, #fff 1px, transparent 1px), linear-gradient(180deg, #fff 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
        <div className="relative mx-auto max-w-4xl">
          <p className="mb-3 inline-block rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-amber-400">
            Resultados Oficiales
          </p>
          <h1 className="text-5xl font-black leading-none tracking-tight text-zinc-50 sm:text-6xl lg:text-7xl">
            {eventoNombre}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-zinc-400">
            <span>{organizationNombre}</span>
            {eventoLugar && <span>· {eventoLugar}</span>}
            <span>· {fechaStr}</span>
          </div>
        </div>
      </header>

      {/* Tabs de grupo (sticky) */}
      <GrupoTabs
        grupos={grupos}
        selected={selectedGrupo}
        onChange={setSelectedGrupo}
      />

      <main className="mx-auto max-w-4xl px-4 pb-16">
        {ranking.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-xl font-semibold text-zinc-500">Sin patrullas en este evento.</p>
          </div>
        ) : (
          <>
            {/* Podio — solo cuando se muestra "Todos" y hay ≥ 3 */}
            {showPodium && (
              <section className="pt-8 pb-4">
                <Podium top3={top3} />
              </section>
            )}

            {/* Tabla del resto (o todo si filtro activo) */}
            {(tableRows.length > 0 || (showPodium && filtered.length > 0)) && (
              <section className="mt-2 rounded-xl border border-zinc-800 overflow-hidden">
                {showPodium && tableRows.length > 0 && (
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Ranking completo</p>
                  </div>
                )}
                {!showPodium && (
                  <div className="px-4 py-3 border-b border-zinc-800">
                    <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                      {grupos.find((g) => g.id === selectedGrupo)?.nombre ?? "Resultados"}
                    </p>
                  </div>
                )}
                <LeaderboardTable
                  rows={showPodium ? tableRows : filtered}
                  highlightGrupoId={highlightGrupoId}
                />
              </section>
            )}

            {/* Si hay filtro activo y el podio estaba visible pero para el filtro no hay nadie */}
            {selectedGrupo && filtered.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-zinc-500">No hay patrullas de este grupo en el ranking.</p>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t border-zinc-800 text-center">
          <p className="text-xs text-zinc-600">
            Última actualización: {formatGeneradoEn(generadoEn)}
          </p>
          {isPublic && (
            <p className="mt-1 text-xs text-zinc-700">Generado por Puntajes Scout</p>
          )}
        </footer>
      </main>
    </div>
  )
}
