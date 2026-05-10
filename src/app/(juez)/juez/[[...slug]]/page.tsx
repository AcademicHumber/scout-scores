"use client"

import { useEffect } from "react"
import { JuezRouterProvider, useJuezRouter } from "@/lib/offline/juez-router"
import { EventosListView } from "@/components/juez/views/EventosListView"
import { PostasView } from "@/components/juez/views/PostasView"
import { PatrullasView } from "@/components/juez/views/PatrullasView"
import { ScoringView } from "@/components/juez/views/ScoringView"

function RootSkeleton() {
  return (
    <div className="space-y-2.5 animate-pulse">
      <div className="h-7 bg-gray-200 rounded w-1/2 mb-1" />
      <div className="h-4 bg-gray-100 rounded w-1/3 mb-6" />
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px]">
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px]">
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/4" />
      </div>
      <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 min-h-[72px]">
        <div className="h-4 bg-gray-200 rounded w-3/5 mb-2" />
        <div className="h-3 bg-gray-100 rounded w-1/3" />
      </div>
    </div>
  )
}

function NotFoundView() {
  return (
    <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-10 text-center">
      <p className="font-semibold text-gray-700">Página no encontrada</p>
      <p className="text-sm text-gray-500 mt-2">La ruta solicitada no existe.</p>
    </div>
  )
}

function CatchAllRouter() {
  const { pathname, navigate } = useJuezRouter()

  useEffect(() => {
    if (pathname === "/juez" || pathname === "/juez/") {
      navigate("/juez/eventos")
    }
  }, [pathname, navigate])

  if (pathname === null) return <RootSkeleton />

  if (pathname === "/juez/eventos") return <EventosListView />

  const eventoMatch = pathname.match(/^\/juez\/eventos\/([^/]+)\/?$/)
  if (eventoMatch) return <PostasView eventoId={eventoMatch[1]} />

  const postaMatch = pathname.match(/^\/juez\/postas\/([^/]+)\/?$/)
  if (postaMatch) return <PatrullasView asignacionId={postaMatch[1]} />

  const scoringMatch = pathname.match(/^\/juez\/postas\/([^/]+)\/([^/]+)\/?$/)
  if (scoringMatch) {
    return <ScoringView asignacionId={scoringMatch[1]} patrullaId={scoringMatch[2]} />
  }

  return <NotFoundView />
}

export default function JuezCatchAllPage() {
  return (
    <JuezRouterProvider>
      <CatchAllRouter />
    </JuezRouterProvider>
  )
}
