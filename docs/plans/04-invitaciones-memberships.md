# Plan 2 — Gestión de invitaciones, memberships, grupos scouts y perfil del distrito

> **Estado**: ✅ Completado (2026-04-28). Ejecutado con Sonnet.

---

## Contexto

Plan 1 dejó la auth multi-tenant cerrada: login con Google, onboarding con dos paths (crear distrito o pegar token), JWT con `memberships` y `activeOrganizationId`, middleware con guards, helpers `requireRole / requireOrg / requireUser`. La DB tiene tablas `Membership`, `Invitation`, `GrupoScout`, `AuditLog` listas y un wrapper `forOrg(organizationId)` que inyecta tenant isolation en todos los queries.

Lo que **no existe todavía** es la UI/UX para administrar el distrito una vez adentro:

- Un ADMIN no tiene forma de invitar a alguien nuevo (las únicas invitaciones que existen son las del seed). El único flow funcional es "loguearse con Google → caer en /onboarding → crear un distrito propio", que solo cubre el primer admin de cada distrito.
- No se pueden listar ni revocar invitaciones existentes.
- No se puede cambiar el rol de un miembro ni expulsarlo.
- No se puede editar el nombre del distrito.
- Los distritos creados desde Plan 1 (no demo) no tienen ningún `GrupoScout`, lo cual deja muerto el campo `grupoScoutId` opcional de `Membership` e `Invitation`.

Plan 2 cierra todo eso. Es **CRUD-pesado, sin decisiones arquitectónicas grandes**: el schema ya está diseñado, el wrapper `forOrg` ya existe, los helpers de auth ya existen. Lo que aporta es la superficie de UI admin (`/admin/...`), las server actions con sus validaciones, y dos reglas de negocio explícitas (último ADMIN no se puede sacar; un grupo con miembros vinculados no se puede borrar).

Es también el plan donde se establece el **patrón de “página admin”** que Plan 3 (plantillas), Plan 4a (eventos) y Plan 4b (postas/patrullas/jueces) van a copiar.

---

## Alcance

### Incluye

- **Layout `/admin`** protegido con `requireRole(['ADMIN'])`. Sub-secciones: distrito, grupos, invitaciones, miembros.
- **Perfil del distrito**: editar `nombre`. `slug` queda inmutable (URLs públicas / Plan 7).
- **CRUD completo de Grupos Scouts**: crear, listar, editar (`nombre`, `slug` interno único en el distrito), borrar con validación de “grupo no vacío”.
- **Invitaciones**:
  - Crear con email + rol + `grupoScoutId` opcional. Token autogenerado (cuid2). Expiración fija a 7 días desde creación.
  - Listar pendientes y aceptadas en una sola página (secciones).
  - Auto-marcar como `EXPIRED` lazy al listar (sin cron).
  - Revocar PENDING.
  - Reenviar = revocar la actual + crear una nueva (mismo email/rol/grupo). Sin columna nueva.
  - **Compartir**: la UI muestra el link `/<origin>/invite/<token>` con botón “Copiar”. Sin email automático.
- **Deep link `/invite/[token]`** (público, fuera del layout `(app)`): si no hay sesión redirige a `/login?callbackUrl=...`; si hay sesión, valida token + email coincidente y acepta la invitación en una transacción.
- **Memberships**:
  - Listar todos los miembros del distrito con email, rol y grupo scout asignado.
  - Editar miembro (rol + `grupoScoutId`) en una sola server action.
  - Expulsar miembro (delete).
  - **Regla “último ADMIN”**: cualquier acción que reduciría la cantidad de ADMINs del distrito a 0 se bloquea con error de negocio.
- **Refresh de JWT** post-mutación cuando el ADMIN se autoedita (cambio de nombre del distrito, autocambio de rol o autocambio de grupo, autoexpulsión bloqueada por “último ADMIN” pero conceptualmente cubierta).
- **Audit log** en cada mutación del plan: `organization.updated`, `grupo.created/updated/deleted`, `invitation.created/revoked/accepted`, `membership.updated/removed`.
- **Copy en español** centralizado en `src/messages/es.json` namespace `admin`.
- **Tests Vitest** para los helpers de reglas (`assertNotLastAdmin`, `assertGrupoVacio`, `markInvitationsExpired`) y para idempotencia de aceptación.

### NO incluye

- **CRUD de plantillas de puntaje** — Plan 3.
- **CRUD de eventos / postas / patrullas / asignación de jueces** — Plan 4a/4b.
- **CRUD de `MiembroScout`** (padrón) — Plan 10 (Capa 2). En Plan 2 los grupos pueden tener `MiembroScout` (vienen del seed) y eso bloquea su borrado, pero no se administran desde acá.
- **Envío de invitaciones por email** — fuera de alcance MVP, requiere provider (Resend/SES) y se pospone hasta que haya necesidad real.
- **Transferencia de admin** explícita (cambiar “owner”) — el modelo no tiene owner singular, todos los ADMIN son iguales.
- **Recuperación de cuenta perdida** — fuera de alcance MVP.
- **Auditoría exportable / vista de audit log** — la tabla se llena pero no se renderiza UI todavía. Llega cuando lo necesite un plan posterior.
- **Paginación** en los listados — carga completa.
- **Internacionalización real** (i18n con next-intl o similar) — sigue el patrón actual de un solo `es.json` importado directamente.
- **Tests E2E con Playwright** — Vitest unit/integration de helpers, igual que Plan 1.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **CRUD completo de Grupos Scouts dentro de Plan 2** | Sacar a un plan aparte; o solo crear+listar | Es lo que dice el master plan original. Mantiene cerrado el universo de “administración del distrito” en un solo plan. Las invitaciones con `grupoScoutId` pueden funcionar de inmediato. |
| 2 | **Compartir invitación por link copiable, sin email automático** | Resend/SES; ambos | Cero infra extra. El admin lo manda por WhatsApp / email manualmente. La provider de email se evalúa cuando haya necesidad real de notificaciones (post-Plan 9). |
| 3 | **Página de gestión solo para ADMIN** | Read-only para todos los roles | MVP simple. Otros roles no tienen caso de uso claro para ver la lista de miembros. Si surge, se agrega después. |
| 4 | **Expiración fija de 7 días** (constante en código) | Configurable por invitación o por distrito | Predecible, simple, mismo comportamiento para todos los distritos. Si más adelante se necesita configurabilidad, se hace una migración pequeña sin romper nada. |
| 5 | **Carga completa en listados** (sin paginación) | Cursor o offset desde el inicio | Distrito típico < 100 miembros. Paginar antes de tener problema es over-engineering. Si crece, se agrega un `take: 100` y se itera. |
| 6 | **Bloquear con error de negocio cuando se intenta sacar el último ADMIN** | Permitir distrito huérfano; flujo de transferencia obligatoria | Un distrito sin ADMIN es un estado roto: nadie puede invitar ni recuperar el control. Bloquear es la opción más simple y segura. La “transferencia” explícita agrega un flujo extra que no aporta hoy. |
| 7 | **Editar miembro = una sola action** (`role` + `grupoScoutId` juntos) | Acciones separadas | UI más natural (un formulario por fila), menos round-trips. |
| 8 | **Reenviar invitación = revocar + crear de nuevo** | Endpoint `resend` que extiende `expiresAt` o regenera `token` | Cero columnas nuevas. Cero ambigüedad sobre qué token está vivo. El audit log captura los dos eventos. |
| 9 | **Auto-expirar invitaciones lazy en `listInvitations`** | Cron job; trigger de DB | Cero infra. La consulta de listado actualiza las que correspondan en un `updateMany` previo al `findMany`. Aceptable porque no hay invitaciones que se consuman fuera de la UI admin. |
| 10 | **Token de invitación = `cuid2`** (default del schema) | UUID v4; nanoid; secret aleatorio criptográfico | Ya viene del schema (`@default(cuid(2))`). URL-safe y suficientemente largo (~24 chars) para resistir adivinanza online. Documentar como “token opaco no criptográfico” en el código. |
| 11 | **Errores de negocio con `return { error }` + `useActionState`**, errores inesperados con `throw` | Mezclar `throw` para todo | Convención cerrada en Plan 1 (lección aprendida #4). Los errores listados — slug duplicado, último admin, grupo no vacío, email ya miembro, token inválido, email no coincide — son todos de negocio. |
| 12 | **Refresh del JWT post-mutación con `unstable_update({ refreshMemberships: true })`** cuando el ADMIN modifica su propio estado o el nombre del distrito | Forzar logout; nada (esperar expiración) | Convención cerrada en Plan 1 (CLAUDE.md punto 13). Sin esto el header sigue mostrando el nombre viejo del distrito o el rol viejo. |
| 13 | **JWT del usuario al que se le cambió rol o se expulsó queda stale hasta su próximo `update`** | Invalidación server-side / blacklist de JWTs | Aceptable para MVP: el usuario afectado solo tendría una ventana de minutos a horas con role anterior. Documentado como riesgo. La opción “blacklist” cambiaría a `database` strategy y rompe cosas. |
| 14 | **Nuevo segmento de ruta `/admin/...`** debajo de `(app)` | Mezclar con `/dashboard` | Deja el espacio claro para futuras admin-only features y hace trivial el guard de rol (en el `layout.tsx`). |
| 15 | **Deep link `/invite/[token]` fuera del layout `(app)`**, lógica de aceptación en el server component de la página | Modificar `aceptarInvitacionEnSignIn` para soportar token | El auto-accept por email en `signIn` (Plan 1) sigue como atajo. El deep link es un flujo distinto: el invitado entra por el link, eventualmente loguea, y se valida el token específico. No mezclar ambos. |
| 16 | **Slug del distrito inmutable post-creación** | Permitir editar | URLs públicas (`PublicShareLink` en Plan 7) consumirán el slug. Cambios de slug = links rotos. Si un distrito necesita renombrarse, lo hacemos por SQL. |
| 17 | **Auditoría desde el primer commit del plan** | Aplicar audit en una segunda pasada | Más fácil agregar un `auditLog.create` en cada `$transaction` ahora que retrofittear todo después. Mismo patrón que Plan 1. |

---

## Modelo de datos

**Sin cambios al schema.** Todo lo que necesita el plan ya existe en `prisma/schema.prisma` (Plan 0b). Recordatorio de los modelos involucrados:

- `Organization` → editamos `nombre` (NO `slug`).
- `GrupoScout` → CRUD completo. Constraint `@@unique([organizationId, slug])` ya existe.
- `Invitation` → crear / actualizar status / leer. Índice parcial `WHERE status='PENDING'` por organización para garantizar una sola invitación viva por email (en la migración de Plan 0b).
- `Membership` → leer / editar (rol, grupo) / borrar. `@@unique([userId, organizationId])` ya existe.
- `AuditLog` → solo append.

**Decisión documentada**: si Plan 0b NO incluyó el unique parcial `(organizationId, email) WHERE status='PENDING'`, se valida en código antes del insert (un `findFirst` y `return { error }`). Verificar la migración antes de ejecutar; si falta, agregarla en este plan como sub-paso de migración. *Ver checklist “Antes de ejecutar”.*

---

## Estructura de rutas

```
/(app)/
├── dashboard/                     ← Plan 1
└── admin/                         ← NUEVO en Plan 2
    ├── layout.tsx                 ← guard requireRole(['ADMIN'])
    ├── page.tsx                   ← landing con 4 cards
    ├── distrito/page.tsx
    ├── grupos/page.tsx            ← lista + form crear
    ├── grupos/[id]/page.tsx       ← form editar
    ├── invitaciones/page.tsx      ← lista pendientes/aceptadas + form crear
    └── miembros/page.tsx          ← lista + edición inline / modal

/invite/[token]/page.tsx           ← NUEVO, público (deep link)
```

---

## Implementación

### Paso 1 — Layout `/admin` y landing

Archivos:
- `src/app/(app)/admin/layout.tsx` — Server Component. Llama `requireRole(['ADMIN'])`. Si no hay throw, renderiza `<AdminNav>` + `{children}`. El throw `FORBIDDEN` se captura en un error boundary co-localizado (`src/app/(app)/admin/error.tsx`) que muestra una pantalla 403 simple con link a `/dashboard`.
- `src/app/(app)/admin/page.tsx` — Server Component con 4 cards: “Distrito”, “Grupos Scouts”, “Invitaciones”, “Miembros”. Cada una con un breve resumen (ej: count de miembros, count de invitaciones pendientes).
- `src/components/admin/AdminNav.tsx` — sub-nav con links activos.
- `src/app/(app)/admin/error.tsx` — error boundary con UI para `FORBIDDEN`.

Verificación: como JUEZ, navegar a `/admin/...` → ver pantalla 403. Como ADMIN, ver el menú.

Commit: `feat(admin): layout protegido /admin con guard de rol y landing`

---

### Paso 2 — Perfil del distrito

Archivos:
- `src/app/(app)/admin/distrito/page.tsx` — Client Component (necesita `useActionState`) o server con un client form anidado. Form con `nombre` editable y campo read-only que muestra `slug`.
- `src/app/(app)/admin/distrito/actions.ts`:

```ts
"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { prisma } from "@/lib/db"
import { unstable_update } from "@/auth"
import { revalidatePath } from "next/cache"

const schema = z.object({ nombre: z.string().min(2).max(100) })

export async function updateDistrito(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = schema.safeParse({ nombre: formData.get("nombre") })
  if (!parsed.success) return { error: "Nombre inválido" }

  await prisma.$transaction(async (tx) => {
    await tx.organization.update({
      where: { id: org.organizationId },
      data: { nombre: parsed.data.nombre },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: (await requireRole(["ADMIN"])).organizationId, // see note
        action: "organization.updated",
        targetType: "Organization",
        targetId: org.organizationId,
        metadata: { nombre: parsed.data.nombre },
      },
    })
  })

  await unstable_update({ refreshMemberships: true })  // refresca activeOrganizationNombre
  revalidatePath("/admin/distrito")
  return { success: true }
}
```

> Nota: `actorUserId` debe venir del user, no del org. Acá se usa un helper más limpio (`requireUser()` o agregar `userId` al return de `requireRole`). Resolver en ejecución: extender `requireRole` para devolver también `userId`, o llamar `requireUser()` en paralelo. Es trivial; no decisión arquitectónica.

Auditoría: `action: 'organization.updated'`, `metadata: { nombre }`.

Commit: `feat(admin): editar nombre del distrito`

---

### Paso 3 — CRUD de Grupos Scouts

Archivos:
- `src/app/(app)/admin/grupos/page.tsx` — lista + form de creación inline.
- `src/app/(app)/admin/grupos/[id]/page.tsx` — form de edición + botón borrar (con confirmación).
- `src/app/(app)/admin/grupos/actions.ts`:

```ts
"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"

const slugSchema = z.string().regex(/^[a-z0-9-]+$/).min(2).max(50)
const createSchema = z.object({
  nombre: z.string().min(2).max(100),
  slug: slugSchema,
})

export async function createGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = createSchema.safeParse({
    nombre: formData.get("nombre"),
    slug: formData.get("slug"),
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  const repo = forOrg(org.organizationId)
  const existing = await repo.grupoScout.findFirst({ where: { slug: parsed.data.slug } })
  if (existing) return { error: "Ya existe un grupo con ese identificador" }

  await prisma.$transaction(async (tx) => {
    const grupo = await tx.grupoScout.create({
      data: { ...parsed.data, organizationId: org.organizationId },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,  // pendiente: extender requireRole para incluir userId
        action: "grupo.created",
        targetType: "GrupoScout",
        targetId: grupo.id,
        metadata: { nombre: grupo.nombre, slug: grupo.slug },
      },
    })
  })
  return { success: true }
}

export async function updateGrupo(/* ... */) { /* ídem, con `where: { id }` y check de tenant */ }

export async function deleteGrupo(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))

  // Validar grupo vacío: ni miembros, ni memberships, ni invitations vinculadas.
  const [miembros, memberships, invs] = await Promise.all([
    forOrg(org.organizationId).miembroScout.count({ where: { grupoScoutId: id } }),
    forOrg(org.organizationId).membership.count({ where: { grupoScoutId: id } }),
    forOrg(org.organizationId).invitation.count({
      where: { grupoScoutId: id, status: "PENDING" },
    }),
  ])
  if (miembros > 0) return { error: `No se puede borrar: tiene ${miembros} miembro(s) vinculado(s)` }
  if (memberships > 0) return { error: `No se puede borrar: tiene ${memberships} usuario(s) asignado(s)` }
  if (invs > 0) return { error: `Hay ${invs} invitación(es) pendiente(s) a este grupo. Revocá primero.` }

  await prisma.$transaction(async (tx) => {
    await tx.grupoScout.delete({ where: { id } })  // FK on cascade desde Organization sí, pero aislado por id+orgId check arriba
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "grupo.deleted",
        targetType: "GrupoScout",
        targetId: id,
      },
    })
  })
  return { success: true }
}
```

Notas:
- `forOrg(...).grupoScout.delete(...)` no se puede usar tal cual porque el wrapper actual hace `where: { ...args.where, organizationId }` que no es valido en el `where` único de Prisma. Resolver: o usamos `prisma.grupoScout.delete({ where: { id } })` después de validar pertenencia, o extendemos `forOrg` para que valide la pertenencia leyendo primero. Decisión simple: en ejecución, extender los métodos `update`/`delete` del wrapper para que primero hagan `findFirst({ where: { id, organizationId } })` y aborten si no encuentran. Ya existe el patrón en el wrapper actual; revisar y completar.

Tests Vitest:
- `src/lib/grupos.test.ts` — caso “no se puede borrar grupo con miembros”.

Auditoría: `grupo.created`, `grupo.updated`, `grupo.deleted`.

Commit: `feat(admin): CRUD de grupos scouts con validacion de borrado seguro`

---

### Paso 4 — Helper de reglas y utilidades

Crear `src/lib/membership-rules.ts`:

```ts
import { prisma } from "@/lib/db"

/**
 * Tira con error de negocio si remover/degradar `membershipId` dejaría al
 * distrito sin ADMIN.
 */
export async function assertNotLastAdmin(
  organizationId: string,
  membershipId: string,
  newRole?: "ADMIN" | "JUEZ" | "ESPECTADOR" | "JEFE_PATRULLA",
) {
  // Si seguirá siendo ADMIN, no hay nada que validar.
  if (newRole === "ADMIN") return

  const adminCount = await prisma.membership.count({
    where: { organizationId, role: "ADMIN", id: { not: membershipId } },
  })
  if (adminCount === 0) {
    throw new BusinessError("LAST_ADMIN")
  }
}

export class BusinessError extends Error {
  constructor(public code: string) { super(code) }
}
```

Crear `src/lib/invitations.ts`:

```ts
import { forOrg } from "@/lib/db"

/**
 * Marca como EXPIRED las invitaciones PENDING vencidas. Idempotente.
 * Llamar antes de cualquier listado o al evaluar un token recibido.
 */
export async function markInvitationsExpired(organizationId: string) {
  const repo = forOrg(organizationId)
  // updateMany requerido en el wrapper si todavía no está
  await repo.invitation.updateMany?.({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED" },
  })
}
```

> Si el wrapper `forOrg` no expone `updateMany` para `invitation`, agregarlo siguiendo el patrón existente. Revisar `src/lib/db.ts`.

Tests Vitest:
- `src/lib/membership-rules.test.ts` — casos: 1 admin → bloquea; 2 admins → permite; degradación a no-admin con otro admin → permite.
- `src/lib/invitations.test.ts` — `markInvitationsExpired` actualiza solo PENDING vencidas, no toca ACCEPTED/REVOKED ni futuras.

Commit: `feat(admin): helpers de reglas (ultimo admin, expiracion lazy) + tests`

---

### Paso 5 — Invitaciones (server actions + listado)

Archivos:
- `src/app/(app)/admin/invitaciones/page.tsx` — Server Component que carga la lista (después de llamar `markInvitationsExpired`), separa en secciones “Pendientes / Aceptadas / Expiradas-Revocadas”, y embebe un `<NewInvitationForm>` (Client Component con `useActionState`).
- `src/app/(app)/admin/invitaciones/actions.ts`:

```ts
"use server"
import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { revalidatePath } from "next/cache"

const INVITATION_TTL_DAYS = 7

const createSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(["ADMIN", "JUEZ", "ESPECTADOR", "JEFE_PATRULLA"]),
  grupoScoutId: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
})

export async function createInvitation(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
    grupoScoutId: formData.get("grupoScoutId") || undefined,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  const repo = forOrg(org.organizationId)

  // Si grupoScoutId vino, validar pertenencia.
  if (parsed.data.grupoScoutId) {
    const grupo = await repo.grupoScout.findFirst({ where: { id: parsed.data.grupoScoutId } })
    if (!grupo) return { error: "Grupo inválido" }
  }

  // ¿Ya es miembro?
  const yaMiembro = await prisma.membership.findFirst({
    where: { organizationId: org.organizationId, user: { email: parsed.data.email } },
  })
  if (yaMiembro) return { error: "Ese email ya es miembro del distrito" }

  // ¿Hay otra invitación PENDING (no expirada) al mismo email?
  await markInvitationsExpired(org.organizationId)
  const yaInvitada = await repo.invitation.findFirst({
    where: { email: parsed.data.email, status: "PENDING" },
  })
  if (yaInvitada) return { error: "Ya hay una invitación pendiente para ese email. Revocala primero." }

  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 3600 * 1000)
  const invitation = await prisma.$transaction(async (tx) => {
    const inv = await tx.invitation.create({
      data: {
        organizationId: org.organizationId,
        email: parsed.data.email,
        role: parsed.data.role,
        grupoScoutId: parsed.data.grupoScoutId ?? null,
        expiresAt,
        // token autogenerado por @default(cuid(2))
      },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "invitation.created",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { email: inv.email, role: inv.role },
      },
    })
    return inv
  })

  revalidatePath("/admin/invitaciones")
  return { success: true, token: invitation.token }
}

export async function revokeInvitation(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const id = z.string().min(1).parse(formData.get("id"))
  const repo = forOrg(org.organizationId)
  const inv = await repo.invitation.findFirst({ where: { id, status: "PENDING" } })
  if (!inv) return { error: "Invitación no encontrada o ya procesada" }

  await prisma.$transaction(async (tx) => {
    await tx.invitation.update({
      where: { id },
      data: { status: "REVOKED", revokedAt: new Date() },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: org.userId,
        action: "invitation.revoked",
        targetType: "Invitation",
        targetId: id,
      },
    })
  })
  revalidatePath("/admin/invitaciones")
  return { success: true }
}
```

UI clave: cuando `createInvitation` retorna `{ success: true, token }`, el form muestra una banda con `https://<origin>/invite/<token>` y un botón “Copiar”. Click → `navigator.clipboard.writeText(...)` + feedback visual.

Para construir la URL absoluta necesitamos el origin. Opción A: hardcoded path relativo y que el admin lo concatene mentalmente — feo. Opción B: leer `headers().get('host')` en el server component. Opción C: variable de entorno `NEXT_PUBLIC_APP_URL` que ya existirá en producción. **Decisión**: usar `headers()` del request en el Server Component, pasarlo al Client Component como prop. Documentado.

Auditoría: `invitation.created`, `invitation.revoked`. (`invitation.accepted` ya se loguea en Plan 1.)

Tests Vitest:
- `src/app/(app)/admin/invitaciones/actions.test.ts` — solo si es viable mockear `prisma`/`auth()`. Si no, tests indirectos vía helpers.

Commit: `feat(admin): crear, listar y revocar invitaciones con copiar-link`

---

### Paso 6 — Deep link `/invite/[token]`

Archivos:
- `src/app/invite/[token]/page.tsx` — Server Component:

```tsx
import { auth } from "@/auth"
import { prisma } from "@/lib/db"
import { unstable_update } from "@/auth"
import { redirect } from "next/navigation"

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const session = await auth()

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/invite/${token}`)}`)
  }

  const inv = await prisma.invitation.findUnique({ where: { token } })
  if (!inv || inv.status !== "PENDING" || inv.expiresAt < new Date()) {
    return <InviteResult kind="invalid" />
  }
  if (inv.email.toLowerCase() !== session.user.email!.toLowerCase()) {
    return <InviteResult kind="emailMismatch" expected={inv.email} got={session.user.email!} />
  }

  // ¿Ya es miembro?
  const ya = await prisma.membership.findUnique({
    where: { userId_organizationId: { userId: session.user.id, organizationId: inv.organizationId } },
  })
  if (ya) {
    // Marcar invitation como ACCEPTED igual (idempotente, audit log) y redirigir.
    await prisma.invitation.update({
      where: { id: inv.id },
      data: { status: "ACCEPTED", acceptedAt: ya.createdAt },
    }).catch(() => {})
    redirect("/dashboard")
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.create({
      data: {
        userId: session.user.id,
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
        actorUserId: session.user.id,
        action: "invitation.accepted",
        targetType: "Invitation",
        targetId: inv.id,
        metadata: { role: inv.role, via: "deep-link" },
      },
    })
  })

  await unstable_update({ refreshMemberships: true })
  redirect("/dashboard")
}
```

`InviteResult` es un Client/Server Component que renderiza pantalla amigable según `kind`.

Detalles:
- `pages.signIn` ya redirige a `/login` con `callbackUrl` automático. Verificar que Auth.js lo respete tras un OAuth roundtrip.
- El middleware actual (`authConfig.authorized`) bloquea cualquier ruta que no esté en `PUBLIC_PATHS`. **Acción**: agregar `/invite` a `PUBLIC_PATHS` en `src/auth.config.ts`. La página por sí misma redirige a `/login` si no hay sesión, así que el middleware no debe interceptarla.

Tests Vitest: solo helpers (la lógica del page es difícil de testear sin Playwright). Cubierto en Paso 4.

Commit: `feat(invite): deep link /invite/[token] para aceptar desde email/whatsapp`

---

### Paso 7 — Memberships (listar + editar + expulsar)

Archivos:
- `src/app/(app)/admin/miembros/page.tsx` — Server Component. Carga `memberships` con `include: { user: true, grupoScout: true }`. Render: tabla con avatar, nombre, email, rol, grupo, acciones.
- `src/components/admin/MembershipRow.tsx` — Client Component con form inline para editar (select de rol + select de grupo) y botón “Expulsar” con `<AlertDialog>` de confirmación.
- `src/app/(app)/admin/miembros/actions.ts`:

```ts
"use server"
import { z } from "zod"
import { requireRole, requireUser } from "@/lib/auth-helpers"
import { forOrg, prisma } from "@/lib/db"
import { unstable_update } from "@/auth"
import { assertNotLastAdmin, BusinessError } from "@/lib/membership-rules"
import { revalidatePath } from "next/cache"

const updateSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(["ADMIN", "JUEZ", "ESPECTADOR", "JEFE_PATRULLA"]),
  grupoScoutId: z.string().min(1).optional().or(z.literal("").transform(() => undefined)),
})

export async function updateMembership(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const user = await requireUser()
  const parsed = updateSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
    grupoScoutId: formData.get("grupoScoutId") || undefined,
  })
  if (!parsed.success) return { error: "Datos inválidos" }

  const repo = forOrg(org.organizationId)
  const target = await repo.membership.findFirst({ where: { id: parsed.data.membershipId } })
  if (!target) return { error: "Miembro no encontrado" }

  if (parsed.data.grupoScoutId) {
    const grupo = await repo.grupoScout.findFirst({ where: { id: parsed.data.grupoScoutId } })
    if (!grupo) return { error: "Grupo inválido" }
  }

  try {
    await assertNotLastAdmin(org.organizationId, target.id, parsed.data.role)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "LAST_ADMIN") {
      return { error: "No podés quitar el último ADMIN del distrito" }
    }
    throw e
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.update({
      where: { id: target.id },
      data: { role: parsed.data.role, grupoScoutId: parsed.data.grupoScoutId ?? null },
    })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: user.id,
        action: "membership.updated",
        targetType: "Membership",
        targetId: target.id,
        metadata: {
          fromRole: target.role,
          toRole: parsed.data.role,
          fromGrupo: target.grupoScoutId,
          toGrupo: parsed.data.grupoScoutId ?? null,
        },
      },
    })
  })

  if (target.userId === user.id) {
    await unstable_update({ refreshMemberships: true })
  }
  revalidatePath("/admin/miembros")
  return { success: true }
}

export async function removeMembership(_prev: unknown, formData: FormData) {
  const org = await requireRole(["ADMIN"])
  const user = await requireUser()
  const id = z.string().min(1).parse(formData.get("id"))

  const repo = forOrg(org.organizationId)
  const target = await repo.membership.findFirst({ where: { id } })
  if (!target) return { error: "Miembro no encontrado" }

  try {
    await assertNotLastAdmin(org.organizationId, target.id /* role omitted = removal */)
  } catch (e) {
    if (e instanceof BusinessError) return { error: "No podés expulsar al último ADMIN del distrito" }
    throw e
  }

  await prisma.$transaction(async (tx) => {
    await tx.membership.delete({ where: { id: target.id } })
    await tx.auditLog.create({
      data: {
        organizationId: org.organizationId,
        actorUserId: user.id,
        action: "membership.removed",
        targetType: "Membership",
        targetId: target.id,
        metadata: { removedUserId: target.userId, role: target.role },
      },
    })
  })

  if (target.userId === user.id) {
    // En la práctica nunca llega acá (assertNotLastAdmin bloquea). Pero por si acaso:
    await unstable_update({ refreshMemberships: true })
  }
  revalidatePath("/admin/miembros")
  return { success: true }
}
```

Auditoría: `membership.updated`, `membership.removed`.

Commit: `feat(admin): editar y expulsar miembros con regla de ultimo admin`

---

### Paso 8 — Copy en `es.json`

Agregar namespace `admin` a `src/messages/es.json`. Estructura tentativa:

```json
{
  "admin": {
    "nav": {
      "distrito": "Distrito",
      "grupos": "Grupos Scouts",
      "invitaciones": "Invitaciones",
      "miembros": "Miembros"
    },
    "landing": {
      "title": "Administración del distrito",
      "subtitle": "Gestioná los miembros, grupos e invitaciones de {{nombreDistrito}}"
    },
    "distrito": { "title": "Perfil del distrito", "nombreLabel": "Nombre", "slugLabel": "Identificador (no editable)", "submit": "Guardar cambios" },
    "grupos": {
      "title": "Grupos Scouts",
      "empty": "Aún no hay grupos. Creá el primero abajo.",
      "createTitle": "Crear grupo scout",
      "nombreLabel": "Nombre",
      "slugLabel": "Identificador interno",
      "submit": "Crear grupo",
      "deleteConfirm": "¿Borrar el grupo \"{{nombre}}\"? Esta acción es irreversible.",
      "errors": {
        "slugTaken": "Ya existe un grupo con ese identificador",
        "tieneMiembros": "No se puede borrar: el grupo tiene miembros vinculados",
        "tieneMemberships": "No se puede borrar: hay usuarios asignados a este grupo",
        "tieneInvitaciones": "Hay invitaciones pendientes a este grupo. Revocalas primero."
      }
    },
    "invitaciones": {
      "title": "Invitaciones",
      "newTitle": "Nueva invitación",
      "emailLabel": "Email",
      "roleLabel": "Rol",
      "grupoLabel": "Grupo (opcional)",
      "submit": "Crear invitación",
      "linkReady": "Link listo. Compartilo por WhatsApp / email.",
      "copyLink": "Copiar link",
      "copied": "¡Copiado!",
      "sections": {
        "pending": "Pendientes",
        "accepted": "Aceptadas",
        "expired": "Expiradas / Revocadas"
      },
      "revoke": "Revocar",
      "revokeConfirm": "¿Revocar la invitación a {{email}}?",
      "errors": {
        "emailInvalido": "Email inválido",
        "yaMiembro": "Ese email ya es miembro del distrito",
        "yaInvitada": "Ya hay una invitación pendiente para ese email",
        "grupoInvalido": "El grupo seleccionado no existe"
      }
    },
    "miembros": {
      "title": "Miembros del distrito",
      "columns": { "nombre": "Nombre", "email": "Email", "role": "Rol", "grupo": "Grupo", "acciones": "Acciones" },
      "edit": "Editar",
      "save": "Guardar",
      "remove": "Expulsar",
      "removeConfirm": "¿Expulsar a {{nombre}} del distrito?",
      "errors": {
        "lastAdmin": "No podés quitar el último ADMIN del distrito",
        "notFound": "Miembro no encontrado"
      }
    },
    "invitePage": {
      "validating": "Validando tu invitación...",
      "invalid": { "title": "Invitación inválida o vencida", "subtitle": "Pedile al admin que te genere una nueva." },
      "emailMismatch": { "title": "Esa invitación es para otra cuenta", "subtitle": "La invitación es para {{expected}}, pero estás logueado como {{got}}." }
    },
    "errors": { "forbidden": "No tenés permiso para acceder a esta sección" }
  }
}
```

Commit: `chore(i18n): copy admin (distrito, grupos, invitaciones, miembros)`

---

### Paso 9 — Ajuste a `auth.config.ts`

- Agregar `/invite` a `PUBLIC_PATHS` para que el middleware no fuerce login antes de que la página decida.
- Verificar que `pages.signIn` propaga `callbackUrl` (en Auth.js v5 lo hace por default; el deep link lo construye explícito en el `redirect`).

Commit: `fix(auth): ruta /invite publica para deep link de invitaciones`

---

### Paso 10 — Pulido del wrapper `forOrg`

Antes de los Pasos 5/7, revisar `src/lib/db.ts` y agregar lo que falte:
- `invitation.updateMany` (necesario para `markInvitationsExpired`).
- Garantizar que `update`/`delete` en grupo/membership/invitation hagan check de pertenencia (validar primero con `findFirst` + `organizationId`, o aceptar el `where` existente que ya inyecta `organizationId` — verificar que Prisma lo acepte en `where` único).

Si se hacen cambios al wrapper, sumar tests en `src/lib/db.test.ts` (si existe) o crear uno mínimo.

Commit: `refactor(db): completar wrapper forOrg con updateMany y checks de pertenencia`

---

## Archivos creados / modificados

| Archivo | Acción | Función |
|---|---|---|
| `src/app/(app)/admin/layout.tsx` | crear | Guard `requireRole(['ADMIN'])` + nav |
| `src/app/(app)/admin/page.tsx` | crear | Landing con 4 cards |
| `src/app/(app)/admin/error.tsx` | crear | Error boundary 403 |
| `src/components/admin/AdminNav.tsx` | crear | Sub-nav con links activos |
| `src/app/(app)/admin/distrito/page.tsx` | crear | Form editar nombre |
| `src/app/(app)/admin/distrito/actions.ts` | crear | `updateDistrito` |
| `src/app/(app)/admin/grupos/page.tsx` | crear | Lista + form crear |
| `src/app/(app)/admin/grupos/[id]/page.tsx` | crear | Editar / borrar |
| `src/app/(app)/admin/grupos/actions.ts` | crear | `createGrupo`, `updateGrupo`, `deleteGrupo` |
| `src/app/(app)/admin/invitaciones/page.tsx` | crear | Lista + form crear |
| `src/app/(app)/admin/invitaciones/actions.ts` | crear | `createInvitation`, `revokeInvitation` |
| `src/components/admin/NewInvitationForm.tsx` | crear | Form con `useActionState` y banda “copiar link” |
| `src/app/(app)/admin/miembros/page.tsx` | crear | Lista de memberships |
| `src/app/(app)/admin/miembros/actions.ts` | crear | `updateMembership`, `removeMembership` |
| `src/components/admin/MembershipRow.tsx` | crear | Fila editable + dialog de confirmación |
| `src/app/invite/[token]/page.tsx` | crear | Deep link de aceptación |
| `src/components/invite/InviteResult.tsx` | crear | Pantallas de error/éxito del deep link |
| `src/lib/membership-rules.ts` | crear | `assertNotLastAdmin`, `BusinessError` |
| `src/lib/membership-rules.test.ts` | crear | Tests Vitest |
| `src/lib/invitations.ts` | crear | `markInvitationsExpired` |
| `src/lib/invitations.test.ts` | crear | Tests Vitest |
| `src/lib/auth-helpers.ts` | modificar | Extender `requireRole` para devolver `userId` |
| `src/lib/db.ts` | modificar | Sumar `invitation.updateMany`, asegurar checks de pertenencia en `update`/`delete` |
| `src/auth.config.ts` | modificar | `/invite` en `PUBLIC_PATHS` |
| `src/messages/es.json` | modificar | Namespace `admin` y `invitePage` |
| `src/components/auth/AppHeader.tsx` | modificar | Agregar link “Administración” visible solo si `activeRole === 'ADMIN'` |

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm test          # todos los tests verdes (incluye membership-rules + invitations)
pnpm build         # build exitoso (requiere DATABASE_URL y AUTH_* en env)
```

### Verificación manual end-to-end

Pre-requisito: distrito con al menos 1 ADMIN logueado (puede ser el creado en pruebas de Plan 1, o re-seedear).

**Escenario 1 — Editar distrito**:
1. Como ADMIN ir a `/admin/distrito`. Ver el `slug` deshabilitado.
2. Cambiar `nombre` a “Distrito XYZ Renombrado”. Submit.
3. El header debe reflejar el nuevo nombre tras `unstable_update`.
4. En DB: `Organization.nombre` actualizado, `AuditLog` con `action='organization.updated'`.

**Escenario 2 — CRUD de grupos**:
1. `/admin/grupos`. Crear “Grupo de Prueba” con slug `prueba`. Aparece en la lista.
2. Crear otro grupo con slug `prueba` → error “Ya existe un grupo con ese identificador”.
3. Editar “Grupo de Prueba” → cambiar nombre. Aparece actualizado.
4. Borrar “Grupo de Prueba” → confirmación → eliminado.
5. Crear grupo, asignarlo a una membership existente, intentar borrar → error “tiene usuarios asignados”.

**Escenario 3 — Crear invitación + deep link**:
1. `/admin/invitaciones`. Crear invitación a `nuevo-juez@gmail.com` con role JUEZ y grupo asignado.
2. Banda con link aparece. Copiar.
3. Pegar link en navegador incógnito. Si no hay sesión → redirect a `/login?callbackUrl=...`.
4. Loguear con cuenta cuyo email **no coincide** → ver pantalla de “invitación para otra cuenta” con email esperado vs actual.
5. Loguear con cuenta cuyo email **sí coincide** → membership creada, redirect a `/dashboard`, header muestra el distrito y rol JUEZ.
6. Volver a abrir el link con la misma cuenta → idempotente: ya es miembro, redirect a `/dashboard` sin error.

**Escenario 4 — Revocar invitación**:
1. Crear invitación pendiente.
2. Revocar desde la lista. Pasa a sección “Expiradas / Revocadas”. Estado `REVOKED`.
3. Intentar usar el link revocado → pantalla “invitación inválida o vencida”.

**Escenario 5 — Editar membership**:
1. `/admin/miembros`. Editar a un JUEZ → cambiar a ESPECTADOR + grupo distinto. Guardar.
2. Refrescar la página → cambios persistidos.
3. (Opcional) loguear con la cuenta del JUEZ y forzar un `update()` (recargar dashboard); ver que su rol activo ahora es ESPECTADOR.

**Escenario 6 — Regla del último ADMIN**:
1. Estar logueado como único ADMIN del distrito.
2. Intentar cambiar tu propio rol a JUEZ → error “No podés quitar el último ADMIN del distrito”.
3. Intentar expulsarte → mismo error.
4. Crear otro ADMIN (invitar + aceptar con segunda cuenta), ahora el primero ya puede degradarse o expulsarse.

**Escenario 7 — Auto-expirar invitaciones**:
1. Crear invitación.
2. Modificar manualmente en DB: `UPDATE "Invitation" SET "expiresAt" = NOW() - INTERVAL '1 day' WHERE id = '<id>'`.
3. Recargar `/admin/invitaciones` → la invitación aparece como `EXPIRED` automáticamente.
4. Intentar usar el link → pantalla “invitación inválida”.

**Escenario 8 — Auditoría**:
1. Hacer todas las operaciones anteriores.
2. Query directo: `SELECT action, "targetType", "createdAt" FROM "AuditLog" WHERE "organizationId" = '<id>' ORDER BY "createdAt" DESC LIMIT 20;`
3. Confirmar que aparecen los 8+ tipos de eventos con metadata coherente.

### Criterios de aceptación

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en limpio.
- [ ] Como ADMIN se accede a `/admin` y sus 4 sub-secciones; como JUEZ se ve un 403.
- [ ] El nombre del distrito puede editarse y se refleja en el header sin recargar manualmente.
- [ ] CRUD de grupos funciona y bloquea el borrado cuando hay miembros / invitaciones / users asignados.
- [ ] Crear invitación: aparece el link, copiarlo funciona, el link abre el deep link.
- [ ] Deep link: redirige a login si hace falta, valida email, crea membership, refresca JWT.
- [ ] Revocar invitación pasa a `REVOKED`. El token deja de servir.
- [ ] Auto-expiración lazy marca como `EXPIRED` al listar.
- [ ] Editar miembro (rol + grupo) en una sola action, persiste en DB, audita.
- [ ] Expulsar miembro borra la membership y audita.
- [ ] Regla del último ADMIN bloquea las dos vías (degradación y expulsión).
- [ ] Cuando el ADMIN se autoedita o cambia el nombre del distrito, el JWT se refresca con `unstable_update`.
- [ ] Todos los textos visibles vienen de `src/messages/es.json` namespace `admin`.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| El usuario expulsado / con rol cambiado mantiene JWT stale por hasta 30 días (default JWT TTL) | Alta | Aceptado por diseño. En cada server action sensible, los queries pasan por `forOrg(organizationId)`. Si la membership ya no existe, la UI le muestra que perdió acceso al refrescar. Documentar claramente. |
| `forOrg().update`/`delete` no soporta el `where` único de Prisma | Media | Revisar y arreglar en Paso 10. Patrón: validar pertenencia primero con `findFirst({ where: { id, organizationId } })`, luego operar con `prisma.*` directo. |
| Race condition: dos ADMINs degradan a otro ADMIN al mismo tiempo, ambas pasan el check pero el resultado deja al distrito sin admin | Baja | `assertNotLastAdmin` + el update se hacen en transacción. Sí: una de las dos llegará primero; la segunda fallaría si re-checkea dentro de la tx. Como mejora opcional, mover el check dentro de la transacción. Documentar. |
| Token de invitación adivinable | Baja | `cuid2` ~24 chars, espacio de búsqueda suficiente para resistir adivinanza online. Si se requiere mayor seguridad post-MVP, cambiar a `crypto.randomBytes(32).toString('base64url')`. |
| Email del invitado en mayúsculas/minúsculas distintas que el del JWT | Media | `.toLowerCase()` en ambas comparaciones (mismo patrón que Plan 1). Test específico. |
| `unstable_update` retorna sin esperar la propagación de cookie en el mismo request, y el subsiguiente `redirect()` ve el JWT viejo | Media | Probado en Plan 1 (lección aprendida #2): el patrón `await unstable_update(...); redirect(...)` funcionó. Si vuelve a aparecer, retomar la solución de “fallback en cliente” (ver `MembershipRefresher`). |
| Borrar grupo via FK cascade en producción si se desactiva la validación manual | Baja | La validación está explícita en la action. La FK de `MiembroScout.grupoScoutId` usa `Restrict`, así que la DB impide el cascade silencioso a miembros. Las de `Membership` e `Invitation` usan `SetNull`, lo cual sería un comportamiento aceptable pero queremos avisar al admin antes. |
| Falta de feedback visual al copiar el link | Baja | Toast/badge “¡Copiado!” por 1.5s, estado en el botón. |
| Build de Next.js detecta imports incompatibles con Edge en el `auth.config.ts` modificado | Baja | Ningún cambio del Paso 9 introduce imports de Node. Verificar con `pnpm build` antes de mergear. |

---

## Antes de ejecutar — checklist

- [ ] Plan 1 mergeado en `main` con todos los fixes de las lecciones aprendidas.
- [ ] Branch limpio, `git status` sin pendientes.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en `main`.
- [ ] Verificar en `prisma/migrations/...` si Plan 0b creó el índice parcial `WHERE status = 'PENDING'` en `Invitation`. Si no está, decidir si se agrega como sub-paso o se valida solo en código (decisión #4 del plan).
- [ ] Confirmar que `next-auth@beta` está en una versión que soporta `unstable_update` correctamente (ya validado en Plan 1).
- [ ] Tener al menos 2 cuentas de Google disponibles para los escenarios 5 y 6 (segundo ADMIN para validar la regla del último admin sin riesgo).
- [ ] DB con seed corrido (los grupos demo del seed simplifican varios escenarios).

---

## Proceso de planeación (educativo)

Este plan se redactó con Claude Opus en plan mode siguiendo el workflow Opus/Sonnet del master plan. Los puntos clave:

1. **Lectura previa**: el agente leyó `CLAUDE.md` (con las convenciones de auth de Plan 1), el master plan, el plan 1 completo (incluyendo la sección “Lecciones aprendidas”), el `prisma/schema.prisma`, los helpers de auth y el `auth.config.ts`. No hubo necesidad de cambios en el schema.

2. **Contradicción detectada con el master plan**: el master plan original define Plan 2 como “Gestión de miembros, invitaciones y grupos scouts”, pero el pedido del usuario para esta sesión excluyó explícitamente el CRUD de Grupos Scouts. La pregunta se planteó al usuario como decisión #1, con tres opciones (CRUD mínimo / CRUD completo / excluir totalmente). El usuario eligió **CRUD completo**, lo cual realineó este plan con el roadmap original y destrabó el campo `grupoScoutId` en invitaciones.

3. **Siete decisiones planteadas al usuario** (en dos tandas):
   - Alcance de Grupos Scouts → CRUD completo.
   - Mecanismo de entrega de invitación → copiar link en UI (sin email).
   - Visibilidad de la página admin → solo ADMIN.
   - Expiración de invitaciones → fija en 7 días.
   - Paginación → carga completa.
   - Comportamiento si se intenta sacar el último ADMIN → bloquear con error de negocio.
   - Edición de membership → una sola acción combinada (rol + grupoScoutId).

4. **Decisiones que el plan tomó solo** (sin preguntar, por ser obvias o por seguir convenciones ya establecidas):
   - Reenviar invitación = revocar + crear nueva (cero columnas extra).
   - Email ya miembro / ya invitado pendiente → error de negocio.
   - Auto-expirar invitaciones → lazy en el listado, sin cron.
   - Slug del distrito inmutable post-creación.
   - Token de invitación = `cuid2` (default del schema).
   - Errores de negocio con `return { error }` + `useActionState` (lección de Plan 1).
   - Refresh de JWT con `unstable_update` cuando el ADMIN se autoedita (convención cerrada en Plan 1).
   - Estructura de rutas `/admin/...` debajo de `(app)`.
   - Deep link `/invite/[token]` separado del flow de `/onboarding`.
   - Auditoría desde el primer commit del plan.

5. **Reuso de patrones de Plan 1**: el plan recicla deliberadamente el patrón “Server Component carga datos + Client Component con `useActionState` envía mutación + revalidatePath para refrescar”, y el patrón de transacciones `prisma.$transaction` con `auditLog.create` co-localizado. Esto permite que el `feat()` size de cada commit sea predecible y que Sonnet pueda ejecutar con poca ambigüedad.

6. **Alineación con CLAUDE.md**: cada decisión técnica se contrastó contra las convenciones del proyecto (tenant isolation vía `forOrg`, naming bilingüe, server actions sobre API routes, Zod en el borde, copy en `es.json`, errores de negocio sin `throw`, refresh post-mutación). No hay decisiones del plan que las contradigan.

---

## Preguntas abiertas para el usuario

Ninguna decisión arquitectónica queda pendiente. Tareas operacionales antes (o durante) la ejecución:

1. Confirmar si la migración de Plan 0b incluyó el índice parcial `(organizationId, email) WHERE status = 'PENDING'` en `Invitation`. Si no, decidir en ejecución si se agrega vía nueva migración o si se confía en la validación en código.
2. Para el Escenario 6 (regla del último ADMIN) y el Escenario 3 con email no coincidente, conviene tener una segunda cuenta de Google disponible. Confirmar la estrategia (segunda cuenta vs alias `+algo` en gmail).
3. Si durante la ejecución el comportamiento de `unstable_update` falla en algún caso nuevo (ej: en el deep link de aceptación), retomar la solución de fallback vía Client Component (`MembershipRefresher`) que se documentó en Plan 1.

---

## Commits asociados

| Hash | Mensaje |
|---|---|
| `111f3c8` | `refactor(db): invitation.updateMany en forOrg; requireRole devuelve userId` |
| `ee76f7a` | `feat(admin): helpers de reglas (ultimo admin, expiracion lazy) + tests` |
| `5ab14a0` | `feat(admin): layout protegido /admin con guard de rol, landing y nav` |
| `0168c2b` | `feat(admin): editar nombre del distrito` |
| `091401c` | `feat(admin): CRUD de grupos scouts con validacion de borrado seguro` |
| `b5dcae7` | `feat(admin): crear, listar y revocar invitaciones con copiar-link` |
| `2869c5e` | `feat(invite): deep link /invite/[token] para aceptar desde WhatsApp/email` |
| `60dbdc4` | `feat(admin): editar y expulsar miembros con regla de ultimo admin` |

Notas de ejecución:
- i18n y PUBLIC_PATHS incluidos en commit 5ab14a0 (agrupados con el layout admin)
- Zod v4 usa `.issues` en vez de `.errors` en ZodError — ajustado en acciones
- El wrapper `forOrg.findMany` pierde inferencia de tipos con `include`; las páginas que necesitan relaciones usan `prisma.*` directo con `where: { organizationId }` explícito
