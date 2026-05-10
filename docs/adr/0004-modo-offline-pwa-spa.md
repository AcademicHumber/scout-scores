# ADR-0004 — Modo offline del juez: PWA con IndexedDB, cola de sync y SPA catch-all

**Estado:** Aceptado  
**Fecha:** 2026-05-10  
**Planes afectados:** Plan 7b (PWA + sync engine), Plan 7c (Client Components con IDB), Plan 7d (catch-all SPA + fixes SW)

---

## Contexto

Los jueces de eventos scout operan en campo abierto — campamentos, parques, zonas rurales — donde la conectividad es intermitente o directamente inexistente. El flujo central del sistema es: un juez abre el formulario de scoring de una patrulla, carga criterios o puntaje único, y envía. Si este flujo requiere red, el producto es inútil en su caso de uso real.

El requisito no negociable que motivó el bloque de planes 7b–7d es:

> **Un juez debe poder cargar y enviar puntajes sin internet.** Los datos se sincronizan en cuanto se recupera la conexión, sin que el juez necesite hacer nada.

Este requisito tiene consecuencias arquitectónicas significativas porque la pila tecnológica elegida (Next.js 15 App Router, SSR streaming, RSC) está optimizada para servidores, no para offline-first.

---

## Fuerzas en tensión

| Fuerza | Dirección |
|---|---|
| Jueces sin red en campo | → datos deben estar en el cliente |
| Next.js SSR con ReadableStream | → el Cache API no puede almacenar respuestas streaming directamente |
| RSC con `?_rsc=hash` por navegación | → el cache de activos nunca tiene hits si no se normaliza la URL |
| Rutas de juez per-URL (Next.js routing) | → cada ruta no visitada online es inalcanzable offline |
| Session token con expiración corta | → el juez puede quedar deslogueado antes de volver a tener red |
| Puntajes enviados desde dos dispositivos o reabiertos por un admin | → conflictos de versión posibles |
| App multi-tenant, multi-dispositivo | → wipe del IDB necesario si el usuario u organización cambian |

---

## Decisión

Implementar el modo offline en tres capas ortogonales:

### Capa 1 — Modelo de datos con soporte offline (`ScoreSheet.version`)

Plan 7a introduce `ScoreSheet` con un campo `version: Int @default(0)` que se incrementa en cada mutación (save o submit). Este campo habilita la detección de conflictos: cuando el sync engine intenta aplicar una operación pendiente, compara `expectedVersion` de la operación con la `version` actual del servidor. Si difieren, la operación se marca como `"conflict"` y el juez ve un banner explicativo.

La idempotencia de las operaciones de sync se garantiza con `SyncOpLog`: antes de procesar una operación, el API route verifica que `clientOpId` no fue procesado anteriormente. Esto permite reintentar operaciones sin riesgo de doble-aplicación.

### Capa 2 — IndexedDB como base de datos local + cola de operaciones

Se usa `idb` (wrapper tipado de IndexedDB) con dos object stores:

- **`snapshot`**: copia local del estado del servidor, indexada por `(asignacionId, patrullaId)`. Se hidrata desde `/api/juez/snapshot` al conectarse o al volver a primer plano. Contiene todos los datos que las vistas necesitan renderizar (evento, actividad, posta, patrulla, template, ScoreSheet).
- **`pendingOps`**: cola FIFO de operaciones locales aún no confirmadas por el servidor. Cada operación tiene `clientOpId` (uuid), `asignacionId`, `patrullaId`, `tipo` (save/submit), `payload`, `expectedVersion`, `createdAt` y `status` (pending/conflict/discarded).

El **sync engine** (`useSyncEngine`) corre en el cliente como hook de React. Al montar y en eventos `online` / `visibilitychange`:

1. **Drain**: envía las operaciones pendientes al servidor en orden de `createdAt` (orden de creación, no de `clientOpId` que es UUID). Cada operación exitosa actualiza el snapshot local con la respuesta del servidor.
2. **Hydrate**: llama a `/api/juez/snapshot` para refrescar el snapshot completo con el estado authoritative del servidor.

### Capa 3 — SPA catch-all con Service Worker para navegación offline

El Service Worker (Serwist) cachea el HTML de `/juez/**` con `NetworkFirst` + `bufferResponsePlugin` (necesario porque Next.js SSR devuelve `ReadableStream` que el Cache API no puede almacenar directamente). El HTML cacheado es el shell del catch-all — un único componente que sirve para cualquier URL `/juez/**`.

La ruta `app/(juez)/juez/[[...slug]]/page.tsx` es el catch-all SPA: un Client Component que lee `window.location.pathname` en un `useEffect` post-hidratación y monta la vista correcta (`EventosListView`, `PostasView`, `PatrullasView`, `ScoringView`). La navegación interna usa `JuezLink` que llama `pushState` + `setState` sin disparar RSC fetches. El Service Worker no necesita un HTML diferente por URL — cualquier entrada del cache `juez-navigate` sirve como fallback para cualquier ruta no visitada.

---

## Sub-decisiones clave

### API routes en lugar de Server Actions para el sync

Las Server Actions son funciones `POST` que Next.js firma y enruta internamente. El Service Worker no puede interceptarlas de forma confiable (la firma cambia por build, la URL es `/api/__rsc_action` en producción). Las API routes (`/api/juez/sync` y `/api/juez/snapshot`) son URLs estables que el SW puede tratar como `NetworkOnly` o `NetworkFirst` con la misma lógica que cualquier otro endpoint.

### `bufferResponsePlugin`: materializar el ReadableStream antes de cachear

El Cache API rechaza silenciosamente respuestas de tipo `ReadableStream` porque el body ya fue consumido por el tiempo en que el cache intenta leerlo. El plugin `cacheWillUpdate` clona la respuesta, lee el cuerpo completo con `arrayBuffer()` y construye una nueva `Response` con el body materializado. Este buffering es transparente para el browser: la respuesta original (stream) sigue fluyendo al cliente mientras el SW cachea la copia serializada.

### `stripRscParam`: normalizar URLs antes de leer/escribir el cache

Cada navegación de Next.js con `<Link>` genera un RSC fetch con `?_rsc=<hash>` donde el hash varía por build y por sesión. Sin normalización, `juez-assets` acumula entradas con el mismo pathname pero distinto hash, y ningún request posterior tiene cache hit. El plugin `cacheKeyWillBeUsed` elimina `_rsc` antes de operar sobre el cache, convirtiendo infinitas keys en una por URL real.

### `controllerchange` + `sessionStorage` para el primer reload post-OAuth

Cuando un juez hace login, el OAuth callback redirige a `/juez/eventos` antes de que el Service Worker haya terminado de instalarse y reclamar el cliente (fase `activate` + `clients.claim()`). El SW llega tarde: la primera navegación no pasa por él y el HTML no se cachea. La solución es que `ServiceWorkerRegistrar` detecte si había un controlador antes del registro (`hadController`). Si no había, se escucha el evento `controllerchange` (que dispara cuando el SW reclama el cliente) y se hace `window.location.reload()`. Un flag `sessionStorage["sw-reloaded"]` evita loops si el SW se actualiza múltiples veces en la sesión.

### Catch-all SPA sobre caching por ruta

La alternativa natural a la SPA catch-all es cachear el HTML de cada ruta visitada por separado y usar ese HTML como fallback offline. El problema es que las vistas usan `useParams()` para leer el ID del evento/posta/patrulla. Si el SW sirve el HTML de `/juez/eventos` como fallback para `/juez/eventos/abc123`, el componente lee `useParams()` y no encuentra `eventoId` — renderiza la vista de lista en la URL del evento. Toda ruta no visitada online es inalcanzable offline.

La SPA catch-all elimina esta dependencia: el componente lee `window.location.pathname` directamente (no `useParams()`) y extrae los IDs con regex. Un solo HTML cacheado sirve para infinitas URLs.

### `useState<string | null>(null)` para evitar hydration mismatch

El Server Component del catch-all renderiza el skeleton porque el servidor no conoce `window.location`. El primer render CSR también renderiza el skeleton porque `pathname === null` (useState inicial). El `useEffect` post-hidratación lee `window.location.pathname` y re-renderiza con la vista correcta. SSR y primer CSR coinciden — cero hydration mismatches.

### IDB version bump para wipe del snapshot en cambios de schema

Cada vez que el schema del snapshot cambia (nuevos campos, nuevos stores, tipos modificados), la versión del IDB se incrementa. El callback `upgrade` limpia el store `snapshot` usando `transaction.objectStore("snapshot").clear()` (no `db.clear()`, que falla dentro del callback de upgrade porque intenta abrir una segunda transacción sobre la transacción de upgrade ya activa).

### `session.maxAge` extendido a 7 días

El JWT por defecto expira en 24 horas. Si un juez trabaja en un campamento de fin de semana sin internet desde el viernes al domingo, el token estaría expirado al volver online. Se extiende a 7 días para cubrir el caso de uso más largo realista.

---

## Reglas permanentes para el subárbol `/juez/**`

Estas reglas deben respetarse en todos los planes futuros que toquen el área del juez:

1. **Toda mutación desde `/juez/**` va por la cola offline** (`enqueueOp`), nunca por Server Actions directas. El sync engine se encarga de enviarla al servidor cuando haya red.

2. **Nuevas vistas en `/juez/**` se agregan como componentes en `src/components/juez/views/`** y se registran en el router de `[[...slug]]/page.tsx`. No se crean nuevas rutas Next.js bajo `/juez/`.

3. **Nuevos campos en el snapshot requieren migration del IDB**: incrementar la versión en `src/lib/offline/db.ts` y limpiar el store `snapshot` en el callback `upgrade`.

4. **Los handlers del Service Worker usan instancias de clase**, nunca strings. `new NetworkOnly()`, `new NetworkFirst({...})`, `new CacheFirst({...})`. Los strings no se resuelven en runtime y fallan silenciosamente.

5. **Navegación interna en `/juez/**` usa `<JuezLink>`**, no `<Link>` de Next.js ni `<a>`. `<Link>` dispara RSC fetches y rompe la navegación offline.

6. **`Breadcrumb` solo se usa dentro del proveedor `JuezRouterProvider`**. Fuera de ese árbol, `JuezLink` lanzaría una excepción de contexto.

---

## Consecuencias

### Positivas

- Un juez puede cargar y enviar puntajes sin internet. Los datos se sincronizan solos al recuperar la conexión.
- La navegación dentro de `/juez/**` no dispara RSC fetches ni recargas completas. Es una SPA real con URLs en la barra del browser.
- El snapshot hidratado desde el servidor contiene todos los datos de todas las postas asignadas al juez. Las rutas nunca visitadas online funcionan offline.
- Los conflictos de versión son detectables y el juez tiene control explícito: reenviar (con la versión actual del servidor) o descartar.
- El admin puede reabrir planillas enviadas; el juez lo ve al volver a conectarse (re-hidratación del snapshot).

### Negativas / Limitaciones

- **El modo offline requiere una visita previa online al área `/juez/**`**. El Service Worker no puede interceptar la primera navegación antes de instalarse. La solución del `controllerchange`+reload garantiza que la segunda carga (post-login) ya pasa por el SW, pero si el juez nunca abrió `/juez/eventos` en red, no hay HTML cacheado como shell.
- **Solo funciona en sesiones normales del browser**, no en incognito con storage bloqueado ni en contextos donde el SW esté deshabilitado.
- **`ScoreSheetForm` usa `useRouter().push()` de Next.js** para navegar al volver (post-submit). Esta navegación sí pasa por el Next.js router y puede disparar un RSC fetch, aunque el catch-all la absorbe correctamente. El `stripRscParam` normaliza el cache entry. En un plan futuro podría migrarse a `useJuezRouter().navigate()` para consistencia total.
- **`ConflictBanner` usa `router.refresh()`** de Next.js tras descartar un conflicto. En el contexto del catch-all SPA, este refresh re-monta el `JuezRouterProvider` y produce un flash de skeleton antes de restaurar la vista. Es aceptable para un caso de uso poco frecuente.
- **No hay persistencia de la "última ruta" entre sesiones**. Si el juez cierra el browser y lo vuelve a abrir, aterriza en `/juez/eventos` (el default del catch-all), no en la ruta donde estaba.
- **Animaciones de transición entre vistas**: no implementadas. El cambio de vista es instantáneo.

---

## Alternativas descartadas

### Alternativa A: No offline — aceptar que el juez necesita red

El caso de uso es el centro del producto. Sin offline, el sistema no es apto para uso real en campo. Descartada desde la concepción de Plan 7.

### Alternativa B: localStorage + fetch manual sin Service Worker

localStorage es síncrono, limitado a ~5 MB, y solo almacena strings. Sin SW no hay control sobre el caching de HTML/assets. Descartada por limitaciones técnicas y de UX (no hay forma de garantizar que la app cargue offline sin cachear el shell).

### Alternativa C: Background Sync API del Service Worker

La Background Sync API (`sw.sync.register()`) permite encolar operaciones para que el SW las envíe cuando recupere la red, incluso si la app está cerrada. Tiene ~75% de soporte en browsers (no disponible en Safari hasta iOS 16.4+). El enfoque elegido (sync al abrir la app + `online` event) cubre el 100% de los targets y funciona igual de bien para el caso de uso (el juez siempre tiene la app abierta cuando envía). Puede agregarse como mejora incremental.

### Alternativa D: Cache per-route con HTML individualizado por URL

Cachear el HTML de `/juez/eventos`, `/juez/eventos/[id]`, `/juez/postas/[id]`, etc. por separado y servir el correcto offline. El problema irresoluble es que los Client Components usan `useParams()` — el HTML de `/juez/eventos` no puede renderizar la vista de `/juez/eventos/abc123`. Requería que el juez visitara online cada ruta que quisiera usar offline. Descartada por el escenario 3 del Plan 7d.

### Alternativa E: Next.js `output: 'export'` para el área del juez

Generar el subárbol del juez como HTML estático sin servidor. Elimina el problema del SSR streaming. El costo es que pierde toda integración con el App Router (layouts, middleware, auth con `requireRole`). Descartada por complejidad de integrar dos modos de output en el mismo proyecto y por perder el auth centralizado del middleware.

### Alternativa F: React Native / Expo para la app del juez

Una app nativa no tiene ninguno de los problemas de SW/Cache/RSC. El costo es mantener dos codebases, el proceso de App Store/Play Store, y perder la ventaja del "instalar desde el browser" que el PWA ofrece. Los dispositivos de los jueces son heterogéneos; el PWA funciona en cualquier browser moderno. Descartada por pragmatismo.

---

## Notas de implementación

- **`src/lib/offline/db.ts`**: schema de IndexedDB (`snapshot`, `pendingOps`), helpers de lectura/escritura, `openDB` con callback `upgrade`.
- **`src/lib/offline/sync-engine.ts`**: hook `useSyncEngine` con drain + hydrate. Necesita `userId` y `organizationId` para identificar el tenant y detectar wipe.
- **`src/lib/offline/queue.ts`**: `enqueueOp`, `reEnqueueConflict`, `discardConflict`.
- **`src/lib/offline/snapshot.ts`**: readers (`readEventosFromSnapshot`, `readPostasFromSnapshot`, `readPatrullasFromSnapshot`, `readSnapshot`) y tipos (`EventoSummary`, `PostaJuezContextOffline`, `PatrullaPostaContextOffline`, `SnapshotEntry`).
- **`src/lib/offline/use-juez-data.ts`**: hook genérico que combina `useSession`, `useSyncEngine` y un reader del IDB. Devuelve `{ status: "loading" | "ready" | "empty", data, firstTimeOffline }`.
- **`src/lib/offline/juez-router.tsx`**: `JuezRouterProvider`, `useJuezRouter`, `JuezLink`.
- **`src/app/sw.ts`**: configuración del Service Worker con Serwist. Los plugins son instancias de clase. El handler `juez-navigate` incluye `stripRscParam`, `bufferResponsePlugin` y `juezNavigateFallbackPlugin`.
- **`src/app/api/juez/snapshot/route.ts`**: devuelve el snapshot completo del juez autenticado.
- **`src/app/api/juez/sync/route.ts`**: procesa una operación pendiente, verifica `SyncOpLog`, aplica la mutación, devuelve el estado actualizado.
- **`src/app/(juez)/juez/[[...slug]]/page.tsx`**: catch-all SPA. `JuezRouterProvider` + `CatchAllRouter` con regex matching sobre `pathname`.
- **`src/components/juez/views/`**: las 4 vistas del juez como componentes puros que reciben params como props.
