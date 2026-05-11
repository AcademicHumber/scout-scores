import type { LeaderboardRow } from "@/repositories/leaderboard.repo"
import { PatrullaDetalleAccordion } from "./PatrullaDetalleAccordion"

type Props = {
  rows: LeaderboardRow[]
  highlightGrupoId?: string
}

const POSITION_COLORS: Record<number, string> = {
  1: "text-amber-400",
  2: "text-zinc-300",
  3: "text-amber-700",
}

export function LeaderboardTable({ rows, highlightGrupoId }: Props) {
  if (rows.length === 0) return null

  return (
    <div className="divide-y divide-zinc-800">
      {rows.map((row) => {
        const posColor = POSITION_COLORS[row.posicion] ?? "text-zinc-500"
        const isHighlighted = highlightGrupoId && row.grupoScoutId === highlightGrupoId

        return (
          <div
            key={row.patrullaId}
            className={[
              "px-4 py-4 transition-colors",
              isHighlighted ? "border-l-4 border-amber-400 bg-amber-400/5" : "",
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
                  <span className="font-bold text-zinc-100 truncate">{row.patrullaNombre}</span>
                  <span className="text-xs text-zinc-500 truncate">{row.grupoScoutNombre}</span>
                </div>
                <PatrullaDetalleAccordion detalle={row.detalle} />
              </div>

              {/* Puntaje */}
              <div className="text-right flex-shrink-0">
                <span className="font-mono text-lg font-bold text-zinc-100">
                  {row.totalPuntuable.toFixed(2)}
                </span>
                {row.totalDesempate > 0 && (
                  <p className="text-xs text-zinc-600 font-mono">
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
