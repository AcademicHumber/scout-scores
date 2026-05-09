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
pnpm build                  # requiere DATABASE_URL definida
```

## Stack

- **Next.js 15.x** (App Router, Server Actions) + TypeScript strict + Tailwind v4
- **Prisma 7.x** — config en `prisma.config.ts` (Prisma 7 no usa `url = env(...)` en `schema.prisma`; requiere `dotenv` en dev). El generator `prisma-client` **requiere** un driver adapter para conexiones directas: se usa `@prisma/adapter-pg` en `src/lib/db.ts` y en `prisma/seed.ts`. Importar desde `@/generated/prisma/client`, no desde `@prisma/client`.
- **PostgreSQL 16** — solo en Docker para dev; Next.js corre en el host
- **pnpm 10** — package manager; build scripts de Prisma habilitados vía `pnpm.onlyBuiltDependencies` en `package.json`
- Node 22 LTS como target (`.nvmrc`); Node 24 funciona en dev

## Convenciones críticas (vienen del master plan)

Estas reglas se establecen temprano y se respetan en todos los planes:

1. **Tenant isolation**: todo query Prisma a tablas con scope de organización lleva `where: { organizationId }`. Nunca `prisma.event.findMany()` directo en código de feature — siempre a través de un wrapper que inyecta el tenant.

2. **Naming bilingüe**: entidades del dominio scout permanecen en español en código (`Posta`, `Patrulla`, `GrupoScout`, `ScoreTemplate`). Conceptos del framework van en inglés (`User`, `Session`, `Event`, `Organization`). En UI, `Organization` se muestra como "Distrito".

3. **Server Actions sobre API routes**: mutaciones internas = Server Actions. API routes solo para webhooks (sync PWA, OAuth callbacks).

4. **Validación con Zod** en el borde de cada Server Action / API route. Tipos de Prisma adentro.

5. **IDs**: `cuid2` en todas las tablas (no autoincrement) — requerido para URLs públicas y sync offline.

6. **Puntajes**: `Decimal`, no `Float`.

7. **Copy en español**: `src/messages/es.json` es la fuente única. No hardcodear strings en componentes.

8. **`MiembroScout` ≠ `User`**: son entidades separadas. `User` = cuenta Google autenticada. `MiembroScout` = persona del dominio scout (joven o dirigente adulto), existe sin auth. Linkeo opcional vía `MiembroScout.userId?`. Ver `docs/adr/0001-arquitectura-en-capas.md`.

## Convenciones de Auth (establecidas en Plan 1)

9. **Split config de Auth.js v5**: el middleware no puede importar Prisma (Edge runtime, sin Node.js builtins). La config de auth vive en dos archivos:
   - `src/auth.config.ts` — config Edge-compatible (providers, `authorized`, `session`). Exporta `buildSession()`.
   - `src/auth.ts` — config completa (adapter Prisma, callbacks `signIn`, `jwt`, `session` vía `buildSession`).
   - El middleware importa solo `auth.config.ts`. Nunca importar `@/lib/db` o `@/auth` en `middleware.ts`.

10. **`session` callback en `authConfig`**: cualquier campo custom del JWT que el middleware necesite leer en `auth.user` debe estar mapeado en el `session` callback de `auth.config.ts`. Si solo está en `auth.ts`, el middleware no lo verá.

11. **`signOut` siempre desde el cliente**: usar `signOut` de `next-auth/react` en un Client Component (`SignOutButton`). El `signOut` de `@/auth` como inline server action falla en Next.js 15 + Turbopack.

12. **Errores de negocio en server actions**: errores esperados (slug duplicado, invitación inválida) → `return { error: string }` + `useActionState` en el componente. Errores inesperados (fallo de DB, bug) → `throw`. No mezclar ambos mecanismos.

13. **JWT refresh post-mutación**: si una server action crea o modifica memberships, llamar `unstable_update({ refreshMemberships: true })` antes del `redirect()`. El callback `jwt` re-queryea memberships cuando `trigger === 'update' && session.refreshMemberships`. Sin esto el middleware ve el JWT viejo y puede redirigir incorrectamente.

## Dominio (resumen)

El tenant es una `Organization` (= Distrito Scout). Dentro hay `GrupoScout` (persistentes) y `Patrulla` (por evento, siempre asociada a un grupo). Los roles de `User` son `ADMIN | JUEZ | ESPECTADOR | JEFE_PATRULLA`.

`MiembroScout` modela las personas del grupo: `categoria` puede ser `LOBATO | EXPLORADOR | PIONERO | ROVER | DIRIGENTE`. Es un stub en Capa 1 (sin relaciones a eventos); se profundiza en Capa 2 (planes 10–14).

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

## Convenciones de repositorios y cache (establecidas en Plan 4)

14. **Capa de repositorios**: toda interacción con DB vive en `src/repositories/`. Ningún archivo fuera de esa carpeta importa `@/lib/db` en código de feature. Excepciones documentadas y justificadas:
   - `src/auth.ts` y `src/lib/auth-onboarding.ts` — config del framework Auth.js.
   - `src/app/(auth)/onboarding/actions.ts` — flujo de bootstrap: crea la organización del usuario antes de que exista cualquier contexto de tenant. No hay repositorio de org aplicable en este punto.
   - `src/app/invite/[token]/page.tsx` — deep link pre-tenant: valida y acepta una invitación antes de que el usuario tenga membership. Igual que el onboarding, opera fuera del contexto de org.
   Ver `docs/adr/0002-repository-layer.md`.

15. **Lecturas cacheadas con `unstable_cache` + tags por organización**: formato `entidad:orgId` (ej: `memberships:org-abc`). Tags definidos en `src/repositories/cache-tags.ts`. Garantiza aislamiento entre tenants: revalidar `memberships:org-A` nunca afecta `org-B`.

16. **`revalidateTag` solo para mutaciones estructurales**: llamar `revalidateTag` solo cuando la mutación añade o elimina filas (el componente aparece o desaparece). Para mutaciones que solo actualizan valores de una fila existente (ej: cambiar rol de un miembro), **no llamar `revalidateTag`**: devolver los valores confirmados en el return de la action y actualizar el estado local del cliente desde el resultado. `revalidateTag` dispara un soft refresh que puede resetear `useState` con datos stale del Router Cache.

17. **Nunca sincronizar inputs controlados desde props vía `useEffect`**: el Router Cache puede entregar props stale antes que los datos frescos, pisando el valor recién guardado. Sincronizar exclusivamente desde el resultado de la action (`useEffect([actionState])`). Ver patrón completo en `docs/plans/04-invitaciones-memberships.md` lección #3.

18. **`forOrg()` para queries simples, `prisma.*` para queries con `include`/`select`**: `forOrg()` garantiza tenant isolation pero pierde los generic types de Prisma cuando se usa `include` o `select`. Para queries que necesiten el tipo inferido del resultado incluido, usar `prisma.*` con `where: { organizationId }` explícito.

19. **`BusinessError(code, meta?)` para errores de negocio en repositorios**: los repos lanzan `BusinessError` con un código semántico. Las actions lo capturan y convierten a `{ error: string }` para el cliente. Nunca propagar `BusinessError` sin capturar; `throw` sin catch solo para errores inesperados (fallo de DB, bug).

20. **`useActionState` con retorno `{}` no sirve para detectar éxito**: si una action no tiene datos que devolver, retornar `{ success: true }` en vez de `{}`. El estado inicial también es `{}`, así que `{}` como resultado es indistinguible del estado pre-submit. (Ver Plan 6c lección #1).

21. **`<dialog>` nativo + Tailwind requiere `m-auto` explícito**: el preflight de Tailwind v4 aplica `* { margin: 0 }` que pisa el `margin: auto` del UA stylesheet del browser, quitando el centrado automático de `<dialog showModal()>`. Siempre agregar `m-auto` al elemento `<dialog>`. (Ver Plan 6c lección #2).

22. **`useActionState` con estado React: usar dispatch directo dentro de `startTransition`**: cuando el formulario tiene estado en `useState` (no en inputs DOM), serializar ese estado en un `FormData` y llamar al dispatch directamente desde un `onClick` envuelto en `startTransition(() => dispatch(fd))`. No usar `<form action={dispatch}>` con función inline (bypasea el mecanismo de pending/state). No llamar dispatch fuera de una transition: React 19 requiere `startTransition` para que `isPending` actualice correctamente. (Ver Plan 7a lección #1).

23. **Skill de frontend design**: antes de cualquier trabajo de UI, leer y aplicar `.agents/skills/frontend-design/SKILL.md`. El skill guía hacia interfaces distintivas y production-grade. Requiere elegir una dirección estética concreta (ej: "field tool", "editorial", "brutalist") y ejecutarla con precisión. Evita la estética genérica de AI.

24. **Route groups para shells visuales independientes**: si una sección necesita su propio header/layout (ej: vista mobile del juez sin el `AppHeader` del admin), moverla a su propio route group `(seccion)/` en lugar de anidar dentro de `(app)/`. Los route groups no afectan las URLs pero sí qué layouts se aplican. Si el layout usa `SignOutButton` (que depende de `next-auth/react`), el group layout debe envolver con `<SessionProvider>` directamente. El único import que suele cambiar al mover: las Server Actions en `@/app/(grupo)/ruta/actions.ts` — actualizar en los Client Components que las importan.

25. **Patrones UX mobile validados**: touch targets `min-h-[56px]` para botones de acción y ScaleButtons, `min-h-[64px]` para cards de lista; `active:scale-[0.99]` en cards y `active:scale-95` en botones para feedback táctil; borde de color por estado en cards (`border-green-200` / `border-amber-200` / `border-gray-200`); ScaleButtons seleccionados con `scale-[1.04] shadow-md`; barra de progreso `h-1.5 rounded-full` con width dinámico en lugar de solo contador de texto; breadcrumb con back button `← Nombre` en brand color como elemento principal.

26. **`Decimal` de Prisma no se puede pasar a Client Components**: Next.js no puede serializar objetos `Decimal` al cruzar el boundary Server→Client. Convertir en el Server Component antes de pasar como prop: arrays con `.map(Number)`, valores individuales con `Number(val)` o `.toString()`.

## Documentación

Toda la planificación vive en `docs/` versionada con git:

- `docs/plans/00-master-plan.md` — visión completa, modelo de dominio, roadmap (Capa 1 + Capa 2)
- `docs/plans/01-bootstrap-infra.md` — Plan 0a, ya ejecutado
- `docs/plans/02-schema-nucleo-seed.md` — Plan 0b, ya ejecutado
- `docs/plans/03-auth-onboarding.md` — Plan 1, ya ejecutado (incluye lecciones aprendidas)
- `docs/plans/04-invitaciones-memberships.md` — Plan 4, ya ejecutado (incluye lecciones aprendidas sobre cache y repositorios)
- `docs/plans/05-plantillas.md` — Plan 5, ya ejecutado (plantillas de puntaje, criterios PUNTUABLE/DESEMPATE, doble escala)
- `docs/plans/06a-eventos.md` — Plan 6a, ya ejecutado (Evento + Actividad, máquina de estados, CRUD inline)
- `docs/plans/06b-postas-patrullas-jueces.md` — Plan 6b, ya ejecutado (Posta inline, Patrulla, gates de pre-activación, isTemplateLocked)
- `docs/plans/06c-postas-biblioteca.md` — Plan 6c, ya ejecutado (Posta standalone, AsignacionPosta, /admin/postas, dialog de asignación)
- `docs/plans/07a-scoring-juez.md` — Plan 7a, ya ejecutado (ScoreSheet, ScoreEntry, vista del juez mobile-first, gate canTransitionToCerrado)
- `docs/adr/0001-arquitectura-en-capas.md` — decisión de arquitectura en dos capas y separación `MiembroScout` / `User`
- `docs/adr/0002-repository-layer.md` — decisión de capa de repositorios con `unstable_cache` y `revalidateTag`
- `docs/adr/0003-jerarquia-evento-actividad-posta.md` — cambio de jerarquía respecto al master plan original
- `docs/README.md` — índice de todos los planes y ADRs

Antes de trabajar en cualquier plan, leer el plan correspondiente en `docs/plans/`.

## Estado actual

**Plan 0a completado** (scaffold, Prisma sin modelos, Docker, CI, layout en español).

**Plan 0b completado** (schema núcleo, migración con índice parcial en `Invitation`, wrapper `forOrg()`, seed idempotente con datos demo).

**Plan 1 completado** (Auth.js v5 con Google OAuth, onboarding multi-tenant, helpers de sesión, middleware, dashboard básico).

**Plan 3b completado** (`React.cache()` en `getCurrentUser`, `useTransition` en `DistrictSwitcher`, ref-guard en `MembershipRefresher`).

**Plan 3c completado** (Design system: tokens brand #622599, fuente Barlow, fondo auth purple, header purple, touch targets 48px mobile-first). Directrices en `docs/plans/03c-design-system.md`.

**Plan 4 completado** (Gestión de invitaciones, memberships, grupos scouts y perfil del distrito — layout `/admin`, CRUD completo, deep link `/invite/[token]`, regla del último ADMIN, audit log).

**Plan 5 completado** (Plantillas de puntaje — `/admin/plantillas`, ScoreTemplate + TemplateCriterion, modos CRITERIOS/PUNTAJE_UNICO, escalas discretas con escala secundaria opcional para criterios DESEMPATE, archivado, duplicación, audit log).

**Plan 6a completado** (Eventos y ciclo de vida — `/admin/eventos`, Evento + Actividad con peso porcentual, máquina de estados BORRADOR→ACTIVO→CERRADO→PUBLICADO, CRUD inline de actividades con reordenamiento, ADR-0003 abierto para jerarquía Evento→Actividad→Posta).

**Plan 6b completado** (Postas y Patrullas — `Posta` dentro de actividades con plantilla y juez asignables, `Patrulla` por evento con grupo scout, gates ampliados de pre-activación con acumulación de errores, `isTemplateLocked` activado, CRUD inline en `/admin/eventos/[id]`, audit log).

**Plan 6c completado** (Postas como biblioteca reutilizable — `Posta` standalone con `organizationId` y `materiales` JSON, `AsignacionPosta` join table con datos por uso (juez, encargado, ayudantes, weight), CRUD en `/admin/postas` con historial de eventos, dialog de asignación en `/admin/eventos/[id]`, validación de unicidad por evento).

**Plan 7a completado** (Scoring online y vista del juez — `ScoreSheet` + `ScoreEntry` con totales cacheados, `isEventoLocked` activado, gate `canTransitionToCerrado`, rutas `/juez/*` mobile-first con formulario de criterios y puntaje único, vista admin `/admin/eventos/[id]/planillas` con reapertura de planillas, AuditLog).

**Próximo: Plan 7b** — Sync offline / PWA (ScoreSheetRevision, service worker).
