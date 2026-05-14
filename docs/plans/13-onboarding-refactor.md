# Plan 13 — Refactor del Onboarding: unirse como Espectador

## Contexto

El onboarding actual obliga a cada usuario nuevo a elegir entre dos opciones:

1. **Crear un distrito** → lo convierte automáticamente en ADMIN con control total. Cualquier persona autenticada puede disparar esta acción, creando una organización vacía sin supervisor. Con una base de usuarios creciente, esto es un vector de spam contra la base de datos.
2. **Pegar un token de invitación** → requiere que un admin haya creado y enviado el token de antemano. Es la única forma de unirse a un distrito existente, pero excluye a los usuarios más casuales (familias que quieren ver resultados, dirigentes sin rol técnico).

La raíz del problema: el modelo de roles de la aplicación tiene cinco niveles (`ADMIN > JUEZ > JEFE_PATRULLA > ESPECTADOR`) pero el onboarding solo expone los dos extremos (crear = ADMIN, invitar = cualquier rol). `ESPECTADOR` —el rol de solo lectura, el más bajo— no tiene flujo de autoservicio.

**Objetivo del Plan 13:** hacer de "unirse como ESPECTADOR a un distrito existente" el flujo principal y más accesible del onboarding. El formulario de token de invitación queda como opción secundaria para roles con más permisos. La creación de distritos se mueve a una URL oculta sin enlace en la UI, usada exclusivamente por administradores reales que reciben la URL por fuera de la app.

## Alcance

### Incluye

- Nuevo Server Action `unirseComoEspectador` que crea una `Membership(role=ESPECTADOR)` + `AuditLog` y actualiza el JWT.
- Conversión de `/onboarding/page.tsx` de Client a Server Component: fetchea la lista de distritos disponibles e inyecta al Client Component hijo.
- Nuevo `OnboardingClient.tsx`: lista de distritos con botones "Unirme como espectador" (flujo principal), formulario de token colapsable (flujo secundario), botón "Cerrar sesión" al pie.
- Nueva ruta oculta `/onboarding/crear-distrito/page.tsx`: extrae el formulario de creación de distritos que hoy vive en `page.tsx`. No hay enlace hacia ella desde ningún elemento de la UI.
- Strings i18n nuevos en `es.json` para la sección de lista de distritos.

### No incluye

- Cambios en el middleware de autenticación (`auth.config.ts`): `startsWith("/onboarding")` ya cubre `/onboarding/crear-distrito`.
- Cambios en `createDistrito` o `aceptarInvitacion`: ambas se mueven sin modificación.
- Paginación o búsqueda de distritos: la lista es corta en el escenario actual.
- Protección adicional de `/onboarding/crear-distrito` (rate limit, código secreto, aprobación admin). La seguridad es la URL opaca sin enlace, suficiente para el estado actual de la app.
- Cambios en lógica de memberships, repositorios, o cualquier otra ruta.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **¿Quién lista las organizaciones?** | Server Component `page.tsx` con query directa a Prisma | La página de onboarding ya es una excepción documentada al regla de repositorios (es el contexto bootstrap pre-tenant). Poner la query en el Server Component permite pasar los datos como prop al Client Component sin fetch extra. No se usa `unstable_cache` porque la lista de orgs cambia raramente y en onboarding no hay tenant que aislar. |
| **¿Cómo se estructuran page.tsx y la UI interactiva?** | Server Component `page.tsx` → `OnboardingClient.tsx` (Client Component) | `useActionState` requiere Client Component; el fetch de orgs es Server. El split evita que todo el onboarding sea client-side. Patrón estándar de Next.js App Router. |
| **¿Dispatch del join: `<form action>` o `startTransition + dispatch`?** | `startTransition(() => dispatch(fd))` por botón (convención 22) | Hay un botón por cada distrito. Con `<form action>` no hay forma de saber cuál botón está pending. Con el patrón de convención 22, se trackea `selectedOrgId` en estado para mostrar el spinner solo en el botón correcto. |
| **¿El formulario de token es visible o colapsable?** | Colapsable, oculto por defecto | Es el flujo secundario. Mostrarlo por defecto en segundo plano distrae de la acción principal. Un toggle "¿Tenés un código de invitación?" lo hace visible bajo demanda. |
| **¿Dónde va el formulario de "Crear distrito"?** | `/onboarding/crear-distrito/` — URL opaca, sin enlace en UI | La URL es la única barrera. Un admin legítimo recibe la URL por fuera del sistema. No es la primera vez que se usa este patrón en la app (ej: deep links de invitaciones). Para la audiencia técnica que administra la instancia, la URL es documentable en el manual de operaciones. |
| **¿Qué pasa si no hay organizaciones (fresh install)?** | Mostrar estado vacío con mensaje explicativo, sin enlace a crear-distrito | El estado vacío es un escenario transitorio que solo ocurre en la primera configuración del sistema. El admin técnico que hace el setup conoce la URL. Agregar el enlace en el estado vacío lo hace descubrible y anula el propósito de ocultarlo. |
| **¿Qué pasa si el usuario ya es miembro de la org seleccionada?** | Acción idempotente: `unstable_update` + `redirect("/dashboard")` | El middleware redirige a `/dashboard` a cualquier usuario con memberships al intentar acceder a `/onboarding`. Este caso solo ocurre por race condition o manipulación del formData. Manejarlo silenciosamente es más limpio que mostrar un error confuso. |

## Cambios por archivo

### 1. `src/app/(auth)/onboarding/actions.ts`

Agregar al final del archivo (sin modificar `createDistrito` ni `aceptarInvitacion`):

```typescript
const unirseSchema = z.object({ organizationId: z.string().min(1) })

export async function unirseComoEspectador(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser()
  const parsed = unirseSchema.safeParse({ organizationId: formData.get("organizationId") })
  if (!parsed.success) return { error: "ORG_REQUERIDA" }

  const { organizationId } = parsed.data

  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({ where: { id: organizationId } })
      if (!org) throw new Error("ORG_NO_ENCONTRADA")

      // Idempotente: si ya es miembro, no hacer nada (el redirect lo maneja afuera)
      const existing = await tx.membership.findUnique({
        where: { userId_organizationId: { userId: user.id, organizationId } },
      })
      if (existing) return

      const membership = await tx.membership.create({
        data: { userId: user.id, organizationId, role: "ESPECTADOR" },
      })

      await tx.auditLog.create({
        data: {
          organizationId,
          actorUserId: user.id,
          action: "membership.created",
          targetType: "Membership",
          targetId: membership.id,
          metadata: { role: "ESPECTADOR", via: "onboarding.espectador" },
        },
      })
    })
  } catch (err) {
    if (err instanceof Error && err.message === "ORG_NO_ENCONTRADA") {
      return { error: "ORG_NO_ENCONTRADA" }
    }
    throw err
  }

  await unstable_update({ refreshMemberships: true })
  redirect("/dashboard")
}
```

---

### 2. `src/app/(auth)/onboarding/page.tsx` — convertir a Server Component

```typescript
// Sin "use client" — Server Component
import { prisma } from "@/lib/db"
import { OnboardingClient } from "./OnboardingClient"

export default async function OnboardingPage() {
  const orgs = await prisma.organization.findMany({
    select: { id: true, nombre: true, slug: true },
    orderBy: { nombre: "asc" },
  })
  return <OnboardingClient orgs={orgs} />
}
```

El acceso directo a `@/lib/db` aquí está dentro de la excepción documentada del directorio `(auth)/onboarding/`: contexto bootstrap pre-tenant donde no existe repositorio aplicable.

---

### 3. `src/app/(auth)/onboarding/OnboardingClient.tsx` (NUEVO)

Client Component que contiene toda la interactividad. Estructura:

```
[Encabezado: "Elegí tu distrito"]
[Subtítulo: "Uníte como espectador para ver resultados de eventos"]

[Lista de distritos]
  ┌─────────────────────────────────────────────────┐
  │ Nombre del Distrito                             │
  │ @slug                    [Unirme como espect.] │
  └─────────────────────────────────────────────────┘
  ... (una card por organización)

[Error si joinState?.error]

[Toggle: "¿Tenés un código de invitación del administrador?" ▼]
  └── [Input token] [Aceptar]  ← visible solo si showTokenForm=true

[Cerrar sesión]  ← al pie
```

**Estado interno:**
- `const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)`
- `const [showTokenForm, setShowTokenForm] = useState(false)`
- `const [joinState, joinDispatch, joinPending] = useActionState(unirseComoEspectador, null)`
- `const [tokenState, tokenAction, tokenPending] = useActionState(aceptarInvitacion, null)`

**Patrón de dispatch por botón (convención 22):**
```tsx
<button
  type="button"
  disabled={joinPending && selectedOrgId === org.id}
  onClick={() => {
    setSelectedOrgId(org.id)
    startTransition(() => {
      const fd = new FormData()
      fd.set("organizationId", org.id)
      joinDispatch(fd)
    })
  }}
>
  {joinPending && selectedOrgId === org.id ? m.joining : m.joinButton}
</button>
```

**Estado vacío (sin orgs):**
```tsx
<div className="rounded-2xl border-2 border-dashed ...">
  <p>{m.empty}</p>
  <p className="text-sm">{m.emptyHint}</p>
</div>
```
Sin enlace a crear-distrito.

**Imports clave:**
```typescript
import { startTransition, useState, useActionState } from "react"
import { unirseComoEspectador, aceptarInvitacion } from "./actions"
import { SignOutButton } from "@/components/auth/SignOutButton"
```

---

### 4. `src/app/(auth)/onboarding/crear-distrito/page.tsx` (NUEVO)

Extrae el formulario de creación que hoy existe en `page.tsx`. Client Component con `useActionState(createDistrito, null)`. UI mínima: título, descripción, inputs `nombre` y `slug`, botón "Crear Distrito". Misma validación y mensajes de error que hoy.

Sin breadcrumb ni botón "Volver" — es una URL opaca de uso administrativo.

---

### 5. `src/messages/es.json`

Agregar bajo `auth.onboarding`:

```json
"selectDistrito": {
  "title": "Elegí tu distrito",
  "subtitle": "Uníte como espectador para ver los resultados de los eventos de tu grupo scout.",
  "joinButton": "Unirme como espectador",
  "joining": "Uniéndome...",
  "empty": "No hay distritos registrados todavía.",
  "emptyHint": "Si sos administrador de un grupo scout, el equipo técnico te dará acceso para configurar el sistema.",
  "hasCode": "¿Tenés un código de invitación del administrador?"
}
```

Agregar bajo `auth.onboarding.errors`:
```json
"orgNoEncontrada": "El distrito seleccionado ya no existe.",
"orgRequerida": "Seleccioná un distrito."
```

---

## Archivos críticos

| Archivo | Tipo de cambio |
|---------|---------------|
| `src/app/(auth)/onboarding/actions.ts` | + `unirseComoEspectador()` |
| `src/app/(auth)/onboarding/page.tsx` | Reescribir como Server Component |
| `src/app/(auth)/onboarding/OnboardingClient.tsx` | NUEVO — toda la UI interactiva |
| `src/app/(auth)/onboarding/crear-distrito/page.tsx` | NUEVO — form de creación extraído |
| `src/messages/es.json` | + strings `selectDistrito.*` y errores nuevos |

**No se tocan:** `auth.config.ts`, `middleware.ts`, `createDistrito`, `aceptarInvitacion`, repositorios, rutas del admin ni del juez.

## Verificación

1. **Flujo principal — unirse como ESPECTADOR**: usuario nuevo entra a `/onboarding` → ve la lista de distritos → hace click en "Unirme como espectador" junto al distrito correcto → redirige a `/dashboard`. DB: `Membership(role=ESPECTADOR)` + `AuditLog(action="membership.created", metadata.via="onboarding.espectador")` creados.

2. **Flujo secundario — token de invitación**: hacer click en "¿Tenés un código de invitación?" → el form se despliega → pegar token válido → redirige a `/dashboard` con el rol de la invitación.

3. **Token inválido**: ingresar token expirado o inexistente → muestra error "Invitación inválida o expirada" en el form de token.

4. **Sin distritos (fresh install)**: borrar todas las orgs → el onboarding muestra el estado vacío con el mensaje explicativo y sin enlace a crear-distrito.

5. **URL oculta — crear distrito**: navegar directamente a `/onboarding/crear-distrito` → ver el form de creación → crear → redirige a `/dashboard` con rol ADMIN.

6. **Middleware — usuario con membership**: usuario con membership intenta acceder a `/onboarding` o `/onboarding/crear-distrito` → middleware redirige a `/dashboard`.

7. **Botón de cerrar sesión**: visible al pie de `/onboarding` en todos los estados.

8. **`pnpm typecheck`** limpio.
