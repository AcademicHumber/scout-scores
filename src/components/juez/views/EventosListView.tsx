"use client"

import { useSession } from "next-auth/react"
import Link from "next/link"
import { JuezLink } from "@/lib/offline/juez-router"
import { useJuezData } from "@/lib/offline/use-juez-data"
import { useOnlineStatus } from "@/lib/offline/use-online-status"
import { readEventosFromSnapshot, type EventoSummary } from "@/lib/offline/snapshot"
import messages from "@/messages/es.json"

const t = messages.juez

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
      <div className="h-3 bg-gray-100 rounded w-1/3" />
    </div>
  )
}

function FirstTimeOfflineMessage() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 p-10 text-center">
      <p className="font-semibold text-amber-800">{t.primeraVezOffline.titulo}</p>
      <p className="text-sm text-amber-700 mt-2">{t.primeraVezOffline.mensaje}</p>
    </div>
  )
}

function EventosList({ eventos }: { eventos: EventoSummary[] }) {
  return (
    <ul className="space-y-2.5">
      {eventos.map((evento) => (
        <li key={evento.id}>
          <JuezLink
            href={`/juez/eventos/${evento.id}`}
            className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px] hover:border-brand/50 hover:shadow-sm active:scale-[0.99] transition-all"
          >
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-base text-gray-900 leading-tight truncate">
                {evento.nombre}
              </p>
              {evento.lugar && (
                <p className="text-sm text-gray-500 mt-0.5 truncate">{evento.lugar}</p>
              )}
              <p className="text-xs text-gray-400 mt-1">
                {new Date(evento.fechaInicio).toLocaleDateString("es-AR", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <span className="rounded-full bg-brand-light text-brand text-sm font-semibold px-3 py-1">
                {evento.postasCount === 1
                  ? t.evento.postasCount.replace("{{count}}", "1")
                  : t.evento.postasCountPlural.replace("{{count}}", String(evento.postasCount))}
              </span>
              <span className="text-gray-300 text-xl">›</span>
            </div>
          </JuezLink>
        </li>
      ))}
    </ul>
  )
}

export function EventosListView() {
  const { data: session } = useSession()
  const userId = session?.user.id
  const orgId = session?.user.activeOrganizationId ?? undefined
  const isOnline = useOnlineStatus()

  const state = useJuezData(
    readEventosFromSnapshot,
    (e) => e.length === 0,
    userId,
    orgId,
  )

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{t.eventos.title}</h1>
      <p className="text-sm text-gray-500 mb-6">{t.eventos.subtitle}</p>

      {state.status === "loading" && (
        <div className="space-y-2.5">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {state.status === "empty" && (
        state.firstTimeOffline
          ? <FirstTimeOfflineMessage />
          : (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
              <p className="font-medium text-gray-500">{t.eventos.empty}</p>
              <p className="text-sm text-gray-400 mt-1">{t.eventos.emptyHint}</p>
            </div>
          )
      )}

      {state.status === "ready" && <EventosList eventos={state.data} />}

            {/* Navegación real de Next.js (no JuezLink): sale del SPA de /juez hacia /eventos,
          una sección distinta de la app con permisos "inferiores" (visible para
          cualquier miembro, no solo jueces). Deshabilitado sin conexión: /eventos
          no forma parte del SPA offline y fallaría sin red.
          Prominente a propósito: para un juez nuevo, cargar su posta en un evento
          en planificación suele ser la primera acción en toda la app. */}
      {isOnline ? (
        <Link
          href="/eventos"
          className="mb-3 mt-6 flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-brand/20 bg-brand-light px-4 py-3.5 transition-all hover:border-brand/40 active:scale-[0.99]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-brand">{t.eventos.planificacionCta}</span>
            <span className="block truncate text-xs text-brand/70">{t.eventos.planificacionCtaHint}</span>
          </span>
          <span className="shrink-0 text-xl text-brand/40">›</span>
        </Link>
      ) : (
        <div className="mb-6 mt-6 flex min-h-[64px] items-center gap-3 rounded-2xl border-2 border-gray-200 bg-gray-50 px-4 py-3.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-300 text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold text-gray-400">{t.eventos.planificacionCta}</span>
            <span className="block truncate text-xs text-gray-400">{t.eventos.offlineTag}</span>
          </span>
        </div>
      )}

      <div className="mt-8 text-center">
        <JuezLink
          href="/juez/pendientes"
          className="block text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          Ver operaciones pendientes
        </JuezLink>
      </div>
    </div>
  )
}
