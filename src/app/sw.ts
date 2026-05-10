import { defaultCache } from "@serwist/next/worker"
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist"
import { Serwist, NetworkOnly, NetworkFirst, CacheFirst, ExpirationPlugin } from "serwist"

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: WorkerGlobalScope & typeof globalThis & { __SW_MANIFEST: (PrecacheEntry | string)[] | undefined }

const JUEZ_NAVIGATE_CACHE = "juez-navigate"

// Next.js App Router SSR responses are ReadableStreams. The Cache API can't store
// them directly — cache.put() with a streaming body fails or corrupts. This plugin
// buffers the full body into an ArrayBuffer before caching, creating a proper
// cacheable Response while the original stream still flows to the browser.
const bufferResponsePlugin = {
  cacheWillUpdate: async ({ response }: { request: Request; response: Response }) => {
    if (!response || !response.ok) return null
    try {
      const body = await response.clone().arrayBuffer()
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      })
    } catch {
      return null
    }
  },
}

// Normalizes cache keys by stripping the _rsc query param that Next.js appends
// to RSC fetch requests. Without this, each navigation creates a new cache entry
// for the same URL (different hash each time) and hits are never found offline.
const stripRscParam = {
  cacheKeyWillBeUsed: async ({ request }: { request: Request }) => {
    const url = new URL(request.url)
    if (!url.searchParams.has("_rsc")) return request
    url.searchParams.delete("_rsc")
    return new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      credentials: request.credentials,
    })
  },
}

// When a specific /juez/** URL isn't in cache offline, try progressively broader
// fallbacks. With the SPA catch-all, any cached /juez/** HTML serves any route.
const juezNavigateFallbackPlugin = {
  handlerDidError: async ({ request }: { request: Request }) => {
    const cache = await caches.open(JUEZ_NAVIGATE_CACHE)
    // 1) match exacto con ignoreVary
    const exact = await cache.match(request, { ignoreVary: true })
    if (exact) return exact
    // 2) /juez/eventos como shell por defecto
    const eventos = await cache.match("/juez/eventos", { ignoreVary: true })
    if (eventos) return eventos
    // 3) cualquier entry cacheada — el catch-all SPA sirve para cualquier URL /juez/**
    const keys = await cache.keys()
    if (keys.length > 0) return cache.match(keys[0])
    return undefined
  },
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: false,
  runtimeCaching: [
    // Auth — siempre red, nunca cachear
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/auth"),
      handler: new NetworkOnly(),
    },
    // Sync — siempre red, nunca cachear
    {
      matcher: ({ url }) => url.pathname === "/api/juez/sync",
      handler: new NetworkOnly(),
    },
    // Snapshot — red primero, fallback a cache
    {
      matcher: ({ url }) => url.pathname === "/api/juez/snapshot",
      handler: new NetworkFirst({
        cacheName: "juez-snapshot",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
    // Manifest PWA — siempre desde la red
    {
      matcher: ({ url }) => url.pathname === "/manifest.webmanifest",
      handler: new NetworkOnly(),
    },
    // Navegaciones /juez/** — cacheamos el HTML (bufferizado) al visitar online;
    // offline servimos el HTML cacheado o fallback a cualquier entry /juez/** existente.
    {
      matcher: ({ request, url }) =>
        request.mode === "navigate" && url.pathname.startsWith("/juez"),
      handler: new NetworkFirst({
        cacheName: JUEZ_NAVIGATE_CACHE,
        plugins: [stripRscParam, bufferResponsePlugin, juezNavigateFallbackPlugin],
      }),
    },
    // Resto de navegaciones (admin, auth, etc.) — solo red.
    {
      matcher: ({ request }) => request.mode === "navigate",
      handler: new NetworkOnly(),
    },
    // Sub-requests de /juez/** (RSC, fetch, assets) — red primero, fallback a cache.
    // stripRscParam normaliza las URLs antes de leer/escribir el cache.
    {
      matcher: ({ url, request }) =>
        url.pathname.startsWith("/juez") && request.mode !== "navigate",
      handler: new NetworkFirst({
        cacheName: "juez-assets",
        plugins: [stripRscParam, new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // Assets estáticos — cache primero
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/static"),
      handler: new CacheFirst({
        cacheName: "next-static",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Imágenes — cache primero
    {
      matcher: ({ url }) => url.pathname.startsWith("/_next/image"),
      handler: new CacheFirst({
        cacheName: "next-images",
        plugins: [new ExpirationPlugin({ maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    ...defaultCache,
  ],
})

serwist.addEventListeners()
