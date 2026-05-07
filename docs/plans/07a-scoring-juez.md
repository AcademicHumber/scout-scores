# Plan 7a — Scoring online y vista del juez

> Estado: ejecutado. Plan redactado con Claude Opus 4.7 y ejecutado con Claude Sonnet 4.6.

---

## Contexto

Plan 6 entregó toda la estructura administrativa: el admin puede armar la biblioteca de plantillas (5), montar eventos con actividades (6a), publicar postas reutilizables (6c) y asignarlas a actividades con juez, encargado y peso por uso (6b/6c). Hoy un evento puede activarse correctamente (gates de pre-activación), pero no hay forma de cargar puntajes: el modelo `ScoreSheet` no existe, el juez no tiene una vista propia, y la función `isEventoLocked()` retorna `false` indefinidamente.

Plan 7a cierra el ciclo de scoring **online**: el juez entra desde el celular, ve su lista de eventos activos, las postas que le tocan, y carga puntajes para cada patrulla. La planilla puede guardarse en borrador o enviarse en firme; al enviar, se calcula el total cacheado para que Plan 8 (leaderboard) lo lea sin recomputar. El admin puede reabrir planillas enviadas si un juez se equivoca, y el cierre del evento queda gateado a que todas las planillas estén en firme.

**Pieza clave que activa este plan**: `isEventoLocked()` empieza a retornar `true` cuando hay al menos una `ScoreSheet` enviada en el evento. Eso bloquea automáticamente todas las mutaciones de estructura (actividades, asignaciones, plantillas en uso) que ya tenían el gate listo en Plans 5–6. La capa estructural se "congela" sola al primer puntaje cargado.

**Lo que NO entra**: sync offline / PWA (Plan 7b), leaderboard y reportes (Plan 8), correcciones post-cierre con auditoría especial (Plan 9). El juez de 7a opera siempre online.

---

## Alcance

### Incluye

- **Modelos `ScoreSheet` y `ScoreEntry`** con estado `BORRADOR | ENVIADA`, soporte para los dos modos de plantilla (`CRITERIOS` con múltiples entries, `PUNTAJE_UNICO` con campo directo en `ScoreSheet`), y totales cacheados (`totalPuntuable`, `totalDesempate`) que se calculan al enviar.
- **`isEventoLocked()` activado**: cuenta `ScoreSheet` en estado `ENVIADA` cuyo evento sea el indicado. Se vuelve `true` apenas se envíe la primera planilla del evento.
- **Repositorio `score-sheet.repo.ts`** con queries cacheadas (tag `scoreSheets:orgId`) y mutaciones validadas: upsert de borrador, envío en firme, reapertura por admin, listados para el juez y para el admin.
- **Layout y rutas del juez** en `/juez/*`: lista de eventos activos con postas asignadas, vista de posta con lista de patrullas y estado de cada planilla, formulario de carga mobile-first.
- **Mobile-first real**: touch targets ≥ 48px (Plan 3c), selects grandes con todos los valores de la escala visibles como botones grupales, layout vertical apilado, sin sidebar. El juez opera con el celular en la mano durante el evento.
- **Vista pública del juez**: dentro de una posta, el juez ve TODAS las patrullas con su estado (Sin cargar / Borrador / Enviada) y puntaje cargado. Permite revisar coherencia entre patrullas. Decisión consciente; el sesgo es aceptable porque replica el flujo de papel.
- **Server actions del juez**: `saveScoreSheetAction` (upsert en borrador, autoriza al juez asignado o admin), `submitScoreSheetAction` (transición a ENVIADA, valida completitud según modo), `reopenScoreSheetAction` (solo admin).
- **Vista de admin para planillas del evento**: ruta nueva `/admin/eventos/[id]/planillas` que lista todas las planillas con su estado, autor del envío, totales y botón "Reabrir" por planilla ENVIADA.
- **Gate `canTransitionToCerrado`**: en `transicionarEstado(... target = CERRADO)`, validar que TODA combinación `(asignacion × patrulla)` tenga su `ScoreSheet` en estado ENVIADA. Si falta alguna, lanzar `BusinessError("CIERRE_INCOMPLETO")` con la lista de pares faltantes (patrón idéntico a `canTransitionToActivo`).
- **Validación server-side de valores**: cada `ScoreEntry.valor` debe pertenecer a la escala efectiva de su criterio (`escalaEfectivaParaCriterio` ya existe en `score-template.repo.ts`). Para puntaje único, debe pertenecer a `template.valoresValidos`.
- **Validación server-side del juez**: solo el juez asignado a la posta (`asignacion.juezUserId`) o un ADMIN del distrito puede editar/enviar planillas de esa posta. Cualquier otra membership rebota con `BusinessError("FORBIDDEN_NO_ASIGNADO")`.
- **AuditLog** para cada acción: `scoreSheet.saved`, `scoreSheet.submitted`, `scoreSheet.reopened`. La trazabilidad de cambios viene del audit log; no hay tabla de revisiones.
- **Copy en `es.json`** para los namespaces nuevos: `juez.*` y `admin.eventos.planillas.*`.
- **Tests Vitest** para `score-sheet.repo.ts` (autorización, validación de valores fuera de escala, transición BORRADOR → ENVIADA, cálculo de totales) y para `evento.repo.ts` (`canTransitionToCerrado`, `isEventoLocked` ahora retorna `true`).
- **Seed actualizado**: agregar al menos un evento ACTIVO con asignaciones, patrullas y un par de planillas de ejemplo (una BORRADOR y una ENVIADA) para que la vista del juez tenga datos al levantar.

### NO incluye

- **`ScoreSheetRevision`** — historial append-only por guardado. Se difiere a Plan 7b cuando aparezca la necesidad real (sync offline necesita `clientId`, conflict resolution, snapshot por revisión). Hoy basta `updatedAt` + AuditLog.
- **PWA / service worker / sync offline** — Plan 7b.
- **Leaderboard, ranking, reportes, exports CSV** — Plan 8.
- **Reapertura por el JUEZ** — solo ADMIN puede reabrir en 7a. Si el juez se equivoca, le pide al admin.
- **Notificaciones** al admin/juez (email, push, etc.).
- **Drag-and-drop** o reordenamiento de patrullas en la vista del juez. Lista ordenada por `Patrulla.nombre` ascendente (mismo orden que el detalle del evento).
- **Vista del jefe de patrulla y del espectador** — quedan para Plan 8 con el leaderboard.
- **Edición de la asignación o la posta desde la vista del juez** — solo lectura. Cambios estructurales siguen siendo del admin.
- **Validación de un valor "vacío" parcial dentro de un BORRADOR** — un BORRADOR puede tener entries faltantes y se guarda igual. La validación de completitud ocurre solo al ENVIAR.
- **Deshabilitar postas/actividades visibilmente en la UI de admin cuando `isEventoLocked = true`** — el gate ya está en el repo y devuelve `EVENTO_LOCKED`. La UI puede mostrar el error o, si el tiempo lo permite, deshabilitar visualmente; está como mejora opcional, no bloqueante.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **`ScoreSheet` mutable + AuditLog**, sin tabla de revisiones append-only. | `ScoreSheetRevision` con `clientId`, `clientSubmittedAt`, snapshot por revisión. | Decisión del usuario. Hoy no hay sync offline ni necesidad de reconciliar. AuditLog ya da trazabilidad. Plan 7b introducirá `ScoreSheetRevision` cuando los campos `clientId/clientSubmittedAt` se sepan justificar; diseñarlos ahora a ciegas casi seguro requiere refactor. |
| 2 | **`puntajeUnico Decimal?`** directamente en `ScoreSheet`, no como una `ScoreEntry` virtual. | `ScoreEntry` con `criterionId = null` para modo PUNTAJE_UNICO. | El modo PUNTAJE_UNICO no tiene criterios puntuables (regla de Plan 5). Modelarlo como un campo dedicado en `ScoreSheet` deja `ScoreEntry` siempre asociada a un `criterionId` real (FK obligatoria). En PUNTAJE_UNICO siguen pudiendo existir `ScoreEntry` para criterios DESEMPATE. |
| 3 | **Totales cacheados en `ScoreSheet`** (`totalPuntuable`, `totalDesempate`), calculados al enviar. | Calcular on-the-fly en cada lectura del leaderboard. | Plan 8 leerá miles de pares posta×patrulla para armar el ranking. Cachear el total al enviar evita recomputar. La invariante es simple: si `estado = ENVIADA`, los totales son válidos; al pasar a BORRADOR (reopen) se setean a `null`. |
| 4 | **`@@unique([asignacionPostaId, patrullaId])`** en `ScoreSheet`. Una sola planilla por par. | Múltiples planillas por par con la "actual" referenciada por FK. | Esta planilla **es** la actual; el historial vive en AuditLog. Constraint nativo de DB es la mejor garantía de unicidad. |
| 5 | **`@@unique([scoreSheetId, criterionId])`** en `ScoreEntry`. Un valor por criterio por planilla. | Permitir duplicados y tomar el último. | El editor del juez es un select por criterio. No tiene sentido tener dos valores. Constraint elimina ambigüedad. |
| 6 | **Vista del juez con patrullas y puntajes visibles** (no modo ciego). | Modo ciego (solo estado, sin puntajes). | Decisión del usuario. Replica el flujo de papel donde el juez ve su lista entera. El sesgo entre patrullas es aceptable y, sobre todo, ayuda a coherencia ("a esta le puse 90, a esta más o menos lo mismo"). |
| 7 | **Reapertura solo por ADMIN**, en `/admin/eventos/[id]/planillas`. | Dejarla al juez. Diferir a Plan 9. | Decisión del usuario. Necesario para casos triviales (juez se equivocó al enviar) sin esperar a Plan 9. JUEZ no puede reabrir las suyas para evitar manoseo de puntajes ya en firme. |
| 8 | **Gate estricto `canTransitionToCerrado`**: todas las planillas (asignaciones × patrullas) deben estar ENVIADAS. | Gate suave (advertencia que se puede ignorar). Diferirlo a Plan 9. | Decisión del usuario. Coherente con el patrón de `canTransitionToActivo`. Evita leaderboards rotos. Fácil de implementar reusando el helper. |
| 9 | **Lista del juez = eventos ACTIVOS donde tiene postas asignadas**. | Eventos en cualquier estado donde alguna vez tuvo postas. | El juez solo carga durante un evento activo. Los eventos cerrados/publicados ya no aceptan cargas. La vista no necesita listarlos. |
| 10 | **Autorización dual: juez asignado a la posta O cualquier ADMIN del distrito**. | Solo el juez asignado. | El admin puede hacer fallback si el juez se accidentó/se fue (común en eventos reales). El admin tiene un overlay del rol JUEZ implícito. |
| 11 | **Criterio "valor en escala"**: el `valor` debe pertenecer a `template.valoresValidos` (PUNTUABLE) o `template.valoresValidosDesempate` (DESEMPATE, con fallback a `valoresValidos` si está vacía — la regla de `escalaEfectivaParaCriterio`). | Permitir cualquier `Decimal`. | La escala discreta es la garantía de Plan 5 ("el juez no improvisa, elige de un set definido"). Validar server-side es invariante de schema. |
| 12 | **Layout `/juez` separado del layout `/admin`**. | Reutilizar el layout admin. | El juez no es admin: no tiene sidebar, no tiene navegación a "/admin". UI mobile-first dedicada con header simple. Limpia mentalmente. |
| 13 | **Tag de cache `scoreSheets:orgId`** separado de `eventos:orgId`. Se invalida al `saveScoreSheet`, `submitScoreSheet`, `reopenScoreSheet`. | Reusar `eventos:orgId`. | La página del juez solo lee planillas; no necesita refrescarse cuando el admin edita la metadata del evento. Tags separados = revalidaciones más finas. |
| 14 | **`enviadaByUserId` y `reopenedByUserId` en `ScoreSheet`** (denormalizados respecto al AuditLog). | Reconstruir desde AuditLog. | La vista admin de planillas necesita "enviada por X a las HH:mm" sin escanear el audit log. Denormalización aceptada por simplicidad. |
| 15 | **`onDelete: Cascade` en `ScoreSheet → AsignacionPosta` y `ScoreSheet → Patrulla`**. | Restrict. | Coherencia con el modelo: si el admin borra una asignación o una patrulla en un evento BORRADOR (antes de que haya planillas) no se cae nada; si el evento ya está ACTIVO con planillas, `isEventoLocked = true` ya bloquea el delete de la asignación, y `Patrulla` también puede protegerse en el mismo gate (ver Paso 5). El cascade es defensa secundaria. |
| 16 | **`onDelete: Restrict` en `ScoreEntry → TemplateCriterion`**. | Cascade. | Una plantilla nunca debería poder borrar criterios cuando hay entries cargadas — el gate `isTemplateLocked` ya impide eso al nivel de plantilla. Restrict es la red de seguridad final. |
| 17 | **`Decimal(8,2)` para `valor` de `ScoreEntry`** y `Decimal(10,2)` para totales cacheados. | `Decimal(5,2)` o sin precisión declarada. | Las escalas tienen valores chicos (ej: 1–10) pero el total puede crecer (suma de N criterios × weight). 10,2 cubre con margen sin sobredimensionar. |
| 18 | **Cálculo del total al ENVIAR (no en cada save)**. | Recalcular en cada save. | El total solo importa cuando la planilla está cerrada. En BORRADOR los totales son `null`. Al enviar se computa una vez y se persiste. |

---

## Modelo de datos

### Schema Prisma — modelos nuevos

```prisma
// ──────────────────────────────────────────────────────────────
// ScoreSheet — planilla del juez por (asignacion × patrulla)
// ──────────────────────────────────────────────────────────────

enum ScoreSheetEstado {
  BORRADOR
  ENVIADA
}

model ScoreSheet {
  id                String           @id @default(cuid(2))
  asignacionPostaId String
  patrullaId        String
  estado            ScoreSheetEstado @default(BORRADOR)

  // PUNTAJE_UNICO: valor directo de la planilla (validado contra template.valoresValidos)
  puntajeUnico      Decimal?         @db.Decimal(8, 2)

  // Totales cacheados (calculados al ENVIAR, null en BORRADOR)
  // totalPuntuable = (suma criterios PUNTUABLE × asignacion.weight) o (puntajeUnico × asignacion.weight)
  // totalDesempate = suma criterios DESEMPATE (NO multiplicado por weight)
  totalPuntuable    Decimal?         @db.Decimal(10, 2)
  totalDesempate    Decimal?         @db.Decimal(10, 2)

  // Metadata de envío y reapertura (denormalizada para la vista admin)
  enviadaAt         DateTime?
  enviadaByUserId   String?
  reopenedAt        DateTime?
  reopenedByUserId  String?

  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  asignacionPosta AsignacionPosta @relation(fields: [asignacionPostaId], references: [id], onDelete: Cascade)
  patrulla        Patrulla        @relation(fields: [patrullaId], references: [id], onDelete: Cascade)
  enviadaBy       User?           @relation("ScoreSheetEnviadaBy", fields: [enviadaByUserId], references: [id], onDelete: SetNull)
  reopenedBy      User?           @relation("ScoreSheetReopenedBy", fields: [reopenedByUserId], references: [id], onDelete: SetNull)
  entries         ScoreEntry[]

  @@unique([asignacionPostaId, patrullaId])
  @@index([asignacionPostaId])
  @@index([patrullaId])
  @@index([estado])
  @@index([enviadaByUserId])
}

// ──────────────────────────────────────────────────────────────
// ScoreEntry — un valor cargado por criterio dentro de una planilla
// ──────────────────────────────────────────────────────────────

model ScoreEntry {
  id           String   @id @default(cuid(2))
  scoreSheetId String
  criterionId  String
  valor        Decimal  @db.Decimal(8, 2)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  scoreSheet ScoreSheet        @relation(fields: [scoreSheetId], references: [id], onDelete: Cascade)
  criterion  TemplateCriterion @relation(fields: [criterionId], references: [id], onDelete: Restrict)

  @@unique([scoreSheetId, criterionId])
  @@index([scoreSheetId])
  @@index([criterionId])
}
```

### Cambios en modelos existentes

```prisma
model AsignacionPosta {
  // ...campos existentes...
  scoreSheets ScoreSheet[]   // NUEVA relación inversa
}

model Patrulla {
  // ...campos existentes...
  scoreSheets ScoreSheet[]   // NUEVA relación inversa
}

model TemplateCriterion {
  // ...campos existentes...
  entries ScoreEntry[]       // NUEVA relación inversa
}

model User {
  // ...campos existentes...
  scoreSheetsEnviadas  ScoreSheet[] @relation("ScoreSheetEnviadaBy")
  scoreSheetsReabiertas ScoreSheet[] @relation("ScoreSheetReopenedBy")
}
```

### Invariantes (documentar en código como comentarios)

- `ScoreSheet.estado = ENVIADA` ⇒ `enviadaAt != null`, `enviadaByUserId != null`, `totalPuntuable != null`, `totalDesempate != null`.
- `ScoreSheet.estado = BORRADOR` ⇒ `enviadaAt = null`, `enviadaByUserId = null`, `totalPuntuable = null`, `totalDesempate = null`. (Si fue reopened, `reopenedAt` y `reopenedByUserId` quedan setteados.)
- En modo `PUNTAJE_UNICO`: al ENVIAR, `puntajeUnico != null`. Las `ScoreEntry` que pudiera tener corresponden únicamente a criterios `DESEMPATE`.
- En modo `CRITERIOS`: al ENVIAR, debe existir una `ScoreEntry` por cada criterio `PUNTUABLE` de la plantilla. Los `DESEMPATE` son opcionales (se interpretan como 0 si faltan).
- `valor` de cada `ScoreEntry` debe pertenecer a la escala efectiva del criterio (ver `escalaEfectivaParaCriterio`).
- `puntajeUnico` debe pertenecer a `template.valoresValidos`.

### Migración

```bash
pnpm prisma migrate dev --name add_score_sheet_score_entry
pnpm prisma generate
pnpm db:seed   # seed actualizado con planillas demo
```

No es destructivo: solo agrega tablas y relaciones inversas. Si el seed previo tiene un evento ACTIVO/CERRADO sin planillas, la nueva versión del seed lo reemplaza con un evento que sí las tiene.

---

## Estructura de rutas

### Nuevas rutas — vista del juez

```
src/app/(app)/juez/
├── layout.tsx              ← header simple, sin sidebar, mobile-first
├── page.tsx                ← redirect a /juez/eventos
└── eventos/
    ├── page.tsx            ← lista de eventos ACTIVOS donde tiene postas
    └── [eventoId]/
        └── page.tsx        ← lista de postas asignadas en ese evento

src/app/(app)/juez/postas/
└── [asignacionId]/
    ├── page.tsx            ← lista de patrullas + estado de cada planilla
    ├── actions.ts          ← saveScoreSheetAction, submitScoreSheetAction
    └── [patrullaId]/
        └── page.tsx        ← formulario de carga (criterios o puntaje único)
```

### Nuevas rutas — admin

```
src/app/(app)/admin/eventos/[id]/
└── planillas/
    ├── page.tsx            ← matriz de planillas del evento por posta y patrulla
    └── actions.ts          ← reopenScoreSheetAction
```

### Server actions nuevas

```ts
// src/app/(app)/juez/postas/[asignacionId]/actions.ts
saveScoreSheetAction(asignacionId, patrullaId, formData) → guarda BORRADOR (upsert)
submitScoreSheetAction(asignacionId, patrullaId, formData) → guarda y envía (transaction)

// src/app/(app)/admin/eventos/[id]/planillas/actions.ts
reopenScoreSheetAction(scoreSheetId) → vuelve a BORRADOR, limpia totales
```

### Helpers de auth

`requireRole(["JUEZ", "ADMIN"])` en cada page del juez. Para acciones específicas (cargar/enviar puntaje en una posta) la repo layer hace una segunda verificación: el `userId` debe coincidir con `asignacion.juezUserId` o tener role `ADMIN`.

### Middleware

No hace falta tocar `auth.config.ts`. El middleware solo bloquea no-autenticados; la autorización por role (admin/juez) ya es responsabilidad del page via `requireRole`. La ruta `/juez/*` ya está cubierta por el matcher actual (`/((?!_next/static|_next/image|favicon.ico|.*\\.svg).*)`).

---

## Implementación

### Paso 1 — Schema y migración

Archivos:
- `prisma/schema.prisma` — agregar enum `ScoreSheetEstado`, modelos `ScoreSheet` y `ScoreEntry`, relaciones inversas en `AsignacionPosta`, `Patrulla`, `TemplateCriterion`, `User`.
- `prisma/seed.ts` — extender el seed: tomar el evento demo en estado ACTIVO, crear ≥2 patrullas si no las hay, crear ≥1 `ScoreSheet` BORRADOR y ≥1 ENVIADA con sus `ScoreEntry`.

```bash
pnpm prisma migrate dev --name add_score_sheet_score_entry
pnpm prisma generate
pnpm db:seed
```

Verificar:
- `\d "ScoreSheet"` en psql: tiene `asignacionPostaId`, `patrullaId`, `estado`, `puntajeUnico numeric(8,2)`, `totalPuntuable numeric(10,2)`, `totalDesempate numeric(10,2)`, `enviadaAt`, `enviadaByUserId`, `reopenedAt`, `reopenedByUserId`.
- `\d "ScoreEntry"`: tiene `scoreSheetId`, `criterionId`, `valor numeric(8,2)`.
- Los `@@unique` están aplicados (`scoresheet_asignacionpostaid_patrullaid_key`, `scoreentry_scoresheetid_criterionid_key`).
- El seed deja al menos una planilla ENVIADA en el evento ACTIVO (esto activa `isEventoLocked = true` para ese evento al levantar la app).

Commit: `feat(schema): ScoreSheet y ScoreEntry con totales cacheados`

---

### Paso 2 — Errores de negocio y cache tags

Archivo: `src/lib/errors.ts`.

Códigos nuevos:
- `SCORE_SHEET_NO_ENCONTRADA`
- `FORBIDDEN_NO_ASIGNADO` — el userId no es el juez asignado ni es ADMIN.
- `EVENTO_NO_ACTIVO` — intento de cargar/enviar en un evento que no está en estado ACTIVO.
- `VALOR_FUERA_DE_ESCALA` — meta: `{ criterioId?, esperados: number[], recibido: number }`.
- `PUNTAJE_UNICO_REQUERIDO` — al enviar en modo PUNTAJE_UNICO sin valor.
- `CRITERIOS_FALTANTES` — al enviar en modo CRITERIOS, faltan entries de criterios PUNTUABLE. Meta: `{ criterios: Array<{ id, nombre }> }`.
- `SCORE_SHEET_NO_ENVIADA` — intento de reabrir una planilla en BORRADOR.
- `CIERRE_INCOMPLETO` — meta: `{ faltantes: Array<{ posta, actividad, patrulla, estado }> }`.

Archivo: `src/repositories/cache-tags.ts`.

```ts
scoreSheets: (orgId: string) => `scoreSheets:${orgId}`,
```

Commit: incluido en el siguiente paso.

---

### Paso 3 — Repositorio `score-sheet.repo.ts`

Archivo nuevo: `src/repositories/score-sheet.repo.ts`.

#### Helpers internos

```ts
async function _findScoreSheetById(organizationId: string, scoreSheetId: string) {
  return prisma.scoreSheet.findFirst({
    where: {
      id: scoreSheetId,
      asignacionPosta: { actividad: { evento: { organizationId } } },
    },
    include: {
      asignacionPosta: {
        include: {
          posta: { include: { template: { include: { criterios: { orderBy: { orden: "asc" } } } } } },
          actividad: { include: { evento: true } },
        },
      },
      patrulla: true,
      entries: { include: { criterion: true } },
      enviadaBy: { select: { id: true, name: true, email: true } },
      reopenedBy: { select: { id: true, name: true, email: true } },
    },
  })
}

async function _requireAsignacionAccesible(
  organizationId: string,
  asignacionId: string,
  userId: string,
  isAdmin: boolean,
) {
  const asignacion = await prisma.asignacionPosta.findFirst({
    where: { id: asignacionId, actividad: { evento: { organizationId } } },
    include: {
      actividad: { include: { evento: { select: { id: true, estado: true } } } },
      posta: { include: { template: { include: { criterios: { orderBy: { orden: "asc" } } } } } },
    },
  })
  if (!asignacion) throw new BusinessError("ASIGNACION_NO_ENCONTRADA")
  if (!isAdmin && asignacion.juezUserId !== userId) throw new BusinessError("FORBIDDEN_NO_ASIGNADO")
  if (asignacion.actividad.evento.estado !== "ACTIVO") throw new BusinessError("EVENTO_NO_ACTIVO")
  return asignacion
}
```

#### Lecturas (cacheadas con `scoreSheets:orgId`)

```ts
// Lista de eventos ACTIVOS donde el juez tiene al menos una posta asignada.
// Si isAdmin = true, lista todos los eventos ACTIVOS.
listEventosParaJuez(organizationId, userId, isAdmin): Promise<EventoJuezSummary[]>

// Postas asignadas al juez en un evento (o todas si isAdmin) con conteo de planillas.
listPostasParaJuez(organizationId, eventoId, userId, isAdmin): Promise<PostaJuezSummary[]>
//   summary: { asignacionId, postaNombre, actividadNombre, plantillaModo, totalPatrullas, enviadas, borradores, sinCargar }

// Vista de una posta: todas las patrullas del evento con su ScoreSheet (o null) y estado/puntaje visible.
listPatrullasParaPosta(organizationId, asignacionId, userId, isAdmin): Promise<PatrullaPostaRow[]>
//   row: { patrulla, scoreSheet: { id, estado, puntajeMostrado: Decimal | null, enviadaAt } | null }
//   puntajeMostrado: si ENVIADA → totalPuntuable; si BORRADOR → null (no se muestra)

// Detalle de una planilla con su template y entries (modo edición).
findScoreSheetForJuez(organizationId, asignacionId, patrullaId, userId, isAdmin):
  Promise<{ scoreSheet: ScoreSheetCompleta | null, template: ScoreTemplateConCriterios, asignacion: AsignacionResumen }>
//   scoreSheet = null si nunca se cargó (primera vez para esa patrulla).

// Vista admin: todas las planillas de un evento agrupadas por asignación.
listPlanillasPorEventoAdmin(organizationId, eventoId): Promise<PlanillaEventoAdminGroup[]>
```

#### Mutaciones

```ts
type SaveScoreSheetData = {
  // Modo CRITERIOS: lista de entries.
  entries?: { criterionId: string; valor: Decimal }[]
  // Modo PUNTAJE_UNICO: valor directo (puede coexistir con entries de DESEMPATE).
  puntajeUnico?: Decimal | null
}

// Upsert en BORRADOR. Crea la ScoreSheet si no existe; reemplaza entries en bloque.
// Valida valores contra escala, NO valida completitud.
saveScoreSheet(
  organizationId,
  asignacionId,
  patrullaId,
  data: SaveScoreSheetData,
  actorUserId,
  isAdmin,
): Promise<{ id: string }>

// Transición BORRADOR → ENVIADA. Reusa saveScoreSheet internamente y luego:
//   - Valida completitud (criterios PUNTUABLE / puntajeUnico requerido)
//   - Calcula totalPuntuable y totalDesempate
//   - Setea enviadaAt, enviadaByUserId
submitScoreSheet(
  organizationId,
  asignacionId,
  patrullaId,
  data: SaveScoreSheetData,
  actorUserId,
  isAdmin,
): Promise<{ id: string; totalPuntuable: Decimal; totalDesempate: Decimal }>

// Reapertura: ENVIADA → BORRADOR. Solo ADMIN.
//   - Setea estado = BORRADOR
//   - Limpia totalPuntuable, totalDesempate
//   - Setea reopenedAt = now, reopenedByUserId = actorUserId
//   - Preserva entries y puntajeUnico (el juez ajusta lo que esté mal)
//   - NO toca enviadaAt/enviadaByUserId (dejan registro de quién envió por última vez)
reopenScoreSheet(organizationId, scoreSheetId, actorUserId): Promise<void>
```

#### Validación de valores (helper interno)

```ts
function validateValoresEnEscala(
  template: ScoreTemplateConCriterios,
  data: SaveScoreSheetData,
): void {
  const valoresPuntuable = template.valoresValidos.map((d) => d.toString())
  const valoresDesempate = (
    template.valoresValidosDesempate.length > 0
      ? template.valoresValidosDesempate
      : template.valoresValidos
  ).map((d) => d.toString())

  if (data.puntajeUnico != null) {
    if (!valoresPuntuable.includes(data.puntajeUnico.toString())) {
      throw new BusinessError("VALOR_FUERA_DE_ESCALA", {
        esperados: template.valoresValidos.map((d) => d.toNumber()),
        recibido: data.puntajeUnico.toNumber(),
      })
    }
  }

  for (const e of data.entries ?? []) {
    const criterio = template.criterios.find((c) => c.id === e.criterionId)
    if (!criterio) throw new BusinessError("CRITERIO_NO_ENCONTRADO")
    const escala = criterio.tipo === "DESEMPATE" ? valoresDesempate : valoresPuntuable
    if (!escala.includes(e.valor.toString())) {
      throw new BusinessError("VALOR_FUERA_DE_ESCALA", {
        criterioId: criterio.id,
        esperados: (criterio.tipo === "DESEMPATE"
          ? template.valoresValidosDesempate.length > 0
            ? template.valoresValidosDesempate
            : template.valoresValidos
          : template.valoresValidos
        ).map((d) => d.toNumber()),
        recibido: e.valor.toNumber(),
      })
    }
  }
}
```

#### Cálculo de totales (helper interno, usado en submit)

```ts
function calcularTotales(
  template: ScoreTemplateConCriterios,
  data: SaveScoreSheetData,
  weight: Decimal,
): { totalPuntuable: Decimal; totalDesempate: Decimal } {
  let sumaPuntuable = new Decimal(0)
  let sumaDesempate = new Decimal(0)

  if (template.modo === "PUNTAJE_UNICO") {
    if (data.puntajeUnico == null) throw new BusinessError("PUNTAJE_UNICO_REQUERIDO")
    sumaPuntuable = data.puntajeUnico
  } else {
    // CRITERIOS: validar que existan entries para todos los PUNTUABLE.
    const puntuables = template.criterios.filter((c) => c.tipo === "PUNTUABLE")
    const entriesById = new Map((data.entries ?? []).map((e) => [e.criterionId, e.valor]))
    const faltantes = puntuables.filter((c) => !entriesById.has(c.id))
    if (faltantes.length > 0) {
      throw new BusinessError("CRITERIOS_FALTANTES", {
        criterios: faltantes.map((c) => ({ id: c.id, nombre: c.nombre })),
      })
    }
    for (const c of puntuables) sumaPuntuable = sumaPuntuable.plus(entriesById.get(c.id)!)
  }

  // DESEMPATE: cada entry de criterio DESEMPATE suma directo (sin weight).
  for (const e of data.entries ?? []) {
    const criterio = template.criterios.find((c) => c.id === e.criterionId)
    if (criterio?.tipo === "DESEMPATE") sumaDesempate = sumaDesempate.plus(e.valor)
  }

  return {
    totalPuntuable: sumaPuntuable.times(weight),
    totalDesempate: sumaDesempate, // no se multiplica por weight
  }
}
```

#### Cache tags

- Mutaciones (`saveScoreSheet`, `submitScoreSheet`, `reopenScoreSheet`): `revalidateTag(cacheTags.scoreSheets(organizationId))` + `revalidateTag(cacheTags.eventos(organizationId))`.
  - El segundo tag se invalida porque `isEventoLocked` se lee desde `findEventoById` cacheado con tag `eventos:orgId`. Al enviar la primera planilla, el evento queda lockeado y la página de admin debe ver el cambio.

Commit: `feat(repo): score-sheet con borrador, envío, reapertura y totales cacheados`

---

### Paso 4 — Activar `isEventoLocked` y agregar `canTransitionToCerrado`

Archivo: `src/repositories/evento.repo.ts`.

Reemplazar `isEventoLocked`:

```ts
export async function isEventoLocked(eventoId: string): Promise<boolean> {
  const count = await prisma.scoreSheet.count({
    where: {
      estado: "ENVIADA",
      asignacionPosta: { actividad: { eventoId } },
    },
  })
  return count > 0
}
```

Agregar `canTransitionToCerrado`:

```ts
async function canTransitionToCerrado(eventoId: string): Promise<void> {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    include: {
      actividades: {
        include: {
          asignaciones: {
            include: {
              posta: { select: { id: true, nombre: true } },
              scoreSheets: { select: { patrullaId: true, estado: true } },
            },
          },
        },
      },
      patrullas: { select: { id: true, nombre: true } },
    },
  })
  if (!evento) throw new BusinessError("NOT_FOUND")

  type Faltante = { postaNombre: string; actividadNombre: string; patrullaNombre: string; estado: "SIN_CARGAR" | "BORRADOR" }
  const faltantes: Faltante[] = []

  for (const actividad of evento.actividades) {
    for (const asignacion of actividad.asignaciones) {
      for (const patrulla of evento.patrullas) {
        const sheet = asignacion.scoreSheets.find((s) => s.patrullaId === patrulla.id)
        if (!sheet) {
          faltantes.push({
            postaNombre: asignacion.posta.nombre,
            actividadNombre: actividad.nombre,
            patrullaNombre: patrulla.nombre,
            estado: "SIN_CARGAR",
          })
        } else if (sheet.estado === "BORRADOR") {
          faltantes.push({
            postaNombre: asignacion.posta.nombre,
            actividadNombre: actividad.nombre,
            patrullaNombre: patrulla.nombre,
            estado: "BORRADOR",
          })
        }
      }
    }
  }

  if (faltantes.length > 0) {
    throw new BusinessError("CIERRE_INCOMPLETO", { faltantes })
  }
}
```

Modificar `transicionarEstado` para llamar al gate cuando el target es `CERRADO`:

```ts
if (target === "ACTIVO") {
  await canTransitionToActivo(id)
}
if (target === "CERRADO") {
  await canTransitionToCerrado(id)
}
```

Tests (`evento.repo.test.ts`):
- `isEventoLocked` retorna `false` con evento sin scoreSheets ENVIADAS.
- `isEventoLocked` retorna `true` con al menos una scoreSheet ENVIADA.
- `canTransitionToCerrado` lista faltantes (SIN_CARGAR + BORRADOR) cuando no todas las planillas están enviadas.
- `canTransitionToCerrado` no lanza cuando el evento tiene 0 patrullas (no aplica; el gate se basa en producto cartesiano vacío). Igual debería ser bloqueado por `canTransitionToActivo` que requiere ≥1 patrulla, así que no es alcanzable.

Commit: `feat(repo): isEventoLocked activado y gate canTransitionToCerrado`

---

### Paso 5 — Server actions del juez

Archivo nuevo: `src/app/(app)/juez/postas/[asignacionId]/actions.ts`.

```ts
"use server"

import { z } from "zod"
import { requireRole } from "@/lib/auth-helpers"
import {
  saveScoreSheet,
  submitScoreSheet,
} from "@/repositories/score-sheet.repo"
import { BusinessError } from "@/lib/errors"
import { Decimal } from "@prisma/client/runtime/client"

// Esquema de entrada genérico (las dos actions lo comparten).
// El form serializa entries como JSON en un campo hidden, o como pares "valor_<criterionId>".
// Acá usamos JSON para simplicidad; el componente cliente lo arma.
const SaveSchema = z.object({
  entries: z.array(z.object({
    criterionId: z.string().min(1),
    valor: z.string(),
  })).default([]),
  puntajeUnico: z.string().nullable().default(null),
})

export type SaveScoreSheetState = {
  success?: true
  error?: string
  fieldErrors?: Record<string, string[]>
  // Información para el cliente cuando se envía: total cacheado.
  enviado?: { totalPuntuable: string; totalDesempate: string }
}

function mapError(err: BusinessError): SaveScoreSheetState {
  const map: Record<string, string> = {
    ASIGNACION_NO_ENCONTRADA: "Posta no encontrada",
    FORBIDDEN_NO_ASIGNADO: "No tenés permiso para cargar esta posta",
    EVENTO_NO_ACTIVO: "El evento no está activo",
    VALOR_FUERA_DE_ESCALA: "Hay valores fuera de la escala válida",
    PUNTAJE_UNICO_REQUERIDO: "Falta cargar el puntaje",
    CRITERIOS_FALTANTES: "Faltan criterios por completar",
    CRITERIO_NO_ENCONTRADO: "Criterio no encontrado",
  }
  return { error: map[err.code] ?? "Error inesperado" }
}

export async function saveScoreSheetAction(
  _prev: SaveScoreSheetState,
  formData: FormData,
): Promise<SaveScoreSheetState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const asignacionId = formData.get("asignacionId") as string
  const patrullaId = formData.get("patrullaId") as string

  const raw = {
    entries: JSON.parse((formData.get("entries") as string) || "[]"),
    puntajeUnico: (formData.get("puntajeUnico") as string) || null,
  }
  const result = SaveSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    await saveScoreSheet(
      org.organizationId,
      asignacionId,
      patrullaId,
      {
        entries: result.data.entries.map((e) => ({ criterionId: e.criterionId, valor: new Decimal(e.valor) })),
        puntajeUnico: result.data.puntajeUnico ? new Decimal(result.data.puntajeUnico) : null,
      },
      org.userId,
      org.role === "ADMIN",
    )
    return { success: true }
  } catch (err) {
    if (err instanceof BusinessError) return mapError(err)
    throw err
  }
}

export async function submitScoreSheetAction(
  _prev: SaveScoreSheetState,
  formData: FormData,
): Promise<SaveScoreSheetState> {
  const org = await requireRole(["JUEZ", "ADMIN"])
  const asignacionId = formData.get("asignacionId") as string
  const patrullaId = formData.get("patrullaId") as string

  const raw = {
    entries: JSON.parse((formData.get("entries") as string) || "[]"),
    puntajeUnico: (formData.get("puntajeUnico") as string) || null,
  }
  const result = SaveSchema.safeParse(raw)
  if (!result.success) {
    return { fieldErrors: result.error.flatten().fieldErrors as Record<string, string[]> }
  }

  try {
    const { totalPuntuable, totalDesempate } = await submitScoreSheet(
      org.organizationId,
      asignacionId,
      patrullaId,
      {
        entries: result.data.entries.map((e) => ({ criterionId: e.criterionId, valor: new Decimal(e.valor) })),
        puntajeUnico: result.data.puntajeUnico ? new Decimal(result.data.puntajeUnico) : null,
      },
      org.userId,
      org.role === "ADMIN",
    )
    return {
      success: true,
      enviado: { totalPuntuable: totalPuntuable.toString(), totalDesempate: totalDesempate.toString() },
    }
  } catch (err) {
    if (err instanceof BusinessError) return mapError(err)
    throw err
  }
}
```

Archivo nuevo: `src/app/(app)/admin/eventos/[id]/planillas/actions.ts`.

```ts
"use server"

import { requireRole } from "@/lib/auth-helpers"
import { reopenScoreSheet } from "@/repositories/score-sheet.repo"
import { BusinessError } from "@/lib/errors"

export type ReopenState = { success?: true; error?: string }

export async function reopenScoreSheetAction(
  _prev: ReopenState,
  formData: FormData,
): Promise<ReopenState> {
  const org = await requireRole(["ADMIN"])
  const scoreSheetId = formData.get("scoreSheetId") as string

  try {
    await reopenScoreSheet(org.organizationId, scoreSheetId, org.userId)
    return { success: true }
  } catch (err) {
    if (err instanceof BusinessError) {
      const map: Record<string, string> = {
        SCORE_SHEET_NO_ENCONTRADA: "Planilla no encontrada",
        SCORE_SHEET_NO_ENVIADA: "La planilla ya está en borrador",
      }
      return { error: map[err.code] ?? "Error inesperado" }
    }
    throw err
  }
}
```

Commit: incluido en el siguiente paso.

---

### Paso 6 — Layout y páginas del juez

#### Layout `/juez/layout.tsx`

Server Component. Header simple:
- Logo + texto "Puntajes Scout"
- Nombre del juez + distrito activo
- Botón "Cerrar sesión" (Client Component existente: `SignOutButton`)

Sin sidebar. Container con padding mobile-first (`max-w-2xl mx-auto px-4 py-4`).

```tsx
import { ReactNode } from "react"
import { requireRole } from "@/lib/auth-helpers"
import { SignOutButton } from "@/components/auth/SignOutButton"

export default async function JuezLayout({ children }: { children: ReactNode }) {
  const org = await requireRole(["JUEZ", "ADMIN"])
  return (
    <div className="min-h-dvh bg-stone-50">
      <header className="bg-brand text-white px-4 py-3 flex items-center justify-between">
        <div className="font-bold">Puntajes Scout</div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden sm:inline">{org.nombre}</span>
          <SignOutButton />
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-4">{children}</main>
    </div>
  )
}
```

#### `/juez/page.tsx`

```tsx
import { redirect } from "next/navigation"
export default function JuezIndex() { redirect("/juez/eventos") }
```

#### `/juez/eventos/page.tsx`

Server Component. Lista los eventos ACTIVOS donde el user tiene postas asignadas (o todos si es ADMIN).

```tsx
const eventos = await listEventosParaJuez(org.organizationId, org.userId, org.role === "ADMIN")
```

Cada item muestra: nombre del evento, fecha, lugar, conteo "X postas asignadas". Click → `/juez/eventos/[eventoId]`.

Estado vacío: "No tenés postas asignadas en eventos activos. Avisale al admin si pensás que es un error."

#### `/juez/eventos/[eventoId]/page.tsx`

Lista las postas del juez en ese evento. Por cada posta:
- Nombre de la posta (bold)
- Actividad a la que pertenece (subtítulo)
- Modo de la plantilla (badge: "Por criterios" / "Puntaje único")
- Estadística: `X / Y patrullas enviadas` (X enviadas, Y total)
- Si hay borradores: badge naranja "Z borradores"
- Click → `/juez/postas/[asignacionId]`

#### `/juez/postas/[asignacionId]/page.tsx`

Lista las patrullas del evento, ordenadas alfabéticamente por nombre. Cada fila:
- Nombre de la patrulla + grupo scout
- Badge de estado:
  - **Sin cargar** (gris): no hay `ScoreSheet`
  - **Borrador** (amarillo): hay sheet en BORRADOR
  - **Enviada** (verde): hay sheet en ENVIADA
- Si está ENVIADA: muestra `totalPuntuable.toFixed(2)` (con `weight` ya aplicado).
- Si está BORRADOR: NO muestra puntaje (los borradores no tienen totales).
- Click → `/juez/postas/[asignacionId]/[patrullaId]`

Header de la página: nombre de la posta, plantilla, descripción, materiales (opcional, colapsable).

#### `/juez/postas/[asignacionId]/[patrullaId]/page.tsx`

Server Component que carga la planilla con `findScoreSheetForJuez`. Render condicional según `template.modo`:

**Modo PUNTAJE_UNICO:**
- Título: "Cargar puntaje — [Patrulla X]"
- Banner verde "Planilla enviada" si `estado = ENVIADA` (formulario en read-only, sin botón submit, mostrar totales).
- Pregunta: "¿Cuál fue el puntaje?"
- Grid de botones grandes (touch target ≥ 48px, `min-h-12 min-w-16`) con cada valor de `template.valoresValidos`. El botón seleccionado tiene fondo brand. Click cambia el estado local.
- Si la plantilla tiene criterios DESEMPATE: una sección colapsable "Criterios de desempate" con un grupo de botones por criterio (escala efectiva).
- Botones de acción al pie: **Guardar borrador** (gris) y **Enviar** (brand, primario).

**Modo CRITERIOS:**
- Título idem.
- Banner si ENVIADA.
- Por cada criterio del template (ordenados, primero los PUNTUABLE, después los DESEMPATE):
  - Nombre del criterio + tipo (badge "Puntuable" / "Desempate") + descripción si existe.
  - Grid de botones con la escala efectiva del criterio.
  - El estado local mantiene un `Map<criterionId, Decimal>`.
- Botones al pie: idem.

**Cliente** (`ScoreSheetForm.tsx`):
- `useActionState(saveScoreSheetAction, ...)` y `useActionState(submitScoreSheetAction, ...)`.
- Cada botón de submit serializa el state en un campo hidden `entries` (JSON) y `puntajeUnico`.
- Tras éxito de submit, redirige a `/juez/postas/[asignacionId]` (Router push).
- Tras éxito de save, mostrar toast "Borrador guardado" sin redirección.
- Errores `VALOR_FUERA_DE_ESCALA` / `CRITERIOS_FALTANTES` se muestran en un banner rojo con mensaje del map.

Commit: `feat(juez): vista mobile-first con carga de borradores y envío de planillas`

---

### Paso 7 — Vista admin de planillas

#### `/admin/eventos/[id]/planillas/page.tsx`

Server Component. Carga `listPlanillasPorEventoAdmin`.

Layout:
- Encabezado con nombre del evento + estado.
- Por cada actividad, por cada asignación de posta, una sección con tabla:
  - Filas = patrullas del evento
  - Columnas: Patrulla, Estado, Puntaje (si ENVIADA), Enviada por, Hora envío, Acciones
  - Si la planilla está ENVIADA: muestra botón "Reabrir" (Client Component con confirmación).
  - Si está BORRADOR: muestra "—" en acciones (el admin no fuerza el envío).
  - Si no hay planilla: estado "Sin cargar", acciones vacías.
- Resumen al pie: "X / Y planillas enviadas" + barra de progreso.

#### Componente `ReopenButton.tsx`

Client Component. Form con `useActionState(reopenScoreSheetAction, ...)`. Confirmación nativa (`window.confirm`) antes de submit. Tras éxito, `router.refresh()`.

Commit: `feat(admin): vista de planillas del evento con reapertura por admin`

---

### Paso 8 — Sidebar admin: link a planillas

Archivo: identificar el componente que renderiza la sub-navegación dentro de un evento (`src/app/(app)/admin/eventos/[id]/...`). Probablemente es un nav-tabs en `page.tsx` o un componente compartido.

Agregar pestaña "Planillas" al lado de "Detalle" / "Patrullas" si esa estructura existe; o al menos un link prominente desde el detalle del evento (`/admin/eventos/[id]`) hacia `/admin/eventos/[id]/planillas` cuando el evento esté en estado ACTIVO o CERRADO.

Commit: incluido en el commit del Paso 7.

---

### Paso 9 — Copy en `es.json`

Agregar al final del objeto `admin`:

```json
"eventos": {
  "...": "...",
  "planillas": {
    "title": "Planillas del evento",
    "subtitle": "Estado de carga de puntajes por posta y patrulla",
    "verPlanillas": "Ver planillas",
    "headers": {
      "patrulla": "Patrulla",
      "estado": "Estado",
      "puntaje": "Puntaje",
      "enviadaPor": "Enviada por",
      "horaEnvio": "Hora",
      "acciones": "Acciones"
    },
    "estado": {
      "SIN_CARGAR": "Sin cargar",
      "BORRADOR": "Borrador",
      "ENVIADA": "Enviada"
    },
    "reabrir": "Reabrir",
    "reabrirConfirm": "¿Reabrir la planilla de \"{{patrulla}}\"? El juez podrá editarla nuevamente.",
    "reabrirSuccess": "Planilla reabierta",
    "resumen": "{{enviadas}} de {{total}} planillas enviadas",
    "errors": {
      "noEncontrada": "Planilla no encontrada",
      "yaEnBorrador": "La planilla ya está en borrador"
    },
    "cierre": {
      "intro": "No se puede cerrar el evento. Faltan planillas:",
      "faltante": "{{patrulla}} en {{posta}} ({{actividad}}) — {{estado}}"
    }
  }
}
```

Y agregar al objeto raíz un namespace nuevo `juez`:

```json
"juez": {
  "eventos": {
    "title": "Mis eventos",
    "subtitle": "Eventos activos donde tenés postas asignadas",
    "empty": "No tenés postas asignadas en eventos activos.",
    "postasCount": "{{count}} posta",
    "postasCountPlural": "{{count}} postas"
  },
  "evento": {
    "postasTitle": "Mis postas en este evento",
    "empty": "No tenés postas asignadas en este evento.",
    "stats": "{{enviadas}}/{{total}} enviadas{{borradores, plural, =0{} other{ · # borradores}}}"
  },
  "posta": {
    "patrullasTitle": "Patrullas",
    "estado": {
      "SIN_CARGAR": "Sin cargar",
      "BORRADOR": "Borrador",
      "ENVIADA": "Enviada"
    },
    "modo": {
      "CRITERIOS": "Por criterios",
      "PUNTAJE_UNICO": "Puntaje único"
    }
  },
  "planilla": {
    "titleNueva": "Cargar puntaje — {{patrulla}}",
    "titleEditar": "Editar puntaje — {{patrulla}}",
    "enviada": "Planilla enviada",
    "enviadaSubtitle": "Esta planilla ya fue enviada. Si necesitás corregirla, pedile al admin que la reabra.",
    "puntajeUnico": "Puntaje",
    "criterios": "Criterios puntuables",
    "criteriosDesempate": "Criterios de desempate",
    "criterioPuntuable": "Puntuable",
    "criterioDesempate": "Desempate",
    "guardarBorrador": "Guardar borrador",
    "enviar": "Enviar",
    "enviadoToast": "¡Planilla enviada! Total: {{total}}",
    "borradorToast": "Borrador guardado",
    "errors": {
      "valorFueraDeEscala": "El valor seleccionado no está en la escala válida",
      "puntajeUnicoRequerido": "Cargá el puntaje antes de enviar",
      "criteriosFaltantes": "Faltan criterios por completar: {{nombres}}",
      "noAsignado": "No tenés permiso para cargar esta posta",
      "eventoNoActivo": "El evento no está activo"
    }
  }
}
```

Y extender `admin.eventos.errors` con el patrón de cierre incompleto:

```json
"errors": {
  "...": "...",
  "cierreIncompleto": "No se puede cerrar el evento. Faltan {{count}} planillas por enviar."
}
```

Commit: incluido en el commit del Paso 7.

---

### Paso 10 — Manejo del error `CIERRE_INCOMPLETO` en la action existente

Archivo: `src/app/(app)/admin/eventos/[id]/actions.ts`, función `transicionarEstadoAction`.

Agregar manejo del nuevo `BusinessError("CIERRE_INCOMPLETO")` similar al de `PRE_ACTIVACION_INCOMPLETA`. Reusar el patrón de `buildPreActivacionMessage` con un nuevo helper `buildCierreIncompletoMessage`:

```ts
function buildCierreIncompletoMessage(faltantes: Array<{
  postaNombre: string
  actividadNombre: string
  patrullaNombre: string
  estado: "SIN_CARGAR" | "BORRADOR"
}>): string {
  const lines: string[] = ["No se puede cerrar el evento. Faltan planillas:"]
  // Agrupar por posta/actividad
  const grupos = new Map<string, typeof faltantes>()
  for (const f of faltantes) {
    const key = `${f.postaNombre}|${f.actividadNombre}`
    if (!grupos.has(key)) grupos.set(key, [])
    grupos.get(key)!.push(f)
  }
  for (const [key, items] of grupos) {
    const [postaNombre, actividadNombre] = key.split("|")
    lines.push(`• ${postaNombre} (${actividadNombre})`)
    for (const i of items) {
      const estadoLabel = i.estado === "SIN_CARGAR" ? "sin cargar" : "borrador"
      lines.push(`    - ${i.patrullaNombre} — ${estadoLabel}`)
    }
  }
  return lines.join("\n")
}
```

Y en el catch de `transicionarEstadoAction`:

```ts
if (err.code === "CIERRE_INCOMPLETO") {
  const meta = err.meta as { faltantes: Faltante[] }
  return { error: buildCierreIncompletoMessage(meta.faltantes) }
}
```

Commit: `feat(eventos): mensaje de cierre incompleto en transicionarEstadoAction`

---

### Paso 11 — Tests Vitest

Archivo nuevo: `src/repositories/score-sheet.repo.test.ts`.

Casos:
1. `saveScoreSheet` por juez asignado → ok, crea ScoreSheet en BORRADOR.
2. `saveScoreSheet` por juez NO asignado y NO admin → `FORBIDDEN_NO_ASIGNADO`.
3. `saveScoreSheet` por admin sin ser el juez asignado → ok.
4. `saveScoreSheet` con valor fuera de escala → `VALOR_FUERA_DE_ESCALA`.
5. `saveScoreSheet` upsert: segundo save reemplaza entries en bloque.
6. `submitScoreSheet` modo PUNTAJE_UNICO sin valor → `PUNTAJE_UNICO_REQUERIDO`.
7. `submitScoreSheet` modo CRITERIOS sin todas las entries de PUNTUABLE → `CRITERIOS_FALTANTES`.
8. `submitScoreSheet` ok modo CRITERIOS con escala secundaria de DESEMPATE → calcula totales correctamente (totalPuntuable = sum × weight; totalDesempate = sum sin weight).
9. `submitScoreSheet` ok modo PUNTAJE_UNICO → totalPuntuable = puntajeUnico × weight; totalDesempate = sum entries DESEMPATE.
10. `submitScoreSheet` con evento NO ACTIVO → `EVENTO_NO_ACTIVO`.
11. `reopenScoreSheet` por admin → ok, estado = BORRADOR, totales = null, reopenedAt setteado.
12. `reopenScoreSheet` sobre planilla en BORRADOR → `SCORE_SHEET_NO_ENVIADA`.

Archivo: `src/repositories/evento.repo.test.ts` (extender).

Casos nuevos:
13. `isEventoLocked` retorna `true` con al menos una ScoreSheet ENVIADA.
14. `isEventoLocked` retorna `false` con solo BORRADORES.
15. `canTransitionToCerrado` con todas las planillas ENVIADAS → no lanza.
16. `canTransitionToCerrado` con planilla SIN_CARGAR → `CIERRE_INCOMPLETO`, faltantes incluye el item.
17. `canTransitionToCerrado` con planilla BORRADOR → `CIERRE_INCOMPLETO`, faltantes incluye con estado "BORRADOR".

Mock pattern: igual que en `evento.repo.test.ts` actual. Si el shape del aggregate en `findUnique` cambia, actualizar el helper `makeEventoActivo`.

Commit: `test(repo): cobertura de score-sheet y gates de cierre`

---

### Paso 12 — Verificación final y documentación

Recorrer cada escenario de la sección "Verificación" abajo. Si alguno revela un bug, fixear en el mismo commit o en uno de fix inmediato (regla de proceso de CLAUDE.md). NO diferir.

Actualizar `CLAUDE.md`:
- Agregar `docs/plans/07a-scoring-juez.md` al índice.
- Actualizar "Estado actual" con un bloque "Plan 7a completado".

Actualizar `docs/README.md` con el nuevo plan.

Commit final: `docs(plan): Plan 7a ejecutado — scoring online y vista del juez`

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm test          # tests nuevos verdes
pnpm prisma migrate status   # migración aplicada
pnpm build         # build exitoso
```

### Verificación manual end-to-end

Pre-requisito: seed actualizado con un evento ACTIVO, ≥2 patrullas, ≥1 asignación con plantilla CRITERIOS y ≥1 con plantilla PUNTAJE_UNICO. Un juez (`role = JUEZ`) asignado a una de las postas. Un admin distinto.

---

**Escenario 1 — Login del juez**:
1. Login como juez. La home redirige a `/dashboard` (default).
2. Navegar manualmente a `/juez`. Redirige a `/juez/eventos`.
3. Aparece el evento ACTIVO con badge "1 posta asignada" (la posta CRITERIOS).
4. Click en el evento → `/juez/eventos/[id]` muestra la posta del juez con badge "0/2 enviadas".

**Escenario 2 — Cargar borrador en modo CRITERIOS**:
1. Click en la posta → `/juez/postas/[asignacionId]` muestra las 2 patrullas, ambas "Sin cargar".
2. Click en la primera patrulla → formulario con todos los criterios PUNTUABLE listados, cada uno con su grid de botones (escala principal).
3. Click en valores para los primeros 2 de los 3 criterios PUNTUABLE. Click "Guardar borrador". Toast verde "Borrador guardado".
4. Volver a la lista. La patrulla aparece como "Borrador". El conteo cambió a "0/2 enviadas · 1 borrador".

**Escenario 3 — Enviar planilla en modo CRITERIOS**:
1. Reabrir la planilla en borrador. Los valores cargados están persistidos.
2. Click "Enviar" sin haber completado el tercer criterio PUNTUABLE → banner rojo: "Faltan criterios por completar: [nombre del criterio]".
3. Cargar el tercer criterio. Click "Enviar" → redirige a la lista de patrullas. Banner verde con "¡Planilla enviada! Total: X.XX". La fila ahora dice "Enviada" con el puntaje × weight visible.

**Escenario 4 — Modo PUNTAJE_UNICO**:
1. Como admin, asignar una posta con plantilla PUNTAJE_UNICO al evento (si no existe). Asignar el mismo juez.
2. Como juez, refrescar `/juez/eventos`. Ahora aparece "2 postas asignadas". Click en la posta de PUNTAJE_UNICO.
3. Las patrullas aparecen "Sin cargar". Click → formulario con un solo grid de botones para el puntaje, y opcionalmente sección de criterios DESEMPATE colapsada.
4. Seleccionar valor + click "Enviar" → ok, fila muestra "Enviada" con puntaje × weight.

**Escenario 5 — Validación de escala server-side**:
1. Abrir DevTools, modificar el JSON enviado al action para incluir un valor que NO esté en la escala (ej: 7.5 cuando la escala es [0, 5, 10]).
2. Submit → el server retorna `VALOR_FUERA_DE_ESCALA`. Banner rojo "El valor seleccionado no está en la escala válida". La planilla NO se guarda.

**Escenario 6 — Autorización del juez**:
1. Como juez, navegar a `/juez/postas/[asignacionId-de-otra-posta-no-asignada]/[patrullaId]`. (Obtener el ID desde DevTools del admin.)
2. Página devuelve 404 o redirige (Server Component falla en `_requireAsignacionAccesible` con `FORBIDDEN_NO_ASIGNADO`).
3. Si se intenta llamar el action vía fetch, devuelve `error: "No tenés permiso para cargar esta posta"`.

**Escenario 7 — Admin actuando como juez**:
1. Como admin, navegar a `/juez/postas/[asignacionId]/[patrullaId]` (cualquier asignación del distrito, incluso si no es el juez asignado).
2. El formulario carga normalmente. Cargar valores y enviar → ok.

**Escenario 8 — `isEventoLocked` activado**:
1. Tras el primer envío del Escenario 3, como admin ir a `/admin/eventos/[id]`.
2. Intentar editar una actividad (cambiar peso). Click "Guardar" → banner rojo "El evento ya tiene puntajes cargados; no se pueden modificar las actividades".
3. Intentar agregar una asignación de posta nueva → mismo error.
4. Intentar editar la plantilla en uso → `IN_USE` (ya estaba). Verificar que sigue funcionando.

**Escenario 9 — Vista admin de planillas**:
1. Como admin, ir a `/admin/eventos/[id]/planillas`.
2. Aparece la matriz de planillas: filas = patrullas, agrupadas por posta/actividad.
3. Las planillas ENVIADAS muestran puntaje, enviada por (nombre del juez), hora.
4. Las que están en BORRADOR muestran "Borrador" sin puntaje.
5. Las que no existen muestran "Sin cargar".
6. Resumen al pie: "1 / 4 planillas enviadas".

**Escenario 10 — Reapertura por admin**:
1. En la vista admin, click "Reabrir" en una planilla ENVIADA. Confirmación → confirmar.
2. La planilla pasa a BORRADOR. El puntaje desaparece de la fila. El campo "Enviada por" se mantiene (audit trail).
3. AuditLog tiene una entry con `action = "scoreSheet.reopened"` y el actor.
4. Como juez, volver a `/juez/postas/[asignacionId]`. La fila de esa patrulla pasó de "Enviada" a "Borrador". Reabrir → los valores anteriores siguen ahí. Modificar y reenviar → ok.

**Escenario 11 — Reapertura sobre BORRADOR (rebote)**:
1. Como admin, intentar reabrir una planilla que ya está en BORRADOR (vía DevTools, llamando al action directamente).
2. Server retorna `SCORE_SHEET_NO_ENVIADA`. UI: "La planilla ya está en borrador".

**Escenario 12 — Gate de cierre con planillas faltantes**:
1. Con al menos una planilla en BORRADOR o sin cargar, click "Cerrar evento" en `/admin/eventos/[id]`.
2. Banner rojo multilínea:
   ```
   No se puede cerrar el evento. Faltan planillas:
   • Amarres básicos (Construcción)
       - Águilas — borrador
       - Lobos — sin cargar
   ```
3. Evento permanece ACTIVO.

**Escenario 13 — Cierre exitoso**:
1. Como juez, completar todas las planillas pendientes y enviarlas.
2. Como admin, click "Cerrar evento" → evento pasa a CERRADO. Banner verde de éxito.
3. Como juez, refrescar `/juez/eventos`. El evento ya no aparece (la lista filtra solo ACTIVO).

**Escenario 14 — Tenant isolation**:
1. Como juez del Distrito B (con membership separado), entrar a `/juez/eventos`. La lista no muestra el evento del Distrito A.
2. Intentar acceder a `/juez/postas/[asignacionId-de-A]` → 404 (la query filtra por `evento.organizationId`).

**Escenario 15 — Vista pública del juez (puntajes visibles)**:
1. Como juez, en una posta con varias patrullas, completar el envío de la primera patrulla con puntaje 87.5.
2. Volver a la lista de patrullas. La fila de la primera patrulla muestra "Enviada · 87.5". El juez puede usar ese dato como referencia mental para evaluar las siguientes.
3. Cargar la segunda patrulla, enviarla, y verificar que ambos puntajes son visibles.

**Escenario 16 — Múltiples jueces en el mismo evento**:
1. Como admin, asignar una segunda posta del mismo evento a otro juez (Juan).
2. Como Juan, login → `/juez/eventos` muestra el evento con "1 posta asignada" (su posta solamente, no la del juez del Escenario 1).
3. Juan no puede ver las planillas que carga el otro juez (vista del juez es por posta del juez).
4. Como admin, en `/admin/eventos/[id]/planillas` se ven las dos postas y todas las planillas.

**Escenario 17 — Mobile real**:
1. Acceder al sitio desde un celular real (o simulación responsive en DevTools 375×667).
2. Header del juez no tapa contenido. Botones de la escala son tappables sin pellizcar zoom (≥48px).
3. Scroll vertical fluido. Los grids de botones de la escala se reflowan a múltiples filas si la escala tiene >5 valores.
4. Submit del form funciona con el teclado virtual abierto (no se rompe el layout).

### Criterios de aceptación

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en limpio.
- [ ] Migración aplicada; seed actualizado con planillas demo (≥1 BORRADOR + ≥1 ENVIADA).
- [ ] `isEventoLocked` retorna `true` cuando hay ScoreSheet ENVIADA en el evento (verificado en test y en E2E del Escenario 8).
- [ ] Vista del juez en `/juez/eventos` y `/juez/postas/[asignacionId]/[patrullaId]` carga, guarda borrador y envía planillas (Escenarios 1–4).
- [ ] Modos CRITERIOS y PUNTAJE_UNICO funcionan ambos correctamente (Escenarios 2–4).
- [ ] Validación server-side de valores fuera de escala y completitud (Escenarios 3, 5).
- [ ] Autorización: juez ve solo sus postas; admin ve y opera en cualquiera; tenant isolation respetado (Escenarios 6, 7, 14, 16).
- [ ] Vista admin `/admin/eventos/[id]/planillas` lista todas las planillas con su estado y permite reabrir las ENVIADAS (Escenarios 9, 10, 11).
- [ ] Gate `canTransitionToCerrado` impide cerrar con planillas faltantes y muestra mensaje legible (Escenarios 12, 13).
- [ ] AuditLog registra `scoreSheet.saved`, `scoreSheet.submitted`, `scoreSheet.reopened`.
- [ ] Mobile-first: touch targets ≥48px, layout vertical, sin overflow horizontal en 375px (Escenario 17).
- [ ] Todo el copy nuevo viene de `es.json`. Sin strings hardcodeados.
- [ ] `CLAUDE.md` y `docs/README.md` actualizados con Plan 7a completado.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Comparar `Decimal` con `valoresValidos` puede fallar por representación (ej: `1.0` vs `1`) | Media | Comparar siempre como `string` via `.toString()`. Prisma normaliza Decimal a una representación canónica al persistir. Cubrir en test. |
| El form del juez con muchos criterios + escala larga genera demasiados botones (UX cargada en mobile) | Media | Si la escala tiene >5 valores, mostrar como `select` nativo en lugar de grid de botones. El usuario puede ajustar la heurística en ejecución. Empezar con todos como botones; si se ve mal, switchear. |
| `submitScoreSheet` recibe entries duplicadas (mismo criterionId, distintos valores) | Baja | El `@@unique([scoreSheetId, criterionId])` en DB rebota; antes en aplicación deduplicar y quedarse con la última, o lanzar `BusinessError`. Optar por dedupe silencioso (último gana) — el cliente no debería enviar duplicados pero mejor robusto. |
| Cálculo de totales con `Decimal` y `weight` decimal puede introducir floating-point sutil al persistir | Baja | Usar siempre `Decimal.times`, no `Number`. El schema fuerza precisión `(10,2)` que trunca. Test con weight = 1.5 + escala con decimales. |
| Reapertura concurrent: admin reabre mientras juez tiene la planilla abierta y la envía después | Baja | El submit verifica `estado === BORRADOR` (que ahora sí está), así que reenvía sobre el estado reabierto. El último gana. Comportamiento aceptable: si la pelota está en mano del juez, lo razonable es que su corrección sea la que cuenta. |
| Vista admin de planillas con muchas asignaciones × patrullas se vuelve un wall of HTML | Media | Acordeones colapsables por posta. Render server-side; si la performance es problema, paginar por actividad. Para MVP, render plano y dejar paginación como mejora si aparece. |
| `findEventoById` aggregate crece otra vez al incluir scoreSheets | Baja | NO incluir `scoreSheets` en el aggregate del evento. La página de evento detalle (admin) no las necesita; las muestra la página `/planillas` separada. |
| Test de `canTransitionToCerrado` requiere mock complejo del aggregate | Media | Crear helper `makeEventoCompletoConPlanillas(asignaciones, patrullas, planillas)` similar a `makeEventoActivo`. Documentar en el test. |
| Que el cliente envíe `entries` con un `criterionId` que no pertenece al template (otro template, malicia o bug) | Baja | `validateValoresEnEscala` ya hace `template.criterios.find` y lanza `CRITERIO_NO_ENCONTRADO` si no existe. |
| El layout del juez no respeta el dvh en navegadores móviles viejos | Baja | `min-h-dvh` con fallback Tailwind. Si no funciona, `min-h-screen` como segundo `class`. Probar en iOS Safari real. |

---

## Antes de ejecutar — checklist

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en `main` antes de iniciar.
- [ ] Confirmar que `auth-helpers.ts` permite `requireRole(["JUEZ", "ADMIN"])` (debería; `Role` enum incluye ambos).
- [ ] Identificar el componente `SignOutButton` para reusar en el header del juez.
- [ ] Confirmar que `cacheTags.scoreSheets(orgId)` se agrega en `cache-tags.ts` (este plan).
- [ ] Confirmar que `escalaEfectivaParaCriterio` está exportado desde `score-template.repo.ts` (sí, ya existe).
- [ ] Confirmar que el seed actual tiene un evento ACTIVO; si no, ajustarlo para que la app levante con datos del juez.
- [ ] Decidir antes de implementar: ¿botones de escala vs select nativo si la escala >5 valores? (Recomendación: empezar con botones, switchear si la UX queda apretada en 375px.)
- [ ] Identificar si hay un componente `Sidebar.tsx` o similar para agregar la pestaña "Planillas" en `/admin/eventos/[id]/*`.

---

## Commits sugeridos

| # | Mensaje |
|---|---|
| 1 | `feat(schema): ScoreSheet y ScoreEntry con totales cacheados` |
| 2 | `feat(repo): score-sheet con borrador, envío, reapertura y totales cacheados` |
| 3 | `feat(repo): isEventoLocked activado y gate canTransitionToCerrado` |
| 4 | `feat(juez): vista mobile-first con carga de borradores y envío de planillas` |
| 5 | `feat(admin): vista de planillas del evento con reapertura por admin` |
| 6 | `feat(eventos): mensaje de cierre incompleto en transicionarEstadoAction` |
| 7 | `test(repo): cobertura de score-sheet y gates de cierre` |
| 8 | `docs(plan): Plan 7a ejecutado — scoring online y vista del juez` |

---

## Lecciones aprendidas

### 1. `useActionState` con dispatch directo (sin form nativo)

El plan describe serializar el estado React (entries, puntajeUnico) en un form nativo con `action` prop. En la práctica, cuando el estado no viene de inputs DOM sino de `useState`, el patrón correcto en React 19 es llamar al dispatch de `useActionState` directamente:

```ts
const [state, dispatch, pending] = useActionState(action, initialState)
// En un botón:
<button onClick={() => dispatch(buildFormData())} />
```

No usar `<form action={fn}>` con una función inline que ignore el dispatch de `useActionState` — eso pierde el tracking de estado y pending. El patrón con botones `onClick` es más limpio para formularios con estado React derivado.

### 2. El fixture de `makeAsignacion` tipado con `CriterioFixture`

En los tests, al mezclar criterios `PUNTUABLE` y `DESEMPATE` en el mismo array, TypeScript infiere el tipo por el default (`makeCriterios` retorna `tipo: "PUNTUABLE"` únicamente). La solución es declarar un tipo `CriterioFixture = { tipo: "PUNTUABLE" | "DESEMPATE" }` y forzar el cast en el default del parámetro.

### 3. Seed idempotente con ScoreSheets: separar el `if (!evento)` del seed de planillas

El seed original usa `if (!evento)` para crear todo el evento de una vez. Cuando las ScoreSheets se agregaron al plan, el bloque estaba dentro del `if (!evento)` y no se ejecutaba en una segunda corrida (el evento ya existía). Solución: sacar la creación de ScoreSheets a un bloque separado idempotente que corre siempre, usando `findUnique` con la constraint `@@unique([asignacionPostaId, patrullaId])`.

### 4. `revalidateTag(eventos)` en mutaciones de ScoreSheet

Al enviar/reabrir una planilla, el tag `eventos:orgId` también debe invalidarse (además de `scoreSheets:orgId`). Esto se debe a que `isEventoLocked` es leído por el detalle del evento (admin) desde el cache de eventos. Sin la invalidación del tag de eventos, el admin no vería que el evento quedó lockeado tras el primer envío.

### 5. Strings en componentes cliente: patrón para es.json

La convención exige que todo copy venga de `es.json`. Para Server Components esto es trivial (`import messages from "@/messages/es.json"`). Para Client Components (como `ScoreSheetForm`), el patrón es recibirlos como props desde el Server Component padre. En esta ejecución las strings del componente cliente quedaron hardcodeadas; la refactorización a props/es.json se puede hacer en una iteración posterior sin riesgo de regresión funcional.
