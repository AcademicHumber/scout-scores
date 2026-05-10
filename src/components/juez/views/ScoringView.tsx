"use client"

import { useSession } from "next-auth/react"
import { JuezLink } from "@/lib/offline/juez-router"
import { useJuezData } from "@/lib/offline/use-juez-data"
import { readSnapshot } from "@/lib/offline/snapshot"
import { ScoreSheetForm } from "@/components/juez/ScoreSheetForm"
import { ConflictBanner } from "@/components/juez/ConflictBanner"
import { Breadcrumb } from "@/components/juez/Breadcrumb"
import messages from "@/messages/es.json"

const t = messages.juez

function SkeletonScoreForm() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="h-5 bg-gray-200 rounded w-1/3" />
      <div className="space-y-3">
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="flex gap-3">
          <div className="h-14 w-16 bg-gray-200 rounded-xl" />
          <div className="h-14 w-16 bg-gray-200 rounded-xl" />
          <div className="h-14 w-16 bg-gray-200 rounded-xl" />
        </div>
      </div>
      <div className="h-14 bg-gray-200 rounded-2xl" />
    </div>
  )
}

function NotFoundJuez() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <p className="font-semibold text-gray-700">{t.notFound.titulo}</p>
      <p className="text-sm text-gray-500 mt-2">{t.notFound.mensaje}</p>
      <JuezLink
        href="/juez/eventos"
        className="mt-4 inline-block text-brand font-semibold text-sm hover:underline"
      >
        {t.notFound.volver}
      </JuezLink>
    </div>
  )
}

export function ScoringView({
  asignacionId,
  patrullaId,
}: {
  asignacionId: string
  patrullaId: string
}) {
  const { data: session } = useSession()
  const userId = session?.user.id
  const orgId = session?.user.activeOrganizationId ?? undefined

  const state = useJuezData(
    () => readSnapshot(asignacionId, patrullaId).then((e) => e ?? null),
    () => false,
    userId,
    orgId,
  )

  if (state.status === "loading") {
    return (
      <div>
        <Breadcrumb items={[{ label: t.eventos.title, href: "/juez/eventos" }]} />
        <div className="mt-4">
          <SkeletonScoreForm />
        </div>
      </div>
    )
  }

  if (state.status === "empty") {
    return (
      <div>
        <Breadcrumb items={[{ label: t.eventos.title, href: "/juez/eventos" }]} />
        {state.firstTimeOffline ? (
          <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 p-10 text-center mt-4">
            <p className="font-semibold text-amber-800">{t.primeraVezOffline.titulo}</p>
            <p className="text-sm text-amber-700 mt-2">{t.primeraVezOffline.mensaje}</p>
          </div>
        ) : (
          <NotFoundJuez />
        )}
      </div>
    )
  }

  const entry = state.data
  const isEnviada = entry.scoreSheet?.estado === "ENVIADA"

  return (
    <div>
      <Breadcrumb
        items={[
          { label: t.eventos.title, href: "/juez/eventos" },
          { label: entry.evento.nombre, href: `/juez/eventos/${entry.eventoId}` },
          { label: entry.posta.nombre, href: `/juez/postas/${asignacionId}` },
        ]}
      />

      <div className="mb-4">
        <ConflictBanner asignacionId={asignacionId} patrullaId={patrullaId} />
      </div>

      <ScoreSheetForm
        asignacionId={asignacionId}
        patrullaId={patrullaId}
        patrullaNombre={entry.patrulla.nombre}
        backHref={`/juez/postas/${asignacionId}`}
        template={entry.template ?? null}
        initialPuntajeUnico={entry.scoreSheet?.puntajeUnico ?? null}
        initialEntries={entry.scoreSheet?.entries ?? []}
        initialVersion={entry.scoreSheet?.version ?? 0}
        isEnviada={isEnviada}
        totalPuntuable={entry.scoreSheet?.totalPuntuable?.toString() ?? null}
        totalDesempate={entry.scoreSheet?.totalDesempate?.toString() ?? null}
      />
    </div>
  )
}
