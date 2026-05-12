# Plan 11 — Documentación pública para administradores y participantes

## Contexto

Plan 10 desplegó el sistema a producción. El próximo paso antes de escalar a Capa 2 (padrón de miembros) es que los usuarios reales — admins de distrito, jueces, jefes de patrulla y espectadores — puedan entender el sistema sin asistencia. Hoy no hay ninguna guía de uso: el operador tiene que explicar en persona cómo usar cada vista.

Este plan entrega una sección `/docs` dentro de la misma app Next.js: páginas de guía por rol, sin auth requerida, con la identidad visual del proyecto. Sin nueva infraestructura: mismo deploy, misma URL.

## Alcance

### Incluye

- **Ruta pública `/docs`** — página de inicio con tarjetas por rol y descripción del sistema.
- **Guía del administrador** (`/docs/administrador`) — flujo completo: crear distrito, invitar miembros, crear plantillas, crear evento, asignar postas y jueces, activar, cerrar, publicar.
- **Guía del juez** (`/docs/juez`) — login, vista de eventos asignados, cargar puntaje en criterios y puntaje único, modo offline (PWA), sync al volver online.
- **Guía del jefe de patrulla** (`/docs/jefe-patrulla`) — cómo ver los resultados de su patrulla, qué significa cada columna en el leaderboard.
- **Guía del espectador** (`/docs/espectador`) — acceso al leaderboard en vivo, qué pueden y no pueden hacer.
- **Vista pública de resultados** (`/docs/resultados`) — qué es el link público, cómo compartirlo, que no requiere cuenta.
- **Layout de docs** — shell independiente del app shell: sin `AppHeader` ni menú de usuario. Header propio con brand + título, sidebar de navegación por sección, footer mínimo.
- **`/docs` agregado a `PUBLIC_PATHS`** en `src/auth.config.ts`.

### No incluye

- **MDX** — el contenido vive en componentes TSX. Sin `@next/mdx`, sin nueva dependencia. Si el volumen de contenido crece, se puede migrar a MDX en una iteración futura.
- **Buscador** — out of scope para v1. Con 6 páginas, la sidebar es suficiente.
- **Capturas de pantalla** — el diseño debe funcionar bien sin ellas para v1. Se pueden agregar como `<img>` en una iteración futura.
- **Internacionalización** — el contenido está en español, como todo el proyecto.
- **Modo oscuro** — los docs son light-only. La app ya tiene switch claro/oscuro en `/resultados`; para docs es overhead sin valor claro.
- **Versioning** — una sola versión. Sin `/docs/v1`, `/docs/v2`.
- **Analytics de docs** — sin Google Analytics ni Plausible. Diferido.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **Contenido en TSX vs MDX** | TSX directo | Sin nueva dependencia. El contenido de v1 es estático y finito (6 páginas). TSX permite usar los componentes de Tailwind directamente. Si el contenido crece, la migración a MDX es mecánica. |
| **Route group nuevo vs `(public)`** | Nuevo `(docs)` | Los docs necesitan su propio shell (sidebar, header sin login). El `(public)` group no tiene sidebar. Route group no afecta las URLs. |
| **Sidebar: siempre visible vs colapsable** | Siempre visible en desktop, off-canvas en mobile (toggle) | En desktop la sidebar da orientación permanente. En mobile ocupa demasiado. Un botón hamburguesa simple en mobile abre/cierra con `useState`. |
| **Autenticación requerida** | No — docs públicos | Las guías son para usuarios que aún no crearon cuenta. Agregar `/docs` a `PUBLIC_PATHS`. |
| **Dirección estética** | "Scout Field Manual" — ver sección de diseño | Consistente con el design system existente (Barlow, #622599) pero con personalidad propia para docs. |

## Dirección estética: "Scout Field Manual"

Los docs deben sentirse como un **manual de actividades impreso para el campo**: claro, funcional, con carácter. No un SaaS genérico de documentación (GitBook, ReadTheDocs). No Material Design.

**Características específicas**:

- **Tipografía**: Barlow (ya en la app) para headings con peso 700 y tracking ligeramente ajustado. Body en tamaño cómodo de lectura (`text-base leading-relaxed`), no `text-sm`. Los títulos de sección usan una escala visual clara (h1 grande, h2 con separador de color brand).
- **Color**: fondo `bg-white` (limpio, legible). Sidebar con fondo `bg-gray-50` y border derecho. Links y acentos en brand `#622599`. Marcadores de sección (número o ícono) en el color del rol (admin=brand, juez=amber, jefe=emerald, espectador=sky, público=rose).
- **Layout**: sidebar fija a la izquierda (240px), content area centrada con max-width de lectura (~720px), padding generoso. Header top fijo con altura 56px, brand logo + "Documentación".
- **Cards en home**: tarjetas por rol con ícono grande, nombre del rol y descripción de 1 línea. Grid 2×3 (desktop) o stack (mobile). Borde superior color del rol, fondo blanco.
- **Callouts**: cajas de aviso `💡 Tip`, `⚠️ Importante` con fondo levemente coloreado y border izquierdo brand/amber. Sin emojis si el usuario no los pide — usar marcadores tipográficos (`Tip:`, `Atención:`).
- **Secciones numeradas**: los pasos del flujo admin usan círculos numerados brand (`rounded-full bg-brand text-white text-sm`) en lugar de bullets planos.
- **No usar**: Inter, gradientes, sombras pesadas, animaciones de entrada elaboradas. Los docs son para leer rápido durante o antes de un evento.

## Estructura de archivos

```
src/app/(docs)/
  layout.tsx                      — HTML root passthrough (no <html><body>)
  docs/
    layout.tsx                    — DocsShell: sidebar + content area
    page.tsx                      — /docs — home, tarjetas por rol
    administrador/
      page.tsx                    — /docs/administrador
    juez/
      page.tsx                    — /docs/juez
    jefe-patrulla/
      page.tsx                    — /docs/jefe-patrulla
    espectador/
      page.tsx                    — /docs/espectador
    resultados/
      page.tsx                    — /docs/resultados (vista pública)

src/components/docs/
  DocsHeader.tsx                  — header fijo: logo + "Documentación" + link a la app
  DocsSidebar.tsx                 — sidebar con secciones y links, estado activo
  DocsNav.tsx                     — datos de navegación (título, href, color por rol)
  RoleCard.tsx                    — tarjeta de rol para la home
  StepList.tsx                    — lista de pasos numerados con círculos brand
  Callout.tsx                     — caja de aviso (tip / important)
```

## Contenido por página

### `/docs` — Home

- Título: "Documentación de Puntajes Scout"
- Subtítulo: 2 líneas de descripción del sistema
- Grid de 5 tarjetas: Administrador, Juez, Jefe de Patrulla, Espectador, Resultados Públicos
- Cada tarjeta: ícono, nombre del rol, descripción de 1 línea, botón "Ir a la guía"

### `/docs/administrador`

Basado en los escenarios de verificación de los planes 6a, 6b, 6c, 7a, 8:

1. **Crear tu distrito** — onboarding post-login
2. **Invitar miembros** — roles disponibles (ADMIN, JUEZ, ESPECTADOR, JEFE_PATRULLA), link de invitación, expiración
3. **Gestionar grupos scouts** — crear grupos, asignar miembros
4. **Crear una plantilla de puntaje** — modo CRITERIOS vs PUNTAJE_ÚNICO, criterios PUNTUABLE y DESEMPATE, escalas
5. **Crear un evento** — nombre, fecha, actividades con peso porcentual (suma 100%)
6. **Configurar postas** — biblioteca de postas, asignar posta a actividad, asignar juez
7. **Agregar patrullas** — asociar a grupo scout
8. **Activar el evento** — gates de pre-activación (qué bloquea, qué revisar)
9. **Durante el evento** — seguimiento de planillas en `/admin/eventos/[id]/planillas`, reabrir planilla si hay error
10. **Cerrar el evento** — gate de cierre (planillas incompletas bloquean), transición a CERRADO
11. **Publicar y compartir resultados** — generar snapshot, link público, rotar link

### `/docs/juez`

Basado en escenarios de planes 7a, 7b, 7c:

1. **Cómo acceder** — URL, login con Google o email/contraseña
2. **Ver eventos asignados** — solo aparecen los eventos ACTIVO con postas asignadas al juez
3. **Cargar puntaje (modo CRITERIOS)** — seleccionar patrulla, ingresar valor por criterio, guardar borrador, enviar
4. **Cargar puntaje (modo PUNTAJE_ÚNICO)** — valor único, comentario opcional
5. **Modo offline** — qué funciona sin red (cargar puntajes), qué no (ver resultados nuevos); el badge de sync
6. **Instalar como app** — agregar al home screen en iOS/Android para acceso offline rápido
7. **Conflictos** — qué hacer si aparece el banner "planilla reabierta"

### `/docs/jefe-patrulla`

1. **Cómo acceder** — login, rol JEFE_PATRULLA
2. **Ver resultados de tu patrulla** — `/eventos/[id]/resultados`, columnas del leaderboard
3. **Comparar con otras patrullas** — tu patrulla aparece destacada
4. **Acceso al link público** — no requiere cuenta

### `/docs/espectador`

1. **Cómo acceder** — login con rol ESPECTADOR
2. **Ver el leaderboard** — `/eventos/[id]/resultados`
3. **Lo que no pueden hacer** — no cargar puntajes, no modificar nada

### `/docs/resultados`

1. **Qué es la vista pública** — URL `/resultados/[token]`, no requiere cuenta
2. **Cómo obtener el link** — el admin lo genera al publicar el evento
3. **Qué muestra** — ranking final, breakdown por actividad y posta, podio top 3
4. **Compartir** — puede enviarse por WhatsApp, email, redes sociales

## Archivos críticos

**Nuevos**:
- `src/app/(docs)/layout.tsx`
- `src/app/(docs)/docs/layout.tsx`
- `src/app/(docs)/docs/page.tsx`
- `src/app/(docs)/docs/administrador/page.tsx`
- `src/app/(docs)/docs/juez/page.tsx`
- `src/app/(docs)/docs/jefe-patrulla/page.tsx`
- `src/app/(docs)/docs/espectador/page.tsx`
- `src/app/(docs)/docs/resultados/page.tsx`
- `src/components/docs/DocsHeader.tsx`
- `src/components/docs/DocsSidebar.tsx`
- `src/components/docs/DocsNav.tsx`
- `src/components/docs/RoleCard.tsx`
- `src/components/docs/StepList.tsx`
- `src/components/docs/Callout.tsx`

**Modificados**:
- `src/auth.config.ts` — agregar `"/docs"` a `PUBLIC_PATHS`
- `README.md` — agregar link a `/docs` en descripción

**Sin cambios**:
- Schema Prisma, repositorios, server actions, service worker.

## Implementación

### Paso 1 — Leer el skill de diseño

Leer `.agents/skills/frontend-design/SKILL.md` y el design system en `docs/plans/03c-design-system.md` antes de tocar ningún archivo de UI.

### Paso 2 — Route group y layouts

Crear `src/app/(docs)/layout.tsx` como passthrough (sin `<html><body>` — ya existe en `app/layout.tsx`):

```tsx
export default function DocsGroupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
```

Crear `src/app/(docs)/docs/layout.tsx` — `DocsShell` con `DocsHeader` + `DocsSidebar` + área de contenido.

### Paso 3 — Componentes de docs

En orden: `DocsNav.tsx` (datos), `DocsHeader.tsx`, `DocsSidebar.tsx`, `RoleCard.tsx`, `StepList.tsx`, `Callout.tsx`.

### Paso 4 — Páginas

Home → administrador → juez → jefe-patrulla → espectador → resultados. En ese orden, desde la más densa (administrador) hasta la más corta (espectador).

### Paso 5 — `PUBLIC_PATHS`

Agregar `"/docs"` en `src/auth.config.ts`.

### Paso 6 — Verificación

Recorrer todos los escenarios de verificación del plan antes del commit de cierre.

## Verificación

### Escenario 1 — Acceso sin autenticación

**Pasos**: abrir `/docs` en una ventana de incógnito (sin sesión).

**Qué verificar**:
- Carga sin redirigir a `/login`.
- Header muestra brand y "Documentación".
- Las 5 tarjetas de rol son visibles.
- Los links del sidebar navegan a cada sección.

### Escenario 2 — Navegación completa

**Pasos**: desde la home, hacer click en cada tarjeta de rol y leer la guía completa.

**Qué verificar**:
- Cada página carga y muestra el contenido esperado.
- El sidebar marca como activo el link de la página actual.
- El link "Volver a la app" en el header funciona (va a `/login` o `/dashboard` según sesión).
- Las secciones numeradas del admin están en orden correcto.

### Escenario 3 — Mobile

**Pasos**: abrir `/docs` en viewport 375px (iPhone SE).

**Qué verificar**:
- El sidebar está oculto y hay un botón para abrirlo.
- Al abrir el sidebar, se puede navegar y cerrar.
- El contenido de cada página es legible sin scroll horizontal.
- Touch targets de los links son ≥ 44px.

### Escenario 4 — Consistencia visual

**Pasos**: comparar `/docs` con `/login` y `/dashboard`.

**Qué verificar**:
- Misma fuente Barlow.
- Brand color `#622599` presente y consistente.
- Los docs se sienten del mismo proyecto, no de otro producto.

### Escenario 5 — Contenido cubre el flujo completo del admin

**Pasos**: un usuario nuevo sin conocimiento previo intenta crear un evento completo siguiendo solo la guía del administrador.

**Qué verificar**:
- Los pasos están en orden lógico.
- No hay pasos que asuman conocimiento no explicado antes.
- Los nombres de menús y botones coinciden con los de la app real.
- Las acciones bloqueantes (gates de activación, gate de cierre) están documentadas con qué hacer.

### Escenario 6 — Contenido cubre el flujo del juez offline

**Pasos**: un juez nuevo sin WiFi sigue la guía de juez para cargar puntajes.

**Qué verificar**:
- La guía explica que puede trabajar sin red.
- Explica qué es el badge de sync y cuándo se envían los datos.
- Explica qué hacer si aparece el banner de conflicto.

## Lecciones aprendidas

### #1 — `react/no-unescaped-entities` con comillas en JSX text de contenido

**Qué pasó**: todas las páginas de contenido usaban `"NombreDeBoton"` directamente en JSX text (entre tags `<p>`, `<strong>`, etc.). ESLint lanza `react/no-unescaped-entities` para el carácter `"` en JSX — hay que escaparlo como `&ldquo;` / `&rdquo;`.

**Fix**: reemplazar todas las comillas de etiquetas de UI en JSX text con entidades HTML `&ldquo;` (apertura) y `&rdquo;` (cierre). Las comillas dentro de strings JS (props o arrays) no tienen este problema.

**Regla permanente**: en páginas de documentación con muchos nombres de botones entre comillas, usar `&ldquo;` / `&rdquo;` desde el primer draft. Alternativa más legible: crear un componente `<ButtonLabel>Nombre</ButtonLabel>` que incluya las entidades internamente.

### #2 — Import no usado (`StepList`) de un refactor en página admin

**Qué pasó**: la página del administrador importaba `StepList` pero al escribir el contenido se optó por listas/tablas propias en lugar del componente. El import quedó sin usar y ESLint lo marcó como warning.

**Fix**: eliminar el import.

**Regla permanente**: al escribir páginas con contenido estático, importar los componentes solo cuando se van a usar efectivamente. No dejar imports "por si acaso".

### #3 — Páginas de docs compiladas como `○ (Static)` — comportamiento deseable

**Qué pasó** (positivo): las 6 rutas `/docs/*` aparecen como `○ (Static)` en el build output. Esto significa que Next.js las pre-renderiza en build time como HTML estático — la respuesta más rápida posible, sin pasar por el servidor en runtime.

**Por qué ocurre**: los componentes de docs no usan `cookies()`, `headers()`, `unstable_cache` ni ninguna API dinámica. Son componentes puramente estáticos.

**Implicación**: si en el futuro se agrega contenido condicional basado en sesión (ej: "ya estás logueado, ir al dashboard"), hay que asegurarse de que el componente siga siendo estático o marcarlo como `dynamic = "force-dynamic"`.

## Commits asociados

| Hash | Descripción |
|---|---|
| `19c07b2` | feat(docs): página pública de documentación /docs (Plan 11) |
