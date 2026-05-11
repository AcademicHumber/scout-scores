import { requireOrg } from "@/lib/auth-helpers"
import { findEventoById } from "@/repositories/evento.repo"
import { getLeaderboardSnapshot } from "@/repositories/leaderboard.repo"
import { PublicLeaderboardView } from "@/components/leaderboard/PublicLeaderboardView"
import { notFound } from "next/navigation"
import type { LeaderboardSnapshotData } from "@/repositories/leaderboard.repo"

export default async function EventoResultadosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const org = await requireOrg()
  const { id } = await params

  const evento = await findEventoById(org.organizationId, id)
  if (!evento || evento.estado !== "PUBLICADO") notFound()

  const snapshot = await getLeaderboardSnapshot(org.organizationId, id)

  if (!snapshot) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center">
        <p className="text-lg font-semibold text-gray-700">
          Aún no se generó el ranking de este evento.
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Contactá al administrador del distrito.
        </p>
      </div>
    )
  }

  const highlightGrupoId = org.role === "JEFE_PATRULLA" && org.grupoScoutId
    ? org.grupoScoutId
    : undefined

  const data = snapshot.data as LeaderboardSnapshotData

  return (
    <div className="-mx-4 sm:-mx-6 lg:-mx-8">
      <PublicLeaderboardView
        snapshot={data}
        highlightGrupoId={highlightGrupoId ?? undefined}
        isPublic={false}
      />
    </div>
  )
}
