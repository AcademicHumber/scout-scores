# Plan 13b — Refresh de sesión tras cambio de rol hecho por otro usuario

**Estado:** completado
**Contexto:** bug reportado tras una prueba de uso real — un usuario se registra como Espectador, un ADMIN le cambia el rol a Juez inmediatamente después, y el usuario debe volver a hacer login para obtener las capacidades de Juez. Se investigó y resultó ser un problema estructural de la sesión JWT, no un bug puntual — de ahí que amerite un plan propio en vez de quedar como nota suelta.
**Prioridad:** corrección de UX/arquitectura de sesión. Bajo riesgo, sin cambios de schema ni de server actions existentes.

---

## Diagnóstico

Las sesiones usan **estrategia JWT** (no DB sessions): es requisito arquitectónico, porque el middleware corre en Edge runtime y no puede importar Prisma (convenciones #9–10). Esto implica que el rol y las memberships de un usuario viven **embebidos en la cookie de su propio navegador**, seteados en el momento del login (`auth.ts` → callback `jwt`) y nunca vueltos a leer de la DB salvo que se dispare explícitamente `trigger === "update"`.

`requireRole()`, `requireRoleApi()` y el middleware confían enteramente en ese dato embebido — ninguno consulta la DB al autorizar (por diseño, para no pagar una query en cada request).

El único mecanismo para refrescar el JWT es `unstable_update({ refreshMemberships: true })` desde `next-auth/react`, y **solo puede dispararlo el propio navegador dueño de la cookie**. El servidor no tiene forma de empujar una actualización a la sesión de otro cliente.

En `src/app/(app)/admin/miembros/actions.ts`, `updateMembership`/`removeMembership` solo llamaban `unstable_update` cuando `affectedUserId === user.id` — es decir, únicamente cubrían el caso en que un ADMIN edita su propia membership. Cuando el ADMIN cambia el rol de **otra persona**, no existía ningún trigger que le avisara a esa persona que su JWT quedó desactualizado.

El único refresh "para terceros" que existía, `MembershipRefresher` (`src/app/(app)/dashboard/MembershipRefresher.tsx`), era de un solo uso, montado solo en `/dashboard`, y condicionado a `memberships.length === 0` (caso post-onboarding). No cubría "ya tenía membership y le cambiaron el rol después".

**Consecuencia observada**: ni siquiera un F5 manual resolvía el problema — recargar la página solo re-decodifica la misma cookie sin volver a consultar la DB, porque nada dispara `trigger: "update"` en ese flujo. El usuario quedaba con el rol viejo hasta que el JWT expiraba (7 días) o volvía a loguearse manualmente.

La lógica de refresco en sí ya era correcta: el callback `jwt` en `auth.ts` (líneas 111–136), al recibir `session.refreshMemberships`, re-consulta memberships completas por `userId` — lo cual captura tanto altas/bajas como cambios de rol. Solo faltaba ampliar **quién y cuándo** dispara ese trigger.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **¿Cómo detectar que hay que refrescar?** | Cliente dispara `update()` periódicamente, sin lógica de "detección de cambios" en el servidor | No hay forma de notificar push a un cliente distinto en esta arquitectura (sin websockets/SSE). El único camino es que el propio navegador del usuario afectado vuelva a preguntar. |
| **¿Cuándo disparar el refresh?** | Al montar + al recuperar foco de pestaña (`visibilitychange`) + intervalo de respaldo cada 3 min | Mismo patrón ya validado en `useSyncEngine` (convención #33) para el foco/conectividad. El intervalo cubre el caso de una pestaña que nunca pierde el foco (celular del juez fijo en `/juez` durante todo el evento). |
| **¿Reemplazar `MembershipRefresher` o dejarlo en paralelo?** | Reemplazar | El nuevo `SessionRefresher`, montado en el layout, se ejecuta en todo caso en el que `MembershipRefresher` se ejecutaba (mismo punto de entrada, mismo `update({ refreshMemberships: true })`), más los triggers adicionales de foco/intervalo. Mantener ambos sería lógica duplicada. |
| **¿Dónde montarlo?** | En los dos shells autenticados: `(app)/layout.tsx` y `(juez)/layout.tsx` | Son los dos route groups con `SessionProvider` propio (convención #24). Cubre admin, espectador, jefe de patrulla y juez. |
| **¿Tocar el callback `jwt` en `auth.ts`?** | No | Ya re-consulta memberships completas al recibir el trigger — el problema nunca fue la lógica de refresco, sino la ausencia de quien lo disparara para terceros. |

## Cambios por archivo

### 1. `src/components/auth/SessionRefresher.tsx` (nuevo)

Client Component sin UI (`return null`). Expone un único `refresh()` memoizado con `useCallback`, guardado con `useRef` para evitar llamadas superpuestas y evitar disparar si `!navigator.onLine`:

```tsx
const refresh = useCallback(async () => {
  if (refreshingRef.current || !navigator.onLine) return
  refreshingRef.current = true
  try {
    await update({ refreshMemberships: true })
    router.refresh()
  } catch {
    // Red inestable: se reintenta en el próximo trigger (foco, intervalo)
  } finally {
    refreshingRef.current = false
  }
}, [update, router])
```

Tres efectos disparan `refresh()`:
- Al montar (una vez).
- En `visibilitychange`, cuando `document.visibilityState === "visible"`.
- En un `setInterval` de 3 minutos (`BACKSTOP_INTERVAL_MS`), como respaldo.

### 2. `src/app/(app)/layout.tsx`

Se agrega `<SessionRefresher />` dentro de `<Providers>`, antes de `<AppHeader />`.

### 3. `src/app/(juez)/layout.tsx`

Se agrega `<SessionRefresher />` dentro del `<SessionProvider>`, antes de `{children}`.

### 4. `src/app/(app)/dashboard/page.tsx`

Se elimina el bloque condicional `{!hasMemberships && <MembershipRefresher />}` y el cálculo de `hasMemberships` que solo se usaba para esa condición — el refresh al montar en `(app)/layout.tsx` ya cubre ese caso (se ejecuta antes de que `DashboardPage` renderice).

### 5. `src/app/(app)/dashboard/MembershipRefresher.tsx` (eliminado)

Subsumido por `SessionRefresher`.

## Cambio adicional (post-plan): `update()` se descartaba en silencio en `(app)`

Al probar el escenario 2 de Verificación (F5 manual) con un cambio de rol real, el refresh seguía sin aplicarse. Se agregaron logs temporales en `SessionRefresher` (visibles en la consola del browser, no en la terminal del server) y apareció esto:

```
[SessionRefresher] llamando update({ refreshMemberships: true })
[SessionRefresher] update resolvió undefined
```

`update()` resolvía `undefined` **sin llegar a hacer ningún request** a `/api/auth/session`. La causa está en la propia implementación de `next-auth/react` (`node_modules/next-auth/react.js`):

```js
async update(data) {
  if (loading) return   // ← se descarta en silencio si el provider sigue "loading"
  setLoading(true)
  const newSession = await fetchData("session", ...)
  ...
}
```

`SessionProvider` arranca en `loading: true` cuando **no** recibe una `session` inicial por prop (`hasInitialSession = props.session !== undefined`) — y `src/app/(app)/providers.tsx` montaba `<SessionProvider>` sin ese prop, a diferencia de `(juez)/layout.tsx`, que sí lo pasaba (`<SessionProvider session={session}>`). React dispara los efectos de los componentes hijos antes que los del padre, así que el efecto de montaje de `SessionRefresher` (hijo) corre **antes** que el efecto interno de `SessionProvider` que hace el fetch inicial y recién ahí pone `loading: false`. Resultado: la primera llamada a `update()` en cualquier página bajo `(app)` siempre pegaba contra ese guard y no hacía nada — el refresh de foco/intervalo sí funcionaba (para ese momento `loading` ya era `false`), pero recién a los minutos, no en el momento esperado (mount / F5).

**Fix**: `(app)/layout.tsx` ahora obtiene la sesión server-side con `auth()` (en paralelo con `requireOrg()`) y se la pasa a `Providers`, que la reenvía a `SessionProvider` — mismo patrón que ya usaba `(juez)/layout.tsx`. Con `hasInitialSession = true`, `loading` arranca en `false` y el `update()` del montaje ya no se descarta.

### Archivos

- **`src/app/(app)/providers.tsx`**: `Providers` ahora recibe `session: Session | null` como prop y se lo pasa a `SessionProvider`.
- **`src/app/(app)/layout.tsx`**: llama `auth()` en paralelo con `requireOrg()` y pasa `session` a `<Providers>`.
- Se retiraron los logs de diagnóstico temporales de `SessionRefresher.tsx`.

## Tareas

- [x] 1. Crear `SessionRefresher.tsx` con triggers de mount + visibilitychange + intervalo
- [x] 2. Montar en `(app)/layout.tsx`
- [x] 3. Montar en `(juez)/layout.tsx`
- [x] 4. Eliminar `MembershipRefresher.tsx` y su uso en `dashboard/page.tsx`
- [x] 5. `pnpm typecheck` — sin errores
- [x] 6. `pnpm lint` — sin errores
- [x] 7. *(post-plan)* Pasar `session` inicial a `SessionProvider` en `(app)/providers.tsx` — sin esto, `update()` se descartaba en silencio en el mount
- [x] 8. *(post-plan)* `pnpm typecheck`, `pnpm lint` y `pnpm test` (115 tests) — sin errores

## Lecciones aprendidas

### #1 — En estrategia JWT, un cambio de rol hecho por un ADMIN sobre OTRO usuario no se propaga solo

El patrón ya establecido en convención #13 (`unstable_update({ refreshMemberships: true })` antes de `redirect()`) resuelve el caso de auto-edición, pero es insuficiente en general: solo funciona cuando quien ejecuta la mutación es la misma persona cuya sesión hay que refrescar. Para terceros, la única vía es que el propio cliente vuelva a preguntar — no existe un mecanismo de push server→cliente en esta arquitectura sin agregar websockets/SSE.

**Regla**: cualquier dato embebido en el JWT que pueda cambiar por acción de un tercero (rol, membership, y potencialmente futuros campos de Capa 2) necesita un componente cliente tipo `SessionRefresher` corriendo en el shell autenticado — no alcanza con refrescar solo en el momento de la propia mutación.

### #2 — Un F5 manual no refresca un JWT stale por sí solo

Contra la intuición, recargar la página no alcanza en estrategia JWT: el callback `jwt` sin `trigger: "update"` devuelve el token sin cambios, así que un reload común solo re-decodifica la misma cookie. Hace falta un efecto de cliente que dispare `update()` explícitamente en cada mount para que un F5 también sirva como vía de recuperación.

### #3 — `update()` de `useSession()` no es una referencia estable: no usarlo directo en deps de un efecto "solo al montar"

La primera versión de `SessionRefresher` causó un loop infinito de queries a la DB (visible como rebote continuo `/admin` ↔ `/login` en los logs de `pnpm dev`). Causa: `refresh` era un `useCallback` con deps `[update, router]`, y el efecto de montaje tenía `[refresh]` como dependencia. Cada llamada a `update()` cambia el estado interno de `SessionProvider`, lo que re-renderiza el componente con una nueva referencia de `update` → nueva referencia de `refresh` → el efecto de "solo al montar" (que dependía de esa referencia) se disparaba de nuevo → nueva llamada a `update()` → loop infinito. El guard `refreshingRef` no lo frenaba porque se limpiaba en el `finally` justo antes de que el efecto volviera a dispararse.

**Solución**: guardar `update` y `router` en refs (actualizados en un efecto separado con `[update, router]` como deps) y que `refresh` sea un `useCallback` con deps `[]`, leyendo siempre la versión más reciente desde los refs. Así `refresh` tiene una identidad verdaderamente estable entre renders, y los efectos que dependen de él (`mount`, `visibilitychange`, `interval`) se configuran una sola vez.

**Regla**: cualquier función devuelta por un hook de una librería externa (`useSession().update`, y en general cualquier `update`/`refetch`/`mutate` de hooks de terceros) debe asumirse **inestable entre renders** salvo que la documentación diga lo contrario. Si se necesita en un efecto de "ejecutar una sola vez", envolverla en un ref en vez de ponerla directamente en el array de dependencias.

### #4 — `SessionProvider` sin `session` inicial arranca en `loading: true`, y `update()` se descarta en silencio mientras tanto

`next-auth/react`'s `update()` tiene un guard `if (loading) return` — si se llama mientras el `SessionProvider` todavía está resolviendo su fetch inicial de sesión, no hace nada y resuelve `undefined`, sin lanzar ningún error ni request de red. `SessionProvider` arranca en `loading: true` salvo que reciba una `session` inicial por prop. Como los efectos de un componente hijo (`SessionRefresher`) se disparan antes que los del padre (`SessionProvider`), el `update()` del mount casi siempre corre mientras `loading` todavía es `true` si no se pasó sesión inicial — silenciosamente no hace nada, sin que nada en la app lo note (no hay excepción, no hay log, `update resolvió undefined` es la única pista).

**Regla**: todo lugar que monte `<SessionProvider>` en Server Components debe pasarle la `session` obtenida server-side (`await auth()`) como prop inicial — nunca montarlo "vacío" si hay algún componente hijo que puede necesitar `update()` inmediatamente al montar. Esto ya era el patrón correcto en `(juez)/layout.tsx`; faltaba replicarlo en `(app)/layout.tsx`.

## Verificación

1. **Caso principal**: usuario A se registra como Espectador en un distrito existente (`/onboarding` → "Unirme como espectador"). Con la sesión de A abierta en `/eventos`, un ADMIN le cambia el rol a Juez desde `/admin/miembros`. A cambia de pestaña y vuelve (dispara `visibilitychange`) — sin recargar manualmente ni volver a loguearse, A puede navegar a `/juez/eventos` y ve sus postas asignadas.

2. **F5 manual**: mismo escenario, pero en vez de cambiar de pestaña, A simplemente recarga la página con F5. El mount de `SessionRefresher` dispara el refresh y A ve el nuevo rol reflejado (ej. en el dashboard o al intentar acceder a `/juez/**`). *(Este escenario específico fue el que reveló el bug de "Cambio adicional" arriba — antes del fix de `session` inicial en `Providers`, el F5 no actualizaba nada.)*

3. **Pestaña nunca pierde foco**: si A deja el celular con la pestaña activa sin cambiar de app, el intervalo de respaldo (3 min) eventualmente refresca igual, sin intervención manual.

4. **Auto-edición sigue funcionando**: un ADMIN que se cambia su propio rol o grupo sigue viendo el cambio reflejado de inmediato (camino ya cubierto por `unstable_update` dentro de la propia action, sin depender de `SessionRefresher`).

5. **Offline**: con la app en modo avión, `SessionRefresher` no rompe nada — `refresh()` corta temprano por `!navigator.onLine`, y si `update()` falla por red inestable el error se silencia y se reintenta en el próximo trigger.

6. **`pnpm typecheck` y `pnpm lint`** pasan sin errores.
