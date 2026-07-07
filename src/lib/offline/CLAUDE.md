# Subsistema offline del juez — convenciones

Este archivo contiene las convenciones del modo offline (PWA, IndexedDB, cola de sync, SPA catch-all). Se carga automáticamente al trabajar en `src/lib/offline/`; el subsistema abarca también `src/app/(juez)/`, `src/components/juez/` y `src/app/sw.ts` (esos directorios tienen punteros a este archivo).

**Lectura obligatoria antes de cualquier cambio: `docs/adr/0004-modo-offline-pwa-spa.md`** — arquitectura completa y reglas permanentes del subsistema. Es el más frágil del proyecto: sus fallas son silenciosas (sin error visible) y solo reproducibles con la app buildeada, porque el Service Worker está deshabilitado en desarrollo.

La numeración pertenece a la secuencia global de convenciones del proyecto (ver `CLAUDE.md` raíz). Estas viven acá — y no en el raíz — porque su trigger es exclusivamente editar este subsistema (criterio de partición del workflow). Nunca renumerar ni reusar números.

## Service Worker (Serwist)

27. **Service worker (`sw.ts`) debe excluirse del `tsconfig.json` principal**: `ServiceWorkerGlobalScope` pertenece a la lib `webworker` de TypeScript, no a `dom`. Agregar `"src/app/sw.ts"` al array `exclude` del tsconfig. Serwist/Next compila el SW por separado con webpack. Deshabilitar el SW en desarrollo con `disable: process.env.NODE_ENV === "development"` en `withSerwist()` para evitar conflictos con HMR. (Ver Plan 7b lección #1 y #3).

31. **Serwist `runtimeCaching`: usar instancias de clase, no strings**: Serwist acepta strings como `"NetworkOnly"`, `"NetworkFirst"` en su API tipada pero NO los resuelve en runtime — el handler queda como `{handle: "NetworkOnly"}` (string no callable). Al ejecutarse lanza un `TypeError` que causa `event.respondWith(rejected Promise)`, fallando silenciosamente la request. Usar siempre instancias: `new NetworkOnly()`, `new NetworkFirst({ cacheName, plugins })`, `new CacheFirst(...)`. Las opciones de expiración van en el constructor via `plugins: [new ExpirationPlugin({ maxAgeSeconds })]`.

32. **Serwist + Next.js App Router: todas las navegaciones deben ser `NetworkOnly`**: El `defaultCache` de `@serwist/next/worker` incluye un handler "others" `NetworkFirst` que intercepta cualquier navegación de página (`mode: "navigate"`) e intenta cachear la respuesta. Next.js 15 App Router produce respuestas SSR como `ReadableStream` que el Cache API no puede almacenar — el handler lanza `no-response` y rompe TODAS las páginas. Agregar un handler `new NetworkOnly()` para `request.mode === "navigate"` ANTES de `...defaultCache` para cortocircuitar el problema.

## IndexedDB y cola de sync

28. **Cola offline: ordenar por `createdAt` antes de drenar**: `IndexedDB.getAllFromIndex` con índice no-único devuelve registros en orden de clave primaria (UUID), no de inserción. Para encadenar `expectedVersion` correctamente entre ops del mismo (asignacion × patrulla), agregar campo `createdAt: string` a `PendingOp` y ordenar por él al inicio de `drain()`. (Ver Plan 7b lección #5).

34. **IDB upgrade via `transaction.objectStore()`, no `db.clear()`**: durante el callback `upgrade` de `idb`, la transacción de upgrade ya está activa. Llamar `db.clear(store)` crea una nueva transacción interna que falla. Usar `transaction.objectStore(storeName).clear()` (4° parámetro del callback) que opera sobre la upgrade transaction existente. El `idb` library expone esta transacción como `IDBPTransaction<DBTypes, ..., "versionchange">`. (Ver Plan 7c lección #3).

- **Regla sin número (Plan 7b): toda mutación nueva sobre `ScoreSheet` debe bumpear `version`.** La detección de conflictos del sync compara `expectedVersion` contra `ScoreSheet.version`; una mutación que no lo incrementa queda invisible para el mecanismo. La idempotencia de operaciones se garantiza con `SyncOpLog` (keyed por `clientOpId`).

## Sync engine y hooks de datos

29. **`useSyncEngine` requiere `userId`/`organizationId` para hidratar el snapshot**: pasar estos parámetros desde el Server Component del layout al Client Component del badge. Sin ellos, el engine solo hace drain sin actualizar el snapshot de IDB. La hidratación también detecta cambios de tenant y hace wipe del IDB si el usuario u organización cambiaron. (Ver Plan 7b lección #7).

33. **`useSyncEngine` necesita llamar `syncNow()` en el mount inicial**: El hook solo dispara la hidratación del snapshot en eventos `online` y `visibilitychange`. Si el usuario ya está online al cargar, ninguno de esos eventos dispara y el IDB queda vacío. Agregar `useEffect(() => { syncNow() }, [syncNow])` que corre en mount y también cuando cambia `userId`/`organizationId` (cambio de tenant).

35. **`useJuezData`: mantener `status: "loading"` mientras el snapshot no ha sido hidratado en la sesión activa**: si el reader del IDB devuelve vacío (null o array vacío) y `lastHydratedAt === 0` y el user está online, el hook debe quedar en `"loading"` — el sync está en curso y puede traer datos en segundos. Cambiar a `"empty"` prematuramente causaría un flash de "sin datos" durante el primer sync. Solo transicionar a `"empty"` cuando `lastHydratedAt > 0` (se sabe que el sync completó y el IDB sigue vacío). (Ver Plan 7c lección #9).

36. **`emptyCheck = () => false` para páginas donde `null` significa "no encontrado"**: cuando el reader puede devolver `null` (entidad no encontrada en IDB) o un objeto posiblemente vacío (encontrado pero sin items), `emptyCheck` no debe cubrir el caso `null` — ambos terminarían en `status: "empty"` sin distinción. Usar `emptyCheck = () => false` y manejar la UI de "lista vacía" en el branch `status: "ready"`. El branch `status: "empty"` queda exclusivo para "not found / nunca sincronizado". (Ver Plan 7c lección #8).

## Router SPA de `/juez/**`

50. **En `/juez/**`, `router.push()`/`router.replace()` de Next.js no navegan el SPA — solo `useJuezRouter().navigate()` o `JuezLink`**: el catch-all `/juez/[[...slug]]/page.tsx` decide qué vista renderizar en base al `pathname` que mantiene `JuezRouterProvider` (actualizado solo al montar, en `popstate`, o vía su propio `navigate()`), no en base al router de Next.js. `router.push()` cambia la URL con `history.pushState` pero no dispara `popstate`, así que el usuario queda viendo la vista vieja con la URL nueva en la barra de direcciones — sin error visible. Este bug real estuvo documentado por años en el ADR-0004 como limitación "aceptable" (`ScoreSheetForm` post-submit); no lo era. Ver ADR-0004 regla #5 y sección Negativas/Limitaciones.

## Limitaciones aceptadas

30. **Limitación offline de SSR**: las rutas `/juez/**` solo están disponibles offline si el Service Worker las cacheó en una visita anterior. El snapshot de IDB tiene los datos pero no existe mecanismo para inyectarlos en el SSR sin red. Soportar páginas no visitadas en modo avión requiere migrar esas rutas a CSR con hidratación desde IDB — fuera del alcance del Plan 7b. (Ver Plan 7b lección #6).
