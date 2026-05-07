# Plan 6c — Postas como entidad de biblioteca reutilizable

> Estado: pendiente de ejecución. Redactado con Claude Sonnet 4.6 en conversación con el usuario, siguiendo el workflow de planeación establecido en CLAUDE.md.

---

## Contexto

Plan 6b entregó `Posta` como entidad subordinada de `Actividad`: cada posta nace dentro de una actividad, muere con ella y no puede reutilizarse. Esto choca con la realidad operativa del escultismo: las postas son **fichas de prueba** que los dirigentes preparan a lo largo del tiempo, las afinan entre eventos y las reutilizan con ajustes menores.

Plan 6c transforma `Posta` en una **entidad de biblioteca del distrito**: se crea una sola vez en `/admin/postas`, se almacena con todos sus datos propios (descripción, materiales, duración estimada, plantilla fija), y se *asigna* a actividades concretas cuando se arma un evento. Cada asignación puede tener sus propios datos de contexto (juez, encargado, ayudantes) sin alterar la posta original.

**Efecto en Plan 6b:** el modelo `Posta` que Plan 6b introdujo se refactoriza completamente. Las relaciones `Actividad → Posta` y `User.postasJuez` cambian. No hay datos reales en producción (solo seed), así que la migración puede ser destructiva.

---

## Alcance

### Incluye

- **Migración Prisma destructiva**: eliminar el modelo `Posta` actual y reemplazarlo con la nueva `Posta` standalone + tabla `AsignacionPosta` (join table). Reset del seed.
- **Modelo `Posta` standalone** con scope de organización: `organizationId`, `nombre`, `descripcion`, `duracionMinutos`, `templateId` (plantilla fija), `materiales` (JSON array de ítems). Sin `actividadId`, `juezUserId`, `weight` ni `orden`.
- **Modelo `AsignacionPosta`** (join table `Posta ↔ Actividad`) con datos por uso: `juezUserId`, `encargado`, `ayudantes`, `weight`, `orden`. Constraint único `@@unique([postaId, actividadId])` + validación de aplicación que impide que la misma posta aparezca en dos actividades del mismo evento.
- **CRUD dedicado `/admin/postas`**: lista, creación, edición, detalle con historial de eventos. Nueva entrada en el sidebar.
- **`/admin/postas/[id]`** — página de detalle con historial de asignaciones (en qué eventos fue usada, en qué actividad, con qué juez y encargado).
- **Rediseño de postas en `/admin/eventos/[id]`**: reemplazar la vista inline apretada por un **dialog/modal** de asignación. Cada actividad muestra sus postas asignadas con los datos de contexto; un botón "Asignar posta" abre el dialog.
- **Validación de unicidad por evento**: al asignar una posta a una actividad, verificar en la capa de repositorio que esa posta no esté ya asignada a otra actividad del mismo evento. `BusinessError("POSTA_YA_ASIGNADA_EN_EVENTO")`.
- **Actualización de gates de pre-activación** en `canTransitionToActivo`: los checks de "actividad sin postas" y "posta sin plantilla" consultan a través de `AsignacionPosta` en vez de `Posta` directamente.
- **Protección de `Posta` en uso**: no se puede eliminar una posta que tiene asignaciones activas. `BusinessError("POSTA_EN_USO", { eventos: [...] })` con lista de los eventos afectados.
- **Copy en `es.json`** para los namespaces nuevos: `admin.postas.*`.
- **Seed actualizado**: crear postas standalone en el fixture de datos demo, luego asignarlas a actividades.

### NO incluye

- **Drag-and-drop** para reordenar asignaciones dentro de una actividad — botones ↑/↓ (mismo patrón que Plans 5, 6a, 6b).
- **Importar/duplicar postas** entre organizaciones.
- **`ScoreSheet`** y scoring real — Plan 7a.
- **Vista del juez** — Plan 7a.
- **Tests Vitest** — Plan 7a integra el nuevo shape del repositorio con sus tests. Plan 6c aplica el mismo esqueleto de tests de Plan 6b al nuevo modelo (si el tiempo lo permite, sino se difiere).
- **Objetivos educativos, criterios de evaluación propios, observaciones extra** — campos futuros que el usuario planea agregar a la ficha de posta. El schema se diseña para recibirlos sin breaking changes (campos adicionales en `Posta`).

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **`AsignacionPosta` como join table** con datos por uso (`juezUserId`, `encargado`, `ayudantes`, `weight`, `orden`). | Posta con `actividadId` directo (estado Plan 6b). | Permite reuso entre eventos. Los datos que cambian por uso (juez, encargado, peso) viven en la asignación; los datos estables (materiales, descripción, duración) viven en la posta. |
| 2 | **`Posta.templateId` fija en la posta** (no en la asignación). Juez por uso, plantilla por posta. | Plantilla también por uso. | El usuario eligió "Mixto: plantilla fija, juez por uso". La plantilla define cómo se evalúa la posta — eso no cambia entre eventos. El juez cambia por ausencias, rotaciones, etc. |
| 3 | **`encargado: String?` y `ayudantes: String?`** en `AsignacionPosta`, texto libre. | FK a `MiembroScout` o `User`. | El usuario lo eligió explícitamente. El encargado/ayudante puede ser cualquier persona, no necesariamente con cuenta en el sistema. Simplidad MVP. |
| 4 | **`Posta.materiales: Json @default("[]")`** con shape `{ nombre: string; cantidad?: string }[]`. | Tabla `Material(postaId, nombre, cantidad)` separada. | Los materiales son datos propios de la posta, no necesitan queries independientes. JSON es más simple y suficiente para el MVP. |
| 5 | **`@@unique([postaId, actividadId])`** en `AsignacionPosta` previene duplicar la misma posta en la misma actividad. Validación adicional en la repo layer previene que la posta esté en dos actividades del mismo evento. | Solo constraint de DB. | El constraint de DB cubre el caso trivial. La regla de negocio (unicidad por evento, no solo por actividad) requiere validación de aplicación. |
| 6 | **`onDelete: Restrict` en `AsignacionPosta.postaId`**. App-level check antes de eliminar: listar eventos afectados y devolver `BusinessError("POSTA_EN_USO")`. | Cascade (eliminar la posta borra sus asignaciones silenciosamente). | Una posta en uso por un evento activo es un dato crítico. El admin debe desasignarla explícitamente antes de borrarla. |
| 7 | **`onDelete: Cascade` en `AsignacionPosta.actividadId`**. Eliminar una actividad cascadea y borra sus asignaciones. | Restrict. | Coherente con el comportamiento de Plan 6b: eliminar una actividad en BORRADOR elimina sus postas. El admin entiende que borrar una actividad limpia su contenido. |
| 8 | **Dialog/modal nativo `<dialog>`** para asignar postas en la vista del evento. | Inline form apretado (Plan 6b). | El usuario pidió explícitamente un popup porque la vista inline era demasiado apretada. La asignación incluye varios campos (posta, juez, encargado, ayudantes, weight); un dialog da espacio. |
| 9 | **El selector en el dialog muestra todas las postas del distrito**, con badge "Ya asignada en [Actividad X]" para las que ya están en el evento, y las deshabilita. | Ocultar las ya asignadas. | El admin puede ver qué postas están ocupadas sin confundirse. Claridad antes que filtrado oculto. |
| 10 | **Historial de uso en `/admin/postas/[id]`**: lista de asignaciones con evento nombre + fecha, actividad nombre, juez, encargado. | Solo badge con count en el listado. | El usuario eligió esta opción. Útil para auditoría y planning de futuros eventos. |
| 11 | **`@@unique([organizationId, nombre])`** en `Posta`. App retorna `BusinessError("NOMBRE_POSTA_DUPLICADO")`. | Sin constraint único. | El selector de postas en el dialog mostraría duplicados confusos. Postas con el mismo nombre son reutilizaciones del mismo concepto — usar la misma posta, no crear dos. |
| 12 | **Migración destructiva** (DROP + CREATE). Sin migración de datos. | Migración SQL manual de los datos existentes. | Solo hay datos demo en seed. Más simple y más limpio. |
| 13 | **Cache tag `postas:orgId`** separado de `eventos:orgId`. `revalidateTag` en mutaciones CRUD de postas usa `postas:orgId`; mutaciones de asignaciones usan ambos tags. | Tag único compartido. | `Posta` ya no es subordinada del aggregate `Evento`. La lista `/admin/postas` lee con tag `postas:orgId`. El detalle del evento lee asignaciones con tag `eventos:orgId`. Al mutar una asignación, invalidar ambos. |
| 14 | **`weight` en `AsignacionPosta`**, no en `Posta`. | Weight en la posta (Plan 6b). | El mismo peso puede variar por evento según las reglas del organizador. Coherente con el espíritu del modelo reutilizable. |
| 15 | **Ruta `/admin/postas/nueva`** para crear postas y **`/admin/postas/[id]`** para editar/ver historial. Sin modal en el listado. | Modal inline en la lista. | Las postas tienen varios campos (materiales dinámicos, duración, descripción) que necesitan espacio. Una página dedicada es más cómoda que un modal apretado. |

---

## Modelo de datos

### Schema Prisma — cambios

```prisma
// ──────────────────────────────────────────────────────────────
// Posta — entidad de biblioteca del distrito (standalone)
// ──────────────────────────────────────────────────────────────

model Posta {
  id              String   @id @default(cuid(2))
  organizationId  String
  nombre          String
  descripcion     String?
  duracionMinutos Int?
  templateId      String?              // plantilla fija; gate al activar exige non-null por asignación
  materiales      Json     @default("[]")   // [{ nombre: string; cantidad?: string }]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  template     ScoreTemplate?  @relation(fields: [templateId], references: [id], onDelete: Restrict)
  asignaciones AsignacionPosta[]

  @@unique([organizationId, nombre])
  @@index([organizationId])
  @@index([templateId])
}

// ──────────────────────────────────────────────────────────────
// AsignacionPosta — posta asignada a una actividad con datos por uso
// ──────────────────────────────────────────────────────────────

model AsignacionPosta {
  id          String   @id @default(cuid(2))
  postaId     String
  actividadId String
  juezUserId  String?
  encargado   String?
  ayudantes   String?
  weight      Decimal  @db.Decimal(6, 2) @default(1.0)
  orden       Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  posta     Posta     @relation(fields: [postaId], references: [id], onDelete: Restrict)
  actividad Actividad @relation(fields: [actividadId], references: [id], onDelete: Cascade)
  juezUser  User?     @relation("AsignacionPostaJuez", fields: [juezUserId], references: [id], onDelete: SetNull)

  @@unique([actividadId, orden])
  @@unique([postaId, actividadId])
  @@index([postaId])
  @@index([actividadId])
  @@index([juezUserId])
}
```

### Cambios en modelos existentes

```prisma
model Organization {
  // ...
  postas Posta[]               // NUEVA relación inversa
}

model Actividad {
  // Reemplaza: postas Posta[]
  asignaciones AsignacionPosta[]
}

model ScoreTemplate {
  // La relación postas Posta[] sigue igual; Posta.templateId no cambia de posición
  postas Posta[]
}

model User {
  // Reemplaza: postasJuez Posta[] @relation("PostaJuez")
  asignacionesJuez AsignacionPosta[] @relation("AsignacionPostaJuez")
}
```

### Shape del material en JSON

```ts
type Material = {
  nombre: string
  cantidad?: string  // ej: "10 metros", "2 unidades", "1 rollo"
}
```

### Qué NO cambia

- `Patrulla`, `PatrullaCategoria`, `Evento`, `GrupoScout`: sin cambios.
- `isTemplateLocked`: actualmente consulta `prisma.posta.count({ where: { templateId } })`. En el nuevo schema, `Posta.templateId` sigue existiendo, así que esta función **no necesita cambios**.
- `ScoreTemplate`, `TemplateCriterion`: sin cambios.
- Gates de pre-activación en `canTransitionToActivo`: se actualizan para consultar `AsignacionPosta` en vez de `Posta` directamente (ver Paso 5).

### Migración

Estrategia: `pnpm prisma migrate reset` (elimina datos demo) + `pnpm prisma migrate dev --name refactor_posta_biblioteca_reutilizable`. Prisma genera un SQL que:
1. `DROP TABLE "Posta"` (con cascade para limpiar FK en `User.postasJuez`).
2. `CREATE TABLE "Posta"` (nueva estructura standalone).
3. `CREATE TABLE "AsignacionPosta"`.
4. Actualiza las relaciones inversas (no requieren SQL en tablas existentes — son solo metadata de Prisma).

El seed debe actualizarse: primero crear postas en `Organization`, luego crear asignaciones en actividades.

---

## Estructura de rutas

### Nuevas rutas

```
src/app/(app)/admin/postas/
├── page.tsx              ← listado de postas del distrito
├── actions.ts            ← createPostaAction
└── [id]/
    ├── page.tsx           ← detalle: edición inline + historial de eventos
    └── actions.ts         ← updatePostaAction, deletePostaAction

src/app/(app)/admin/postas/nueva/
└── page.tsx              ← formulario de creación
```

### Rutas modificadas

```
src/app/(app)/admin/eventos/[id]/
├── page.tsx              ← extendido: asignaciones con dialog
└── actions.ts            ← server actions de AsignacionPosta (crear, editar, eliminar, reordenar)
```

### Server actions nuevas en `eventos/[id]/actions.ts`

```ts
asignarPostaAction(actividadId, data: { postaId, juezUserId?, encargado?, ayudantes?, weight })
updateAsignacionAction(asignacionId, data: { juezUserId?, encargado?, ayudantes?, weight })
desasignarPostaAction(asignacionId)
reorderAsignacionAction(asignacionId, direction: 'up' | 'down')
```

Las server actions del CRUD standalone de postas viven en `postas/actions.ts` y `postas/[id]/actions.ts`.

---

## Implementación

### Paso 1 — Schema y migración

Archivos:
- `prisma/schema.prisma` — reemplazar modelo `Posta` con nueva versión standalone + agregar `AsignacionPosta` + actualizar relaciones inversas en `Organization`, `Actividad`, `User`.
- `prisma/seed.ts` — actualizar seed: crear postas demo primero, luego asignaciones en actividades.

```bash
pnpm prisma migrate reset   # limpia DB + aplica todas las migraciones
pnpm prisma migrate dev --name refactor_posta_biblioteca_reutilizable
pnpm prisma generate
pnpm db:seed
```

Verificar:
- `\d "Posta"` en psql: tiene `organizationId`, `materiales json`, `duracionMinutos int4`, sin `actividadId`.
- `\d "AsignacionPosta"`: tiene FKs correctas, `encargado`, `ayudantes`, `weight numeric(6,2)`.
- Seed crea ≥2 postas standalone + ≥1 asignación por actividad del evento demo.

Commit: `feat(schema): posta standalone con biblioteca y AsignacionPosta por uso`

---

### Paso 2 — Errores de negocio

Archivo: `src/lib/errors.ts`.

Códigos nuevos:
- `POSTA_YA_ASIGNADA_EN_EVENTO` — la posta ya está asignada a otra actividad del mismo evento.
- `POSTA_EN_USO` — la posta tiene asignaciones activas; no se puede eliminar.
- `ASIGNACION_NO_ENCONTRADA` — `AsignacionPosta` no encontrada o no pertenece a la org.
- `NOMBRE_POSTA_DUPLICADO` — nombre ya existe en la org (catch de `P2002`).

Commit: incluido en el siguiente paso.

---

### Paso 3 — Reescribir `posta.repo.ts`

Archivo: `src/repositories/posta.repo.ts`.

#### Funciones — CRUD standalone de Posta

```ts
// Lecturas (cacheadas con tag postas:orgId)
listPostas(organizationId): Promise<PostaConTemplateSummary[]>
findPostaById(organizationId, postaId): Promise<PostaConDetalle | null>

// Para el selector en el dialog del evento (incluye info de si ya está en el evento)
listPostasParaEvento(organizationId, eventoId): Promise<PostaConEstadoEnEvento[]>
// PostaConEstadoEnEvento: Posta + { asignada: boolean; actividadNombre: string | null }

// Mutaciones
createPosta(organizationId, data, actorUserId): Promise<{ id: string }>
updatePosta(organizationId, postaId, data, actorUserId): Promise<Posta>
deletePosta(organizationId, postaId, actorUserId): Promise<void>
```

#### Funciones — AsignacionPosta

```ts
// Lecturas (cacheadas con tag eventos:orgId)
listAsignacionesByActividad(organizationId, actividadId): Promise<AsignacionConPosta[]>
findAsignacionById(organizationId, asignacionId): Promise<AsignacionConPosta | null>

// Mutaciones
asignarPosta(organizationId, actividadId, data, actorUserId): Promise<{ id: string }>
updateAsignacion(organizationId, asignacionId, data, actorUserId): Promise<AsignacionPosta>
desasignarPosta(organizationId, asignacionId, actorUserId): Promise<void>
reorderAsignacion(organizationId, asignacionId, direction, actorUserId): Promise<void>
```

#### Validación de unicidad por evento en `asignarPosta`

```ts
// Obtener eventoId de la actividad
const actividad = await prisma.actividad.findFirst({
  where: { id: actividadId, evento: { organizationId } },
  select: { eventoId: true },
})
if (!actividad) throw new BusinessError("NOT_FOUND")

// Verificar que la posta no está ya en otra actividad de este evento
const conflicto = await prisma.asignacionPosta.findFirst({
  where: {
    postaId,
    actividad: { eventoId: actividad.eventoId },
    NOT: { actividadId },  // permite reagregar en la misma actividad (update)
  },
})
if (conflicto) throw new BusinessError("POSTA_YA_ASIGNADA_EN_EVENTO")
```

#### Validación antes de eliminar posta

```ts
const asignaciones = await prisma.asignacionPosta.findMany({
  where: { postaId },
  include: { actividad: { include: { evento: { select: { nombre: true } } } } },
})
if (asignaciones.length > 0) {
  const eventos = [...new Set(asignaciones.map(a => a.actividad.evento.nombre))]
  throw new BusinessError("POSTA_EN_USO", { eventos })
}
```

#### Cache tags

- Funciones de `Posta` standalone: `revalidateTag(cacheTags.postas(organizationId))`.
- Funciones de `AsignacionPosta`: `revalidateTag(cacheTags.postas(organizationId))` + `revalidateTag(cacheTags.eventos(organizationId))`.

Agregar `postas: (orgId: string) => \`postas:${orgId}\`` en `src/repositories/cache-tags.ts`.

Commit: `feat(repo): posta standalone + AsignacionPosta con validación de unicidad por evento`

---

### Paso 4 — Actualizar `evento.repo.ts`: gates de pre-activación

Archivo: `src/repositories/evento.repo.ts`.

Modificar `canTransitionToActivo` para consultar `AsignacionPosta` en vez de `Posta`:

```ts
actividades: {
  include: {
    asignaciones: {
      include: {
        posta: { select: { id: true, nombre: true, templateId: true } },
      },
    },
  },
},
```

Y los checks:

```ts
// Gate: cada actividad ≥ 1 asignación
const actividadesSinPostas = evento.actividades.filter(a => a.asignaciones.length === 0)

// Gate: cada asignación tiene posta con plantilla
const asignacionesSinPlantilla = evento.actividades.flatMap(a =>
  a.asignaciones
    .filter(asig => asig.posta.templateId === null)
    .map(asig => ({ nombre: asig.posta.nombre, actividadNombre: a.nombre })),
)
```

Commit: `fix(repo): gates de pre-activación a través de AsignacionPosta`

---

### Paso 5 — CRUD `/admin/postas`

#### Listado `postas/page.tsx`

Server Component. Carga:
- `listPostas(organizationId)` — incluye `template.nombre`, count de `asignaciones` (agrupado por evento para el badge).

Columnas:
- Nombre
- Plantilla asignada (o badge "Sin plantilla" en gris)
- Duración (si definida)
- Badge "X eventos" con count de eventos donde fue usada
- Acciones: Ver/editar → `/admin/postas/[id]`

Botón principal: "Nueva posta" → `/admin/postas/nueva`.

#### Formulario de creación `postas/nueva/page.tsx`

Client Component con `useActionState`. Campos:
- `nombre` (text, obligatorio)
- `descripcion` (textarea, opcional)
- `duracionMinutos` (number, opcional)
- `templateId` (select de plantillas activas del distrito, opcional)
- `materiales` (lista dinámica de ítems: cada ítem tiene `nombre` + `cantidad?`; botones "+ Agregar material" y "×" por ítem)

Submit → `createPostaAction` → redirect a `/admin/postas/[id]` recién creada.

#### Detalle y edición `postas/[id]/page.tsx`

Server Component. Dos secciones:

**Sección superior — Datos de la posta** (editable inline, mismo patrón que Plan 4 lección #3):
- Los mismos campos que el formulario de creación.
- Botón "Guardar" visible solo cuando hay cambios (`isDirty`).
- Botón "Eliminar" (solo si no hay asignaciones activas; si las hay, botón deshabilitado con tooltip "En uso en X eventos").
- `updatePostaAction` retorna la posta actualizada; sincronizar estado desde `actionState`.

**Sección inferior — Historial de eventos**:
- Tabla con columnas: Evento (nombre + fecha), Actividad, Juez asignado, Encargado.
- Si nunca fue usada: mensaje "Esta posta aún no fue asignada a ningún evento".
- Data: `findPostaById` incluye `asignaciones.actividad.evento` + `asignaciones.juezUser.name`.
- Solo informativo; sin acciones.

#### Actions `postas/actions.ts` y `postas/[id]/actions.ts`

```ts
// postas/actions.ts
createPostaAction(formData)

// postas/[id]/actions.ts
updatePostaAction(postaId, formData)
deletePostaAction(postaId)  // retorna { error } si POSTA_EN_USO con lista de eventos
```

Validación Zod:
```ts
const postaSchema = z.object({
  nombre: z.string().min(2).max(100).trim(),
  descripcion: z.string().max(1000).optional(),
  duracionMinutos: z.coerce.number().int().min(1).max(480).optional().nullable(),
  templateId: z.string().optional().nullable(),
  materiales: z.array(z.object({
    nombre: z.string().min(1).max(100).trim(),
    cantidad: z.string().max(50).optional(),
  })).default([]),
})
```

Commit: `feat(admin): CRUD de postas standalone en /admin/postas`

---

### Paso 6 — Rediseñar postas en `/admin/eventos/[id]`

#### Componente `AsignacionPostaDialog.tsx`

Client Component. Dialog nativo `<dialog ref={dialogRef}>` con:
- `dialogRef.current.showModal()` para abrirlo.
- Fondo con `backdrop` de Tailwind.

Contenido del dialog:
1. **Select de posta**: lista `listPostasParaEvento(orgId, eventoId)`. Muestra todas las postas del distrito; las que ya están en el evento aparecen deshabilitadas con label "Ya asignada en [Actividad]".
2. **Previsualización de la posta seleccionada** (debajo del select, aparece al elegir): descripción, duración, plantilla, materiales.
3. **Campos de contexto por uso**:
   - Juez (select con `listJuecesAsignables`)
   - Encargado (text input, opcional)
   - Ayudantes (text area, opcional)
   - Peso / weight (number, default 1.0)
4. Botones: "Asignar" (submit) + "Cancelar" (cierra dialog).

El dialog se usa tanto para crear una nueva asignación como para editar una existente (pre-carga los valores si recibe `asignacion` como prop).

#### Componente `AsignacionPostaRow.tsx`

Fila de una asignación dentro de una actividad. Muestra:
- Nombre de la posta (bold)
- Plantilla asignada (o badge "Sin plantilla")
- Juez (o "Sin asignar")
- Encargado
- Botones: ↑/↓ (reordenar), ✏️ (abre dialog en modo edición), 🗑 (desasignar, con confirmación)

El botón "desasignar" elimina la `AsignacionPosta`, NO la posta del distrito.

#### Componente `ActividadRow.tsx` (modificado)

- Reemplaza el render inline apretado de `PostaRow` + `AddPostaForm`.
- Agrega `<AsignacionPostaRow>` por cada asignación de la actividad.
- Agrega botón "Asignar posta →" que abre `AsignacionPostaDialog`.

#### Componente `EventoEstadoControls.tsx` (sin cambios funcionales)

Los gates client-side siguen leyendo desde el aggregate del evento. El shape cambia: `actividades[n].asignaciones` en vez de `actividades[n].postas`. Actualizar el prop type y la lógica de disable.

#### Carga de datos en `page.tsx` del evento

Agregar en paralelo al fetch existente:
- `listPostasParaEvento(orgId, eventoId)` — para pasar al dialog (lista de postas disponibles con estado).
- El aggregate `findEventoCompleto` extiende el include de `Actividad` para incluir `asignaciones.posta` + `asignaciones.juezUser`.

Commit: `feat(admin): asignación de postas a actividades mediante dialog en /admin/eventos/[id]`

---

### Paso 7 — Sidebar y navegación

Archivo: el componente de sidebar admin (identificar en ejecución — probablemente `src/components/admin/Sidebar.tsx` o similar).

Agregar entrada "Postas" entre "Plantillas" y "Eventos" (o en el orden que resulte más lógico en el sidebar actual).

Icono sugerido: `MapPin` o `Target` (Lucide).

Commit: incluido en el commit del CRUD de postas (Paso 5).

---

### Paso 8 — Copy en `es.json`

Agregar namespace `admin.postas`:

```json
{
  "admin": {
    "postas": {
      "title": "Postas",
      "empty": "Aún no hay postas registradas. Creá la primera abajo.",
      "nueva": "Nueva posta",
      "editar": "Editar posta",
      "delete": "Eliminar posta",
      "deleteConfirm": "¿Eliminar la posta \"{{nombre}}\"? Esta acción no se puede deshacer.",
      "enUso": "Esta posta está asignada a {{count}} evento(s) y no puede eliminarse.",
      "fields": {
        "nombre": "Nombre",
        "descripcion": "Descripción / funcionamiento",
        "duracionMinutos": "Duración estimada (minutos)",
        "plantilla": "Plantilla de evaluación",
        "plantillaSinAsignar": "(sin asignar)",
        "materiales": "Materiales",
        "agregarMaterial": "Agregar material",
        "materialNombre": "Material",
        "materialCantidad": "Cantidad (opcional)"
      },
      "historial": {
        "title": "Historial de eventos",
        "empty": "Esta posta aún no fue asignada a ningún evento.",
        "evento": "Evento",
        "actividad": "Actividad",
        "juez": "Juez",
        "encargado": "Encargado",
        "fecha": "Fecha"
      },
      "errors": {
        "nombreDuplicado": "Ya existe una posta con ese nombre en el distrito.",
        "postaEnUso": "La posta está asignada en: {{eventos}}. Desasignala primero.",
        "noEncontrada": "Posta no encontrada."
      }
    },
    "eventos": {
      "postas": {
        "asignar": "Asignar posta",
        "desasignar": "Desasignar posta",
        "desasignarConfirm": "¿Desasignar la posta \"{{nombre}}\" de esta actividad?",
        "dialogTitle": "Asignar posta a actividad",
        "dialogTitleEditar": "Editar asignación de posta",
        "selectPosta": "Seleccionar posta",
        "yaAsignada": "Ya asignada en {{actividad}}",
        "juez": "Juez",
        "juezSinAsignar": "(sin asignar)",
        "encargado": "Encargado (opcional)",
        "ayudantes": "Ayudantes (opcional)",
        "weight": "Peso relativo",
        "asignarSubmit": "Asignar",
        "guardarSubmit": "Guardar cambios",
        "cancelar": "Cancelar",
        "errors": {
          "yaAsignadaEnEvento": "Esta posta ya está asignada a otra actividad de este evento."
        }
      }
    }
  }
}
```

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm prisma migrate status   # migración aplicada
pnpm build         # build exitoso
```

### Verificación manual end-to-end

Pre-requisito: admin logueado, distrito con ≥1 plantilla activa, ≥1 grupo scout, ≥1 evento BORRADOR con ≥2 actividades (pesos = 100%).

---

**Escenario 1 — Crear posta standalone**:
1. Ir a `/admin/postas`. Verificar que aparece la sección en el sidebar.
2. Click "Nueva posta".
3. Completar: nombre "Amarres básicos", descripción "Evaluación de nudos de amarre cuadrado y diagonal", duración 15 minutos, plantilla "Construcción básica".
4. En materiales: agregar ítem "Cuerdas de 5mm" con cantidad "20 metros"; agregar ítem "Palos de 1m" con cantidad "10 unidades".
5. Submit → redirige a `/admin/postas/[id]`. La posta aparece con todos sus datos. Historial muestra "Aún no fue asignada".

**Escenario 2 — Nombre duplicado**:
1. Crear otra posta con el mismo nombre "Amarres básicos".
2. Server retorna `NOMBRE_POSTA_DUPLICADO`. UI muestra "Ya existe una posta con ese nombre en el distrito."

**Escenario 3 — Editar posta (inline)**:
1. En `/admin/postas/[id]` de "Amarres básicos", cambiar duración de 15 a 20 minutos.
2. Botón "Guardar" aparece. Click → posta actualizada, botón desaparece.
3. Agregar un material más: "Silbato de árbitro", sin cantidad.
4. Submit → lista de materiales actualizada sin recargar página completa.

**Escenario 4 — Asignar posta a actividad**:
1. Ir al detalle del evento BORRADOR.
2. En la actividad "Construcción", botón "Asignar posta". Se abre el dialog.
3. En el select de postas, aparece "Amarres básicos" con su plantilla. Seleccionarla.
4. Aparece previsualización: descripción, duración 20 min, materiales.
5. Asignar juez "Juan Pérez". Completar encargado "Carlos López", ayudantes "María García, Luis Rodríguez". Weight: 1.5.
6. Click "Asignar" → dialog se cierra. La actividad muestra la fila de "Amarres básicos" con juez y encargado.

**Escenario 5 — Posta ya asignada en el evento (en otro selector)**:
1. En la actividad "Cocina", abrir dialog "Asignar posta".
2. En el select, "Amarres básicos" aparece deshabilitada con label "Ya asignada en Construcción".
3. No se puede seleccionar. Crear otra posta "Primera asistencia" y asignarla a "Cocina" → ok.

**Escenario 6 — Editar asignación desde el evento**:
1. En la fila de "Amarres básicos" dentro de "Construcción", click ✏️.
2. Se abre el dialog con los valores precargados (juez, encargado, ayudantes, weight).
3. Cambiar juez a "Ana Torres". Click "Guardar cambios" → fila actualizada.

**Escenario 7 — Desasignar posta**:
1. Click 🗑 en "Amarres básicos". Confirmación: "¿Desasignar la posta... de esta actividad?".
2. Confirmar → la fila desaparece de la actividad. La posta sigue existiendo en `/admin/postas`.

**Escenario 8 — Reordenar asignaciones**:
1. Asignar 3 postas a la actividad "Construcción" (orden 1, 2, 3).
2. Click ↑ en la segunda → las postas quedan en orden 2, 1, 3.
3. Recargar página → orden persistido sin violación de `@@unique([actividadId, orden])`.

**Escenario 9 — Eliminar posta en uso (bloqueado)**:
1. En `/admin/postas/[id]` de "Primera asistencia" (asignada a "Cocina" del evento BORRADOR), click "Eliminar posta".
2. Server retorna `POSTA_EN_USO`. UI muestra: "La posta está asignada en: Evento Demo. Desasignala primero."
3. El botón de eliminar en el listado aparece deshabilitado con tooltip "En uso en 1 evento".

**Escenario 10 — Eliminar posta sin asignaciones (permitido)**:
1. Crear una posta "Posta temporal" sin asignarla a ningún evento.
2. En el listado, badge "0 eventos". Click eliminar → confirmación → posta eliminada. Listado actualizado.

**Escenario 11 — Historial de uso en la posta**:
1. La posta "Amarres básicos" ya fue asignada y luego el evento fue activado y cerrado (simular con seed o manualmente).
2. En `/admin/postas/[id]`, sección "Historial de eventos" muestra: "Evento Demo — Construcción — Juez: Juan Pérez — Encargado: Carlos López".

**Escenario 12 — Gate de pre-activación con asignaciones**:
1. Evento con actividad "Construcción" sin ninguna asignación de posta.
2. Click "Activar evento" → server retorna `PRE_ACTIVACION_INCOMPLETA` con `ACTIVIDAD_SIN_POSTAS`.
3. Asignar "Amarres básicos" (que ya tiene plantilla) a "Construcción". Agregar ≥1 patrulla.
4. Click "Activar evento" → evento pasa a ACTIVO.

**Escenario 13 — Gate: posta asignada pero sin plantilla**:
1. Crear posta "Posta sin plantilla" sin asignar plantilla.
2. Asignar la posta a una actividad del evento.
3. Click "Activar evento" → `POSTA_SIN_PLANTILLA` lista "Posta sin plantilla (en Construcción)".

**Escenario 14 — Tenant isolation**:
1. Como admin del Distrito B, ir a `/admin/postas`. Lista vacía (o solo postas de B).
2. El dialog de asignación solo muestra postas del Distrito B. Solo jueces de B. Solo plantillas de B.
3. Intentar acceder a `/admin/postas/[id-de-A]` → 404 o redirección.

**Escenario 15 — `isTemplateLocked` sigue funcionando**:
1. La posta "Amarres básicos" tiene asignada la plantilla "Construcción básica".
2. En `/admin/plantillas`, intentar editar el core de "Construcción básica" → server retorna `IN_USE`.
3. (La función `isTemplateLocked` consulta `Posta.templateId`, sin cambios respecto a Plan 6b.)

### Criterios de aceptación

- [ ] `pnpm typecheck && pnpm lint && pnpm build` pasan en limpio.
- [ ] Migración aplicada; seed actualizado con postas standalone y asignaciones.
- [ ] CRUD de postas en `/admin/postas`: crear, editar, eliminar (con protección si está en uso).
- [ ] Historial de uso en `/admin/postas/[id]`: lista de asignaciones con evento, actividad, juez, encargado.
- [ ] Dialog de asignación en evento: abrir, seleccionar posta, configurar contexto, guardar.
- [ ] Postas ya asignadas en el evento aparecen deshabilitadas en el selector del dialog.
- [ ] Validación server-side `POSTA_YA_ASIGNADA_EN_EVENTO` funciona.
- [ ] Editar asignación (dialog precargado) y desasignar funcionan.
- [ ] Reordenar asignaciones dentro de actividad: ↑/↓ con `@@unique([actividadId, orden])` respetado.
- [ ] Gates de pre-activación usan `AsignacionPosta` correctamente.
- [ ] `isTemplateLocked` sigue funcionando (sin cambios en la función, solo el modelo).
- [ ] Sidebar tiene entrada "Postas".
- [ ] Todo el copy viene de `es.json`.
- [ ] Tenant isolation: postas, asignaciones, jueces y plantillas solo del distrito correcto.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| La query `listPostasParaEvento` (postas del distrito + estado en el evento) se vuelve compleja | Media | Implementar como dos queries: `listPostas(orgId)` + `listAsignacionesByEvento(eventoId)` y hacer el join en la capa de aplicación antes de pasar al dialog. |
| El dialog con previsualización + selector + campos de contexto resulta demasiado cargado para mobile | Media | Dividir el dialog en dos pasos: paso 1 = elegir posta, paso 2 = configurar contexto. Simplifica el layout sin quitar funcionalidad. Decidir en ejecución según el resultado visual. |
| `onDelete: Restrict` en `AsignacionPosta.postaId` produce error P2003 no manejado si se elimina desde la DB directamente | Baja | El repo siempre hace la app-level check primero. El catch de P2003 en `deletePosta` retorna `BusinessError("POSTA_EN_USO")` como fallback. |
| Cambiar `User.postasJuez Posta[]` a `User.asignacionesJuez AsignacionPosta[]` puede romper tipado en archivos de Plan 6b | Alta | TypeScript detecta en compile time. Buscar todos los consumidores de `postasJuez` antes de aplicar el cambio. En Plan 6b no hay UI que lea `postasJuez` del user directamente — es solo la relación inversa para Prisma. |
| `findEventoCompleto` crece con `asignaciones.posta` + `asignaciones.juezUser` y aumenta latencia de la página de evento | Baja | El evento típico tiene <5 actividades × <10 postas = <50 asignaciones. Aggregate manejable. |
| El reordenamiento de asignaciones con `@@unique([actividadId, orden])` y swap temporal tiene race condition si dos admins reordenan al mismo tiempo | Muy baja | MVP. Un distrito rara vez tiene dos admins activos simultáneamente en la misma actividad. Diferir a Plan 7 si se vuelve problema. |

---

## Antes de ejecutar — checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm build` pasan en `main` antes de iniciar.
- [ ] Confirmar que no hay datos reales en producción (solo seed demo).
- [ ] Identificar el componente de sidebar para agregar la nueva entrada.
- [ ] Identificar si `listJuecesAsignables` ya existe en `membership.repo.ts` (Plan 6b) o necesita crearse.
- [ ] Confirmar que `cacheTags.postas(orgId)` se agrega en `cache-tags.ts` (nuevo en este plan).
- [ ] Revisar si el `findEventoById` actual devuelve `Actividad.postas` — actualizar a `Actividad.asignaciones` en todos sus consumidores.

---

## Commits sugeridos

| # | Mensaje |
|---|---|
| 1 | `feat(schema): posta standalone con biblioteca y AsignacionPosta por uso` |
| 2 | `feat(repo): posta standalone + AsignacionPosta con validación de unicidad por evento` |
| 3 | `fix(repo): gates de pre-activación a través de AsignacionPosta` |
| 4 | `feat(admin): CRUD de postas standalone en /admin/postas` |
| 5 | `feat(admin): asignación de postas a actividades mediante dialog en /admin/eventos/[id]` |
| 6 | `docs(plan): Plan 6c ejecutado — postas como biblioteca reutilizable` |

---

## Lecciones aprendidas

*(A completar tras la ejecución con Sonnet.)*
