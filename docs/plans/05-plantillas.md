# Plan 5 — Plantillas de puntaje (ScoreTemplate + TemplateCriterion)

> **Estado**: ✅ Completado (planeado 2026-05-01 con Opus, ejecutado 2026-05-02 con Sonnet).

---

## Contexto

Plan 4 cerró toda la administración del distrito (perfil, grupos scouts, invitaciones, memberships) consolidando además dos convenciones que este plan reusa: la **capa de repositorios** con `unstable_cache` + tags por organización (ADR-0002), y el patrón de **filas editables inline** sin `revalidateTag` cuando las mutaciones son de valores y no estructurales.

Plan 5 entrega la **biblioteca reusable de plantillas de puntaje** del distrito. Una plantilla describe cómo se evalúa una posta: qué criterios se puntúan (en modo `CRITERIOS`) o si se carga un único score (en modo `PUNTAJE_UNICO`), y con qué escala discreta (ej: 5/7/10) carga el juez. Es la pieza que después consume Plan 4b cuando el admin asigne plantillas a postas dentro de un evento.

**Importante — el schema actual NO contiene los modelos de este plan.** El roadmap original mencionaba "ScoreTemplate y TemplateCriterion como stubs en Plan 0b", pero la migración de Plan 0b solo creó las tablas de auth, distrito, grupos, invitaciones, memberships, MiembroScout y AuditLog. Plan 5 introduce los modelos de scoring por primera vez vía migración nueva.

**Caso de uso compuesto que el modelo soporta**: una posta competitiva donde el resultado principal es objetivo (ej: cronómetro, distancia) y se carga como puntaje único con escala 5/7/10, pero los jueces además evalúan aspectos cualitativos como espíritu scout, uniforme y respeto que NO afectan la calificación principal pero sí pueden romper empates al final del evento. Estos criterios cualitativos suelen tener una escala distinta (ej: 0–3). Plan 5 soporta esta combinación vía una **escala secundaria opcional para criterios DESEMPATE** y permitiendo criterios DESEMPATE en plantillas modo `PUNTAJE_UNICO`.

**Cambio de dominio detectado durante la planeación** (no se implementa en este plan, pero se documenta). El usuario clarificó que la jerarquía real del evento scout es:

```
Evento
└── Actividad (peso porcentual; suma 100% del evento)
    └── Posta (con plantilla asignada)
```

Tipos típicos de actividades: **competición** (varias postas chicas, encaja con `PUNTAJE_UNICO`), **construcción** (una "posta" gigante con peso alto, encaja con `CRITERIOS`), **cocina** (una posta por comida del día, encaja con `CRITERIOS`). El master plan modelaba `Evento → Posta` directamente, sin nivel intermedio. **Esto afectará Plan 4a/4b cuando lleguen** — habrá que abrir un ADR (`docs/adr/0003-jerarquia-evento-actividad-posta.md`) y actualizar el master plan. Plan 5 NO se afecta: las plantillas siguen siendo entidades del distrito indiferentes a si terminan asignadas a postas de cocina, construcción o competición. Sí motiva el campo `categoria` en `ScoreTemplate` y la existencia del modo `PUNTAJE_UNICO`.

---

## Alcance

### Incluye

- **Migración Prisma** que introduce: `ScoreTemplate`, `TemplateCriterion`, enums `ScoreTemplateModo`, `ScoreTemplateCategoria`, `TemplateCriterionTipo`. Sin breaking changes al resto del schema.
- **CRUD completo de plantillas** dentro de `/admin/plantillas`:
  - Crear plantilla con metadata (nombre, descripción, categoría, modo, escala de valores válidos).
  - Editar metadata, criterios (modo CRITERIOS), reordenar criterios.
  - Duplicar plantilla (clona criterios incluidos).
  - Archivar / desarchivar (soft delete con `archivedAt`).
  - Hard delete solo si la plantilla nunca fue usada (en este plan: siempre permitido, porque Posta no existe todavía).
- **Dos modos** (con criterios DESEMPATE permitidos en ambos):
  - `CRITERIOS`: la plantilla declara N criterios con tipo `PUNTUABLE` o `DESEMPATE`. Editor permite agregar / quitar / reordenar criterios.
  - `PUNTAJE_UNICO`: la plantilla declara un valor único (sin criterios PUNTUABLE) y, **opcionalmente, criterios DESEMPATE adicionales**. El juez carga el puntaje único + un valor por cada criterio DESEMPATE. Editor permite agregar criterios pero solo de tipo DESEMPATE.
- **Escala principal obligatoria** (`valoresValidos: Decimal[]`, mínimo 2 valores, ordenados ascendentemente, sin duplicados). Aplica al puntaje único (modo PUNTAJE_UNICO) o a los criterios PUNTUABLE (modo CRITERIOS).
- **Escala secundaria opcional para DESEMPATE** (`valoresValidosDesempate: Decimal[]?`, mismas reglas de validación). Si se define, los criterios DESEMPATE usan esa escala; si es `null`, heredan `valoresValidos`. Habilita el patrón típico "puntaje 5/7/10 + desempate 0/1/2/3".
- **Categorización con enum cerrado**: `COMPETICION | CONSTRUCCION | COCINA | OTRO`. Al elegir categoría en el form de creación, se sugieren defaults (modo + escala 5/7/10) editables.
- **Capa de repositorios** `src/repositories/score-template.repo.ts` con lecturas cacheadas (`unstable_cache` + tag `scoreTemplates:orgId`) y escrituras transaccionales con audit log co-localizado.
- **Audit log** en cada mutación (`scoreTemplate.created`, `.updated`, `.criterionAdded`, `.criterionUpdated`, `.criterionDeleted`, `.criterionReordered`, `.archived`, `.unarchived`, `.duplicated`, `.deleted`).
- **Tarjeta nueva en `/admin` landing** con count de plantillas activas.
- **Copy en español** centralizado en `src/messages/es.json` namespace `admin.plantillas`.
- **Tests Vitest** para el repositorio (creación, duplicación, validación de escala, archivado).
- **Helper `isTemplateLocked(templateId)`** preparado pero retornando siempre `false` en este plan (Plan 4b lo activará cuando exista Posta).

### NO incluye

- **Asignación de plantillas a postas** — Plan 4b. Plan 5 deja preparado el helper `isTemplateLocked` pero no hay forma de "usar" una plantilla todavía.
- **Cálculo de leaderboard, validación de "al menos 1 PUNTUABLE"** — Plan 4b/Plan 6. Plan 5 acepta plantillas en cualquier estado intermedio (incluso una `CRITERIOS` con 0 criterios). La validación de "plantilla lista para asignar a posta" sucede en Plan 4b.
- **Modelo `Actividad` y refactor de la jerarquía evento→actividad→posta** — se documenta como pendiente para Plan 4a (ver Contexto).
- **UI del juez para cargar valores de la escala** — Plan 5a.
- **Lock real al primer uso** — Plan 4b lo activa cuando `isTemplateLocked` cuente postas reales. Plan 5 deja la función puenteada.
- **Importación / exportación de plantillas** entre distritos.
- **Versionado de plantillas** (historial de cambios).
- **Vista de audit log** — la tabla se llena pero no se renderiza UI todavía.
- **Drag-and-drop** para reordenar criterios — botones ↑/↓ por fila.
- **Filtros avanzados** en el listado — solo filtros básicos por modo, categoría y archivadas (segmented control / tabs).
- **Paginación** — distrito típico tendrá < 50 plantillas. Carga completa.
- **Tests E2E con Playwright** — Vitest unit/integration del repositorio.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **Lock al primer uso**: una vez que la plantilla se asigna a una `Posta` (en Plan 4b), sus criterios, escala, modo y categoría quedan read-only. Solo `nombre`, `descripcion` y `archivedAt` siguen editables. | Snapshot por Posta al asignar (Posta clona criterios); editable libremente; lock parcial | Más simple que snapshot (no requiere modelo `PostaCriterion`), más seguro que editable libremente (los scores históricos no se rompen). El admin que necesita variar una plantilla ya usada puede **duplicar** y editar la copia. |
| 2 | **Dos escalas por plantilla**: `valoresValidos` (principal, obligatoria) + `valoresValidosDesempate` (opcional). La principal aplica al puntaje único o a criterios PUNTUABLE; la secundaria a criterios DESEMPATE. Si la secundaria es `null`, los DESEMPATE heredan la principal. | Una sola escala compartida (decisión inicial); escala por criterio individual | El caso real "puntaje 5/7/10 + desempate 0/1/2/3" no se puede expresar con una sola escala. Dos escalas mantiene la simplicidad (admin define máximo dos listas, no N) y resuelve el patrón competitivo más común. |
| 3 | **Lista discreta obligatoria, sin entrada libre** | Lista opcional (juez carga libre si no hay); flag por criterio | El uso scout típico es 5/7/10 o variantes. Forzar la escala evita errores de carga, simplifica la UI del juez (botones fijos), y elimina ambigüedad de validación. Si más adelante aparece un caso de "tiempo en cronómetro", se evalúa entonces. |
| 4 | **`PUNTAJE_UNICO` como modo separado del schema** (`modo: CRITERIOS \| PUNTAJE_UNICO`), con criterios DESEMPATE permitidos como complemento opcional | Modelar como caso particular de CRITERIOS con un solo criterio "Total"; PUNTAJE_UNICO sin criterios bajo ninguna circunstancia; diferir PUNTAJE_UNICO | Caso de uso real y distinto: postas de competición no necesitan desglose en el puntaje principal. Permitir DESEMPATE adicionales habilita el patrón compuesto "puntaje objetivo + evaluación cualitativa de espíritu scout/uniforme/respeto". Validación: si `modo = PUNTAJE_UNICO` y hay criterios, todos deben ser DESEMPATE. |
| 5 | **Soft delete con `archivedAt`** | Hard delete cuando no está en uso; cascade | Las plantillas "viejas" se archivan para limpiar la lista de creación de postas pero quedan accesibles para reportes históricos. Consistente con el patrón que probablemente queremos para eventos. |
| 6 | **Hard delete solo si nunca fue usada** | Solo soft delete; cascade peligroso | En Plan 5 (sin Posta), siempre se permite hard delete. La condición real se refuerza en Plan 4b: si la plantilla tiene postas asignadas, hard delete devuelve `BusinessError("IN_USE")`. |
| 7 | **Categoría con enum cerrado** `COMPETICION \| CONSTRUCCION \| COCINA \| OTRO` | Texto libre; sin categoría | Habilita filtros confiables, defaults sugeridos al crear, y futura asistencia para asignar plantillas a actividades correctas. Si aparece otra categoría, se agrega al enum (migración trivial). |
| 8 | **`valoresValidos: Decimal[]`** (Postgres scalar list, mapeo a `numeric[]`) | `Json` con array de números; tabla aparte `TemplateScaleValue` | Postgres soporta nativamente arrays de Decimal. Lectura/escritura simple, validación con Zod, sin tabla extra. El array es siempre pequeño (≤10 valores típicos). Si Prisma 7 tuviera limitaciones con `Decimal[]`, fallback a `Json` documentado. |
| 9 | **`isTemplateLocked(templateId)` deferred a Plan 4b** | Implementar lock con denormalización (`firstUsedAt: DateTime?`) en Plan 5 | Plan 5 no tiene Posta, así que el lock nunca dispara. Definimos la función ahora retornando `false`, y Plan 4b la actualiza para `prisma.posta.count(...) > 0`. Sin denormalización innecesaria. |
| 10 | **Reordenar criterios con botones ↑/↓** (servidor recalcula `orden`) | Drag-and-drop; campo de orden manual editable | Mobile-friendly sin librerías. La acción es atómica (intercambio de dos `orden` en transacción). El admin típico tendrá ≤10 criterios. |
| 11 | **Crear plantilla en una sola pantalla** (form server-rendered con todos los campos meta + array dinámico de criterios cuando modo = CRITERIOS) | Wizard multi-paso con redirect intermedio; pre-crear y redirigir al editor | Una sola pantalla con `useActionState` es más rápida y predecible. La complejidad del form se contiene en un Client Component dedicado (`TemplateForm`). |
| 12 | **Duplicación: clona metadata + criterios, prefijo "(copia)" en nombre** | Solo metadata; redirect al editor con datos pre-rellenados sin persistir | Predecible: el resultado es una plantilla nueva persistida lista para editar. Al duplicar una plantilla locked, la copia arranca **unlocked** porque es una entidad distinta. |
| 13 | **Validaciones de escala con Zod**: array de Decimal positivos, length ≥ 2, ordenado ascendente, sin duplicados | Validar solo length y permitir cualquier orden | Forzar ascendente garantiza que la UI del juez en Plan 5a pueda renderizar los botones en orden natural sin re-ordenar en cliente. |
| 14 | **Defaults sugeridos por categoría** al elegir en el form de creación: COMPETICION → modo=`PUNTAJE_UNICO`, escala=`[5,7,10]`; CONSTRUCCION/COCINA → modo=`CRITERIOS`, escala=`[5,7,10]` | Sin defaults; categoría como campo independiente | Reduce la fricción inicial. Los defaults son sugerencias, todos editables. Documentado como "ayuda al admin", no obligatorio. |
| 15 | **Constraint `@@unique([organizationId, nombre])`** para evitar dos plantillas con el mismo nombre en el mismo distrito | Permitir duplicados; nombre + categoría unique | Evita confusión en la UI cuando el admin crea variantes. Si necesita variantes, sufija manualmente ("Cocina v2"). El `nombre` es display-friendly, no hay slug interno. |
| 16 | **`revalidateTag` solo para mutaciones estructurales** (crear, archivar, desarchivar, duplicar, eliminar plantilla; agregar/eliminar criterio) | Llamar `revalidateTag` siempre | Convención de Plan 4 (lección aprendida #1). Mutaciones de valores que no cambian la estructura de la lista (renombrar criterio, cambiar tipo, reordenar) no llaman `revalidateTag`: devuelven los valores confirmados y el cliente actualiza su estado local. |
| 17 | **Errores de negocio con `BusinessError(code, meta?)`** capturados en la action y traducidos a mensajes de usuario | `throw` genérico; mezclar return + throw | Convención cerrada en Plan 4 (CLAUDE.md punto 19). Códigos previstos: `NOMBRE_DUPLICADO`, `ESCALA_INVALIDA`, `CRITERIO_NO_ENCONTRADO`, `MODO_INCOMPATIBLE`, `IN_USE` (este último activable cuando llegue Plan 4b). |
| 18 | **Auditoría desde el primer commit** | Aplicar audit en una segunda pasada | Mismo patrón que Plan 4. Cada mutación incluye `auditLog.create` co-localizado en la misma `prisma.$transaction`. |
| 19 | **Validación cruzada modo ↔ criterios**: si `modo = PUNTAJE_UNICO`, todos los criterios deben ser `DESEMPATE`; si hay criterios `PUNTUABLE`, modo debe ser `CRITERIOS`. | Validación a nivel de FK/check constraint en DB; permitir cualquier combinación | La regla es de aplicación, no estructural. Validar en el repositorio/action antes de cada `addCriterio` y antes de cambiar `modo`. Mensaje de error claro: "Las plantillas con puntaje único solo aceptan criterios de desempate". |
| 20 | **Cambio de modo CRITERIOS → PUNTAJE_UNICO con criterios PUNTUABLE existentes**: bloquear con `BusinessError("MODO_INCOMPATIBLE")` listando los criterios bloqueantes. | Eliminar automáticamente los PUNTUABLE; pedir confirmación destructiva | Más seguro y predecible. El admin debe eliminar los PUNTUABLE manualmente antes de cambiar de modo. UI muestra los criterios conflictivos. |

---

## Modelo de datos

### Schema Prisma (a agregar)

```prisma
// ──────────────────────────────────────────────────────────────
// Enums de scoring
// ──────────────────────────────────────────────────────────────

enum ScoreTemplateModo {
  CRITERIOS
  PUNTAJE_UNICO
}

enum ScoreTemplateCategoria {
  COMPETICION
  CONSTRUCCION
  COCINA
  OTRO
}

enum TemplateCriterionTipo {
  PUNTUABLE
  DESEMPATE
}

// ──────────────────────────────────────────────────────────────
// ScoreTemplate — biblioteca de plantillas reusables del distrito
// ──────────────────────────────────────────────────────────────

model ScoreTemplate {
  id                       String                 @id @default(cuid(2))
  organizationId           String
  nombre                   String
  descripcion              String?
  modo                     ScoreTemplateModo
  categoria                ScoreTemplateCategoria
  valoresValidos           Decimal[]              // principal — aplica a puntaje único o criterios PUNTUABLE. Mínimo 2, ordenado ascendente, sin duplicados (validación en código).
  valoresValidosDesempate  Decimal[]              // secundaria — aplica a criterios DESEMPATE. Si vacía (`[]`), los DESEMPATE heredan `valoresValidos`. Mismas reglas si tiene contenido.
  archivedAt               DateTime?
  createdAt                DateTime               @default(now())
  updatedAt                DateTime               @updatedAt

  organization Organization        @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  criterios    TemplateCriterion[]

  @@unique([organizationId, nombre])
  @@index([organizationId])
  @@index([organizationId, archivedAt])
}

// ──────────────────────────────────────────────────────────────
// TemplateCriterion — criterio dentro de una plantilla CRITERIOS
// ──────────────────────────────────────────────────────────────

model TemplateCriterion {
  id          String                @id @default(cuid(2))
  templateId  String
  nombre      String
  descripcion String?
  tipo        TemplateCriterionTipo
  orden       Int
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt

  template ScoreTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)

  @@unique([templateId, orden])
  @@index([templateId])
}
```

### Cambios en `Organization`

```prisma
model Organization {
  // ... campos existentes ...
  scoreTemplates ScoreTemplate[]   // NUEVA relación
}
```

### Notas sobre el schema

- **`Decimal[]`**: Postgres soporta arrays de `numeric` nativamente. Prisma 7 los expone como `Decimal[]` en el cliente. Si durante la migración aparece algún issue con el adapter `@prisma/adapter-pg`, fallback a `Json` documentado como riesgo.
- **`valoresValidosDesempate` como `Decimal[]` no-nullable inicializado en `[]`**: Prisma no permite `?` en arrays escalares (Postgres no distingue array nulo de array vacío sin contortion). Convención: `[]` significa "heredar `valoresValidos`"; cualquier array no vacío significa "usar esta escala secundaria". Validación Zod aplica las mismas reglas (length ≥ 2, ordenado, sin duplicados) **solo si el array es no vacío**.
- **`@@unique([templateId, orden])`** garantiza orden contiguo y único. El reordenamiento (intercambio de dos posiciones) requiere update transaccional con un valor temporal (ej: `orden = -1` durante el swap) para no violar el constraint.
- **`onDelete: Cascade`** en `TemplateCriterion → ScoreTemplate` permite que borrar una plantilla borre sus criterios automáticamente.
- **`@@unique([organizationId, nombre])`** — case-sensitive por default. El nombre se almacena tal como lo ingresó el admin.

### Migración SQL relevante

Los pasos críticos son `CREATE TYPE` para los enums, `CREATE TABLE` con `numeric[]` para `valoresValidos`, índices y FK. Prisma 7 genera todo desde el schema vía `prisma migrate dev --name add_score_templates`.

---

## Estructura de rutas

```
/(app)/
└── admin/
    ├── ... (Plan 4)
    └── plantillas/                       ← NUEVO en Plan 5
        ├── page.tsx                      ← lista con filtros (modo, categoría, archivadas)
        ├── nueva/page.tsx                ← form de creación
        └── [id]/
            ├── page.tsx                  ← vista detalle + editor
            └── actions.ts                ← acciones específicas de la plantilla
```

No se introduce ruta pública. Todo bajo el guard `requireRole(['ADMIN'])` ya establecido en `(app)/admin/layout.tsx`.

---

## Implementación

### Paso 1 — Schema y migración

Archivos:
- `prisma/schema.prisma` — agregar enums + modelos + relación inversa en `Organization`.
- `prisma/migrations/<timestamp>_add_score_templates/migration.sql` — generado por `prisma migrate dev --name add_score_templates`.

Verificación: `pnpm prisma generate` corre limpio. `pnpm prisma migrate dev` crea las tablas en la DB local. `psql` confirma columnas y constraints.

Commit: `feat(schema): score templates con criterios y escala discreta`

---

### Paso 2 — Cache tag y errores de negocio

Archivos:
- `src/repositories/cache-tags.ts` — agregar `scoreTemplates: (orgId) => 'scoreTemplates:orgId'`.
- Si no existe, asegurar que `BusinessError` está en `src/lib/errors.ts` (ya existe desde Plan 4).
- Códigos nuevos previstos: `NOMBRE_DUPLICADO`, `ESCALA_INVALIDA`, `CRITERIO_NO_ENCONTRADO`, `MODO_INCOMPATIBLE`, `IN_USE`.

Commit: incluir en el siguiente paso (no amerita commit propio).

---

### Paso 3 — Repositorio `score-template.repo.ts`

Archivo: `src/repositories/score-template.repo.ts`.

Funciones públicas:

```ts
// Lecturas (cacheadas con unstable_cache + tag scoreTemplates:orgId)
listScoreTemplates(organizationId: string, opts?: { includeArchived?: boolean }): Promise<ScoreTemplateWithCriterios[]>
findScoreTemplateById(organizationId: string, id: string): Promise<ScoreTemplateWithCriterios | null>
countScoreTemplates(organizationId: string, opts?: { activeOnly?: boolean }): Promise<number>

// Lock (Plan 5 retorna siempre false; Plan 4b lo activa)
isTemplateLocked(templateId: string): Promise<boolean>

// Mutaciones (transaccionales, con audit log y revalidateTag estructurales)
createScoreTemplate(
  organizationId,
  data: { nombre, descripcion?, modo, categoria, valoresValidos: Decimal[], valoresValidosDesempate?: Decimal[], criterios?: { nombre, descripcion?, tipo }[] },
  actorUserId,
): Promise<{ id: string }>
updateScoreTemplateMetadata(organizationId, id, data: { nombre, descripcion?, categoria }, actorUserId): Promise<void>
updateScoreTemplateCore(
  organizationId,
  id,
  data: { modo, valoresValidos: Decimal[], valoresValidosDesempate: Decimal[] },  // [] = heredar
  actorUserId,
): Promise<void>                                                                   // bloqueado si locked; valida modo↔tipo de criterios existentes
archiveScoreTemplate(organizationId, id, actorUserId): Promise<void>
unarchiveScoreTemplate(organizationId, id, actorUserId): Promise<void>
duplicateScoreTemplate(organizationId, id, actorUserId): Promise<{ id: string }>
deleteScoreTemplate(organizationId, id, actorUserId): Promise<void>                // hard delete; bloquea si IN_USE

// Criterios
addCriterio(
  organizationId,
  templateId,
  data: { nombre, descripcion?, tipo: 'PUNTUABLE' | 'DESEMPATE' },
  actorUserId,
): Promise<{ id: string }>                                                          // valida modo↔tipo: si modo=PUNTAJE_UNICO y tipo=PUNTUABLE → BusinessError("MODO_INCOMPATIBLE")
updateCriterio(organizationId, templateId, criterioId, data: { nombre, descripcion?, tipo }, actorUserId): Promise<TemplateCriterion>  // mismo guard modo↔tipo
deleteCriterio(organizationId, templateId, criterioId, actorUserId): Promise<void>
reorderCriterio(organizationId, templateId, criterioId, direction: 'up' | 'down', actorUserId): Promise<void>
```

Patrón de cada función:
1. Validar pertenencia al `organizationId` (`findFirst({ where: { id, organizationId } })`).
2. Validar reglas de negocio → `throw new BusinessError(...)`.
3. Si la mutación toca campos lockeables, llamar `isTemplateLocked` y bloquear.
4. **Validación cruzada modo ↔ tipo**:
   - En `addCriterio` / `updateCriterio`: si `modo = PUNTAJE_UNICO` y `tipo = PUNTUABLE` → `BusinessError("MODO_INCOMPATIBLE", { reason: "puntajeUnicoSoloDesempate" })`.
   - En `updateScoreTemplateCore`: si nuevo `modo = PUNTAJE_UNICO` y la plantilla tiene criterios con `tipo = PUNTUABLE` → `BusinessError("MODO_INCOMPATIBLE", { criteriosBloqueantes: [{ id, nombre }, ...] })`. La action expone los criterios bloqueantes en el error UI para que el admin sepa qué eliminar.
5. **Validación de las dos escalas**: ambas pasan por el mismo helper `validateEscala` (length ≥ 2, ordenada, sin duplicados, máx 20 valores). Para `valoresValidosDesempate`: si el array es `[]` (heredar), saltear validación; si tiene contenido, aplicar las mismas reglas. La validación se ejecuta en `createScoreTemplate` y `updateScoreTemplateCore`.
6. `prisma.$transaction` con la mutación + `auditLog.create`.
7. Para mutaciones estructurales: `revalidateTag(cacheTags.scoreTemplates(organizationId))`.

**Importante** — siguiendo CLAUDE.md punto 18: las lecturas con `include: { criterios: ... }` usan `prisma.*` directo con `where: { organizationId }` explícito (no `forOrg().findMany` con include, porque pierde generic types).

Helper expuesto al consumidor:

```ts
// Resuelve la escala efectiva para un criterio dado, sin tener que duplicar la regla "[] significa heredar" en cada llamador.
function escalaEfectivaParaCriterio(
  template: { valoresValidos: Decimal[]; valoresValidosDesempate: Decimal[] },
  tipo: TemplateCriterionTipo,
): Decimal[] {
  if (tipo === "DESEMPATE" && template.valoresValidosDesempate.length > 0) {
    return template.valoresValidosDesempate
  }
  return template.valoresValidos
}
```

Tests Vitest: `src/repositories/score-template.repo.test.ts`.
- Crear plantilla `CRITERIOS` → persistida + audit.
- Crear plantilla `PUNTAJE_UNICO` sin criterios → ok.
- **Crear plantilla `PUNTAJE_UNICO` con criterios DESEMPATE adicionales (caso compuesto) → ok**.
- **Crear plantilla `PUNTAJE_UNICO` con un criterio PUNTUABLE → `BusinessError("MODO_INCOMPATIBLE")`**.
- **Crear plantilla con `valoresValidosDesempate = [0, 1, 2, 3]` distinto de `valoresValidos = [5, 7, 10]` → ok; `escalaEfectivaParaCriterio` devuelve la secundaria para criterios DESEMPATE y la principal para PUNTUABLE**.
- **Crear con `valoresValidosDesempate = []` (heredar) → `escalaEfectivaParaCriterio` devuelve `valoresValidos` para DESEMPATE también**.
- Crear con nombre duplicado → `BusinessError("NOMBRE_DUPLICADO")`.
- Crear con escala principal inválida (1 valor / desordenada / duplicados) → `BusinessError("ESCALA_INVALIDA")` referenciando `valoresValidos`.
- **Crear con escala secundaria inválida** (length 1 o desordenada, no vacía) → `BusinessError("ESCALA_INVALIDA")` referenciando `valoresValidosDesempate`.
- **Cambiar modo CRITERIOS → PUNTAJE_UNICO con criterios PUNTUABLE existentes → `BusinessError("MODO_INCOMPATIBLE")` listando los criterios bloqueantes**.
- **Cambiar modo CRITERIOS → PUNTAJE_UNICO con solo criterios DESEMPATE → ok (sin tener que eliminar nada)**.
- **`addCriterio` con `tipo = PUNTUABLE` en plantilla `PUNTAJE_UNICO` → `BusinessError("MODO_INCOMPATIBLE")`**.
- **`updateCriterio` cambiando `tipo` de DESEMPATE a PUNTUABLE en plantilla `PUNTAJE_UNICO` → `BusinessError("MODO_INCOMPATIBLE")`**.
- Duplicar plantilla CRITERIOS con criterios → copia con sufijo + criterios clonados con orden preservado.
- **Duplicar plantilla compuesta (`PUNTAJE_UNICO` + DESEMPATE + ambas escalas distintas) → copia preserva ambas escalas y los criterios DESEMPATE**.
- Archivar → `archivedAt` set; listar sin `includeArchived` no la trae; con `includeArchived` sí.
- `isTemplateLocked` retorna `false` (sin Posta).
- Reordenar criterio: swap correcto, sin violación de unique constraint.

Commit: `feat(repo): score-template con creación, edición y reordenamiento`

---

### Paso 4 — Página de listado

Archivo: `src/app/(app)/admin/plantillas/page.tsx` (Server Component).

Layout:
- Encabezado con botón "+ Nueva plantilla" → `/admin/plantillas/nueva`.
- Filtros: tabs por modo (`Todas | CRITERIOS | PUNTAJE_UNICO`), select de categoría, toggle "ver archivadas".
- Lista en grid de tarjetas: nombre, descripción truncada, badge de modo, badge de categoría, count de criterios (si CRITERIOS), preview de la escala. Click → detalle.

Filtros se manejan con search params (URL-driven), no estado de cliente.

Commit: `feat(admin): listar plantillas con filtros por modo y categoría`

---

### Paso 5 — Form de creación

Archivos:
- `src/app/(app)/admin/plantillas/nueva/page.tsx` — Server Component que renderiza el form.
- `src/components/admin/plantillas/TemplateForm.tsx` — Client Component con `useActionState`, gestiona el estado del form (incluyendo array dinámico de criterios cuando modo = CRITERIOS).
- `src/app/(app)/admin/plantillas/actions.ts` — server actions: `createTemplate`, `archiveTemplate`, `unarchiveTemplate`, `duplicateTemplate`, `deleteTemplate`.

El form `TemplateForm`:
- Campos meta: nombre, descripción, categoría (select), modo (radio cuando se eligió categoría OTRO; preestablecido por la categoría en otros casos).
- **Escala principal** (`valoresValidos`, obligatoria): chips editables (input numérico + botón "agregar"). Label "Valores válidos" + helper "El juez elegirá entre estos valores. Aplica al puntaje único o a los criterios puntuables".
- **Escala secundaria para desempate** (`valoresValidosDesempate`, opcional): toggle "Usar otra escala para criterios de desempate". Cuando se activa, aparece un segundo grupo de chips. Label "Valores válidos de desempate" + helper "Si está vacía, los criterios de desempate usan la misma escala principal". Cuando el toggle está apagado, el form envía `valoresValidosDesempate = []`.
- Editor de criterios:
  - Si modo = CRITERIOS: lista dinámica de criterios (nombre, tipo PUNTUABLE/DESEMPATE, descripción opcional) con botones "agregar criterio" y eliminar por fila. Cada fila muestra junto al tipo qué escala usará ("escala 5/7/10" para PUNTUABLE, "escala de desempate 0/1/2/3" para DESEMPATE si está activa, o "escala 5/7/10" si la secundaria no está activa).
  - Si modo = PUNTAJE_UNICO: el editor sigue visible pero **el select de tipo queda fijo en DESEMPATE y deshabilitado** (el modo no admite PUNTUABLE). El header del editor cambia a "Criterios de desempate (opcionales)" y se permite no agregar ninguno.
- Defaults sugeridos al cambiar categoría:
  - COMPETICION → `modo = PUNTAJE_UNICO`, `valoresValidos = [5,7,10]`, **toggle de escala secundaria activado con `valoresValidosDesempate = [0,1,2,3]`** (caso típico "competición + espíritu/uniforme/respeto").
  - CONSTRUCCION → `modo = CRITERIOS`, `valoresValidos = [5,7,10]`, escala secundaria desactivada (`[]`).
  - COCINA → `modo = CRITERIOS`, `valoresValidos = [5,7,10]`, escala secundaria desactivada.
  - OTRO → sin defaults.
- Submit → `createTemplate`. En éxito redirige a `/admin/plantillas/[id]`.

Validación Zod en la action `createTemplate`:
- `nombre`: 2-100 chars.
- `descripcion`: opcional, máx 500.
- `modo` y `categoria`: enum.
- `valoresValidos`: array de Decimal positivos, length ≥ 2 y ≤ 20, ordenado ascendente, sin duplicados.
- `valoresValidosDesempate`: array de Decimal positivos. **Si vacío `[]` → ok (significa heredar). Si no vacío → mismas reglas que `valoresValidos`**.
- `criterios`: array opcional. Cada criterio: `nombre` 2-100, `tipo` enum, `descripcion` opcional ≤ 500. `orden` se asigna en el server (1..N).
- **Cross-validation**: si `modo = PUNTAJE_UNICO`, todos los criterios deben tener `tipo = DESEMPATE`. Si la regla falla, Zod refine emite error global "Las plantillas con puntaje único solo aceptan criterios de desempate".

Commit: `feat(admin): crear plantillas con metadata y criterios iniciales`

---

### Paso 6 — Página detalle / editor

Archivos:
- `src/app/(app)/admin/plantillas/[id]/page.tsx` — Server Component que carga la plantilla con criterios.
- `src/components/admin/plantillas/TemplateMetadataForm.tsx` — Client Component para editar nombre, descripción, categoría (siempre habilitado).
- `src/components/admin/plantillas/TemplateCoreForm.tsx` — Client Component para editar modo + valoresValidos (deshabilitado si `isLocked`).
- `src/components/admin/plantillas/CriterioRow.tsx` — Client Component por fila con form inline (nombre, tipo, descripción) + botones ↑/↓/eliminar.
- `src/components/admin/plantillas/AddCriterioForm.tsx` — Client Component para agregar nuevo criterio.
- `src/app/(app)/admin/plantillas/[id]/actions.ts` — acciones específicas del detalle: `updateMetadata`, `updateCore`, `addCriterio`, `updateCriterio`, `deleteCriterio`, `reorderCriterio`.

Layout del detalle:
1. Header: nombre, badges (modo, categoría, archivada). Si la plantilla tiene `valoresValidosDesempate` no vacío, badge adicional "Doble escala".
2. Sección "Metadata" → `TemplateMetadataForm` (siempre editable).
3. Sección "Configuración" → `TemplateCoreForm` (modo + valoresValidos + toggle de escala secundaria + valoresValidosDesempate; deshabilitado si lock). Mismo layout de chips que el form de creación.
4. Sección "Criterios":
   - **Visible siempre** (no solo en modo CRITERIOS). En modo PUNTAJE_UNICO el header dice "Criterios de desempate (opcionales)" y `AddCriterioForm` solo permite agregar tipo DESEMPATE; en modo CRITERIOS el header dice "Criterios" y permite ambos tipos.
   - Lista de `CriterioRow` con orden actual; cada fila muestra junto al tipo la escala que aplica ("escala 5/7/10" o "escala de desempate 0/1/2/3").
   - `AddCriterioForm` debajo (deshabilitado si lock; en modo PUNTAJE_UNICO con tipo fijo en DESEMPATE).
5. Acciones laterales: Duplicar, Archivar/Desarchivar, Eliminar (con confirmación).

**Cambio de modo en `TemplateCoreForm`** (CRITERIOS ↔ PUNTAJE_UNICO):
- El client envía la mutación al servidor. Si hay criterios `PUNTUABLE` y se intenta cambiar a `PUNTAJE_UNICO`, la action retorna `{ error: "modoIncompatible", criteriosBloqueantes: [...] }` y el componente muestra un panel inline con los criterios que el admin debe eliminar antes.
- No hay confirm dialog destructivo: el servidor bloquea, el cliente muestra qué falta.

**`AddCriterioForm`**:
- Acepta `nombre`, `tipo`, `descripcion`. El select `tipo` se deshabilita y queda fijo en `DESEMPATE` cuando `template.modo = PUNTAJE_UNICO`.
- Submit llama a `addCriterio` action. La action revalida server-side el guard modo↔tipo (defensa en profundidad).

Patrón de fila editable (siguiendo Plan 4 lección #3):
- `useState` para los inputs (`nombre`, `tipo`, `descripcion`).
- `useState` paralelo para los valores "guardados" (`savedNombre`, etc) inicializado desde props al montar.
- Botón "Guardar" visible solo cuando `isDirty` (input ≠ saved).
- En el `useEffect([actionState])`, sincronizar `saved*` desde el resultado de la action (NO desde props).
- `updateCriterio` NO llama `revalidateTag` (mutación de valores, no estructural).

Commit: `feat(admin): editor de plantillas con criterios reordenables`

---

### Paso 7 — Acciones laterales (archivar / duplicar / eliminar)

- **Archivar**: `archiveScoreTemplate` setea `archivedAt = now()`, audit, `revalidateTag`. Botón con confirmación; estado se refleja en lista.
- **Desarchivar**: setea `archivedAt = null`, audit, `revalidateTag`.
- **Duplicar**: clona plantilla con `nombre = "{original} (copia)"` (si ya existe, sufijo numérico: " (copia 2)", etc), clona criterios con orden preservado, `archivedAt = null`. Audit, `revalidateTag`. Redirige al detalle de la nueva.
- **Eliminar (hard delete)**: en Plan 5 siempre permitido (no hay Posta). Cascade borra criterios. Audit con metadata del nombre original. Redirige al listado.

Estas acciones se exponen en el detalle (`/admin/plantillas/[id]`) y opcionalmente en el listado vía menú contextual.

Commit: `feat(admin): archivar, duplicar y eliminar plantillas`

---

### Paso 8 — Tarjeta en `/admin` landing

Modificar `src/app/(app)/admin/page.tsx`:
- Agregar `countScoreTemplates(org.organizationId, { activeOnly: true })` al `Promise.all`.
- Sumar tarjeta "Plantillas" al array de cards con link a `/admin/plantillas`.

Modificar `src/components/admin/AdminNav.tsx`:
- Agregar entrada "Plantillas" al sub-nav.

Commit: `feat(admin): tarjeta y nav para plantillas`

---

### Paso 9 — Copy en `es.json`

Agregar namespace `admin.plantillas` con copy completo. Estructura tentativa (extracto):

```json
{
  "admin": {
    "nav": { "plantillas": "Plantillas" },
    "plantillas": {
      "title": "Plantillas de puntaje",
      "subtitle": "Bibliotec a de plantillas del distrito. Reusables por evento.",
      "empty": "Aún no hay plantillas. Creá la primera para empezar.",
      "newButton": "Nueva plantilla",
      "filters": {
        "modo": { "all": "Todas", "criterios": "Por criterios", "puntajeUnico": "Puntaje único" },
        "categoria": { "all": "Todas las categorías", "COMPETICION": "Competición", "CONSTRUCCION": "Construcción", "COCINA": "Cocina", "OTRO": "Otra" },
        "showArchived": "Mostrar archivadas"
      },
      "form": {
        "nombre": "Nombre",
        "descripcion": "Descripción (opcional)",
        "categoria": "Categoría",
        "modo": "Modo de puntaje",
        "modoCriterios": "Por criterios (suma)",
        "modoPuntajeUnico": "Puntaje único (un valor por posta)",
        "valoresValidos": "Valores válidos",
        "valoresValidosHelp": "El juez elegirá entre estos valores. Aplica al puntaje único o a los criterios puntuables. Mínimo 2.",
        "addValor": "Agregar valor",
        "valoresValidosDesempateToggle": "Usar otra escala para criterios de desempate",
        "valoresValidosDesempate": "Valores válidos de desempate",
        "valoresValidosDesempateHelp": "Los criterios de desempate usarán esta escala. Si no la activás, comparten la escala principal.",
        "criterios": "Criterios",
        "criteriosDesempate": "Criterios de desempate (opcionales)",
        "criterioNombre": "Criterio",
        "criterioTipo": "Tipo",
        "criterioPUNTUABLE": "Puntuable (suma al total)",
        "criterioDESEMPATE": "Desempate (no suma)",
        "criterioEscalaPrincipal": "escala principal",
        "criterioEscalaDesempate": "escala de desempate",
        "criterioDescripcion": "Descripción del criterio (opcional)",
        "addCriterio": "Agregar criterio",
        "addCriterioDesempate": "Agregar criterio de desempate",
        "submit": "Crear plantilla"
      },
      "detail": {
        "metadataTitle": "Información general",
        "coreTitle": "Configuración de puntaje",
        "criteriosTitle": "Criterios",
        "criteriosDesempateTitle": "Criterios de desempate (opcionales)",
        "dobleEscalaBadge": "Doble escala",
        "lockedNotice": "Esta plantilla está en uso en al menos un evento. Para cambiar criterios o escala, duplicala primero.",
        "modoIncompatibleNotice": "Para cambiar a puntaje único, primero eliminá los criterios puntuables: {{criterios}}",
        "duplicateButton": "Duplicar",
        "archiveButton": "Archivar",
        "unarchiveButton": "Desarchivar",
        "deleteButton": "Eliminar",
        "deleteConfirm": "¿Eliminar la plantilla \"{{nombre}}\"? Esta acción es irreversible."
      },
      "errors": {
        "nombreDuplicado": "Ya existe una plantilla con ese nombre",
        "escalaInvalida": "La escala debe tener al menos 2 valores ordenados ascendentemente sin repetir",
        "escalaDesempateInvalida": "La escala de desempate debe tener al menos 2 valores ordenados ascendentemente sin repetir",
        "modoIncompatible": "El cambio de modo no es válido para esta plantilla",
        "puntajeUnicoSoloDesempate": "Las plantillas con puntaje único solo aceptan criterios de desempate",
        "criterioNotFound": "Criterio no encontrado",
        "inUse": "No se puede modificar: la plantilla está en uso en un evento",
        "lastValor": "Una plantilla debe tener al menos 2 valores en la escala"
      }
    }
  }
}
```

Commit: incluido en commits previos (i18n se agrega junto con cada feature).

---

### Paso 10 — Tests Vitest

Archivo: `src/repositories/score-template.repo.test.ts`.

Casos prioritarios:
- Crear plantilla `CRITERIOS` con 3 criterios → persistida con orden 1/2/3.
- Crear plantilla `PUNTAJE_UNICO` (no acepta criterios en el create).
- Nombre duplicado (en mismo distrito) → `BusinessError("NOMBRE_DUPLICADO")`.
- Escala con 1 solo valor → `BusinessError("ESCALA_INVALIDA")`.
- Escala desordenada `[10, 5, 7]` → `BusinessError("ESCALA_INVALIDA")`.
- Escala con duplicados `[5, 5, 10]` → `BusinessError("ESCALA_INVALIDA")`.
- Duplicar plantilla CRITERIOS → nombre con "(copia)", criterios clonados con orden preservado.
- Archivar / desarchivar → flag y filtro correctos.
- Reordenar criterio "down" en posición intermedia → swap correcto sin violación de unique.
- `isTemplateLocked` siempre false en este plan.
- Tenant isolation: distrito A no ve plantillas de distrito B.

Commit: `test(repo): score-template con cobertura de casos de borde`

---

## Archivos creados / modificados

| Archivo | Acción | Función |
|---|---|---|
| `prisma/schema.prisma` | modificar | Agregar enums + modelos `ScoreTemplate` y `TemplateCriterion` + relación en `Organization` |
| `prisma/migrations/.../migration.sql` | crear | Migración nueva generada por Prisma |
| `src/repositories/cache-tags.ts` | modificar | Tag `scoreTemplates: (orgId) => 'scoreTemplates:orgId'` |
| `src/repositories/score-template.repo.ts` | crear | Lecturas cacheadas, mutaciones transaccionales con audit |
| `src/repositories/score-template.repo.test.ts` | crear | Tests Vitest |
| `src/lib/errors.ts` | modificar (si necesario) | Agregar códigos de `BusinessError` específicos del plan |
| `src/app/(app)/admin/plantillas/page.tsx` | crear | Listado con filtros |
| `src/app/(app)/admin/plantillas/nueva/page.tsx` | crear | Form de creación |
| `src/app/(app)/admin/plantillas/actions.ts` | crear | `createTemplate`, `archiveTemplate`, `unarchiveTemplate`, `duplicateTemplate`, `deleteTemplate` |
| `src/app/(app)/admin/plantillas/[id]/page.tsx` | crear | Detalle + editor |
| `src/app/(app)/admin/plantillas/[id]/actions.ts` | crear | `updateMetadata`, `updateCore`, `addCriterio`, `updateCriterio`, `deleteCriterio`, `reorderCriterio` |
| `src/components/admin/plantillas/TemplateForm.tsx` | crear | Form de creación |
| `src/components/admin/plantillas/TemplateMetadataForm.tsx` | crear | Editor de metadata |
| `src/components/admin/plantillas/TemplateCoreForm.tsx` | crear | Editor de modo + escala |
| `src/components/admin/plantillas/CriterioRow.tsx` | crear | Fila editable con reordenamiento |
| `src/components/admin/plantillas/AddCriterioForm.tsx` | crear | Form para agregar criterio |
| `src/app/(app)/admin/page.tsx` | modificar | Tarjeta nueva en landing |
| `src/components/admin/AdminNav.tsx` | modificar | Entrada en sub-nav |
| `src/messages/es.json` | modificar | Namespace `admin.plantillas` |

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm test          # tests del repositorio en verde
pnpm prisma migrate status  # migración aplicada
pnpm build         # build exitoso
```

### Verificación manual end-to-end

Pre-requisito: distrito con ADMIN logueado.

**Escenario 1 — Crear plantilla COMPETICION (compuesta con desempate)**:
1. `/admin` → click tarjeta "Plantillas" → vacía.
2. Click "Nueva plantilla". Categoría = COMPETICION.
3. Defaults aparecen: modo=`PUNTAJE_UNICO`, `valoresValidos = [5,7,10]`, **toggle de escala secundaria activado con `valoresValidosDesempate = [0,1,2,3]`**.
4. Cambiar nombre a "Carrera de obstáculos". Agregar tres criterios DESEMPATE: "Espíritu scout", "Uniforme", "Respeto a las reglas". El campo de tipo aparece como texto fijo "Desempate (no suma)" (no es un select editable — en modo PUNTAJE_UNICO el tipo siempre es DESEMPATE).
5. Submit. Redirige a detalle. Ver: badge "PUNTAJE_UNICO", badge "Doble escala", escala principal `5 / 7 / 10`, escala de desempate `0 / 1 / 2 / 3`, sección "Criterios de desempate" con las 3 filas. En pantallas medianas y grandes, cada fila muestra junto al tipo los valores de escala que aplica (`0 / 1 / 2 / 3` para las filas DESEMPATE).

**Escenario 2 — Crear plantilla CONSTRUCCION con criterios**:
1. Nueva plantilla. Categoría = CONSTRUCCION.
2. Defaults: modo=`CRITERIOS`, escala=`[5,7,10]`.
3. Nombre = "Construcción pionerismo". Agregar criterios:
   - "Solidez de la estructura" → tipo PUNTUABLE.
   - "Estética y creatividad" → tipo PUNTUABLE.
   - "Espíritu scout durante la construcción" → tipo DESEMPATE.
4. Submit → detalle con 3 criterios en orden 1/2/3.

**Escenario 3 — Editar criterio inline**:
1. En el detalle de "Construcción pionerismo", editar el primer criterio: cambiar nombre a "Solidez estructural".
2. Botón "Guardar" aparece cuando isDirty.
3. Click → mensaje "Guardado", botón desaparece.
4. Recargar página → nombre persistido.
5. Confirmar en DB que `revalidateTag` NO se llamó (verificar comportamiento de la lista en otra pestaña).

**Escenario 4 — Reordenar criterios**:
1. En "Construcción pionerismo", click ▼ en el primer criterio.
2. La página se actualiza y muestra el nuevo orden (revalidateTag invalida la cache tras el reorden).
3. Recargar → orden persistido.
4. Click ▲ en el criterio que quedó último → vuelve al orden original.

**Escenario 5 — Validación de escala**:
1. Crear plantilla con escala `[5]` (un solo valor) → error "La escala debe tener entre 2 y 20 valores" (validación Zod).
2. Crear con `[10, 5]` (desordenada) → error "La escala debe tener al menos 2 valores ordenados ascendentemente sin repetir" (validación del repositorio).
3. Crear con `[5, 5, 10]` (duplicado) → mismo error que el paso 2.

**Escenario 6 — Nombre duplicado**:
1. Crear segunda plantilla con nombre "Construcción pionerismo" → error "Ya existe una plantilla con ese nombre".

**Escenario 7 — Duplicar**:
1. En detalle de "Construcción pionerismo", click "Duplicar".
2. Redirige a la nueva con nombre "Construcción pionerismo (copia)".
3. Los 3 criterios están clonados con mismo orden y tipos.
4. Editar la copia no afecta la original.

**Escenario 8 — Archivar / desarchivar**:
1. Desde el detalle de "Construcción pionerismo (copia)", click "Archivar". La página permanece en el detalle; el badge "Archivada" aparece en el header.
2. Navegar a `/admin/plantillas` → la lista activa no la muestra (la cache se invalidó con `revalidateTag` tras archivar).
3. Click "Mostrar archivadas" → aparece en la lista con badge "Archivada".
4. Entrar al detalle → click "Desarchivar" → badge "Archivada" desaparece. Navegar a la lista activa → vuelve a aparecer.

**Escenario 9 — Eliminar**:
1. Eliminar la copia → confirmación → desaparece de la lista.
2. Audit log muestra `scoreTemplate.deleted` con metadata del nombre.

**Escenario 10 — Lock simulado** (manual, para verificar UI):
1. En DB: `INSERT` simulado o flag temporal en `isTemplateLocked` → retornar `true` para una plantilla.
2. UI muestra notice "en uso en al menos un evento", deshabilita modo / valoresValidos / criterios. Metadata sigue editable.
3. Revertir flag.

**Escenario 11 — Auditoría**:
1. `SELECT action, metadata FROM "AuditLog" WHERE "organizationId" = '...' ORDER BY "createdAt" DESC LIMIT 30;`
2. Confirmar todos los eventos generados durante los escenarios anteriores.

**Escenario 12 — Tenant isolation**:
1. Como segundo distrito en otra cuenta, crear plantilla con mismo nombre "Construcción pionerismo" → permitido (constraint es `(organizationId, nombre)`).
2. Listado de cada distrito no ve plantillas del otro.

**Escenario 13 — Cambio de modo bloqueado por criterios PUNTUABLE**:
1. Crear plantilla CRITERIOS "Demo bloqueo" con 2 criterios PUNTUABLE y 1 DESEMPATE.
2. En el detalle, cambiar modo a `PUNTAJE_UNICO` y hacer click en "Guardar configuración".
3. La action retorna `{ error: "MODO_INCOMPATIBLE", criteriosBloqueantes: "NombreCrit1, NombreCrit2" }` (string con los nombres separados por coma).
4. UI muestra panel ámbar con el texto "Para cambiar a puntaje único, primero eliminá los criterios puntuables: **NombreCrit1, NombreCrit2**". El modo no cambió.
5. Eliminar manualmente los 2 criterios PUNTUABLE.
6. Reintentar cambio a `PUNTAJE_UNICO` → éxito; el criterio DESEMPATE persiste.

**Escenario 14 — Bloqueo `addCriterio` con tipo PUNTUABLE en PUNTAJE_UNICO**:
1. En "Carrera de obstáculos" (PUNTAJE_UNICO), inspeccionar el form `AddCriterioForm` → el select de tipo muestra solo "Desempate (no suma)" y está deshabilitado (no se puede cambiar a PUNTUABLE).
2. Forzar request con `tipo = PUNTUABLE` (vía DevTools network replay) → action retorna `{ error: "Las plantillas con puntaje único solo aceptan criterios de desempate" }`.

**Escenario 15 — Escala secundaria opcional vs heredada**:
1. Crear plantilla CRITERIOS "Cocina mixta" con `valoresValidos = [5,7,10]` y toggle de escala secundaria **apagado**. Agregar 1 PUNTUABLE y 1 DESEMPATE.
2. En el detalle, cada fila de criterio muestra junto al tipo los valores `5 / 7 / 10` (la escala principal aplica a ambas porque la secundaria está vacía). Este indicador solo es visible en pantallas medianas y grandes (`sm+`).
3. Activar toggle de escala secundaria en la sección "Configuración de puntaje", agregar valores `[0, 1, 2]`, click "Guardar configuración".
4. Badge "Doble escala" aparece en el header. La fila DESEMPATE ahora muestra `0 / 1 / 2` junto al tipo; la PUNTUABLE sigue mostrando `5 / 7 / 10`.
5. Volver a "Configuración de puntaje", apagar toggle (envía `[]`), guardar. Badge "Doble escala" desaparece. Ambas filas muestran `5 / 7 / 10`.

**Escenario 16 — Validación de escala secundaria**:
1. Activar toggle de escala secundaria con `[5]` (un solo valor) → error "La escala de desempate debe tener al menos 2 valores...".
2. Con `[3, 1]` (desordenada) → mismo error.
3. Con `[1, 1, 2]` (duplicado) → mismo error.
4. Con `[0, 1, 2, 3]` (válida) → guarda OK.

**Escenario 17 — Duplicar plantilla compuesta**:
1. Duplicar "Carrera de obstáculos".
2. Ver copia: nombre "Carrera de obstáculos (copia)", badge "PUNTAJE_UNICO" + "Doble escala", `valoresValidos = [5,7,10]`, `valoresValidosDesempate = [0,1,2,3]`, los 3 criterios DESEMPATE clonados en el orden original.

### Criterios de aceptación

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en limpio.
- [ ] Migración Prisma se aplica sin warnings.
- [ ] Crear plantilla con ambos modos funciona.
- [ ] Defaults por categoría se aplican y son editables.
- [ ] Validación de escala (mínimo 2, ordenada, sin duplicados) bloquea con mensaje claro.
- [ ] Nombre duplicado por distrito bloquea con `BusinessError("NOMBRE_DUPLICADO")`.
- [ ] Edición de criterio inline persiste sin reload, sin reset de UI por `revalidateTag`.
- [ ] Reordenar criterios funciona y respeta el unique constraint.
- [ ] Duplicar clona criterios con orden y tipos preservados.
- [ ] Archivar oculta de la lista activa por default; desarchivar revierte.
- [ ] Hard delete funciona y registra audit.
- [ ] `isTemplateLocked` retorna false (sin Posta), preparado para Plan 4b.
- [ ] Tenant isolation verificada con dos distritos.
- [ ] Todos los textos visibles vienen de `src/messages/es.json` namespace `admin.plantillas`.
- [ ] Caso compuesto (`PUNTAJE_UNICO` + criterios DESEMPATE + escala secundaria) funciona end-to-end.
- [ ] Validación cruzada modo↔tipo bloquea creación, edición de criterio y cambio de modo cuando corresponde.
- [ ] Escala secundaria respeta el contrato `[]` = heredar, length ≥ 2 si tiene contenido.
- [ ] `escalaEfectivaParaCriterio` cubierto en tests del repositorio.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Prisma 7 + adapter-pg tiene fricción con `Decimal[]` (numeric[]) | Media | Probar primero en una rama; si falla, fallback documentado a `Json` con validación Zod. Benchmark mínimo: `prisma generate` + `prisma migrate dev` sobre el schema. |
| Reordenamiento viola `@@unique([templateId, orden])` durante el swap | Media | Implementar swap en transacción con valor temporal: paso 1 setea el primero a `orden = -1`; paso 2 setea el segundo al orden del primero; paso 3 setea el primero al orden del segundo. |
| El form de creación con array dinámico de criterios es confuso en mobile | Media | Validar en mobile real (no solo simulador). Cada criterio en una "card" apilada con touch targets de 48px (Plan 3c). Si demasiado denso, ofrecer "guardar plantilla sin criterios y agregarlos después en el detalle". |
| El admin crea plantilla CRITERIOS con 0 criterios y luego intenta asignarla a posta en Plan 4b | Alta (si el admin se distrae) | Aceptado: la validación "al menos 1 PUNTUABLE" sucede en Plan 4b al asignar. Mientras tanto, la plantilla queda en estado "borrador". Puede mostrarse warning visual en la lista cuando una CRITERIOS tiene 0 criterios. |
| Decimal precisión en `valoresValidos` | Baja | Postgres `numeric` sin precisión declarada permite hasta 1000 dígitos. Para puntajes scout, 2 decimales son suficientes. Documentar. |
| Duplicación de plantilla con nombre existente choca con `@@unique([organizationId, nombre])` | Media | El servidor calcula sufijo numérico iterativamente: "(copia)" → "(copia 2)" → "(copia 3)" hasta encontrar uno libre. Loop con `findFirst` antes del create. |
| El usuario archiva todas las plantillas y la lista queda vacía | Baja | Toggle "Mostrar archivadas" siempre disponible. Botón "Nueva plantilla" siempre presente. |
| `revalidateTag` se llama en mutación de valores y resetea UI (lección Plan 4 #1) | Media | Convención cerrada: solo usar `revalidateTag` en mutaciones estructurales (crear, archivar, eliminar, agregar/quitar criterio). En `updateCriterio`, `updateMetadata`, `updateCore`, `reorderCriterio` con success: devolver el resultado y NO llamar revalidate. |
| La cardinalidad de `valoresValidos` se vuelve grande (admin abusivo) | Baja | Validación Zod: máx 20 valores. Ningún caso real lo necesita. |
| El editor del modo PUNTAJE_UNICO oculta criterios pero el usuario hizo cambios y al cambiar de modo se pierden | Media | Confirmar antes de cambiar de modo si hay criterios pendientes. O: persistir criterios "huérfanos" en DB si modo cambia, ignorarlos visualmente, y restaurarlos si vuelve a CRITERIOS. Decisión simpler: confirm dialog antes de cambiar de modo (evita la complejidad). |
| **Admin se confunde sobre cuál escala aplica a qué criterio** | Alta | Cada `CriterioRow` muestra junto al tipo una etiqueta explícita ("escala 5/7/10" o "escala de desempate 0/1/2/3"). El badge "Doble escala" en el header advierte cuando hay dos escalas activas. Helper text del toggle deja claro que `[]` = heredar. |
| **Escala secundaria modelada como `[]` = heredar (no `null`)** confunde a futuros lectores del schema | Media | Documentado en "Notas sobre el schema" + comentario en el modelo Prisma + helper `escalaEfectivaParaCriterio` que es la única fuente para resolver la escala efectiva (nadie consulta `valoresValidosDesempate.length` fuera del helper). |
| **Cambio de modo CRITERIOS → PUNTAJE_UNICO con criterios PUNTUABLE silenciosamente los borraría** si la validación se omite | Alta | Validación cruzada en `updateScoreTemplateCore` que retorna `BusinessError("MODO_INCOMPATIBLE")` con `criteriosBloqueantes`. Cubierto por tests Vitest (escenarios 13). UI muestra panel con la lista de criterios bloqueantes. Sin auto-borrado. |
| **Plantilla `PUNTAJE_UNICO` con escala secundaria activa pero sin criterios DESEMPATE** queda con `valoresValidosDesempate` poblado pero inaplicable | Baja | Aceptado: el admin puede agregar criterios DESEMPATE después. La escala secundaria queda como "configuración preparada". No se invalida automáticamente. UI puede mostrar hint "agregá criterios de desempate para que esta escala se use" pero no es bloqueante. |

---

## Antes de ejecutar — checklist

- [ ] Plan 4 mergeado en `main`, todos los tests verdes.
- [ ] Branch limpio, `git status` sin pendientes.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en `main`.
- [ ] Confirmar que Prisma 7 + adapter-pg + Postgres 16 soportan `Decimal[]` con la versión actual del proyecto (smoke test con migración trivial antes de codear el feature).
- [ ] Tener al menos 1 distrito con seed corrido para Escenario 12 (tenant isolation).
- [ ] Tener clara la decisión sobre fallback `Json` si `Decimal[]` falla (riesgo #1).

---

## Proceso de planeación (educativo)

Este plan se redactó con Claude Opus en plan mode siguiendo el workflow Opus/Sonnet. Resumen del intercambio:

1. **Lectura previa**: el agente leyó `CLAUDE.md`, el master plan, el plan 4 completo (incluyendo lecciones aprendidas sobre cache y filas editables inline), el `prisma/schema.prisma`, el repositorio `grupo.repo.ts` como referencia, y la estructura de `/admin`. Detectó que **`ScoreTemplate` y `TemplateCriterion` no existen en el schema actual** (contradiciendo la suposición inicial del usuario), por lo que el plan introduce los modelos por primera vez.

2. **Cuatro decisiones planteadas en la primera tanda**:
   - **Mutabilidad post-uso** → "Lock al primer uso". Una plantilla, una vez asignada a una Posta, vuelve criterios/escala/modo read-only. Para variar, duplicar.
   - **Campos de TemplateCriterion** → nombre + tipo + orden + descripción opcional. **El usuario corrigió la pregunta**: en lugar de `valorMaximo` por criterio, propuso "valores válidos" (lista discreta como 5/7/10).
   - **Eliminación** → soft delete con archivado.
   - **PUNTAJE_UNICO** → el usuario pidió más detalles antes de responder.

3. **Clarificación del usuario sobre el dominio (cambio mayor)**: el usuario explicó que la jerarquía real es `Evento → Actividad (peso porcentual) → Posta`, no `Evento → Posta` como decía el master plan. Tipos de actividades: competición (postas chicas, encaja con `PUNTAJE_UNICO`), construcción (una posta gigante, encaja con `CRITERIOS`), cocina (una posta por comida, encaja con `CRITERIOS`). Esto **NO afecta Plan 5** pero sí Plan 4a/4b cuando lleguen — se documenta como pendiente para abrir un ADR-0003.

4. **Tres decisiones de la segunda tanda**:
   - **Escala compartida por toda la plantilla**, no por criterio. Más simple en UX.
   - **Lista discreta obligatoria**, sin entrada libre opcional. Forzar la convención scout.
   - **PUNTAJE_UNICO como modo separado** del schema. La explicación del usuario sobre postas de competición confirmó que es un caso de uso real distinto, no un caso particular de CRITERIOS.

5. **Tercera tanda final**:
   - PUNTAJE_UNICO también usa la lista discreta (mismo patrón 5/7/10).
   - Categorización con enum cerrado (`COMPETICION | CONSTRUCCION | COCINA | OTRO`), con defaults sugeridos por categoría al crear.

6. **Cuarta ronda — caso compuesto descubierto post-plan**: con el plan aparentemente cerrado, el usuario planteó un caso que el modelo no soportaba todavía: una posta competitiva con puntaje único objetivo (5/7/10 cronómetro) **+ criterios de desempate cualitativos con otra escala** (0/1/2/3 para espíritu scout, uniforme, respeto). El modelo original tenía dos limitaciones: (a) `PUNTAJE_UNICO` rechazaba todos los criterios, (b) había una sola escala compartida. Decisiones tomadas:
   - **Permitir criterios DESEMPATE en `PUNTAJE_UNICO`** (no PUNTUABLE — esos siguen siendo exclusivos de CRITERIOS). Validación cruzada modo↔tipo en repositorio + Zod refine en la action.
   - **Agregar `valoresValidosDesempate: Decimal[]` opcional** (modelado como array no-nullable inicializado en `[]` que significa "heredar"). Si tiene contenido, los criterios DESEMPATE usan esa escala; si no, heredan `valoresValidos`. Mismas reglas de validación si está poblado.
   - **Bloquear cambio de modo CRITERIOS → PUNTAJE_UNICO si hay PUNTUABLE existentes** con `BusinessError("MODO_INCOMPATIBLE")` listando los criterios bloqueantes (en lugar de auto-borrarlos, que sería destructivo silencioso).
   - **Defaults sugeridos por categoría se ampliaron**: COMPETICION ahora también activa la escala secundaria con `[0,1,2,3]` por default (caso típico).
   - **Helper `escalaEfectivaParaCriterio`** centraliza la regla `[] = heredar` para que ningún consumidor duplique la lógica.

7. **Decisiones que el plan tomó solo** (sin preguntar, por convención o por obviedad):
   - Modelos nuevos en migración nueva (en lugar de retro-modificar Plan 0b).
   - Capa de repositorios siguiendo ADR-0002 (lectura con `unstable_cache`, escritura transaccional con audit log).
   - `revalidateTag` solo para mutaciones estructurales, siguiendo lección de Plan 4 #1.
   - Filas editables inline siguiendo el patrón de Plan 4 (estado dual `current` / `saved`, sync desde `actionState` no desde props).
   - `BusinessError(code, meta?)` para errores de negocio (CLAUDE.md punto 19).
   - Botones ↑/↓ en lugar de drag-and-drop (mobile-friendly, sin librerías).
   - `isTemplateLocked` deferred a Plan 4b retornando `false` en este plan (sin denormalización innecesaria).
   - Constraint `@@unique([organizationId, nombre])` para evitar nombres duplicados en el mismo distrito.
   - `Decimal[]` para `valoresValidos` con fallback documentado a `Json` si Prisma 7 tiene fricción.
   - Reordenamiento con valor temporal (`orden = -1`) para evitar violación del unique constraint.
   - Defaults sugeridos por categoría (COMPETICION → PUNTAJE_UNICO; CONSTRUCCION/COCINA → CRITERIOS) editables.

8. **Reuso explícito de patrones de Plan 4**: estructura de rutas `/admin/...`, capa de repositorios, audit log co-localizado, `useActionState` + `revalidatePath`/`revalidateTag` granular, fila editable con estado `saved`. Esto reduce la decisión arquitectónica y deja al ejecutor (Sonnet) seguir un esqueleto conocido.

9. **Alineación con CLAUDE.md**: cada decisión técnica se contrastó contra las convenciones del proyecto (tenant isolation vía repos + `forOrg` cuando aplica, naming bilingüe — `Plantilla` en UI / `ScoreTemplate` en código siguiendo el master plan, server actions sobre API routes, Zod en el borde, copy en `es.json`, `BusinessError` para errores de negocio, repositorios para todo lo de DB). Sin contradicciones.

---

## Preguntas abiertas para el usuario

Ninguna decisión arquitectónica queda pendiente. Tareas operacionales antes (o durante) la ejecución:

1. Confirmar que Prisma 7 + adapter-pg manejan `Decimal[]` sin fricción. Smoke test antes del feature work principal. Si falla, fallback documentado a `Json` (riesgo #1).
2. Confirmar si querés agregar el ADR-0003 (jerarquía Evento → Actividad → Posta) **ahora** como anticipación, o esperar a empezar Plan 4a. Recomendación: esperar a Plan 4a para no abrir un ADR sin código que lo refleje.
3. Si durante el form de creación detectás que la UX de "array dinámico de criterios" es confusa en mobile, evaluar el plan B: pre-crear plantilla con metadata + escala, redirigir al detalle, y agregar criterios desde ahí. Decisión durante ejecución, no bloquea el plan.

---

## Commits asociados

(Se completará al ejecutar el plan.)

| Hash | Mensaje |
|---|---|
| `0b3fc07` | `feat(schema): score templates con criterios y escala discreta` |
| `3eff6f9` | `feat(admin): CRUD de plantillas de puntaje con escalas y criterios` |

> Nota: los pasos 1–8 del plan se colapsaron en 2 commits (schema+repo y UI+copy) en lugar de uno por paso, para mantener los PRs atómicos y coherentes.
