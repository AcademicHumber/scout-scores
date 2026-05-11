import type { LeaderboardRow } from "@/repositories/leaderboard.repo"

type Props = {
  top3: LeaderboardRow[]
}

const MEDALS = [
  { label: "1°", color: "text-amber-400", border: "border-amber-400/60", bg: "bg-amber-400/10", height: "h-28" },
  { label: "2°", color: "text-zinc-300", border: "border-zinc-500/60", bg: "bg-zinc-800/60", height: "h-20" },
  { label: "3°", color: "text-amber-700", border: "border-amber-800/60", bg: "bg-amber-900/20", height: "h-14" },
]

const ORDER = [1, 0, 2] // visual order: 2nd, 1st, 3rd

export function Podium({ top3 }: Props) {
  if (top3.length < 1) return null

  return (
    <div className="flex items-end justify-center gap-3 px-4 pt-2 pb-6">
      {ORDER.map((idx) => {
        const row = top3[idx]
        if (!row) return <div key={idx} className="flex-1 max-w-[180px]" />
        const m = MEDALS[idx]!

        return (
          <div key={row.patrullaId} className={`flex-1 max-w-[180px] flex flex-col ${idx === 0 ? "order-2" : idx === 1 ? "order-1" : "order-3"}`}>
            {/* Base bar */}
            <div className={`${m.height} rounded-t-lg ${m.bg} border ${m.border} flex items-center justify-center`}>
              <span className={`text-4xl font-black ${m.color}`}>{m.label}</span>
            </div>
            {/* Info card */}
            <div className={`rounded-b-lg border-x border-b ${m.border} px-3 py-3 text-center`}>
              <p className="text-sm font-bold text-zinc-100 leading-tight">{row.patrullaNombre}</p>
              <p className="text-xs text-zinc-500 mt-0.5">{row.grupoScoutNombre}</p>
              <p className={`text-lg font-black mt-1 font-mono ${m.color}`}>
                {row.totalPuntuable.toFixed(2)}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
