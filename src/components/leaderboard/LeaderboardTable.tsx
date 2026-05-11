import type { LeaderboardRow } from "@/repositories/leaderboard.repo"
import { PatrullaDetalleAccordion } from "./PatrullaDetalleAccordion"

type Props = {
  rows: LeaderboardRow[]
  highlightGrupoId?: string
  isDark?: boolean
}

export function LeaderboardTable({ rows, highlightGrupoId, isDark = false }: Props) {
  if (rows.length === 0) return null

  const divider   = isDark ? "divide-zinc-800"  : "divide-gray-100"
  const rowText   = isDark ? "text-zinc-100"    : "text-gray-900"
  const subText   = isDark ? "text-zinc-500"    : "text-gray-500"
  const puntajeCl = isDark ? "text-zinc-100"    : "text-gray-900"
  const desempateCl = isDark ? "text-zinc-600"  : "text-gray-400"

  const POSITION_COLORS: Record<number, string> = isDark
    ? { 1: "text-amber-400", 2: "text-zinc-300",  3: "text-amber-700" }
    : { 1: "text-amber-600", 2: "text-slate-500", 3: "text-amber-700" }

  return (
    <div className={`divide-y ${divider}`}>
      {rows.map((row) => {
        const posColor = POSITION_COLORS[row.posicion] ?? (isDark ? "text-zinc-500" : "text-gray-400")
        const isHighlighted = highlightGrupoId && row.grupoScoutId === highlightGrupoId

        return (
          <div
            key={row.patrullaId}
            className={[
              "px-4 py-4 transition-colors",
              isHighlighted
                ? isDark
                  ? "border-l-4 border-brand bg-brand/10"
                  : "border-l-4 border-brand bg-brand-light"
                : "",
            ].join(" ")}
          >
            <div className="flex items-center gap-4">
              {/* Posición */}
              <span className={`w-8 text-center text-xl font-black tabular-nums ${posColor}`}>
                {row.posicion}°
              </span>

              {/* Info patrulla */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={`font-bold truncate ${rowText}`}>{row.patrullaNombre}</span>
                  <span className={`text-xs truncate ${subText}`}>{row.grupoScoutNombre}</span>
                </div>
                <PatrullaDetalleAccordion detalle={row.detalle} isDark={isDark} />
              </div>

              {/* Puntaje */}
              <div className="text-right flex-shrink-0">
                <span className={`font-mono text-lg font-bold ${puntajeCl}`}>
                  {row.totalPuntuable.toFixed(2)}
                </span>
                {row.totalDesempate > 0 && (
                  <p className={`text-xs font-mono ${desempateCl}`}>
                    +{row.totalDesempate.toFixed(2)} DE
                  </p>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
