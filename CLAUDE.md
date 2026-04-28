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

## Documentación

Toda la planificación vive en `docs/` versionada con git:

- `docs/plans/00-master-plan.md` — visión completa, modelo de dominio, roadmap (Capa 1 + Capa 2)
- `docs/plans/01-bootstrap-infra.md` — Plan 0a, ya ejecutado
- `docs/plans/02-schema-nucleo-seed.md` — Plan 0b, ya ejecutado
- `docs/plans/03-auth-onboarding.md` — Plan 1, ya ejecutado (incluye lecciones aprendidas)
- `docs/adr/0001-arquitectura-en-capas.md` — decisión de arquitectura en dos capas y separación `MiembroScout` / `User`
- `docs/README.md` — índice de todos los planes y ADRs

Antes de trabajar en cualquier plan, leer el plan correspondiente en `docs/plans/`.

## Estado actual

**Plan 0a completado** (scaffold, Prisma sin modelos, Docker, CI, layout en español).

**Plan 0b completado** (schema núcleo, migración con índice parcial en `Invitation`, wrapper `forOrg()`, seed idempotente con datos demo).

**Plan 1 completado** (Auth.js v5 con Google OAuth, onboarding multi-tenant, helpers de sesión, middleware, dashboard básico).

**Próximo: Plan 2** — CRUD de invitaciones y gestión de memberships.
