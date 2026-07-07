# puntajes-scout

Sistema web multi-tenant en dos capas: **Capa 1** (MVP) scoring de eventos scouts; **Capa 2** (post-MVP) padrón de miembros, inscripción digitalizada y cartilla de progresión. Material educativo de desarrollo asistido por IA: toda la planificación vive versionada en `docs/plans/`.

## Comandos de desarrollo

```bash
pnpm install
cp .env.example .env        # DATABASE_URL apunta al Postgres local
docker compose up -d db     # Postgres 16 en localhost:5432
pnpm dev                    # Next.js en localhost:3000
pnpm typecheck              # tsc --noEmit
pnpm lint                   # next lint (next lint → eslint vía FlatCompat)
pnpm test                   # vitest run — los tests de repositorios usan la DB de Docker
pnpm build                  # requiere DATABASE_URL definida
```

## Stack

- **Next.js 15.x** (App Router, Server Actions) + TypeScript strict + Tailwind v4
- **Prisma 7.x** — config en `prisma.config.ts` (Prisma 7 no usa `url = env(...)` en `schema.prisma`; requiere `dotenv` en dev). El generator `prisma-client` **requiere** un driver adapter para conexiones directas: se usa `@prisma/adapter-pg` en `src/lib/db.ts` y en `prisma/seed.ts`. Importar desde `@/generated/prisma/client`, no desde `@prisma/client`.
- **PostgreSQL 16** — solo en Docker para dev; Next.js corre en el host
- **pnpm 10** — package manager; build scripts de Prisma habilitados vía `pnpm.onlyBuiltDependencies` en `package.json`
- Node 22 LTS como target (`.nvmrc`); Node 24 funciona en dev

## Dominio (resumen)

El tenant es una `Organization` (= Distrito Scout). Dentro hay `GrupoScout` (persistentes) y `Patrulla` (por evento, siempre asociada a un grupo). Los roles de `User` son `ADMIN | JUEZ | ESPECTADOR | JEFE_PATRULLA`.

`MiembroScout` modela las personas del grupo: `categoria` puede ser `LOBATO | EXPLORADOR | PIONERO | ROVER | DIRIGENTE`. Es un stub en Capa 1 (sin relaciones a eventos); se profundiza en Capa 2 (roadmap y numeración tentativa en `docs/README.md`).

El scoring: criterios `PUNTUABLE` suman al total; criterios `DESEMPATE` (ej: espíritu scout) solo se usan para romper empates. Ver `docs/plans/00-master-plan.md` para el modelo completo.

## Workflow de sesiones (regla de proceso)

**Planear con Opus, ejecutar con Sonnet.**

- Cada sub-plan se redacta con `/model Opus` en plan mode.
- Una vez aprobado el plan, cambiar a `/model Sonnet` para ejecutarlo.
- Si durante la ejecución surge una decisión arquitectónica, pausar, volver a Opus, decidir, y retomar con Sonnet.

**Los escenarios de verificación son el criterio de done.**

- Cada plan incluye una sección "Verificación" con escenarios manuales end-to-end. Esos escenarios son el punto de confirmación final: un plan no está completo hasta que se hayan revisado todos sus escenarios y se haya confirmado que el código los cubre.
- Al ejecutar un plan, antes de hacer el commit de documentación final, revisar cada escenario contra la implementación real: verificar que el flujo descrito es posible, que los errores esperados se capturan, que los mensajes son correctos y que no hay casos borde no manejados.
- Si un escenario revela una discrepancia (bug, mensaje incorrecto, caso no cubierto), corregirlo en ese momento e incluirlo en el mismo commit o en uno de fix inmediato. No diferirlo a otro plan salvo que sea trabajo nuevo fuera del alcance.

**Las lecciones aprendidas se destilan.**

- Cada plan cierra con una sección de lecciones; las que son reglas permanentes se promueven a convención numerada. La numeración es global, estable y nunca se reusa — los planes citan convenciones por número.

**Criterio de partición de convenciones.**

- Una convención vive en un `CLAUDE.md` anidado (hoy solo `src/lib/offline/CLAUDE.md`) **solo si su trigger es exclusivamente editar archivos de ese subsistema**. Si el trigger es un tipo de tarea que puede ocurrir en cualquier parte del código (mutaciones, cache, serialización, tooling), vive en este archivo raíz — la regla que no está en contexto no protege.

## Convenciones

Agrupadas por tema. La numeración es histórica (orden de descubrimiento), no posicional: **nunca renumerar ni reusar números**. Las convenciones #27–36 y #50 (subsistema offline del juez) viven en `src/lib/offline/CLAUDE.md`; ver su resumen al final de esta sección.

Las marcadas con ⚠ son invariantes de seguridad o integridad de datos: violarlas es blocker automático en review. Las que describen workarounds de bugs de versiones concretas (#11, #21, #31–32, #49, entre otras) caducan con un upgrade de la dependencia: re-verificarlas al subirla (guía de upgrades en `docs/best-practices.md`).

### Fundamentos (vienen del master plan)

1. ⚠ **Tenant isolation**: todo query Prisma a tablas con scope de organización lleva `where: { organizationId }`. Nunca `prisma.event.findMany()` directo en código de feature — siempre a través de un wrapper que inyecta el tenant.

2. **Naming bilingüe**: entidades del dominio scout permanecen en español en código (`Posta`, `Patrulla`, `GrupoScout`, `ScoreTemplate`). Conceptos del framework van en inglés (`User`, `Session`, `Event`, `Organization`). En UI, `Organization` se muestra como "Distrito".

3. **Server Actions sobre API routes**: mutaciones internas = Server Actions. API routes solo para webhooks (sync PWA, OAuth callbacks).

4. **Validación con Zod** en el borde de cada Server Action / API route. Tipos de Prisma adentro.

5. **IDs**: `cuid2` en todas las tablas (no autoincrement) — requerido para URLs públicas y sync offline.

6. ⚠ **Puntajes**: `Decimal`, no `Float`.

7. **Copy en español**: `src/messages/es.json` es la fuente única. No hardcodear strings en componentes.

8. **`MiembroScout` ≠ `User`**: son entidades separadas. `User` = cuenta Google autenticada. `MiembroScout` = persona del dominio scout (joven o dirigente adulto), existe sin auth. Linkeo opcional vía `MiembroScout.userId?`. Ver `docs/adr/0001-arquitectura-en-capas.md`.

### Modelo de dominio

51. **`ScoreTemplate` se asigna a `Actividad`, no a `Posta`**: todas las postas asignadas a una misma actividad comparten un único template — el criterio de puntaje se define al crear la actividad, no por posta individual. `Posta` conserva en cambio `criteriosDescripciones` (Json, forma `{ criterios?: { [criterionId]: { [valor]: texto } }, unico?: { [valor]: texto } }`): la leyenda de qué significa cada valor de la escala para esa posta puntual (ej. "10 = llegó primero"), editable desde `/admin/postas/[id]` una vez que la posta tiene alguna asignación. Es intrínseca a la posta, no a la asignación, para no tener que recargarla cada vez que se reusa la posta en otro evento; si se reusa con un template distinto, las claves viejas quedan huérfanas (se ignoran al renderizar) en vez de romper algo. (Ver Plan 15).

52. ⚠ **Migración de un campo entre dos modelos con datos ya existentes: diagnóstico previo, no backfill ciego**: cuando un cambio de schema estrecha una invariante que antes era más laxa (ej: "cada posta con template propio" → "cada actividad con un único template compartido"), correr primero una query de solo lectura que detecte los casos que el modelo viejo permitía pero el nuevo no (ej: una actividad con posciones que usaban templates distintos). Backfillear automáticamente solo los casos sin conflicto; dejar en `null` los conflictivos para resolución manual — nunca resolver el conflicto arbitrariamente en el backfill. (Ver Plan 15 — encontró 2 conflictos reales en la app corriendo, uno en un evento ya `ACTIVO`).

### Repositorios, cache y revalidación (establecidas en Plan 4; ver ADR-0002)

14. ⚠ **Capa de repositorios**: toda interacción con DB vive en `src/repositories/`. Ningún archivo fuera de esa carpeta importa `@/lib/db` en código de feature. Excepciones documentadas y justificadas:
   - `src/auth.ts` y `src/lib/auth-onboarding.ts` — config del framework Auth.js.
   - `src/app/(auth)/onboarding/actions.ts` — flujo de bootstrap: crea la organización del usuario antes de que exista cualquier contexto de tenant. No hay repositorio de org aplicable en este punto.
   - `src/app/invite/[token]/page.tsx` — deep link pre-tenant: valida y acepta una invitación antes de que el usuario tenga membership. Igual que el onboarding, opera fuera del contexto de org.
   - `src/app/(auth)/onboarding/page.tsx` — mismo flujo de bootstrap: lista todas las organizaciones (cross-tenant por diseño) para "unirme como espectador"; no hay contexto de tenant aplicable.
   - `src/app/api/health/route.ts` — health check de infraestructura: `SELECT 1`, sin datos de dominio ni tenant.
   - `src/app/api/juez/sync/route.ts` — las mutaciones de dominio van por repos; el acceso directo es solo a `SyncOpLog`, tabla de infraestructura de idempotencia (keyed por `clientOpId`), no una entidad de dominio con scope de org.
   - `src/app/(app)/perfil/seguridad/actions.ts` — la mutación va por `auth.repo.ts` (`setUserPasswordIfNull`); solo el `AuditLog` post-mutación se escribe directo. Candidato a mover esa escritura al repo.
   Esta lista es la fuente canónica de excepciones; mantenerla al día al agregar una nueva. Ver `docs/adr/0002-repository-layer.md` para el racional de la decisión.

15. **Lecturas cacheadas con `unstable_cache` + tags por organización**: formato `entidad:orgId` (ej: `memberships:org-abc`). Tags definidos en `src/repositories/cache-tags.ts`. Garantiza aislamiento entre tenants: revalidar `memberships:org-A` nunca afecta `org-B`.

16. **`revalidateTag` solo para mutaciones estructurales**: llamar `revalidateTag` solo cuando la mutación añade o elimina filas (el componente aparece o desaparece). Para mutaciones que solo actualizan valores de una fila existente (ej: cambiar rol de un miembro), **no llamar `revalidateTag`**: devolver los valores confirmados en el return de la action y actualizar el estado local del cliente desde el resultado. `revalidateTag` dispara un soft refresh que puede resetear `useState` con datos stale del Router Cache.

17. **Nunca sincronizar inputs controlados desde props vía `useEffect`**: el Router Cache puede entregar props stale antes que los datos frescos, pisando el valor recién guardado. Sincronizar exclusivamente desde el resultado de la action (`useEffect([actionState])`). Ver patrón completo en `docs/plans/04-invitaciones-memberships.md` lección #3.

18. **`forOrg()` para queries simples, `prisma.*` para queries con `include`/`select`**: `forOrg()` garantiza tenant isolation pero pierde los generic types de Prisma cuando se usa `include` o `select`. Para queries que necesiten el tipo inferido del resultado incluido, usar `prisma.*` con `where: { organizationId }` explícito.

19. **`BusinessError(code, meta?)` para errores de negocio en repositorios**: los repos lanzan `BusinessError` con un código semántico. Las actions lo capturan y convierten a `{ error: string }` para el cliente. Nunca propagar `BusinessError` sin capturar; `throw` sin catch solo para errores inesperados (fallo de DB, bug).

41. ⚠ **Al agregar un `unstable_cache` con tag nuevo, auditar todas las mutaciones relacionadas**: el compilador no detecta que una mutación omitió un `revalidateTag`. Al crear un nuevo cache con un tag (ej: `leaderboard:orgId`), revisar todos los repos que escriben los datos que ese cache lee y agregar el `revalidateTag` correspondiente. Una mutación que solo invalida `scoreSheets:orgId` pero no `leaderboard:orgId` deja el leaderboard stale aunque la DB cambió. (Ver Plan 8 lección #8).

53. **Al agregar un consumidor nuevo a una query cacheada existente, auditar si el `select`/`include` alcanza**: `findEventoById` ya traía `actividades → template (modo, criterios)` para el badge admin de "leyenda incompleta", pero el nuevo editor de leyenda del juez (Plan 16) necesita además `valoresValidos`, `valoresValidosDesempate` y `criterios.nombre` — campos que el select original omitía por no hacer falta para su primer consumidor. Ensanchar un `select` con campos adicionales es seguro para los consumidores existentes (TypeScript estructural: un objeto con más campos sigue siendo asignable a un tipo que pide menos), pero hay que revisarlo explícitamente en vez de asumir que "ya trae todo lo necesario" solo porque un consumidor previo funcionaba. (Ver Plan 16).

### Auth y sesión (establecidas en Planes 1, 8, 13b y 13c)

9. **Split config de Auth.js v5**: el middleware no puede importar Prisma (Edge runtime, sin Node.js builtins). La config de auth vive en dos archivos:
   - `src/auth.config.ts` — config Edge-compatible (providers, `authorized`, `session`). Exporta `buildSession()`.
   - `src/auth.ts` — config completa (adapter Prisma, callbacks `signIn`, `jwt`, `session` vía `buildSession`).
   - El middleware importa solo `auth.config.ts`. Nunca importar `@/lib/db` o `@/auth` en `middleware.ts`.

10. **`session` callback en `authConfig`**: cualquier campo custom del JWT que el middleware necesite leer en `auth.user` debe estar mapeado en el `session` callback de `auth.config.ts`. Si solo está en `auth.ts`, el middleware no lo verá.

11. **`signOut` siempre desde el cliente**: usar `signOut` de `next-auth/react` en un Client Component (`SignOutButton`). El `signOut` de `@/auth` como inline server action falla en Next.js 15 + Turbopack.

13. **JWT refresh post-mutación**: si una server action crea o modifica memberships, llamar `unstable_update({ refreshMemberships: true })` antes del `redirect()`. El callback `jwt` re-queryea memberships cuando `trigger === 'update' && session.refreshMemberships`. Sin esto el middleware ve el JWT viejo y puede redirigir incorrectamente.

39. ⚠ **Rutas públicas (sin auth) deben estar en `PUBLIC_PATHS` del middleware**: el middleware Auth.js en `src/auth.config.ts` define `PUBLIC_PATHS` — cualquier ruta nueva que no requiera autenticación debe agregarse explícitamente. No hay detección automática. Si falta, usuarios sin sesión son redirigidos a `/login` incluso en rutas pensadas para el público general. (Ver Plan 8 lección #6).

45. **`SessionRefresher` para propagar cambios de rol hechos por otro usuario**: en estrategia JWT, el rol/membership vive embebido en la cookie del propio usuario y solo se refresca cuando SU navegador dispara `unstable_update()` — el servidor no puede empujar la actualización a la sesión de otro cliente. Cuando un ADMIN cambia el rol de otra persona, esa persona queda con el JWT viejo (ni un F5 manual alcanza, porque el callback `jwt` sin `trigger: "update"` no vuelve a consultar la DB) hasta volver a loguearse. Solución: `src/components/auth/SessionRefresher.tsx`, montado en los layouts `(app)` y `(juez)`, dispara `update({ refreshMemberships: true })` al montar, al recuperar foco de pestaña (`visibilitychange`) y cada 3 min como respaldo — mismo patrón de triggers que `useSyncEngine` (convención #33, en `src/lib/offline/CLAUDE.md`). Reemplaza al anterior `MembershipRefresher` de un solo uso. (Ver Plan 13b).

46. **`update`/`refetch`/`mutate` de hooks externos no son referencias estables entre renders**: `useSession().update` cambia de identidad cada vez que se llama (actualiza el estado del `SessionProvider` → re-render → nueva función). Usarla directo en el array de deps de un `useCallback`/`useEffect` pensado para "ejecutar una sola vez" genera un loop infinito: la llamada cambia la identidad, el efecto que depende de ella se vuelve a disparar, y así indefinidamente (pasó en la v1 de `SessionRefresher`, visible como rebote infinito `/admin`↔`/login` en los logs de Prisma). Solución: guardar la función en un `useRef` (actualizado en un efecto separado) y que el callback que la usa tenga deps `[]`, leyendo siempre la versión más reciente desde el ref. (Ver Plan 13b lección #3).

47. **`authorized()` del middleware debe dejar pasar las Server Actions sin aplicar reglas de navegación**: el middleware corre sobre *todas* las requests, incluido el POST que dispara una Server Action — detectable por el header `next-action`. Las reglas de redirect basadas en la URL (ej: mandar a `/onboarding` si no hay membership) están pensadas para navegaciones `GET`, no para acciones: si el `canonicalUrl` del router del cliente quedó desincronizado (ver convención #48), el middleware puede interceptar el POST de una action y devolver un redirect HTTP crudo en vez del mecanismo interno de Next (`x-action-redirect`), rompiendo la respuesta con "An unexpected response was received from the server". Antes de agregar una regla de redirect a `authorized()`, preguntarse si es un gate de seguridad (debe aplicar siempre, ej: `!auth?.user`) o una guía de navegación (excluir con `if (request.headers.has("next-action")) return true`). (Ver Plan 13c).

48. **Cadenas de redirect anidados pueden desincronizar el `canonicalUrl` del router de Next.js**: si un `redirect()`/`signIn({ redirectTo })` apunta a una ruta cuyo layout inmediatamente redirige de nuevo (ej: `/dashboard` → `/onboarding` si no hay membership), la navegación visible en el browser termina en el destino correcto, pero el estado interno del App Router usado para construir la URL de futuras Server Actions puede quedar apuntando al destino intermedio. Cuando se conoce de antemano el estado que determinará el segundo salto (ej: una cuenta recién creada siempre tiene cero memberships), redirigir directo al destino final evita el rebote y este desync. (Ver Plan 13c lección #2).

49. **`<SessionProvider>` sin `session` inicial arranca en `loading: true`, y `update()` se descarta en silencio mientras tanto**: `next-auth/react`'s `update()` tiene un guard `if (loading) return` — si un componente hijo (ej: `SessionRefresher`) llama `update()` en su efecto de montaje, y ese efecto corre antes que el efecto interno de `SessionProvider` que resuelve el fetch inicial (los efectos de hijos se disparan antes que los del padre), la llamada no hace nada y resuelve `undefined` sin ningún error visible. Pasa siempre que `<SessionProvider>` se monte sin pasarle la `session` obtenida server-side (`await auth()`) como prop — con `session` inicial, arranca en `loading: false` desde el principio. Todo layout que monte `SessionProvider` en un Server Component y tenga hijos que puedan llamar `update()` al montar debe pasarle esa prop. (Ver Plan 13b lección #4).

### Server Actions, formularios y UI

12. **Errores de negocio en server actions**: errores esperados (slug duplicado, invitación inválida) → `return { error: string }` + `useActionState` en el componente. Errores inesperados (fallo de DB, bug) → `throw`. No mezclar ambos mecanismos.

20. **`useActionState` con retorno `{}` no sirve para detectar éxito**: si una action no tiene datos que devolver, retornar `{ success: true }` en vez de `{}`. El estado inicial también es `{}`, así que `{}` como resultado es indistinguible del estado pre-submit. (Ver Plan 6c lección #1).

21. **`<dialog>` nativo + Tailwind requiere `m-auto` explícito**: el preflight de Tailwind v4 aplica `* { margin: 0 }` que pisa el `margin: auto` del UA stylesheet del browser, quitando el centrado automático de `<dialog showModal()>`. Siempre agregar `m-auto` al elemento `<dialog>`. (Ver Plan 6c lección #2).

22. **`useActionState` con estado React: usar dispatch directo dentro de `startTransition`**: cuando el formulario tiene estado en `useState` (no en inputs DOM), serializar ese estado en un `FormData` y llamar al dispatch directamente desde un `onClick` envuelto en `startTransition(() => dispatch(fd))`. No usar `<form action={dispatch}>` con función inline (bypasea el mecanismo de pending/state). No llamar dispatch fuera de una transition: React 19 requiere `startTransition` para que `isPending` actualice correctamente. (Ver Plan 7a lección #1).

23. **Skill de frontend design**: antes de cualquier trabajo de UI, leer y aplicar `.agents/skills/frontend-design/SKILL.md`. El skill guía hacia interfaces distintivas y production-grade. Requiere elegir una dirección estética concreta (ej: "field tool", "editorial", "brutalist") y ejecutarla con precisión. Evita la estética genérica de AI.

24. **Route groups para shells visuales independientes**: si una sección necesita su propio header/layout (ej: vista mobile del juez sin el `AppHeader` del admin), moverla a su propio route group `(seccion)/` en lugar de anidar dentro de `(app)/`. Los route groups no afectan las URLs pero sí qué layouts se aplican. Si el layout usa `SignOutButton` (que depende de `next-auth/react`), el group layout debe envolver con `<SessionProvider>` directamente. El único import que suele cambiar al mover: las Server Actions en `@/app/(grupo)/ruta/actions.ts` — actualizar en los Client Components que las importan.

25. **Patrones UX mobile validados**: touch targets `min-h-[56px]` para botones de acción y ScaleButtons, `min-h-[64px]` para cards de lista; `active:scale-[0.99]` en cards y `active:scale-95` en botones para feedback táctil; borde de color por estado en cards (`border-green-200` / `border-amber-200` / `border-gray-200`); ScaleButtons seleccionados con `scale-[1.04] shadow-md`; barra de progreso `h-1.5 rounded-full` con width dinámico en lugar de solo contador de texto; breadcrumb con back button `← Nombre` en brand color como elemento principal.

26. **`Decimal` de Prisma no se puede pasar a Client Components**: Next.js no puede serializar objetos `Decimal` al cruzar el boundary Server→Client. Convertir en el Server Component antes de pasar como prop: arrays con `.map(Number)`, valores individuales con `Number(val)` o `.toString()`.

40. **Route group layouts no pueden ser root layouts cuando existe `app/layout.tsx`**: en Next.js App Router, `app/layout.tsx` es siempre el root absoluto. Un layout dentro de un route group (ej: `(public)/layout.tsx`) queda anidado dentro — nunca lo reemplaza. Poner `<html><body>` en ambos genera HTML inválido y hydration mismatch. El layout del route group debe ser un passthrough (`<>{children}</>`) o un wrapper sin etiquetas de documento. (Ver Plan 8 lección #3).

42. **En layouts de card con dos acciones, usar dos `<form>` hermanas, no anidadas**: cuando una row/card tiene una action de "guardar" y otra de "quitar" en el mismo bloque visual, nunca anidar un `<form>` dentro de otro — es HTML inválido (browsers ignoran la form interna). El patrón correcto: los selects/inputs son controlados puros (sin `name`); la update form lleva hidden inputs con los valores del state; la remove form es una `<form>` hermana. Ambas forms pueden estar side-by-side en un div flex. (Ver Plan 12 lección #1).

43. **Menú hamburger: Server Component pasa datos de usuario a Client Component `MobileMenu`**: el `AppHeader` (Server Component async) fetcha el usuario y pasa `name`, `email`, `image`, `isAdmin`, `isJuez` como props al Client Component `MobileMenu`. El drawer usa `translate-x-full` / `translate-x-0` siempre renderizado para que la animación de salida funcione. La prop `alwaysVisible` elimina `sm:hidden` del botón para contextos donde el drawer debe mostrarse en cualquier tamaño (ej: layout del juez).

44. **`<select>` deshabilitado en Server Component → Client Component con `useSearchParams`**: cuando un filtro `<select>` vive en una página `async` (Server Component), no puede tener `onChange`. La solución es un pequeño Client Component que recibe `value` y `options` como props, y en `onChange` llama `router.push` con `new URLSearchParams(searchParams.toString())` — preservando los demás filtros activos en la URL. No usar `disabled` como placeholder: o se implementa o se elimina el control.

54. **Componentes de formulario con Server Actions inyectadas como props, no importadas**: `PostaDetailForm` originalmente importaba `updatePostaAction`/`deletePostaAction` directo desde `admin/postas/[id]/actions.ts`, acoplándolo a ese único caller. Cuando Plan 16 necesitó el mismo formulario para el flujo del juez (`/eventos/postas/[id]`, con sus propias actions que resuelven `actorRole` distinto), se cambió a recibir `updateAction`/`deleteAction` como props tipadas contra los `State` exportados por el módulo admin — Next.js serializa Server Actions pasadas como prop de Server a Client Component sin problema. Cada página (admin o juez) importa y liga su propia action; el componente de UI queda agnóstico de quién lo llama. Patrón a repetir: si un componente de formulario con `useActionState` se necesita desde un segundo contexto de rol, genericizar las actions como props en vez de duplicar el componente.

### Entorno y tooling (Windows / build)

37. **`Remove-Item` en PowerShell falla silenciosamente en rutas con `[` y `]`**: PowerShell interpreta los corchetes como glob wildcards. `Remove-Item "...\[param]\page.tsx"` no hace nada (sin error, sin borrado). Usar siempre `-LiteralPath` para paths que contengan corchetes en Next.js App Router (`[param]`, `[[...slug]]`). Aplica a `Move-Item`, `Copy-Item`, `Get-Item` y cualquier cmdlet que tome paths. (Ver Plan 7d lección #1).

38. **`pnpm typecheck` falla tras eliminar páginas hasta limpiar `.next/types/`**: TypeScript cachea los tipos generados en `.next/types/app/**/page.ts`. Al eliminar un `page.tsx`, ese archivo de tipos queda y hace fallar `tsc --noEmit` con `Cannot find module`. Solución: `rm -rf .next/types` antes de correr typecheck tras cualquier eliminación de rutas. `pnpm build` regenera el directorio automáticamente. (Ver Plan 7d lección #2).

### Offline PWA del juez (convenciones #27–36 y #50)

Las convenciones del subsistema offline viven en **`src/lib/offline/CLAUDE.md`** (se carga automáticamente al trabajar en ese directorio; `src/app/(juez)/` y `src/components/juez/` tienen punteros). **Antes de tocar `/juez/**`, `src/components/juez/`, `src/app/sw.ts` o `src/lib/offline/`, leer ese archivo y el ADR-0004 completo.** Invariantes que todo el mundo debe conocer aunque no trabaje ahí:

- ⚠ Dentro de `/juez/**`, `router.push()`/`router.replace()` de Next.js **no navegan el SPA** — solo `useJuezRouter().navigate()` o `JuezLink` (#50).
- ⚠ Toda mutación nueva sobre `ScoreSheet` debe bumpear `version`, o la detección de conflictos offline queda ciega a ella.
- Las rutas `/juez/**` solo funcionan offline si el Service Worker las cacheó en una visita previa (#30) — limitación aceptada y documentada, no un bug.

## Documentación

Toda la planificación vive versionada en `docs/`:

- `docs/README.md` — **índice único** de planes y ADRs. No duplicar listas de planes en otros documentos (incluido este): el drift entre copias ya causó documentación falsa una vez.
- `docs/adr/` — decisiones de arquitectura (capas, repositorios, jerarquía de eventos, offline). Leer el ADR del área antes de tocarla.
- `docs/best-practices.md` — best practices organizadas por tema, caveats comunes y raros, guía de upgrades de dependencias y checklist de cierre de features.
- `docs/operaciones/` — guías de deploy, actualización y CD (flujo con Coolify desde el Plan 14).

Antes de trabajar en cualquier plan, leer el plan correspondiente en `docs/plans/`.

## Estado actual

**Capa 1 (scoring) completa: planes 0a–16 ejecutados.** El detalle de cada plan está en su documento (índice en `docs/README.md`). Hitos estructurales: multi-tenant con Auth.js v5 (Google + credenciales con lockout), CRUD de eventos/actividades/postas/patrullas con máquina de estados BORRADOR→ACTIVO→CERRADO→PUBLICADO, scoring del juez como PWA offline (ADR-0004), leaderboard con snapshot y vistas públicas por token, deploy productivo con Docker standalone + Coolify (Plan 14), documentación pública en `/docs`. 137 tests.

Últimos planes ejecutados (contexto inmediato):

**Plan 15 completado** (Mover `ScoreTemplate` de `Posta` a `Actividad` + leyenda de puntajes — migración con diagnóstico previo de conflictos y backfill (2 actividades reales quedaron sin plantilla por conflicto, resueltas reestructurando el seed); gate `ACTIVIDAD_SIN_PLANTILLA` reemplaza a `POSTA_SIN_PLANTILLA`; `isTemplateLocked` cuenta `Actividad`; selector de template movido a `ActividadRow`/`AddActividadForm`; nuevo campo `Posta.criteriosDescripciones` con editor `CriteriosDescripcionesForm` en `/admin/postas/[id]` y visualización en `ScoreSheetForm` para el juez; seed y docs públicas (`/docs/administrador`, `/docs/juez`) actualizados; 10 tests nuevos, 125 en total.)

**Plan 16 completado** (Postas creadas por jueces — `Posta.creadoPorUserId` (nullable, `SetNull`) para registrar quién la cargó; `crearPostaYAsignar` en `posta.repo.ts` crea la `Posta` y la `AsignacionPosta` en una única transacción atómica (evita el estado intermedio "posta huérfana sin asignar"); `updatePosta`/`deletePosta` ganan `actorRole` y devuelven `POSTA_NO_PROPIA` si un `JUEZ` intenta tocar la posta de otro; `asignarPosta` agrega `.catch` de `P2002` como red de seguridad contra la carrera de asignación concurrente; hook `useOnlineStatus()` nuevo, aplicado al único cambio permitido dentro del SPA offline (`EventosListView`, link "Ver eventos publicados" deshabilitado sin red); `/eventos` suma la sección "Eventos en planificación" (`BORRADOR`) para `JUEZ`/`ADMIN`; nueva ruta `/eventos/[id]/postas` con `CrearPostaDialog` (autocomplete de postas existentes por nombre + leyenda de puntajes inline en el mismo submit); tras revisar el escenario de verificación de ownership, se agregó además `/eventos/postas` y `/eventos/postas/[id]` — vista mínima "mis postas" para que un `JUEZ` edite/borre sus propias postas, reusando `PostaDetailForm` genericizado (ver convención #54); 12 tests nuevos, 137 en total. Lecciones: convenciones #53 y #54.)

**Próximo: Capa 2 — Padrón de miembros, inscripción, cartilla de progresión (planes 17–21 tentativos, ver `docs/README.md`).**
