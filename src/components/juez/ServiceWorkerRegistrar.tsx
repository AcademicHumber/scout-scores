"use client"

import { useEffect } from "react"

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") return
    if (!("serviceWorker" in navigator)) return

    const hadController = !!navigator.serviceWorker.controller
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err)
    })

    if (hadController) return // SW ya controlaba esta página: no reload necesario

    // Primera activación: el SW recién instalado toma control de la página.
    // Un reload garantiza que la navegación inicial pase por el SW y se cachee.
    // sessionStorage evita reloads en cascada si el SW se actualiza varias veces.
    const onControllerChange = () => {
      try {
        if (sessionStorage.getItem("sw-reloaded")) return
        sessionStorage.setItem("sw-reloaded", "1")
      } catch {
        // sessionStorage no disponible (modo privado con storage bloqueado)
      }
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
  }, [])

  return null
}
