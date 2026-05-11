import { resolvePublicShareToken } from "@/repositories/public-share-link.repo"
import { PublicLeaderboardView } from "@/components/leaderboard/PublicLeaderboardView"
import { ResultadosNotFound } from "@/components/leaderboard/ResultadosNotFound"
import { ResultadosRevoked } from "@/components/leaderboard/ResultadosRevoked"
import type { LeaderboardSnapshotData } from "@/repositories/leaderboard.repo"

export default async function ResultadosPublicosPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const result = await resolvePublicShareToken(token)

  if (result === null) {
    return <ResultadosNotFound />
  }

  if (result === "REVOKED") {
    return <ResultadosRevoked />
  }

  const snapshot = result.snapshot.data as LeaderboardSnapshotData

  return <PublicLeaderboardView snapshot={snapshot} isPublic />
}
