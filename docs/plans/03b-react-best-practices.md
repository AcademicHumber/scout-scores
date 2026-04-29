# Plan 3b — React Best Practices (Vercel skill analysis)

**Estado:** completado  
**Contexto:** análisis ejecutado con el skill `vercel-react-best-practices` de Anthropics/skills después de completar Plan 1.  
**Prioridad:** mejoras técnicas antes de Plan 4 (invitaciones). Bajo riesgo, alto valor.

---

## Hallazgos

### 1 (HIGH) — Rule 3.9: `React.cache()` — deduplicación por request

`auth()` se llama 3 veces por cada carga de `/dashboard`:

| Lugar | Ruta |
|-------|------|
| `AppLayout` → `requireOrg()` → `getCurrentUser()` → `auth()` | `src/app/(app)/layout.tsx` |
| `AppHeader` → `auth()` directamente | `src/components/auth/AppHeader.tsx:7` |
| `DashboardPage` → `getCurrentUser()` → `auth()` | `src/app/(app)/dashboard/page.tsx:4` |

Cada llamada resuelve la sesión de forma independiente. Con `React.cache()`, las tres comparten una sola promesa por request.

**Fix:** envolver `getCurrentUser` en `React.cache()` en `src/lib/auth-helpers.ts` y hacer que `AppHeader` lo use en vez de llamar `auth()` directamente.

```ts
// src/lib/auth-helpers.ts
import { cache } from "react"
import { auth } from "@/auth"

export const getCurrentUser = cache(async () => {
  const session = await auth()
  return session?.user ?? null
})
```

```tsx
// src/components/auth/AppHeader.tsx — reemplazar auth() por getCurrentUser()
import { getCurrentUser } from "@/lib/auth-helpers"

export async function AppHeader() {
  const user = await getCurrentUser()
  // ...
}
```

---

### 2 (MEDIUM) — Rule 6.11: `useTransition` en `DistrictSwitcher`

`onChange` en `DistrictSwitcher` (`src/components/auth/DistrictSwitcher.tsx:33`) hace `await update()` + `router.refresh()` sin ningún estado de carga. El `<select>` queda interactivo durante el switch, permitiendo doble disparo.

**Fix:** envolver el handler con `useTransition` para deshabilitar el select mientras se procesa.

```tsx
const [isPending, startTransition] = useTransition()

<select
  disabled={isPending}
  onChange={(e) => {
    startTransition(async () => {
      await update({ activeOrganizationId: e.target.value })
      router.refresh()
    })
  }}
>
```

---

### 3 (LOW) — Rule 8.2: `MembershipRefresher` se dispara dos veces en StrictMode

`useEffect` en `MembershipRefresher` (`src/app/(app)/dashboard/MembershipRefresher.tsx:11`) tiene `[update, router]` como deps. En StrictMode (dev), los efectos se montan dos veces, causando que `router.refresh()` se llame dos veces.

**Fix:** guard con `useRef`.

```tsx
const called = useRef(false)

useEffect(() => {
  if (called.current) return
  called.current = true
  update({ refreshMemberships: true }).then(() => router.refresh())
}, [update, router])
```

---

## Tareas

- [x] 1. `React.cache()` en `getCurrentUser` + actualizar `AppHeader`
- [x] 2. `useTransition` en `DistrictSwitcher`
- [x] 3. Ref-guard en `MembershipRefresher`

## Ejecución estimada

~20 min en total. Ejecutar con Sonnet. Sin migraciones, sin cambios de schema.
