# Plan 9 — Login con email y contraseña (alternativa a Google)

## Contexto

Hasta hoy la única forma de entrar al sistema es con Google OAuth. Esto crea dependencia 100% en Google: si un usuario no tiene cuenta Google, si Google bloquea la cuenta, o si el proyecto pierde acceso a la consola de Google Cloud, no hay login.

El Plan 9 agrega un método de autenticación con **email + contraseña** usando el `Credentials` provider de Auth.js v5, manteniendo Google OAuth como segunda opción. Los dos métodos coexisten y el usuario puede vincular ambos a la misma cuenta cuando comparten el mismo email.

Este plan se interpone entre el Plan 8 (cerrado) y el deploy a producción, que pasa a ser Plan 10. La razón es práctica: si vamos a desplegar a producción, es mejor que el sistema ya tenga el método de login propio funcionando — agregarlo después del deploy implica login Google previo para luego setear password, lo cual es incómodo para el primer admin de un distrito sin cuenta Google.

## Alcance

### Incluye

- **Campo `passwordHash String?` en `User`** + migración Prisma.
- **Nuevo modelo `AuthAttempt`** para lockout por intentos fallidos (rate limit por DB).
- **`Credentials` provider de Auth.js v5** configurado en `src/auth.ts` (no en `auth.config.ts` por dependencia de DB).
- **Página de registro** `/registro` con formulario email + contraseña + nombre. Validación Zod.
- **Página de login actualizada** `/login`: formulario de credenciales + botón Google. Stacked (no tabs), ambos visibles.
- **Mini-página `/perfil/seguridad`** con un solo formulario: "Establecer contraseña" para usuarios autenticados que aún no tienen `passwordHash`. Permite que un usuario que se registró con Google agregue una contraseña como respaldo. **No incluye** "cambiar contraseña" ni "remover contraseña" (alcance mínimo declarado).
- **Hash con `bcryptjs`** (pura JS, cost=10): sin dependencias nativas, evitando issues de build en Docker Alpine que va a usar Plan 10.
- **Linkeo de cuentas por email**:
  - Google emails ya vienen verificados → al primer signin Google se setea `emailVerified = now()`.
  - Credentials signup pone `emailVerified = now()` **directamente** (decisión de scope mínimo: sin envío de email en Plan 9, ver "Riesgos conocidos").
  - Override del callback `signIn` de Google: si entra con Google y ya hay un User con ese email (registrado por credentials), crea manualmente el `Account` de Google ligado al User existente. Default de Auth.js v5 bloquea linkeo automático con `OAuthAccountNotLinked`; nosotros lo permitimos porque Google verifica el email del lado de Google.
  - Signup con email que ya existe como Google-only retorna error "iniciá sesión con Google y luego agregá password desde tu perfil" — fuerza el path seguro.
- **Lockout por DB**: tras 5 intentos fallidos consecutivos del mismo email, bloqueo de 15 minutos. Mensaje genérico al usuario sin filtrar info.
- **Audit log**: `auth.signup`, `auth.signin.password`, `auth.password.set`, `auth.lockout` con `actorUserId` y `metadata`. Skip si no hay `organizationId` (login pre-onboarding).
- **Strings en español** en `src/messages/es.json`.
- **Tests unitarios** mínimos: lockout, hash verify, idempotencia de `setUserPassword`.

### No incluye

- **Verificación de email por link** → diferida a Plan 10 (tiene email setup).
- **Recuperar contraseña olvidada** → diferida a Plan 10.
- **Cambiar contraseña desde perfil** (alcance mínimo declarado por el usuario).
- **Desvincular Google de una cuenta** (no necesario en MVP).
- **2FA / TOTP** (out of scope, plan futuro si se requiere).
- **Política de complejidad arbitraria** (una mayúscula, un número, etc.): solo mínimo de 8 caracteres (alineado con NIST 800-63B — la complejidad arbitraria empeora seguridad por reuso predecible).
- **Captcha / hCaptcha**: el lockout por DB es suficiente para el volumen del MVP.
- **Sesión cookie distinta** a la JWT actual: se reusa JWT (7 días).

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **Hash library** | `bcryptjs` (pura JS, cost=10) | Sin native bindings; cero riesgo en Docker Alpine de Plan 10. Cost=10 da ~50ms en hardware típico de VPS de bajo costo. Trade-off: ~10× más lento que `bcrypt` (C++) pero al volumen del MVP (decenas de logins/día) inobservable, y con lockout activo el costo desaparece. |
| **Provider `Credentials`: dónde se define** | En `src/auth.ts`, **no** en `auth.config.ts` | El `authorize` consulta DB (`prisma.user.findUnique`, `prisma.authAttempt.upsert`), por lo que no puede vivir en código Edge-compatible. Pattern: `providers: [...authConfig.providers, Credentials({ authorize })]` al construir el `NextAuth({...})`. Mantiene la convención #9 de CLAUDE.md. |
| **Lockout: cuándo cuenta como intento** | Tanto password incorrecto como email inexistente | Sin contar email-no-existente, un atacante puede enumerar emails registrados por timing (ver si se aplica el lockout). Contamos todo intento de credentials login con ese email, exista o no. Anti-enumeration. |
| **Lockout: threshold y duración** | 5 intentos consecutivos → 15 minutos bloqueado | Razonables para humanos honestos (típico se equivoca 1-2 veces). Mata brute force online. Si un atacante distribuye en muchos emails, no aplica — pero ahí ya estamos en territorio que requiere infra mayor (Plan 10b + Cloudflare). |
| **Lockout: cómo se resetea** | Login exitoso resetea `failCount` a 0. `lockedUntil` no se borra explícitamente — se ignora cuando ya pasó. | Mantiene historia para análisis futuro sin overhead. |
| **`emailVerified` con scope mínimo** | Set a `now()` al signup credentials sin verificar realmente | **Riesgo conocido y documentado** (ver "Riesgos"): alguien puede registrar `admin@distrito.org` antes que el admin real y aceptar invitaciones automáticamente. Mitigación temporal: el operador crea su cuenta inicial antes de exponer el sistema. Plan 10 cierra el agujero con email de verificación. Coherente con la elección "mínimo viable + diferir emails al deploy". |
| **Linkeo Google → User con credentials** | Callback `signIn` crea `Account` de Google manualmente para User existente sin él | Auth.js bloquea linkeo automático por seguridad (email-takeover risk). En nuestro caso es seguro porque Google verifica el email del lado de Google. El callback explícito refleja la decisión consciente. |
| **Signup form: qué hacer si email ya existe** | Con `passwordHash`: error "Ya existe una cuenta con ese email". Sin `passwordHash` (Google-only): error "Este email se registra con Google. Iniciá sesión con Google y agregá una contraseña desde tu perfil." | Sin email verification, no podemos confirmar que es el dueño del email. Forzamos el flujo seguro (login Google → set password) para emails ya tomados por Google. |
| **Ruta de signup** | `/registro` (en español) | Consistente con copy del proyecto y con `/onboarding`, `/login` (paths semánticos sin localización pero en español). |
| **Forms vs API routes** | Server Actions para `signup` y `setPassword`; `signIn('credentials')` vía Auth.js handler (POST a `/api/auth/callback/credentials`) | Convención del proyecto. `signIn` es la excepción porque Auth.js exige sus propios endpoints. |
| **Schema: estructura de `AuthAttempt`** | Una fila por email (`@unique`), `failCount` + `lockedUntil` + `lastTryAt`. Upsert en cada intento. | Simple. Una sola fila por email vive el ciclo de vida de los logins. Mejor que una fila por intento (que crecería sin bound). |
| **¿Borrar `AuthAttempt` al borrar `User`?** | No. AuthAttempt opera por email (string), sin FK al User | Permite trackear intentos contra emails inexistentes (anti-enumeration). El email se sobrescribe en signup natural. |
| **Audit log de signin Credentials** | `auth.signin.password` con `actorUserId` y `metadata: { ip }`. **Nunca** loguear contraseña ni hash. | Auditoría mínima sin filtrar secretos. IP útil para investigar abusos. |
| **Audit log de lockout** | `auth.lockout` con `metadata: { email, failCount, lockedUntil }` | Trazabilidad de patrones. Permite al operador detectar ataques. |
| **Audit log: `organizationId` ausente** | Para logins pre-onboarding (signup sin invitación previa), **omitir** el audit log: el schema requiere `organizationId NOT NULL`. | Logins pre-onboarding son del sistema, no del distrito. Aceptable no loguearlos. Los logins post-onboarding sí tienen org y se loguean normalmente. |
| **Páginas: layout** | `/registro` vive en `(auth)/`, mismo group que `/login`. Hereda el layout purple. `/perfil/seguridad` vive en `(app)/perfil/seguridad/page.tsx`, hereda el layout del admin. | Coherencia visual con flujos auth vs flujos autenticados. |
| **PasswordInput component** | Componente compartido con toggle show/hide (icono ojo) | Mejora UX en mobile. Es el único campo donde la usabilidad lo justifica explícitamente. |

## Pre-requisitos

- Plan 8 completado (estado actual).
- No requiere cambios externos (Google OAuth Console, etc).

## Implementación

### Paso 1 — Schema migration

Editar `prisma/schema.prisma`:

1. Agregar `passwordHash String?` al modelo `User`.
2. Agregar nuevo modelo:

```prisma
model AuthAttempt {
  id          String    @id @default(cuid(2))
  email       String    @unique
  failCount   Int       @default(0)
  lockedUntil DateTime?
  lastTryAt   DateTime  @default(now())
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([email])
}
```

Generar y aplicar migración:

```bash
pnpm prisma migrate dev --name add_password_hash_and_auth_attempts
```

### Paso 2 — Dependencias

```bash
pnpm add bcryptjs
pnpm add -D @types/bcryptjs
```

### Paso 3 — Helper de auth (`src/lib/auth-credentials.ts`)

Funciones puras testables y constantes compartidas:

- `MIN_PASSWORD_LENGTH = 8`.
- `LOCKOUT_THRESHOLD = 5`.
- `LOCKOUT_DURATION_MS = 15 * 60 * 1000`.
- `BCRYPT_COST = 10`.
- `hashPassword(plain: string): Promise<string>` — `bcryptjs.hash`.
- `verifyPassword(plain: string, hash: string): Promise<boolean>` — `bcryptjs.compare`.
- `normalizeEmail(email: string): string` — `.toLowerCase().trim()`.
- Schemas Zod: `signupSchema`, `signinSchema`, `setPasswordSchema`.

### Paso 4 — Repositorio de auth (`src/repositories/auth.repo.ts`)

Wrapper de Prisma para operaciones de signup/login. **Excepción documentada en CLAUDE.md** (igual que `auth-onboarding.ts`): pre-tenant, no aplica `forOrg()`.

- `findUserByEmailRaw(email: string)` — para checks de existencia.
- `createUserWithPassword({ email, name, passwordHash })` — para signup.
- `setUserPasswordIfNull(userId: string, passwordHash: string)` — idempotente: rechaza si el user ya tiene password (lanza `BusinessError('PASSWORD_ALREADY_SET')`).
- `recordFailedAttempt(email: string): Promise<{ locked: boolean }>` — upsert + increment, set `lockedUntil` si pasa threshold.
- `clearFailedAttempts(email: string)` — set `failCount = 0`.
- `isLocked(email: string): Promise<boolean>` — chequea `lockedUntil > now`.
- `linkGoogleAccount(userId, account)` — usado por el callback `signIn` para vincular Google a User existente.

### Paso 5 — Configurar `Credentials` provider en `src/auth.ts`

```ts
import Credentials from "next-auth/providers/credentials"
import { signinSchema, verifyPassword, normalizeEmail } from "@/lib/auth-credentials"
import {
  findUserByEmailRaw,
  recordFailedAttempt,
  clearFailedAttempts,
  isLocked,
} from "@/repositories/auth.repo"

const credentialsProvider = Credentials({
  name: "Credenciales",
  credentials: {
    email: { label: "Email", type: "email" },
    password: { label: "Contraseña", type: "password" },
  },
  async authorize(raw) {
    const parsed = signinSchema.safeParse(raw)
    if (!parsed.success) return null
    const email = normalizeEmail(parsed.data.email)
    const password = parsed.data.password

    if (await isLocked(email)) return null

    const user = await findUserByEmailRaw(email)
    if (!user?.passwordHash) {
      await recordFailedAttempt(email)
      return null
    }

    const ok = await verifyPassword(password, user.passwordHash)
    if (!ok) {
      await recordFailedAttempt(email)
      return null
    }

    await clearFailedAttempts(email)
    return { id: user.id, email: user.email, name: user.name, image: user.image }
  },
})

export const { auth, handlers, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  providers: [...authConfig.providers, credentialsProvider],
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google") return true
      // ... linkeo Google a User existente sin Account de Google (ver Paso 6)
      return true
    },

    async jwt({ token, user, trigger, session }) {
      // ... callback existente sin cambios estructurales
    },

    async session({ session, token }) {
      return buildSession(session, token)
    },
  },
})
```

**Importante**: el callback `jwt` actual ya dispara `aceptarInvitacionEnSignIn(user.id!, user.email)` cuando `user` está presente. Esto funciona para ambos flows (Google y Credentials) porque en ambos el `user` viene poblado al login inicial. No requiere cambios.

### Paso 6 — Override del callback `signIn` para linkeo Google

Agregar al `callbacks` de `src/auth.ts`:

```ts
async signIn({ user, account }) {
  if (account?.provider !== "google") return true
  if (!user.email) return true

  // Si ya hay un User con este email pero sin Account de Google, vincular
  const existing = await prisma.user.findUnique({
    where: { email: user.email },
    include: { accounts: { where: { provider: "google" } } },
  })

  if (existing && existing.accounts.length === 0 && account.providerAccountId) {
    await prisma.account.create({
      data: {
        userId: existing.id,
        type: account.type,
        provider: "google",
        providerAccountId: account.providerAccountId,
        access_token: account.access_token ?? null,
        refresh_token: account.refresh_token ?? null,
        expires_at: account.expires_at ?? null,
        token_type: account.token_type ?? null,
        scope: account.scope ?? null,
        id_token: account.id_token ?? null,
      },
    })
  }
  return true
}
```

Resuelve el caso "User se registró con credentials, después prueba con Google" sin romper Auth.js v5 que por default bloquearía con `OAuthAccountNotLinked`.

### Paso 7 — Página `/login` actualizada

`src/app/(auth)/login/page.tsx`: Server Component que renderiza ambos métodos en stack vertical:

```
┌─────────────────────────┐
│  Email                  │
│  [_________________]    │
│  Contraseña             │
│  [_________________] 👁  │
│  [    Entrar    ]       │
│                         │
│  ──────── o ────────    │
│                         │
│  [ G Continuar con      │
│      Google         ]   │
│                         │
│  ¿No tenés cuenta?      │
│  Registrate             │
└─────────────────────────┘
```

- Form de credenciales = `<CredentialsLoginForm>` (Client Component) que llama a `signIn('credentials', { email, password, redirectTo: '/dashboard' })` con `useTransition` y manejo de error vía URL param `?error=`.
- Errores legibles: `'CredentialsSignin'` → "Email o contraseña incorrectos." `'AccessDenied'` (lockout) → "Demasiados intentos fallidos. Probá de nuevo en 15 minutos."
- El botón Google se mantiene como server action existente.

### Paso 8 — Página `/registro`

`src/app/(auth)/registro/page.tsx`:

- Server Component que verifica si hay sesión (redirect a `/dashboard` si sí).
- Renderiza `<CredentialsSignupForm>` (Client Component) que dispara la server action `signupAction(formData)`.

`src/app/(auth)/registro/actions.ts`:

```ts
"use server"
export async function signupAction(_prevState, formData) {
  const parsed = signupSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    name: formData.get("name"),
  })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const email = normalizeEmail(parsed.data.email)

  const existing = await findUserByEmailRaw(email)
  if (existing) {
    if (existing.passwordHash) return { error: "emailTaken" }
    return { error: "emailWithGoogle" }
  }

  const passwordHash = await hashPassword(parsed.data.password)
  await createUserWithPassword({
    email,
    name: parsed.data.name,
    passwordHash,
  })

  // Auto-signIn con credenciales
  await signIn("credentials", {
    email,
    password: parsed.data.password,
    redirectTo: "/dashboard",
  })
}
```

`aceptarInvitacionEnSignIn` corre en el callback `jwt` después del `signIn`, así que las invitaciones pendientes para el email se aceptan automáticamente.

### Paso 9 — Página `/perfil/seguridad`

`src/app/(app)/perfil/seguridad/page.tsx`:

- Server Component, lee user actual con `requireUser()`.
- Si `user.passwordHash` existe: muestra "Ya tenés una contraseña configurada. (El cambio de contraseña llegará en una próxima iteración.)".
- Si no: renderiza `<SetPasswordForm>` con un input de password (con toggle show/hide) y submit.

`src/app/(app)/perfil/seguridad/actions.ts`:

```ts
"use server"
export async function setPasswordAction(_prevState, formData) {
  const user = await requireUser()
  const parsed = setPasswordSchema.safeParse({ password: formData.get("password") })
  if (!parsed.success) return { error: parsed.error.issues[0].message }

  const hash = await hashPassword(parsed.data.password)
  try {
    await setUserPasswordIfNull(user.id, hash)
  } catch (e) {
    if (e instanceof BusinessError && e.code === "PASSWORD_ALREADY_SET") {
      return { error: "already" }
    }
    throw e
  }

  // Audit log: organizationId del active membership si existe
  if (user.activeOrganizationId) {
    await prisma.auditLog.create({
      data: {
        organizationId: user.activeOrganizationId,
        actorUserId: user.id,
        action: "auth.password.set",
      },
    })
  }

  return { success: true }
}
```

### Paso 10 — Strings en `src/messages/es.json`

Agregar al bloque `auth`:

```json
"login": {
  "title": "Iniciar sesión",
  "subtitle": "Accedé con email o con tu cuenta de Google",
  "emailLabel": "Email",
  "passwordLabel": "Contraseña",
  "submitButton": "Entrar",
  "orSeparator": "o",
  "googleButton": "Continuar con Google",
  "noAccountPrompt": "¿No tenés cuenta?",
  "registerLink": "Registrate",
  "errors": {
    "credentialsSignin": "Email o contraseña incorrectos.",
    "locked": "Demasiados intentos fallidos. Probá de nuevo en 15 minutos.",
    "generic": "No pudimos iniciar sesión. Probá de nuevo."
  }
},
"signup": {
  "title": "Crear cuenta",
  "subtitle": "Registrate con email y contraseña",
  "nameLabel": "Nombre",
  "emailLabel": "Email",
  "passwordLabel": "Contraseña",
  "passwordHint": "Mínimo 8 caracteres",
  "submitButton": "Crear cuenta",
  "haveAccountPrompt": "¿Ya tenés cuenta?",
  "loginLink": "Iniciar sesión",
  "errors": {
    "emailTaken": "Ya existe una cuenta con ese email.",
    "emailWithGoogle": "Este email se registra con Google. Iniciá sesión con Google y luego agregá una contraseña desde tu perfil.",
    "invalidEmail": "Email inválido.",
    "passwordTooShort": "La contraseña debe tener al menos 8 caracteres.",
    "generic": "No pudimos crear la cuenta."
  }
},
"perfil": {
  "seguridad": {
    "title": "Seguridad",
    "subtitle": "Configurá tu contraseña para iniciar sesión sin Google",
    "hasPassword": "Ya tenés una contraseña configurada. El cambio de contraseña llegará en una próxima iteración.",
    "setPassword": {
      "title": "Establecer contraseña",
      "passwordLabel": "Nueva contraseña",
      "submit": "Guardar contraseña",
      "success": "Contraseña configurada correctamente.",
      "errors": {
        "already": "Ya tenés una contraseña configurada.",
        "passwordTooShort": "La contraseña debe tener al menos 8 caracteres.",
        "generic": "No pudimos guardar la contraseña."
      }
    }
  }
}
```

### Paso 11 — Middleware: agregar `/registro` a public paths

En `src/auth.config.ts`:

```ts
const PUBLIC_PATHS = ["/login", "/registro", "/api/auth", "/invite", "/resultados"]
```

### Paso 12 — Tests

`src/repositories/__tests__/auth.repo.test.ts`:

- `recordFailedAttempt` incrementa hasta lockout y setea `lockedUntil`.
- `isLocked` retorna `true` mientras `lockedUntil > now`, `false` cuando pasó.
- `clearFailedAttempts` resetea `failCount` a 0.
- `setUserPasswordIfNull` setea password si era null.
- `setUserPasswordIfNull` lanza `BusinessError('PASSWORD_ALREADY_SET')` si ya había password.

`src/lib/__tests__/auth-credentials.test.ts`:

- `hashPassword` + `verifyPassword` roundtrip.
- `verifyPassword` retorna `false` con password incorrecto.
- `normalizeEmail` baja a minúsculas y trim.

### Paso 13 — Documentación y referencias

- `docs/plans/09-auth-credentials.md` (este documento).
- `docs/plans/10-deploy-produccion.md` (renombrado desde 09 con nota de renumeración).
- `docs/plans/00-master-plan.md`:
  - Tabla de decisiones macro: `Auth.js v5 con Google OAuth + login con email/contraseña` (en vez de "único método").
  - Roadmap table: insertar Plan 9 (credentials) y correr deploy a Plan 10.
  - Línea "Capa 2 después de Plan 9" → "después de Plan 10".
- `docs/README.md`: nuevo Plan 9, deploy ahora 10, nota explicativa sobre renumeración.
- `CLAUDE.md`: sección "Estado actual" — Plan 8 completado, próximo Plan 9 (credentials), Plan 10 = deploy.
- `README.md` (root): "Plan 9 pendiente" → "Plan 10 pendiente"; mencionar que Auth soporta Google + credenciales.
- `Caddyfile`: comentario "Plan 9" → "Plan 10".

## Archivos a crear/modificar

| Archivo | Acción |
|---|---|
| `prisma/schema.prisma` | Modificar (passwordHash, AuthAttempt) |
| `prisma/migrations/NNN_add_password_hash_and_auth_attempts/migration.sql` | Crear |
| `package.json` / `pnpm-lock.yaml` | Modificar (bcryptjs) |
| `src/lib/auth-credentials.ts` | Crear (helpers + schemas) |
| `src/repositories/auth.repo.ts` | Crear |
| `src/auth.config.ts` | Modificar (PUBLIC_PATHS) |
| `src/auth.ts` | Modificar (Credentials provider, signIn callback con linkeo) |
| `src/app/(auth)/login/page.tsx` | Modificar (agregar form credenciales + link a registro) |
| `src/app/(auth)/login/CredentialsLoginForm.tsx` | Crear (Client Component) |
| `src/app/(auth)/registro/page.tsx` | Crear |
| `src/app/(auth)/registro/CredentialsSignupForm.tsx` | Crear |
| `src/app/(auth)/registro/actions.ts` | Crear (`signupAction`) |
| `src/app/(app)/perfil/seguridad/page.tsx` | Crear |
| `src/app/(app)/perfil/seguridad/SetPasswordForm.tsx` | Crear |
| `src/app/(app)/perfil/seguridad/actions.ts` | Crear (`setPasswordAction`) |
| `src/components/auth/PasswordInput.tsx` | Crear (toggle show/hide) |
| `src/messages/es.json` | Modificar (strings nuevos) |
| `src/repositories/__tests__/auth.repo.test.ts` | Crear |
| `src/lib/__tests__/auth-credentials.test.ts` | Crear |
| `docs/plans/09-auth-credentials.md` | Crear (este doc) |
| `docs/plans/10-deploy-produccion.md` | Renombrar desde 09 + actualizar refs |
| `docs/plans/00-master-plan.md` | Modificar (decisión auth + roadmap) |
| `docs/README.md` | Modificar (índice) |
| `CLAUDE.md` | Modificar (estado actual + próximo) |
| `README.md` | Modificar (Plan 10 + mención de credenciales) |
| `Caddyfile` | Modificar (comentario Plan 10) |

## Verificación

Cada escenario debe correrse manualmente en `pnpm dev` antes de cerrar el plan.

### Escenarios end-to-end

1. **Signup nuevo + auto-login**:
   - Usuario nuevo, sin invitación pendiente.
   - Visita `/login`, click "Registrate" → `/registro`.
   - Completa email `nuevo@distrito.org`, nombre "Pepe Lopez", password "scout1234".
   - Submit → User creado con `passwordHash`, `emailVerified=now()`. Auto-signIn. Redirect a `/dashboard`. Middleware redirige a `/onboarding` (sin memberships). Pepe ve la pantalla de bootstrap.

2. **Signup con email previamente invitado**:
   - Admin invitó previamente `juez1@distrito.org` con rol JUEZ.
   - Juez visita `/registro`, completa con ese email + password + nombre.
   - Signup OK → `aceptarInvitacionEnSignIn` corre en callback `jwt` → Membership creado → invitation marcada `ACCEPTED` → audit log `invitation.accepted`. Juez aterriza en `/dashboard` con membership activo.

3. **Signup con email ya registrado por password**:
   - User existente con `passwordHash`.
   - Otro intento de signup con mismo email → server action retorna `{ error: "emailTaken" }`. Form muestra "Ya existe una cuenta con ese email."

4. **Signup con email ya registrado como Google-only**:
   - User existente con `email` pero sin `passwordHash` (entró antes vía Google).
   - Signup intenta crear → server action detecta y retorna `{ error: "emailWithGoogle" }`. Form muestra "Este email se registra con Google..."
   - Usuario va a `/login`, entra con Google → ahora autenticado → va a `/perfil/seguridad` → setea password → ahora puede usar ambos métodos.

5. **Login con credenciales válidas**:
   - User con passwordHash.
   - `/login`, completa form, submit → `signIn('credentials')` → JWT issued → redirect `/dashboard`.

6. **Login con password incorrecto y lockout**:
   - 5 intentos seguidos con password incorrecto.
   - Cada intento: form muestra "Email o contraseña incorrectos." `AuthAttempt.failCount` incrementa.
   - Al 5° fallo: `lockedUntil` se setea a `now + 15min`. Audit log `auth.lockout` (si hay org en el contexto — sino skipped).
   - 6° intento (aunque sea con password correcto): `authorize` retorna null sin chequear bcrypt. Form muestra "Demasiados intentos fallidos. Probá de nuevo en 15 minutos."
   - Esperar 15 minutos (o limpiar `AuthAttempt` manualmente). Intento con password correcto → login OK. `failCount` se resetea.

7. **Login con email inexistente** (anti-enumeration):
   - Form con email no registrado, cualquier password.
   - Submit → `authorize` busca user, no encuentra → `recordFailedAttempt(email)` (anti-enumeration por timing) → retorna null.
   - Form muestra el mismo mensaje genérico "Email o contraseña incorrectos." — no filtra existencia.
   - Verificar: 5 intentos sobre un email inexistente también producen `lockedUntil` para ese email.

8. **Login Google con email previamente registrado por credenciales**:
   - User `pepe@distrito.org` creado por signup credentials (sin Account Google).
   - Pepe va a `/login` y click "Continuar con Google" → flujo OAuth → callback.
   - `signIn` callback detecta User existente sin Account Google → crea `Account` ligado al `userId` existente.
   - Auth.js completa el flujo sin lanzar `OAuthAccountNotLinked`. Pepe queda autenticado contra el mismo User row. Ahora tiene los dos métodos vinculados.
   - Verificación en DB: hay 1 User con ese email, 1 Account `provider=google`, y `passwordHash` también poblado.

9. **Set password desde perfil (Google user)**:
   - User Google sin passwordHash.
   - Va a `/perfil/seguridad`, ve el form "Establecer contraseña". Completa "miclave123", submit.
   - Server action: bcrypt hash + `setUserPasswordIfNull`. Audit log `auth.password.set`. Devuelve `{ success: true }`.
   - Form muestra "Contraseña configurada correctamente."
   - Sign out + sign in con credenciales con esa password → entra OK.

10. **Set password idempotencia**:
    - User con `passwordHash` ya seteado visita `/perfil/seguridad`.
    - Página muestra "Ya tenés una contraseña configurada." Sin formulario.
    - Si por race/manipulación la action recibe la request, `setUserPasswordIfNull` rechaza con `BusinessError('PASSWORD_ALREADY_SET')` → action retorna `{ error: "already" }`. No sobrescribe silenciosamente.

11. **Linkeo de invitación con signup credentials**:
    - Admin envía invitación a `nuevo@distrito.org` con rol ESPECTADOR. El deep link `/invite/<token>` redirige a `/login` si no hay sesión (comportamiento existente).
    - El invitado va a `/registro`, se crea con ese email → `aceptarInvitacionEnSignIn` corre desde el callback `jwt` → invitation pasa de `PENDING` a `ACCEPTED`, membership creada, audit log.
    - Verificación: el escenario equivalente vía Google sigue funcionando intacto.

12. **Logout funciona para ambos métodos**:
    - Usuario autenticado vía credentials clickea "Cerrar sesión" → mismo flujo del `SignOutButton` existente → JWT eliminado, redirect a `/login`.

13. **Sesión offline del juez sigue funcionando con credenciales**:
    - Juez se loguea con credenciales en su celular.
    - Sale a la posta sin red.
    - Service worker + JWT (7 días) → puede operar offline igual que con login Google. El cambio de método de auth no afecta el flujo offline del Plan 7b.

14. **Regresiones**:
    - Login Google funciona como antes (tests del Plan 1 + Plan 4 deben seguir pasando).
    - Onboarding flow no se rompe.
    - Switch de distrito sigue funcionando.
    - `aceptarInvitacionEnSignIn` corre en ambos flows sin duplicar memberships.
    - `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` pasan.

### Comandos de verificación

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm prisma migrate dev    # migración limpia
pnpm dev                   # escenarios manuales en browser
```

## Riesgos conocidos y aceptados

1. **`emailVerified=now()` sin verificación real** → riesgo de impersonación de email. Mitigaciones:
   - Quien usa el sistema en este punto sabe que está sin verify (proyecto educativo, primer deploy).
   - Las invitaciones siguen requiriendo que el admin valide al invitado fuera del sistema (WhatsApp / email manual).
   - Plan 10 cerrará el hueco con email de verificación (Resend / SMTP / etc.).
   - Mientras tanto: el operador crea su cuenta inicial **antes** de exponer la URL pública del sistema.

2. **5 intentos / 15 minutos puede frustrar a usuarios legítimos en mobile** con teclados táctiles. Aceptado: 5 intentos es suficiente para un humano honesto, y mata brute force online razonablemente.

3. **Sin captcha** → si emerge tráfico hostil distribuido (atacante variando emails), el lockout por email no protege. Aceptado para MVP. Mitigaciones futuras (Plan 10b si emerge): Cloudflare gratis frente a Caddy, o fail2ban a nivel host.

4. **`bcryptjs` ~10× más lento que `bcrypt`** → con lockout activo y volumen MVP es invisible. Si en algún punto necesitamos perf (>100 logins/seg), migrar a `bcrypt` o `argon2` con builds nativos.

5. **`AuthAttempt` no expira automáticamente** → la tabla crece a 1 fila por email único alguna vez intentado. Es trivial (KB total). Plan 10 puede agregar un cron de limpieza si hace falta.

## Proceso de planeación

Sesión iniciada en Opus 4.7 con request del usuario: "agregar login propio para no depender 100% de Google". Decisiones inmediatas:

1. Mantener Google como método (no reemplazo, alternativa).
2. Postergar Plan 9 (deploy) a Plan 10, abrir Plan 9 nuevo para credentials.

**Cuatro preguntas dirigidas** vía `AskUserQuestion` para acotar scope (clave para no caer en hacer un sistema de auth completo cuando el MVP solo necesita lo básico):

1. **Alcance**: el usuario eligió **mínimo viable** (signup + login, sin verificación email, sin reset password, sin cambio de password). Razonamiento: el sistema todavía está sin desplegar; el envío de email viene mejor con el resto de la infra de producción. Trade-off aceptado: agujero conocido en `emailVerified=now()` directo.

2. **Email delivery**: **diferir al deploy**. Coherente con (1).

3. **Account linking**: **sí, vinculables**. Esto introdujo una pequeña inconsistencia con "mínimo viable" — el linkeo Google → password requiere alguna UI. Se resolvió con la versión más simple: una mini-página `/perfil/seguridad` con un solo formulario "establecer contraseña", sin "cambiar password" ni "remover password". Compromiso aceptable.

4. **Rate limit**: **lockout por DB**. Persistente entre restarts, simple, suficiente para el volumen del MVP.

**Decisiones técnicas no preguntadas** (resueltas por contexto del proyecto):

- `bcryptjs` sobre `bcrypt`: el proyecto va a Docker Alpine en Plan 10. `bcrypt` requiere native bindings (node-pre-gyp + musl) que históricamente dan problemas. `bcryptjs` es pura JS, ~10× más lento, pero con lockout activo el costo es invisible para el volumen del MVP.

- `Credentials` provider en `src/auth.ts` (no en `auth.config.ts`): el `authorize` consulta DB. Convención #9 de CLAUDE.md exige que `auth.config.ts` sea Edge-compatible.

- Linkeo Google ↔ Credentials vía callback `signIn` con creación manual de `Account`: Auth.js v5 bloquea linkeo automático por seguridad (email-takeover risk). En nuestro caso es seguro porque Google verifica el email del lado de Google. El override explícito en código documenta la decisión consciente.

- Forzar el flujo "login Google → set password" para emails ya registrados con Google: sin email verification, no podemos confirmar que quien hace signup credentials con `pepe@distrito.org` es el dueño de esa cuenta Google. Forzar el path Google primero elimina ese riesgo.

- Lockout cuenta también para emails inexistentes: sin contar email-inexistente, atacante puede enumerar emails por timing del lockout. Pequeña pérdida de UX (usuario tipea email mal varias veces puede quedar lockeado), aceptada.

## Commits asociados

| Hash | Título |
|---|---|
| `b8e2631` | feat(schema): add passwordHash to User + AuthAttempt model (Plan 9) |
| `e44bf0d` | feat(auth): helper auth-credentials + repositorio auth.repo (Plan 9) |
| `cd57f6a` | feat(auth): Credentials provider + signIn callback linkeo Google (Plan 9) |
| `1449706` | feat(ui): páginas registro, login con credenciales y perfil/seguridad (Plan 9) |
| `b06d0c7` | fix(registro): remove unused useEffect import |
| `7908d41` | refactor(auth): usa allowDangerousEmailAccountLinking en Google provider |
| _(pendiente)_ | docs(plan-9): documentación final del plan completado |

### Lecciones aprendidas

1. **`allowDangerousEmailAccountLinking` > callback `signIn` manual**: la solución oficial de Auth.js para vincular cuentas de OAuth con cuentas existentes por email es poner `allowDangerousEmailAccountLinking: true` en el provider Google. Es más simple y correcta que crear manualmente el `Account` en el callback `signIn` y setear `user.id`. Esta opción hace exactamente lo que necesitábamos: si hay un User con ese email sin Account Google, lo usa en lugar de crear uno nuevo o tirar `OAuthAccountNotLinked`.

2. **`pnpm prisma migrate reset` requiere consentimiento explícito en agentes IA**: Prisma 7 detecta que `migrate reset` fue invocado por un agente de IA y bloquea con error hasta que el usuario confirme con `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=<mensaje exacto del usuario>`. Es una salvaguarda correcta dado el riesgo de pérdida de datos.

3. **`useActionState` con union types**: el estado de `useActionState` debe ser un tipo consistente entre el valor inicial, el tipo del prevState del action, y el valor de retorno. Usar unions (`{ error: string } | { success: true } | null`) y discriminar con `"error" in state` / `"success" in state` en el componente.

4. **`bcryptjs` 3.x incluye sus propios types**: instalar `@types/bcryptjs` no es necesario y genera un warning de deprecación. Solo se necesita `bcryptjs`.

5. **Migraciones modificadas en dev**: si una migración fue editada manualmente después de aplicarse, Prisma detecta el checksum mismatch y requiere `migrate reset`. En dev esto es aceptable; en prod se usa `migrate resolve` para manejar divergencias sin borrar datos.
