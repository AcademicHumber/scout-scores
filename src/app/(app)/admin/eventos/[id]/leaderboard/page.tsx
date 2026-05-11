import { requireRole } from "@/lib/auth-helpers"
import { notFound } from "next/navigation"
import Link from "next/link"
import { findEventoById } from "@/repositories/evento.repo"
import {
  computeLeaderboard,
  getLeaderboardSnapshot,
  isSnapshotStale,
} from "@/repositories/leaderboard.repo"
import { findActivePublicShareLink } from "@/repositories/public-share-link.repo"
import { PublicLeaderboardView } from "@/components/leaderboard/PublicLeaderboardView"
import { SnapshotControls } from "@/components/leaderboard/admin/SnapshotControls"
import { PublicShareLinkControls } from "@/components/leaderboard/admin/PublicShareLinkControls"

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000"

export default async function AdminLeaderboardPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const org = await requireRole(["ADMIN"])
  const { id } = await params

  const evento = await findEventoById(org.organizationId, id)
  if (!evento) notFound()

  if (evento.estado !== "CERRADO" && evento.estado !== "PUBLICADO") {
    notFound()
  }

  const [leaderboardData, snapshot, stale, activeLink] = await Promise.all([
    computeLeaderboard(org.organizationId, id),
    getLeaderboardSnapshot(org.organizationId, id),
    isSnapshotStale(org.organizationId, id),
    findActivePublicShareLink(org.organizationId, id),
  ])

  const snapshotInfo = snapshot
    ? { generatedAt: snapshot.generatedAt, generatedByName: null }
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Header */}
      <div>
        <Link
          href={`/admin/eventos/${id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← {evento.nombre}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
          <span className={`rounded-full px-3 py-0.5 text-sm font-medium ${
            evento.estado === "PUBLICADO"
              ? "bg-blue-100 text-blue-700"
              : "bg-amber-100 text-amber-700"
          }`}>
            {evento.estado === "PUBLICADO" ? "Publicado" : "Cerrado"}
          </span>
        </div>
      </div>

      {/* Vista en tiempo real */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Vista en tiempo real</h2>
        <p className="text-sm text-gray-500 mb-4">
          Refleja el estado actual de las planillas. El snapshot público puede diferir si hubo cambios.
        </p>
        {leaderboardData.ranking.length === 0 ? (
          <p className="text-sm text-gray-400">Aún no hay patrullas con puntajes cargados.</p>
        ) : (
          <div className="rounded-xl overflow-hidden border border-zinc-200 bg-zinc-950">
            <PublicLeaderboardView
              snapshot={leaderboardData}
              isPublic={false}
            />
          </div>
        )}
      </section>

      {/* Snapshot público */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Snapshot público</h2>
        <p className="text-sm text-gray-500 mb-4">
          El ranking congelado que ve el público. Regenerar no cambia el link activo.
        </p>
        <SnapshotControls
          eventoId={id}
          snapshot={snapshotInfo}
          isStale={stale}
        />
      </section>

      {/* Link público */}
      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-gray-900">Link público</h2>
        <p className="text-sm text-gray-500 mb-4">
          Compartí este link por QR, WhatsApp o email. Revocar lo deshabilita sin borrar los datos.
        </p>
        <PublicShareLinkControls
          eventoId={id}
          activeLink={activeLink}
          baseUrl={BASE_URL}
        />
      </section>
    </div>
  )
}
