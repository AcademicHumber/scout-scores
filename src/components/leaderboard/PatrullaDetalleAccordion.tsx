"use client"

import { useState } from "react"
import type { LeaderboardActividadBreakdown } from "@/repositories/leaderboard.repo"

type Props = {
  detalle: LeaderboardActividadBreakdown[]
  isDark?: boolean
}

export function PatrullaDetalleAccordion({ detalle, isDark = false }: Props) {
  const [open, setOpen] = useState(false)

  const btnText    = isDark ? "text-zinc-500 hover:text-brand-light" : "text-gray-400 hover:text-brand"
  const borderCl   = isDark ? "border-brand/30" : "border-brand/20"
  const actTitle   = isDark ? "text-zinc-300"   : "text-gray-700"
  const actMeta    = isDark ? "text-zinc-500"   : "text-gray-400"
  const actPuntaje = isDark ? "text-zinc-200"   : "text-gray-700"
  const postaNombre = isDark ? "text-zinc-500"  : "text-gray-400"
  const postaPuntaje = isDark ? "text-zinc-400" : "text-gray-500"

  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 text-xs transition-colors py-1 ${btnText}`}
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
        {open ? "Ocultar detalle" : "Ver detalle por actividad"}
      </button>

      {open && (
        <div className={`mt-2 space-y-3 pl-2 border-l ${borderCl}`}>
          {detalle.map((act) => (
            <div key={act.actividadId}>
              <div className="flex items-baseline justify-between">
                <span className={`text-xs font-semibold ${actTitle}`}>{act.actividadNombre}</span>
                <span className={`text-xs ${actMeta}`}>
                  peso {act.pesoRelativo}% → <span className={`font-mono ${actPuntaje}`}>{act.subtotalActividad.toFixed(2)}</span>
                </span>
              </div>
              <div className="mt-1 space-y-1">
                {act.postas.map((p) => (
                  <div key={p.asignacionId} className="flex items-center justify-between text-xs">
                    <span className={postaNombre}>{p.postaNombre}</span>
                    <span className={`font-mono ${postaPuntaje}`}>
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
