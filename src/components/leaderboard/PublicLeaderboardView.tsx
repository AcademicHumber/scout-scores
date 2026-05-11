"use client"

import { useState, useEffect } from "react"
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

const STORAGE_KEY = "lb-theme"

export function PublicLeaderboardView({
  snapshot,
  highlightGrupoId,
  isPublic = true,
}: Props) {
  const { ranking, grupos, eventoNombre, eventoLugar, eventoFechaInicio, eventoFechaFin, organizationNombre, generadoEn } = snapshot

  const initialTab = highlightGrupoId ?? null
  const [selectedGrupo, setSelectedGrupo] = useState<string | null>(initialTab)
  const [isDark, setIsDark] = useState(false)

  // Leer preferencia guardada (después de hidratación para evitar mismatch)
  useEffect(() => {
    if (localStorage.getItem(STORAGE_KEY) === "dark") setIsDark(true)
  }, [])

  function toggleTheme() {
    const next = !isDark
    setIsDark(next)
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light")
  }

  const filtered = selectedGrupo
    ? ranking.filter((r) => r.grupoScoutId === selectedGrupo)
    : ranking

  const showPodium = !selectedGrupo && ranking.length >= 3
  const top3 = showPodium ? ranking.slice(0, 3) : []
  const tableRows = showPodium ? filtered.slice(3) : filtered

  const fechaStr = formatFechaEvento(eventoFechaInicio, eventoFechaFin)

  // Theme tokens
  const t = {
    wrapper:      isDark ? "bg-zinc-950 text-zinc-50"   : "bg-gray-50 text-gray-900",
    sectionBg:    isDark ? "bg-zinc-900 border-zinc-800" : "bg-white border-gray-200",
    headerText:   isDark ? "text-zinc-500"               : "text-gray-500",
    footerBorder: isDark ? "border-zinc-800"             : "border-gray-200",
    footerText:   isDark ? "text-zinc-600"               : "text-gray-400",
    footerSub:    isDark ? "text-zinc-700"               : "text-gray-300",
    empty:        isDark ? "text-zinc-500"               : "text-gray-400",
  }

  return (
    <div className={`min-h-screen ${t.wrapper}`}>
      {/* Hero — siempre brand purple */}
      <header className="bg-brand px-4 pt-12 pb-10 sm:pt-16 sm:pb-14 relative">
        <div className="mx-auto max-w-4xl">
          <p className="mb-3 inline-block rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-white">
            Resultados Oficiales
          </p>
          <h1 className="text-5xl font-black leading-none tracking-tight text-white sm:text-6xl lg:text-7xl">
            {eventoNombre}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-white/70">
            <span>{organizationNombre}</span>
            {eventoLugar && <span>· {eventoLugar}</span>}
            <span>· {fechaStr}</span>
          </div>
        </div>
        {/* Toggle tema */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          className="absolute top-4 right-4 flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition-colors"
        >
          {isDark ? "☀ Claro" : "◑ Oscuro"}
        </button>
      </header>

      {/* Tabs de grupo (sticky) */}
      <GrupoTabs
        grupos={grupos}
        selected={selectedGrupo}
        onChange={setSelectedGrupo}
        isDark={isDark}
      />

      <main className="mx-auto max-w-4xl px-4 pb-16">
        {ranking.length === 0 ? (
          <div className="py-20 text-center">
            <p className={`text-xl font-semibold ${t.empty}`}>Sin patrullas en este evento.</p>
          </div>
        ) : (
          <>
            {/* Podio */}
            {showPodium && (
              <section className="pt-8 pb-4">
                <Podium top3={top3} isDark={isDark} />
              </section>
            )}

            {/* Tabla */}
            {(tableRows.length > 0 || (showPodium && filtered.length > 0)) && (
              <section className={`mt-2 rounded-xl border overflow-hidden ${t.sectionBg}`}>
                {showPodium && tableRows.length > 0 && (
                  <div className={`px-4 py-3 border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${t.headerText}`}>Ranking completo</p>
                  </div>
                )}
                {!showPodium && (
                  <div className={`px-4 py-3 border-b ${isDark ? "border-zinc-800" : "border-gray-100"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wider ${t.headerText}`}>
                      {grupos.find((g) => g.id === selectedGrupo)?.nombre ?? "Resultados"}
                    </p>
                  </div>
                )}
                <LeaderboardTable
                  rows={showPodium ? tableRows : filtered}
                  highlightGrupoId={highlightGrupoId}
                  isDark={isDark}
                />
              </section>
            )}

            {selectedGrupo && filtered.length === 0 && (
              <div className="py-20 text-center">
                <p className={t.empty}>No hay patrullas de este grupo en el ranking.</p>
              </div>
            )}
          </>
        )}

        {/* Footer */}
        <footer className={`mt-12 pt-8 border-t ${t.footerBorder} text-center`}>
          <p className={`text-xs ${t.footerText}`}>
            Última actualización: {formatGeneradoEn(generadoEn)}
          </p>
          {isPublic && (
            <p className={`mt-1 text-xs ${t.footerSub}`}>Generado por Puntajes Scout</p>
          )}
        </footer>
      </main>
    </div>
  )
}
