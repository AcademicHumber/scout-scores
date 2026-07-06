# Plan 16 — Postas creadas por jueces

> Estado: redactado (formal), pendiente de ejecución. Reemplaza a `docs/plans/16-postas-por-juez-preplan.md` como referencia primaria — el preplan queda como registro histórico de la conversación de alineación de producto.

---

## Contexto

Los administradores hoy transcriben a mano, desde fichas Excel que envían los dirigentes, cada posta que se usará en un evento (`/admin/postas`). Es trabajo repetitivo para una sola persona por evento — feedback real recibido de administradores del sistema. La idea: que cada dirigente (rol `JUEZ`) pueda cargar su propia posta directo en el sistema, vinculada a la actividad del evento donde va a jugarla, sin pasar por el admin como intermediario.

Esto es posible sin fricción gracias al **Plan 15** (ya ejecutado, ver `docs/plans/15-template-por-actividad.md`): `templateId` vive en `Actividad`, no en `Posta` — el juez que crea una posta nunca tiene que elegir plantilla/criterios/escala, ya están resueltos por la actividad. Plan 15 también dejó `Posta.criteriosDescripciones` (leyenda de qué significa cada valor de la escala) y el componente `CriteriosDescripcionesForm`, que resultan ser exactamente el dato que trae la ficha Excel del juez ("3° = 5, 2° = 7, 1° = 10").

Este documento resuelve las preguntas abiertas del preplan tras una ronda de exploración del código existente y de alineación de producto con el usuario. Decisiones de producto ya tomadas en el preplan (no se revisitan aquí): arquitectura online-only fuera del SPA offline; enlaces SPA→online se deshabilitan sin conexión; el template no se toca en este flujo; auto-asignación inmediata; edición habilitada hasta `ACTIVO`; reuso de postas por nombre; visibilidad abierta a cualquier `JUEZ` del distrito.

### Decisiones nuevas confirmadas con el usuario en esta sesión

- **Ubicación**: se extiende `/eventos` (ya existe, hoy solo lista `PUBLICADO`) en vez de crear una sección nueva fuera de `/juez/**`. Evita el problema detectado de que cualquier ruta bajo el prefijo `/juez/` cae en el catch-all `[[...slug]]` que el Service Worker precachea como parte del SPA offline (convención #32) — meter ahí una página SSR real generaría ambigüedad de cacheo. `/eventos` ya vive fuera de ese prefijo y ya es el lugar donde el SPA linkea hacia "afuera" (`EventosListView.tsx`).
- **Leyenda inline**: el juez completa `criteriosDescripciones` en el mismo flujo de creación de la posta, ya con la actividad (y por lo tanto el template) resuelta de antemano — es el momento en que tiene la ficha a mano. Opcional, no bloquea el guardado.
- **Detección de duplicados**: autocomplete en vivo client-side (sin red adicional — la lista de postas de la org ya se trae completa para el formulario) que sugiere reusar una posta existente por nombre en vez de esperar al error de guardado.
- **El SPA offline del juez no se toca.** Ver sección dedicada más abajo — restricción explícita pedida por el usuario.

---

## Hallazgos clave de la exploración (cambian el alcance respecto al preplan)

1. **No hace falta un repo de lectura nuevo.** El preplan asumía que había que reconstruir algo como el viejo `listEventosParaJuez` (eliminado en Plan 7c por estar acoplado al snapshot offline). Pero `listEventos(organizationId, { estados })` y `findEventoById(organizationId, id)` (`src/repositories/evento.repo.ts`) ya son genéricos, no tienen ningún acoplamiento a IndexedDB/snapshot, y `findEventoById` ya incluye `actividades → template (modo, criterios) → asignaciones (posta, juezUser)` — exactamente el shape que necesita la página de planificación del juez.
2. **El gap real de la decisión de "links SPA deshabilitados offline" ya existe hoy sin resolver**: `EventosListView.tsx` (línea 111) linkea a `/eventos` con un `<Link>` de Next.js normal, sin ningún chequeo de `navigator.onLine`. No hay ningún hook reusable de estado online reactivo en el proyecto (solo checks puntuales de `navigator.onLine` no-reactivos en `use-juez-data.ts`/`ScoreSheetForm.tsx`, y el listener `online`/`offline` vive privado dentro de `sync-engine.ts`). Este plan agrega el hook y lo aplica ahí.
3. **No hay forma de saber quién creó una `Posta`** — el modelo no tiene ese dato. Para la regla de permisos ("un JUEZ solo edita/borra su propia posta, no las de otros jueces") hace falta un campo nuevo.
4. **`AsignacionPostaDialog`/`CriteriosDescripcionesForm` (admin) no son reusables tal cual**, aunque sí como referencia de patrón visual: ambos asumen un flujo en dos pasos con una `Posta` ya persistida (`postaId` conocido) antes de tocar la leyenda. Acá crear la posta, autoasignarla y guardar la leyenda inicial tienen que ser la misma operación atómica (si el juez completa la leyenda y algo falla, no debe quedar una posta creada sin asignar). Se escribe un componente y una server action nuevos, reusando el patrón visual de inputs (badge de valor + texto libre).

---

## Alcance

### Incluye

- **Schema**: `Posta.creadoPorUserId String?` (FK a `User`, `onDelete: SetNull`), seteado al creador en el momento de creación (juez o admin — no cambia el flujo admin existente, solo empieza a registrar el dato).
- **`posta.repo.ts`**:
  - `crearPostaYAsignar(organizationId, actividadId, data, actorUserId)`: transacción única que crea la `Posta` (con `creadoPorUserId`), la `AsignacionPosta` (`juezUserId = actorUserId`) y, si viene, el `criteriosDescripciones` inicial. Reusa las validaciones ya existentes (`isEventoLocked`, posta no ya asignada en el evento, `nombre` único vía P2002 → `NOMBRE_POSTA_DUPLICADO`) sin duplicar lógica: se factoriza lo compartido con `createPosta`/`asignarPosta` donde tenga sentido.
  - `updatePosta`/`deletePosta`: agregan parámetro `actorRole: Role` en el llamador; cuando el rol efectivo es `JUEZ` (no `ADMIN`), validan `posta.creadoPorUserId === actorUserId` → `BusinessError("POSTA_NO_PROPIA")` si no coincide. Los call sites de `/admin/postas` (siempre `ADMIN`) no cambian de comportamiento.
  - `asignarPosta`: agrega `.catch` de `P2002` sobre el `create` de `AsignacionPosta` → `BusinessError("POSTA_YA_ASIGNADA_EN_EVENTO")` (ya existe el código; hoy solo se detecta por pre-check, no por el unique constraint — cierra una condición de carrera real entre dos jueces asignándose casi simultáneamente).
  - Nueva lectura `listPostasDisponiblesParaJuez(organizationId)`: mismo shape que ya usa `AsignacionPostaDialog` (`nombre`, `id`, `duracionMinutos`, `asignadaEnActividad`), expuesta para el flujo del juez (mismo cache tag `postas:orgId`).
- **`evento.repo.ts`**: sin funciones nuevas — se reusan `listEventos(orgId, { estados: ["BORRADOR"] })` y `findEventoById`.
- **`src/lib/errors.ts`**: agrega `POSTA_NO_PROPIA` al listado documentado.
- **Nuevo hook `src/lib/offline/use-online-status.ts`**: `useOnlineStatus()` reactivo (estado inicial `navigator.onLine`, se suscribe a `online`/`offline`), mismo patrón de listeners que ya usa `sync-engine.ts`.
- **UI — `/eventos` (extender)**: para roles `JUEZ`/`ADMIN`, agrega una segunda sección "Eventos en planificación" listando `BORRADOR` (además de la sección existente de `PUBLICADO`, sin tocarla), cada uno linkeando a `/eventos/[id]/postas`.
- **UI — nueva ruta `/eventos/[id]/postas`** (`src/app/(app)/eventos/[id]/postas/page.tsx`): requiere rol `JUEZ`/`ADMIN` (`requireRole(["JUEZ","ADMIN"])`) y evento en `BORRADOR` (`notFound()` en otro caso, mismo patrón que `resultados/page.tsx` con `PUBLICADO`). Lista las actividades del evento (nombre, tipo, template resuelto) con sus asignaciones actuales (posta + juez, de solo lectura si no es la propia) y, por actividad, un botón "Cargar mi posta".
- **Nuevo componente `src/components/juez/postas/CrearPostaDialog.tsx`** (Client Component): dialog análogo a `AsignacionPostaDialog` pero para el flujo del juez —
  - Input de nombre con autocomplete en vivo (debounce, filtra client-side sobre `postasDisponibles` recibidas por prop) → si hay coincidencia, ofrece "Usar esta posta" (cambia el formulario a modo "asignar existente", reusando una acción que envuelve `asignarPosta`) en vez de crear una nueva.
  - Campos descriptivos: descripción, duración, materiales, encargado, ayudantes (mismo shape que `PostaForm`/`AsignacionPostaDialog`).
  - Sección de leyenda: por cada criterio del template de la actividad (o el eje único en `PUNTAJE_UNICO`), un input de texto por valor de la escala — mismo patrón visual que `LeyendaRow` de `CriteriosDescripcionesForm`, pero como inputs controlados locales (no su propio action) que se serializan en un hidden input y se envían junto con el resto del form.
- **Nuevas server actions** en `src/app/(app)/eventos/[id]/postas/actions.ts`:
  - `crearPostaComoJuezAction`: Zod-valida y llama a `crearPostaYAsignar`.
  - `asignarPostaExistenteComoJuezAction`: Zod-valida y llama a `asignarPosta` con `juezUserId = actorUserId`.
  - Ambas devuelven `{ error }` para `BusinessError` y usan `requireRole(["JUEZ","ADMIN"])` para resolver `organizationId`/`actorUserId`.
- **`src/components/auth/AppHeader.tsx`**: sin cambios estructurales — el link ya existente "Eventos" (visible a todo `user`) es la puerta de entrada; no se agrega un link nuevo dedicado (la sección de planificación aparece dentro de `/eventos` solo para los roles que corresponde).
- **`src/components/juez/views/EventosListView.tsx`**: usa `useOnlineStatus()`; el link "Ver eventos publicados" queda deshabilitado (texto gris, sin navegación) cuando `!isOnline`, con un texto corto indicando que requiere conexión. Ver restricción explícita más abajo — es el único cambio permitido dentro del árbol `/juez/**`.
- **Copy `es.json`**: nuevas claves bajo `eventos.*` (sección "Eventos en planificación", botón "Cargar mi posta", mensajes de error nuevos) y bajo `juez.eventos.*` (aviso de "requiere conexión" en el link deshabilitado).
- **Audit log**: `crearPostaYAsignar` registra `posta.created` y `asignacionPosta.created` (mismas actions ya existentes) con `metadata.origen: "juez"` agregado, para distinguir de las creaciones desde `/admin/postas`.
- **Tests**: `posta.repo.test.ts` (nuevos casos: `crearPostaYAsignar` atómico, `POSTA_NO_PROPIA` al editar/borrar posta ajena siendo JUEZ, condición de carrera de asignación con P2002). `evento.repo.test.ts` sin cambios (no se tocan sus funciones).
- **Documentación**: `docs/adr/0004-modo-offline-pwa-spa.md` recibe una nota de alcance ("este flujo de planificación vive fuera del SPA offline, ver Plan 16"); `/docs/juez` menciona el nuevo flujo de auto-carga de postas.

### No incluye

- Vista de "postas pendientes de revisión" para admins — el badge "Sin leyenda de puntajes" (`AsignacionRow`, Plan 15) ya cubre parcialmente la necesidad de aviso; una vista dedicada queda para un plan futuro si se pide explícitamente.
- Tocar el template/criterios/escala desde el flujo del juez — sigue siendo exclusivo de `Actividad` (Plan 15).
- Editar/eliminar postas de otros jueces (ownership estricta, sin mecanismo de "transferir" o "compartir edición").

### Restricción explícita: el SPA offline del juez no se toca

El árbol `/juez/**` (catch-all `[[...slug]]`, `JuezRouterProvider`/`JuezLink`, las vistas en `src/components/juez/views/`, el sync engine, IndexedDB, el service worker) queda **completamente intacto y funcional**. El único cambio dentro de esa superficie es el enlace de salida ya existente en `EventosListView.tsx` ("Ver eventos publicados" → `/eventos`): se le agrega el chequeo de `useOnlineStatus()` para deshabilitarlo sin conexión, sin modificar su destino ni el resto del componente. No hay refactors, no hay cambios de comportamiento de scoring, no hay nuevas vistas ni rutas dentro de `/juez/**` — toda la funcionalidad nueva (listar eventos en planificación, crear posta, asignar) vive exclusivamente en `/eventos/**`, fuera del SPA.

---

## Modelo de datos

```prisma
model Posta {
  id                     String   @id @default(cuid(2))
  organizationId         String
  nombre                 String
  descripcion            String?
  duracionMinutos        Int?
  materiales             Json     @default("[]")
  criteriosDescripciones Json     @default("{}")
+ creadoPorUserId        String?
  createdAt              DateTime @default(now())
  updatedAt              DateTime @updatedAt

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
+ creadoPorUser User?            @relation("PostaCreador", fields: [creadoPorUserId], references: [id], onDelete: SetNull)
  asignaciones AsignacionPosta[]

  @@unique([organizationId, nombre])
  @@index([organizationId])
+ @@index([creadoPorUserId])
}
```

Migración simple: columna nullable + FK `SetNull`, sin backfill necesario (postas existentes quedan `creadoPorUserId = null`, tratadas como "creada por admin", que es semánticamente correcto — no hay forma de saber retroactivamente quién las cargó, y no importa: solo importa para postas nuevas creadas por jueces).

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | Extender `/eventos` en vez de una ruta nueva fuera de `/juez/**` | Ruta dedicada `/planificacion` | Confirmado con el usuario: menos superficie nueva, `/eventos` ya es el punto de entrada "hacia afuera" del SPA offline. |
| 2 | `crearPostaYAsignar` es una transacción atómica nueva, no una composición de `createPosta` + `asignarPosta` | Llamar ambas funciones en secuencia desde la action | Cada una abre su propio `$transaction` y hace su propio `revalidateTag`; componerlas deja una ventana donde la posta existe sin asignación si el segundo paso falla (ej. conflicto de unicidad), y dispara doble invalidación de cache. Una función atómica nueva evita el estado intermedio. |
| 3 | Ownership vía `Posta.creadoPorUserId`, chequeado solo cuando `actorRole === "JUEZ"` | Campo en `AsignacionPosta` en vez de `Posta` | El campo pertenece a la entidad que se está protegiendo (la posta), no al join. Un juez podría en teoría quedar sin ninguna `AsignacionPosta` propia si el admin reasigna — el ownership de edición debe sobrevivir a eso. |
| 4 | Autocomplete cliente-side sin red adicional, sobre la lista de postas ya cargada en la página | Endpoint/action de búsqueda con debounce server-side | Confirmado con el usuario. El volumen de postas por distrito es bajo (biblioteca reusable, no miles de filas); no justifica una ruta de búsqueda nueva. |
| 5 | Leyenda inline en el mismo formulario/transacción de creación, con inputs locales (no el componente `CriteriosDescripcionesForm` completo) | Reusar `CriteriosDescripcionesForm` tal cual, llamado post-creación | Confirmado con el usuario que sea inline. Técnicamente no se puede reusar el componente completo porque asume `postaId` ya persistido y dispara su propia action por fila — acá tiene que ser un único submit atómico. Se reusa el patrón visual, no el componente. |
| 6 | `useOnlineStatus()` nuevo hook reactivo, aplicado también al gap existente en `EventosListView` | Dejar el link tal cual y solo aplicar el patrón a los enlaces nuevos | La decisión de producto del preplan (enlaces SPA→online deshabilitados sin conexión) ya incluye explícitamente el link existente como parte del alcance — no es un fix "de yapa". |
| 7 | `asignarPosta` agrega manejo de `P2002` como red de seguridad además del pre-check existente | Confiar solo en el pre-check (`findFirst` antes del `create`) | El pre-check tiene una condición de carrera real entre el `findFirst` y el `create` bajo dos requests concurrentes (dos jueces asignándose casi al mismo tiempo) — el `@@unique([postaId, actividadId])` ya existe en schema, solo falta capturarlo con un mensaje de negocio en vez de un 500. |
| 8 | El SPA offline (`/juez/**`) no se toca salvo el gate online del link de salida en `EventosListView` | Aprovechar el plan para revisar/refactorizar otras partes del SPA | Restricción explícita del usuario: el SPA debe permanecer completamente funcional; cualquier cambio ahí es un riesgo innecesario fuera del alcance de esta feature. |

---

## Estructura de rutas

### Nuevas rutas

```
src/app/(app)/eventos/[id]/postas/
├── page.tsx     ← planificación del juez: actividades del evento (BORRADOR) + asignaciones actuales
│                  + "Cargar mi posta" por actividad. requireRole(["JUEZ","ADMIN"]),
│                  notFound() si el evento no está en BORRADOR
└── actions.ts   ← crearPostaComoJuezAction, asignarPostaExistenteComoJuezAction
```

### Rutas modificadas

```
src/app/(app)/eventos/
└── page.tsx     ← agrega sección "Eventos en planificación" (lista BORRADOR) visible solo para
                   JUEZ/ADMIN, además de la sección PUBLICADO existente (sin tocarla)
```

### Server actions nuevas en `eventos/[id]/postas/actions.ts`

```ts
crearPostaComoJuezAction(actividadId, data: {
  nombre, descripcion?, duracionMinutos?, materiales?, encargado?, ayudantes?, criteriosDescripciones?
})
asignarPostaExistenteComoJuezAction(actividadId, data: { postaId })
```

Ambas resuelven `organizationId`/`actorUserId` vía `requireRole(["JUEZ","ADMIN"])`, Zod-validan el input y devuelven `{ error }` para `BusinessError` / `{ success: true }` en éxito (convención #20). **No hay rutas nuevas dentro de `/juez/**`** — el único cambio en ese árbol es el gate online del link de salida en `EventosListView.tsx` (ver Restricción explícita).

---

## Implementación (pasos)

### Paso 1 — Schema y migración

Archivos:
- `prisma/schema.prisma` — `Posta.creadoPorUserId String?`, relación `PostaCreador` (`onDelete: SetNull`) + su inversa en `User`, `@@index([creadoPorUserId])`.

Comandos: `pnpm prisma migrate dev --name posta_creado_por`, `pnpm prisma generate`.

Verificación: la migración aplica limpia (columna nullable, sin backfill — postas existentes quedan `null`); `psql` confirma la FK `SetNull`.

Commit: `feat(schema): registrar creadoPorUserId en Posta`

---

### Paso 2 — `posta.repo.ts` + error de negocio

Archivos:
- `src/repositories/posta.repo.ts`:
  - `crearPostaYAsignar(organizationId, actividadId, data, actorUserId)` — transacción única: `Posta` (con `creadoPorUserId`) + `AsignacionPosta` (`juezUserId = actorUserId`) + `criteriosDescripciones` inicial si viene. Reusa `isEventoLocked`, el pre-check de posta no ya asignada, y P2002 sobre `nombre` → `NOMBRE_POSTA_DUPLICADO`. Audit `posta.created` + `asignacionPosta.created` con `metadata.origen: "juez"`. `revalidateTag(postas)` + `revalidateTag(eventos)`.
  - `updatePosta` / `deletePosta` — nuevo param `actorRole: Role`; si el rol efectivo es `JUEZ` y `posta.creadoPorUserId !== actorUserId` → `BusinessError("POSTA_NO_PROPIA")`. Los call sites de `/admin/postas` (siempre `ADMIN`) no cambian de comportamiento.
  - `asignarPosta` — agrega `.catch(P2002)` sobre el `create` de `AsignacionPosta` → `BusinessError("POSTA_YA_ASIGNADA_EN_EVENTO")` (cierra la carrera entre pre-check y `create`).
  - `listPostasDisponiblesParaJuez(organizationId)` — mismo shape que ya usa `AsignacionPostaDialog` (`id`, `nombre`, `duracionMinutos`, `asignadaEnActividad`), cache tag `postas:orgId`.
- `src/lib/errors.ts` — documentar `POSTA_NO_PROPIA` en el listado de códigos.

Commit: `feat(repo): crearPostaYAsignar atómico, ownership por juez y P2002 en asignación`

---

### Paso 3 — Hook de estado online + gate del link del SPA

Archivos:
- `src/lib/offline/use-online-status.ts` — `useOnlineStatus()` reactivo (estado inicial `navigator.onLine`, suscripción a `online`/`offline`), mismo patrón de listeners que `sync-engine.ts`.
- `src/components/juez/views/EventosListView.tsx` — consume el hook; el link "Ver eventos publicados" queda deshabilitado (gris, sin navegación) y muestra "requiere conexión" cuando `!isOnline`. **Único cambio dentro de `/juez/**`.**

Verificación: en modo avión el link no navega; el resto del SPA queda intacto.

Commit: `feat(offline): hook useOnlineStatus y gate online del link de salida del SPA`

---

### Paso 4 — `/eventos`: sección de planificación

Archivos:
- `src/app/(app)/eventos/page.tsx` — para roles `JUEZ`/`ADMIN`, sección "Eventos en planificación" con `listEventos(orgId, { estados: ["BORRADOR"] })`, cada evento linkeando a `/eventos/[id]/postas`. La sección `PUBLICADO` existente no se toca.

Commit: `feat(eventos): seccion de eventos en planificacion para jueces`

---

### Paso 5 — Página de planificación, dialog y server actions

Archivos:
- `src/app/(app)/eventos/[id]/postas/page.tsx` — `requireRole(["JUEZ","ADMIN"])`, `findEventoById` + gate `estado === "BORRADOR"` (`notFound()` si no, mismo patrón que `resultados/page.tsx`). Lista actividades (nombre, tipo, template resuelto) con sus asignaciones actuales (posta + juez, solo lectura si no es la propia); monta `CrearPostaDialog` por actividad y pasa `listPostasDisponiblesParaJuez` como prop para el autocomplete.
- `src/components/juez/postas/CrearPostaDialog.tsx` — Client Component: nombre con autocomplete client-side (debounce, filtra sobre `postasDisponibles`) → "usar esta posta" (modo asignar-existente) o crear nueva; campos descriptivos (descripción, duración, materiales, encargado, ayudantes); leyenda inline por criterio del template (inputs controlados serializados en un hidden input → un único submit atómico). Reusa el patrón visual de `LeyendaRow`/`AsignacionPostaDialog`; `<dialog>` con `m-auto` (convención #21) y dispatch dentro de `startTransition` (convención #22).
- `src/app/(app)/eventos/[id]/postas/actions.ts` — `crearPostaComoJuezAction` (→ `crearPostaYAsignar`) y `asignarPostaExistenteComoJuezAction` (→ `asignarPosta` con `juezUserId = actorUserId`). Zod en el borde, `{ error }` para `BusinessError`, `{ success: true }` en éxito.
- `src/messages/es.json` — claves nuevas:

```json
{
  "eventos": {
    "planificacion": {
      "title": "Eventos en planificación",
      "empty": "No hay eventos en planificación.",
      "cargarPosta": "Cargar mi posta"
    },
    "errors": {
      "postaNoPropia": "Solo podés editar las postas que vos cargaste",
      "postaYaAsignada": "Esa posta ya está asignada en este evento"
    }
  },
  "juez": {
    "eventos": { "verPublicadosOffline": "Requiere conexión" }
  }
}
```

Commit: `feat(eventos): carga de postas por el juez con leyenda inline y deteccion de duplicados`

---

### Paso 6 — Tests

Archivos:
- `src/repositories/posta.repo.test.ts` — casos nuevos:
  - `crearPostaYAsignar` crea posta + asignación + leyenda atómicamente; si el segundo paso falla no queda una posta huérfana sin asignar.
  - `updatePosta` / `deletePosta` con `actorRole: "JUEZ"` sobre una posta ajena → `POSTA_NO_PROPIA`; con `"ADMIN"` → ok sobre cualquiera.
  - `asignarPosta` con P2002 simulado → `POSTA_YA_ASIGNADA_EN_EVENTO` (no un throw genérico).

Commit: `test(repo): crearPostaYAsignar, ownership por juez y carrera de asignacion`

---

### Paso 7 — Documentación

Archivos:
- `docs/adr/0004-modo-offline-pwa-spa.md` — nota de alcance ("la planificación de postas del juez vive fuera del SPA offline, ver Plan 16").
- `src/app/(docs)/docs/juez/page.tsx` — mención del nuevo flujo de auto-carga de postas.
- `CLAUDE.md` — estado de Plan 16 "redactado" → "completado" con resumen + lecciones aprendidas.

Commit: `docs(plan): Plan 16 ejecutado — postas creadas por jueces`

---

## Archivos creados / modificados

| Archivo | Acción | Función |
|---|---|---|
| `prisma/schema.prisma` | modificar | `Posta.creadoPorUserId` + relación `PostaCreador` + `@@index` |
| `prisma/migrations/.../migration.sql` | crear | Migración `posta_creado_por` (columna nullable, FK `SetNull`) |
| `src/repositories/posta.repo.ts` | modificar | `crearPostaYAsignar`, ownership en update/delete, P2002 en `asignarPosta`, `listPostasDisponiblesParaJuez` |
| `src/repositories/posta.repo.test.ts` | modificar | Casos nuevos: atomicidad, ownership, carrera de asignación |
| `src/lib/errors.ts` | modificar | Documentar `POSTA_NO_PROPIA` |
| `src/lib/offline/use-online-status.ts` | crear | Hook `useOnlineStatus()` reactivo |
| `src/components/juez/views/EventosListView.tsx` | modificar | Gate online del link de salida (único cambio en `/juez/**`) |
| `src/app/(app)/eventos/page.tsx` | modificar | Sección "Eventos en planificación" para `JUEZ`/`ADMIN` |
| `src/app/(app)/eventos/[id]/postas/page.tsx` | crear | Página de planificación del juez |
| `src/app/(app)/eventos/[id]/postas/actions.ts` | crear | `crearPostaComoJuezAction`, `asignarPostaExistenteComoJuezAction` |
| `src/components/juez/postas/CrearPostaDialog.tsx` | crear | Dialog de carga con autocomplete + leyenda inline |
| `src/messages/es.json` | modificar | Claves `eventos.planificacion.*`, `eventos.errors.*`, `juez.eventos.*` |
| `docs/adr/0004-modo-offline-pwa-spa.md` | modificar | Nota de alcance del flujo fuera del SPA |
| `src/app/(docs)/docs/juez/page.tsx` | modificar | Mención del flujo de auto-carga de postas |
| `CLAUDE.md` | modificar | Estado Plan 16 → completado |

---

## Verificación

### Verificación automática

```bash
pnpm typecheck              # 0 errores
pnpm lint                   # 0 errores
pnpm test                   # tests del repo en verde (incluye los 3 casos nuevos)
pnpm prisma migrate status  # migración posta_creado_por aplicada
pnpm build                  # build exitoso
```

### Verificación manual end-to-end

1. Un `JUEZ` sin ninguna asignación previa entra a `/eventos`, ve la sección "Eventos en planificación" con un evento `BORRADOR`, entra a `/eventos/[id]/postas` y ve todas las actividades (incluidas las que no son suyas).
2. Crea una posta nueva en una actividad `PUNTAJE_UNICO`: completa nombre/descripción/materiales + leyenda de los 3 valores de la escala. Al guardar: la posta queda creada, auto-asignada a él (`juezUserId` = su propio user), y la leyenda visible de inmediato en `/admin/postas/[id]` (vista admin) y en `ScoreSheetForm` cuando el evento pase a `ACTIVO`.
3. Escribe un nombre de posta que ya existe en la org: el autocomplete lo sugiere; elige "usar esta posta" y queda asignado a la actividad actual sin crear un duplicado.
4. Dos pestañas con dos jueces distintos intentan asignar la misma posta a la misma actividad casi simultáneamente: el segundo recibe `POSTA_YA_ASIGNADA_EN_EVENTO`, no un error 500.
5. El juez A intenta editar una posta creada por el juez B: recibe `POSTA_NO_PROPIA`. Un `ADMIN` sí puede editar cualquiera.
6. Con el navegador en modo avión, dentro del SPA `/juez/eventos`, el link "Ver eventos publicados" aparece deshabilitado (no navega, se ve gris) — y el resto del SPA (listado de eventos activos, scoring, sync) sigue funcionando exactamente igual que antes.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Agregar el param `actorRole` a `updatePosta`/`deletePosta` rompe el tipado en los call sites de `/admin/postas` | Alta | TypeScript lo detecta en compile time. Actualizar los dos call sites admin pasando `actorRole: "ADMIN"` (rol ya resuelto por `requireRole(["ADMIN"])`). Sin cambio de comportamiento. |
| `crearPostaYAsignar` como transacción nueva duplica lógica ya presente en `createPosta`/`asignarPosta` (validaciones, P2002, audit) | Media | Factorizar los helpers compartidos (validación de nombre, construcción del audit) y reusarlos desde las tres funciones en vez de copiar el cuerpo. Revisar en ejecución que no queden dos rutas de validación divergentes. |
| El `<dialog>` con autocomplete + campos descriptivos + leyenda por criterio resulta demasiado cargado en mobile | Media | Es el mismo riesgo que `AsignacionPostaDialog` (Plan 6c) ya resolvió visualmente; reusar ese layout. Si sigue cargado, colapsar la sección de leyenda tras un "Agregar leyenda (opcional)". Decidir en ejecución según el resultado visual. |
| El gate `useOnlineStatus()` en `EventosListView` introduce un cambio dentro de `/juez/**`, superficie que el plan promete no tocar | Baja | El cambio se limita al link de salida ya existente (no altera destino, scoring ni sync). Verificación #6 confirma que el resto del SPA sigue igual en modo avión. |
| La carrera entre dos jueces asignándose la misma posta no queda cubierta si el `@@unique([postaId, actividadId])` no existe en el schema actual | Baja | Confirmar en ejecución que el constraint ya está (Plan 6c lo declara). Si faltara, agregarlo en la misma migración antes de apoyarse en el `.catch(P2002)`. |
| `listPostasDisponiblesParaJuez` trae toda la biblioteca de la org y el autocomplete se vuelve lento | Muy baja | Volumen bajo por distrito (decisión técnica #4). Si crece, mover a búsqueda server-side con debounce — fuera del alcance de este plan. |

---

## Commits sugeridos

| # | Mensaje |
|---|---|
| 1 | `feat(schema): registrar creadoPorUserId en Posta` |
| 2 | `feat(repo): crearPostaYAsignar atómico, ownership por juez y P2002 en asignación` |
| 3 | `feat(offline): hook useOnlineStatus y gate online del link de salida del SPA` |
| 4 | `feat(eventos): seccion de eventos en planificacion para jueces` |
| 5 | `feat(eventos): carga de postas por el juez con leyenda inline y deteccion de duplicados` |
| 6 | `test(repo): crearPostaYAsignar, ownership por juez y carrera de asignacion` |
| 7 | `docs(plan): Plan 16 ejecutado — postas creadas por jueces` |

---

## Referencias

- `docs/plans/16-postas-por-juez-preplan.md` — preplan original, decisiones de producto confirmadas previamente.
- `docs/plans/15-template-por-actividad.md` — prerrequisito ejecutado (`Actividad.templateId`, `Posta.criteriosDescripciones`, `CriteriosDescripcionesForm`).
- `docs/plans/06c-postas-biblioteca.md` — modelo `Posta`/`AsignacionPosta` que este plan extiende.
- `docs/adr/0004-modo-offline-pwa-spa.md` — reglas permanentes del SPA offline; recibe nota de alcance en este plan.
