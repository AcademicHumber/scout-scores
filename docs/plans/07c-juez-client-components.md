# Plan 7c — Vista del juez como Client Components hidratados desde IDB

## Estado: ejecutado el 2026-05-09

Implementado en una sesión con Sonnet 4.6. Typecheck limpio, 75 tests verdes, lint limpio. Escenarios 1 y 3 verificados en browser.

## Contexto

El Plan 7b sentó las bases del modo offline (PWA + IDB + sync engine + cola), pero la lección #13 documenta una limitación que en la práctica anula el caso de uso principal: la navegación client-side de Next.js App Router fetchea un RSC payload por cada ruta destino. Como las páginas de `/juez/**` son Server Components, esos payloads solo se cachean al visitarse. Si el juez nunca pasó por `/juez/postas/[A]/[B]` mientras tenía red, esa ruta no funciona offline aunque el IDB ya tenga el snapshot completo.

En un evento real esto rompe el flujo: el juez no puede saltar entre patrullas que nunca abrió antes. La única salida es eliminar la dependencia del SSR para esas pantallas. Plan 7c convierte las páginas de juez en Client Components que leen directamente del snapshot IDB.

No se redefine el modelo de datos del Plan 7a/7b ni la cola de sync. La capa offline existente queda intacta — solo cambia quién consume el IDB: las pantallas, en lugar del API route hidratando un Server Component.

## Alcance

### Incluye

- Migración de las **4** páginas de `/juez/**` (no 3 — `postas/[asignacionId]/page.tsx` también está en el flujo) de Server Components a Client Components que leen del IDB.
- Extensión de `SnapshotEntry` con campos denormalizados (`evento.nombre/lugar/fechaInicio`, `actividad.nombre`) — necesarios para listar y mostrar breadcrumbs sin volver al server.
- Bump de IDB schema `v1 → v2` con wipe del store `snapshot` (la shape cambia; `pendingOps` y `meta` se conservan).
- Nuevas funciones reader en `snapshot.ts`: `readEventosFromSnapshot`, `readPostasFromSnapshot`, `readPatrullasFromSnapshot`. La existente `readSnapshot` queda igual.
- Hook `useJuezData(reader)` que combina el reader del IDB con `useSyncEngine` y expone `{ data, loading, empty, firstTimeOffline, refresh }`.
- Pasaje de `session` inicial al `<SessionProvider>` del group layout `(juez)/layout.tsx` para que `useSession()` funcione offline (sino dispara un fetch a `/api/auth/session` que falla sin red).
- `lastHydratedAt` agregado a `useSyncEngine` para que los readers re-lean cuando termina una hidratación exitosa.
- Eliminación de las 4 funciones del repo que ya nadie consume tras la migración (`listEventosParaJuez`, `listPostasParaJuez`, `listPatrullasParaPosta`, `findScoreSheetForJuez`).
- Strings nuevos para los estados "cargando", "sincronizando", "primera vez sin conexión".

### No incluye

- Migración de rutas `/admin/**`. Siguen siendo Server Components — el admin opera siempre online.
- Cambios al protocolo de sync, a la cola, a la detección de conflictos ni a las API routes.
- Cambios al shell visual del Plan 7a (touch targets, breadcrumb, ScaleButtons, ConflictBanner). Se reusan tal cual.
- Refactor del SSR del layout `juez/layout.tsx`: sigue siendo Server Component con `requireRole` (la HTML del shell se cachea por el SW; ahí no hay queries DB, solo lectura del JWT).
- Persistencia de la "última ruta visitada" para reabrir el deep link al volver al app.
- IndexedDB queries reactivas vía Observables. El refresh es por re-lectura puntual al recibir señal de `lastHydratedAt`.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **Patrón de migración** | Cada `page.tsx` se convierte a Client Component; el `juez/layout.tsx` sigue siendo Server Component | El layout ejecuta `requireRole` (sin DB, solo JWT) y rinde el shell. El SW cachea el shell HTML; los Client Components hidratan el contenido desde IDB. Mantener el shell server-side preserva el role gate y permite cachear el chrome correctamente. |
| **Datos extra al snapshot** | Embed inline en cada `SnapshotEntry` (`evento.nombre/lugar/fechaInicio`, `actividad.nombre`) | Un store separado para `eventos`/`actividades` agrega complejidad de joins en el client. Duplicar denormalmente cuesta KB irrelevantes (un par de campos × <100 filas). |
| **Migración IDB v1 → v2** | Bump a v2 + `clear()` del store `snapshot` en `upgrade` | Las entries v1 no tienen `evento.nombre`/`actividad.nombre` → leer devuelve `undefined` y rompe la UI. Wipe limpio + re-hydrate al primer `syncNow` es la migración más segura. La cola (`pendingOps`) se conserva: las ops siguen siendo válidas. |
| **Sesión offline** | Pasar `session={await auth()}` a `<SessionProvider>` desde un Server Component group layout | `SessionProvider` por defecto fetchea `/api/auth/session` al montar — falla sin red y `useSession()` queda en `loading` para siempre. Pasarle el initial session evita el fetch. El JWT es válido offline mientras la cookie esté viva (`maxAge: 7d` ya configurado). |
| **Trigger de re-lectura del snapshot** | `lastHydratedAt: number` agregado a `SyncEngineState` | Los readers no necesitan re-leer en cada drain (eso solo cambia ops, no snapshot). Solo cuando `hydrateSnapshot` completa con éxito, los datos derivados pueden haber cambiado. Diferenciar evita re-renders innecesarios. |
| **Scope del hook `useSyncEngine`** | Mantener uso por-pantalla; el mutex `_draining` protege drains concurrentes; el badge sigue su propia instancia | Cada pantalla quiere reaccionar a su propio `lastHydratedAt`. Pasar el engine por contexto agrega indirección sin valor — el mutex global ya garantiza correctness. |
| **Manejo de "asignacion no existe en IDB"** | Render inline de "No encontrada" + botón "Volver" (no `notFound()` ni `redirect()`) | `notFound()` solo aplica a Server Components. `useRouter().replace` desorienta al usuario. Render explícito permite que el juez decida volver y entender qué pasó. |
| **Página 404 client-side** | Reusar componente `NotFoundJuez` con copy en es.json | Consistente con el resto de la UX mobile-first. |
| **Eliminar reads del repo** | Borrar `listEventosParaJuez`, `listPostasParaJuez`, `listPatrullasParaPosta`, `findScoreSheetForJuez` | Tras la migración no las llama nadie. `getSnapshotParaJuez` queda como única fuente para el flujo del juez. Mantener código muerto introduce confusión. |

## Modelo de datos

### Cambios en `src/repositories/score-sheet.repo.ts`

`SnapshotEntry` extendido:

```typescript
export type SnapshotEntry = {
  asignacionId: string
  patrullaId: string
  eventoId: string
  evento: {                          // NUEVO
    nombre: string
    lugar: string | null
    fechaInicio: string              // ISO
  }
  actividad: {                       // NUEVO
    id: string
    nombre: string
  }
  patrulla: { nombre: string; grupoScoutNombre: string }
  posta: { nombre: string; descripcion: string | null }
  template: { /* sin cambios */ } | null
  scoreSheet: { /* sin cambios */ } | null
}
```

`getSnapshotParaJuez` extendido para llenar esos campos: ya tiene los joins (`evento`, `actividad`), solo agrega los selects.

No hay cambios en Postgres. Es un pure read-shape change.

### IDB schema (`src/lib/offline/db.ts`)

- DB version: `1 → 2`.
- `upgrade(db, oldVersion)`:
  - Si `oldVersion < 2`: `db.clear("snapshot")` (re-hidrata en el primer sync).
  - `pendingOps` y `meta` quedan intactos.
- Index `by-asignacionId` ya existe (Plan 7b) — se reusa para `readPatrullasFromSnapshot`.
- Index `by-eventoId` ya existe — se reusa para `readPostasFromSnapshot`.

### Forma de los readers

```typescript
// src/lib/offline/snapshot.ts (additions)

export type EventoSummary = {
  id: string
  nombre: string
  lugar: string | null
  fechaInicio: string  // ISO
  postasCount: number  // distinct asignacionIds
}

export type PostaSummary = {
  asignacionId: string
  postaNombre: string
  actividadNombre: string
  plantillaModo: "CRITERIOS" | "PUNTAJE_UNICO" | null
  totalPatrullas: number
  enviadas: number
  borradores: number
  sinCargar: number
}

export type PostaJuezContextOffline = {
  eventoId: string
  eventoNombre: string
  postas: PostaSummary[]
}

export type PatrullaPostaRowOffline = {
  patrullaId: string
  patrullaNombre: string
  grupoScoutNombre: string
  scoreSheet: {
    estado: "BORRADOR" | "ENVIADA"
    puntajeMostrado: number | null
  } | null
}

export type PatrullaPostaContextOffline = {
  eventoId: string
  eventoNombre: string
  postaNombre: string
  actividadNombre: string
  patrullas: PatrullaPostaRowOffline[]
}

export async function readEventosFromSnapshot(): Promise<EventoSummary[]>
export async function readPostasFromSnapshot(eventoId: string): Promise<PostaJuezContextOffline | null>
export async function readPatrullasFromSnapshot(asignacionId: string): Promise<PatrullaPostaContextOffline | null>
```

Implementación: lectura de todas las entries (o filtradas por índice), agregación en memoria. El snapshot total esperado es <500 filas (eventos × asignaciones × patrullas), totalmente manejable sin cursores.

## Implementación

Pasos en orden de dependencia:

### 1. Schema de IDB y SnapshotEntry

- `src/repositories/score-sheet.repo.ts`: agregar campos `evento` y `actividad` a `SnapshotEntry` y poblarlos en `getSnapshotParaJuez`.
- `src/lib/offline/db.ts`: bump a v2, agregar `if (oldVersion < 2) db.clear("snapshot")` en `upgrade`. Actualizar el tipo `JuezDB.snapshot.value` para reflejar el nuevo shape (TypeScript-only — IDB no valida shape).
- Verificación: corre `pnpm typecheck`. Browser: en DevTools → Application → IndexedDB → ver versión `2`.

### 2. Readers en `snapshot.ts`

Agregar las tres funciones (`readEventosFromSnapshot`, `readPostasFromSnapshot`, `readPatrullasFromSnapshot`) usando los índices ya existentes. Devuelven `null` cuando no hay datos suficientes (evento/asignación que no aparece en el snapshot — posiblemente borrada o nunca asignada al juez).

Reglas de derivación clave (replican la lógica de los reads del repo):
- `enviadas` / `borradores` / `sinCargar` por asignación se cuentan filtrando por `scoreSheet.estado` ∈ {ENVIADA, BORRADOR, null}.
- `postasCount` por evento es el número de `asignacionId` distintos.
- `puntajeMostrado` solo se llena si `estado === "ENVIADA"` (replica la regla del repo de no exponer totales de borrador).

### 3. `useSyncEngine` — `lastHydratedAt`

- Agregar `const [lastHydratedAt, setLastHydratedAt] = useState(0)`.
- En `syncNow`, después de un `hydrateSnapshot()` exitoso, llamar `setLastHydratedAt(Date.now())`.
- Exportar en `SyncEngineState`.

### 4. Hook `useJuezData`

`src/lib/offline/use-juez-data.ts`:

```typescript
"use client"

import { useEffect, useState } from "react"
import { useSyncEngine } from "./sync-engine"

type State<T> =
  | { status: "loading"; data: null }
  | { status: "ready"; data: T }
  | { status: "empty"; firstTimeOffline: boolean; data: null }

export function useJuezData<T>(
  reader: () => Promise<T | null>,
  emptyCheck: (data: T) => boolean,
  userId?: string,
  organizationId?: string,
): State<T> & { refresh: () => Promise<void>; status: SyncStatus } {
  // ...
  // 1. Llama useSyncEngine(userId, organizationId)
  // 2. useEffect inicial: lee del IDB
  // 3. useEffect en lastHydratedAt: re-lee
  // 4. Si data === null Y nunca hubo hidratación Y !navigator.onLine → firstTimeOffline = true
}
```

Mismo hook se usa en las 4 páginas con readers distintos.

### 5. Group layout — sesión inicial

`src/app/(juez)/layout.tsx`: convertir a Server Component async, pasar `session` al provider.

```tsx
import { SessionProvider } from "next-auth/react"
import { auth } from "@/auth"

export default async function JuezGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  return <SessionProvider session={session}>{children}</SessionProvider>
}
```

Esto evita el fetch a `/api/auth/session` al montar — `useSession()` arranca con la sesión ya hidratada del SSR (que el SW cachea).

### 6. Migración de páginas

Patrón común para las 4 páginas:

```tsx
"use client"

import { useSession } from "next-auth/react"
import { useJuezData } from "@/lib/offline/use-juez-data"
import { readEventosFromSnapshot } from "@/lib/offline/snapshot"
// ...

export default function JuezEventosPage() {
  const { data: session } = useSession()
  const userId = session?.user.id
  const orgId = session?.user.activeOrganizationId
  const role = session?.user.activeRole

  const state = useJuezData(
    readEventosFromSnapshot,
    (e) => e.length === 0,
    userId,
    orgId ?? undefined,
  )

  if (state.status === "loading") return <SkeletonEventos />
  if (state.status === "empty") {
    return state.firstTimeOffline
      ? <FirstTimeOfflineMessage />
      : <NoEventosMessage />
  }
  return <EventosList eventos={state.data} />
}
```

Cada una con su propio reader + skeleton + empty messages:

| Ruta | Reader | Skeleton | Empty mensaje | NotFound |
|---|---|---|---|---|
| `eventos/page.tsx` | `readEventosFromSnapshot()` | 3 cards de placeholder | "No tenés postas asignadas en eventos activos." | n/a |
| `eventos/[eventoId]/page.tsx` | `readPostasFromSnapshot(eventoId)` | 3 cards | "No tenés postas asignadas en este evento." | "Este evento no está en tus asignaciones." |
| `postas/[asignacionId]/page.tsx` | `readPatrullasFromSnapshot(asignacionId)` | header + 5 rows | "No hay patrullas en este evento." | "Esta posta no está en tus asignaciones." |
| `postas/[asignacionId]/[patrullaId]/page.tsx` | `readSnapshot(asignacionId, patrullaId)` | form skeleton | n/a (siempre debería existir si la posta existe) | "Esta planilla no está en tu snapshot." |

Para la página de scoring (`[patrullaId]`), el flujo es:
- `useJuezData(() => readSnapshot(asignacionId, patrullaId), ...)` devuelve la entry completa.
- Pasa `template`, `initialEntries`, `initialPuntajeUnico`, `initialVersion` al `ScoreSheetForm` ya existente.
- `ConflictBanner` no cambia — sigue leyendo del IDB independientemente.

### 7. Borrar funciones obsoletas del repo

Una vez las 4 páginas estén migradas y el typecheck pase:

- Borrar `listEventosParaJuez`, `listPostasParaJuez`, `listPatrullasParaPosta`, `findScoreSheetForJuez` de `src/repositories/score-sheet.repo.ts`.
- Borrar los tipos asociados que solo ellas usan (`EventoJuezSummary`, `PostaJuezSummary`, `PostaJuezContext`, `PatrullaPostaRow`, `PatrullaPostaContext`, `ScoreSheetForJuez`).
- Verificar que `getSnapshotParaJuez`, `saveScoreSheet`, `submitScoreSheet`, `reopenScoreSheet`, `listPlanillasPorEventoAdmin` no se tocan.
- `pnpm typecheck && pnpm test` para validar que los tests del repo siguen verdes.

### 8. Strings en es.json

Agregar al namespace `juez.*`:

- `juez.cargando` — "Cargando..."
- `juez.sincronizando` — "Sincronizando con el servidor..." (reusar el existente `juez.sync.sincronizando` si suena bien, o agregar variante para la pantalla)
- `juez.primeraVezOffline.titulo` — "Primera vez sin conexión"
- `juez.primeraVezOffline.mensaje` — "Conectate a internet la primera vez para descargar tus eventos. Después podés cargar puntajes sin red."
- `juez.notFound.titulo` — "Esto no está en tu snapshot"
- `juez.notFound.mensaje` — "Volvé a la lista de eventos. Si pensás que es un error, sincronizá manualmente."
- `juez.notFound.volver` — "Volver a eventos"

### 9. Verificación de tipos

`pnpm typecheck` debe pasar limpio. Cuidados:
- Los Client Components no pueden importar de archivos con `next/cache` (`unstable_cache`/`revalidateTag`). Como la repo no se importa más desde page.tsx, esto se respeta automáticamente.
- `useSession()` puede devolver `data === null` durante la transición — manejarlo en el hook.

## Archivos críticos

**Modificados:**
- `src/repositories/score-sheet.repo.ts` — extender `SnapshotEntry` y `getSnapshotParaJuez`; **eliminar** `listEventosParaJuez`, `listPostasParaJuez`, `listPatrullasParaPosta`, `findScoreSheetForJuez`.
- `src/lib/offline/db.ts` — bump a v2 + wipe del store `snapshot`; tipo de `snapshot.value` actualizado.
- `src/lib/offline/snapshot.ts` — agregar `readEventosFromSnapshot`, `readPostasFromSnapshot`, `readPatrullasFromSnapshot`.
- `src/lib/offline/sync-engine.ts` — agregar `lastHydratedAt` al state.
- `src/app/(juez)/layout.tsx` — Server Component async + `<SessionProvider session={...}>`.
- `src/app/(juez)/juez/eventos/page.tsx` — Client Component.
- `src/app/(juez)/juez/eventos/[eventoId]/page.tsx` — Client Component.
- `src/app/(juez)/juez/postas/[asignacionId]/page.tsx` — Client Component.
- `src/app/(juez)/juez/postas/[asignacionId]/[patrullaId]/page.tsx` — Client Component.
- `src/messages/es.json` — strings nuevos `juez.cargando`, `juez.primeraVezOffline.*`, `juez.notFound.*`.

**Nuevos:**
- `src/lib/offline/use-juez-data.ts` — hook genérico con loading/empty/firstTimeOffline.
- `src/components/juez/Skeleton*.tsx` (3 piezas: `SkeletonList`, `SkeletonScoreForm`, `NotFoundJuez`) — opcional como archivos sueltos o inline en cada page.

**Sin cambios:**
- `src/app/(juez)/juez/layout.tsx` — sigue Server Component con `requireRole`.
- `src/app/(juez)/juez/page.tsx` — sigue redirect a `/juez/eventos`.
- `src/app/api/juez/snapshot/route.ts` — la única consumidora del snapshot del repo.
- `src/app/api/juez/sync/route.ts` — sin cambios.
- `src/components/juez/ScoreSheetForm.tsx` — recibe los mismos props.
- `src/components/juez/ConflictBanner.tsx` — sin cambios.
- `src/components/juez/SyncStatusBadge.tsx` — sin cambios (puede aprovechar `lastHydratedAt` para mejorar feedback, pero no se requiere).

## Tests

No se agregan tests nuevos en repos: las funciones eliminadas se borran junto con su superficie de testeo (los tests existentes son sobre `saveScoreSheet`/`submitScoreSheet`/`reopenScoreSheet`, que no cambian). Verificación principal por escenarios E2E.

Opcional (recomendado pero diferible): agregar tests de los readers del IDB con `fake-indexeddb`. Si se agregan, ubicarlos en `src/lib/offline/snapshot.test.ts` con casos:
- entries vacías → `readEventosFromSnapshot` devuelve `[]`.
- 2 eventos × 3 asignaciones × 5 patrullas → counts correctos.
- Filtrado por `eventoId` ignora otras asignaciones.
- `puntajeMostrado` null cuando `estado === "BORRADOR"`.

## Verificación

### Entornos requeridos

| Escenario | Entorno | Razón |
|---|---|---|
| 1 — Online flow sin regresiones | `pnpm dev` | Debe seguir funcionando como antes |
| 2 — Skeleton en primer load | `pnpm dev` | UX de carga |
| 3 — Navegación offline a ruta nunca visitada | `pnpm build && pnpm start` | El bug que motivó este plan |
| 4 — Reload offline en cualquier ruta | `pnpm build && pnpm start` | Requiere SW + sesión preservada |
| 5 — Cambio de tenant offline-friendly | `pnpm dev` | IDB wipe en cambio de org |
| 6 — Asignación borrada | `pnpm dev` | NotFound graceful |
| 7 — Migración IDB v1→v2 | `pnpm dev` con IDB pre-existente | Sin pérdida de pendingOps |
| 8 — Admin reabre planilla durante navegación offline | `pnpm build && pnpm start` | Re-hidratación al volver online |

### Escenario 1 — Online flow sin regresiones

**Pasos**: ejecutar el "happy path" completo del Plan 7a (login JUEZ → eventos → posta → patrulla → cargar criterios → enviar → ver en admin).

**Qué verificar**:
- Cada pantalla muestra los mismos datos que antes.
- `Network` tab: una sola llamada a `/api/juez/snapshot` al primer load del layout.
- No hay llamadas a `/api/juez/...` en cada navegación entre patrullas (los datos vienen de IDB).
- En IDB: snapshot poblado tras primer load, persiste entre navegaciones.
- `SyncStatusBadge` permanece verde.

### Escenario 2 — Skeleton en primer load

**Pasos**:
1. DevTools → Application → IndexedDB → eliminar la base `puntajes-scout-juez`.
2. Recargar `/juez/eventos`.

**Qué verificar**:
- Inmediatamente: skeleton de 3 cards.
- A los pocos cientos de ms: aparecen los eventos reales.
- No hay flash de "No tenés eventos" en el medio.
- El badge muestra `sincronizando` brevemente, luego `online`.

### Escenario 3 — Navegación offline a ruta nunca visitada (el bug que motivó el plan)

**Entorno**: `pnpm build && pnpm start`

**Pasos**:
1. Login JUEZ. Visitar SOLO `/juez/eventos` (no entrar a ningún evento).
2. Verificar en IDB que el snapshot ya tiene todas las entries (incluye eventos, postas y patrullas que el juez nunca abrió).
3. DevTools → Network → Offline.
4. Click en un evento → debería aparecer la lista de postas (ruta nunca visitada).
5. Click en una posta → debería aparecer la lista de patrullas (ruta nunca visitada).
6. Click en una patrulla → debería aparecer el form de scoring (ruta nunca visitada).
7. Cargar puntajes → click "Enviar" → toast offline.

**Qué verificar**:
- Cada navegación funciona sin red, sin "network error".
- Los datos coinciden con lo que mostraría online (totales, criterios, etc.).
- La op queda en `pendingOps` con `status: "pending"`.
- Al volver online, se drena.

Este es el escenario que prueba que la limitación documentada en la lección #13 del Plan 7b se resolvió.

### Escenario 4 — Reload offline en cualquier ruta

**Entorno**: `pnpm build && pnpm start`

**Pasos**:
1. Login JUEZ con sesión válida. Navegar a `/juez/postas/[A]/[B]`.
2. DevTools → Network → Offline.
3. Refrescar (F5).

**Qué verificar**:
- El SW sirve el HTML cacheado (shell SSR).
- `useSession()` resuelve inmediatamente con la sesión inicial pasada al provider — **sin** hacer fetch a `/api/auth/session`.
- El IDB se lee y la pantalla hidrata como esperado.
- En el Network tab no debe aparecer una llamada fallida a `/api/auth/session` (verifica la lección sobre `SessionProvider`).

### Escenario 5 — Cambio de tenant offline-friendly

**Pasos**:
1. Usuario con dos orgs A y B. Login con A. Snapshot poblado de A.
2. Cambiar a org B desde el switcher.
3. Verificar en IDB:
   - El store `snapshot` se vacía (`hydrateSnapshot` detecta el cambio de org y hace `clearSnapshot`).
   - Re-hidrata con datos de B.
4. La pantalla de eventos muestra solo eventos de B.

### Escenario 6 — Asignación que ya no está

**Pasos**:
1. Como ADMIN, eliminar la asignación de un juez para una posta específica (o despublicar el evento).
2. El juez (en otro browser) navega a `/juez/postas/[asignacionEliminada]/[X]`.

**Qué verificar**:
- La página muestra "Esta planilla no está en tu snapshot" + botón "Volver a eventos".
- No hay redirect automático ni error de runtime.
- Tras volver a `/juez/eventos`, la lista refleja el cambio (al re-hidratar el snapshot).

### Escenario 7 — Migración IDB v1→v2

**Pasos**:
1. Antes del deploy: usuario con IDB v1 (snapshot lleno + 2 ops en `pendingOps`).
2. Deploy del Plan 7c. Recargar.
3. DevTools → Application → IndexedDB → `puntajes-scout-juez`.

**Qué verificar**:
- Versión = `2`.
- Store `snapshot` empezó vacío (wipe en upgrade) y luego se rehidrató con la nueva shape (incluye `evento.nombre`, `actividad.nombre`).
- Store `pendingOps`: las 2 ops siguen ahí intactas, se drenan normalmente al sync.
- `meta`: `userId`, `organizationId`, `clientId` preservados.

### Escenario 8 — Admin reabre planilla mientras juez navega offline

**Entorno**: `pnpm build && pnpm start`

**Pasos**:
1. Juez (browser A) tiene snapshot con planilla X en `ENVIADA`.
2. Juez activa offline.
3. Juez navega a `/juez/postas/[A]/[B]` → ve planilla como ENVIADA (read-only, banner "Planilla enviada").
4. Admin (browser B, online) reabre la planilla → ahora `BORRADOR`.
5. Juez vuelve online.
6. `useSyncEngine` corre `syncNow` → `hydrateSnapshot` → `lastHydratedAt` cambia.
7. La pantalla del juez (si aún está en `[A]/[B]`) re-lee del IDB y muestra el form editable.

**Qué verificar**:
- La transición de read-only a editable ocurre sin recargar la página.
- El `SyncStatusBadge` muestra `sincronizando` durante la hidratación.
- Si el juez había encolado una op offline antes de la reapertura, queda en conflict (lo cubre el escenario de Plan 7b — no regresiona).

## Riesgos a vigilar durante ejecución

- **Hidratación de Server Components vs Client Components**: si algún Client Component intenta leer un objeto `Decimal` o `Date` de Prisma, falla la serialización. No debería pasar — el snapshot ya viene con primitivos del API route. Verificar en typecheck.
- **`useSession()` en producción**: confirmar que pasar `session` al provider no rompe la actualización tras un `unstable_update` (no debería: `SessionProvider` sigue refresheando si la session cambia, solo evita el fetch inicial).
- **Tamaño del snapshot**: con la denormalización de `evento`/`actividad`, cada entry crece ~150-200 bytes. Para 500 entries son ~100KB extra. Trivial. Si en el futuro el evento tiene muchas postas y patrullas (>2000 entries), revisar.
- **Race condition en cambio rápido de org**: el switcher cambia el JWT → `useSession()` re-renderiza → `useSyncEngine` re-corre `syncNow` con nuevo `userId`/`orgId` → wipe + rehidrata. El reader puede ejecutarse en el medio con datos viejos. El `lastHydratedAt` cambia tras el wipe + re-fetch, lo que dispara una segunda lectura. Aceptable.
- **`useSession()` puede devolver `null` un instante**: el hook debe tolerarlo (`status === "loading"`).
- **TypeScript en `ScoreSheetForm`**: el flujo del Plan 7b ya pasaba `Decimal[]` desde el Server Component y los convertía a `Number` antes de pasarlos. Tras la migración, los valores ya son `number` (vienen del snapshot). Limpiar las llamadas `.map(Number)` y `Number(...)` que ya no apliquen en el page.tsx migrado.

## Lecciones aprendidas

### 1. `notFound()` no funciona en Client Components — render explícito ✓ Confirmada

`notFound()` de `next/navigation` solo funciona durante render server-side. En Client Components hay que renderizar la UI de "no encontrado" manualmente. Se implementó `<NotFoundJuez />` inline en cada page con copy del `es.json` + botón "Volver a eventos". Más controlable que `useRouter().replace`.

### 2. `SessionProvider` necesita `session` initial para funcionar offline ✓ Confirmada

Sin `session` prop, `SessionProvider` fetchea `/api/auth/session` al montar. Offline esa request falla y `useSession()` queda en `{ status: "loading", data: null }` para siempre. Se implementó `session={await auth()}` desde el group layout Server Component. El `auth()` server-side no hace queries DB, solo lee el JWT. El group layout `(juez)/layout.tsx` pasó de `"use client"` a Server Component async para poder llamar `auth()`.

### 3. IDB version bump requiere wipe del store cuando cambia el shape ✓ Confirmada

El upgrade callback usa `transaction.objectStore("snapshot").clear()` (no `db.clear()` — ese crearía una transacción nueva dentro de una upgrade transaction activa, lo cual falla). La `idb` library expone el `transaction` upgrade como 4° parámetro del callback. El store `pendingOps` se conserva intacto.

### 4. Trigger de re-lectura del IDB: separar `lastHydratedAt` de `pendingCount` ✓ Confirmada

Las pantallas leen solo cuando `lastHydratedAt` cambia. `SyncStatusBadge` y `ConflictBanner` reaccionan a `pendingCount`/`conflictCount`. Dos señales, dos propósitos.

### 5. La denormalización en el snapshot evita stores adicionales ✓ Confirmada

Embeber `evento.{nombre,lugar,fechaInicio}` y `actividad.{id,nombre}` en cada `SnapshotEntry` (hereda el tamaño ya trivial del snapshot). Los readers son lecturas lineales sin joins. Bump de versión maneja la migración del shape.

### 6. `requireRole` puede quedarse en el layout offline-friendly ✓ Confirmada

`juez/layout.tsx` Server Component sigue con `requireRole` y funciona offline porque el SW cachea el HTML renderizado y `auth()` solo lee el JWT (no hace DB queries).

### 7. Eliminar reads del repo en lugar de marcarlos `@deprecated` ✓ Confirmada

Grep inverso confirmó que los únicos consumers eran los 4 `page.tsx` migrados. Eliminados en el mismo commit del plan.

### 8. `emptyCheck = () => false` para páginas con "not found" vs "sin datos" (nueva)

Cuando el reader puede devolver `null` (no encontrado) O un objeto vacío (encontrado pero sin items), no conviene usar `emptyCheck` para el caso vacío: ambos terminan en `status: "empty"` y pierdes la distinción. La solución: `emptyCheck = () => false` (nunca "vacío" a nivel hook) + manejar `ctx.postas.length === 0` directamente en la vista "ready". Esto preserva `null → "empty" → NotFound` como único uso de `status: "empty"`.

### 9. `useJuezData` mantiene `status: "loading"` mientras `lastHydratedAt === 0 && online` (nueva)

Si el IDB está vacío y el user es online, el hook no muestra "vacío" prematuramente — mantiene `loading` hasta que `hydrateSnapshot` complete (que bumpa `lastHydratedAt > 0`). Esto evita el flash de "No tenés eventos" durante el primer sync. Si el sync falla y `lastHydratedAt` nunca sube, el spinner persiste indefinidamente (aceptable: el `SyncStatusBadge` muestra el error).
