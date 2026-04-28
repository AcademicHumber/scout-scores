# Plan 1 — Auth con Google OAuth + onboarding multi-tenant

> **Nota de plan mode**: este archivo se redacta en `~/.claude/plans/zazzy-twirling-pond.md` mientras está en plan mode. Apenas se apruebe, el primer paso de ejecución será **moverlo / volcar su contenido a `docs/plans/03-auth-onboarding.md`** dentro del repo, siguiendo la regla de documentación del master plan (todos los planes viven versionados en el repositorio).

---

## Contexto

Plan 0b dejó el schema núcleo y el seed listos, con tablas `User / Account / Session / VerificationToken` shape-compatibles con Auth.js v5 y `Membership / Invitation / Organization` para el modelo multi-tenant. La DB tiene datos demo (1 distrito, 4 users, 2 invitaciones pendientes), pero **ninguno de esos `User` está conectado a una cuenta real de Google**: la única forma de loguearse hoy es no logueando — toda la app sigue siendo pública.

Plan 1 cierra el bucle: integra Auth.js v5 con Google como único proveedor, define el flujo de **primer login** (crear Distrito o aceptar invitación), persiste un `activeOrganizationId` y un `role` en cada sesión, y entrega los helpers (`requireRole`, `getCurrentOrg`, `getCurrentUser`) que TODOS los planes posteriores (2 en adelante) van a consumir para tenant isolation y autorización.

Es un plan **arquitectónicamente crítico**: si el modelo de sesión se hace mal acá, hay que rehacerlo en cascada. Por eso este plan también incluye, como Paso 0, el setup mínimo de Vitest — para que los helpers de auth tengan red de seguridad desde el primer commit.

---

## Alcance

### Incluye

- Setup mínimo de Vitest (config, helper de mock de sesión, smoke test).
- Auth.js v5 (`next-auth@beta`) configurado con Google OAuth como único proveedor.
- `@auth/prisma-adapter` oficial integrado con el `PrismaClient` ya construido en `src/lib/db.ts` (con fallback documentado a custom adapter si hay incompatibilidad con Prisma 7).
- Estrategia de sesión **JWT** con callbacks `signIn / jwt / session` que cargan `memberships[]`, `activeOrganizationId`, `role` y `grupoScoutId`.
- Auto-aceptación de invitaciones `PENDING` que coincidan por email en el primer login (transacción atómica + audit log).
- Página de login (`/login`) con botón "Iniciar sesión con Google".
- Página de onboarding (`/onboarding`) con dos paths explícitos: **crear nuevo Distrito** o **pegar código de invitación**.
- Server actions `createDistrito` y `aceptarInvitacion`, ambas con validación Zod.
- Layout protegido (`/(app)/...`) con header que muestra nombre del user, avatar y botón cerrar sesión.
- Selector de Distrito en el header cuando el user tiene >1 membership (sólo se renderiza si aplica).
- Middleware Next.js que protege todo lo que no sea `/login`, `/onboarding`, `/api/auth/*` y assets estáticos.
- Helpers `getCurrentUser()`, `getCurrentOrg()`, `requireRole(roles)`, `requireOrg()` en `src/lib/auth-helpers.ts`.
- Augmentation de tipos para `Session` y `JWT` (`src/types/next-auth.d.ts`).
- Copy en español en `src/messages/es.json` (namespace `auth`).
- Tests Vitest para los helpers de auth (puros, con mock de `auth()`).

### NO incluye

- CRUD de invitaciones (crear / revocar / listar) — eso es Plan 2.
- Cambio de rol post-onboarding o expulsar miembros — Plan 2.
- Edición de datos del Distrito (nombre, slug) — Plan 2.
- Recuperar acceso si perdiste tu cuenta de Google — fuera de alcance MVP.
- Magic links, passkeys, email/password — Auth.js soporta esto, pero el master plan ya decidió Google como único proveedor.
- Auth offline para el juez — Plan 5b.
- Tests E2E con Playwright — Vitest acá es sólo unit/integration de helpers; el E2E llega cuando haya features con UI rica.
- Logging estructurado / observabilidad — Plan 9.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **Auth.js v5** (`next-auth@beta`) con Google OAuth | NextAuth v4, Lucia, Clerk | Master plan ya lo fijó. v5 tiene API `auth()` universal (server components, server actions, route handlers, middleware) que encaja con App Router. |
| 2 | **Strategy `jwt`** para sesión | `database` strategy persistida en `Session` | JWT no requiere round-trip a DB en cada request, edge-compatible, y es el default de Auth.js v5. La tabla `Session` queda como capability futura (rotación / revocación granular) sin uso activo. |
| 3 | **`@auth/prisma-adapter` oficial primero** + fallback documentado a custom adapter | Custom adapter desde el inicio; community adapter sidebase; JWT-puro sin adapter | Probamos lo oficial; si falla por hardcoded import a `@prisma/client`, escribimos el adapter (Paso 2b). Esto evita escribir código que tal vez no necesitamos. |
| 4 | **Vitest como Paso 0**, antes de tocar auth | Diferir a Plan 2 o más tarde | Los helpers `requireRole / getCurrentOrg` son código load-bearing para todo lo que viene. Tener tests desde el día 1 baja el costo de regresiones futuras. |
| 5 | **Onboarding: crear-o-unirse explícito** | Auto-asignar a un distrito por defecto | El master plan dice "crear o unirse a un Distrito en primer login". La pantalla con dos paths es la lectura literal y la más amigable. |
| 6 | **Auto-aceptar invitación `PENDING` por email** en primer login | Mostrar invitaciones pendientes y pedir confirmación | Si un admin ya invitó al email, el user ya consintió implícitamente al loguearse con esa cuenta. El loop "loguear → ver pantalla onboarding → buscar el código que ya estaba en mi mail" es fricción innecesaria. La invitación queda registrada en `AuditLog` igual. |
| 7 | **`activeOrganizationId` persistido en JWT + selector en header** | 1-org-fija; o switch via subdominio/path | El JWT ya viaja en cada request — agregar un campo es cero costo. El selector se renderiza sólo si `memberships.length > 1`. Cambiar de distrito = `update({ activeOrganizationId })` del lado del cliente, sin migración de schema. |
| 8 | **Pasar el `prisma` singleton (de `src/lib/db.ts`) al adapter**, no instanciar uno aparte | Que el adapter cree su propio `PrismaClient` | El adapter oficial acepta `PrismaAdapter(prisma)` y respeta esa instancia. Reusar la misma evita duplicar conexiones y respeta la decisión de Plan 0b sobre `PrismaPg` adapter. |
| 9 | **Validación con Zod** en el borde de cada server action y en el callback `signIn` | Validación ad-hoc o sólo TypeScript | Convención del proyecto (CLAUDE.md punto 4). |
| 10 | **Copy en `src/messages/es.json` namespace `auth`** | Hardcodear strings | Convención del proyecto (CLAUDE.md punto 7). |

---

## Modelo de sesión

Después de un login exitoso, el JWT contiene:

```ts
{
  sub: string                  // userId (cuid2)
  email: string
  name?: string
  picture?: string
  // — campos custom inyectados por callback `jwt` —
  memberships: Array<{
    organizationId: string
    organizationNombre: string  // para el selector
    organizationSlug: string
    role: 'ADMIN' | 'JUEZ' | 'ESPECTADOR' | 'JEFE_PATRULLA'
    grupoScoutId: string | null
  }>
  activeOrganizationId: string | null   // null sólo durante onboarding
  iat, exp                              // estándar JWT
}
```

`session()` callback expone esto al cliente / server components como:

```ts
session.user = {
  id: string
  email: string
  name?: string
  image?: string
  memberships: [...]
  activeOrganizationId: string | null
  // computado a partir de activeOrganizationId + memberships:
  activeRole: Role | null
  activeGrupoScoutId: string | null
  activeOrganizationNombre: string | null
}
```

**Refresco de `memberships`**: el callback `jwt` re-queryea memberships del user en cada request donde `trigger === 'update'`. Para uso normal, las memberships se cargan en el primer `signIn` y persisten hasta expiración del JWT (default 30 días). Esto es aceptable en Plan 1: cambios de rol son raros y, cuando ocurran (Plan 2), un `update()` en el cliente refresca el token.

**Cambio de distrito activo**: cliente llama `update({ activeOrganizationId: nuevoId })` → callback `jwt` recibe `trigger='update'` + `session={activeOrganizationId}` → muta el token. No hay round-trip a DB para el switch (sólo se valida que el user tenga membership en ese org).

---

## Implementación

### Paso 0 — Setup de Vitest

Instalación:
```bash
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom jsdom @vitejs/plugin-react
```

Archivos a crear:
- `vitest.config.ts` — entorno `jsdom`, alias `@/*` resuelto a `src/*`, setup file.
- `src/test/setup.ts` — importa `@testing-library/jest-dom`, define helpers globales si hace falta.
- `src/test/mocks/auth.ts` — helper `mockSession({ role, organizationId, ... })` que devuelve un Session válido para tests.
- `src/test/example.test.ts` — un test trivial (`expect(1+1).toBe(2)`) sólo para confirmar que la suite corre.

Modificaciones:
- `package.json` — agregar scripts:
  ```json
  "test": "vitest run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui"
  ```
- `tsconfig.json` — verificar que `vitest/globals` esté en `compilerOptions.types` (o usar imports explícitos en tests).

Verificación: `pnpm test` corre el smoke test verde. `pnpm typecheck` sigue verde.

Commit: `chore(test): setup minimo de Vitest + smoke test`

---

### Paso 1 — Dependencias y variables de entorno

Instalación:
```bash
pnpm add next-auth@beta @auth/prisma-adapter
```

Modificaciones:
- `.env.example` — agregar:
  ```env
  AUTH_SECRET=                    # pnpm dlx auth secret
  AUTH_GOOGLE_ID=                 # de Google Cloud Console
  AUTH_GOOGLE_SECRET=
  # NEXTAUTH_URL solo necesario en producción detrás de proxy; en dev se infiere
  ```
- `.env` (no se commitea) — el usuario completa con valores reales.
- `README.md` o un nuevo `docs/setup-google-oauth.md` (opcional) — paso a paso de cómo crear el OAuth client en Google Cloud Console y configurar redirect URIs (`http://localhost:3000/api/auth/callback/google` para dev).

Decisión: documentar el flujo OAuth en el cuerpo de este plan (sección "Antes de ejecutar"), no en un archivo separado, para mantener el plan auto-contenido.

Commit: `chore(deps): instalar next-auth@beta y @auth/prisma-adapter`

---

### Paso 2 — Smoke test del adapter

Crear `src/auth.ts` mínimo:
```ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { prisma } from "@/lib/db"

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "jwt" },
})
```

Verificación:
1. `pnpm typecheck` — debe pasar. Si hay error de tipos por `prisma` (instancia de `@/generated/prisma/client` vs lo que espera `PrismaAdapter`), documentar el mensaje exacto.
2. `pnpm dev` — debe arrancar sin errores en runtime.
3. Visitar `http://localhost:3000/api/auth/signin` (Auth.js auto-genera esa URL con el handler) — debería renderizar el flow OAuth de Google. Si la página carga, el adapter está OK; **continuar con Paso 3**.
4. Si typecheck o runtime fallan con error sobre imports de `@prisma/client`, **saltar a Paso 2b**.

Commit (si funcionó): `feat(auth): smoke test de Auth.js v5 con PrismaAdapter`

---

### Paso 2b (CONDICIONAL) — Custom adapter

Sólo si el oficial falla. Crear `src/lib/auth-adapter.ts`:
- Implementa la interface `Adapter` de `@auth/core/adapters`.
- Métodos a implementar: `createUser`, `getUser`, `getUserByEmail`, `getUserByAccount`, `updateUser`, `deleteUser`, `linkAccount`, `unlinkAccount`, `createSession`, `getSessionAndUser`, `updateSession`, `deleteSession`, `createVerificationToken`, `useVerificationToken`.
- Usa `prisma` importado desde `@/generated/prisma/client` (vía `@/lib/db`).
- Para sessions: el strategy es `jwt`, así que `createSession / getSession / etc.` pueden ser stubs que tiran (Auth.js no los llama con jwt strategy) — pero implementarlos por si en el futuro se cambia a `database`.

Referencia: implementar copiando la lógica del [oficial](https://github.com/nextauthjs/next-auth/blob/main/packages/adapter-prisma/src/index.ts) y reemplazando `import { PrismaClient } from "@prisma/client"` por nuestro `prisma` ya instanciado.

Test mínimo en `src/lib/auth-adapter.test.ts`: crear un user con `createUser`, leerlo con `getUserByEmail`, eliminarlo. Vitest. Esto da confianza antes de seguir con callbacks.

Volver a Paso 2 con `adapter: customAdapter` y verificar.

Commit (si aplicó): `feat(auth): custom adapter compatible con Prisma 7 prisma-client generator`

---

### Paso 3 — `src/auth.ts`: configuración Auth.js v5

Reemplazar el smoke test por la configuración completa con callbacks. Estructura:

```ts
// src/auth.ts
import NextAuth from "next-auth"
import Google from "next-auth/providers/google"
import { PrismaAdapter } from "@auth/prisma-adapter"   // o customAdapter
import { prisma } from "@/lib/db"
import { aceptarInvitacionEnSignIn } from "@/lib/auth-onboarding"

export const { auth, handlers, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Auto-aceptar invitaciones PENDING con el email del user (transacción atómica)
      if (user.email) {
        await aceptarInvitacionEnSignIn(user.id!, user.email)
      }
      return true
    },
    async jwt({ token, user, trigger, session }) {
      // En primer login: cargar memberships
      if (user) {
        token.id = user.id
        const ms = await prisma.membership.findMany({
          where: { userId: user.id! },
          include: { organization: { select: { id: true, nombre: true, slug: true } } },
        })
        token.memberships = ms.map(m => ({
          organizationId: m.organizationId,
          organizationNombre: m.organization.nombre,
          organizationSlug: m.organization.slug,
          role: m.role,
          grupoScoutId: m.grupoScoutId,
        }))
        token.activeOrganizationId = ms[0]?.organizationId ?? null
      }
      // Update explícito desde el cliente (cambio de distrito o refresh memberships)
      if (trigger === "update" && session) {
        if (session.activeOrganizationId !== undefined) {
          // Validar que el user tenga membership en ese org
          const valid = (token.memberships as any[])?.some(
            m => m.organizationId === session.activeOrganizationId
          )
          if (valid) token.activeOrganizationId = session.activeOrganizationId
        }
        if (session.refreshMemberships) {
          // Re-queryear (caso: aceptar invitación durante onboarding)
          const ms = await prisma.membership.findMany({
            where: { userId: token.id as string },
            include: { organization: { select: { id: true, nombre: true, slug: true } } },
          })
          token.memberships = ms.map(/* ... */)
          if (!token.activeOrganizationId) {
            token.activeOrganizationId = ms[0]?.organizationId ?? null
          }
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.memberships = (token.memberships as any[]) ?? []
      session.user.activeOrganizationId = (token.activeOrganizationId as string) ?? null
      const active = session.user.memberships.find(
        m => m.organizationId === session.user.activeOrganizationId
      )
      session.user.activeRole = active?.role ?? null
      session.user.activeGrupoScoutId = active?.grupoScoutId ?? null
      session.user.activeOrganizationNombre = active?.organizationNombre ?? null
      return session
    },
  },
})
```

Crear `src/lib/auth-onboarding.ts` con `aceptarInvitacionEnSignIn(userId, email)`:
- Busca `Invitation` con `email`, `status='PENDING'`, `expiresAt > now()`.
- Por cada una (puede haber varias en distintos distritos): `prisma.$transaction` que crea Membership, marca invitation `ACCEPTED`, escribe `AuditLog` (`action='invitation.accepted'`).
- Idempotente: si la membership ya existe (por race condition), saltarla.
- Validación con Zod del email.

Commit: `feat(auth): configuracion de Auth.js v5 con callbacks de sesion multi-tenant`

---

### Paso 4 — Route handler

Crear `src/app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@/auth"
export const { GET, POST } = handlers
```

Verificación: visitar `/api/auth/signin` y completar el flow OAuth con una cuenta Google real. Después de login, en DevTools → Application → Cookies, debería estar `authjs.session-token`. Decodificar el JWT (jwt.io) y verificar que tenga `memberships` y `activeOrganizationId`.

Commit: `feat(auth): route handler para Auth.js`

---

### Paso 5 — `src/middleware.ts`: guards de ruta

```ts
import { auth } from "@/auth"
import { NextResponse } from "next/server"

const PUBLIC_PATHS = ["/login", "/api/auth"]
const ONBOARDING_PATH = "/onboarding"

export default auth((req) => {
  const { nextUrl } = req
  const isPublic = PUBLIC_PATHS.some(p => nextUrl.pathname.startsWith(p))
  const isOnboarding = nextUrl.pathname.startsWith(ONBOARDING_PATH)

  if (isPublic) return NextResponse.next()

  if (!req.auth) {
    const url = nextUrl.clone()
    url.pathname = "/login"
    return NextResponse.redirect(url)
  }

  const hasMembership = (req.auth.user.memberships?.length ?? 0) > 0
  if (!hasMembership && !isOnboarding) {
    const url = nextUrl.clone()
    url.pathname = "/onboarding"
    return NextResponse.redirect(url)
  }

  if (hasMembership && isOnboarding) {
    const url = nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)"],
}
```

Commit: `feat(auth): middleware con guards de sesion y onboarding`

---

### Paso 6 — `src/lib/auth-helpers.ts`: helpers de sesión

```ts
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import type { Role } from "@/generated/prisma/enums"

export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}

export async function requireUser() {
  const user = await getCurrentUser()
  if (!user) redirect("/login")
  return user
}

export async function getCurrentOrg() {
  const user = await getCurrentUser()
  if (!user || !user.activeOrganizationId) return null
  return {
    organizationId: user.activeOrganizationId,
    role: user.activeRole!,
    grupoScoutId: user.activeGrupoScoutId,
    nombre: user.activeOrganizationNombre!,
  }
}

export async function requireOrg() {
  const org = await getCurrentOrg()
  if (!org) redirect("/onboarding")
  return org
}

export async function requireRole(roles: Role[]) {
  const org = await requireOrg()
  if (!roles.includes(org.role)) {
    // Forbidden: 403, no redirect
    throw new Error("FORBIDDEN")  // App routes pueden capturar y mostrar UI 403
  }
  return org
}
```

Tests Vitest en `src/lib/auth-helpers.test.ts`:
- Mockear `auth()` con varios escenarios (no logueado, logueado sin membership, logueado con role JUEZ).
- Verificar que `requireUser` redirige cuando no hay user, devuelve user cuando lo hay.
- Verificar que `requireRole(['ADMIN'])` tira FORBIDDEN cuando role es JUEZ.

Commit: `feat(auth): helpers de sesion + tests`

---

### Paso 7 — Página de login

Crear `src/app/(auth)/login/page.tsx`:
```tsx
import { signIn } from "@/auth"
import { auth } from "@/auth"
import { redirect } from "next/navigation"
import { messages } from "@/messages/es.json"  // o helper de i18n

export default async function LoginPage() {
  const session = await auth()
  if (session) redirect("/dashboard")

  async function loginConGoogle() {
    "use server"
    await signIn("google", { redirectTo: "/dashboard" })
  }

  return (
    <main className="min-h-screen flex items-center justify-center">
      <form action={loginConGoogle}>
        <h1>{/* es.json auth.login.title */}</h1>
        <button type="submit">
          {/* es.json auth.login.googleButton */}
        </button>
      </form>
    </main>
  )
}
```

Layout `src/app/(auth)/layout.tsx` opcional (sin header app, fondo limpio).

Commit: `feat(auth): pagina de login con Google OAuth`

---

### Paso 8 — Página de onboarding

Crear `src/app/(auth)/onboarding/page.tsx` (Server Component) con dos cards:
1. **Crear nuevo Distrito**: form con `nombre` y `slug` (slug autogenerable vía `slugify` o similar).
2. **Tengo código de invitación**: form con `token`.

Crear `src/app/(auth)/onboarding/actions.ts`:
```ts
"use server"
import { z } from "zod"
import { requireUser } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { redirect } from "next/navigation"

const createDistritoSchema = z.object({
  nombre: z.string().min(2).max(100),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(2).max(50),
})

export async function createDistrito(formData: FormData) {
  const user = await requireUser()
  const data = createDistritoSchema.parse({
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })

  await prisma.$transaction(async (tx) => {
    // Verificar slug único
    const existing = await tx.organization.findUnique({ where: { slug: data.slug } })
    if (existing) throw new Error("SLUG_TAKEN")

    const org = await tx.organization.create({ data })
    await tx.membership.create({
      data: { userId: user.id, organizationId: org.id, role: "ADMIN" },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.id,
        actorUserId: user.id,
        action: "organization.created",
        targetType: "Organization",
        targetId: org.id,
        metadata: { nombre: data.nombre, slug: data.slug },
      },
    })
  })

  // Trigger refresh del JWT en el siguiente request
  redirect("/dashboard")
}

const aceptarSchema = z.object({ token: z.string().min(1) })

export async function aceptarInvitacion(formData: FormData) {
  const user = await requireUser()
  const { token } = aceptarSchema.parse({ token: formData.get("token") })

  await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.findUnique({ where: { token } })
    if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
      throw new Error("INVITACION_INVALIDA")
    }
    if (inv.email.toLowerCase() !== user.email.toLowerCase()) {
      throw new Error("EMAIL_NO_COINCIDE")
    }

    await tx.membership.create({
      data: {
        userId: user.id,
        organizationId: inv.organizationId,
        role: inv.role,
        grupoScoutId: inv.grupoScoutId,
      },
    })
    await tx.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        organizationId: inv.organizationId,
        actorUserId: user.id,
        action: "invitation.accepted",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { role: inv.role },
      },
    })
  })

  redirect("/dashboard")
}
```

**Refresh del JWT post-onboarding**: el redirect a `/dashboard` no actualiza memberships en el JWT por sí solo. Solución: después del redirect, el dashboard detecta `memberships.length === 0` en sesión vs DB y dispara `update({ refreshMemberships: true })` desde un client component pequeño. Alternativa más limpia: forzar logout/login. La solución `update` es viable y se documenta en el plan.

Commits: `feat(auth): pagina de onboarding y server actions`, posiblemente split en dos.

---

### Paso 9 — Layout protegido + Dashboard

Crear:
- `src/app/(app)/layout.tsx` — Server Component, llama `requireOrg()`, renderiza `<AppHeader>` + `{children}`.
- `src/app/(app)/dashboard/page.tsx` — Server Component, muestra welcome + nombre del distrito + role del usuario. Placeholder de futuras secciones.
- `src/components/auth/AppHeader.tsx` — Server Component con info del user (nombre, avatar) y formulario `<form action={signOut}>` para cerrar sesión. Si `memberships.length > 1`, renderiza `<DistrictSwitcher>`.

Commit: `feat(app): layout protegido + dashboard basico con header`

---

### Paso 10 — Selector de Distrito (multi-membership)

Crear `src/components/auth/DistrictSwitcher.tsx` — Client Component:
```tsx
"use client"
import { useSession } from "next-auth/react"

export function DistrictSwitcher() {
  const { data, update } = useSession()
  const memberships = data?.user.memberships ?? []
  const active = data?.user.activeOrganizationId

  if (memberships.length <= 1) return null

  return (
    <select
      value={active ?? ""}
      onChange={async (e) => {
        await update({ activeOrganizationId: e.target.value })
        // Optionally: location.reload() o router.refresh()
      }}
    >
      {memberships.map(m => (
        <option key={m.organizationId} value={m.organizationId}>
          {m.organizationNombre} ({m.role})
        </option>
      ))}
    </select>
  )
}
```

Para que `useSession` funcione, agregar `<SessionProvider>` en `src/app/(app)/providers.tsx` y usarlo desde el layout protegido.

Commit: `feat(auth): selector de distrito para usuarios con multiples memberships`

---

### Paso 11 — Tipado de la sesión

Crear `src/types/next-auth.d.ts`:
```ts
import type { Role } from "@/generated/prisma/enums"
import "next-auth"
import "next-auth/jwt"

interface MembershipSummary {
  organizationId: string
  organizationNombre: string
  organizationSlug: string
  role: Role
  grupoScoutId: string | null
}

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      memberships: MembershipSummary[]
      activeOrganizationId: string | null
      activeRole: Role | null
      activeGrupoScoutId: string | null
      activeOrganizationNombre: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string
    memberships: MembershipSummary[]
    activeOrganizationId: string | null
  }
}
```

Verificación: `pnpm typecheck` debe pasar y los `session.user.activeRole` deben tener autocompletado.

Commit: `chore(auth): module augmentation de tipos de sesion`

---

### Paso 12 — Copy en `es.json`

Agregar namespace `auth` a `src/messages/es.json`:
```json
{
  "auth": {
    "login": {
      "title": "Iniciar sesión",
      "subtitle": "Accedé con tu cuenta de Google",
      "googleButton": "Continuar con Google",
      "errors": { "generic": "No pudimos iniciar sesión. Probá de nuevo." }
    },
    "onboarding": {
      "title": "Bienvenido a Puntajes Scout",
      "subtitle": "Para empezar, elegí una opción:",
      "createDistrito": {
        "title": "Crear nuevo Distrito",
        "description": "Si sos admin de un distrito que aún no está en el sistema",
        "nombreLabel": "Nombre del distrito",
        "slugLabel": "Identificador (slug)",
        "submit": "Crear Distrito"
      },
      "joinDistrito": {
        "title": "Tengo un código de invitación",
        "description": "Si te invitaron a un distrito existente",
        "tokenLabel": "Código de invitación",
        "submit": "Unirme"
      },
      "errors": {
        "slugTaken": "Ese identificador ya está en uso",
        "invitacionInvalida": "El código no es válido o expiró",
        "emailNoCoincide": "Esa invitación es para otro email"
      }
    },
    "header": {
      "logout": "Cerrar sesión",
      "switchDistrict": "Cambiar de distrito"
    }
  }
}
```

Commit: `chore(i18n): copy en espanol para auth y onboarding`

---

## Archivos creados / modificados

| Archivo | Acción | Función |
|---|---|---|
| `vitest.config.ts` | crear | Config Vitest |
| `src/test/setup.ts` | crear | Setup global de tests |
| `src/test/mocks/auth.ts` | crear | Helper `mockSession()` |
| `src/test/example.test.ts` | crear | Smoke test |
| `package.json` | modificar | Scripts test, deps next-auth + adapter |
| `.env.example` | modificar | Variables AUTH_* |
| `src/auth.ts` | crear | Configuración Auth.js v5 |
| `src/lib/auth-onboarding.ts` | crear | `aceptarInvitacionEnSignIn` |
| `src/lib/auth-adapter.ts` | crear (CONDICIONAL) | Custom adapter si oficial falla |
| `src/lib/auth-helpers.ts` | crear | `getCurrentUser`, `requireOrg`, `requireRole`, ... |
| `src/lib/auth-helpers.test.ts` | crear | Tests Vitest |
| `src/middleware.ts` | crear | Guards de ruta |
| `src/app/api/auth/[...nextauth]/route.ts` | crear | Route handler |
| `src/app/(auth)/layout.tsx` | crear | Layout sin header |
| `src/app/(auth)/login/page.tsx` | crear | Página login |
| `src/app/(auth)/onboarding/page.tsx` | crear | Página onboarding |
| `src/app/(auth)/onboarding/actions.ts` | crear | Server actions |
| `src/app/(app)/layout.tsx` | crear | Layout protegido |
| `src/app/(app)/providers.tsx` | crear | SessionProvider client |
| `src/app/(app)/dashboard/page.tsx` | crear | Dashboard MVP |
| `src/components/auth/AppHeader.tsx` | crear | Header con user + logout |
| `src/components/auth/DistrictSwitcher.tsx` | crear | Selector multi-org |
| `src/types/next-auth.d.ts` | crear | Module augmentation |
| `src/messages/es.json` | modificar | Namespace `auth` |
| `src/app/page.tsx` | modificar | Redirect a /dashboard si hay sesión, sino a /login |

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm test          # todos los tests verdes (incluye auth-helpers)
pnpm build         # build exitoso (requiere DATABASE_URL y AUTH_* en env)
```

### Verificación manual end-to-end

Pre-requisito: tener creadas las credenciales OAuth en Google Cloud Console y DB con seed corrido (`pnpm prisma db seed` deja distrito demo + invitaciones).

**Escenario 1 — Crear nuevo Distrito (primer login sin invitación)**:
1. Borrar datos de Auth (`prisma.user.deleteMany()`) si hace falta limpiar entre pruebas, o usar otra cuenta Google.
2. Visitar `localhost:3000` → redirect a `/login`.
3. Click "Continuar con Google" → autorizar con cuenta personal nueva.
4. Redirect a `/onboarding` (porque no hay membership).
5. Completar form "Crear nuevo Distrito" con nombre = "Distrito de Prueba", slug = "prueba".
6. Redirect a `/dashboard`. Header muestra mi nombre + "Distrito de Prueba".
7. En DB: hay 1 nuevo `Organization`, 1 `Membership` con role `ADMIN`, 1 `AuditLog`.

**Escenario 2 — Aceptar invitación pendiente del seed**:
1. Limpiar DB y re-seedear.
2. El seed dejó invitación PENDING para `futuro-juez@demo.local` con role `JUEZ`. **Si no podés loguear con ese email** (porque no tenés esa cuenta de Google), modificar el seed temporalmente para usar tu email real, o usar el flow de "código de invitación" en `/onboarding`.
3. Variante A — auto-aceptación: loguear con la cuenta cuyo email coincide con la invitación. Debería ir directo a `/dashboard` (no a onboarding) con role JUEZ y distrito demo.
4. Variante B — código manual: loguear con cualquier cuenta, ir a `/onboarding`, pegar el `token` de la invitación PENDING. Validar que crea Membership, marca invitación ACCEPTED, escribe AuditLog.

**Escenario 3 — Multi-membership y switch**:
1. Con la cuenta del Escenario 1 logueada, en otro browser/incógnito loguear como admin del distrito demo (requiere modificar admin@demo.local para que coincida con tu email, O crear una segunda invitación manual para tu email en otro distrito).
2. Más simple: aceptar dos invitaciones en distintos distritos con el mismo email (crear una segunda Org via "Crear distrito" estando ya logueado — esto requiere navegar manualmente a /onboarding pero el middleware redirige... ajustar para permitir crear-otro-distrito desde el dashboard, O usar SQL directo para insertar la 2da membership).
3. Verificar que el header muestra el `<DistrictSwitcher>`. Cambiar de distrito → la página se actualiza con el nuevo nombre y los queries `forOrg()` apuntan al nuevo `organizationId`.

**Escenario 4 — Guards de rol**:
1. Con role JUEZ, intentar visitar una ruta hipotética `/admin/...` que tenga `requireRole(['ADMIN'])`. Debería tirar `FORBIDDEN` y mostrar un 403 (la UI de error completa llega en planes posteriores; en Plan 1 alcanza con el throw en el handler).

**Escenario 5 — Logout**:
1. Click "Cerrar sesión" en el header → redirect a `/login`. Cookie `authjs.session-token` borrada.
2. Visitar `/dashboard` → redirect a `/login`.

### Criterios de aceptación

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en limpio.
- [ ] El login con Google funciona end-to-end.
- [ ] Un user nuevo sin invitación es enviado a `/onboarding`.
- [ ] Un user nuevo con invitación PENDING para su email aterriza directo en `/dashboard` con la membership creada.
- [ ] Un user en `/onboarding` puede crear un nuevo Distrito y queda como ADMIN.
- [ ] Un user en `/onboarding` puede pegar un token de invitación válido y unirse.
- [ ] El JWT contiene `memberships`, `activeOrganizationId`, y la `session.user` expone `activeRole`.
- [ ] El selector de distrito aparece sólo si `memberships.length > 1` y cambia el `activeOrganizationId` sin recargar la página.
- [ ] `requireRole(['ADMIN'])` lanza `FORBIDDEN` cuando el role activo no es ADMIN.
- [ ] El middleware redirige correctamente en los 3 estados: anónimo → /login, sin membership → /onboarding, con membership → permite la ruta.
- [ ] El `aceptarInvitacionEnSignIn` es idempotente (correr dos veces el mismo signIn no duplica memberships).
- [ ] `forOrg()` de Plan 0b sigue funcionando: cualquier query desde un Server Component que use `getCurrentOrg()` + `forOrg(orgId)` devuelve datos del distrito activo.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| `@auth/prisma-adapter` oficial incompatible con Prisma 7 + `prisma-client` generator | Media | Smoke test en Paso 2 antes de seguir. Fallback a custom adapter (Paso 2b) ya planeado. |
| El JWT no se actualiza después de crear distrito en onboarding (el dashboard ve `memberships=[]`) | Alta | Trigger `update({ refreshMemberships: true })` desde un client component en el dashboard cuando detecta el desfase. Documentar el patrón en el código. |
| Race condition: dos invitaciones PENDING al mismo email se aceptan ambas en el primer signIn | Baja | OK por diseño: el master plan permite multi-memberships. Audit log captura las dos. |
| Cambiar de distrito en `<DistrictSwitcher>` no propaga el cambio a Server Components ya renderizados | Media | Después de `update()`, llamar `router.refresh()` para revalidar el árbol de Server Components. |
| `AUTH_SECRET` no configurado o débil en dev | Baja | Documentar `pnpm dlx auth secret` en .env.example y README. |
| El email de Google viene en mayúsculas/minúsculas distintas que el de la invitación | Media | Comparar siempre con `.toLowerCase()` en `aceptarInvitacionEnSignIn` y en `aceptarInvitacion` action. |

---

## Antes de ejecutar — checklist

- [ ] Plan 0b mergeado y migración corrida (`pnpm prisma migrate status` limpio).
- [ ] Seed corrido al menos una vez (`pnpm prisma db seed`) — confirmar que `admin@demo.local`, las 3 grupos, y las 2 invitaciones existen.
- [ ] Crear OAuth Client en [Google Cloud Console](https://console.cloud.google.com/):
  - Tipo: Web application.
  - Authorized JavaScript origins: `http://localhost:3000`.
  - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`.
  - Copiar Client ID y Client Secret a `.env`.
- [ ] Generar `AUTH_SECRET` en `.env`: `pnpm dlx auth secret` (lo agrega automáticamente) o `openssl rand -base64 33` manual.
- [ ] Confirmar que Node 22+ está activo (`node -v`).
- [ ] Verificar que el branch actual es `main` y está limpio.

---

## Proceso de planeación (educativo)

Este plan se redactó en una sesión separada de plan mode con Claude Opus, siguiendo la regla del master plan. Los puntos clave del intercambio:

1. **Lectura previa**: el agente de exploración leyó el master plan, el plan 0b (que dejó la nota 1b sobre `@prisma/adapter-pg`), el ADR-0001, y surveyó el código actual (schema, db.ts, seed.ts, package.json, app/).

2. **Investigación de compatibilidad**: se hizo búsqueda web sobre `@auth/prisma-adapter` v2.11 + Prisma 7 + generator `prisma-client`. Encontró issues en `nextauthjs/next-auth` y `better-auth/better-auth` señalando que algunos adapters hardcodean `import from "@prisma/client"`. Conclusión: viable pero con riesgo, mejor un smoke test temprano que asumir que funciona.

3. **Cuatro decisiones subjetivas planteadas al usuario**:
   - **Vitest sí/no como Paso 0**: el usuario eligió "sí, Paso 0" — los helpers de auth son load-bearing y merecen tests desde el día 1.
   - **Estrategia de adapter**: el usuario eligió "probar oficial primero, fallback a custom" — minimiza código propio si no hace falta.
   - **Onboarding sin invitación**: el usuario eligió "pantalla con dos opciones (crear/código)" — lectura literal del master plan.
   - **Multi-membership**: el usuario eligió "activeOrganizationId en sesión + selector simple" — futura-proof sin migraciones.

4. **Decisiones que el plan tomó solo** (sin preguntar):
   - Strategy `jwt` vs `database` para sesiones → JWT, default v5, simpler, edge-compatible.
   - Auto-aceptación de invitaciones pendientes en `signIn` → sí, evita el loop "loguear → buscar el código que ya estaba en mi mail".
   - Dónde guardar la augmentation de tipos → `src/types/next-auth.d.ts`.
   - Cómo se actualiza el JWT después de crear distrito → `update({ refreshMemberships: true })` con `trigger='update'` en el callback `jwt`.
   - Comparación case-insensitive de emails → siempre con `.toLowerCase()`.

---

## Preguntas abiertas para el usuario

Ninguna decisión arquitectónica queda pendiente. Sí hay **tareas operacionales** que el usuario debe completar antes (o durante) la ejecución:

1. Crear las credenciales OAuth en Google Cloud Console (paso documentado en el checklist "Antes de ejecutar"). Si querés, en la sesión de ejecución te puedo guiar paso a paso por la consola.
2. Si durante el smoke test del Paso 2 el adapter oficial falla, te aviso para confirmar que avanzamos al Paso 2b (custom adapter) — no es decisión que cierre yo solo en ejecución, ya que cambia el alcance.
3. Para los Escenarios 2 y 3 de verificación manual, vas a necesitar una segunda cuenta de Google o modificar el seed temporalmente para que la invitación PENDING coincida con tu email real. Confirmar la estrategia preferida en ejecución.

---

## Commits asociados

(Se completa post-ejecución con los hashes reales de cada commit. Estimación: ~10–13 commits temáticos siguiendo el patrón de Plan 0b.)
