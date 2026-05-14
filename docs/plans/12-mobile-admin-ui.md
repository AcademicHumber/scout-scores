# Plan 12 — Mobile UI: correcciones de overflow y formularios en el admin

## Contexto

Los planes anteriores construyeron el admin con una mentalidad desktop-first. Al usar el sistema en campo (tablets y teléfonos de los dirigentes), aparecen dos categorías de problemas:

1. **Overflow horizontal**: tablas sin scroll, encabezado con demasiados elementos, causando barras de scroll inesperadas o contenido recortado.
2. **Formularios inutilizables**: el caso más grave es la página Miembros, donde cada fila tiene dos `<select>` lado a lado dentro de una `<td>` — en una pantalla de 375px el formulario queda aplastado e impracticable.

Este plan no cambia lógica de negocio, modelos ni server actions. Trabaja exclusivamente sobre JSX, clases Tailwind y estructura de componentes. Todos los cambios respetan el sistema de diseño **Scout Bold Minimal** de Plan 03c (brand `#622599`, Barlow, `rounded-xl border`, touch targets ≥ 48px).

## Alcance

### Incluye

- `AppHeader`: colapsar los links de navegación en mobile (ocultar con `hidden sm:flex`).
- `AdminNav`: reducir `gap-6` → `gap-3 sm:gap-6` para que los 7 tabs entren más cómodamente en mobile.
- `MembershipRow` + `miembros/page.tsx`: rediseño completo de tabla → cards. Los dos selects pasan a ser full-width, apilados verticalmente con labels.
- `invitaciones/page.tsx`: reemplazar `InvitationTable` (6 columnas) por `InvitationList` (cards).
- `grupos/page.tsx`: agregar wrapper `overflow-x-auto` + `min-w` en la tabla.
- `PostaForm.tsx` y `PostaDetailForm.tsx`: fila de materiales responsiva (`flex-col sm:flex-row`), input de duración `w-full sm:w-32`.

### No incluye

- Cambios en lógica de negocio, server actions ni repositorios.
- Rediseño de rutas del juez `/juez/**` (ya son mobile-first desde Plan 7a–7c).
- `TemplateCoreForm.tsx`: los inputs `w-32` están en un `flex gap-2` con un botón chico — total ~210px, caben en 375px sin problema.
- `ActividadRow.tsx`: el input `w-24` de peso está en un `grid sm:grid-cols-[1fr_auto_auto_auto]` — en mobile el grid colapsa a 1 columna y el elemento no desborda.
- Hamburguer menu o bottom navigation: la solución es ocultar links, no reorganizar la navegación global.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **¿Miembros: tabla con overflow-x-auto o cards?** | Cards | Dos `<select>` dentro de una `<td>` no tienen solución limpia con scroll — el usuario tendría que scrollear horizontalmente y usar un select en la misma celda. Cards full-width es la única opción que da touch targets adecuados. |
| **¿Cards solo en mobile (`sm:hidden` + tabla en `sm:`)?** | Cards para todos los breakpoints | La tabla de miembros tiene 3 columnas donde la segunda contiene un formulario complejo. En desktop las cards también son más claras. Mantener dos representaciones sincronizadas duplica el código. |
| **¿Invitaciones: overflow-x-auto o cards?** | Cards | 6 columnas en 375px no son legibles ni con scroll. Las invitaciones son display-only salvo el botón Revocar — el layout de card es trivial de implementar. |
| **¿Grupos: overflow-x-auto o cards?** | overflow-x-auto | 3 columnas simples (nombre, slug, Editar) — el overflow-x-auto con `min-w` basta y evita reescribir el componente. |
| **¿AppHeader: hamburger o collapse?** | Collapse (`hidden sm:flex`) | Los links de Admin/Juez/Eventos en el header son navegación secundaria — el admin usa AdminNav, el juez tiene su propio shell. Ocultarlos en mobile simplifica sin perder funcionalidad. El `DistrictSwitcher` y los controles de cuenta (avatar, logout) permanecen siempre visibles. |
| **¿Preservar lógica de `MembershipRow`?** | Sí, íntegra | El componente tiene estado complejo (`isDirty`, sincronización desde action result, `useEffect` calibrado para evitar props stale). Solo cambia el JSX de render; la lógica de `useActionState`, `useState` y efectos queda sin tocar. |

## Cambios por archivo

### 1. `src/components/auth/AppHeader.tsx`

Problema: en mobile el lado izquierdo acumula "Puntajes Scout" + DistrictSwitcher + hasta 3 links (Admin, Juez, Eventos) — overflow garantizado en 375px.

```tsx
// Cambio: envolver los tres links en hidden sm:flex
<div className="hidden sm:flex items-center gap-3">
  {isAdmin && <Link href="/admin" ...>Admin</Link>}
  {isJuez && <Link href="/juez/eventos" ...>Juez</Link>}
  {user && <Link href="/eventos" ...>Eventos</Link>}
</div>

// Cambio: ocultar el nombre de texto del avatar en mobile
<span className="hidden sm:inline text-sm text-white/80">{user?.name}</span>
```

Header mobile resultante: `[Puntajes Scout] [DistrictSwitcher]` | `[avatar] [Salir]` — 4 elementos, caben en 375px.

### 2. `src/components/admin/AdminNav.tsx`

```tsx
// Cambio en la línea 21: gap-6 → gap-3 sm:gap-6
<div className="flex gap-3 sm:gap-6 overflow-x-auto py-3">
```

El `overflow-x-auto` y `whitespace-nowrap` ya están — solo se achica el espaciado para que los 7 tabs entren mejor antes de necesitar scroll.

### 3. `src/app/(app)/admin/miembros/page.tsx`

Reemplazar la estructura `<table>/<thead>/<tbody>` por una lista de cards:

```tsx
<div className="divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
  {memberships.map((m) => (
    <MembershipRow
      key={m.id}
      membership={m}
      grupos={grupos}
      currentUserId={org.userId}
    />
  ))}
</div>
```

No hay `<table>`, `<thead>` ni columnas en el padre — `MembershipRow` renderiza su propia card completa.

### 4. `src/components/admin/MembershipRow.tsx`

Rediseño del JSX. La lógica (state, useEffect, useActionState, handleRemove) queda intacta.

Estructura de la card:
```
┌────────────────────────────────────────┐  ← border-l-4 border-brand si isCurrentUser
│ [avatar]  Juan García       [Vos]      │
│           juan@email.com               │
│                                        │
│ Rol                                    │
│ [Administrador           ▾         ]  │  ← w-full py-2.5
│                                        │
│ Grupo                                  │
│ [Sin grupo               ▾         ]  │  ← w-full py-2.5
│                                        │
│ [error/success msg]  [Guardar] [Quitar]│
└────────────────────────────────────────┘
```

- Elemento raíz: `<div className="p-4 {isCurrentUser ? 'border-l-4 border-brand' : ''}">`
- Avatar + nombre: `flex items-center gap-3 mb-4`
- Labels sobre cada select: `<p className="mb-1 text-xs font-medium text-gray-500">`
- Selects: `w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:border-brand focus:outline-none`
- `py-2.5` ≈ 42px — dentro del rango touch target (~48px es el ideal con la etiqueta encima)
- Fila de acciones: `flex items-center justify-between mt-4`
  - Save: `rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50`
  - Remove: `text-sm font-medium text-red-600 hover:underline disabled:opacity-50`
- Error/éxito: texto `text-xs text-red-600` / `text-xs text-green-600` en la fila de acciones

### 5. `src/app/(app)/admin/invitaciones/page.tsx`

Reemplazar la función privada `InvitationTable` por `InvitationList`. La firma es idéntica — solo cambia el cuerpo.

Estructura de cada card de invitación:
```
┌────────────────────────────────────────┐
│ adrian@gmail.com         [Pendiente]   │
│ Administrador · Sin grupo              │
│ Expira 15/05/2026          [Revocar]   │
└────────────────────────────────────────┘
```

```tsx
function InvitationList({ invitations, showRevoke }: { invitations: InvitationWithGrupo[], showRevoke?: boolean }) {
  return (
    <div className="divide-y overflow-hidden rounded-xl border bg-white shadow-sm">
      {invitations.map((inv) => (
        <div key={inv.id} className="px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <span className="truncate text-sm font-medium text-gray-900">{inv.email}</span>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${...colorClasses}`}>
              {STATUS_LABELS[inv.status]}
            </span>
          </div>
          <p className="mt-0.5 text-sm text-gray-500">
            {ROLE_LABELS[inv.role]} {inv.grupoScout ? `· ${inv.grupoScout.nombre}` : ''}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">Expira {inv.expiresAt.toLocaleDateString("es-AR")}</span>
            {showRevoke && <RevokeButton id={inv.id} email={inv.email} />}
          </div>
        </div>
      ))}
    </div>
  )
}
```

### 6. `src/app/(app)/admin/grupos/page.tsx`

```tsx
// Cambio: agregar wrapper overflow-x-auto entre el container y la tabla
<div className="overflow-hidden rounded-xl border bg-white shadow-sm">
  <div className="overflow-x-auto">
    <table className="w-full min-w-[360px] text-sm">
      {/* sin cambios internos */}
    </table>
  </div>
</div>
```

`min-w-[360px]` fuerza scroll horizontal en dispositivos < 360px. Para pantallas normales (≥ 375px) la tabla cabe y no aparece scroll.

### 7. `src/components/admin/postas/PostaForm.tsx`

**Duración** (línea 74):
```tsx
// Antes
className="w-32 rounded border px-3 py-2 ..."
// Después
className="w-full sm:w-32 rounded border px-3 py-2 ..."
```

**Fila de materiales** (líneas 97-117): cambiar el `flex gap-2` por layout apilable:
```tsx
<div key={idx} className="flex flex-col gap-1.5 sm:flex-row sm:gap-2">
  <input
    className="flex-1 rounded border px-2 py-1.5 text-sm ..."  // nombre
  />
  <div className="flex gap-2">
    <input
      className="flex-1 sm:w-40 rounded border px-2 py-1.5 text-sm ..."  // cantidad
    />
    <button type="button" onClick={() => removeMaterial(idx)}
      className="shrink-0 rounded px-2 text-red-400 hover:bg-red-50">✕</button>
  </div>
</div>
```

En mobile: nombre en su propia línea, cantidad + borrar en la línea siguiente (cada uno full-width dentro de su contenedor).

### 8. `src/components/admin/postas/PostaDetailForm.tsx`

Mismos cambios que `PostaForm.tsx` — la estructura es idéntica:
- Duración `w-32` → `w-full sm:w-32`
- Fila de materiales: `flex-col sm:flex-row`

## Tareas

- [x] 1. `AppHeader.tsx` — ocultar nav links y nombre de usuario en mobile
- [x] 2. `AdminNav.tsx` — gap-3 sm:gap-6
- [x] 3. `miembros/page.tsx` — reemplazar tabla por card list
- [x] 4. `MembershipRow.tsx` — rediseño JSX a card (mantener lógica intacta)
- [x] 5. `invitaciones/page.tsx` — reemplazar InvitationTable por InvitationList
- [x] 6. `grupos/page.tsx` — agregar overflow-x-auto wrapper
- [x] 7. `PostaForm.tsx` — duración + materiales responsive
- [x] 8. `PostaDetailForm.tsx` — duración + materiales responsive
- [x] 9. `pnpm typecheck` — sin errores

## Cambios adicionales (post-plan)

Los siguientes cambios se realizaron en la misma sesión como continuación del plan:

### AppHeader — menú hamburger (`MobileMenu.tsx`)

Se creó `src/components/auth/MobileMenu.tsx` (Client Component) que reemplaza la barra secundaria mobile. El Server Component `AppHeader` pasa `name`, `email`, `image`, `isAdmin`, `isJuez` como props. El drawer siempre está en el DOM (`translate-x-full` / `translate-x-0`) para que la animación de salida funcione. Prop `alwaysVisible?: boolean` elimina `sm:hidden` del botón (usada en el layout del juez).

### Layout del juez — hamburger solo para ADMIN

`src/app/(juez)/juez/layout.tsx` ahora llama `getCurrentUser()` en paralelo con `requireRole`. Si `org.role === "ADMIN"`: muestra `SyncStatusBadge` + `<MobileMenu alwaysVisible isAdmin isJuez={false} />` (sin el link "Vista del juez" porque ya está en esa vista). Si `JUEZ`: muestra `SyncStatusBadge` + `SignOutButton` (sin cambios).

### AdminNav — pills con borde

Cambio visual de los links del subnav de admin: de texto gris plano a pills con `border border-gray-200 rounded-full`. Activo: `bg-brand text-white`. Inactivo: `border hover:border-brand/40 hover:bg-brand/5`. Scrollbar oculto + degradado derecho como hint de scroll.

### Dashboard — cards de navegación para ADMIN

`src/app/(app)/dashboard/page.tsx` reemplaza el placeholder "El dashboard llegará en Plan 2" con cards de navegación condicionales (`user?.activeRole === "ADMIN"`): links a `/admin` y `/eventos`.

### Plantillas nueva — botón volver

`src/app/(app)/admin/plantillas/nueva/page.tsx` agrega `← Plantillas` (mismo patrón que postas/eventos), y envuelve el formulario en el card `rounded-xl border bg-white p-6 shadow-sm`.

### CategoriaSelect — filtro que estaba deshabilitado

`src/components/admin/plantillas/CategoriaSelect.tsx` (Client Component). El `<select disabled>` en `plantillas/page.tsx` tenía toda la lógica de filtrado implementada en el servidor pero el control nunca se habilitó. El Client Component usa `useSearchParams` + `router.push` para preservar los demás filtros (modo, archivadas) al cambiar de categoría.

## Lecciones aprendidas

### #1 — Nunca anidar `<form>` dentro de `<form>` al rediseñar a cards

El `MembershipRow` original usaba dos `<form>` en `<td>` separadas — valid HTML porque estaban en celdas de tabla distintas. Al mover a card, el primer instinto fue envolver los selects y el save button en una form, con la remove form anidada dentro del div de acciones. Eso genera HTML inválido (browsers ignoran la form interna).

**Solución**: los selects son inputs controlados puros (sin `name`, fuera de cualquier form). La update form solo lleva hidden inputs con los valores del state (`role`, `grupoScoutId`) más el submit button. La remove form es un hermano, no un hijo.

**Regla**: en layouts de card donde dos acciones comparten pantalla, usar dos `<form>` hermanas. El estado de los selects puede vivir en `useState` e inyectarse como hidden inputs en el momento del submit.

## Verificación

Abrir cada página en el navegador con DevTools en "iPhone SE" (375 × 667) o "Galaxy S20" (360 × 800):

1. **Header**: en mobile se ve "Puntajes Scout" + selector de distrito a la izquierda, avatar + Salir a la derecha. Sin links Admin/Juez/Eventos. Sin overflow horizontal. En `sm:` los links aparecen.

2. **AdminNav**: los 7 tabs scrollean horizontalmente sin desbordarse hacia el body. El tab activo tiene su indicador `border-b-2 border-brand` visible.

3. **Miembros** (`/admin/miembros`): cada miembro se muestra como card con selects full-width apilados verticalmente. Se puede cambiar rol y grupo fácilmente. El botón Guardar aparece al detectar cambios. El usuario actual tiene borde morado a la izquierda.

4. **Invitaciones** (`/admin/invitaciones`): cada invitación es una card con email, rol, grupo, estado badge y fecha de expiración visible. El botón Revocar es tappable (mínimo 44px). Sin overflow horizontal.

5. **Grupos** (`/admin/grupos`): la tabla se ve sin overflow en 375px. Si el slug es largo, aparece scroll horizontal suave dentro del card blanco.

6. **Posta nueva/editar** (`/admin/postas/...`): al agregar un material, en mobile aparece el campo "nombre" en una línea y "cantidad" + "✕" en la línea siguiente. En desktop vuelven a estar en fila. El campo duración es full-width en mobile.

7. **`pnpm typecheck`** pasa sin errores (correr `rm -rf .next/types` si se tocaron rutas).
