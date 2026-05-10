"use client"

import { useSyncEngine } from "@/lib/offline/sync-engine"
import messages from "@/messages/es.json"

const t = messages.juez.sync

function pluralize(count: number, singular: string, plural: string) {
  return count === 1 ? singular : plural
}

type Props = {
  userId: string
  organizationId: string
}

export function SyncStatusBadge({ userId, organizationId }: Props) {
  const { status, pendingCount, syncNow } = useSyncEngine(userId, organizationId)

  if (status === "idle") return null

  if (status === "online" && pendingCount === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/80">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        {t.online}
      </span>
    )
  }

  if (status === "offline") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/60">
        <span className="w-1.5 h-1.5 rounded-full bg-gray-400" />
        {t.offline}
        {pendingCount > 0 && (
          <span className="ml-1 text-amber-300">
            · {pluralize(pendingCount, t.pendientes.replace("{{count}}", "1"), t.pendientesPlural.replace("{{count}}", String(pendingCount)))}
          </span>
        )}
      </span>
    )
  }

  if (status === "syncing") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-blue-200">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
        {t.sincronizando}
      </span>
    )
  }

  if (status === "conflict") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2.5 py-1 text-xs font-medium text-red-200">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
        {t.conflicto}
      </span>
    )
  }

  // online con pendientes
  return (
    <button
      type="button"
      onClick={() => syncNow()}
      className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-medium text-amber-200 hover:bg-amber-500/30 transition-colors"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      {pluralize(pendingCount, t.pendientes.replace("{{count}}", "1"), t.pendientesPlural.replace("{{count}}", String(pendingCount)))}
      <span className="ml-1 opacity-70">· {t.reintentar}</span>
    </button>
  )
}
