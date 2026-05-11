"use client"

import { useState } from "react"
import type { LeaderboardActividadBreakdown } from "@/repositories/leaderboard.repo"

type Props = {
  detalle: LeaderboardActividadBreakdown[]
}

export function PatrullaDetalleAccordion({ detalle }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors py-1"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {open ? "Ocultar detalle" : "Ver detalle por actividad"}
      </button>

      {open && (
        <div className="mt-2 space-y-3 pl-2 border-l border-zinc-800">
          {detalle.map((act) => (
            <div key={act.actividadId}>
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold text-zinc-300">{act.actividadNombre}</span>
                <span className="text-xs text-zinc-500">
                  peso {act.pesoRelativo}% → <span className="font-mono text-zinc-200">{act.subtotalActividad.toFixed(2)}</span>
                </span>
              </div>
              <div className="mt-1 space-y-1">
                {act.postas.map((p) => (
                  <div key={p.asignacionId} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">{p.postaNombre}</span>
                    <span className="font-mono text-zinc-400">
                      {p.totalPuntuable !== null ? p.totalPuntuable.toFixed(2) : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
