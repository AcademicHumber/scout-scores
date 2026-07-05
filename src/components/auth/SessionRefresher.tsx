"use client"

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef } from "react"

// Intervalo de respaldo: cubre el caso de una pestaña que nunca pierde el foco
// (ej: celular del juez fijo en /juez durante todo el evento).
const BACKSTOP_INTERVAL_MS = 3 * 60 * 1000

// Refresca la sesión JWT con memberships frescas de la DB. Necesario porque un cambio
// de rol hecho por un ADMIN sobre OTRO usuario no puede empujar una actualización a la
// cookie de ese usuario: solo su propio navegador puede hacerlo, vía unstable_update.
// Sin este componente, el usuario afectado queda con el rol viejo hasta volver a loguearse.
export function SessionRefresher() {
  const { update } = useSession()
  const router = useRouter()
  const refreshingRef = useRef(false)
  // `update` de useSession() no es estable entre renders: llamarlo cambia el estado de
  // sesión, lo que re-renderiza este componente con una nueva referencia. Guardarlo en un
  // ref evita que `refresh` cambie de identidad, lo cual rompería el efecto de "solo al
  // montar" de abajo (se volvería a disparar en cada re-render, generando un loop infinito).
  const updateRef = useRef(update)
  const routerRef = useRef(router)
  useEffect(() => {
    updateRef.current = update
    routerRef.current = router
  }, [update, router])

  const refresh = useCallback(async () => {
    if (refreshingRef.current || !navigator.onLine) return
    refreshingRef.current = true
    try {
      await updateRef.current({ refreshMemberships: true })
      routerRef.current.refresh()
    } catch {
      // Red inestable: se reintenta en el próximo trigger (foco, intervalo)
    } finally {
      refreshingRef.current = false
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh()
    }
    document.addEventListener("visibilitychange", handleVisibility)
    return () => document.removeEventListener("visibilitychange", handleVisibility)
  }, [refresh])

  useEffect(() => {
    const id = setInterval(refresh, BACKSTOP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

  return null
}
