# Plan 7d — Catch-all SPA para `/juez/**` + fixes de SW caching offline

## Estado: completado (2026-05-10)

Redactado el 2026-05-10 tras ejecutar el Plan 7c y descubrir tres bugs offline:

1. **`juez-navigate` cache vacío en primera carga**: el `ServiceWorkerRegistrar` se monta dentro de `app/(juez)/juez/layout.tsx`. La primera navegación a `/juez/eventos` (tras login OAuth) se sirve directo desde el server porque el SW recién se registra DURANTE el render de esa página. Para cuando el SW activa y reclama el client, la navegación inicial ya pasó. Resultado: el HTML del shell nunca se cachea, y el `handlerDidError` no encuentra fallback offline.
2. **`_rsc` query string es un cache buster**: cada Next.js `<Link>` prefetch/navegación dispara una RSC fetch con `?_rsc=hash` único. La cache `juez-assets` guarda `?_rsc=a1bs8` pero el siguiente request es `?_rsc=1pnhk` — match miss garantizado. El RSC nunca se sirve desde cache offline; Next.js fallbackea a hard navigation, que cae en el bug 1.
3. **Caveat arquitectónico**: aún con bugs 1 y 2 resueltos, las páginas migradas en Plan 7c usan `useParams()`. Si el SW sirve el HTML de `/juez/eventos` como fallback para una URL nunca visitada (`/juez/eventos/abc123`), el árbol de routing embebido es de `/juez/eventos` → la página renderea la lista de eventos en la URL del evento. **Cualquier ruta no visitada online es inalcanzable offline**.

El caveat (3) es el que rompe el caso de uso real. Un juez no va a "pasearse" por todas las patrullas con WiFi antes del campamento. Plan 7d resuelve los tres con un cambio arquitectónico que elimina la dependencia de Next.js routing dentro del subárbol `/juez/**`.

## Contexto

Plan 7c migró las páginas del juez a Client Components que leen del IDB. La arquitectura asumió que el SW podía cachear HTML SSR por URL y servirlos offline. Eso funciona para rutas previamente visitadas pero no para rutas nuevas — y los caches de RSC son inútiles por el `_rsc` cache buster.

El insight: las páginas del juez **no necesitan SSR**. Toda su data viene del IDB del cliente. Lo único que necesita ser servido es el shell (layout + bundles JS) y un mini-router que decida qué vista renderizar según `window.location.pathname`. Eso es una SPA clásica.

Plan 7d transforma `/juez/**` en una SPA real montada dentro de Next.js: una sola ruta catch-all que captura todo `/juez/**` y un router cliente custom que lee `window.location` y mounta la vista correcta. Una sola HTML cacheada sirve para infinitas URLs, sin RSC fetches, sin Next.js router involucrado, sin Vary headers que romper cache.

Los fixes 1 y 2 del SW se incluyen en el mismo plan porque sin ellos el caching offline de Plan 7d tampoco funciona en el primer load.

## Alcance

### Incluye

- Refactor de las 4 páginas `/juez/**` migradas en Plan 7c a una sola ruta catch-all `app/(juez)/juez/[[...slug]]/page.tsx`.
- Hook `useJuezRouter` con state `pathname` derivado de `window.location`, listener de `popstate` (back/forward del browser) y función `navigate(href)` que hace `pushState` + `setState`.
- Componente `<JuezLink href>` que reemplaza `<Link>` y `<a>` dentro de `/juez/**`. Internamente usa `useJuezRouter().navigate`.
- Extracción de las 4 vistas existentes a `src/components/juez/views/*.tsx` reusando todo el JSX y lógica de `useJuezData`.
- Plugin `stripRscParam` en el SW que normaliza URLs eliminando `_rsc` antes de leer/escribir el cache.
- Pattern de `controllerchange` + `sessionStorage`-guarded reload en `ServiceWorkerRegistrar` para que la primera navegación post-login pase por el SW.
- Mejora del `juezNavigateFallbackPlugin` para usar cualquier entry de `juez-navigate` como fallback (no solo `/juez/eventos`), con prioridad a `/juez/eventos` cuando existe.
- Eliminación de los logs de diagnóstico agregados en sesiones previas.
- Strings nuevos en `es.json` si surgen mensajes nuevos para skeleton/error de routing.

### No incluye

- Cambios al modelo de datos, IDB schema, sync engine, cola, conflict detection, API routes ni snapshot. Toda la capa de Plan 7b/7c queda intacta.
- Migración del subárbol `/admin/**` a SPA. Admin sigue siendo SSR-only.
- Refactor del `juez/layout.tsx`: sigue Server Component con `requireRole` y header sticky.
- Persistencia de la "última ruta" para deep linking entre sesiones offline.
- Animación de transición entre vistas (puede agregarse después; fuera de alcance).
- Pre-fetching agresivo de rutas en el primer load online (innecesario con catch-all SPA).
- Tests E2E nuevos: la verificación se hace por escenarios manuales en `pnpm build && pnpm start`.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **Patrón de routing offline** | Catch-all `[[...slug]]/page.tsx` Client + router custom basado en `window.location` | Una sola HTML sirve cualquier `/juez/**` URL. Elimina la dependencia del SSR per-route. Fallback del SW funciona para cualquier ruta sin importar si se visitó online. |
| **Inicialización del pathname** | `useState<string \| null>(null)` → `useEffect` que setea `window.location.pathname` | SSR rinde skeleton (pathname `null`). CSR primer render rinde skeleton también (matchea SSR, sin hydration mismatch). useEffect post-hidratación lee la URL real y dispara re-render con la vista correcta. |
| **Navegación interna** | `<JuezLink>` con `e.preventDefault()` + `pushState` + `setState` | Bypassea Next.js Link/Router. No dispara RSC fetches. Funciona idéntico online y offline. `popstate` listener cubre back/forward del browser. |
| **`<Link>` de Next.js fuera de `/juez/**`** | Permitido (ej: NotFound → "Volver a eventos" si el destino sigue dentro de juez, usar `<JuezLink>`; si es a otra sección, `<Link>`) | El catch-all solo aplica a navegación interna. Salir del subárbol (logout, links a admin) sigue siendo navegación normal. |
| **Fix `_rsc`** | Plugin `cacheKeyWillBeUsed` que reescribe el `Request` sin `_rsc` | Una entry por URL real, sin importar el hash. No afecta semántica; el server ignora `_rsc` en `juez-assets` (no varía la respuesta por hash). Después del catch-all SPA hay menos RSC traffic, pero el plugin sigue siendo correcto. |
| **Fix primera navegación** | `ServiceWorkerRegistrar` captura `hadController` antes de registrar; si no había, escucha `controllerchange` y reload con `sessionStorage` flag | Pattern estándar (Workbox docs). Un solo reload extra la primera vez post-login. `sessionStorage` evita loops si el SW se actualiza varias veces durante la sesión. |
| **Fallback flexible del SW** | `handlerDidError` intenta: 1) match exacto con `ignoreVary`, 2) `/juez/eventos`, 3) cualquier entry del cache | Con catch-all SPA, cualquier HTML cacheado de `/juez/**` sirve para cualquier otra URL. Resiliente si `/juez/eventos` aún no se cacheó pero otra ruta sí. |
| **Mantener `useJuezData`** | Sin cambios | El hook funciona idéntico — solo cambia quién lo invoca (las vistas en lugar de los page.tsx). |
| **`/juez` (sin slug)** | Redirect inline desde el catch-all a `/juez/eventos` (vía `useEffect` + `navigate`) | Reemplaza el `app/(juez)/juez/page.tsx` actual. Mantiene el comportamiento existente. |
| **Suprimir hydration warning** | No es necesario | El primer render CSR matchea SSR (ambos rinden skeleton porque `pathname === null`). useEffect dispara después. Ningún warning. |

## Arquitectura del catch-all SPA

### Layout de archivos

**Antes (Plan 7c):**
```
app/(juez)/juez/
├── layout.tsx                          (Server, requireRole)
├── page.tsx                            (Server, redirect a /juez/eventos)
├── eventos/
│   ├── page.tsx                        (Client)
│   └── [eventoId]/page.tsx             (Client)
└── postas/
    └── [asignacionId]/
        ├── page.tsx                    (Client)
        └── [patrullaId]/page.tsx       (Client)
```

**Después (Plan 7d):**
```
app/(juez)/juez/
├── layout.tsx                          (Server, requireRole — sin cambios)
└── [[...slug]]/
    └── page.tsx                        (Client, catch-all SPA)

src/components/juez/views/
├── EventosListView.tsx                 (extraído de eventos/page.tsx)
├── PostasView.tsx                      (extraído de eventos/[eventoId]/page.tsx)
├── PatrullasView.tsx                   (extraído de postas/[asignacionId]/page.tsx)
└── ScoringView.tsx                     (extraído de postas/[asignacionId]/[patrullaId]/page.tsx)

src/lib/offline/
└── juez-router.tsx                     (NUEVO — useJuezRouter, JuezLink, JuezRouterProvider)
```

### Forma del catch-all page

```tsx
// app/(juez)/juez/[[...slug]]/page.tsx
"use client"

import { useEffect, useState } from "react"
import { JuezRouterProvider, useJuezRouter } from "@/lib/offline/juez-router"
import { EventosListView } from "@/components/juez/views/EventosListView"
import { PostasView } from "@/components/juez/views/PostasView"
import { PatrullasView } from "@/components/juez/views/PatrullasView"
import { ScoringView } from "@/components/juez/views/ScoringView"

function CatchAllRouter() {
  const { pathname, navigate } = useJuezRouter()

  useEffect(() => {
    if (pathname === "/juez" || pathname === "/juez/") {
      navigate("/juez/eventos")
    }
  }, [pathname, navigate])

  if (pathname === null) return <RootSkeleton />

  // /juez/eventos
  if (pathname === "/juez/eventos") return <EventosListView />

  // /juez/eventos/[eventoId]
  const eventoMatch = pathname.match(/^\/juez\/eventos\/([^/]+)\/?$/)
  if (eventoMatch) return <PostasView eventoId={eventoMatch[1]} />

  // /juez/postas/[asignacionId]
  const postaMatch = pathname.match(/^\/juez\/postas\/([^/]+)\/?$/)
  if (postaMatch) return <PatrullasView asignacionId={postaMatch[1]} />

  // /juez/postas/[asignacionId]/[patrullaId]
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
```

### Forma del router

```tsx
// src/lib/offline/juez-router.tsx
"use client"

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

type Ctx = { pathname: string | null; navigate: (href: string) => void }

const JuezRouterCtx = createContext<Ctx | null>(null)

export function JuezRouterProvider({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState<string | null>(null)

  useEffect(() => {
    setPathname(window.location.pathname)
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener("popstate", onPopState)
    return () => window.removeEventListener("popstate", onPopState)
  }, [])

  const navigate = useCallback((href: string) => {
    if (typeof window === "undefined") return
    if (window.location.pathname === href) return
    window.history.pushState({}, "", href)
    setPathname(href)
    window.scrollTo(0, 0)
  }, [])

  return <JuezRouterCtx.Provider value={{ pathname, navigate }}>{children}</JuezRouterCtx.Provider>
}

export function useJuezRouter() {
  const ctx = useContext(JuezRouterCtx)
  if (!ctx) throw new Error("useJuezRouter must be used inside JuezRouterProvider")
  return ctx
}

export function JuezLink({
  href,
  children,
  className,
  ...rest
}: { href: string; children: ReactNode; className?: string } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const { navigate } = useJuezRouter()
  return (
    <a
      href={href}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
        e.preventDefault()
        navigate(href)
      }}
      className={className}
      {...rest}
    >
      {children}
    </a>
  )
}
```

### Reglas para las vistas extraídas

- Reciben sus params como props (`eventoId`, `asignacionId`, etc.) — no usan `useParams`.
- Internamente reusan `useJuezData(reader, ...)` exactamente como en Plan 7c.
- Reemplazan `<Link href="/juez/...">` y `<a href="/juez/...">` por `<JuezLink href="/juez/...">`.
- El componente `Breadcrumb` ya existente debe migrar a `<JuezLink>` internamente — un único cambio que beneficia las 3 vistas que lo usan.

### Cambios en el SW (`src/app/sw.ts`)

```ts
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
```

Aplicar a:
- `juez-assets` (NetworkFirst para `/juez/**` no-navigate). Crítico: sin esto, los RSC nunca se cachean utilmente.
- `juez-navigate` (defensivo — los navigates típicamente no llevan `_rsc`, pero por consistencia).

Mejora del fallback:

```ts
const juezNavigateFallbackPlugin = {
  handlerDidError: async ({ request }: { request: Request }) => {
    const cache = await caches.open(JUEZ_NAVIGATE_CACHE)
    // 1) match exacto con ignoreVary
    const exact = await cache.match(request, { ignoreVary: true })
    if (exact) return exact
    // 2) /juez/eventos como shell por defecto
    const eventos = await cache.match("/juez/eventos", { ignoreVary: true })
    if (eventos) return eventos
    // 3) cualquier entry — el catch-all sirve para cualquier URL
    const keys = await cache.keys()
    if (keys.length > 0) return cache.match(keys[0])
    return undefined
  },
}
```

Eliminar todos los `console.log` de diagnóstico (`[SW][match]`, `[SW][buffer]`, `[SW][fallback]`) agregados durante el debugging del Plan 7c.

### Cambios en `ServiceWorkerRegistrar`

```tsx
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

    if (hadController) return // SW ya controlaba: no reload necesario

    const onControllerChange = () => {
      if (sessionStorage.getItem("sw-reloaded")) return
      sessionStorage.setItem("sw-reloaded", "1")
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange)
    return () => navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange)
  }, [])

  return null
}
```

## Implementación

Pasos en orden de dependencia. Cada paso debería dejar el typecheck y los tests existentes verdes.

### 1. Router cliente y `<JuezLink>`

- Crear `src/lib/offline/juez-router.tsx` con el `JuezRouterProvider`, `useJuezRouter` y `<JuezLink>` (forma definida arriba).
- Sin uso aún — solo el archivo nuevo.
- Verificación: `pnpm typecheck` limpio.

### 2. Extraer vistas

- `src/components/juez/views/EventosListView.tsx`: copiar el cuerpo del actual `eventos/page.tsx`. Cambiar `<Link>` por `<JuezLink>`. Sin params (lista plana).
- `src/components/juez/views/PostasView.tsx`: copiar `eventos/[eventoId]/page.tsx`. Recibir `eventoId` como prop. `<Link>` → `<JuezLink>`.
- `src/components/juez/views/PatrullasView.tsx`: copiar `postas/[asignacionId]/page.tsx`. Recibir `asignacionId` como prop. `<Link>`/`<a>` → `<JuezLink>`.
- `src/components/juez/views/ScoringView.tsx`: copiar `postas/[asignacionId]/[patrullaId]/page.tsx`. Recibir `asignacionId` y `patrullaId` como props. Cualquier link interno → `<JuezLink>`. El `ScoreSheetForm` no cambia (recibe los mismos props).
- `src/components/juez/Breadcrumb.tsx`: cambiar `<Link>` interno por `<JuezLink>` para que los breadcrumbs naveguen via SPA.
- Verificación: `pnpm typecheck` limpio. Las vistas siguen importables (aún no se montan).

### 3. Catch-all page

- Crear `src/app/(juez)/juez/[[...slug]]/page.tsx` con la forma definida arriba (parsing de pathname + render condicional + `JuezRouterProvider`).
- Manejar el caso `/juez` y `/juez/` redirigiendo a `/juez/eventos` desde un `useEffect`.
- `<RootSkeleton>` puede ser un placeholder mínimo (header ya viene del layout, así que solo unas cards skeleton genéricas).
- Verificación: `pnpm typecheck` limpio. **No probar todavía en browser** — coexisten las páginas viejas y la nueva, comportamiento indefinido.

### 4. Eliminar las páginas viejas

Borrar (en este orden, un commit por archivo o todos juntos):
- `src/app/(juez)/juez/eventos/page.tsx`
- `src/app/(juez)/juez/eventos/[eventoId]/page.tsx`
- `src/app/(juez)/juez/postas/[asignacionId]/page.tsx`
- `src/app/(juez)/juez/postas/[asignacionId]/[patrullaId]/page.tsx`
- `src/app/(juez)/juez/page.tsx` (el redirect server-side a `/juez/eventos`).
- Las carpetas vacías (`eventos/`, `postas/[asignacionId]/`, etc.) si Next.js no las requiere. Probar con `pnpm build` que no haya conflicto de rutas.

Verificación: `pnpm build` limpio. **Si Next.js detecta conflicto entre `[[...slug]]` y carpetas vacías**, eliminar las carpetas. Si las carpetas tienen archivos compartidos (no debería), evaluar.

### 5. Fix `_rsc` en SW

- Agregar plugin `stripRscParam` en `src/app/sw.ts`.
- Aplicar a `juez-assets` (uso primario) y `juez-navigate` (defensivo).
- Verificación: `pnpm build` regenera `public/sw.js`.

### 6. Mejora del fallback del SW

- Reescribir `juezNavigateFallbackPlugin.handlerDidError` para intentar las 3 estrategias (match exacto → `/juez/eventos` → cualquier entry).
- Verificación: `pnpm build`.

### 7. Reload en primera navegación

- Reemplazar `src/components/juez/ServiceWorkerRegistrar.tsx` por la versión con `controllerchange` + `sessionStorage`.
- Verificación: `pnpm typecheck`.

### 8. Limpiar logs del diagnóstico

- Quitar todos los `console.log` / `console.warn` / `console.error` con prefijo `[SW]` agregados durante el debugging.
- Mantener el `console.warn("SW registration failed:", err)` legítimo del Registrar.
- Verificación: `pnpm build` y revisar que `public/sw.js` no tenga "[SW]" en strings.

### 9. Smoke test online

`pnpm build && pnpm start`:
- Login → debería reloadearse una vez automáticamente (el `sw-reloaded` sessionStorage flag).
- `/juez/eventos` carga correctamente.
- Click en un evento → SPA navigation, URL cambia, vista cambia, sin full reload.
- Breadcrumb back → vista anterior.
- Browser back button → vista anterior.
- Click en una posta → patrullas. Click en una patrulla → form de scoring. Cargar y enviar.

Si todo funciona online, pasar a verificación offline.

### 10. Verificación offline (escenario 3 estricto)

Detallado en sección "Verificación" abajo. Es el criterio de done del plan.

### 11. Skip `/dashboard` para jueces

El dashboard hoy es un placeholder de Capa 2. Para un juez recién logueado es un hop sin valor que además dispara un error del SW (`no-response :: /dashboard`) cuando la red parpadea durante el callback OAuth.

Cambio en `src/app/(app)/dashboard/page.tsx`:

```tsx
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const user = await getCurrentUser()

  if (user?.activeRole === "JUEZ") {
    redirect("/juez/eventos")
  }

  // ... resto igual
}
```

Una sola línea de lógica. El admin sigue viendo el dashboard como hoy. El juez nunca lo ve. Cuando Capa 2 le dé contenido útil al juez en el dashboard, se revierte.

**Nota**: el juez sigue cargando el route handler de `/dashboard` un instante (Server Component renderiza, `redirect()` interrumpe el response). El browser nunca pinta el dashboard. Es aceptable; la alternativa (smart-router en `/`) toca más archivos.

Verificación: `pnpm typecheck` limpio. Smoke test online en escenario 9.

## Archivos críticos

**Modificados:**
- `src/app/sw.ts` — plugin `stripRscParam`, fallback flexible, eliminación de logs.
- `src/components/juez/ServiceWorkerRegistrar.tsx` — reload en primera activación.
- `src/components/juez/Breadcrumb.tsx` — usa `<JuezLink>`.
- `src/app/(app)/dashboard/page.tsx` — redirect a `/juez/eventos` si `activeRole === "JUEZ"`.

**Nuevos:**
- `src/app/(juez)/juez/[[...slug]]/page.tsx` — catch-all SPA.
- `src/lib/offline/juez-router.tsx` — provider, hook, link.
- `src/components/juez/views/EventosListView.tsx`
- `src/components/juez/views/PostasView.tsx`
- `src/components/juez/views/PatrullasView.tsx`
- `src/components/juez/views/ScoringView.tsx`

**Eliminados:**
- `src/app/(juez)/juez/page.tsx`
- `src/app/(juez)/juez/eventos/page.tsx`
- `src/app/(juez)/juez/eventos/[eventoId]/page.tsx`
- `src/app/(juez)/juez/postas/[asignacionId]/page.tsx`
- `src/app/(juez)/juez/postas/[asignacionId]/[patrullaId]/page.tsx`

**Sin cambios:**
- `src/app/(juez)/juez/layout.tsx` — Server Component con `requireRole` y header.
- `src/app/(juez)/layout.tsx` — `SessionProvider` con session inicial.
- `src/lib/offline/use-juez-data.ts`, `sync-engine.ts`, `snapshot.ts`, `db.ts`.
- `src/components/juez/ScoreSheetForm.tsx`, `ConflictBanner.tsx`, `SyncStatusBadge.tsx`.
- `src/repositories/score-sheet.repo.ts`.
- API routes (`/api/juez/snapshot`, `/api/juez/sync`).
- `prisma/schema.prisma`.

## Tests

No se agregan tests automáticos. Justificación:
- El router cliente (`useJuezRouter`) es trivial y se testea por integración.
- Las vistas extraídas son JSX puro; sus dependencias (`useJuezData`, readers del IDB) ya tienen cobertura indirecta vía `score-sheet.repo.test.ts` (lecturas) y los tests de Plan 7b (sync engine).
- El SW no es testeable unitariamente sin un harness elaborado.

La verificación pasa por escenarios E2E manuales en `pnpm build && pnpm start`.

## Verificación

### Entornos requeridos

| Escenario | Entorno | Razón |
|---|---|---|
| 1 — Online flow sin regresiones | `pnpm build && pnpm start` | El SW debe estar activo |
| 2 — Reload offline en cualquier ruta | `pnpm build && pnpm start` | Requiere SW + IDB |
| 3 — **Navegación offline a ruta nunca visitada** | `pnpm build && pnpm start` | El bug que motiva el plan |
| 4 — Browser back/forward offline | `pnpm build && pnpm start` | popstate del router custom |
| 5 — Login fresco con SW reload automático | `pnpm build && pnpm start` con storage limpio | Bug 1 fix |
| 6 — RSC cache hit con `_rsc` cambiando | `pnpm build && pnpm start` | Bug 2 fix |
| 7 — Conflict y sync siguen funcionando | `pnpm build && pnpm start` con dos browsers | No regresar Plan 7b |
| 8 — Logout limpia el `sw-reloaded` flag | `pnpm build && pnpm start` | UX |
| 9 — Juez salta `/dashboard` post-login | `pnpm dev` | Paso 11 |

### Escenario 1 — Online flow sin regresiones

**Pasos**: login JUEZ → `/juez/eventos` → click evento → click posta → click patrulla → cargar criterios → enviar. Volver con breadcrumb a cada nivel.

**Qué verificar**:
- Cada vista renderiza con los mismos datos que mostraba en Plan 7c.
- La URL cambia en la barra al navegar.
- No hay full reload entre navegaciones (Network tab: no hay request a `/juez/...?_rsc=...`).
- El `SyncStatusBadge` permanece verde.
- El IDB se hidrata como antes (una sola llamada a `/api/juez/snapshot`).
- El admin sigue viendo la planilla enviada en `/admin/eventos/[id]/planillas`.

### Escenario 2 — Reload offline en cualquier ruta

**Pasos**:
1. Login JUEZ. Visitar `/juez/eventos` y hacer click en un evento (cachea esa ruta también, pero no es estrictamente necesario).
2. DevTools → Network → Offline.
3. Refrescar (F5).

**Qué verificar**:
- El SW sirve el HTML cacheado (de `/juez/eventos` o de la ruta actual si quedó cacheada).
- El catch-all monta, lee `window.location.pathname`, renderiza la vista correcta.
- `useSession()` resuelve inmediatamente con la sesión inicial.
- Network tab: no hay `/api/auth/session` fallido.

### Escenario 3 — Navegación offline a ruta nunca visitada

**Este es el escenario que motivó el plan completo. No se cierra el plan hasta verificarlo.**

**Pasos**:
1. DevTools → Application → Storage → "Clear site data".
2. Login JUEZ fresh. Esperar el reload automático (Bug 1 fix).
3. Visitar SOLO `/juez/eventos`. **No clickear ningún evento.**
4. Verificar en IDB que el snapshot tiene entries de eventos/postas/patrullas que NO se visitaron.
5. DevTools → Network → Offline.
6. Click en un evento de la lista → debe mostrar la lista de postas correctas.
7. Click en una posta → patrullas correctas.
8. Click en una patrulla → form de scoring con los datos correctos.
9. Cargar puntajes → click "Enviar" → toast offline.
10. Browser back → vista anterior.
11. Browser back → vista anterior.

**Qué verificar**:
- Cada navegación funciona sin red, sin ERR_FAILED.
- La URL en la barra refleja la ruta actual (`/juez/eventos/[id]`, etc.).
- Los datos coinciden con lo que mostraría online (totales, criterios, etc.).
- La op queda en `pendingOps`.
- Al volver online, drena.

### Escenario 4 — Browser back/forward offline

**Pasos**: estando offline, navegar A → B → C, después back, back, forward, forward.

**Qué verificar**:
- Las URLs cambian correctamente con back/forward.
- `popstate` listener del router custom dispara el setPathname.
- Las vistas re-renderizan acorde.

### Escenario 5 — Login fresco con SW reload automático

**Pasos**:
1. Application → Storage → "Clear site data" (incluye SW + sessionStorage + cookies).
2. Login JUEZ.
3. Observar Network tab durante el redirect post-OAuth a `/juez/eventos`.

**Qué verificar**:
- Hay un único reload automático (la página parpadea brevemente).
- Tras el reload, `sessionStorage["sw-reloaded"] === "1"`.
- El SW está en estado "activated" e intercepta requests.
- `juez-navigate` cache contiene `/juez/eventos` tras el reload.
- Refrescar de nuevo NO dispara otro reload (sessionStorage flag).

### Escenario 6 — RSC cache hit con `_rsc` cambiando

**Pasos**:
1. Online en `/juez/eventos`.
2. Application → Cache Storage → `juez-assets`. Verificar que las URLs **no** tienen `?_rsc=...` (gracias al `cacheKeyWillBeUsed`).
3. Navegar a un evento (online). Volver al `/juez/eventos`. Volver a clickear el mismo evento.
4. La segunda RSC fetch (si ocurre) debe servirse desde cache.

**Qué verificar**:
- Las entries del cache `juez-assets` están normalizadas (sin `_rsc`).
- En modo offline, la RSC fetch del segundo click resuelve desde cache (Network tab muestra "from ServiceWorker"). Esto importa solo si seguimos usando RSC fetches; con la SPA del Plan 7d el flow primario no las dispara, pero el deep-link inicial sí.

### Escenario 7 — Conflict y sync sin regresiones

**Pasos**: el escenario 8 del Plan 7c (admin reabre planilla mientras juez está offline).

**Qué verificar**:
- El re-hidratado del snapshot tras volver online sigue funcionando.
- `lastHydratedAt` dispara re-lectura en la vista actual.
- El form pasa de read-only a editable sin recargar.
- Si hay conflict, el banner sigue apareciendo igual que antes.

### Escenario 9 — Juez salta `/dashboard` post-login

**Pasos**:
1. Storage limpio. Login JUEZ.
2. Tras OAuth callback, observar la URL final.
3. Entrar manualmente a `/dashboard` (escribiendo la URL en la barra) con un usuario JUEZ-only.

**Qué verificar**:
- Tras el OAuth callback, la URL termina en `/juez/eventos` (no en `/dashboard`).
- El browser puede haber pasado por `/dashboard` brevemente (request server-side) pero nunca renderiza el dashboard.
- Entrar manualmente a `/dashboard` como JUEZ → redirige a `/juez/eventos`.
- Login con un usuario ADMIN → llega y se queda en `/dashboard` como hoy. No hay regresión.
- Si el usuario tiene memberships en orgs distintas con roles distintos (ej: JUEZ en A, ADMIN en B), el redirect respeta `activeRole` (la org activa).

### Escenario 8 — Logout limpia state

**Pasos**:
1. Login JUEZ. Reload automático (escenario 5).
2. Logout.
3. Login de nuevo (mismo usuario o diferente).

**Qué verificar**:
- El `sessionStorage["sw-reloaded"]` se preserva (sessionStorage sobrevive al logout dentro de la misma tab) — el segundo login NO dispara un reload extra.
- Si se cierra la tab y se abre nueva, `sessionStorage` se limpia y el patrón se reinicia normalmente.
- El IDB del juez está correctamente asociado al nuevo `userId` (si cambió).

## Riesgos a vigilar durante ejecución

- **Hydration mismatch**: si el primer render del catch-all no matchea el SSR, React 19 throwea. La protección es que SSR y CSR-inicial **ambos** rinden el `RootSkeleton` (porque `pathname === null` en ambos). Verificar en Network tab que el HTML SSR contiene el skeleton, no una vista específica. Si Next.js intenta SSR-eificar la página con params (improbable en `[[...slug]]` Client Component pero posible), aplicar `export const dynamic = "force-dynamic"` al page.
- **Conflicto de rutas**: dejar carpetas vacías de las páginas viejas puede confundir a Next.js. Eliminar carpeta-por-carpeta y validar con `pnpm build` después de cada eliminación.
- **`<JuezLink>` fuera del provider**: cualquier vista que se renderice fuera del `<JuezRouterProvider>` y use `<JuezLink>` va a throw. La protección es que el provider está en el catch-all page directamente y todas las vistas se renderizan adentro. El layout (`juez/layout.tsx` Server) no usa `<JuezLink>`.
- **`SignOutButton` y links a `/admin`**: deben seguir usando `next/link` o el `<a>` nativo (no `<JuezLink>`). El logout va a `/api/auth/signout` o redirige a `/login` — fuera del subárbol de juez, no aplica el SPA router.
- **`scrollTo(0,0)` en navigate**: si el usuario navega y la nueva vista tiene scroll preservado, puede ser molesto. La opción es scrollear al top siempre (current) o solo en navegación forward (no back). Default a scroll-top hasta que algo falle.
- **`sessionStorage` no disponible en algunos navegadores extraños**: el flag de `sw-reloaded` puede fallar. Wrap en try-catch defensivo si es necesario.
- **Build de Next.js puede no detectar `[[...slug]]` como catch-all opcional**: validar con `pnpm build` que tanto `/juez` como `/juez/eventos` resuelven a la misma página. Si solo el primero o el segundo funciona, ajustar el patrón a `[...slug]` (no opcional) y manejar `/juez` con el redirect del layout o un middleware.
- **Service Worker no controla en private/incognito**: documentar que Plan 7d funciona offline solo en sesiones normales. En incognito el storage es ephemeral y el SW puede no instalarse.

## Lecciones aprendidas

### 1. `Remove-Item` en PowerShell falla silenciosamente con rutas que contienen `[` y `]`

PowerShell interpreta los corchetes en paths como caracteres comodín glob. `Remove-Item "...\[eventoId]\page.tsx"` no hace nada (sin error, sin borrado). Usar siempre `-LiteralPath` para paths con corchetes en Next.js App Router (`[param]`, `[[...slug]]`). Aplica a `Move-Item`, `Copy-Item`, `Get-Item` y cualquier cmdlet que tome paths.

### 2. `.next/types/` cachea referencias a páginas eliminadas

Al eliminar `page.tsx` de un directorio, `tsc --noEmit` falla porque `.next/types/app/**/page.ts` sigue referenciando el módulo inexistente. `pnpm dev` y `pnpm build` regeneran el directorio pero `pnpm typecheck` solo no lo hace. Solución: `rm -rf .next/types` antes de `pnpm typecheck` tras cualquier eliminación de páginas.

### 3. El `[[...slug]]` opcional en Windows necesita el nombre de carpeta literal con dobles corchetes

Crear el directorio como `mkdir -p "...juez/[[...slug]]"` (con los dobles corchetes en el nombre literal). En PowerShell usar `New-Item -ItemType Directory -Path "..."` con comillas dobles. Bash `mkdir -p` acepta el nombre literal sin problemas. Next.js reconoce el directorio y genera la ruta catch-all correctamente.

### 4. El `bufferResponsePlugin` no necesita el parámetro `request` en `cacheWillUpdate`

El tipo del plugin declara `{ request, response }` pero si `request` no se usa, ESLint reporta `@typescript-eslint/no-unused-vars` y el build emite un warning. Basta con desestructurar solo `{ response }` — el tipo `{ request: Request; response: Response }` puede tener `request` en la firma del tipo sin que sea necesario usarlo en la implementación.
