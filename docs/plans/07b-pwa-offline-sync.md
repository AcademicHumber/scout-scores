# Plan 7b — PWA, cola offline y sincronización

## Contexto

Plan 7a entregó scoring online: el juez carga puntajes desde su celular contra Postgres en tiempo real. El supuesto que rompe en campo es la red: los eventos scout ocurren en lugares con cobertura intermitente o nula, y la jornada se extiende horas. Si el juez pierde red mientras carga una planilla, el modelo actual o le borra el progreso o lo deja en un estado ambiguo.

Plan 7b convierte la app en una PWA con persistencia local y un motor de sincronización. Objetivos:

- El juez puede instalar la app, abrirla sin red, navegar entre patrullas que ya pre-fetcheó, y cargar puntajes con latencia local.
- Cuando recupera red, los puntajes se envían en cola contra el server. Conflictos (ej: planilla reabierta por admin mientras tanto) se detectan y se le presentan al juez para que decida.
- La sesión sobrevive una jornada larga sin red.

No se redefine el modelo de scoring ni la UI del Plan 7a — se agrega una capa offline encima.

## Alcance

### Incluye

- Service worker (Serwist) con manifest, iconos brand, instalable en iOS Safari y Chrome Android.
- IndexedDB local con dos stores: snapshot de lectura y cola de operaciones pendientes.
- Pre-fetch de todas las asignaciones del juez (postas + patrullas + criterios) cuando carga la app online.
- Cola de envío con detección de conflicto vía `expectedVersion` y banner de resolución para el juez.
- API route `POST /api/juez/sync` (operación individual, idempotente por `clientOpId`).
- API route `GET /api/juez/snapshot` para hidratar IDB.
- Extensión de `ScoreSheet` con `clientId`, `clientSubmittedAt`, `version`.
- Helper `requireRoleApi` para auth en API routes (devuelve JSON, no throw).
- JWT `maxAge` extendido a 7 días.
- Indicador visual global de estado: online/offline/N pendientes/sincronizando/conflicto.
- Triggers de sync: `online` event, `visibilitychange` (cuando la app vuelve a foreground en iOS), botón manual.

### No incluye

- Tabla `ScoreSheetRevision` append-only (se evaluará si los `clientId/version` resultan insuficientes).
- Soporte offline para rutas de admin (solo `/juez/*`).
- Background Sync API (no funciona en iOS — confiamos en `visibilitychange`).
- Refresh token explícito (sesión con `maxAge: 7d` y validación al reconectar es suficiente).
- Multi-device merge inteligente: si dos dispositivos editan la misma planilla, gana el último que sincronice (con detección de conflicto contra `version`, no merge automático de campos).
- Encriptación de IDB (puntajes scout no son secret; el dispositivo del juez ya está confiado).

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| Service worker framework | **Serwist 9.x** | Mantenido (next-pwa abandonado), App Router-aware, tipos para Next 15. Vanilla SW como fallback si Turbopack rompe el build. |
| IndexedDB wrapper | **`idb` (~3kb)** | Usado por Workbox y la mayoría del ecosistema. Promise-based. Dexie es overkill aquí. |
| Trazabilidad sync | Campos en `ScoreSheet`: `clientId String?`, `clientSubmittedAt DateTime?`, `version Int @default(0)` | Mínimo cambio de schema. `version` se incrementa en cada `save`/`submit`/`reopen`; el client manda `expectedVersion` para detectar reapertura concurrente. |
| Conflict resolution | Detección + decisión del juez (banner) | Server devuelve 409 con estado actual; juez ve "fue reabierto por admin — ¿reenviar o descartar?". |
| API route shape | **Operaciones individuales con `clientOpId` para idempotencia** | Más simple, mejor recuperación de errores parciales. Cada operación lleva un UUID generado por el client; el server garantiza idempotencia (si ya procesó ese opId, devuelve el resultado anterior). |
| Cómo dispara sync | `online` event + `visibilitychange` + botón manual | Background Sync API no existe en iOS. `visibilitychange` cubre el caso "el juez vuelve a la app y hay red". |
| JWT maxAge | **7 días** | Cubre jornada típica. Trade-off sobre cookie expuesta más tiempo asumido. |
| Snapshot scope | Snapshot de lectura + cola de escritura | Pre-fetch de asignaciones del juez. Permite navegar offline a pantallas no visitadas. |

## Modelo de datos

### Cambios en `prisma/schema.prisma`

```prisma
model ScoreSheet {
  // ... campos existentes ...
  clientId          String?    // UUID del dispositivo que envió por última vez
  clientSubmittedAt DateTime?  // timestamp local del envío (para auditar drift)
  version           Int        @default(0)  // bump en cada save/submit/reopen
}
```

Migración: `add_score_sheet_sync_fields`. Sin backfill — los registros existentes quedan con `version=0`, `clientId=null`.

### IndexedDB schema (`src/lib/offline/db.ts`)

Database: `puntajes-scout-juez` v1.

- **`meta`**: `{ key, value }` — guarda `clientId` (UUID generado al primer load), `lastSnapshotAt`, `userId`, `organizationId`. Validamos que el `userId` no haya cambiado al hidratar (sino, wipe y re-snapshot).
- **`snapshot`**: keyPath `id` (= `${asignacionId}:${patrullaId}`). Guarda `{ asignacionId, patrullaId, eventoId, scoreSheet, scoreEntries, criteria, posta, patrulla, fetchedAt }`. Indices: `eventoId`, `asignacionId`.
- **`pendingOps`**: keyPath `clientOpId`. Guarda `{ clientOpId, type: "save"|"submit", asignacionId, patrullaId, payload, expectedVersion, clientSubmittedAt, status: "pending"|"syncing"|"conflict"|"done", attempts, lastError, conflictData? }`. Indice: `status`.

## Implementación

Pasos en orden de dependencia:

### 1. Schema + repo

- Migración Prisma: agregar `clientId`, `clientSubmittedAt`, `version` a `ScoreSheet`.
- `src/repositories/score-sheet.repo.ts`: `saveScoreSheet`/`submitScoreSheet`/`reopenScoreSheet` aceptan `expectedVersion?`, `clientId?`, `clientSubmittedAt?`. Si `expectedVersion !== current.version` → `BusinessError("VERSION_CONFLICT", { current: ScoreSheet })`. Cada mutación incrementa `version`. Mantener compat: si `expectedVersion` es `undefined`, no validar (server actions del Plan 7a siguen funcionando).

### 2. Auth helper para API

- `src/lib/auth-helpers.ts`: agregar `requireRoleApi(roles)` que devuelve `{ ok: false, response: NextResponse }` o `{ ok: true, user, organizationId }`. No throw.
- Subir `session.maxAge` a `7 * 24 * 60 * 60` en `src/auth.config.ts`.

### 3. API routes

- `src/app/api/juez/snapshot/route.ts` (GET): devuelve `{ clientId, asignaciones: [{ asignacion, posta, patrullas, criteria, scoreSheets }] }` — todo lo que el juez necesita para operar. Tenant + role check con `requireRoleApi`.
- `src/app/api/juez/sync/route.ts` (POST): recibe una operación `{ clientOpId, type, asignacionId, patrullaId, payload, expectedVersion, clientId, clientSubmittedAt }`. Valida con Zod (reusa `SaveSchema`). Llama al repo. Casos:
  - éxito → `{ ok: true, version, scoreSheet }`
  - `VERSION_CONFLICT` → 409 `{ ok: false, code, current }`
  - `VALOR_FUERA_DE_ESCALA`/`CRITERIOS_FALTANTES`/etc → 422 `{ ok: false, code, fieldErrors? }`
  - `FORBIDDEN_NO_ASIGNADO` → 403
  - Idempotencia: si `clientOpId` ya está en una tabla `SyncOpLog` (ver abajo), devolver el resultado guardado.
- **Nota sobre idempotencia**: agregar un audit log mínimo `SyncOpLog { clientOpId @id, scoreSheetId, version, processedAt, result Json }` con TTL de 7 días (limpieza nightly o on-write). Evita procesar dos veces la misma op si la respuesta se pierde en la red.

### 4. Service worker (Serwist)

- `pnpm add serwist @serwist/next idb`
- `src/app/sw.ts`: SW vanilla con Serwist. Estrategias:
  - `/juez/**`: NetworkFirst con cache fallback (la página HTML).
  - `/_next/static/**`, `/_next/image/**`: CacheFirst.
  - `/api/auth/**`, `/api/juez/sync`: NetworkOnly (no cachear).
  - `/api/juez/snapshot`: NetworkFirst.
- `next.config.ts`: envolver con `withSerwist`. Verificar que `pnpm build` no rompa con Turbopack (build sigue usando webpack en 15.5.x — bajo riesgo).
- `public/manifest.webmanifest`: name "Puntajes Scout", short_name "Juez", theme_color `#622599`, display "standalone", start_url `/juez`, iconos 192/512.
- `public/icons/`: generar iconos brand (placeholder por ahora, refinar visual al final).
- Registro del SW en `src/app/(juez)/layout.tsx` (solo en juez group, no global).

### 5. Capa offline cliente (`src/lib/offline/`)

- `db.ts`: abre IDB con `idb`, define schema y helpers `get/put/delete` por store.
- `clientId.ts`: lee/genera UUID en `meta`. Persiste cross-session.
- `snapshot.ts`: `hydrateSnapshot()` (fetch `/api/juez/snapshot` y persiste), `readSnapshot(asignacionId, patrullaId)`, `readEventoAsignaciones(eventoId)`.
- `queue.ts`: `enqueueOp(op)`, `drain()` (procesa pendientes uno a uno contra `/api/juez/sync`), `markConflict(clientOpId, current)`.
- `sync-engine.ts`: orquesta hydrate + drain. Triggers: hook `useSyncEngine` que escucha `online`, `visibilitychange`, y expone `{ status, pendingCount, syncNow }`.

### 6. UI

- `src/components/juez/SyncStatusBadge.tsx`: chip persistente en el header del layout `(juez)`. Estados con color: online OK (verde sutil), offline (gris), `N pendientes` (amber), `sincronizando` (azul), `conflicto` (rojo).
- `src/components/juez/ConflictBanner.tsx`: en `/juez/postas/[asignacionId]/[patrullaId]/page.tsx` cuando hay un `pendingOp` con `status: "conflict"` para ese par. Muestra "Esta planilla fue reabierta por admin. ¿Reenviar tu versión o descartarla?". Acciones: `Reenviar` (re-encola con nuevo `expectedVersion`), `Descartar` (elimina op, recarga snapshot).
- `src/components/juez/ScoreSheetForm.tsx`: cambiar de `useActionState(saveScoreSheetAction)` a un dispatch custom que:
  1. Genera `clientOpId` (UUID).
  2. Persiste en IDB store `pendingOps`.
  3. Optimistic update del snapshot local.
  4. Trigger `syncNow()`.
  5. Si online + sync inmediato → toast "Borrador guardado / Enviado".
  6. Si offline → toast "Guardado en este dispositivo, se enviará al volver online".
- Server actions del Plan 7a (`saveScoreSheetAction`/`submitScoreSheetAction`) **se eliminan** — todo va por la API route. Esto unifica el path online/offline. Borrar `src/app/(juez)/juez/postas/[asignacionId]/actions.ts`.

### 7. i18n

Agregar al namespace `juez.*` en `src/messages/es.json`:

- `sync.online`, `sync.offline`, `sync.pendientes`, `sync.sincronizando`, `sync.conflicto`, `sync.reintentar`
- `sync.toastGuardadoOffline`, `sync.toastEnviadoOffline`
- `sync.conflictoBanner.titulo`, `sync.conflictoBanner.mensaje`, `sync.conflictoBanner.reenviar`, `sync.conflictoBanner.descartar`
- `pwa.instalar`, `pwa.instalarHint`

## Archivos críticos

Nuevos:
- `src/app/sw.ts`
- `src/app/api/juez/snapshot/route.ts`
- `src/app/api/juez/sync/route.ts`
- `src/lib/offline/db.ts`, `clientId.ts`, `snapshot.ts`, `queue.ts`, `sync-engine.ts`
- `src/components/juez/SyncStatusBadge.tsx`, `ConflictBanner.tsx`
- `public/manifest.webmanifest`, `public/icons/*`
- `prisma/migrations/<ts>_add_score_sheet_sync_fields/migration.sql`

Modificados:
- `prisma/schema.prisma` — `ScoreSheet` + nuevo `SyncOpLog`
- `src/repositories/score-sheet.repo.ts` — `expectedVersion`, bump de `version`
- `src/lib/auth-helpers.ts` — `requireRoleApi`
- `src/auth.config.ts` — `session.maxAge: 7d`
- `src/components/juez/ScoreSheetForm.tsx` — dispatch via queue
- `src/app/(juez)/layout.tsx` — registro SW + SyncStatusBadge
- `src/app/(juez)/juez/postas/[asignacionId]/[patrullaId]/page.tsx` — ConflictBanner
- `src/messages/es.json` — namespace `juez.sync.*` y `juez.pwa.*`
- `next.config.ts` — `withSerwist`

Eliminados:
- `src/app/(juez)/juez/postas/[asignacionId]/actions.ts` (reemplazado por API route)

## Tests

Archivo extendido: `src/repositories/score-sheet.repo.test.ts`.

### Casos nuevos en `saveScoreSheet` (syncMeta)

| # | Descripción |
|---|---|
| 13 | Sin `syncMeta` → no se valida `version` (compat con server actions del Plan 7a) |
| 14 | `expectedVersion=0` sin sheet existente → crea con `version: 1` |
| 15 | `expectedVersion` coincide con `sheet.version` → pasa sin conflict |
| 16 | `expectedVersion ≠ sheet.version` (admin reabrió offline) → lanza `VERSION_CONFLICT` con `meta.currentVersion` |
| 17 | Update usa `version: { increment: 1 }` y persiste `clientId`/`clientSubmittedAt` |

### Casos nuevos en `submitScoreSheet` (syncMeta)

| # | Descripción |
|---|---|
| 18 | `VERSION_CONFLICT` en submit cuando `expectedVersion ≠ sheet.version` |
| 19 | Submit exitoso devuelve `version` junto con `totalPuntuable`/`totalDesempate` |

### Caso nuevo en `reopenScoreSheet`

| # | Descripción |
|---|---|
| 20 | `reopenScoreSheet` bumps `version: { increment: 1 }` para invalidar ops offline pendientes del cliente |

Correr con:
```bash
pnpm test
```

## Verificación

### Entornos requeridos

El service worker está deshabilitado en `pnpm dev` (para no interferir con HMR). Esto divide los escenarios en dos grupos:

| Escenario | Entorno mínimo | Razón |
|---|---|---|
| 1 — Online happy path | `pnpm dev` | Solo lógica de negocio |
| 2 — Offline durante carga | `pnpm dev` | IDB y queue funcionan sin SW |
| 3 — Offline tras snapshot | `pnpm build && pnpm start` | Requiere cache del SW para servir HTML |
| 4 — Conflicto por reapertura | `pnpm dev` | Solo repo y API route |
| 5 — Auth offline 7 días | `pnpm build && pnpm start` | Requiere cookie real con maxAge |
| 6 — Idempotencia | `pnpm dev` | Solo SyncOpLog en Postgres |
| 7 — Reload offline | `pnpm build && pnpm start` | Requiere SW activo |
| 8 — Multi-device | `pnpm dev` | Dos browsers distintos |
| 9 — Instalación PWA | `pnpm build && pnpm start` | Requiere SW activo |
| 10 — Tenant isolation offline | `pnpm dev` | Solo lógica de IDB |

### Setup de herramientas DevTools (Chrome)

Antes de empezar, familiarizarse con estos paneles:

**Inspeccionar IDB:**
DevTools → Application → Storage → IndexedDB → `puntajes-scout-juez` → stores: `meta`, `snapshot`, `pendingOps`.

**Simular offline y disparar el evento `online`/`offline`:**
DevTools → Network → throttling preset → **Offline**.
Este preset bloquea requests de red Y dispara el evento `offline` (cambia `navigator.onLine` a `false`). Para volver online, cambiar de vuelta a "No throttling".

> Nota: el checkbox "Offline" en Application → Service Workers solo funciona si hay un SW registrado. En `pnpm dev`, ese checkbox no tiene efecto — usar siempre el preset de Network.

**Ver logs del SW en producción:**
Application → Service Workers → ver estado (activated/waiting), mensajes de consola del worker.

**Ver SyncOpLog en Postgres:**
```sql
SELECT * FROM "SyncOpLog" ORDER BY "processedAt" DESC LIMIT 20;
```

---

### Escenario 1 — Online happy path

**Entorno**: `pnpm dev`

**Pasos**:
1. Loguearse como JUEZ. Ir a `/juez/eventos` → abrir un evento activo → abrir una posta → seleccionar una patrulla.
2. Cargar todos los criterios (o puntaje único). Click en "Guardar borrador" → toast "Borrador guardado".
3. Click en "Enviar" → redirige a la lista de patrullas. La patrulla aparece con estado ENVIADA.
4. Loguearse como ADMIN en otra pestaña. Ir a `/admin/eventos/[id]/planillas` → verificar que aparece el total de la patrulla.

**Qué verificar**:
- En Network tab: POST a `/api/juez/sync` devuelve 200 con `{ ok: true, version: 1 }`.
- En IDB `pendingOps`: la op aparece y desaparece (se elimina al procesarse).
- `SyncStatusBadge` muestra punto verde en todo momento.

---

### Escenario 2 — Offline durante carga

**Entorno**: `pnpm dev`

**Pasos**:
1. Loguearse como JUEZ. Navegar a `/juez/postas/[asignacionId]/[patrullaId]`.
2. DevTools → Network → Offline (simular sin red).
3. Cargar puntajes en el form. Click en "Enviar".
4. Verificar: aparece toast "Guardado en este dispositivo. Se enviará al volver online."
5. `SyncStatusBadge` muestra `1 pendiente` en gris (offline).
6. DevTools → Network → No throttling (volver online).
7. El sync engine detecta el evento `online` y drena la cola automáticamente.

**Qué verificar**:
- En IDB `pendingOps`: op con `status: "pending"` mientras offline.
- Al volver online: la op desaparece de `pendingOps`.
- Admin ve el total actualizado.
- `SyncStatusBadge` vuelve a verde.

**Qué NO funciona en dev**: si el navegador se recarga mientras está offline, Next.js no puede servir el HTML (el SW no está activo). Eso es el escenario 7.

---

### Escenario 3 — Offline tras snapshot (páginas no visitadas)

**Entorno**: `pnpm build && pnpm start`

**Pasos**:
1. Hacer build y levantar: `pnpm build && pnpm start`.
2. Loguearse como JUEZ. Verificar en Application → Service Workers que el SW está **activated**.
3. Ir a `/juez/eventos` (esto dispara `hydrateSnapshot` vía el sync engine). Verificar en IDB `snapshot` que hay entradas.
4. **No** navegar a ninguna posta concreta todavía.
5. DevTools → Network → Offline.
6. Navegar a `/juez/postas/[asignacionId]/[patrullaId]`.

**Qué verificar**:
- El SW sirve el HTML cacheado de la ruta (visible en Application → Cache Storage → `juez-pages`).
- El form se hidrata con los datos del IDB snapshot.
- Se puede seleccionar puntajes y click "Enviar" → op encolada.

**Limitación conocida**: si la ruta nunca fue visitada antes de activar offline, el HTML no está en cache y el SW no puede servirla. El escenario funciona solo para páginas que el SW cacheó en visitas previas. Ver lección #6.

---

### Escenario 4 — Conflicto por reapertura

**Entorno**: `pnpm dev` (usar dos ventanas del browser)

**Pasos**:
1. **Ventana A** (JUEZ): Ir a `/juez/postas/[asignacionId]/[patrullaId]` con una planilla en BORRADOR (version = N).
2. Activar offline en ventana A: DevTools → Network → Offline.
3. En ventana A: cargar puntajes y click "Enviar". Op queda en cola con `expectedVersion: N`.
4. **Ventana B** (ADMIN, distinto perfil de Chrome o Firefox): Ir a `/admin/eventos/[id]/planillas` → Reabrir esa planilla. Esto hace `version: N+1` en el server.
5. En ventana A: DevTools → Network → No throttling (volver online). El sync engine drena la cola → POST a `/api/juez/sync` con `expectedVersion: N` → server devuelve 409 (version actual es N+1).

**Qué verificar**:
- En IDB `pendingOps`: la op cambia de `status: "pending"` a `status: "conflict"`.
- `SyncStatusBadge` muestra "Conflicto" en rojo.
- Navegar de vuelta a la página de la planilla → aparece `ConflictBanner`.
- Click "Reenviar mi versión" → se re-encola con `expectedVersion: N+1` → sync → éxito → banner desaparece.
- Click "Descartar y refrescar" → elimina la op, hace `router.refresh()`, página muestra el estado del server.

---

### Escenario 5 — Auth offline 7 días

**Entorno**: `pnpm build && pnpm start`

**Verificación práctica** (sin esperar 7 días reales):

1. Loguearse. En DevTools → Application → Cookies → `next-auth.session-token` → verificar que `Expires` está aproximadamente 7 días en el futuro.
2. Para simular JWT expirado: modificar manualmente la cookie para que tenga una fecha de expiración pasada. Verificar que el middleware redirige a `/login`.
3. Verificar que IDB `pendingOps` sobrevive el redirect (la cola no se limpia en el cliente al ir a `/login`).

**Lo que no se puede testear fácilmente**: que la app funcione offline durante los días 1-6 requeriría mantener un dispositivo sin conectividad durante ese tiempo. El mecanismo es estándar de Auth.js y el `maxAge` está configurado correctamente.

---

### Escenario 6 — Idempotencia

**Entorno**: `pnpm dev`

**Pasos**:
1. En DevTools → Application → IndexedDB → `pendingOps`: anotar un `clientOpId` de una op enviada recientemente (o crear una manualmente).
2. Enviar el mismo POST dos veces al mismo `clientOpId` desde la consola del browser:
```js
// Copiar un clientOpId de IDB o generar uno fijo para la prueba
const opId = "00000000-0000-0000-0000-000000000001"

const body = {
  clientOpId: opId,
  type: "save",
  asignacionId: "ASIGNACION_ID_REAL",
  patrullaId: "PATRULLA_ID_REAL",
  payload: { entries: [], puntajeUnico: null },
  expectedVersion: 0,
  clientId: "test-device",
  clientSubmittedAt: new Date().toISOString(),
}

// Primera llamada → procesa y guarda en SyncOpLog
const r1 = await fetch("/api/juez/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
console.log("Primera:", await r1.json())

// Segunda llamada con mismo clientOpId → devuelve resultado anterior sin procesar
const r2 = await fetch("/api/juez/sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
console.log("Segunda:", await r2.json())
```

**Qué verificar**:
- Ambas respuestas son idénticas (`ok: true`, mismo `version`).
- En Postgres: `SELECT version FROM "ScoreSheet" WHERE ...` muestra que `version` solo se incrementó una vez.
- `SyncOpLog` tiene exactamente una fila para ese `clientOpId`.

---

### Escenario 7 — Reload offline

**Entorno**: `pnpm build && pnpm start`

**Pasos**:
1. Con el SW activo y activado, navegar a `/juez`, `/juez/eventos`, `/juez/postas/[A]`.
2. DevTools → Network → Offline.
3. Cerrar la pestaña. Abrir una pestaña nueva y navegar a `/juez`.

**Qué verificar**:
- En Application → Service Workers: el SW sirve la respuesta desde cache (columna "From ServiceWorker" en Network tab, aunque el tab de Network mostrará errores de red — los assets estáticos vienen del cache).
- La UI del juez carga sin red.
- `SyncStatusBadge` muestra offline.
- Las ops en `pendingOps` siguen presentes.

---

### Escenario 8 — Multi-device

**Entorno**: `pnpm dev` (Chrome + Firefox, misma cuenta)

**Pasos**:
1. **Dispositivo A** (Chrome): Loguearse como JUEZ. Ir a planilla X (version = 0). Activar offline. Click "Enviar" → op en cola con `expectedVersion: 0`.
2. **Dispositivo B** (Firefox, misma sesión): Loguearse como JUEZ. Ir a la misma planilla X. Activar offline. Click "Enviar" → op en cola con `expectedVersion: 0`.
3. **Dispositivo A**: Volver online. Sync → POST con `expectedVersion: 0` → 200, `version` pasa a 1.
4. **Dispositivo B**: Volver online. Sync → POST con `expectedVersion: 0` → 409 (server tiene version = 1).

**Qué verificar**:
- En IDB de dispositivo B: op con `status: "conflict"`, `conflictData.currentVersion: 1`.
- `SyncStatusBadge` en dispositivo B muestra "Conflicto".
- `ConflictBanner` aparece en la página de la planilla en dispositivo B.

---

### Escenario 9 — Instalación PWA

**Entorno**: `pnpm build && pnpm start`

**Chrome Desktop / Android**:
1. Navegar a `/juez`.
2. En la barra de dirección aparece el ícono de instalación (o en Chrome Android, banner "Agregar a pantalla de inicio").
3. Instalar. Verificar que la app abre en ventana standalone (sin barra de browser).
4. Verificar ícono púrpura en el launcher.

**iOS Safari**:
1. Navegar a `/juez` en Safari.
2. Compartir → "Agregar a pantalla de inicio".
3. Verificar que abre standalone con el ícono generado.

**Qué verificar en DevTools**:
Application → Manifest → verificar que todos los campos cargan (`name`, `short_name`, `theme_color: #622599`, `display: standalone`, `start_url: /juez`). Sin errores de íconos.

---

### Escenario 10 — Tenant isolation offline

**Entorno**: `pnpm dev` (usuario con memberships en 2 orgs)

**Pasos**:
1. Loguearse como usuario con acceso a **Org A** y **Org B**.
2. Con Org A activa: ir a `/juez/eventos`. En IDB `meta` → `organizationId` = ID de Org A. En `snapshot`: entradas de Org A.
3. Cambiar a Org B (desde el switcher de distrito).
4. Navegar a `/juez/eventos`.

**Qué verificar**:
- En IDB → inmediatamente después del cambio de org: `clearSnapshot()` se ejecuta, `snapshot` queda vacío.
- `hydrateSnapshot` se llama con el nuevo `organizationId` → IDB se repopula con datos de Org B.
- En IDB `meta`: `organizationId` = ID de Org B.
- Ningún dato de Org A persiste en IDB.

## Riesgos a vigilar durante ejecución

- **Serwist + Turbopack**: el dev server con Turbopack puede no servir el SW correctamente. Verificar temprano. Fallback: SW solo en producción (`pnpm build && pnpm start`) y dev sin SW.
- **iOS Safari quirks**: `visibilitychange` puede no dispararse al volver de Settings → app. Probar en iPhone real.
- **`<dialog>` para ConflictBanner**: aplicar lección 21 (`m-auto` con Tailwind).
- **Decimal serialization**: `version`, `valor`, totales — aplicar lección 26 (convertir a `Number` en boundary client).
- **Fast refresh**: el SW interfiere con HMR. Documentar el desarrollo "modo PWA off" vs "modo PWA on".

## Lecciones aprendidas

### 1. `sw.ts` debe excluirse del `tsconfig.json` principal

El service worker corre en un contexto `WorkerGlobalScope`, no en el contexto DOM/Node. `ServiceWorkerGlobalScope` pertenece a la lib `webworker` de TypeScript, que no se incluye en el tsconfig de una app Next.js (que solo lista `dom`, `dom.iterable`, `esnext`). La solución es agregar `"src/app/sw.ts"` al array `exclude` del `tsconfig.json`. Serwist/Next compila el SW por separado con su propio pipeline de webpack.

### 2. El error de Edge Runtime de `jose@6.2.3` era pre-existente

Al instalar Serwist, el primer `pnpm build` mostró un error de Edge Runtime relacionado con `DecompressionStream` en `jose@6.2.3`. Verificando con `git stash`, se confirmó que ese error ya existía en la base de código antes del plan 7b — `jose@6.2.3` estaba en el lockfile del commit anterior. El error no bloquea el build: Next.js solo emite un warning (no un error fatal) cuando detecta APIs Node.js en el Edge Runtime de la middleware. El build se completa igual.

### 3. Serwist `disable: process.env.NODE_ENV === "development"` como fallback seguro

El riesgo principal del plan era Serwist + Turbopack rompiendo el dev server. La solución documentada en el plan —deshabilitar el SW en desarrollo— se implementó directamente en `next.config.ts` con `disable: process.env.NODE_ENV === "development"`. Esto evita completamente cualquier conflicto con HMR durante el desarrollo. El SW solo se registra en producción (`pnpm build && pnpm start`).

### 4. `db.ts` de IDB no puede tener keyPath tipado con `id` si el campo no está en el tipo base

El store `snapshot` de IDB usa `keyPath: "id"` donde `id = "${asignacionId}:${patrullaId}"`. Pero `SnapshotEntry` no tiene campo `id` — se agrega al momento del `put` con spread. TypeScript detecta el desajuste. La solución: castear con `as never` en el `put` del snapshot. Es un compromiso razonable dado que `idb` no soporta keyPath derivados en sus tipos genéricos.

### 5. `getPendingOpsByStatus` no garantiza orden de inserción — agregué `createdAt` para el drain

`IndexedDB.getAllFromIndex` con un índice no-único (como `status`) devuelve los registros ordenados por la clave primaria (`clientOpId`). Como `clientOpId` es un UUID v4, el orden es pseudoaleatorio. Para que `drain()` procese ops en orden de creación (crítico para el encadenamiento de `expectedVersion`), agregué el campo `createdAt: string` (ISO timestamp) a `PendingOp` y ordeno por él al inicio de `drain()`.

### 6. Limitación conocida: páginas no visitadas no están disponibles offline

El SW usa estrategia `NetworkFirst` para rutas `/juez/**`. Si el juez nunca visitó `/juez/postas/[A]/[B]` antes de activar el modo avión, el HTML de esa ruta no está en el cache del SW y la página no puede renderizarse. El `snapshot` de IDB tiene los datos pero no hay mecanismo para hidratarlos en el SSR. Esto es una limitación arquitectónica del approach SSR-first: soportar páginas no visitadas en modo avión requeriría migrar esas rutas a Client-Side Rendering con hidratación desde IDB, lo cual está fuera del alcance del Plan 7b.

### 7. `useSyncEngine` necesita `userId` y `organizationId` para hidratar correctamente

El sync engine llama `hydrateSnapshot(userId, organizationId)` para detectar cambios de tenant y hacer wipe del IDB si es necesario. Estos parámetros deben venir del Server Component (layout) y pasarse como props al Client Component (`SyncStatusBadge`). Sin ellos, el engine solo hace drain sin hidratación. Separar el engine del badge haría más difícil pasarlos — la decisión de incluirlos como props opcionales del hook fue correcta.

### 8. `version` debe añadirse al tipo `ScoreSheetForJuez` en el repo

El snapshot endpoint necesita devolver `version` de cada `ScoreSheet` para que el cliente pueda rastrear el `expectedVersion` correcto. Olvidar agregarlo al tipo `ScoreSheetForJuez` (que se comparte entre el endpoint de snapshot y las lecturas del juez) habría causado un error en runtime. Fue detectado al typecheckear. Siempre agregar campos nuevos a los tipos exportados del repo junto con el cambio de schema.

### 9. Serwist `runtimeCaching`: usar instancias de clase, nunca strings

Serwist acepta strings como `"NetworkOnly"`, `"NetworkFirst"` en su API tipada pero **no los resuelve en runtime**: el handler queda como `{ handle: "NetworkOnly" }` donde `handle` es un string no callable. Al ejecutarse lanza `TypeError` → `event.respondWith(rejected Promise)` → network error silencioso. Esto rompió el callback de Google OAuth (`GET /api/auth/callback/google`) y el fetch del CSRF token (`GET /api/auth/csrf`), bloqueando tanto el login como el sign-out.

Siempre usar instancias: `new NetworkOnly()`, `new NetworkFirst({ cacheName, plugins })`, `new CacheFirst(...)`. Las opciones de expiración van en el constructor vía `plugins: [new ExpirationPlugin({ maxAgeSeconds })]`.

### 10. `ServiceWorkerRegistrar` debe tener guarda de dev mode

El componente `ServiceWorkerRegistrar` registraba `/sw.js` incondicionalmente. Como `next.config.ts` no compila un SW en desarrollo (`process.env.NODE_ENV === "development"`), el browser seguía usando el `public/sw.js` del último `pnpm build`, que interceptaba y rompía todas las requests (incluidas las de HMR de Turbopack) incluso en `pnpm dev`. Fix: agregar `if (process.env.NODE_ENV === "development") return` al inicio del `useEffect`.

### 11. `defaultCache` de `@serwist/next/worker` rompe navegaciones en Next.js 15 App Router

El `defaultCache` incluye un handler "others" con `NetworkFirst` que captura cualquier URL same-origin no-API con `mode: "navigate"` e intenta cachear la respuesta. Next.js 15 App Router produce respuestas SSR como `ReadableStream` que el Cache API no puede almacenar. El handler lanza `no-response` y rompe **todas** las páginas de la app, no solo las de juez. Fix obligatorio: agregar `{ matcher: ({ request }) => request.mode === "navigate", handler: new NetworkOnly() }` **antes** del `...defaultCache` en `runtimeCaching`. Esto aplica a cualquier proyecto Next.js App Router con Serwist.

### 12. `useSyncEngine` no llamaba `syncNow` en el mount inicial

El hook registraba listeners para `online` y `visibilitychange`, pero no hacía ninguna llamada al montar. Si el usuario ya estaba online al cargar la página, ninguno de esos eventos disparaba y el IDB quedaba vacío. Fix: `useEffect(() => { syncNow() }, [syncNow])` — corre en mount y también cuando `userId`/`organizationId` cambian (cambio de tenant), ambos comportamientos deseados.

### 13. La limitación offline de SSR es más severa de lo planificado — bloquea el caso de uso principal

El plan 7b asumió que el juez podría navegar offline entre patrullas si el SW cacheaba las páginas visitadas. En la práctica, la navegación client-side de Next.js App Router hace fetches de RSC payloads para cada ruta destino. Si esa ruta nunca fue visitada antes, el RSC payload no está en cache y la navegación falla con network error — aunque el IDB tenga todos los datos necesarios. Esto hace que el juez no pueda moverse entre postas offline sin haber visitado cada una individualmente con anterioridad, lo cual es inaceptable para el caso de uso real (evento scout en campo con red intermitente). La solución requiere convertir las páginas de juez de Server Components a Client Components que lean del IDB snapshot — planificado en Plan 7c.
