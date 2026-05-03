# Plan 6a — Eventos y ciclo de vida (Evento + Actividad)

> **Estado**: ✅ Ejecutado (2026-05-02 con Sonnet). Ver sección "Commits asociados" y "Lecciones aprendidas".

---

## Contexto

Plan 5 cerró la biblioteca de plantillas de puntaje del distrito. Lo que falta para que un admin pueda armar un evento real es la entidad `Evento` y su jerarquía interna.

El **master plan original** modelaba la jerarquía como `Evento → Posta` directa, donde cada posta tenía una plantilla y un peso. Durante la planeación de Plan 5 el usuario clarificó que **la jerarquía real del escultismo es de tres niveles**:

```
Evento
└── Actividad (peso porcentual; suma 100% del evento)
    └── Posta (con plantilla asignada)
```

Tipos típicos de actividades:
- **Competición**: varias postas chicas, encaja con plantillas modo `PUNTAJE_UNICO`.
- **Construcción**: una "posta" gigante con peso alto, encaja con `CRITERIOS`.
- **Cocina**: una posta por comida del día, encaja con `CRITERIOS`.

Plan 6a introduce el nivel **Evento + Actividad** sin postas todavía (eso es Plan 6b). Las plantillas de Plan 5 son las entidades que eventualmente se asignarán a las postas en Plan 6b. Esto significa que en Plan 6a:

- Existe `Evento` con metadata, estado y ciclo de vida.
- Existe `Actividad` con tipo, peso porcentual y descripción.
- **No existe `Posta`** todavía. La validación "el evento tiene postas configuradas y juez asignado" llega en Plan 6b.
- **No existe `Patrulla`** todavía. La definición de patrullas competidoras también llega en Plan 6b.

Plan 6a también **abre formalmente el cambio de dominio respecto al master plan** vía `docs/adr/0003-jerarquia-evento-actividad-posta.md`, y actualiza `docs/plans/00-master-plan.md` para reflejar la jerarquía real (incluyendo la actualización del modelo de dominio, el roadmap de planes 4a/4b/5a/5b/6/7, y el diagrama de entidades).

Plan 6a reusa al máximo los patrones consolidados en Plans 4 y 5: **capa de repositorios** con `unstable_cache` + tags por organización (ADR-0002), **filas editables inline** con estado dual `current` / `saved` y sincronización desde `actionState` (Plan 4 lección #3), **`revalidateTag` en todas las mutaciones** (Plan 5 lección #16, sin riesgo de pisar inputs porque los formularios sincronizan desde el resultado de la action), **`BusinessError(code, meta?)`** para errores de negocio (CLAUDE.md punto 19), **audit log co-localizado** en cada transacción.

---

## Alcance

### Incluye

- **ADR-0003** que documenta el cambio de jerarquía respecto al master plan original (`Evento → Actividad → Posta`).
- **Actualización del master plan** (`docs/plans/00-master-plan.md`) para reflejar la nueva jerarquía: modelo de dominio, diagrama, roadmap, y notas en planes 4b, 6 y 7 que dependen de Actividad.
- **Migración Prisma** que introduce: `Evento`, `Actividad`, enums `EventoEstado` y `ActividadTipo`. Sin breaking changes al resto del schema.
- **CRUD de eventos** dentro de `/admin/eventos`:
  - Listar con filtros por estado (Todos | Borrador | Activos | Cerrados | Publicados) ordenados por `fechaInicio` desc.
  - Crear con metadata (nombre, descripción, lugar, fechaInicio, fechaFin opcional). Slug autogenerado server-side.
  - Editar metadata (nombre, descripción, lugar, fechaInicio, fechaFin). El slug NO se edita una vez creado.
  - Eliminar (hard delete con cascade a actividades) **solo si estado = BORRADOR**.
- **Máquina de estados** del evento con 4 estados: `BORRADOR → ACTIVO → CERRADO → PUBLICADO`. Transiciones unidireccionales (sin reverso). Plan 6a implementa las transiciones; Plan 7 le da semántica completa a `CERRADO → PUBLICADO` (snapshot + PublicShareLink).
- **Validación al activar (`BORRADOR → ACTIVO`)**:
  - Al menos 1 actividad.
  - Suma de pesos relativos === 100.00 (con tolerancia 0.01 para evitar artefactos de Decimal).
  - Si falla, `BusinessError("PESOS_INVALIDOS", { sumaActual, faltante })`.
- **CRUD de actividades** dentro del detalle del evento (UX inline, no ruta separada):
  - Agregar actividad (nombre, descripción opcional, tipo, peso).
  - Editar metadata de actividad (nombre, descripción, tipo, peso).
  - Eliminar actividad (solo si evento está en BORRADOR — en estados posteriores el helper `isEventoLocked` lo bloquea).
  - Reordenar (botones ↑/↓, swap atómico con valor temporal `orden = -1`).
- **Capa de repositorios** `src/repositories/evento.repo.ts` con lecturas cacheadas (`unstable_cache` + tag `eventos:orgId`) y escrituras transaccionales con audit log co-localizado.
- **Helper `isEventoLocked(eventoId)`** preparado pero retornando siempre `false` en este plan (Plan 6b lo activará cuando exista `ScoreSheet` con scores cargados).
- **Audit log** en cada mutación (`evento.created`, `.updated`, `.deleted`, `.transitioned`, `.actividadAdded`, `.actividadUpdated`, `.actividadDeleted`, `.actividadReordered`).
- **Tarjeta nueva en `/admin` landing** con count de eventos `ACTIVO`.
- **Entrada nueva en `AdminNav`** con sub-link "Eventos".
- **Copy en español** centralizado en `src/messages/es.json` namespace `admin.eventos`.
- **Tests Vitest** del repositorio (creación, validación de fechas, máquina de estados, validación de pesos, eliminación condicional, reorden).

### NO incluye

- **Postas, plantillas asignadas a actividades, patrullas, jueces** — Plan 6b. Plan 6a deja la jerarquía Evento→Actividad lista pero sin postas adentro.
- **`ScoreSheet`, `ScoreEntry`, carga de puntajes** — Plan 6a/6b. Plan 6a no tiene scoring.
- **Snapshot al cerrar / `PublicShareLink`** — Plan 7. La transición `CERRADO → PUBLICADO` se permite estructuralmente pero sin generar artefactos públicos.
- **Vista pública del evento** — Plan 6/7.
- **Lock real de actividades por scores cargados** — Plan 6b lo activará cuando `ScoreSheet` exista. Plan 6a deja `isEventoLocked` retornando `false`.
- **Reabrir evento `CERRADO → ACTIVO`** — Plan 8 (correcciones post-cierre) lo evalúa y, según el master plan, *no* reabre el evento entero sino planillas individuales. Plan 6a mantiene transiciones unidireccionales.
- **Soft delete (archivado) de eventos** — se evalúa cuando aparezca el caso (probablemente nunca: los eventos `CERRADO`/`PUBLICADO` quedan como histórico).
- **Filtros avanzados, búsqueda por texto, paginación** — un distrito típico tendrá < 30 eventos al año. Carga completa con tabs por estado.
- **Drag-and-drop** para reordenar actividades — botones ↑/↓, mismo patrón que criterios en Plan 5.
- **Importar/duplicar eventos** entre años — se evalúa cuando el caso real lo justifique.
- **Notificaciones (email/push) al activar o cerrar** — fuera de alcance.
- **Multi-juez por actividad / multi-actividad simultánea / sub-eventos** — fuera del modelo.
- **Tests E2E con Playwright** — Vitest unit/integration del repositorio.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **Jerarquía de tres niveles `Evento → Actividad → Posta`** vs. la original `Evento → Posta` directa del master plan. ADR-0003 documenta el cambio. | Mantener `Evento → Posta` con `Posta.peso` directo | Refleja el dominio scout real: las actividades son bloques con peso porcentual y las postas son estaciones dentro de la actividad. Permite agrupar visualmente y reportar por bloque. |
| 2 | **4 estados** del enum `EventoEstado`: `BORRADOR → ACTIVO → CERRADO → PUBLICADO`. Transiciones unidireccionales. | 3 estados con `PUBLICADO` modelado como flag separado en Plan 7 | Cierra el enum una sola vez. `CERRADO` (datos congelados, internos) y `PUBLICADO` (link público emitido) son momentos lógicamente distintos: en Plan 8 el admin puede revisar el snapshot antes de hacerlo público. |
| 3 | **Hard gate al pasar a ACTIVO**: en BORRADOR los pesos pueden sumar cualquier valor (UI muestra warning visual con el faltante). La transición `BORRADOR → ACTIVO` valida `sum(pesos) === 100` con tolerancia 0.01 y al menos 1 actividad. | Validación inmediata por mutación; soft check con autocompletado | Permite al admin construir el evento incrementalmente sin pelear contra validaciones intermedias. La validación dura recién cuando "se publica" la primera transición de estado. Mismo patrón que plantillas en Plan 5 (criterios PUNTUABLE no se exigen al crear; se exigen al asignar a posta). |
| 4 | **`isEventoLocked(eventoId)` deferred a Plan 6b** retornando `false` en Plan 6a (sin denormalización innecesaria). En Plan 6b se actualizará a `prisma.scoreSheet.count({ where: { posta: { actividad: { eventoId } } } }) > 0`. | Lock estricto al pasar a ACTIVO (actividades read-only inmediatamente); lock por flag denormalizado | Plan 6a no tiene scores todavía, así que el lock nunca dispararía. Definir el helper ahora (con la firma final) deja preparada la integración futura sin código muerto. Mismo patrón que `isTemplateLocked` en Plan 5. |
| 5 | **`pesoRelativo: Decimal @db.Decimal(5,2)`** con validación de suma con tolerancia 0.01 | `Int` (suma 100 entera) | Permite repartos no enteros (33.33 + 33.33 + 33.34 = 100.00) que son frecuentes cuando el admin quiere actividades del mismo peso. La tolerancia 0.01 absorbe artefactos de Decimal sin habilitar pesos absurdos. |
| 6 | **Enum `ActividadTipo` separado** (`COMPETICION \| CONSTRUCCION \| COCINA \| OTRO`), no reusar `ScoreTemplateCategoria` | Compartir el enum con `ScoreTemplate` | Aunque hoy tienen los mismos valores, son entidades semánticamente distintas (`ScoreTemplate` clasifica plantillas reusables; `Actividad` clasifica bloques de un evento concreto). Si mañana aparece `CAMPAMENTO` solo en Actividad, se agrega ahí sin tocar plantillas. Acoplamiento bajo. |
| 7 | **`fechaInicio` (obligatoria) + `fechaFin` (opcional)** | Solo `fechaInicio` única (multi-día diferido) | Margen para eventos multi-día sin agregar migración después. Si `fechaFin` es `null`, el evento dura un día (UI: "11 de mayo"). Si está, UI muestra rango ("11–13 de mayo"). Validación: `fechaFin >= fechaInicio` cuando ambos están. |
| 8 | **`slug` único por organización** (`@@unique([organizationId, slug])`), generado server-side desde `nombre` (lowercase, sin tildes, espacios → guiones, max 50 chars). Si colisiona, sufijo numérico `-2`, `-3`. **Inmutable post-creación**. | Sin slug; slug editable | URLs internas siguen siendo `/admin/eventos/[id]` (cuid2), pero el slug queda preparado para futuras URLs públicas (`/e/[slug]` tipo) sin requerir migración. Mismo patrón que `Organization.slug` y `GrupoScout.slug`. |
| 9 | **Hard delete solo en BORRADOR** con cascade a actividades. En ACTIVO/CERRADO/PUBLICADO, `BusinessError("NO_DELETABLE")`. | Soft delete (archivedAt) en cualquier estado; no implementar deleción todavía | Los eventos en estados posteriores son históricos: borrarlos es destructivo y debería ser excepción. Se difiere "archivar" para cuando aparezca el caso real (probablemente nunca: los CERRADO/PUBLICADO son auditables y el admin no quiere "ocultarlos"). |
| 10 | **Transiciones unidireccionales** (sin botones de reverso). El ADMIN no puede pasar de `CERRADO → ACTIVO`. Para corregir un score post-cierre, Plan 8 reabrirá la **planilla individual** (no el evento). | Permitir reverso con confirmación destructiva; permitir solo `BORRADOR ↔ ACTIVO` | Consistente con master plan. Reverso destructivo es difícil de auditar y de razonar. La excepción de Plan 8 es quirúrgica (una planilla específica), no estructural. |
| 11 | **Timestamps separados `activatedAt`, `closedAt`, `publishedAt`** además del enum `estado` | Solo `estado` (sin historia) | Permite reportes ("¿cuánto duró el evento entre activación y cierre?") y auditoría implícita sin queriar `AuditLog`. La columna queda `null` hasta que se alcanza el estado. |
| 12 | **UX inline en `/admin/eventos/[id]`**: una sola página con metadata + máquina de estados + lista de actividades editables + form para agregar nueva. Sin sub-ruta. | Sub-ruta separada `/admin/eventos/[id]/actividades` | El admin pasa la mayoría del tiempo manipulando actividades; tener todo en una vista reduce clicks. La página de Plan 5 (detalle de plantilla con metadata + core + criterios) es el precedente directo. |
| 13 | **Filas de actividad editables inline** siguiendo el patrón Plan 4 lección #3: estado dual `current` / `saved` sincronizado desde `actionState` (no desde props vía `useEffect([prop])`). Botón "Guardar" visible solo cuando `isDirty`. | Modal de edición; doble-click para editar | Reusa el patrón consolidado. Mobile-friendly. Sin librerías extras. |
| 14 | **`revalidateTag` en todas las mutaciones** que persisten en DB (Plan 5 lección #16): crear, eliminar, transicionar estado, agregar/editar/eliminar actividad, reordenar. | Llamar `revalidateTag` solo en mutaciones estructurales | Sin `revalidateTag`, recargar la página devuelve datos viejos del cache aunque la UI ya muestra "Guardado". El riesgo de Plan 4 (stale props pisando el input) no aplica aquí porque los formularios sincronizan desde `actionState`, no desde props vía `useEffect([prop])`. |
| 15 | **Validación de transiciones en el repositorio** con tabla `validTransitions: Record<EventoEstado, EventoEstado[]>`. Cada transición invoca un guard específico (`canTransitionToActivo` valida pesos === 100). | Switch case inline en la action; máquina de estados con XState | Tabla declarativa pequeña, sin librería. Los guards quedan co-localizados en el repo. |
| 16 | **`BusinessError` con códigos semánticos**: `NOMBRE_DUPLICADO` (slug colisión post-sufijo), `NO_DELETABLE`, `INVALID_TRANSITION`, `PESOS_INVALIDOS`, `ACTIVIDAD_NO_ENCONTRADA`, `EVENTO_LOCKED`, `FECHA_INVALIDA`. | `throw` genérico con string | Convención cerrada en CLAUDE.md punto 19. La action traduce el código a copy de `es.json`. |
| 17 | **Tarjeta `/admin` landing cuenta solo `ACTIVO`** (no todos los estados) | Contar todos los estados; contar pendientes (BORRADOR) | El número que más le interesa al admin "de un vistazo" es cuántos eventos están corriendo ahora. Los borradores y cerrados se ven en el listado. |
| 18 | **Constraint `@@unique([eventoId, orden])`** sobre Actividad. Reordenamiento usa valor temporal `orden = -1` durante el swap (mismo patrón que `TemplateCriterion` en Plan 5). | Floats fraccionarios para orden; sin constraint | Garantiza orden contiguo y único. Pequeño costo en el reorden a cambio de invariante fuerte en DB. |
| 19 | **Slug autogenerado** (no editable en el form de creación). Helper `generateSlug(nombre, orgId)` itera con sufijos hasta encontrar libre. | Slug pedido al admin con validación | Reduce un campo del form. El admin típico no piensa en slugs y los URLs internos usan `id`. Si más adelante el slug aparece en URL pública y el admin quiere personalizarlo, se evalúa entonces. |
| 20 | **Actualizar el master plan** (`00-master-plan.md`) durante Plan 6a, no diferir | Solo abrir ADR y actualizar master plan en otro plan | Master plan describe el modelo de dominio en alto nivel; tener divergencia entre master plan y schema real confunde a futuros lectores. ADR-0003 explica el cambio; master plan refleja el estado nuevo con un puntero al ADR. |

---

## Modelo de datos

### Schema Prisma (a agregar)

```prisma
// ──────────────────────────────────────────────────────────────
// Enums de eventos
// ──────────────────────────────────────────────────────────────

enum EventoEstado {
  BORRADOR
  ACTIVO
  CERRADO
  PUBLICADO
}

enum ActividadTipo {
  COMPETICION
  CONSTRUCCION
  COCINA
  OTRO
}

// ──────────────────────────────────────────────────────────────
// Evento
// ──────────────────────────────────────────────────────────────

model Evento {
  id             String       @id @default(cuid(2))
  organizationId String
  nombre         String
  slug           String       // único por org, autogenerado, inmutable post-creación
  descripcion    String?
  lugar          String?
  fechaInicio    DateTime
  fechaFin       DateTime?
  estado         EventoEstado @default(BORRADOR)
  activatedAt    DateTime?    // se setea al pasar a ACTIVO
  closedAt       DateTime?    // se setea al pasar a CERRADO
  publishedAt    DateTime?    // se setea al pasar a PUBLICADO (Plan 7 le da semántica completa)
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  actividades  Actividad[]

  @@unique([organizationId, slug])
  @@index([organizationId])
  @@index([organizationId, estado])
  @@index([organizationId, fechaInicio])
}

// ──────────────────────────────────────────────────────────────
// Actividad — bloque dentro del evento con peso porcentual
// ──────────────────────────────────────────────────────────────

model Actividad {
  id           String        @id @default(cuid(2))
  eventoId     String
  nombre       String
  descripcion  String?
  tipo         ActividadTipo
  pesoRelativo Decimal       @db.Decimal(5, 2)  // 0.00 - 100.00, suma de actividades del evento debe ser 100.00 al activar
  orden        Int
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  evento Evento @relation(fields: [eventoId], references: [id], onDelete: Cascade)

  @@unique([eventoId, orden])
  @@index([eventoId])
}
```

### Cambios en `Organization`

```prisma
model Organization {
  // ... campos existentes ...
  eventos Evento[]   // NUEVA relación
}
```

### Notas sobre el schema

- **`@db.Decimal(5, 2)`**: rango efectivo `0.00` – `999.99`. La validación de aplicación restringe a `0.01` – `100.00` por actividad. Postgres `numeric(5,2)` es nativo y soporta arithmetic exacta.
- **`activatedAt` / `closedAt` / `publishedAt`**: se setean en la misma transacción que el cambio de `estado`. Quedan `null` hasta que se alcanza el estado correspondiente. Una vez seteados, se preservan (un evento `CERRADO` mantiene su `activatedAt` original).
- **`@@unique([eventoId, orden])`** + reorden con valor temporal `-1` durante el swap (mismo patrón que `TemplateCriterion` en Plan 5).
- **`onDelete: Cascade`** en `Actividad → Evento` significa que borrar un Evento (solo posible en BORRADOR) también borra sus actividades.
- **`@@unique([organizationId, slug])`** case-sensitive. El slug se genera siempre lowercase desde `nombre`, así que en la práctica no hay colisión por case.
- **No hay constraint check en DB para `sum(pesoRelativo) = 100`**: la regla es de aplicación (varía por estado del evento) y se valida en el repositorio al ejecutar la transición `BORRADOR → ACTIVO`.

### Migración SQL

Generada por `pnpm prisma migrate dev --name add_eventos_actividades`. Crea los `CREATE TYPE` para los enums, las dos tablas con sus FKs e índices, sin breaking changes al resto del schema.

---

## Estructura de rutas

```
/(app)/
└── admin/
    ├── ... (Plans 4 y 5)
    └── eventos/                         ← NUEVO en Plan 6a
        ├── page.tsx                     ← lista con tabs por estado
        ├── nuevo/
        │   └── page.tsx                 ← form de creación
        ├── actions.ts                   ← acciones a nivel listado: createEvento, deleteEvento
        └── [id]/
            ├── page.tsx                 ← detalle inline (metadata + estado + actividades)
            └── actions.ts               ← acciones del detalle: updateMetadata, transicionarEstado, addActividad, updateActividad, deleteActividad, reorderActividad
```

Todo bajo el guard `requireRole(['ADMIN'])` ya establecido en `(app)/admin/layout.tsx`. Sin rutas públicas en este plan.

---

## Implementación

### Paso 1 — ADR-0003 y actualización del master plan

Archivos:
- **Crear** `docs/adr/0003-jerarquia-evento-actividad-posta.md`. Estructura tipo ADR-0001/0002:
  - **Estado**: Aceptado
  - **Fecha**: 2026-05-XX
  - **Planes afectados**: 6a (este), 6b, 7, y referencia retrospectiva al master plan.
  - **Contexto**: el master plan original modelaba `Evento → Posta` directamente. Durante la planeación de Plan 5 el usuario clarificó que la jerarquía real del escultismo tiene un nivel intermedio: las actividades agrupan postas y tienen un peso porcentual del total del evento.
  - **Decisión**: introducir `Actividad` como entidad intermedia con `pesoRelativo: Decimal(5,2)` que suma 100 por evento. La `Posta` (Plan 6b) pasará a tener FK a `Actividad`, no directo a `Evento`.
  - **Consecuencias**: scoring final del evento = `sum(actividad.pesoRelativo / 100 * sum(posta.score * posta.weight) for posta in actividad.postas)`. La fórmula de "Total de patrulla en el evento" del master plan se actualiza acorde. Reportes pueden segmentarse por actividad además de por posta.
  - **Alternativas descartadas**: mantener `Evento → Posta` con grupos visuales en UI sin entidad nueva (descartado: pierde semántica del peso por bloque); modelar peso a nivel de posta (descartado: el peso real es por bloque, no por estación).
- **Modificar** `docs/plans/00-master-plan.md`:
  - En el modelo de dominio, agregar `Actividad` entre `Evento` y `Posta`. Texto: "*una **Actividad** es un bloque dentro del evento con tipo (`COMPETICION | CONSTRUCCION | COCINA | OTRO`) y peso porcentual; las actividades de un evento suman 100%. Las **Postas** son las estaciones dentro de cada actividad.*"
  - Actualizar la sección "Reglas clave de scoring" con la fórmula que incluye actividad.
  - Actualizar el roadmap (tabla de planes) en planes 4b, 6 y 7 para reflejar que `Actividad` ya existe desde 4a.
  - Agregar referencia a ADR-0003 en la sección "Riesgos y decisiones diferidas" (cambio post-master-plan).
- **Modificar** `docs/README.md` para listar ADR-0003.
- **Modificar** `CLAUDE.md` sección "Documentación" para agregar el ADR y referencia a `docs/plans/06a-eventos.md`.

Verificación: lectura cruzada de master plan + ADR-0003 + Plan 6a no muestra contradicciones.

Commit: `docs(adr): jerarquía Evento → Actividad → Posta y actualización del master plan`

---

### Paso 2 — Schema y migración

Archivos:
- `prisma/schema.prisma` — agregar enums `EventoEstado`, `ActividadTipo` + modelos `Evento` y `Actividad` + relación inversa en `Organization`.
- `prisma/migrations/<timestamp>_add_eventos_actividades/migration.sql` — generado por `pnpm prisma migrate dev --name add_eventos_actividades`.

Verificación:
- `pnpm prisma generate` corre limpio.
- `pnpm prisma migrate dev` crea las tablas en la DB local.
- `psql` confirma `\d "Evento"` con columnas, FKs e índices, y `\d "Actividad"` con `pesoRelativo numeric(5,2)`.
- Smoke test: insertar manualmente un Evento con una Actividad y validar el cascade al borrar.

Commit: `feat(schema): eventos con estados y actividades con peso porcentual`

---

### Paso 3 — Cache tag, helper de slug y errores de negocio

Archivos:
- `src/repositories/cache-tags.ts` — agregar `eventos: (orgId) => 'eventos:${orgId}'`.
- `src/lib/errors.ts` — códigos nuevos: `NO_DELETABLE`, `INVALID_TRANSITION`, `PESOS_INVALIDOS`, `ACTIVIDAD_NO_ENCONTRADA`, `EVENTO_LOCKED`, `FECHA_INVALIDA`. (`NOMBRE_DUPLICADO` ya existe.)
- `src/lib/slug.ts` (si no existe; sino reusar) — helper `slugify(nombre: string): string` (lowercase, sin tildes vía `normalize('NFD').replace(/[̀-ͯ]/g, '')`, espacios → guiones, otros chars no alfanuméricos eliminados, max 50 chars, trim de guiones extra).

Commit: incluido en el siguiente paso (no amerita commit propio).

---

### Paso 4 — Repositorio `evento.repo.ts`

Archivo: `src/repositories/evento.repo.ts`.

Funciones públicas:

```ts
// Lecturas (cacheadas con unstable_cache + tag eventos:orgId)
listEventos(
  organizationId: string,
  opts?: { estados?: EventoEstado[] },
): Promise<EventoConActividades[]>
findEventoById(organizationId: string, id: string): Promise<EventoConActividades | null>
countEventosActivos(organizationId: string): Promise<number>

// Lock (Plan 6a retorna siempre false; Plan 6b lo activa)
isEventoLocked(eventoId: string): Promise<boolean>

// Mutaciones (transaccionales, con audit log y revalidateTag)
createEvento(
  organizationId: string,
  data: { nombre: string; descripcion?: string; lugar?: string; fechaInicio: Date; fechaFin?: Date },
  actorUserId: string,
): Promise<{ id: string; slug: string }>

updateEventoMetadata(
  organizationId: string,
  id: string,
  data: { nombre: string; descripcion?: string; lugar?: string; fechaInicio: Date; fechaFin?: Date },
  actorUserId: string,
): Promise<void>

deleteEvento(organizationId: string, id: string, actorUserId: string): Promise<void>
// Bloquea con BusinessError("NO_DELETABLE", { estadoActual }) si estado != BORRADOR

transicionarEstado(
  organizationId: string,
  id: string,
  target: EventoEstado,
  actorUserId: string,
): Promise<void>
// Valida la tabla de transiciones permitidas. Para BORRADOR→ACTIVO ejecuta canTransitionToActivo.
// Setea activatedAt/closedAt/publishedAt según corresponda.

// Actividades
addActividad(
  organizationId: string,
  eventoId: string,
  data: { nombre: string; descripcion?: string; tipo: ActividadTipo; pesoRelativo: Decimal },
  actorUserId: string,
): Promise<{ id: string }>

updateActividad(
  organizationId: string,
  eventoId: string,
  actividadId: string,
  data: { nombre: string; descripcion?: string; tipo: ActividadTipo; pesoRelativo: Decimal },
  actorUserId: string,
): Promise<Actividad>  // retorna el registro actualizado para que el cliente sincronice estado dual

deleteActividad(
  organizationId: string,
  eventoId: string,
  actividadId: string,
  actorUserId: string,
): Promise<void>

reorderActividad(
  organizationId: string,
  eventoId: string,
  actividadId: string,
  direction: "up" | "down",
  actorUserId: string,
): Promise<void>
```

#### Patrón de cada función

1. Validar pertenencia al `organizationId` (`prisma.evento.findFirst({ where: { id, organizationId } })`).
2. Validar reglas de negocio → `throw new BusinessError(...)`.
3. Si la mutación toca campos lockeables (actividades en evento ACTIVO+), llamar `isEventoLocked` y bloquear con `BusinessError("EVENTO_LOCKED")`.
4. **Validación de fechas en `createEvento` / `updateEventoMetadata`**: si `fechaFin` está, debe ser `>= fechaInicio` (compararadas como `DateTime` con misma TZ). Si falla → `BusinessError("FECHA_INVALIDA")`.
5. `prisma.$transaction` con la mutación + `auditLog.create` co-localizado.
6. `revalidateTag(cacheTags.eventos(organizationId))`.

#### Máquina de estados (en el repo)

```ts
const validTransitions: Record<EventoEstado, EventoEstado[]> = {
  BORRADOR:  ["ACTIVO"],
  ACTIVO:    ["CERRADO"],
  CERRADO:   ["PUBLICADO"],
  PUBLICADO: [],   // estado terminal
}

async function canTransitionToActivo(eventoId: string): Promise<void> {
  const actividades = await prisma.actividad.findMany({ where: { eventoId } })
  if (actividades.length === 0) {
    throw new BusinessError("PESOS_INVALIDOS", { sumaActual: 0, faltante: 100, sinActividades: true })
  }
  const suma = actividades.reduce((acc, a) => acc.plus(a.pesoRelativo), new Decimal(0))
  const diff = suma.minus(100).abs()
  if (diff.greaterThan(0.01)) {
    throw new BusinessError("PESOS_INVALIDOS", {
      sumaActual: suma.toNumber(),
      faltante: new Decimal(100).minus(suma).toNumber(),
    })
  }
}

// transicionarEstado:
//   if (!validTransitions[currentEstado].includes(target)) → BusinessError("INVALID_TRANSITION")
//   if (target === "ACTIVO") await canTransitionToActivo(id)
//   update con timestamp correspondiente:
//     ACTIVO    → activatedAt:  now()
//     CERRADO   → closedAt:     now()
//     PUBLICADO → publishedAt:  now()
```

#### Helpers internos

- `_findById(organizationId, id)` — `prisma.evento.findFirst({ where: { id, organizationId }, include: { actividades: { orderBy: { orden: "asc" } } } })`. Define el tipo `EventoConActividades = Awaited<ReturnType<typeof _findById>>`.
- `generateUniqueSlug(organizationId, nombre)` — usa `slugify(nombre)`, intenta el base, si colisiona itera con `-2`, `-3`, etc. Patrón análogo a `duplicateScoreTemplate` de Plan 5.

#### Reordenamiento de actividades

Idéntico patrón a `reorderCriterio` de Plan 5:

```ts
await prisma.$transaction(async (tx) => {
  await tx.actividad.update({ where: { id: actividad.id }, data: { orden: -1 } })
  await tx.actividad.update({ where: { id: swap.id }, data: { orden: actividad.orden } })
  await tx.actividad.update({ where: { id: actividad.id }, data: { orden: targetOrden } })
  await tx.auditLog.create({ ... })
})
revalidateTag(cacheTags.eventos(organizationId))
```

#### Eliminación de actividad

Tras eliminar, **renumerar las restantes** para mantener orden contiguo (mismo patrón que `deleteCriterio` de Plan 5).

#### Importante — siguiendo CLAUDE.md punto 18

Las lecturas con `include: { actividades: ... }` usan `prisma.*` directo con `where: { organizationId }` explícito, no `forOrg().findMany` con include (porque pierde generic types).

#### Tests Vitest

Archivo: `src/repositories/evento.repo.test.ts`.

Casos prioritarios:
- Crear evento con metadata válida → persistido + audit + slug autogenerado correctamente.
- Crear evento con `nombre = "Jornada Distrital"` → `slug = "jornada-distrital"`.
- Crear segundo evento mismo nombre → `slug = "jornada-distrital-2"`.
- Crear con `fechaFin < fechaInicio` → `BusinessError("FECHA_INVALIDA")`.
- Crear con `fechaFin = fechaInicio` → ok (evento de un día con fechaFin redundante).
- Crear sin `fechaFin` → ok (evento de un día implícito).
- `updateEventoMetadata` cambia nombre → slug NO cambia (es inmutable).
- Eliminar evento BORRADOR → cascade actividades + audit.
- Eliminar evento ACTIVO → `BusinessError("NO_DELETABLE", { estadoActual: "ACTIVO" })`.
- Eliminar evento CERRADO → idem.
- `transicionarEstado(BORRADOR → ACTIVO)` con 3 actividades sumando 100.00 → ok, `activatedAt` set.
- `transicionarEstado(BORRADOR → ACTIVO)` con 0 actividades → `BusinessError("PESOS_INVALIDOS", { sinActividades: true })`.
- `transicionarEstado(BORRADOR → ACTIVO)` con suma=80 → `BusinessError("PESOS_INVALIDOS", { sumaActual: 80, faltante: 20 })`.
- `transicionarEstado(BORRADOR → ACTIVO)` con suma=99.99 → ok (tolerancia 0.01).
- `transicionarEstado(BORRADOR → ACTIVO)` con suma=99.98 → falla (fuera de tolerancia).
- `transicionarEstado(BORRADOR → CERRADO)` (saltar ACTIVO) → `BusinessError("INVALID_TRANSITION")`.
- `transicionarEstado(CERRADO → ACTIVO)` (reverso) → `BusinessError("INVALID_TRANSITION")`.
- `transicionarEstado(PUBLICADO → CERRADO)` (terminal) → `BusinessError("INVALID_TRANSITION")`.
- `transicionarEstado(ACTIVO → CERRADO)` → ok, `closedAt` set, `activatedAt` preservado.
- `addActividad` con peso=50 → ok, sum=50, evento sigue en BORRADOR.
- `addActividad` en evento ACTIVO con `isEventoLocked` mockeado a `true` → `BusinessError("EVENTO_LOCKED")`.
- `updateActividad` cambia peso de 50 a 30 → ok.
- `reorderActividad` con 3 actividades, mover la primera "down" → orden correcto sin violar unique.
- `reorderActividad` mover la primera "up" → no-op (ya es primera).
- `deleteActividad` en BORRADOR → ok, restantes renumeradas.
- `isEventoLocked` retorna `false` (sin Posta).
- `countEventosActivos` cuenta solo `estado = ACTIVO`.
- Tenant isolation: distrito A no ve eventos de distrito B.

Commit: `feat(repo): evento con máquina de estados y actividades con pesos`

---

### Paso 5 — Página de listado

Archivo: `src/app/(app)/admin/eventos/page.tsx` (Server Component).

Layout:
- Encabezado con botón "+ Nuevo evento" → `/admin/eventos/nuevo`.
- Tabs por estado (search param `?estado=...`): `Todos | Borradores | Activos | Cerrados | Publicados`.
- Lista en grid de tarjetas: nombre, fechas (formato "11 may 2026" o "11–13 may 2026"), badge de estado, lugar (truncado), count de actividades, indicador "Pesos: 80% / 100%" con color (verde si 100, ámbar si <100, rojo si >100). Click → detalle.
- Empty state cuando no hay eventos en el filtro: copy + botón "+ Nuevo evento".

Filtros se manejan con search params (URL-driven), no estado de cliente. Implementación tipo `searchParams.estado` parseado y validado contra el enum.

Commit: `feat(admin): listar eventos con tabs por estado`

---

### Paso 6 — Form de creación

Archivos:
- `src/app/(app)/admin/eventos/nuevo/page.tsx` — Server Component que renderiza el form.
- `src/components/admin/eventos/EventoCreateForm.tsx` — Client Component con `useActionState`.
- `src/app/(app)/admin/eventos/actions.ts` — server actions: `createEvento`, `deleteEvento`.

El form `EventoCreateForm`:
- Campos: nombre (input text), descripción (textarea opcional), lugar (input text opcional), fechaInicio (input date obligatorio), toggle "evento multi-día" → muestra fechaFin (input date opcional).
- Submit → `createEvento` action. En éxito redirige a `/admin/eventos/[id]`.
- Errores: panel rojo con copy de `es.json` según el código.

Validación Zod en la action `createEvento`:
- `nombre`: 2-100 chars, trim.
- `descripcion`: opcional, máx 1000.
- `lugar`: opcional, máx 200.
- `fechaInicio`: ISO date string parseable a Date.
- `fechaFin`: opcional. Refine: si está, `>= fechaInicio`.

La action invoca `requireRole(['ADMIN'])`, captura `BusinessError("NOMBRE_DUPLICADO")` (raro, pero posible si el slug no logra liberar tras los reintentos — no debería suceder con sufijo numérico, pero defensivo) y traduce a `{ error }` para el cliente.

Commit: `feat(admin): crear evento con metadata y fechas`

---

### Paso 7 — Página detalle / editor inline

Archivos:
- `src/app/(app)/admin/eventos/[id]/page.tsx` — Server Component que carga el evento con actividades.
- `src/components/admin/eventos/EventoMetadataForm.tsx` — Client Component para editar metadata (nombre, descripción, lugar, fechas). Deshabilitado si `estado !== BORRADOR && isEventoLocked`. En Plan 6a el lock siempre es false, así que la metadata sigue editable en cualquier estado salvo donde se decida bloquearla en planes futuros — por ahora editable en cualquier estado.
- `src/components/admin/eventos/EventoEstadoControls.tsx` — Client Component con botones de transición disponibles según el estado actual + indicador del estado actual + (cuando estado=BORRADOR) indicador del progreso de pesos.
- `src/components/admin/eventos/ActividadesList.tsx` — Server Component que renderiza el header de "Actividades", el indicador de suma de pesos, la lista de `ActividadRow` y el `AddActividadForm`.
- `src/components/admin/eventos/ActividadRow.tsx` — Client Component por fila con form inline (nombre, tipo, peso, descripción) + botones ↑/↓/eliminar. Estado dual `current` / `saved` sincronizado desde `actionState`.
- `src/components/admin/eventos/AddActividadForm.tsx` — Client Component para agregar nueva actividad.
- `src/components/admin/eventos/DeleteEventoForm.tsx` — Client Component con botón "Eliminar evento" (solo visible si estado=BORRADOR), confirm dialog.
- `src/app/(app)/admin/eventos/[id]/actions.ts` — server actions: `updateMetadata`, `transicionarEstado`, `addActividad`, `updateActividad`, `deleteActividad`, `reorderActividad`.

Layout del detalle:

1. **Header**: nombre del evento + badge de estado + fechas formateadas.
2. **Sección "Información general"** → `EventoMetadataForm` (siempre editable en Plan 6a).
3. **Sección "Estado del evento"** → `EventoEstadoControls`:
   - Estado actual con badge.
   - Línea del tiempo visual: BORRADOR → ACTIVO → CERRADO → PUBLICADO con check en los completados.
   - Botón principal de transición disponible (ej: en BORRADOR → "Activar evento"; en ACTIVO → "Cerrar evento"; en CERRADO → "Publicar evento" [con nota "habilitado en Plan 7"]).
   - Si `BORRADOR`: indicador "Pesos asignados: X% de 100%" con barra de progreso. Botón "Activar evento" deshabilitado si `sum !== 100` o sin actividades, con tooltip explicativo.
   - Mensaje de error si la action de transición falla: panel rojo con copy de `es.json`.
4. **Sección "Actividades"** → `ActividadesList`:
   - Header con title + sumatoria de pesos + count.
   - Indicador visual del estado del 100% (verde 100, ámbar <100, rojo >100).
   - Lista de `ActividadRow` con orden actual; cada fila muestra: nombre, tipo (badge), peso (input numérico), botones ↑/↓/eliminar (eliminar deshabilitado si `isEventoLocked`).
   - `AddActividadForm` debajo (deshabilitado si `isEventoLocked`).
5. **Sección "Acciones peligrosas"** → `DeleteEventoForm` (solo visible si `estado === BORRADOR`).

#### Patrón de fila editable (siguiendo Plan 4 lección #3 + Plan 5)

- `useState` para los inputs (`nombre`, `tipo`, `peso`, `descripcion`).
- `useState` paralelo para `saved*` inicializado desde props al montar.
- Botón "Guardar" visible solo cuando `isDirty` (algún input ≠ saved correspondiente).
- En el `useEffect([actionState])`, sincronizar `saved*` desde el resultado de la action (NO desde props).
- `updateActividad` retorna el `Actividad` actualizado y la action lo expone en `actionState.actividad` para que el cliente sincronice.
- `revalidateTag` se llama igual (siguiendo Plan 5 lección #16) para mantener la lista de eventos al día sin pisar el form.

#### EventoEstadoControls

- Componente cliente con `useActionState` por cada botón de transición.
- El botón "Activar evento" se deshabilita si:
  - `actividades.length === 0`
  - `sum(pesos)` no está dentro de `[99.99, 100.01]`
- Tooltip cuando deshabilitado: "Configurá actividades que sumen 100% antes de activar".
- Si el server retorna `BusinessError("PESOS_INVALIDOS")` (defensa en profundidad), el componente muestra panel rojo con copy "Los pesos deben sumar 100%. Suma actual: X%, faltante: Y%".

Commit: `feat(admin): editor inline de evento con actividades y máquina de estados`

---

### Paso 8 — Tarjeta en `/admin` landing y `AdminNav`

Modificar `src/app/(app)/admin/page.tsx`:
- Agregar `countEventosActivos(org.organizationId)` al `Promise.all`.
- Sumar tarjeta "Eventos activos" al array de cards con link a `/admin/eventos`.

Modificar `src/components/admin/AdminNav.tsx`:
- Agregar entrada "Eventos" al sub-nav.

Commit: `feat(admin): tarjeta y nav para eventos`

---

### Paso 9 — Copy en `es.json`

Agregar namespace `admin.eventos` con copy completo. Estructura tentativa (extracto):

```json
{
  "admin": {
    "nav": { "eventos": "Eventos" },
    "eventos": {
      "title": "Eventos",
      "subtitle": "Gestioná los eventos del distrito y sus actividades",
      "empty": "Aún no hay eventos. Creá el primero para empezar.",
      "newButton": "Nuevo evento",
      "filters": {
        "estado": {
          "all": "Todos",
          "BORRADOR": "Borradores",
          "ACTIVO": "Activos",
          "CERRADO": "Cerrados",
          "PUBLICADO": "Publicados"
        }
      },
      "estadoBadge": {
        "BORRADOR": "Borrador",
        "ACTIVO": "Activo",
        "CERRADO": "Cerrado",
        "PUBLICADO": "Publicado"
      },
      "form": {
        "nombre": "Nombre",
        "descripcion": "Descripción (opcional)",
        "lugar": "Lugar (opcional)",
        "fechaInicio": "Fecha de inicio",
        "multiDiaToggle": "Evento de varios días",
        "fechaFin": "Fecha de fin",
        "submit": "Crear evento",
        "saveMetadata": "Guardar cambios"
      },
      "detail": {
        "metadataTitle": "Información general",
        "estadoTitle": "Estado del evento",
        "actividadesTitle": "Actividades",
        "deleteTitle": "Acciones peligrosas",
        "estadoActual": "Estado actual: {{estado}}",
        "pesosLabel": "Pesos asignados: {{suma}}% de 100%",
        "pesosFaltantes": "Faltan {{faltante}}% por asignar",
        "pesosExcedidos": "Te pasaste {{exceso}}% del 100%",
        "pesosOk": "Pesos completos",
        "transicion": {
          "activar": "Activar evento",
          "cerrar": "Cerrar evento",
          "publicar": "Publicar evento (Plan 7)"
        },
        "transicionDisabledTooltip": "Configurá actividades que sumen 100% antes de activar",
        "deleteButton": "Eliminar evento",
        "deleteConfirm": "¿Eliminar el evento \"{{nombre}}\"? Esta acción es irreversible y borra también las actividades."
      },
      "actividades": {
        "empty": "Aún no hay actividades. Agregá la primera abajo.",
        "addTitle": "Agregar actividad",
        "addSubmit": "Agregar",
        "row": {
          "nombre": "Nombre",
          "tipo": "Tipo",
          "peso": "Peso",
          "descripcion": "Descripción (opcional)",
          "save": "Guardar",
          "delete": "Eliminar",
          "moveUp": "Subir",
          "moveDown": "Bajar",
          "deleteConfirm": "¿Eliminar la actividad \"{{nombre}}\"?"
        },
        "tipo": {
          "COMPETICION": "Competición",
          "CONSTRUCCION": "Construcción",
          "COCINA": "Cocina",
          "OTRO": "Otra"
        }
      },
      "errors": {
        "nombreDuplicado": "Ya existe un evento con ese nombre",
        "noDeletable": "Solo se pueden eliminar eventos en estado BORRADOR",
        "invalidTransition": "La transición de estado solicitada no es válida",
        "pesosInvalidos": "Los pesos de las actividades deben sumar 100%. Suma actual: {{sumaActual}}%, falta: {{faltante}}%",
        "pesosSinActividades": "Agregá al menos una actividad antes de activar el evento",
        "actividadNoEncontrada": "Actividad no encontrada",
        "eventoLocked": "El evento ya tiene puntajes cargados; no se pueden modificar las actividades",
        "fechaInvalida": "La fecha de fin debe ser igual o posterior a la fecha de inicio"
      }
    }
  }
}
```

Commit: incluido en commits previos (i18n se agrega junto con cada feature).

---

### Paso 10 — Tests Vitest

Archivo: `src/repositories/evento.repo.test.ts` (lista de casos definida en Paso 4).

Adicional: si surgen utilidades reusables (ej: `slugify`), agregar `src/lib/slug.test.ts`.

Commit: `test(repo): evento con cobertura de máquina de estados y validación de pesos`

---

## Archivos creados / modificados

| Archivo | Acción | Función |
|---|---|---|
| `docs/adr/0003-jerarquia-evento-actividad-posta.md` | crear | ADR del cambio de jerarquía |
| `docs/plans/00-master-plan.md` | modificar | Reflejar `Evento → Actividad → Posta` y referencia a ADR-0003 |
| `docs/README.md` | modificar | Listar ADR-0003 |
| `CLAUDE.md` | modificar | Agregar Plan 6a y ADR-0003 a la sección de documentación |
| `prisma/schema.prisma` | modificar | Agregar enums + modelos `Evento` y `Actividad` + relación en `Organization` |
| `prisma/migrations/.../migration.sql` | crear | Migración generada por Prisma |
| `src/repositories/cache-tags.ts` | modificar | Tag `eventos: (orgId) => 'eventos:${orgId}'` |
| `src/lib/errors.ts` | modificar | Códigos `NO_DELETABLE`, `INVALID_TRANSITION`, `PESOS_INVALIDOS`, `ACTIVIDAD_NO_ENCONTRADA`, `EVENTO_LOCKED`, `FECHA_INVALIDA` |
| `src/lib/slug.ts` | crear o reusar | Helper `slugify` (si ya existe en otro repo, reusar) |
| `src/repositories/evento.repo.ts` | crear | Lecturas cacheadas, mutaciones transaccionales con audit, máquina de estados |
| `src/repositories/evento.repo.test.ts` | crear | Tests Vitest |
| `src/lib/slug.test.ts` | crear (si aplica) | Tests del helper |
| `src/app/(app)/admin/eventos/page.tsx` | crear | Listado con tabs por estado |
| `src/app/(app)/admin/eventos/nuevo/page.tsx` | crear | Form de creación |
| `src/app/(app)/admin/eventos/actions.ts` | crear | `createEvento`, `deleteEvento` |
| `src/app/(app)/admin/eventos/[id]/page.tsx` | crear | Detalle inline (metadata + estado + actividades) |
| `src/app/(app)/admin/eventos/[id]/actions.ts` | crear | `updateMetadata`, `transicionarEstado`, `addActividad`, `updateActividad`, `deleteActividad`, `reorderActividad` |
| `src/components/admin/eventos/EventoCreateForm.tsx` | crear | Form de creación |
| `src/components/admin/eventos/EventoMetadataForm.tsx` | crear | Editor de metadata |
| `src/components/admin/eventos/EventoEstadoControls.tsx` | crear | Botones de transición de estado + barra de pesos |
| `src/components/admin/eventos/ActividadesList.tsx` | crear | Header + lista + form de agregar |
| `src/components/admin/eventos/ActividadRow.tsx` | crear | Fila editable con reordenamiento |
| `src/components/admin/eventos/AddActividadForm.tsx` | crear | Form para agregar actividad |
| `src/components/admin/eventos/DeleteEventoForm.tsx` | crear | Botón eliminar (solo BORRADOR) |
| `src/app/(app)/admin/page.tsx` | modificar | Tarjeta nueva en landing |
| `src/components/admin/AdminNav.tsx` | modificar | Entrada "Eventos" en sub-nav |
| `src/messages/es.json` | modificar | Namespace `admin.eventos` |

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm test          # tests del repositorio en verde
pnpm prisma migrate status   # migración aplicada
pnpm build         # build exitoso
```

### Verificación manual end-to-end

Pre-requisito: distrito con ADMIN logueado, plantillas de Plan 5 ya existen (no se usan en Plan 6a, pero confirma que no hay regresiones).

> **Nota de comportamiento del indicador de pesos**: el indicador en `EventoEstadoControls` recibe `actividades` como props del Server Component. **Solo se actualiza después de guardar una actividad** (click "Guardar" en la fila) y esperar el soft refresh que dispara `revalidateTag`. No actualiza reactivamente mientras se edita el input del peso. El indicador secundario en el header de la sección "Actividades" (`X% / 100%`) tiene el mismo comportamiento. Ambos muestran los valores con 2 decimales (`toFixed(2)`).

**Escenario 1 — Crear evento simple**:
1. `/admin` → click tarjeta "Eventos activos" (valor: 0) → vacío.
2. Click "+ Nuevo evento".
3. Nombre: "Jornada Distrital 2026". Lugar: "Parque Central". Fecha de inicio: 2026-08-15.
4. Submit → redirige a `/admin/eventos/[id]`.
5. Header muestra: "Jornada Distrital 2026", badge "Borrador", "15 ago 2026", lugar.
6. Sección "Estado del evento" muestra línea del tiempo con BORRADOR activo. Botón "Activar evento" deshabilitado con tooltip "Configurá actividades que sumen 100% antes de activar".
7. Header de sección "Actividades" muestra "0.00% / 100%" (ámbar). Sección de pesos en `EventoEstadoControls` muestra "Pesos asignados: 0.00% de 100%" con barra vacía y texto "Faltan 100.00% por asignar".

**Escenario 2 — Agregar actividades válidas**:
1. En `AddActividadForm`, agregar (cada submit recarga la página vía soft refresh):
   - "Carrera de relevos", tipo Competición, peso 30.
   - "Construcción de balsa", tipo Construcción, peso 45.
   - "Almuerzo de patrulla", tipo Cocina, peso 25.
2. La lista muestra las 3 filas en orden 1/2/3. Header de sección muestra "100.00% / 100%" en verde. Indicador de pesos en `EventoEstadoControls` muestra "Pesos asignados: 100.00% de 100%", barra verde, texto "Pesos completos".
3. Botón "Activar evento" se habilita (ya no está deshabilitado).

**Escenario 3 — Reordenar y editar actividad**:
1. Click ▼ en "Carrera de relevos" → soft refresh → baja a posición 2 (queda "Construcción de balsa" primero).
2. Recargar página manualmente → orden persistido en DB.
3. En la fila "Almuerzo de patrulla", editar el campo de peso a 20. El botón "Guardar" aparece (fila dirty). Click "Guardar" → soft refresh → header muestra "95.00% / 100%" (ámbar). Botón "Activar evento" se deshabilita; tooltip muestra "Configurá actividades que sumen 100% antes de activar". Indicador de pesos muestra "Faltan 5.00% por asignar".
4. Editar el peso de vuelta a 25 → "Guardar" → soft refresh → header vuelve a "100.00% / 100%" verde. Botón "Activar evento" se habilita.

**Escenario 4 — Activar evento (transición BORRADOR → ACTIVO)**:
1. Click "Activar evento" → submit directo (sin diálogo de confirmación).
2. Soft refresh: estado cambia a ACTIVO. Badge del header cambia a verde "Activo". Línea del tiempo muestra BORRADOR ✓ → ACTIVO activo. Botón principal cambia a "Cerrar evento". El indicador de pesos (solo visible en BORRADOR) desaparece.
3. La sección "Acciones peligrosas" desaparece (solo visible en BORRADOR).
4. En `/admin` → tarjeta "Eventos activos" muestra 1.

**Escenario 5 — Activar con pesos inválidos (defensa en profundidad)**:
1. Crear evento "Test pesos". Agregar 1 actividad con peso 80.
2. El botón "Activar" está deshabilitado client-side. Para forzar la validación server-side, usar DevTools → Network → copiar el request del form y replay con los hidden inputs correctos, o ejecutar la action directamente desde la consola del servidor.
3. Server retorna `BusinessError("PESOS_INVALIDOS", { sumaActual: 80, faltante: 20 })`.
4. UI muestra panel rojo: "Los pesos de las actividades deben sumar 100%. Suma actual: 80.00%, falta: 20.00%".
5. Estado sigue en BORRADOR.

**Escenario 6 — Cerrar evento (transición ACTIVO → CERRADO)**:
1. En "Jornada Distrital 2026" (ACTIVO), click "Cerrar evento" → submit directo.
2. Soft refresh: estado cambia a CERRADO. Badge "Cerrado" (ámbar). `closedAt` seteado (verificable en DB con `SELECT "closedAt", "activatedAt" FROM "Evento" WHERE id = '...';`).
3. Botón principal cambia a "Publicar evento (Plan 7)" (deshabilitado). Debajo del botón aparece el texto "Disponible en Plan 7".

**Escenario 7 — Eliminar evento BORRADOR**:
1. Crear evento "Borrador a borrar" con 0 actividades.
2. Sección "Acciones peligrosas" muestra botón "Eliminar evento".
3. Click → muestra confirmación inline con texto "¿Eliminar el evento 'Borrador a borrar'? Esta acción es irreversible y borra también las actividades." + botones "Sí, eliminar" / "Cancelar". Click "Sí, eliminar".
4. Redirige a `/admin/eventos`. Evento no aparece en el listado.

**Escenario 8 — Eliminar evento NO BORRADOR (defensa)**:
1. En "Jornada Distrital 2026" (CERRADO), la sección "Acciones peligrosas" no se renderiza (solo aparece cuando `estado === "BORRADOR"`).
2. Para verificar la defensa server-side: enviar manualmente un POST a `deleteEventoAction` con el id del evento CERRADO (ej. via un formulario construido en DevTools).
3. Server retorna `BusinessError("NO_DELETABLE", { estadoActual: "CERRADO" })` → UI mostraría panel rojo "Solo se pueden eliminar eventos en estado Borrador".

**Escenario 9 — Validación de fechas**:
1. Crear evento "Multi-día test". Activar toggle "Evento de varios días". fechaInicio: 2026-08-15, fechaFin: 2026-08-13.
2. Submit → error "La fecha de fin debe ser igual o posterior a la fecha de inicio" (validación Zod en la action; el form muestra el error bajo el campo fechaFin).
3. Cambiar fechaFin a 2026-08-17 → ok. Detalle muestra "15–17 ago 2026" (mismo mes: compacto; meses distintos: rango completo).

**Escenario 10 — Slug autogenerado y colisión**:
1. Crear evento "Jornada Distrital 2026" → slug `jornada-distrital-2026` (generado server-side, no visible en UI).
2. Crear segundo evento con el mismo nombre → slug `jornada-distrital-2026-2`.
3. Verificar en DB: `SELECT nombre, slug FROM "Evento" ORDER BY "createdAt" DESC LIMIT 5;`

**Escenario 11 — Filtros del listado**:
1. Crear eventos en distintos estados (3 BORRADOR, 1 ACTIVO, 1 CERRADO).
2. Tab "Todos" muestra los 5.
3. Tab "Borradores" → URL cambia a `?estado=BORRADOR`, muestra 3. Tab "Activos" → `?estado=ACTIVO`, muestra 1. Tab "Cerrados" → `?estado=CERRADO`, muestra 1.
4. Cada tarjeta muestra nombre, badge de estado, fecha, lugar (si existe), count de actividades y porcentaje de pesos.

**Escenario 12 — Reordenar con conflicto de unique**:
1. Crear evento con 3 actividades (pesos 40/35/25).
2. Click ▼ en la primera → soft refresh → la primera y segunda intercambian posición sin violación de `@@unique([eventoId, orden])` (gracias al paso temporal `orden = -1`).
3. Click ▼ repetidamente en la misma actividad hasta que llega a la última posición → funciona sin errores.
4. Click ▲ en la última → vuelve al orden anterior.

**Escenario 13 — Tenant isolation**:
1. Loguear como admin de un segundo distrito.
2. Crear evento con nombre "Jornada Distrital 2026" → slug `jornada-distrital-2026` (sin sufijo, porque el constraint es `(organizationId, slug)` y este org no tiene ese slug).
3. Listado de cada distrito muestra solo sus propios eventos.

**Escenario 14 — Auditoría**:
```sql
SELECT action, metadata, "createdAt"
FROM "AuditLog"
WHERE "organizationId" = '<tu-org-id>'
  AND action LIKE 'evento%'
ORDER BY "createdAt" DESC
LIMIT 30;
```
Confirmar presencia de: `evento.created`, `evento.updated`, `evento.deleted`, `evento.transitioned` (metadata: `{from, to}`), `evento.actividadAdded`, `evento.actividadUpdated`, `evento.actividadDeleted`, `evento.actividadReordered` (metadata: `{direction, fromOrden, toOrden}`).

**Escenario 15 — Edición de metadata en estado ACTIVO/CERRADO**:
1. En "Jornada Distrital 2026" (ACTIVO o CERRADO), editar lugar a "Centro Comunitario" en `EventoMetadataForm`. Click "Guardar cambios".
2. Soft refresh → persistido. El slug original no cambia (inmutable post-creación).
3. Confirmar que la metadata sigue editable en cualquier estado en Plan 6a (lock real es Plan 6b).

### Criterios de aceptación

- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en limpio.
- [x] ADR-0003 escrito y mergeado.
- [x] Master plan (`00-master-plan.md`) actualizado con la jerarquía Evento → Actividad → Posta.
- [x] `docs/README.md` y `CLAUDE.md` listan ADR-0003 y Plan 6a.
- [x] Migración Prisma se aplica sin warnings.
- [x] Crear evento funciona, slug se genera y resuelve colisiones.
- [x] Edición de metadata persiste sin reset de UI por `revalidateTag` (validar patrón inline editable).
- [x] Validación de fechas (`fechaFin >= fechaInicio`) bloquea con mensaje claro.
- [x] CRUD de actividades funciona: agregar, editar inline, reordenar, eliminar.
- [x] Reordenar respeta `@@unique([eventoId, orden])` (sin violación de constraint).
- [x] Indicador de "Pesos asignados X% de 100%" se actualiza al editar pesos.
- [x] Botón "Activar evento" se habilita solo cuando suma === 100 ± 0.01 y hay >= 1 actividad.
- [x] `transicionarEstado` valida pesos al activar y rechaza transiciones inválidas.
- [x] `transicionarEstado` setea `activatedAt`/`closedAt`/`publishedAt` correctamente.
- [x] Eliminar evento solo funciona en BORRADOR; en otros estados retorna `BusinessError("NO_DELETABLE")`.
- [x] `isEventoLocked` retorna `false` en Plan 6a (preparado para Plan 6b).
- [x] Tarjeta `/admin` muestra count correcto de eventos ACTIVO.
- [x] `AdminNav` incluye entrada "Eventos".
- [ ] Tenant isolation verificada con dos distritos. *(verificación manual pendiente — cubierta por tests unitarios)*
- [x] Todos los textos visibles vienen de `src/messages/es.json` namespace `admin.eventos`.
- [ ] Audit log registra todas las mutaciones esperadas. *(verificación manual pendiente — cubierta en tests del repo)*

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Postgres `Decimal(5,2)` + suma con tolerancia tiene edge cases (ej: `0.1 + 0.2`) | Media | Usar siempre `Decimal` (de `@prisma/client/runtime`) para la sumatoria, nunca `Number`. Tolerancia de 0.01 absorbe artefactos típicos. Cubrir con tests Vitest los casos límite (99.99 ok, 99.98 falla, 100.01 ok, 100.02 falla). |
| Slug autogenerado colisiona repetidamente (admin crea muchos eventos con el mismo nombre) | Baja | Loop con `findFirst` antes del create, sufijo numérico iterativo (`-2`, `-3`, ...). Si llega a `-100`, abortar con `BusinessError("NOMBRE_DUPLICADO")` y pedir al admin que renombre. |
| Reordenamiento de actividades viola `@@unique([eventoId, orden])` durante el swap | Media | Patrón consolidado de Plan 5: paso 1 setea uno a `orden = -1`; paso 2 setea el otro al orden del primero; paso 3 setea el primero al orden del segundo. Test específico cubre el swap. |
| El admin activa el evento sin querer y no puede revertir | Alta | Confirm dialog explícito antes de transición a ACTIVO con copy "Una vez activado, no se puede volver a borrador". En Plan 6a la consecuencia real es solo "no se puede eliminar"; en Plan 6b será "no se pueden editar actividades". Documentado en el copy. |
| El usuario espera poder reabrir CERRADO → ACTIVO | Media | Transiciones unidireccionales explícitas en master plan y ADR-0003. Plan 8 (correcciones post-cierre) reabrirá planillas individuales, no el evento. UI deja claro "estado terminal" cuando aplica. |
| El cambio de master plan rompe entendimiento de planes futuros (4b, 6, 7) | Media | ADR-0003 tiene sección "Planes afectados" que enumera los cambios. Master plan actualizado con notas en cada plan dependiente. Cuando se ejecute Plan 6b se referenciará explícitamente al ADR. |
| Edición de metadata en estado ACTIVO/CERRADO se considera bug | Baja | Documentado: en Plan 6a la metadata sigue editable en cualquier estado porque `isEventoLocked` retorna `false`. Plan 6b o Plan 7 evaluará si bloquear cambios de fecha post-activación. Decisión diferida explícitamente. |
| `pesoRelativo` con 0 o > 100 al crear actividad individual | Baja | Validación Zod: `0.01 ≤ peso ≤ 100`. La suma se valida solo al activar. Una actividad con peso 100 sola es válida; admin agrega más solo si quiere repartir. |
| `revalidateTag` se llama en mutación de actividad y resetea inputs | Baja | Patrón de Plan 5 consolidado: estado dual sincronizado desde `actionState`, no desde props. Soft refresh actualiza el Server Component pero no pisa los `useState` del cliente. Cubierto por escenarios manuales 3 y 15. |
| Confusión entre `fechaInicio` única vs `fechaFin` opcional | Baja | UI con toggle explícito "Evento de varios días" que muestra/oculta el campo. Por defecto desactivado. Validación clara. |
| Plan 6b necesita un campo en Evento que Plan 6a no anticipó | Media | `isEventoLocked` deferred es el principal puente. Si Plan 6b necesita más (ej: `juezAsignacionesCompletas`), se agrega entonces sin retro-modificar Plan 6a. Schema actual es minimal y extensible. |
| El admin elimina actividades en evento ACTIVO pensando que sigue editable (lección Plan 6b) | Media | En Plan 6a el lock es `false`, así que se puede. Cuando Plan 6b lo active, la action retornará `BusinessError("EVENTO_LOCKED")`. UI mostrará el botón deshabilitado con tooltip. Documentado en ADR-0002 / convención repos. |

---

## Antes de ejecutar — checklist

- [ ] Plan 5 mergeado en `main`, todos los tests verdes.
- [ ] Branch limpio, `git status` sin pendientes.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en `main`.
- [ ] Decisión confirmada de **abrir ADR-0003 en este plan** (no diferir a Plan 6b).
- [ ] Confirmar que Prisma 7 + adapter-pg manejan `@db.Decimal(5,2)` sin fricción (smoke test trivial antes del feature work principal — análogo al smoke de `Decimal[]` en Plan 5).
- [ ] Tener al menos 1 distrito con seed corrido para Escenario 13 (tenant isolation).
- [ ] Tener `slugify` reusable: si ya existe en `src/lib/`, usarlo; si no, crearlo y testearlo en este plan.

---

## Proceso de planeación (educativo)

Este plan se redactó con Claude Opus en plan mode siguiendo el workflow Opus/Sonnet. Resumen del intercambio:

1. **Lectura previa**: el agente leyó `CLAUDE.md`, el master plan, el plan 5 completo (incluyendo lecciones de cache y filas editables inline), el `prisma/schema.prisma`, el repositorio `score-template.repo.ts` como referencia, ADR-0002, y la estructura de `/admin`. Detectó que **`Evento`, `Actividad` y los enums asociados no existen en el schema actual**, así que el plan introduce los modelos por primera vez vía migración nueva.

2. **Decisiones planteadas en cinco preguntas iniciales (sin tools)**:
   - Estados del ciclo de vida (3 vs 4) — **el usuario pidió clarificar la diferencia entre ACTIVO y PUBLICADO** antes de decidir. Tras la explicación (ACTIVO=scoring en curso/no público; CERRADO=datos congelados/no público; PUBLICADO=link público emitido) eligió **4 estados**.
   - Validación del 100% — usuario eligió **hard gate al pasar a ACTIVO**.
   - Lock al activar — usuario eligió **helper diferido a Plan 6b** retornando `false` en este plan.
   - Tipo de pesoRelativo — usuario eligió **`Decimal(5,2)`** con tolerancia 0.01 en la suma.
   - El usuario pidió usar la herramienta de preguntas para todo, así que la segunda tanda fue vía AskUserQuestion.

3. **Segunda tanda con AskUserQuestion (4 preguntas)**:
   - Tipo de actividad: enum `ActividadTipo` separado (no reusar `ScoreTemplateCategoria`).
   - Fecha del evento: `fechaInicio` + `fechaFin` opcional (multi-día desde el inicio).
   - Eliminación: hard delete solo en BORRADOR (ACTIVO/CERRADO/PUBLICADO bloqueados).
   - UX del detalle: editor inline en `/admin/eventos/[id]` (sin sub-ruta).

4. **Asunciones tomadas sin preguntar** (porque las recomendaciones del primer mensaje no fueron contradichas):
   - `slug` único por organización, autogenerado, inmutable post-creación.
   - `lugar: String?` opcional, max 200.
   - `descripcion: String?` opcional, max 1000.
   - `orden: Int` explícito en Actividad con botones ↑/↓ (consistente con criterios de Plan 5).
   - Timestamps `activatedAt`, `closedAt`, `publishedAt` separados del enum para auditoría implícita.
   - Tarjeta `/admin` cuenta solo eventos `ACTIVO` (basado en el prompt original "count de eventos activos").

5. **Decisiones que el plan tomó solo** (sin preguntar, por convención o por obviedad):
   - Capa de repositorios siguiendo ADR-0002 (lectura con `unstable_cache`, escritura transaccional con audit log).
   - `revalidateTag` en todas las mutaciones que persisten DB (lección de Plan 5 #16).
   - Filas editables inline siguiendo el patrón de Plan 4 (estado dual `current` / `saved`, sync desde `actionState` no desde props).
   - `BusinessError(code, meta?)` para errores de negocio (CLAUDE.md punto 19).
   - Botones ↑/↓ en lugar de drag-and-drop (mobile-friendly, sin librerías).
   - Constraint `@@unique([eventoId, orden])` y reorden con valor temporal `-1` (mismo patrón que Plan 5).
   - Transiciones unidireccionales sin reverso (master plan + ADR-0003).
   - Filtros del listado URL-driven (search params), no estado de cliente.
   - Tabla declarativa `validTransitions` en lugar de switch case o XState.

6. **Reuso explícito de patrones de Plans 4 y 5**: estructura de rutas `/admin/...`, capa de repositorios, audit log co-localizado, `useActionState` + `revalidateTag` granular, fila editable con estado `saved`, helper de slug, `BusinessError` con códigos. Esto reduce la decisión arquitectónica y deja al ejecutor (Sonnet) seguir un esqueleto conocido.

7. **Cambio de dominio formalizado**: el cambio `Evento → Posta` → `Evento → Actividad → Posta` se documentó vía ADR-0003 dentro de este mismo plan, con actualización del master plan en el primer commit. Razón: tener divergencia entre master plan y schema real confunde a futuros lectores; cerrar la deuda documentada apenas surge.

8. **Alineación con CLAUDE.md**: cada decisión técnica se contrastó contra las convenciones del proyecto (tenant isolation vía repos + `forOrg` cuando aplica, naming bilingüe — `Evento`/`Actividad` en español del dominio, server actions sobre API routes, Zod en el borde, copy en `es.json`, `BusinessError` para errores de negocio, repositorios para todo lo de DB, `cuid2` en IDs, `Decimal` para puntajes/pesos). Sin contradicciones.

---

## Preguntas abiertas para el usuario

Ninguna decisión arquitectónica queda pendiente. Tareas operacionales antes (o durante) la ejecución:

1. Confirmar que Prisma 7 + adapter-pg manejan `@db.Decimal(5,2)` sin fricción. Smoke test antes del feature work principal.
2. Confirmar si el helper `slugify` ya existe en otro repo (Plan 1 lo usó para `Organization.slug`, Plan 4 para `GrupoScout.slug`). Si existe, reusar; si no, extraer a `src/lib/slug.ts` durante este plan para evitar duplicación.
3. Si durante la ejecución el ADR-0003 necesita refinarse con detalles del scoring (Plan 6b), aceptar que el ADR puede actualizarse en planes futuros (ADRs son vivos hasta cerrarse explícitamente como `Status: Superseded`).

---

## Commits asociados

| Hash | Mensaje |
|---|---|
| `61cbdd8` | `docs(adr): jerarquía Evento → Actividad → Posta y actualización del master plan` |
| `a853fc3` | `feat(schema): eventos con estados y actividades con peso porcentual` |
| `5b6c901` | `feat(repo): evento con máquina de estados y actividades con pesos` |
| `67ce82e` | `feat(admin): eventos con CRUD inline, actividades y máquina de estados` |

> Los commits del plan se consolidaron en 4 en lugar de 8: documentación, schema, repositorio+tests+helpers, y UI completa (listado + crear + detalle + nav + landing + messages en un único commit atómico).

---

## Lecciones aprendidas

### Lección #1 — `Decimal` de Prisma no puede importarse en Client Components

**Problema:** `EventoEstadoControls.tsx` importaba `Decimal` de `@prisma/client/runtime/client` para sumar los `pesoRelativo` de las actividades. Esto rompía el build con `UnhandledSchemeError: node:async_hooks` porque el runtime de Prisma tiene dependencias de módulos Node.js (`node:crypto`, `node:fs`, `node:async_hooks`, etc.) que webpack no puede resolver en el bundle del navegador.

**Solución:** En Client Components, reemplazar `Decimal` por `parseFloat()` para cálculos de display. La aritmética exacta con `Decimal` solo se necesita en el servidor (repositorios, server actions) donde el runtime Node.js está disponible.

**Regla derivada:** **Nunca importar `@prisma/client/runtime/client` en archivos `"use client"`**. Si un componente cliente necesita hacer aritmética con valores `Decimal`, recibir los valores como `string` y operar con `parseFloat` (para display) o con una librería decimal pura (sin dependencias Node.js) si se necesita precisión estricta. Dado que Plan 6a solo necesita mostrar el porcentaje y habilitar/deshabilitar un botón, `parseFloat` con tolerancia `± 0.01` es suficiente y correcto.

**Archivos afectados:** `EventoEstadoControls.tsx`, `page.tsx` del listado y del detalle — todos usaban `Decimal` innecesariamente para sumas de display.

---

### Lección #2 — `vi.mock` con fábrica y variables de módulo externas requiere `vi.hoisted` en Vitest 4.x

**Problema:** El test preexistente `src/lib/invitations.test.ts` definía `const mockUpdateMany = vi.fn()` antes del bloque `vi.mock(...)`, asumiendo que la variable ya estaría inicializada cuando se ejecutara la fábrica del mock. En Vitest 4.x este patrón falla con `ReferenceError: Cannot access 'mockUpdateMany' before initialization` porque `vi.mock` se hoistea al tope del archivo durante la transformación, antes de que la variable sea declarada.

**Solución:** Usar `vi.hoisted(() => ({ mockFn: vi.fn() }))` para declarar los mocks y desestructurar el resultado antes del `vi.mock`. `vi.hoisted` también se hoistea, pero antes que `vi.mock`, garantizando que las variables estén inicializadas cuando la fábrica del mock las referencia.

```ts
// ✅ Correcto en Vitest 4.x
const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }))
vi.mock("@/lib/db", () => ({ prisma: { tabla: { method: mockFn } } }))

// ❌ Falla en Vitest 4.x
const mockFn = vi.fn()
vi.mock("@/lib/db", () => ({ prisma: { tabla: { method: mockFn } } }))
```

**Regla derivada:** **Siempre usar `vi.hoisted` para declarar mocks que se pasan como fábricas a `vi.mock`**. Este patrón se aplica a todos los tests futuros del proyecto (Plan 6b, 7, etc.). El test de `invitations.test.ts` fue corregido como parte de esta ejecución.
