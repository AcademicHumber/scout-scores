"use client"

import { useSession } from "next-auth/react"
import { JuezLink } from "@/lib/offline/juez-router"
import { useJuezData } from "@/lib/offline/use-juez-data"
import { readPostasFromSnapshot, type PostaJuezContextOffline } from "@/lib/offline/snapshot"
import { Breadcrumb } from "@/components/juez/Breadcrumb"
import messages from "@/messages/es.json"

const t = messages.juez

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] animate-pulse">
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

function PostasList({ ctx }: { ctx: PostaJuezContextOffline }) {
  const { eventoNombre, postas } = ctx

  return (
    <div>
      <Breadcrumb items={[{ label: t.eventos.title, href: "/juez/eventos" }]} />
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{eventoNombre}</h1>
      <p className="text-sm text-gray-500 mb-6">{t.evento.postasTitle}</p>

      {postas.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
          <p className="font-medium text-gray-500">{t.evento.empty}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {postas.map((posta) => (
            <li key={posta.asignacionId}>
              <JuezLink
                href={`/juez/postas/${posta.asignacionId}`}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] hover:border-brand/50 hover:shadow-sm active:scale-[0.99] transition-all"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-gray-900 truncate">{posta.postaNombre}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{posta.actividadNombre}</p>
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1.5">
                  <div className="flex items-center gap-2">
                    {posta.plantillaModo && (
                      <span className="rounded-full bg-stone-100 text-stone-600 text-xs px-2 py-0.5">
                        {t.posta.modo[posta.plantillaModo]}
                      </span>
                    )}
                    <span className="text-gray-300 text-xl">›</span>
                  </div>
                  <span className="text-sm font-semibold text-gray-700">
                    {posta.enviadas}/{posta.totalPatrullas}
                    <span className="text-xs font-normal text-gray-400 ml-1">enviadas</span>
                  </span>
                  {posta.borradores > 0 && (
                    <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-semibold px-2 py-0.5">
                      {posta.borradores} borr.
                    </span>
                  )}
                </div>
              </JuezLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PostasView({ eventoId }: { eventoId: string }) {
  const { data: session } = useSession()
  const userId = session?.user.id
  const orgId = session?.user.activeOrganizationId ?? undefined

  const state = useJuezData(
    () => readPostasFromSnapshot(eventoId),
    () => false,
    userId,
    orgId,
  )

  if (state.status === "loading") {
    return (
      <div>
        <Breadcrumb items={[{ label: t.eventos.title, href: "/juez/eventos" }]} />
        <div className="h-7 bg-gray-200 rounded w-2/3 mb-2 animate-pulse" />
        <div className="h-4 bg-gray-100 rounded w-1/3 mb-6 animate-pulse" />
        <div className="space-y-2.5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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

  return <PostasList ctx={state.data} />
}
