# Plan 03c — Identidad de marca Scout (Design System)

**Estado:** completado  
**Contexto:** Aplicar la identidad visual del Manual de Marca Scout Mundial al sitio. Dirección estética "Scout Bold Minimal": brand color sólido y audaz, tipografía legible en exteriores, mobile-first. Ejecutado con el skill `frontend-design`.

---

## Directrices de diseño (referencia permanente)

### Tokens de color (`src/app/globals.css`)

| Token         | Hex       | Uso                                               |
|---------------|-----------|---------------------------------------------------|
| `brand`       | `#622599` | Primario Scout: header, fondos auth, botones      |
| `brand-dark`  | `#481b6f` | Hover de botones `bg-brand`                       |
| `brand-light` | `#f3edf7` | Hover de botones outline, fondos sutiles          |

> No usar gradientes púrpura — el brand color va siempre plano y sólido.

### Tipografía

**Fuente Barlow** (Google Fonts via `next/font/google`): geométrica, ligeramente condensada, excelente legibilidad outdoor. Pesos 400/500/600/700. Variable CSS `--font-barlow` enlazada en `@theme` como `--font-sans`.

### Botones y touch targets

```
Primario:    bg-brand text-white hover:bg-brand-dark py-3 rounded-lg font-medium
Secundario:  border border-brand text-brand hover:bg-brand-light py-3 rounded-lg font-medium
En header:   border border-white/40 text-white hover:bg-white/10 py-1.5 rounded-lg
Google auth: NUNCA modificar
```

Todos los botones usan `py-3` → mínimo 48px de altura para uso móvil en campo.

### Layout

- **Auth pages**: fondo `bg-brand` (purple total, statement de marca)
- **Cards en auth**: `bg-white rounded-2xl shadow-xl` (sin borde — shadow basta sobre fondo oscuro)
- **Texto sobre fondo brand**: `text-white` / `text-white/70`
- **App interior**: `bg-gray-50` limpio, header `bg-brand`
- **Focus rings**: `focus:ring-2 focus:ring-brand` en todos los inputs

---

## Archivos modificados

- `src/app/globals.css` — `@theme` con tokens brand y fuente
- `src/app/layout.tsx` — Barlow via `next/font`, themeColor `#622599`
- `src/app/(auth)/layout.tsx` — `bg-brand`
- `src/components/auth/SignOutButton.tsx` — prop `className?` para override
- `src/components/auth/AppHeader.tsx` — header purple, elementos en blanco
- `src/components/auth/DistrictSwitcher.tsx` — white on purple
- `src/app/(auth)/login/page.tsx` — card sin borde, botón Google `py-3`
- `src/app/(auth)/onboarding/page.tsx` — títulos blancos, botones brand, focus rings brand

## Tareas

- [x] 1. Tokens de diseño en `globals.css` (`@theme` Tailwind v4)
- [x] 2. Tipografía Barlow + themeColor en `layout.tsx`
- [x] 3. Auth layout: fondo `bg-brand`
- [x] 4. `SignOutButton`: prop `className?`
- [x] 5. `AppHeader`: header purple
- [x] 6. `DistrictSwitcher`: estilo white-on-purple
- [x] 7. Login page: card sin borde, touch target
- [x] 8. Onboarding page: brand buttons, focus rings, títulos blancos
