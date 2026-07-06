# Plan 15 — Mover ScoreTemplate de Posta a Actividad

> Estado: ejecutado. Redactado con Claude Sonnet en conversación (no plan mode de Opus) a pedido explícito — es un refactor de modelo acotado, previo al Plan 16 (postas creadas por jueces), que se planificará con Opus.

---

## Contexto

Surgió al discutir el Plan 16 (permitir que los jueces carguen sus propias postas desde un form que hoy envían por Excel). Al decidir qué controla el juez al crear una posta, la conclusión fue: **el template de puntaje no debería vivir en la Posta, sino en la Actividad**. Todas las postas de una actividad puntúan con el mismo criterio (ej: "Actividad Habilidades Scout" define su rúbrica una sola vez, y las postas —estaciones físicas donde se ejecuta esa rúbrica— la heredan). Esto significa que cuando el admin crea la actividad, el método de puntuación ya queda definido, y el juez que carga una posta nueva (Plan 16) nunca necesita tocar criterios ni escalas.

Hoy (Plan 6b/6c) `templateId` vive en `Posta`, que es una entidad de biblioteca reutilizable entre eventos (`@@unique([organizationId, nombre])`). El template real que importa para puntuar es el de la instancia posta-en-esta-actividad, vía `AsignacionPosta`. Mover `templateId` a `Actividad` es un cambio de modelo autocontenido: no requiere nada del Plan 16 y se beneficia de completarse antes, para que ese plan no tenga que lidiar con la reubicación del campo a mitad de una feature nueva de cara al usuario.

### Adición: leyenda de qué significa cada valor de la escala, por posta

Las fichas de posta actuales (Excel) siempre detallan qué gana cada puntaje posible de la escala — ej. una posta de carreras con escala `[5, 7, 10]` especifica "3° lugar = 5, 2° lugar = 7, 1° lugar = 10". Hoy esa información no tiene dónde vivir: `TemplateCriterion.descripcion` describe el criterio en general (ej. "Evalúa coordinación de equipo"), no qué significa cada valor puntual, y `ScoreSheetForm` solo muestra botones numéricos sin leyenda. El significado de cada valor es **intrínseco a cómo funciona esa posta específica**, no a la actividad ni al template compartido (dos postas de la misma actividad, con la misma escala `[5,7,10]`, pueden puntuar cosas completamente distintas). Se decidió resolver esto en el mismo plan porque toca los mismos archivos que ya se estaban modificando (schema de `Posta`, `AsignacionPostaDialog`/`PostaDetailForm`, `ScoreSheetForm`).

---

## Alcance

### Incluye

- **Migración Prisma**: quitar `Posta.templateId` / `Posta.template`, agregar `Actividad.templateId` / `Actividad.template` (mismo tipo: `String?` con FK `onDelete: Restrict`).
- **Migración de datos**: backfill de `Actividad.templateId` a partir de los templates que ya tenían asignados sus postas (vía `AsignacionPosta`), con diagnóstico previo de conflictos (ver Decisión #2).
- **`isTemplateLocked`** (`score-template.repo.ts`): pasa de contar `Posta` a contar `Actividad`.
- **`posta.repo.ts`**: `createPosta`/`updatePosta` dejan de aceptar/validar `templateId`.
- **`evento.repo.ts`**: `addActividad`/`updateActividad` aceptan y validan `templateId` (pertenece a la org, no archivada); `_findById` cambia el `include` de `posta.template` a `actividad.template`; `canTransitionToActivo` cambia el gate de "cada posta asignada tiene template" a "cada actividad tiene template" (gate independiente del de "cada actividad tiene ≥1 asignación").
- **`score-sheet.repo.ts`**: las 3 queries que leen `asignacion.posta.template` pasan a leer `asignacion.actividad.template` (usado para render de `ScoreEntry`, snapshot del juez, y listado de planillas admin).
- **UI admin**:
  - `PostaForm.tsx` / `PostaDetailForm.tsx` (`/admin/postas`): se quita el selector de template.
  - `ActividadRow.tsx` / `AddActividadForm.tsx`: se agrega selector de template (select de `ScoreTemplate`s no archivados de la org).
  - `AsignacionRow.tsx` / `AsignacionPostaDialog.tsx` / `AsignacionesInActividad.tsx`: se quita toda referencia a `posta.template` (el badge de plantilla y la previsualización al elegir posta).
  - `/admin/eventos/[id]/page.tsx`: agrega fetch de `listScoreTemplates(org.organizationId)`, lo pasa a `ActividadRow`/`AddActividadForm`; el mapeo de `asignaciones`/`postasDisponibles` deja de incluir `templateId`/`template`.
  - `/admin/postas/actions.ts`, `/admin/postas/[id]/actions.ts`: se quita `templateId` de los Zod schemas.
  - `/admin/eventos/[id]/actions.ts`: `ActividadSchema` agrega `templateId` opcional/nullable; `addActividadAction`/`updateActividadAction` lo pasan al repo.
- **Copy `es.json`**: gates `postaSinPlantilla`/`postasSinPlantilla` → `actividadSinPlantilla`/`actividadesSinPlantilla`; nueva label de selector de template en el form de actividad; se quitan `admin.eventos.postas.conPlantilla`/`sinPlantilla` (badges por asignación) si quedan sin uso.
- **`prisma/seed.ts`**: mueve `templateId` de la creación de `Posta` a la creación de la `Actividad` correspondiente.
- **Campo nuevo `Posta.criteriosDescripciones` (Json)**: leyenda de qué significa cada valor de la escala, por criterio (o por el eje único en modo `PUNTAJE_UNICO`), editable desde `/admin/postas/[id]` una vez que la posta tiene al menos una asignación (momento en que se conoce el template en uso). Se muestra al juez en `ScoreSheetForm` junto a cada botón de la escala.
- **Tests**: `evento.repo.test.ts` (gates), `posta.repo.test.ts` (quitar casos de `templateId`, agregar casos de `criteriosDescripciones`), `score-template.repo.test.ts` (`isTemplateLocked` cuenta actividades), `score-sheet.repo.test.ts` (fixtures con `posta.criteriosDescripciones` y `actividad.template` en vez de `posta.template`).
- **Documentación pública** (`/docs`, Plan 11): `docs/administrador/page.tsx` y `docs/juez/page.tsx` describen el flujo viejo (plantilla asignada a la posta) — quedan desactualizados y hay que corregirlos.
- **ADR-0003**: agrega nota de amendment (mismo patrón que la nota post-ejecución que ya tiene el header de Plan 6b) señalando que el template se movió de `Posta` a `Actividad` en este plan.

### NO incluye

- El Plan 16 (jueces creando postas) — se planifica después, con Opus.
- Cambios a `AsignacionPosta` (`juezUserId`, `encargado`, `ayudantes`, `weight` siguen igual).
- Cambios al flujo/UI de asignar una posta existente a una actividad (`AsignacionPostaDialog` sigue funcionando igual, solo sin el campo de template).
- Permitir múltiples templates por actividad, o un template por `AsignacionPosta` — se decidió explícitamente uno por actividad.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **`templateId` vive en `Actividad`**, se elimina de `Posta` (no queda vestigial). | Dejarlo en ambos lugares; dejarlo en `AsignacionPosta` | Decidido en la conversación previa al plan: todas las postas de una actividad comparten criterio de puntaje. Dejarlo en ambos lados invita a inconsistencia (¿cuál manda?) sin ganancia. |
| 2 | **Backfill con diagnóstico previo**: antes de migrar, correr una query de solo lectura que detecte actividades cuyas postas asignadas ya tienen **más de un** `templateId` no-nulo distinto (el modelo viejo lo permitía; el nuevo no). Si no hay conflictos (esperado, dado el estado temprano del proyecto), backfill automático: `Actividad.templateId` = el único `templateId` no-nulo compartido por sus asignaciones, o `null` si ninguna posta tenía template asignado. Si hay conflictos, resolverlos manualmente antes de aplicar la migración. | Backfill ciego sin diagnóstico | El gate viejo (`canTransitionToActivo`) exigía que **cada posta individual** tuviera template, pero nunca exigió que fueran el mismo entre sí — una actividad activada con 2 postas y 2 templates distintos es válida hoy y perdería datos silenciosamente con un backfill ciego. |
| 3 | **Gate de activación se separa en dos**: `ACTIVIDAD_SIN_POSTAS` (ya existía, sin cambios) y `ACTIVIDAD_SIN_PLANTILLA` (nuevo, reemplaza a `POSTA_SIN_PLANTILLA`). Se siguen acumulando todos los errores (patrón Plan 6b decisión #22). | Un solo gate combinado | Son invariantes independientes: una actividad puede tener plantilla asignada y cero postas (o viceversa) mientras se arma el evento. Mensajes de error separados son más claros. |
| 4 | **Selector de template inline en `ActividadRow`/`AddActividadForm`**, no en un dialog aparte. | Dialog separado, análogo a `AsignacionPostaDialog` | Coherente con el patrón ya usado para nombre/tipo/peso de la actividad (fila editable inline, Plan 6a). El template es un atributo más de la actividad, no de la asignación. |
| 5 | **`isTemplateLocked` pasa a contar `Actividad`** en vez de `Posta`. Mismo mecanismo (`prisma.actividad.count({ where: { templateId } }) > 0`). | Recalcular vía join a través de `AsignacionPosta` | Ahora que el campo vive directo en `Actividad`, el count es una query simple sin joins. Semánticamente más preciso: una plantilla usada por una actividad queda lockeada aunque esa actividad tenga varias postas (antes, técnicamente, una plantilla quedaba lockeada por la primera posta que la usara). |
| 6 | **`templateId` opcional (`String?`) en `Actividad`**, igual que antes en `Posta`. El gate de activación sigue exigiendo no-null. | Obligatorio desde la creación de la actividad | Mismo razonamiento que Plan 6b decisión #4: permite armar la actividad en `BORRADOR` sin decidir el template todavía. |
| 7 | **Migración de schema en dos pasos dentro de la misma migración SQL**: 1) agregar `Actividad.templateId` nullable + backfill vía `UPDATE ... FROM`, 2) recién ahí `DROP COLUMN "Posta"."templateId"`. Se edita a mano el `migration.sql` generado por Prisma (patrón estándar para backfills: `prisma migrate dev --create-only`, insertar el `UPDATE` entre el `ADD COLUMN` y el `DROP COLUMN`, luego aplicar). | Dos migraciones separadas (agregar y luego, en un plan futuro, eliminar) | Una sola migración atómica evita una ventana intermedia donde ambos campos coexisten sin sincronizar. El proyecto es pequeño (bajo volumen de datos reales), por lo que el downtime de una migración con `UPDATE` es despreciable. |
| 8 | **`Posta.criteriosDescripciones: Json` en la Posta**, no en `AsignacionPosta`. | Guardarlo en `AsignacionPosta` como "dato por uso" (junto a `encargado`/`ayudantes`/`weight`) | El significado de cada valor es intrínseco a cómo funciona la posta (ej. "carrera": 3°/2°/1° siempre se puntúa igual), no a la logística puntual de un evento. Guardarlo por asignación obligaría a re-tipear la misma leyenda cada vez que se reusa la posta. Riesgo aceptado: si la misma posta se reasigna a una actividad con un template distinto, las claves viejas quedan huérfanas (se ignoran en el render, no rompen nada) y hay que completar las nuevas — degradación aceptable, no error duro. |
| 9 | **Forma del JSON**: `{ criterios?: Record<criterionId, Record<valorString, texto>>, unico?: Record<valorString, texto> }`. La clave `unico` cubre el modo `PUNTAJE_UNICO`, donde no hay `TemplateCriterion` (un solo eje de puntaje). | Un único mapa plano `Record<valor, texto>` sin distinguir por criterio | En modo `CRITERIOS`, el mismo valor numérico puede significar cosas distintas según el criterio ("10 en Tiempo" ≠ "10 en Trabajo en equipo"); hace falta namespacing por `criterionId`. `PUNTAJE_UNICO` no tiene criterios, de ahí la clave separada `unico`. |
| 10 | **Se edita desde `/admin/postas/[id]`**, agrupado por cada `templateId` distinto entre las asignaciones actuales de la posta (normalmente uno solo, ya que la misma posta suele reusarse en el mismo tipo de actividad). No se edita desde `AsignacionPostaDialog`. | Editar en el dialog de asignación (`/admin/eventos/[id]`) | El dialog ya es denso (juez, encargado, ayudantes, peso) y es modal — un editor de N criterios × M valores con texto libre no entra cómodo ahí. `PostaDetailForm` es una página completa dedicada a la posta, con espacio para una sección extra, y es coherente con que la leyenda es un atributo de la posta, no de la asignación (decisión #8). |
| 11 | **Sin validación relacional estricta contra `TemplateCriterion`** (mismo tratamiento que `Posta.materiales`, ya JSON libre). La UI solo *sugiere* qué llenar (los criterios/valores del template vigente), pero no se valida server-side que las claves coincidan exactamente. | Validar que las claves del JSON coincidan con criterios/valores reales del template activo | Postas con múltiples asignaciones a templates distintos harían la validación estricta innecesariamente compleja (¿contra cuál template validar?). El costo de un JSON "sucio" es bajo (simplemente no se muestra nada para esa clave) y es consistente con el resto de campos JSON del proyecto (`materiales`). |

---

## Modelo de datos

### Schema Prisma — diff

```prisma
model Actividad {
  id           String        @id @default(cuid(2))
  eventoId     String
  nombre       String
  descripcion  String?
  tipo         ActividadTipo
  pesoRelativo Decimal       @db.Decimal(5, 2)
+ templateId   String?
  orden        Int
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  evento       Evento            @relation(fields: [eventoId], references: [id], onDelete: Cascade)
+ template     ScoreTemplate?    @relation(fields: [templateId], references: [id], onDelete: Restrict)
  asignaciones AsignacionPosta[]

  @@unique([eventoId, orden])
  @@index([eventoId])
+ @@index([templateId])
}

model Posta {
  id              String   @id @default(cuid(2))
  organizationId  String
  nombre          String
  descripcion     String?
  duracionMinutos Int?
- templateId      String?
  materiales      Json     @default("[]")
+ criteriosDescripciones Json @default("{}")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  organization Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
- template     ScoreTemplate?    @relation(fields: [templateId], references: [id], onDelete: Restrict)
  asignaciones AsignacionPosta[]

  @@unique([organizationId, nombre])
  @@index([organizationId])
- @@index([templateId])
}

model ScoreTemplate {
  // ... campos existentes ...
- postas       Posta[]
+ actividades  Actividad[]
}
```

### Migración SQL (a editar a mano tras `prisma migrate dev --create-only --name move_template_to_actividad`)

```sql
-- 1. Agregar columna nullable + FK a Actividad
ALTER TABLE "Actividad" ADD COLUMN "templateId" TEXT;
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "ScoreTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Actividad_templateId_idx" ON "Actividad"("templateId");

-- 2. Backfill: para cada actividad, tomar el (único) templateId no-nulo
--    entre las postas de sus asignaciones. Si hay más de uno distinto,
--    este UPDATE deliberadamente no resuelve el conflicto (deja NULL) —
--    los conflictos deben quedar en cero tras el diagnóstico previo (Decisión #2).
UPDATE "Actividad" a
SET "templateId" = sub.template_id
FROM (
  SELECT ap."actividadId" AS actividad_id, MIN(p."templateId") AS template_id
  FROM "AsignacionPosta" ap
  JOIN "Posta" p ON p.id = ap."postaId"
  WHERE p."templateId" IS NOT NULL
  GROUP BY ap."actividadId"
  HAVING COUNT(DISTINCT p."templateId") = 1
) sub
WHERE a.id = sub.actividad_id;

-- 3. Quitar templateId de Posta
ALTER TABLE "Posta" DROP CONSTRAINT "Posta_templateId_fkey";
DROP INDEX "Posta_templateId_idx";
ALTER TABLE "Posta" DROP COLUMN "templateId";

-- 4. Nueva columna de leyenda por valor (sin relación a backfillear, arranca vacía)
ALTER TABLE "Posta" ADD COLUMN "criteriosDescripciones" JSONB NOT NULL DEFAULT '{}';
```

### Query de diagnóstico previo (correr manualmente antes de aplicar, en prod y en local)

```sql
SELECT ap."actividadId", COUNT(DISTINCT p."templateId") AS templates_distintos
FROM "AsignacionPosta" ap
JOIN "Posta" p ON p.id = ap."postaId"
WHERE p."templateId" IS NOT NULL
GROUP BY ap."actividadId"
HAVING COUNT(DISTINCT p."templateId") > 1;
```

Si devuelve filas: resolver manualmente (decidir qué template gana para esa actividad, reasignar las postas divergentes) antes de seguir. Si el proyecto solo tiene datos de seed/demo, regenerar el seed es la vía más simple.

---

## Implementación

### Paso 1 — Diagnóstico previo + schema y migración

- Correr la query de diagnóstico contra la DB local y (si aplica) producción.
- `prisma/schema.prisma`: aplicar el diff de arriba.
- `pnpm prisma migrate dev --create-only --name move_template_to_actividad`, editar el SQL generado insertando el `UPDATE` de backfill entre el `ADD COLUMN` y el `DROP COLUMN`.
- `pnpm prisma migrate dev` para aplicarla localmente; `pnpm prisma generate`.

Verificación: `\d "Actividad"` muestra `templateId`; `\d "Posta"` ya no lo tiene; una actividad con postas previamente templadas trae el `templateId` correcto tras el backfill.

Commit: `feat(schema): mover templateId de Posta a Actividad (Plan 15)`

---

### Paso 2 — `score-template.repo.ts`

- `isTemplateLocked`: `prisma.posta.count(...)` → `prisma.actividad.count({ where: { templateId } })`.

Verificación: test existente de "plantilla en uso no se puede editar/eliminar" pasa apuntando a una actividad en vez de una posta.

---

### Paso 3 — `posta.repo.ts`

- `CreatePostaData`/`UpdatePostaData`: quitar `templateId`.
- `createPosta`/`updatePosta`: quitar el bloque de validación de template y el `templateId` del `data` de creación/actualización.
- `listPostasParaEvento` (o el que alimente `postasDisponibles`): quitar `templateId`/`template` del `select`/`include` y del tipo de retorno.

---

### Paso 4 — `evento.repo.ts`

- `ActividadData`: agregar `templateId?: string | null`.
- `addActividad`/`updateActividad`: si `data.templateId` viene definido, validar `prisma.scoreTemplate.findFirst({ where: { id, organizationId, archivedAt: null } })` → `BusinessError("PLANTILLA_INVALIDA")` si no existe; incluirlo en el `data` del `create`/`update`.
- `_findById`: mover el `include: { template: {...} } }` de `posta` a `actividad` (al mismo nivel que `asignaciones`).
- `canTransitionToActivo`: el include ya no necesita `posta.templateId`; agregar `actividad.templateId` al select de actividades. Reemplazar el filtro `postasSinPlantilla` (por asignación) por `actividadesSinPlantilla` (`evento.actividades.filter(a => a.templateId === null)`), con código `ACTIVIDAD_SIN_PLANTILLA`.

---

### Paso 5 — `score-sheet.repo.ts`

Las 3 queries identificadas (guardado de planilla, listado admin de planillas, snapshot del juez): mover el `include: { template: {...} } }` de `posta` a `actividad`, y cambiar toda lectura `asignacion.posta.template` → `asignacion.actividad.template`. El `select`/`include` de `posta` en esas queries pierde el bloque de `template` pero conserva `nombre`/`descripcion` (siguen usándose para mostrar la posta).

Verificación: `src/lib/offline/snapshot.ts` y `ScoringView.tsx` no deberían necesitar cambios si el shape de salida (`template: { modo, criterios }` por asignación) se mantiene igual — solo cambia de dónde se lee server-side.

---

### Paso 6 — Server actions

- `/admin/postas/actions.ts`, `/admin/postas/[id]/actions.ts`: quitar `templateId` del Zod schema y del `raw`/llamada al repo.
- `/admin/eventos/[id]/actions.ts`: `ActividadSchema` agrega `templateId: z.string().optional().nullable()`; `addActividadAction`/`updateActividadAction` lo leen de `formData` y lo pasan al repo; el tipo `ActividadState.actividad` incluye `templateId`.

---

### Paso 7 — UI

- `PostaForm.tsx`, `PostaDetailForm.tsx`: quitar el `<select name="templateId">` y sus estados asociados (`templateId`, `savedTemplateId`, `isDirty` deja de compararlo).
- `AddActividadForm.tsx`: agregar `<select name="templateId">` con los templates recibidos por prop (no archivados), opción "— sin asignar —".
- `ActividadRow.tsx`: agregar estado `templateId`/`savedTemplateId` (mismo patrón que `nombre`/`tipo`/`peso`), select de template, sincronizado desde `editState.actividad.templateId` en el `useEffect`. Recibe la lista de templates como prop nueva.
- `AsignacionRow.tsx`, `AsignacionPostaDialog.tsx`, `AsignacionesInActividad.tsx`: quitar el tipo `Template`, el campo `template`/`templateId` de `Asignacion`/`PostaDisponible`, y el JSX que los renderiza (badge de plantilla en la fila, previsualización en el dialog).
- `/admin/eventos/[id]/page.tsx`: agregar `listScoreTemplates(org.organizationId)` al `Promise.all`, pasarlo a `ActividadRow` y `AddActividadForm`; actualizar los mapeos de `asignaciones`/`postasDisponibles` para no incluir `templateId`/`template` de la posta.

---

### Paso 8 — Copy `es.json`

- `admin.eventos.errors.preActivacion.postaSinPlantilla`/`postasSinPlantilla` → `actividadSinPlantilla`/`actividadesSinPlantilla` (ajustar texto: "actividad sin plantilla" en vez de "posta sin plantilla").
- Agregar label para el nuevo selector en el form de actividad (`admin.eventos.actividades.row.plantilla`, `plantillaSinAsignar`).
- Evaluar si `admin.eventos.postas.conPlantilla`/`sinPlantilla` quedan huérfanos tras quitar el badge de `AsignacionRow`; si no se usan en ningún otro lado, eliminarlos.

---

### Paso 9 — `posta.repo.ts`: guardar la leyenda de valores

- Nueva función `updateCriteriosDescripciones(organizationId, postaId, { scope: { criterioId: string } | { unico: true }, valores: Record<string, string> })`: hace merge-patch sobre el JSON existente (no lo reemplaza entero) — solo toca la clave `criterios[criterioId]` o `unico`, dejando intactas las entradas de otros templates si la posta tiene asignaciones múltiples (decisión #11: sin validación relacional estricta).
- Valida tenant (`findFirst({ where: { id: postaId, organizationId } })`) igual que el resto de mutaciones de posta.
- `revalidateTag(cacheTags.eventos(organizationId))` (mismo tag que ya invalida lecturas de postas/asignaciones).

---

### Paso 10 — UI admin: editor de leyenda en `/admin/postas/[id]`

- `findPostaById` (o el query de `/admin/postas/[id]/page.tsx`): incluir, por cada asignación, `actividad.template` con sus `criterios` (para poder agrupar por template distinto) y el `criteriosDescripciones` de la propia posta.
- Nuevo componente `src/components/admin/postas/CriteriosDescripcionesForm.tsx`: recibe la lista de templates distintos en uso (normalmente uno) con sus criterios/escala, y el JSON actual de la posta. Por cada template, renderiza: si `modo === "CRITERIOS"`, una sección por criterio con un input de texto por cada valor de `valoresValidos` (o `valoresValidosDesempate` si el criterio es `DESEMPATE`); si `modo === "PUNTAJE_UNICO"`, una sola sección con un input por valor de la escala.
- `/admin/postas/[id]/page.tsx`: renderizar `CriteriosDescripcionesForm` en una nueva sección, debajo de "Historial".
- Nueva server action `updateCriteriosDescripcionesAction` en `/admin/postas/[id]/actions.ts`, llamando a la función del Paso 9.

---

### Paso 11 — UI juez: mostrar la leyenda en `ScoreSheetForm`

- `score-sheet.repo.ts`: en las 3 queries del Paso 5, agregar `posta: { select: { criteriosDescripciones: true } }` (además de `nombre`/`descripcion`), y propagar ese campo en los DTOs que arman `Template`/`Criterio` para el cliente (snapshot del juez y save-path).
- `ScoreSheetForm.tsx`: extender el tipo `Criterio` con `descripcionesPorValor?: Record<string, string>` (resuelto server-side: para cada criterio, `criteriosDescripciones.criterios?.[criterio.id]`; para el modo `PUNTAJE_UNICO`, un campo aparte `descripcionesPuntajeUnico?: Record<string, string>` desde `criteriosDescripciones.unico`).
- `ScaleButtons`: aceptar prop opcional `descripciones?: Record<number, string>`; si viene, renderizar la leyenda como lista compacta debajo de los botones (ej. "5 → 3er lugar", "7 → 2do lugar", "10 → 1er lugar") en vez de intentar meter el texto dentro del botón (mantiene los botones dentro de `min-h-[56px] min-w-[60px]` sin romper el layout con texto largo).
- `ScoringView.tsx` / `src/lib/offline/snapshot.ts`: propagar el campo nuevo a través del tipo `SnapshotEntry` si hace falta (mismo patrón que el resto de campos denormalizados del snapshot, Plan 7c).

---

### Paso 12 — `prisma/seed.ts`

- Mover `templateId: templateConstruccion.id` (y análogos) de los objetos de creación de `Posta` a la creación de la `Actividad` correspondiente.
- Agregar `criteriosDescripciones` de ejemplo a **al menos dos** postas del seed, cubriendo los dos casos que la Verificación necesita mostrar sin cargar datos a mano:
  - La posta de navegación (`PUNTAJE_UNICO`, escala `[5,7,10]`): leyenda `unico` con 3°/2°/1° lugar (el ejemplo de este plan).
  - Una posta con template `CRITERIOS` (ej. "Amarres", 2+ criterios): leyenda distinta por `criterionId`, para poder verificar manualmente que no se mezclan entre criterios.
- Verificar que las queries de `templateCriterion.findMany({ where: { templateId: templateConstruccion.id } })` usadas más abajo en el seed para armar `ScoreEntry`s de ejemplo sigan funcionando (no dependen del lado Posta/Actividad, deberían ser transparentes).

---

### Paso 13 — Tests

- `evento.repo.test.ts`: actualizar fixtures y casos de `canTransitionToActivo` (gate `ACTIVIDAD_SIN_PLANTILLA` en vez de `POSTA_SIN_PLANTILLA`; casos con actividad+templateId válido/inválido/archivado).
- `posta.repo.test.ts`: quitar los casos de `templateId` en creación/edición de postas; agregar casos de `updateCriteriosDescripciones` (merge-patch no pisa otras claves, tenant isolation).
- `score-template.repo.test.ts`: `isTemplateLocked` — casos ahora contra `Actividad` en vez de `Posta`.
- `score-sheet.repo.test.ts`: si construye fixtures con `posta: { template: ... } }`, migrar a `actividad: { template: ... } }`; agregar caso donde `criteriosDescripciones` llega al DTO del juez.
- `pnpm typecheck`, `pnpm lint`, `pnpm test` — sin errores, mismo conteo de tests (± los ajustados).

---

### Paso 14 — Documentación

- **`docs/adr/0003-jerarquia-evento-actividad-posta.md`**: agregar un bloque de nota (mismo formato que el que ya tiene el header de `docs/plans/06b-postas-patrullas-jueces.md` para el refactor de Plan 6c) señalando que la línea 19 ("las postas... cada una con su plantilla de puntaje") y el diagrama de la línea 33 (`Posta (plantilla, ScoreSheet por patrulla)`) reflejan el modelo previo a Plan 15; el template ahora vive en `Actividad`. No se reescribe el cuerpo histórico del ADR, solo se anota.
- **`docs/plans/06b-postas-patrullas-jueces.md`** y **`docs/plans/06c-postas-biblioteca.md`**: agregar una línea a la nota post-ejecución existente (o crear una si falta) apuntando a Plan 15 como el que movió `templateId` fuera de `Posta`.
- **`src/app/(docs)/docs/administrador/page.tsx`**:
  - Sección 4 ("Plantillas de puntaje"): "Una plantilla define cómo se puntúa una posta" → "...cómo se puntúa una actividad".
  - Sección 5 ("Crear un evento"): agregar que, al crear cada actividad, también se elige su plantilla de puntaje (antes era un paso de la posta).
  - Sección 6 ("Biblioteca de postas"): quitar "y una plantilla de puntaje" de la lista de campos de la posta; agregar mención a la leyenda opcional de qué significa cada puntaje (`criteriosDescripciones`), editable una vez que la posta está asignada a una actividad.
  - Sección 9 ("Activar el evento"): el checklist de gates debe reflejar `ACTIVIDAD_SIN_PLANTILLA` (ej. "Cada actividad tiene una plantilla asignada") en vez de implicar que la plantilla es de la posta.
- **`src/app/(docs)/docs/juez/page.tsx`**: en la sección "Evaluá cada criterio", agregar que cada valor de la escala puede tener una leyenda que explica qué significa (cuando el admin la cargó).

## Cambio adicional (post-plan): discoverability de la leyenda incompleta

Al hacer el click-through manual (Verificación #2), surgió un hueco: el dialog de asignar posta a actividad no muestra la leyenda a propósito (decisión #10 — evita sobrecargarlo), pero eso dejaba sin ningún indicio de que faltaba completarla tras asignar.

**Fix**: `AsignacionRow` ahora muestra un badge "⚠ Sin leyenda de puntajes" con link a `/admin/postas/[id]` cuando `criteriosDescripciones` de la posta no cubre todos los criterios (o el eje único) del template vigente de la actividad. Se calcula server-side en `/admin/eventos/[id]/page.tsx` (`isLeyendaCompleta`), comparando contra `actividad.template.criterios` — expandido el `select` de `template` en `evento.repo.ts` (`_findById`) para incluir `modo` y `criterios`. Verificado con un script runtime contra datos reales, incluyendo el caso "posta reusada con un template distinto" (decisión #8): vuelve a marcar incompleta para el nuevo contexto sin romper nada.

### Archivos

- `src/repositories/evento.repo.ts`: `_findById` — `template.select` agrega `modo` y `criterios: { select: { id, tipo } }`.
- `src/app/(app)/admin/eventos/[id]/page.tsx`: función `isLeyendaCompleta`, computada por asignación.
- `src/components/admin/eventos/ActividadRow.tsx`, `AsignacionesInActividad.tsx`: tipo `Asignacion` agrega `leyendaCompleta: boolean`.
- `src/components/admin/eventos/AsignacionRow.tsx`: renderiza el badge.
- `src/messages/es.json`: `admin.eventos.postas.leyendaIncompleta`.

---

## Verificación

**Cómo se verificó**: sin browser disponible en el entorno de ejecución (no hay `chromium-cli` ni herramienta de automatización), y siguiendo la convención del proyecto de no dejar `pnpm dev` corriendo en background. Se usó en su lugar: `pnpm build` completo (compila y prerenderiza las 31 rutas, incluidas `/admin/eventos/[id]`, `/admin/postas/[id]`, `/juez/[[...slug]]`, `/docs/administrador`, `/docs/juez`, sin errores), un script ad-hoc con `tsx` que ejecuta las queries reales de Prisma contra la DB reseedeada (equivalente a correr `getSnapshotParaJuez`/`findPostaById` directamente) para confirmar el shape en runtime, y lectura del código de cada componente/action involucrado. Los escenarios 2–4 y 6–8 (interacción de UI en el browser) quedan **pendientes de click-through manual** por quien retome este plan — están razonablemente cubiertos por el trace de código + el runtime check, pero no fueron clickeados en un browser real.

1. ✅ **Migración limpia**: verificado contra la DB real. La query de diagnóstico encontró **2 conflictos reales** antes de migrar (una posta reusada en la misma actividad que otra con template distinto, uno en un evento ya `ACTIVO` sin planillas cargadas). El backfill dejó esas 2 actividades en `templateId = null` como estaba previsto; las demás quedaron con el template correcto. Se corrigió el seed (ver Paso 12) y se re-corrió `prisma migrate reset` + seed — la DB resultante no tiene conflictos (verificado con la misma query, 0 filas).
2. ⏳ **Admin crea actividad con template** — pendiente de click-through manual (cubierto por lectura de código: `AddActividadForm`/`ActividadRow` tienen el selector, `addActividad`/`updateActividad` lo validan y persisten).
3. ⏳ **Gate de activación** — pendiente de click-through manual (cubierto por test unitario nuevo: "actividad sin plantilla lanza PRE_ACTIVACION_INCOMPLETA con ACTIVIDAD_SIN_PLANTILLA").
4. ⏳ **Lock de plantilla** — pendiente de click-through manual (`isTemplateLocked` cuenta `Actividad`, mismo mecanismo que antes con `Posta`, sin tests previos que actualizar más allá del código en sí).
5. ✅ **Scoring sin cambios de cara al juez cuando no hay leyenda cargada**: verificado con el script runtime — `Torre de pionerismo` y `Desayuno de campamento` (sin `criteriosDescripciones`) devuelven `descripcionesPorValor: undefined` por criterio, que `ScaleButtons` trata como "sin leyenda" (no renderiza la lista).
6. ✅ **Leyenda por valor, caso "carrera"**: verificado con el script runtime contra datos reales — la posta "Orientación con brújula" (actividad `PUNTAJE_UNICO`) devuelve `descripcionesPuntajeUnico` con las 5 leyendas cargadas en el seed. Falta el click-through visual del render final en el browser.
7. ✅ **Leyenda con múltiples criterios**: verificado con el script runtime — la posta "Amarres básicos" devuelve leyendas distintas y correctamente separadas para "Técnica de amarres" y "Solidez estructural" (no se mezclan), mientras que "Presentación"/"Espíritu scout" (sin leyenda cargada) devuelven `undefined`.
8. ✅ **Reuso con template distinto**: cubierto conceptualmente por el diseño (JSON namespaced por `criterionId`, sin validación relacional) y por el propio caso real encontrado en el diagnóstico de la migración (postas reusadas entre actividades con templates distintos no rompieron nada). No se probó reasignando una posta con leyenda ya cargada a mano.
9. ✅ **Documentación pública consistente**: `/docs/administrador` (secciones 4, 5, 6, 9) y `/docs/juez` actualizadas — releídas tras la edición, ninguna sigue describiendo "la posta tiene una plantilla".
10. ✅ **`pnpm typecheck`, `pnpm lint`, `pnpm test`** pasan sin errores — 125 tests (115 previos + 10 nuevos: 5 en `evento.repo.test.ts` para el gate y validación de `templateId`, 5 en `posta.repo.test.ts` nuevo para `updateCriteriosDescripciones`).
