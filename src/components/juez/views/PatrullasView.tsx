"use client"

import { useSession } from "next-auth/react"
import { JuezLink } from "@/lib/offline/juez-router"
import { useJuezData } from "@/lib/offline/use-juez-data"
import { readPatrullasFromSnapshot, type PatrullaPostaContextOffline } from "@/lib/offline/snapshot"
import { Breadcrumb } from "@/components/juez/Breadcrumb"
import messages from "@/messages/es.json"

const t = messages.juez

function SkeletonRow() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[64px] animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/4" />
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

function PatrullasList({
  asignacionId,
  ctx,
}: {
  asignacionId: string
  ctx: PatrullaPostaContextOffline
}) {
  const { eventoId, eventoNombre, postaNombre, actividadNombre, patrullas } = ctx

  const enviadas = patrullas.filter((p) => p.scoreSheet?.estado === "ENVIADA").length
  const borradores = patrullas.filter((p) => p.scoreSheet?.estado === "BORRADOR").length
  const total = patrullas.length

  return (
    <div>
      <Breadcrumb
        items={[
          { label: t.eventos.title, href: "/juez/eventos" },
          { label: eventoNombre, href: `/juez/eventos/${eventoId}` },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">{postaNombre}</h1>
        <p className="text-sm text-gray-500 mt-0.5">{actividadNombre}</p>
      </div>

      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">{t.posta.patrullasTitle}</span>
          <span className="text-sm text-gray-500">
            <strong className="text-gray-900">{enviadas}</strong>/{total} enviadas
            {borradores > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                · {borradores} borrador{borradores !== 1 ? "es" : ""}
              </span>
            )}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all"
            style={{ width: total > 0 ? `${(enviadas / total) * 100}%` : "0%" }}
          />
        </div>
      </div>

      {patrullas.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="font-medium text-gray-500">{t.posta.empty}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {patrullas.map((row) => {
            const sheet = row.scoreSheet
            const estadoBadge =
              !sheet
                ? { label: t.posta.estado.SIN_CARGAR, cls: "bg-stone-100 text-stone-500 border border-stone-200", borderCls: "border-gray-200 hover:border-brand/40" }
                : sheet.estado === "ENVIADA"
                ? { label: t.posta.estado.ENVIADA, cls: "bg-green-100 text-green-700 border border-green-200 font-semibold", borderCls: "border-green-200" }
                : { label: t.posta.estado.BORRADOR, cls: "bg-amber-100 text-amber-700 border border-amber-200 font-semibold", borderCls: "border-amber-200" }

            return (
              <li key={row.patrullaId}>
                <JuezLink
                  href={`/juez/postas/${asignacionId}/${row.patrullaId}`}
                  className={`flex items-center gap-3 rounded-2xl border bg-white px-4 py-4 min-h-[64px] hover:shadow-sm active:scale-[0.99] transition-all ${estadoBadge.borderCls}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base text-gray-900 truncate">{row.patrullaNombre}</p>
                    <p className="text-sm text-gray-400">{row.grupoScoutNombre}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-2.5">
                    {sheet?.estado === "ENVIADA" && sheet.puntajeMostrado != null && (
                      <span className="text-xl font-bold text-gray-800 tabular-nums">
                        {Number(sheet.puntajeMostrado).toFixed(2)}
                      </span>
                    )}
                    <span className={`rounded-full px-2.5 py-1 text-xs ${estadoBadge.cls}`}>
                      {estadoBadge.label}
                    </span>
                    <span className="text-gray-300 text-xl">›</span>
                  </div>
                </JuezLink>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function PatrullasView({ asignacionId }: { asignacionId: string }) {
  const { data: session } = useSession()
  const userId = session?.user.id
  const orgId = session?.user.activeOrganizationId ?? undefined

  const state = useJuezData(
    () => readPatrullasFromSnapshot(asignacionId),
    () => false,
    userId,
    orgId,
  )

  if (state.status === "loading") {
    return (
      <div>
        <Breadcrumb items={[{ label: t.eventos.title, href: "/juez/eventos" }]} />
        <div className="h-7 bg-gray-200 rounded w-2/3 mb-1 mt-5 animate-pulse" />
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-6 animate-pulse" />
        <div className="space-y-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
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

  return <PatrullasList asignacionId={asignacionId} ctx={state.data} />
}
