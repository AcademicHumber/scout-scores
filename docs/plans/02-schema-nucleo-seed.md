# Plan 02 — Schema núcleo + seed

## Contexto

Plan 0a dejó el repo con scaffolding listo, pero `prisma/schema.prisma` está vacío (solo `generator` y `datasource`). Sin schema no hay nada que el resto del sistema pueda apoyar: Plan 1 (auth) necesita las tablas de Auth.js, Plan 2 (gestión de miembros) necesita `GrupoScout`, `Membership` e `Invitation`, y todos los planes posteriores asumen que la regla de tenant isolation ya está establecida.

Este plan introduce el **esqueleto persistente del sistema en Capa 1**: las tablas que existen el día uno y que no van a cambiar de forma significativa después. Quedan deliberadamente fuera las entidades de scoring (`Event`, `Posta`, `Patrulla`, `ScoreSheet`, etc.); se introducen en sus planes correspondientes para mantener cada migración acotada y trazable.

`MiembroScout` se incluye como **stub mínimo** según ADR-0001: campos básicos, sin relaciones a `Patrulla` ni `Event`. La idea es dejar la puerta abierta a Capa 2 (planes 12–16) sin pagar costo de modelado prematuro.

El segundo entregable importante es el **patrón de tenant isolation** en `src/lib/db.ts`. Esta decisión condiciona cómo se escribe cada query desde Plan 1 en adelante, y por eso se resuelve acá y no más tarde.

---

## Alcance

### Incluye

- **Schema Prisma con los siguientes modelos**:
  - `Organization` (Distrito) — tenant raíz.
  - `GrupoScout` — grupos persistentes dentro del distrito.
  - `User` — cuenta autenticada con Google (shape compatible con Auth.js v5).
  - `Account`, `Session`, `VerificationToken` — tablas estándar requeridas por `@auth/prisma-adapter`.
  - `Membership` — relación `User ↔ Organization` con `role` y `grupoScoutId?` opcional.
  - `Invitation` — invitación por email pendiente de aceptación, con campo `status`.
  - `MiembroScout` — stub de persona del dominio scout (sin relaciones a eventos).
  - `AuditLog` — bitácora genérica de acciones administrativas.
- **Enums**: `Role`, `InvitationStatus`, `CategoriaScout`.
- **Migración inicial única**: `prisma/migrations/<timestamp>_init/migration.sql` generada con `prisma migrate dev --name init`.
- **`src/lib/db.ts`**: singleton de `PrismaClient` + helper `forOrg(organizationId)` que devuelve un wrapper con queries pre-scopadas a los modelos org-scoped.
- **`prisma/seed.ts`** — script idempotente con datos demo:
  - 1 `Organization` ("Distrito Scout Demo").
  - 3 `GrupoScout` ("Juan Pablo II", "Don Bosco", "San Jorge").
  - 4 `User` demo (1 admin + 2 jueces + 1 jefe de patrulla) con sus `Membership`.
  - 12 `MiembroScout` distribuidos entre grupos y categorías.
  - 2 `Invitation` pendientes (1 juez, 1 espectador).
  - 5 `AuditLog` de ejemplo.
- **Configuración del seed en `prisma.config.ts`** (Prisma 7 mueve `prisma.seed` desde `package.json` a este archivo).
- **Dependencias nuevas**: `@paralleldrive/cuid2` (para los seeds y para futuros server-actions que necesiten ID antes de tocar la DB), `tsx` (dev) para ejecutar el seed con TypeScript, `zod` (dev/prod) — se introduce ya como dep porque la convención del proyecto es validar en el borde con Zod desde el primer Server Action de Plan 1.

### NO incluye (explícito, para evitar scope creep)

- Modelos de scoring (`Event`, `Posta`, `Patrulla`, `ScoreTemplate`, `TemplateCriterion`, `JudgeAssignment`, `ScoreSheet`, `ScoreEntry`, `ScoreSheetRevision`, `EventLeaderboardSnapshot`, `PublicShareLink`, `PatrullaLead`) → Planes 03–07.
- Configuración de Auth.js, callbacks, middleware de sesión → **Plan 1**.
- `Authenticator` (passkeys) — Auth.js v5 lo soporta, pero el sistema arranca con Google OAuth como único método (master plan). Si se quisiera, se agrega en plan futuro sin breaking change.
- Tabla pivote `MiembroScout ↔ Patrulla` → Plan 4b / Plan 11.
- Helpers de auth (`requireRole`, `getCurrentOrg`, `getCurrentUser`) → **Plan 1**.
- Validaciones de negocio sobre Membership (ej: "un distrito siempre tiene al menos un admin") → Plan 2.
- Tests automatizados del schema y del wrapper → cuando se introduzca Vitest en Plan 1.

---

## Decisiones técnicas

### IDs: `cuid2` en todas las tablas

Prisma 5+ soporta `@default(cuid(2))` nativo en `String @id`, que genera identificadores en formato cuid2 (mejor entropía y resistente a colisiones). Lo aplicamos a **todas** las tablas que tengan `id` propia, incluidas las de Auth.js (`User`, `Account`, `Session`).

`VerificationToken` no tiene `id` propio (su clave primaria compuesta es `(identifier, token)`, según el shape estándar del adapter). No aplica la regla porque no hay campo `id` que decidir.

**Alternativa descartada**: seguir el shape literal de la doc de Auth.js (`cuid()` viejo o `uuid()`) en las tablas de auth. Descartado por consistencia: la convención del master plan es cuid2 en todo el schema, sin excepciones por tabla.

### Tenant isolation: wrapper explícito (`forOrg`)

`src/lib/db.ts` exporta dos cosas:

1. `prisma` — singleton de `PrismaClient` (con la dance de `globalThis` para HMR en dev).
2. `forOrg(organizationId)` — función que devuelve un objeto con accessors **solo** para los modelos org-scoped. Cada accessor pre-inyecta `organizationId` en el `where` de las operaciones de lectura/escritura/borrado.

```ts
// pseudo-shape
const orgDb = forOrg("clxyz...");
await orgDb.grupoScout.findMany();        // WHERE organizationId = 'clxyz...'
await orgDb.grupoScout.create({ data: { nombre: "..." } });
//                                ^^ NO requiere pasar organizationId; el wrapper lo añade.
```

El wrapper expone solo: `grupoScout`, `membership`, `invitation`, `miembroScout`, `auditLog`. **No** expone `organization`, `user`, `account`, `session`, `verificationToken` (esos no son tenant-scoped y van por `prisma.*` directo).

**Por qué este patrón en lugar del middleware `$use` clásico**:
- Prisma 7 deprecó `$use` definitivamente. Las opciones modernas son `$extends` (client extensions) o wrappers de aplicación.
- Client extensions con `AsyncLocalStorage` funcionan, pero si el contexto no se setea en algún code path (ej: una ruta nueva que olvidó pasar por el middleware), las queries se ejecutan **sin** filtro y causan fuga silenciosa de datos cross-tenant.
- El wrapper explícito hace imposible olvidarse: si querés tocar `GrupoScout`, **tenés** que llamar a `forOrg(...)`. No hay alternativa accesible.
- Costo: un poco más de código boilerplate y necesidad de actualizar el wrapper cuando se agregan modelos org-scoped en planes futuros. Aceptable.

**Alternativa descartada (B)**: client extension + `AsyncLocalStorage` poblado desde middleware Next. Más ergonómico (`prisma.event.findMany()` "just works"), pero el riesgo de leak silencioso es la razón principal por la que existe la regla de tenant isolation. Elegir el patrón más seguro paga.

**Alternativa descartada (C)**: postergar el wrapper a Plan 1 cuando exista el contexto de sesión. Descartado: el wrapper no necesita la sesión (recibe `organizationId` por argumento), y dejarlo definido en 0b alinea Plan 1 desde el inicio. Pero **sí** se difiere a Plan 1 la integración con `getCurrentOrg()`/`requireRole()` — eso necesita Auth.js.

### Enums

| Enum | Valores | Plan donde nace |
|---|---|---|
| `Role` | `ADMIN`, `JUEZ`, `ESPECTADOR`, `JEFE_PATRULLA` | 0b |
| `InvitationStatus` | `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED` | 0b |
| `CategoriaScout` | `LOBATO`, `EXPLORADOR`, `PIONERO`, `ROVER`, `DIRIGENTE` | 0b |

Postgres permite agregar valores a un enum sin downtime (`ALTER TYPE ... ADD VALUE`), por lo que extender estos enums en planes futuros (ej: Plan 13 puede añadir más categorías) no requiere migración destructiva.

**Alternativa descartada**: usar `String` con validación Zod en runtime. Más flexible, pero pierde la integridad referencial nativa de Postgres y obliga a duplicar el conjunto de valores en cada Server Action. El enum gana acá.

### Estrategia de borrado (`onDelete`)

Las relaciones siguen estas reglas:

| Relación | onDelete | Razón |
|---|---|---|
| `GrupoScout.organization` | `Cascade` | Borrar un distrito borra sus grupos (operación destructiva, intencional). |
| `Membership.user` | `Cascade` | Si el `User` se borra, sus memberships desaparecen. |
| `Membership.organization` | `Cascade` | Idem para distrito. |
| `Membership.grupoScout` | `SetNull` | Si se borra el grupo, la membership sobrevive sin grupo asignado. |
| `Invitation.organization` | `Cascade` | Borrar distrito invalida sus invitaciones pendientes. |
| `Invitation.grupoScout` | `SetNull` | El grupo es opcional ya. |
| `MiembroScout.organization` | `Cascade` | Idem distrito. |
| `MiembroScout.grupoScout` | `Restrict` | **No** permitir borrar un grupo con miembros activos; primero hay que reasignarlos. |
| `MiembroScout.user` | `SetNull` | Si el `User` se borra, el `MiembroScout` sobrevive como persona del dominio. |
| `Account.user` / `Session.user` | `Cascade` | Estándar Auth.js. |
| `AuditLog.organization` | `Cascade` | La bitácora es del distrito; si se borra, se va con él. |
| `AuditLog.actorUser` | `SetNull` | Si el usuario actor se borra, el log queda anónimo. |

### `User.email`: unique global

Un mismo `User` (cuenta Google) puede pertenecer a múltiples distritos vía `Membership`. Por eso `email` es **unique global** en `User`, no compuesto con `organizationId`. La unicidad por distrito se modela en `Membership(userId, organizationId)`.

### `Invitation`: unique parcial

Solo puede haber **una** invitación `PENDING` por (`organizationId`, `email`). Aceptadas, revocadas y expiradas no cuentan para esa restricción.

Postgres permite expresar esto con un índice único parcial (`WHERE status = 'PENDING'`). Prisma 7 permite definir índices SQL custom vía `@@index(..., type: Hash)` y similares, pero los índices únicos parciales requieren raw SQL en la migración. Estrategia: la migración generada por `prisma migrate dev` se completa **a mano** agregando el `CREATE UNIQUE INDEX ... WHERE status = 'PENDING'` antes de aplicar.

### Decimal vs Float

No hay campos de puntaje todavía (eso llega en Plan 03 y siguientes), pero la convención queda fijada: cuando aparezcan, **siempre** `Decimal`, nunca `Float`. Documentado en CLAUDE.md y en el master plan.

### Generación de IDs en código (seed y futuro)

El seed necesita conocer los IDs de las entidades que crea para vincular relaciones. Dos opciones:

- A) Crear con `await prisma.organization.create(...)` y leer `result.id`. Funciona pero obliga a esperar cada inserción antes de poder referenciarla.
- B) Generar los IDs antes con `createId()` de `@paralleldrive/cuid2` y pasarlos explícitamente al `create`. Permite armar todas las refs antes de tocar la DB y luego hacer `createMany` cuando convenga.

Elegimos **A** para legibilidad del seed (operaciones secuenciales, no es código caliente). `@paralleldrive/cuid2` se instala igual porque va a ser útil en Plan 5b (offline sync genera IDs cliente-side) y, en general, donde haga falta un ID antes del round-trip a DB.

### Ubicación del cliente generado

Plan 0a configuró `output = "../src/generated/prisma"` (Prisma 7 con generator `prisma-client`, no `prisma-client-js`). Lo respetamos. El gitignore debe excluir `src/generated/`.

### Migraciones: una sola migración inicial

Aunque hay muchos modelos, este plan ejecuta **una sola** migración: `init`. No tiene sentido fragmentar antes de la primera deploy. Migraciones temáticas vienen después, cuando el sistema esté en prod.

### Seed: idempotente vía `upsert`

El script no asume DB vacía. Usa `upsert` con claves únicas estables (ej: `email` para `User`, `(organizationId, slug)` para `GrupoScout`) para que correrlo dos veces no duplique datos. Ejecutable con `pnpm prisma db seed` o `pnpm db:seed` (alias agregado a `package.json`).

---

## Modelo de datos (schema completo propuesto)

> Este es el shape final del schema a codear. Sirve también como referencia visual del scope del plan.

```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "postgresql"
}

// ──────────────────────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────────────────────

enum Role {
  ADMIN
  JUEZ
  ESPECTADOR
  JEFE_PATRULLA
}

enum InvitationStatus {
  PENDING
  ACCEPTED
  REVOKED
  EXPIRED
}

enum CategoriaScout {
  LOBATO
  EXPLORADOR
  PIONERO
  ROVER
  DIRIGENTE
}

// ──────────────────────────────────────────────────────────────
// Tenant raíz
// ──────────────────────────────────────────────────────────────

model Organization {
  id        String   @id @default(cuid(2))
  nombre    String                         // ej: "Distrito Scout Santa Cruz"
  slug      String   @unique               // ej: "santa-cruz"
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  gruposScouts  GrupoScout[]
  memberships   Membership[]
  invitations   Invitation[]
  miembros      MiembroScout[]
  auditLogs     AuditLog[]
}

// ──────────────────────────────────────────────────────────────
// Grupo Scout
// ──────────────────────────────────────────────────────────────

model GrupoScout {
  id             String   @id @default(cuid(2))
  organizationId String
  nombre         String                          // ej: "Grupo Scout Juan Pablo II"
  slug           String                          // unique dentro del distrito
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  organization Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  memberships  Membership[]
  invitations  Invitation[]
  miembros     MiembroScout[]

  @@unique([organizationId, slug])
  @@index([organizationId])
}

// ──────────────────────────────────────────────────────────────
// User (Auth.js v5 compatible) + tablas estándar del adapter
// ──────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(cuid(2))
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts        Account[]
  sessions        Session[]
  memberships     Membership[]
  miembrosScout   MiembroScout[]   // un User puede ser linkeado a su MiembroScout (dirigente)
  auditLogs       AuditLog[]       @relation("AuditLogActor")
}

model Account {
  id                String  @id @default(cuid(2))
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid(2))
  sessionToken String   @unique
  userId       String
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String
  expires    DateTime

  @@unique([identifier, token])
}

// ──────────────────────────────────────────────────────────────
// Membership — User ↔ Organization con rol
// ──────────────────────────────────────────────────────────────

model Membership {
  id             String   @id @default(cuid(2))
  userId         String
  organizationId String
  role           Role
  grupoScoutId   String?               // opcional: para JEFE_PATRULLA y vistas filtradas
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  grupoScout   GrupoScout?  @relation(fields: [grupoScoutId], references: [id], onDelete: SetNull)

  @@unique([userId, organizationId])
  @@index([organizationId])
  @@index([organizationId, role])
}

// ──────────────────────────────────────────────────────────────
// Invitation — email pre-registrado por admin
// ──────────────────────────────────────────────────────────────

model Invitation {
  id             String           @id @default(cuid(2))
  organizationId String
  email          String
  role           Role
  grupoScoutId   String?
  token          String           @unique     // para el link de aceptación
  status         InvitationStatus @default(PENDING)
  expiresAt      DateTime
  acceptedAt     DateTime?
  revokedAt      DateTime?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  grupoScout   GrupoScout?  @relation(fields: [grupoScoutId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([email])
  // Índice único parcial WHERE status = 'PENDING' se agrega a mano en la migración SQL.
}

// ──────────────────────────────────────────────────────────────
// MiembroScout — stub mínimo (ver ADR-0001)
// ──────────────────────────────────────────────────────────────

model MiembroScout {
  id             String          @id @default(cuid(2))
  organizationId String
  grupoScoutId   String
  nombre         String
  fechaNacimiento DateTime?
  categoria      CategoriaScout?
  userId         String?                                    // linkeo opcional con User (típicamente DIRIGENTE)
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  grupoScout   GrupoScout   @relation(fields: [grupoScoutId], references: [id], onDelete: Restrict)
  user         User?        @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([organizationId, grupoScoutId])
  @@index([userId])
}

// ──────────────────────────────────────────────────────────────
// AuditLog — bitácora administrativa genérica
// ──────────────────────────────────────────────────────────────

model AuditLog {
  id             String   @id @default(cuid(2))
  organizationId String
  actorUserId    String?                          // null si lo hizo el sistema
  action         String                           // ej: "organization.created", "invitation.sent"
  targetType     String?                          // ej: "Invitation", "GrupoScout"
  targetId       String?
  metadata       Json?                            // payload libre con detalles relevantes
  createdAt      DateTime @default(now())

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  actorUser    User?        @relation("AuditLogActor", fields: [actorUserId], references: [id], onDelete: SetNull)

  @@index([organizationId, createdAt])
  @@index([organizationId, action])
}
```

---

## Implementación

### Paso 1 — Instalar dependencias nuevas

```bash
pnpm add @paralleldrive/cuid2 zod
pnpm add -D tsx
```

- `@paralleldrive/cuid2`: generador de IDs server-side cuando hace falta antes del DB round-trip.
- `zod`: validación en el borde de Server Actions (se usa desde Plan 1, pero la dep entra ya).
- `tsx`: ejecutar `prisma/seed.ts` con TypeScript directamente sin compilar.

Commit:
```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: agregar deps para schema y seed (cuid2, zod, tsx)"
```

### Paso 2 — Escribir `prisma/schema.prisma` completo

Reemplazar el archivo actual con el shape completo de la sección "Modelo de datos" arriba.

Verificar formato con `pnpm prisma format`.

Commit (sin migrar todavía):
```bash
git add prisma/schema.prisma
git commit -m "feat(prisma): definir schema núcleo (org, grupos, users, memberships, invitations, miembros, audit)"
```

### Paso 3 — Generar la migración inicial

Confirmar que Postgres está corriendo (`docker compose up -d db`), después:

```bash
pnpm prisma migrate dev --name init
```

Esto crea `prisma/migrations/<timestamp>_init/migration.sql` y aplica el schema a la DB local. También regenera el cliente en `src/generated/prisma/`.

### Paso 4 — Editar la migración SQL para agregar el índice único parcial

Abrir `prisma/migrations/<timestamp>_init/migration.sql` y añadir al final:

```sql
-- Solo una invitación PENDING por (organizationId, email)
CREATE UNIQUE INDEX "Invitation_org_email_pending_unique"
ON "Invitation" ("organizationId", "email")
WHERE "status" = 'PENDING';
```

Re-aplicar la migración para que el índice quede en la DB:

```bash
pnpm prisma migrate reset --force    # solo en dev, drop & re-apply todas las migraciones
```

> **Nota**: `migrate reset` es seguro acá porque la DB está vacía y no hay datos reales. En prod nunca se usa.

Commit:
```bash
git add prisma/migrations/
git commit -m "feat(prisma): migración inicial + índice parcial en Invitation"
```

### Paso 5 — Crear `src/lib/db.ts`

Esqueleto del archivo (la implementación completa se escribe en la sesión Sonnet; este plan establece la API):

```ts
// src/lib/db.ts
import { PrismaClient } from "@/generated/prisma";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Devuelve un wrapper de queries pre-scopadas a una organización.
 *
 * Solo expone los modelos que tienen `organizationId`. Modelos cross-tenant
 * (User, Account, Session, VerificationToken, Organization) se acceden via
 * `prisma.*` directo.
 *
 * Uso:
 *   const orgDb = forOrg(session.organizationId);
 *   await orgDb.grupoScout.findMany();
 *   await orgDb.miembroScout.create({ data: { nombre, grupoScoutId } });
 */
export function forOrg(organizationId: string) {
  return {
    grupoScout: {
      findMany: (args?: Parameters<typeof prisma.grupoScout.findMany>[0]) =>
        prisma.grupoScout.findMany({ ...args, where: { ...args?.where, organizationId } }),
      findFirst: (args?: Parameters<typeof prisma.grupoScout.findFirst>[0]) =>
        prisma.grupoScout.findFirst({ ...args, where: { ...args?.where, organizationId } }),
      create: (args: { data: Omit<Parameters<typeof prisma.grupoScout.create>[0]["data"], "organizationId" | "organization"> }) =>
        prisma.grupoScout.create({ data: { ...args.data, organizationId } }),
      update: (args: Parameters<typeof prisma.grupoScout.update>[0]) =>
        prisma.grupoScout.update({ ...args, where: { ...args.where, organizationId } }),
      delete: (args: Parameters<typeof prisma.grupoScout.delete>[0]) =>
        prisma.grupoScout.delete({ ...args, where: { ...args.where, organizationId } }),
      count: (args?: Parameters<typeof prisma.grupoScout.count>[0]) =>
        prisma.grupoScout.count({ ...args, where: { ...args?.where, organizationId } }),
    },
    membership:    /* idem, mismos métodos */,
    invitation:    /* idem */,
    miembroScout:  /* idem */,
    auditLog:      /* idem (sin update/delete: append-only) */,
  };
}
```

**Notas de implementación para Sonnet**:
- `auditLog` solo debe exponer `findMany`, `findFirst`, `create`, `count`. No `update` ni `delete` — la bitácora es append-only.
- El tipado por modelo es repetitivo. Si el boilerplate molesta, factorizar un helper genérico `scopedDelegate<T>(...)` pero **sin** sacrificar tipos. La sesión Sonnet decide el balance.
- **Nunca** exponer `prisma.organization` desde el wrapper — ese modelo se accede directo por `prisma.organization` con el `id` del distrito.
- Documentar en JSDoc que para cualquier query nueva sobre tablas org-scoped, se usa `forOrg(...)`. **Nunca** `prisma.grupoScout.*` directo en código de feature.

Commit:
```bash
git add src/lib/db.ts
git commit -m "feat(db): cliente Prisma singleton + helper forOrg() para tenant isolation"
```

### Paso 6 — Configurar el seed en `prisma.config.ts`

Editar `prisma.config.ts`:

```ts
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
```

Agregar script alias en `package.json`:

```json
{
  "scripts": {
    "db:seed": "prisma db seed",
    "db:reset": "prisma migrate reset --force"
  }
}
```

### Paso 7 — Escribir `prisma/seed.ts`

Estructura del archivo:

```ts
// prisma/seed.ts
import { PrismaClient, Role, CategoriaScout, InvitationStatus } from "../src/generated/prisma";
import { createId } from "@paralleldrive/cuid2";

const prisma = new PrismaClient();

async function main() {
  // 1) Distrito demo
  const distrito = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { nombre: "Distrito Scout Demo", slug: "demo" },
  });

  // 2) Grupos scouts
  const grupos = await Promise.all(
    [
      { slug: "juan-pablo-ii", nombre: "Grupo Scout Juan Pablo II" },
      { slug: "don-bosco", nombre: "Grupo Scout Don Bosco" },
      { slug: "san-jorge", nombre: "Grupo Scout San Jorge" },
    ].map((g) =>
      prisma.grupoScout.upsert({
        where: { organizationId_slug: { organizationId: distrito.id, slug: g.slug } },
        update: { nombre: g.nombre },
        create: { ...g, organizationId: distrito.id },
      }),
    ),
  );

  // 3) Users demo + Memberships
  //    - admin@demo.local → ADMIN del distrito
  //    - juez1@demo.local → JUEZ
  //    - juez2@demo.local → JUEZ
  //    - jefe-jpii@demo.local → JEFE_PATRULLA, grupo Juan Pablo II
  //    Cada uno con upsert por email + Membership por (userId, organizationId).

  // 4) MiembroScout: 12 personas distribuidas
  //    - 4 lobatos en Juan Pablo II
  //    - 4 exploradores en Don Bosco
  //    - 3 pioneros en San Jorge
  //    - 1 dirigente en Juan Pablo II linkeado al User "jefe-jpii@demo.local"

  // 5) Invitaciones pendientes: 2
  //    - "futuro-juez@demo.local" rol JUEZ
  //    - "espectador@demo.local"  rol ESPECTADOR
  //    Token random (createId()), expiresAt = now + 7 días, status PENDING

  // 6) AuditLog: 5 entradas
  //    - "organization.created" (actor: admin)
  //    - "grupoScout.created" x3 (actor: admin)
  //    - "invitation.sent" (actor: admin, target: la primera invitation)

  console.log(`Seed completo. Distrito: ${distrito.nombre} (${distrito.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Detalles a respetar**:
- Todo upsert (idempotente). Correrlo dos veces no duplica.
- Emails con dominio `@demo.local` para que sea evidente que son ficticios.
- Fechas de nacimiento de los `MiembroScout` razonables para la categoría: lobatos 7-10 años, exploradores 11-14, pioneros 15-17. Calcular contra `2026-04-26`.
- Output al final: imprimir `console.log` con un resumen para que el dev vea qué se creó.

Ejecutar:
```bash
pnpm db:seed
```

Commit:
```bash
git add prisma/seed.ts prisma.config.ts package.json
git commit -m "feat(seed): script de seed con datos demo (distrito, grupos, users, miembros, invitaciones, audit)"
```

### Paso 8 — Actualizar `.gitignore` y `docs/README.md`

**`.gitignore`** — agregar:
```
# Prisma client generado
src/generated/
```

**`docs/README.md`** — marcar Plan 02 como ✓ y actualizar índice si hace falta.

**`CLAUDE.md`** (raíz) — actualizar la sección "Estado actual" para que refleje 0b completado y el próximo plan sea el 1.

Commit:
```bash
git add .gitignore docs/README.md CLAUDE.md
git commit -m "docs: marcar Plan 0b completado y actualizar índice"
```

### Paso 9 — Copiar este plan al repo (ya está hecho al final de la sesión de planeación)

Si por algún motivo no estuviera, copiar este archivo a `docs/plans/02-schema-nucleo-seed.md` y commitear.

---

## Verificación

Al completar la implementación, los siguientes comandos deben pasar **sin errores**:

```bash
# DB local levantada
docker compose up -d db
docker compose ps                 # db: Up (healthy)

# Migración aplicada limpia
pnpm prisma migrate reset --force # opcional: forzar estado conocido
pnpm prisma migrate deploy

# Seed corre dos veces sin error y sin duplicados
pnpm db:seed
pnpm db:seed                       # idempotente

# Cliente generado
ls src/generated/prisma            # archivos del cliente Prisma presentes

# Calidad
pnpm typecheck
pnpm lint
pnpm build
```

### Criterios de aceptación

- [ ] `pnpm prisma migrate dev` aplica una migración limpia desde DB vacía.
- [ ] `pnpm prisma studio` abre y muestra todas las tablas: `Organization`, `GrupoScout`, `User`, `Account`, `Session`, `VerificationToken`, `Membership`, `Invitation`, `MiembroScout`, `AuditLog`.
- [ ] El índice parcial `Invitation_org_email_pending_unique` existe en Postgres (verificar con `\di` desde `psql` o equivalente).
- [ ] `pnpm db:seed` corre sin error y crea: 1 distrito, 3 grupos, 4 users, 4 memberships, 12 miembros scout, 2 invitations PENDING, 5 audit logs.
- [ ] Correr `pnpm db:seed` por segunda vez **no duplica** ningún registro (verificable contando filas antes/después).
- [ ] Importar `prisma` y `forOrg` desde `@/lib/db` compila con tipos correctos.
- [ ] Ejemplo manual en un script throwaway: `forOrg(distrito.id).grupoScout.findMany()` devuelve los 3 grupos del seed.
- [ ] Ejemplo manual: `forOrg(distrito.id).grupoScout.findMany()` con un `organizationId` inexistente devuelve `[]` (filtrado correcto).
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm build` pasan en verde.
- [ ] CI (`.github/workflows/ci.yml`) pasa en verde con el `DATABASE_URL` placeholder (Prisma generate no necesita conexión).
- [ ] `git log --oneline` muestra ~7 commits temáticos (uno por paso, no un monocommit).

---

## Riesgos y notas

1. **Compatibilidad Auth.js v5 + Prisma 7**: el adapter oficial `@auth/prisma-adapter` puede no estar 100% certificado contra Prisma 7 al momento de ejecutar Plan 1. Si surgen incompatibilidades, son problema de Plan 1, no de 0b: el schema es estándar y se adapta. Documentar en Plan 1 si hace falta.

1b. **`prisma-client` generator requiere driver adapter — incompatibilidad descubierta en ejecución**: el generator `prisma-client` de Prisma 7 (a diferencia del antiguo `prisma-client-js`) exige que el `PrismaClient` se instancie con `adapter: SqlDriverAdapterFactory` o `accelerateUrl: string`. No existe la conexión directa vía variable de entorno que existía en Prisma 5/6. Solución adoptada: instalar `@prisma/adapter-pg` + `pg` + `@types/pg` y usar `new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) })` en `src/lib/db.ts` y en `prisma/seed.ts`. **Impacto en planes futuros**: todo código que instancie `PrismaClient` directamente debe pasar el adapter. Esto incluye el posible helper de `@auth/prisma-adapter` en Plan 1 — verificar cómo lo inicializa ese package.
2. **`prisma migrate dev` regenera el cliente**: si Sonnet ejecuta y aparecen errores de imports, basta con `pnpm prisma generate` para forzar regeneración.
3. **Edición manual de la migración SQL**: agregar el índice parcial a mano es frágil ante regeneraciones. La migración inicial queda commiteada con el `CREATE UNIQUE INDEX` adentro; cualquier cambio futuro se hace en una migración nueva, no editando la inicial.
4. **`tsx` para el seed**: alternativa sería compilar a JS, pero `tsx` mantiene un solo source-of-truth y es lo estándar hoy.
5. **El wrapper `forOrg` requiere mantenimiento**: cada nuevo modelo org-scoped (que llegará en Plan 03+) tiene que sumarse al wrapper. Documentar como checklist en cada plan posterior.

---

## Proceso de planeación

Resumen del intercambio que produjo este plan, para futuros lectores:

1. **Punto de partida**: Plan 0a dejó el repo con scaffolding listo pero schema vacío. El brief inicial de la sesión enumeraba los entregables (modelos, tablas Auth.js, MiembroScout stub, `src/lib/db.ts`, seed) tomados directamente del master plan.
2. **Verificación del estado real**: antes de planear, se leyó `prisma/schema.prisma`, `prisma.config.ts` y `package.json` para confirmar qué estaba en pie. Hallazgos:
   - Prisma 7.x usa el generator nuevo `prisma-client` (no `prisma-client-js`).
   - `DATABASE_URL` vive en `prisma.config.ts` vía `process.env`, no en `schema.prisma`.
   - No hay deps de `zod`, `@paralleldrive/cuid2` ni `tsx` instaladas.
   Estos detalles ajustaron pasos del plan (instalar deps explícitamente, configurar seed en `prisma.config.ts` y no en `package.json`).
3. **Cuatro preguntas dirigidas al usuario** vía `AskUserQuestion`:
   - **Patrón de tenant isolation**: wrapper explícito `forOrg(...)` vs client extension con AsyncLocalStorage vs diferir a Plan 1. → Eligió **wrapper explícito**, recomendado, por la garantía de no fugar datos cross-tenant aún a costa de boilerplate.
   - **Alcance del seed**: mínimo / medio / completo. → Eligió **completo** (medio + invitaciones + audit logs), para tener el sistema vivo desde el día uno.
   - **Modelo de Invitation**: con `status` + timestamps vs simple (borrar al aceptar). → Eligió **con `status`**, para conservar trazabilidad histórica.
   - **IDs de tablas Auth.js**: cuid2 a la fuerza vs shape literal del adapter. → Eligió **cuid2 en todo**, por consistencia con la regla del master plan.
4. **Decisiones implícitas tomadas sin preguntar** (por ser default razonable o por estar fijadas en master plan / ADR):
   - Enums Postgres nativos para `Role`, `InvitationStatus`, `CategoriaScout`.
   - Estrategia de `onDelete` por relación, según consecuencias prácticas (cascada para cosas del distrito, restrict para grupo con miembros, set null para linkeos opcionales).
   - `User.email` unique global (necesario porque User cruza distritos).
   - Índice único parcial en `Invitation` para que solo haya una `PENDING` por (org, email) — solución estándar Postgres, hay que escribir el `CREATE UNIQUE INDEX` a mano en la migración.
   - Una sola migración inicial en lugar de fragmentar; tiene sentido fragmentar después de la primera deploy.
   - `Authenticator` (passkeys) **fuera de alcance**: el master plan especifica Google OAuth como único método; passkeys se agregarían en plan futuro si se requiere.
5. **Diferimientos explícitos a Plan 1**: el wrapper `forOrg` queda definido y testeable en aislamiento, pero su integración con `getCurrentOrg()`/`requireRole()` (los helpers de auth) llega cuando exista la sesión. Es deliberado para mantener el scope de 0b acotado.

---

## Antes de ejecutar — checklist

- [ ] **Cambiar modelo a Sonnet** (`/model` → `Sonnet`). La planeación se hizo con Opus; la ejecución corre con Sonnet según la regla del workflow.
- [ ] Tener Docker Desktop corriendo y `docker compose up -d db` levantado.
- [ ] Confirmar que `prisma/schema.prisma` actualmente solo tiene `generator` y `datasource` (estado de salida de Plan 0a).
- [ ] Confirmar que no hay migraciones previas en `prisma/migrations/` (carpeta inexistente o vacía).
- [ ] Confirmar que `.env` tiene `DATABASE_URL` apuntando al Postgres local.

---

## Commits asociados

1. `b861e0d` — `chore: agregar deps para schema y seed (cuid2, zod, tsx)`
2. `c01c87e` — `feat(prisma): definir schema nucleo (org, grupos, users, memberships, invitations, miembros, audit)`
3. `5eb7393` — `feat(prisma): migracion inicial + indice parcial en Invitation`
4. `f325f5e` — `feat(db): cliente Prisma singleton + helper forOrg() para tenant isolation` _(incluye @prisma/adapter-pg, pg, @types/pg — ver nota 1b)_
5. `c51f0e5` — `feat(seed): script de seed con datos demo (distrito, grupos, users, miembros, invitaciones, audit)`
6. `9d86e24` — `docs: marcar Plan 0b completado, documentar incompatibilidad adapter Prisma 7`
