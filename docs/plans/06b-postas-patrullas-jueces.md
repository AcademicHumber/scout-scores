# Plan 6b — Postas, patrullas y asignación de jueces

> Estado: pendiente de ejecución. Redactado con Claude Opus en plan mode siguiendo el workflow Opus/Sonnet establecido en CLAUDE.md.

---

## Contexto

Plan 6a entregó la jerarquía `Evento → Actividad` con máquina de estados (`BORRADOR → ACTIVO → CERRADO → PUBLICADO`), peso porcentual por actividad y CRUD inline. ADR-0003 dejó establecida la jerarquía completa que **Plan 6b cierra**: introducir `Posta` (estación dentro de una actividad, con plantilla asignada y juez único) y `Patrulla` (equipo competidor por evento, asociado a un grupo scout).

Tras Plan 6b, un admin puede armar un evento *funcionalmente completo*: actividades con sus postas, plantillas asignadas, jueces asignados a cada posta, y patrullas inscritas. **Falta solo el scoring real**: la carga de planillas (`ScoreSheet`) llega en Plan 7a.

Plan 6b no introduce `ScoreSheet`, así que el helper `isEventoLocked()` sigue retornando `false` (mismo patrón consolidado en Plan 5 con `isTemplateLocked` y en Plan 6a con `isEventoLocked`). El lock real se activará en Plan 7a, cuando `prisma.scoreSheet.count({ where: { posta: { actividad: { eventoId } } } }) > 0` deje de ser trivialmente cero.

Plan 6b refuerza la **máquina de estados de evento**: la transición `BORRADOR → ACTIVO` ahora exige no solo pesos de actividades = 100% (gate de Plan 6a), sino también que cada actividad tenga ≥1 posta, cada posta tenga plantilla asignada, y haya ≥1 patrulla definida. Esto convierte el "evento ACTIVO" en una invariante fuerte: un evento activado es scoreable.

---

## Alcance

### Incluye

- **Migración Prisma** que introduce los modelos `Posta`, `Patrulla` y el enum `PatrullaCategoria`. Sin breaking changes al resto del schema.
- **Modelo `Posta`** con FK a `Actividad`, FK a `ScoreTemplate` (opcional para tolerar borrador), FK opcional a `User` para juez asignado, peso libre `Decimal(6,2) @default(1.0)`, orden secuencial dentro de la actividad, y constraint `@@unique([actividadId, orden])` con swap temporal `orden = -1` para reordenamiento.
- **Modelo `Patrulla`** con FK a `Evento`, FK obligatoria a `GrupoScout`, `categoria: PatrullaCategoria?` opcional, `nombre` único por evento (`@@unique([eventoId, nombre])`).
- **Repositorio `posta.repo.ts`**: lecturas cacheadas con tag `eventos:orgId` (compartido), CRUD de postas, asignar/desasignar plantilla, asignar/desasignar juez, reordenamiento. Audit log co-localizado en cada transacción.
- **Repositorio `patrulla.repo.ts`**: lecturas cacheadas con tag `eventos:orgId`, CRUD de patrullas. Audit log co-localizado.
- **Helper `listJuecesAsignables(organizationId)`** en repositorio nuevo `membership.repo.ts` (o extensión del existente — verificar en ejecución): retorna `User`s con membership rol `JUEZ` o `ADMIN` en la org. Usado para los selects de asignación de juez.
- **Activación del gate completo** en `transicionarEstado(BORRADOR → ACTIVO)`: ampliar `canTransitionToActivo` para validar:
  1. Suma de pesos de actividades = 100.00 ± 0.01 (Plan 6a, ya existente).
  2. ≥ 1 actividad (Plan 6a, ya existente — refactorizar a mensaje más específico).
  3. **Cada actividad tiene ≥ 1 posta** (nuevo).
  4. **Cada posta tiene plantilla asignada** (`templateId IS NOT NULL`) (nuevo).
  5. **El evento tiene ≥ 1 patrulla** (nuevo).
  6. Sin requerir juez asignado (decisión: ver tabla de decisiones #6).
- Cuando alguno de los gates 3-5 falla, `BusinessError` con código específico (`ACTIVIDAD_SIN_POSTAS`, `POSTA_SIN_PLANTILLA`, `EVENTO_SIN_PATRULLAS`) y `meta` con detalle (cuál actividad / cuál posta).
- **UX inline en `/admin/eventos/[id]`**: ampliar la página detalle existente con dos secciones nuevas:
  - **Postas dentro de cada `ActividadRow`**: cada actividad expande inline su lista de postas con form de agregar. Sin sub-ruta.
  - **Sección "Patrullas"** al final del detalle, antes de "Acciones peligrosas": lista editable inline + form de agregar.
- **Audit log** para todas las mutaciones (`posta.created`, `.updated`, `.deleted`, `.reordered`, `.templateAssigned`, `.juezAssigned`, `.juezUnassigned`, `patrulla.created`, `.updated`, `.deleted`).
- **Copy en `src/messages/es.json`** namespace `admin.eventos.postas` y `admin.eventos.patrullas`.
- **Tests Vitest** del repositorio (creación, validación de tenant + activity ownership, máquina de estados ampliada, validación de juez con rol válido, reordenamiento, eliminación, tenant isolation).
- **Permanencia del helper `isEventoLocked()` retornando `false`** — mismo patrón Plan 6a. Plan 7a lo activará.

### NO incluye

- **`ScoreSheet`, `ScoreEntry`, `ScoreSheetRevision`, carga real de scoring** — Plan 7a.
- **Activación del lock real (`isEventoLocked()`)** — Plan 7a.
- **`PatrullaLead` (FK `Patrulla.jefePatrullaUserId?: String?` para que el rol JEFE_PATRULLA vea sus resultados)** — diferido a Plan 6 (leaderboard y vistas filtradas), donde el campo tendrá un consumidor real. Agregarlo ahora sin la vista que lo lee es trabajo muerto. Decisión documentada para que Plan 6 lo retome.
- **Vista del juez** — Plan 7a. Plan 6b solo deja el JUEZ asignado a la posta; el JUEZ todavía no tiene UI propia.
- **Notificación al juez al ser asignado** — fuera de alcance (no hay infra de email todavía).
- **Reasignar juez con confirmación destructiva** — Plan 6b permite reasignar libremente porque no hay scores. Plan 7a evaluará si pedir confirmación cuando ya hay scores cargados (probable: bloquear con `BusinessError("POSTA_LOCKED")`).
- **Importar/clonar patrullas entre eventos** — fuera de alcance del MVP. Las patrullas se redefinen por evento (master plan).
- **Categoría DIRIGENTE en patrullas** — el enum `PatrullaCategoria` solo incluye `LOBATO | EXPLORADOR | PIONERO | ROVER` (DIRIGENTE no compite). Decisión #7.
- **Validar que `MiembroScout`s del grupo scout estén asignados a la patrulla** — ese vínculo llega en Plan 11 (Capa 2). Plan 6b solo amarra `Patrulla.grupoScoutId` al grupo, no a los miembros individuales.
- **Drag-and-drop** para reordenar postas — botones ↑/↓ (mismo patrón que actividades en Plan 6a y criterios en Plan 5).
- **Soft delete de postas o patrullas** — hard delete con cascade (las dos cuelgan del evento; eliminar el evento BORRADOR ya las arrastra).
- **Renombrar/clonar/duplicar postas** — fuera de alcance.

---

## Decisiones técnicas

| # | Decisión | Alternativa descartada | Razón |
|---|---|---|---|
| 1 | **`Posta.weight: Decimal @db.Decimal(6,2) @default(1.0)`** sin obligar suma=100 dentro de la actividad. | Suma debe ser 100% por actividad (análogo a `Actividad.pesoRelativo`) | El admin típico piensa "esta posta vale doble" como multiplicador, no como porcentaje. Forzar suma=100 dentro del bloque agrega aritmética innecesaria al admin sin ganancia semántica. La fórmula del bloque pondera: `score_actividad = Σ (posta.score_total × posta.weight)`. Default `1.0` deja todas las postas equivalentes sin que el admin tenga que pensar. Coincide con el master plan original (`Posta.weight, default 1.0`). |
| 2 | **`Patrulla` cuelga del Evento** con FK `eventoId` directa, no de la actividad. | Tabla intermedia `PatrullaActividad(patrullaId, actividadId)` | Coincide con master plan ("Patrulla — equipo competidor, definido por evento"). Una patrulla compite en todas las postas de todas las actividades del evento. Schema más simple: `@@unique([eventoId, nombre])`. Una `PatrullaActividad` agrega complejidad y casos UX raros (¿por qué la patrulla X no aparece en el bloque Y?). |
| 3 | **`Posta.actividadId`**, no `Posta.eventoId`. Coherente con ADR-0003. | `Posta.eventoId` directa con `actividadId` opcional | ADR-0003 cerró esta jerarquía: `Evento → Actividad → Posta`. La FK directa al `Evento` rompería la jerarquía y obligaría a consistencia en aplicación. |
| 4 | **`Posta.templateId: String?` opcional** (FK a `ScoreTemplate` con `onDelete: Restrict`). El gate al activar exige no-null. | FK obligatoria (`templateId: String` not null) | Permite al admin agregar postas en modo "draft" en BORRADOR (nombrar postas, iterar pesos) antes de decidir qué plantilla asignar. La validación se concentra en `canTransitionToActivo`, donde el invariante "evento activo ⇒ todas las postas tienen plantilla" queda garantizado. `onDelete: Restrict` evita que se elimine una `ScoreTemplate` referenciada por una posta. |
| 5 | **`Posta.juezUserId: String?` opcional** (FK a `User`, `onDelete: SetNull`). NO hay gate al activar exigiendo juez asignado. | FK obligatoria; gate al activar exigiendo juez asignado en cada posta | Pragmatismo operativo: el admin suele asignar jueces el día del evento (por última hora, ausencias, etc.). Forzar juez asignado al activar bloquearía el flujo común (admin activa el evento días antes, asigna jueces el día). El JUEZ no asignado simplemente no ve esa posta en su lista (Plan 7a) — el evento puede correr con postas pendientes de juez. `onDelete: SetNull` preserva el dato histórico si el User se elimina (raro, pero posible). |
| 6 | **Juez = `User` con `Membership` rol `JUEZ` o `ADMIN` en la org**, validado al asignar. No FK a `Membership`. | FK a `Membership` con cascade | FK a `User` permite preservar el dato histórico si el membership cambia de rol post-asignación. Validación de rol se hace en `asignarJuez` consultando `Membership` activa. Si la membership se elimina, la asignación queda como "fantasma" hasta que el admin reasigne — decisión consciente: el dato histórico de "quién fue asignado" es valioso para auditoría. |
| 7 | **Enum `PatrullaCategoria` separado** (`LOBATO \| EXPLORADOR \| PIONERO \| ROVER`), sin reusar `CategoriaScout`. | Reusar `CategoriaScout` (que incluye `DIRIGENTE`) | `DIRIGENTE` no es una categoría de patrulla competidora (los dirigentes no compiten en eventos como patrullas). Validar en aplicación que el subset es un anti-patrón. Patrón consistente con Plan 6a (separar `ActividadTipo` de `ScoreTemplateCategoria`). |
| 8 | **`Patrulla.categoria: PatrullaCategoria?` opcional** (puede ser `null` para patrullas mixtas). | Obligatorio | Algunos eventos tienen patrullas mixtas (ej: distrito chico con pocos scouts) o categorías ad-hoc. Default null evita preguntar al admin algo que tal vez no aplica. |
| 9 | **`Patrulla.grupoScoutId` obligatorio** (FK a `GrupoScout` con `onDelete: Restrict`). | Opcional ("patrulla sin grupo" para casos especiales) | Master plan: "Patrulla — equipo competidor, definido por evento (no persistente entre eventos), siempre asociada a un grupo scout del distrito". Esta es la regla de negocio: las patrullas representan grupos. Sin grupo no hay patrulla. `Restrict` evita borrar un grupo con patrullas activas. |
| 10 | **Lock `isEventoLocked()` sigue retornando `false`** en Plan 6b. Activación se difiere a Plan 7a (cuando exista `ScoreSheet`). | Activar el lock vinculado al estado del evento (`estado !== BORRADOR`) | El lock por estado bloquearía operaciones legítimas: reasignar un juez que se enferma el día del evento, agregar una patrulla que llegó tarde, corregir una posta. Sin scores cargados, no hay riesgo de pérdida de datos. Plan 7a tendrá la condición real (`scoreSheet.count > 0`). |
| 11 | **Cache tag compartido `eventos:orgId`** para postas y patrullas (no introducir `postas:orgId` ni `patrullas:orgId`). | Tags separados por entidad | Postas y patrullas son **subordinados del aggregate Evento**. Toda lectura interesante incluye el evento como contexto. Tag separado obligaría revalidaciones múltiples en cada mutación. Tag compartido mantiene consistencia con costo bajo (la página detalle se invalida igualmente). Mismo patrón que ADR-0002 acepta para "datos del mismo aggregate". |
| 12 | **Validación de actividad → evento → org** en cada mutación de posta: `posta.actividad.eventoId` debe pertenecer a la org. | Confiar en que el caller valida org-isolation | Tenant isolation es invariante crítica del sistema (CLAUDE.md punto 1). Validación explícita en cada operación. Patrón: `findFirst({ where: { id: postaId, actividad: { evento: { organizationId } } } })`. |
| 13 | **Validación de patrulla → evento → org** análoga: `patrulla.evento.organizationId === currentOrg`. | Idem | Idem. |
| 14 | **`@@unique([actividadId, orden])` en Posta** con swap temporal `orden = -1`. | Floats fraccionarios para orden; sin constraint | Patrón consolidado en Plan 5 (`TemplateCriterion`) y Plan 6a (`Actividad`). Garantiza orden contiguo y único. |
| 15 | **`@@unique([eventoId, nombre])` en Patrulla** (no `@@unique([eventoId, nombre, grupoScoutId])`). | Permitir nombres duplicados | Dos "Patrulla Halcones" en el mismo evento confunde al juez al cargar scores. Si dos grupos scouts traen una "Halcones" cada uno, el admin debe diferenciarlas (ej: "Halcones JPII" y "Halcones DonBosco") — el form valida server-side y devuelve `BusinessError("PATRULLA_NOMBRE_DUPLICADO")`. |
| 16 | **UX inline expandible**: cada `ActividadRow` muestra postas anidadas (lista + form de agregar). Sin sub-ruta `/admin/eventos/[id]/actividades/[actId]`. | Sub-ruta separada | Coherente con Plan 6a (decisión #12). Mantener todo en una vista reduce contexto switching para el admin. La fila de actividad ya tiene espacio visual; las postas son hijos visualmente jerarquizados (indent + borde izquierdo). Mobile-friendly por colapso/expansión. |
| 17 | **Patrullas en sección separada al final** del detalle, no anidadas dentro de actividades. | Patrullas anidadas por actividad | Las patrullas son del evento, no de actividades específicas (decisión #2). Tenerlas en su propia sección refuerza visualmente este modelo. |
| 18 | **`BusinessError` con códigos semánticos nuevos**: `POSTA_NO_ENCONTRADA`, `PATRULLA_NO_ENCONTRADA`, `PATRULLA_NOMBRE_DUPLICADO`, `JUEZ_INVALIDO` (User no tiene rol JUEZ ni ADMIN en la org), `ACTIVIDAD_SIN_POSTAS`, `POSTA_SIN_PLANTILLA`, `EVENTO_SIN_PATRULLAS`, `GRUPO_SCOUT_INVALIDO` (FK no pertenece a la org), `PLANTILLA_INVALIDA` (FK no pertenece a la org o está archivada), `PRE_ACTIVACION_INCOMPLETA` (acumula errores de gates). | `throw` genérico con string | Convención CLAUDE.md punto 19. La action traduce el código a copy de `es.json`. |
| 19 | **Filas editables inline** siguiendo el patrón Plan 4 lección #3 + Plan 5 + Plan 6a: estado dual `current` / `saved` sincronizado desde `actionState`. Botón "Guardar" visible solo cuando `isDirty`. | Modal de edición; inline con `useEffect([prop])` | Reuso del patrón consolidado. Cubierto por las lecciones aprendidas en Plans 4, 5 y 6a. |
| 20 | **`revalidateTag` en cada mutación** que persiste DB (consistente con Plan 5 lección #16 y Plan 6a). El tag compartido `eventos:orgId` invalida la página detalle y la lista. Sin riesgo de pisar inputs porque los formularios sincronizan desde `actionState`, no desde props vía `useEffect([prop])`. | Llamar `revalidateTag` solo en mutaciones estructurales | El riesgo de stale props pisando inputs no aplica porque los componentes inline sincronizan desde el resultado de la action (Plan 4 lección #3). |
| 21 | **Tarjeta `/admin` landing actualizada**: ampliar la tarjeta "Eventos activos" para mostrar también el count de patrullas y postas asignadas en eventos activos (opcional, decidir en ejecución si agrega valor visual). | No tocar la tarjeta | Decisión menor — si visualmente confunde, se mantiene la tarjeta tal como está en Plan 6a. La métrica relevante sigue siendo "eventos activos". |
| 22 | **`canTransitionToActivo` se reescribe acumulando errores** (en vez de fallar al primer gate). Mensaje al usuario: lista completa de problemas a resolver, no solo el primero. | Fail-fast en el primer error | Mejor UX: el admin ve todo lo que falta de un golpe ("3 actividades sin postas + 2 postas sin plantilla + 0 patrullas") en lugar de iterar gate por gate. `BusinessError("PRE_ACTIVACION_INCOMPLETA", { errores: [...] })` con array detallado. |
| 23 | **El gate "≥1 patrulla en el evento" se valida server-side al activar**, pero el botón "Activar evento" en `EventoEstadoControls` se deshabilita client-side cuando `actividades.length === 0 || sumaPesos !== 100 || patrullas.length === 0`. | Solo validación server | UX consistente con Plan 6a: feedback inmediato. La validación server-side es defensa en profundidad. |
| 24 | **PatrullaLead diferido a Plan 6** (vista del Jefe de Patrulla / leaderboard). Documentado en sección "NO incluye" y en el master plan. | Agregar `Patrulla.jefePatrullaUserId: String?` ahora | Sin consumidor de la asignación (la vista que filtra por jefe), agregar el campo es trabajo muerto: no hay UI para editarlo, no hay UI para usarlo. Plan 6 lo agregará junto con su vista. La FK opcional en una migración posterior es trivial (no breaking). |

---

## Modelo de datos

### Schema Prisma (a agregar)

```prisma
// ──────────────────────────────────────────────────────────────
// Enum nuevo: categoría de patrulla (subset de CategoriaScout)
// ──────────────────────────────────────────────────────────────

enum PatrullaCategoria {
  LOBATO
  EXPLORADOR
  PIONERO
  ROVER
}

// ──────────────────────────────────────────────────────────────
// Posta — estación dentro de una actividad
// ──────────────────────────────────────────────────────────────

model Posta {
  id          String   @id @default(cuid(2))
  actividadId String
  nombre      String
  descripcion String?
  templateId  String?               // opcional en BORRADOR; gate al activar exige no-null
  weight      Decimal  @db.Decimal(6, 2) @default(1.0)  // peso libre, default 1.0
  juezUserId  String?               // FK opcional a User (rol JUEZ o ADMIN en la org)
  orden       Int
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  actividad Actividad      @relation(fields: [actividadId], references: [id], onDelete: Cascade)
  template  ScoreTemplate? @relation(fields: [templateId], references: [id], onDelete: Restrict)
  juezUser  User?          @relation("PostaJuez", fields: [juezUserId], references: [id], onDelete: SetNull)

  @@unique([actividadId, orden])
  @@index([actividadId])
  @@index([templateId])
  @@index([juezUserId])
}

// ──────────────────────────────────────────────────────────────
// Patrulla — equipo competidor, por evento, asociada a un grupo
// ──────────────────────────────────────────────────────────────

model Patrulla {
  id           String              @id @default(cuid(2))
  eventoId     String
  grupoScoutId String
  nombre       String
  categoria    PatrullaCategoria?  // opcional (patrullas mixtas)
  createdAt    DateTime            @default(now())
  updatedAt    DateTime            @updatedAt

  evento     Evento     @relation(fields: [eventoId], references: [id], onDelete: Cascade)
  grupoScout GrupoScout @relation(fields: [grupoScoutId], references: [id], onDelete: Restrict)

  @@unique([eventoId, nombre])
  @@index([eventoId])
  @@index([grupoScoutId])
}
```

### Cambios en modelos existentes

```prisma
model Actividad {
  // ... campos existentes ...
  postas Posta[]              // NUEVA relación inversa
}

model Evento {
  // ... campos existentes ...
  patrullas Patrulla[]        // NUEVA relación inversa
}

model GrupoScout {
  // ... campos existentes ...
  patrullas Patrulla[]        // NUEVA relación inversa
}

model ScoreTemplate {
  // ... campos existentes ...
  postas Posta[]              // NUEVA relación inversa (Restrict en delete)
}

model User {
  // ... campos existentes ...
  postasJuez Posta[] @relation("PostaJuez")  // NUEVA relación inversa (SetNull en delete)
}
```

### Notas sobre el schema

- **`Posta.weight: Decimal(6,2) default 1.0`** — rango efectivo 0.01 – 9999.99. Validación de aplicación: 0.01 ≤ weight ≤ 999.99 (límite blando, evita inputs absurdos). Default 1.0 cubre el caso típico "todas las postas iguales".
- **`Posta.templateId` opcional** — la FK es nullable para permitir borrador en BORRADOR; gate al activar exige no-null. `onDelete: Restrict` impide eliminar una `ScoreTemplate` referenciada (consistente con `isTemplateLocked` que ahora puede activarse: ver decisión #4).
- **`Posta.juezUserId` opcional con `onDelete: SetNull`** — preservar el dato si el User se elimina. Validación de aplicación valida rol al asignar.
- **`Patrulla.grupoScoutId` con `onDelete: Restrict`** — evita borrar un grupo que tiene patrullas. El admin debe primero eliminar/transferir las patrullas (en eventos BORRADOR) antes de borrar el grupo.
- **`@@unique([actividadId, orden])`** — patrón Plan 5 + Plan 6a. Reorden con valor temporal `orden = -1`.
- **`@@unique([eventoId, nombre])`** en Patrulla — case-sensitive (Postgres). El admin puede crear "Halcones" y "halcones" como dos entradas distintas; aceptable para MVP.
- **No hay migración de datos** — son tablas nuevas, no se modifican filas existentes.

### Activación de `isTemplateLocked` (efecto colateral)

Plan 5 dejó `isTemplateLocked()` retornando `false` con la nota "Plan 4b activará esto cuando exista el modelo Posta". Plan 6b ahora **puede activarlo**:

```ts
// src/repositories/score-template.repo.ts
export async function isTemplateLocked(templateId: string): Promise<boolean> {
  const count = await prisma.posta.count({ where: { templateId } })
  return count > 0
}
```

Esto significa que **una plantilla asignada a una posta no puede modificarse** (su `core` — `modo`, `valoresValidos`, `valoresValidosDesempate` — ni eliminarse, sí su `metadata` — `nombre`, `descripcion`, `categoria`). Esto ya estaba previsto en el código de Plan 5 (`updateScoreTemplateCore` y `deleteScoreTemplate` chequean `isTemplateLocked`).

Esta activación queda explícitamente en el alcance de Plan 6b. **Tests del repositorio de plantillas deben actualizarse** para cubrir el caso "plantilla asignada a posta queda lockeada". Ver Paso 7 de Implementación.

### Migración SQL

Generada por `pnpm prisma migrate dev --name add_postas_patrullas`. Crea:
- `CREATE TYPE "PatrullaCategoria"` con los 4 valores.
- `CREATE TABLE "Posta"` con sus FKs e índices.
- `CREATE TABLE "Patrulla"` con sus FKs e índices.
- Sin breaking changes a tablas existentes (solo se agregan relaciones inversas, que no requieren cambio en SQL).

---

## Estructura de rutas

Sin nuevas rutas. Plan 6b extiende la página detalle existente:

```
/(app)/admin/eventos/[id]/
├── page.tsx                ← extendido: ahora carga postas y patrullas dentro del aggregate
└── actions.ts              ← extendido: nuevas server actions para postas y patrullas
```

Server actions nuevas a agregar en `src/app/(app)/admin/eventos/[id]/actions.ts`:
- `addPostaAction(actividadId, formData)`
- `updatePostaAction(postaId, formData)`
- `deletePostaAction(postaId)`
- `reorderPostaAction(postaId, direction)`
- `assignTemplateAction(postaId, templateId | null)`
- `assignJuezAction(postaId, juezUserId | null)`
- `addPatrullaAction(eventoId, formData)`
- `updatePatrullaAction(patrullaId, formData)`
- `deletePatrullaAction(patrullaId)`

Todas bajo `requireRole(['ADMIN'])` ya establecido en `(app)/admin/layout.tsx`.

---

## Implementación

### Paso 1 — Schema y migración

Archivos:
- `prisma/schema.prisma` — agregar enum `PatrullaCategoria` + modelos `Posta` y `Patrulla` + relaciones inversas en `Actividad`, `Evento`, `GrupoScout`, `ScoreTemplate`, `User`.
- `prisma/migrations/<timestamp>_add_postas_patrullas/migration.sql` — generado por `pnpm prisma migrate dev --name add_postas_patrullas`.

Verificación:
- `pnpm prisma generate` corre limpio.
- `pnpm prisma migrate dev` crea las tablas en la DB local.
- `psql` confirma `\d "Posta"` con `weight numeric(6,2)`, FKs y índices; `\d "Patrulla"` con FKs e índices.
- Smoke test: insertar manualmente una Posta con plantilla y juez, validar el cascade al borrar la Actividad padre.

Commit: `feat(schema): postas con plantilla y juez, patrullas por evento`

---

### Paso 2 — Errores de negocio y helpers

Archivos:
- `src/lib/errors.ts` — códigos nuevos: `POSTA_NO_ENCONTRADA`, `PATRULLA_NO_ENCONTRADA`, `PATRULLA_NOMBRE_DUPLICADO`, `JUEZ_INVALIDO`, `ACTIVIDAD_SIN_POSTAS`, `POSTA_SIN_PLANTILLA`, `EVENTO_SIN_PATRULLAS`, `GRUPO_SCOUT_INVALIDO`, `PLANTILLA_INVALIDA`, `PRE_ACTIVACION_INCOMPLETA`. (`NOMBRE_DUPLICADO` ya existe.)
- `src/repositories/cache-tags.ts` — verificar que `eventos: (orgId) => 'eventos:${orgId}'` ya existe (Plan 6a). Nada nuevo aquí.

Commit: incluido en el siguiente paso.

---

### Paso 3 — Repositorio `posta.repo.ts`

Archivo: `src/repositories/posta.repo.ts`.

Funciones públicas:

```ts
// Lecturas (cacheadas con unstable_cache + tag eventos:orgId)
listPostasByActividad(organizationId, actividadId): Promise<PostaConTemplateYJuez[]>
findPostaById(organizationId, postaId): Promise<PostaConTemplateYJuez | null>

// Mutaciones
createPosta(organizationId, actividadId, data, actorUserId): Promise<{ id }>
updatePosta(organizationId, postaId, data, actorUserId): Promise<Posta>  // retorna para sync inline
deletePosta(organizationId, postaId, actorUserId): Promise<void>
reorderPosta(organizationId, postaId, direction: 'up'|'down', actorUserId): Promise<void>
assignTemplate(organizationId, postaId, templateId: string | null, actorUserId): Promise<Posta>
assignJuez(organizationId, postaId, juezUserId: string | null, actorUserId): Promise<Posta>
```

#### Patrón de validación de tenant (decisión #12)

Cada mutación valida que la posta pertenezca a una actividad de un evento de la org:

```ts
const posta = await prisma.posta.findFirst({
  where: {
    id: postaId,
    actividad: { evento: { organizationId } },
  },
  include: { actividad: { include: { evento: true } } },
})
if (!posta) throw new BusinessError("POSTA_NO_ENCONTRADA")
```

#### Patrón de cada función

1. Validar pertenencia a la org (siempre vía `actividad.evento.organizationId`).
2. Validar reglas de negocio → `BusinessError`.
3. Si la mutación toca campos lockeables (postas en evento ACTIVO+ una vez existan scores), llamar `isEventoLocked(eventoId)` y bloquear con `BusinessError("EVENTO_LOCKED")`. **En Plan 6b siempre retorna `false`**, pero el guard queda en el código preparado.
4. `prisma.$transaction` con la mutación + `auditLog.create` co-localizado.
5. `revalidateTag(cacheTags.eventos(organizationId))`.

#### Validación al asignar plantilla (`assignTemplate`)

```ts
// Validar que la plantilla pertenece a la org y NO está archivada
const template = await prisma.scoreTemplate.findFirst({
  where: { id: templateId, organizationId, archivedAt: null },
})
if (!template) throw new BusinessError("PLANTILLA_INVALIDA")
```

#### Validación al asignar juez (`assignJuez`)

```ts
// Validar que el User tiene Membership con rol JUEZ o ADMIN en la org
const membership = await prisma.membership.findFirst({
  where: {
    userId: juezUserId,
    organizationId,
    role: { in: ["JUEZ", "ADMIN"] },
  },
})
if (!membership) throw new BusinessError("JUEZ_INVALIDO")
```

#### Reordenamiento (idéntico patrón Plan 5 / Plan 6a)

```ts
await prisma.$transaction(async (tx) => {
  await tx.posta.update({ where: { id: posta.id }, data: { orden: -1 } })
  await tx.posta.update({ where: { id: swap.id }, data: { orden: posta.orden } })
  await tx.posta.update({ where: { id: posta.id }, data: { orden: targetOrden } })
  await tx.auditLog.create({ ... })
})
```

#### Eliminación con renumeración

Tras eliminar, **renumerar las postas restantes** de la actividad para mantener orden contiguo (mismo patrón que `deleteCriterio` en Plan 5 y `deleteActividad` en Plan 6a).

Commit (consolidado con Paso 4): `feat(repo): postas y patrullas con tenant isolation y validación de juez`

---

### Paso 4 — Repositorio `patrulla.repo.ts`

Archivo: `src/repositories/patrulla.repo.ts`.

Funciones públicas:

```ts
// Lecturas (cacheadas con tag eventos:orgId)
listPatrullasByEvento(organizationId, eventoId): Promise<PatrullaConGrupo[]>
findPatrullaById(organizationId, patrullaId): Promise<PatrullaConGrupo | null>

// Mutaciones
createPatrulla(organizationId, eventoId, data, actorUserId): Promise<{ id }>
updatePatrulla(organizationId, patrullaId, data, actorUserId): Promise<Patrulla>
deletePatrulla(organizationId, patrullaId, actorUserId): Promise<void>
```

#### Validación de grupo scout

```ts
// Validar que el grupo scout pertenece a la org
const grupo = await prisma.grupoScout.findFirst({
  where: { id: grupoScoutId, organizationId },
})
if (!grupo) throw new BusinessError("GRUPO_SCOUT_INVALIDO")
```

#### Validación de unicidad de nombre

```ts
const existing = await prisma.patrulla.findFirst({
  where: { eventoId, nombre: data.nombre },
})
if (existing && existing.id !== patrullaId) throw new BusinessError("PATRULLA_NOMBRE_DUPLICADO")
```

#### Patrón general

Análogo al de postas: validación de tenant vía `evento.organizationId`, transacción con audit, `revalidateTag(cacheTags.eventos(organizationId))`.

---

### Paso 5 — Helper `listJuecesAsignables`

Archivo: `src/repositories/membership.repo.ts` (o crear si no existe — verificar en ejecución).

```ts
export function listJuecesAsignables(organizationId: string) {
  return unstable_cache(
    async () => {
      const memberships = await prisma.membership.findMany({
        where: {
          organizationId,
          role: { in: ["JUEZ", "ADMIN"] },
        },
        include: { user: true },
        orderBy: { user: { name: "asc" } },
      })
      return memberships.map((m) => ({
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
      }))
    },
    ["juecesAsignables", organizationId],
    { tags: [cacheTags.memberships(organizationId)] },
  )()
}
```

> **Nota:** verificar en ejecución si ya existe un repositorio de memberships de Plan 4. Si existe, agregar la función ahí. Si no, crear `src/repositories/membership.repo.ts` con esta función. Reusar el tag `memberships:orgId` ya definido en `cache-tags.ts` (Plan 4).

---

### Paso 6 — Ampliar `evento.repo.ts` con gates de activación

Archivo: `src/repositories/evento.repo.ts`.

Modificar `canTransitionToActivo` para acumular errores y validar los nuevos gates:

```ts
async function canTransitionToActivo(eventoId: string): Promise<void> {
  const evento = await prisma.evento.findUnique({
    where: { id: eventoId },
    include: {
      actividades: {
        include: {
          postas: { select: { id: true, nombre: true, templateId: true } },
        },
      },
      patrullas: { select: { id: true } },
    },
  })
  if (!evento) throw new BusinessError("NOT_FOUND")

  const errores: Array<{ code: string; meta?: Record<string, unknown> }> = []

  // 1. Pesos = 100 (gate Plan 6a)
  if (evento.actividades.length === 0) {
    errores.push({ code: "PESOS_INVALIDOS", meta: { sumaActual: 0, faltante: 100, sinActividades: true } })
  } else {
    const suma = evento.actividades.reduce((acc, a) => acc.plus(a.pesoRelativo), new Decimal(0))
    const diff = suma.minus(100).abs()
    if (diff.greaterThan(0.01)) {
      errores.push({
        code: "PESOS_INVALIDOS",
        meta: { sumaActual: suma.toNumber(), faltante: new Decimal(100).minus(suma).toNumber() },
      })
    }
  }

  // 2. Cada actividad ≥ 1 posta (gate Plan 6b)
  const actividadesSinPostas = evento.actividades.filter((a) => a.postas.length === 0)
  if (actividadesSinPostas.length > 0) {
    errores.push({
      code: "ACTIVIDAD_SIN_POSTAS",
      meta: { actividades: actividadesSinPostas.map((a) => ({ id: a.id, nombre: a.nombre })) },
    })
  }

  // 3. Cada posta tiene plantilla (gate Plan 6b)
  const postasSinPlantilla = evento.actividades.flatMap((a) =>
    a.postas
      .filter((p) => p.templateId === null)
      .map((p) => ({ id: p.id, nombre: p.nombre, actividadNombre: a.nombre })),
  )
  if (postasSinPlantilla.length > 0) {
    errores.push({ code: "POSTA_SIN_PLANTILLA", meta: { postas: postasSinPlantilla } })
  }

  // 4. ≥ 1 patrulla (gate Plan 6b)
  if (evento.patrullas.length === 0) {
    errores.push({ code: "EVENTO_SIN_PATRULLAS" })
  }

  if (errores.length > 0) {
    throw new BusinessError("PRE_ACTIVACION_INCOMPLETA", { errores })
  }
}
```

> **Nota de UX:** la action `transicionarEstadoAction` debe traducir `PRE_ACTIVACION_INCOMPLETA` recorriendo el array `meta.errores` y construyendo un mensaje multi-línea: cada error se renderiza con su copy específico (`es.json` namespace `admin.eventos.errors.preActivacion.*`).

---

### Paso 7 — Activar `isTemplateLocked` en `score-template.repo.ts`

Archivo: `src/repositories/score-template.repo.ts`.

Reemplazar:

```ts
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function isTemplateLocked(_templateId: string): Promise<boolean> {
  return false
}
```

Por:

```ts
export async function isTemplateLocked(templateId: string): Promise<boolean> {
  const count = await prisma.posta.count({ where: { templateId } })
  return count > 0
}
```

Esto activa el lock que Plan 5 dejó preparado: `updateScoreTemplateCore`, `deleteScoreTemplate`, `addCriterio`, `updateCriterio`, `deleteCriterio`, `reorderCriterio` ahora retornan `BusinessError("IN_USE")` cuando la plantilla está asignada a alguna posta.

**Tests de Plan 5 a actualizar**: agregar casos donde una posta usa la plantilla y se intenta modificar/eliminar.

---

### Paso 8 — Página detalle: integrar postas y patrullas

Archivo: `src/app/(app)/admin/eventos/[id]/page.tsx`.

Modificaciones:
- Cambiar la query: `findEventoById` debe incluir `actividades.postas` (con template y juez) y `patrullas` (con grupoScout). **Si esto cambia el shape del aggregate, considerar añadir una variante `findEventoCompleto` para no inflar las cargas que solo necesitan actividades**. Decisión en ejecución.
- Cargar también `listJuecesAsignables(org.organizationId)` y `listScoreTemplates(org.organizationId, { includeArchived: false })` en paralelo, para pasar a los selects de postas.
- Cargar `listGruposScouts(org.organizationId)` (existente desde Plan 4) para los selects de patrullas.

Componentes nuevos:
- `src/components/admin/eventos/PostaRow.tsx` — fila editable inline de posta (nombre, peso, descripción) + selects (plantilla, juez) + botones ↑/↓/eliminar.
- `src/components/admin/eventos/AddPostaForm.tsx` — form para agregar posta a una actividad.
- `src/components/admin/eventos/PostasInActividad.tsx` — wrapper que renderiza la lista de postas + AddPostaForm dentro de una actividad.
- `src/components/admin/eventos/PatrullasList.tsx` — Server Component con header + lista de PatrullaRow + AddPatrullaForm.
- `src/components/admin/eventos/PatrullaRow.tsx` — fila editable inline de patrulla.
- `src/components/admin/eventos/AddPatrullaForm.tsx` — form para agregar patrulla.

Componentes modificados:
- `src/components/admin/eventos/ActividadRow.tsx` — agregar render de `PostasInActividad` debajo de la metadata de la actividad. Visual: indent + borde izquierdo para indicar jerarquía.
- `src/components/admin/eventos/EventoEstadoControls.tsx` — recibir `patrullasCount` además de actividades; deshabilitar "Activar evento" si `patrullasCount === 0`. Tooltip ampliado.

Estructura visual del detalle (post-Plan 6b):

```
Header (nombre, badge estado, fechas)
─────────────────────────────────────────
Información general                     ← EventoMetadataForm
─────────────────────────────────────────
Estado del evento                       ← EventoEstadoControls (con gates ampliados)
─────────────────────────────────────────
Actividades  X% / 100%
  ┌─ Actividad 1 (Construcción, 40%)    ← ActividadRow
  │  └─ Postas
  │     ├─ Posta 1.1 (plantilla, juez, peso 1.0)  ← PostaRow
  │     ├─ Posta 1.2 (plantilla, juez, peso 2.0)
  │     └─ + Agregar posta              ← AddPostaForm
  ├─ Actividad 2 (Cocina, 30%)
  │  └─ Postas
  │     └─ + Agregar posta
  └─ + Agregar actividad                ← AddActividadForm
─────────────────────────────────────────
Patrullas                                ← PatrullasList
  ├─ Halcones (JPII, EXPLORADOR)        ← PatrullaRow
  ├─ Águilas (DonBosco, ROVER)
  └─ + Agregar patrulla                 ← AddPatrullaForm
─────────────────────────────────────────
[Acciones peligrosas]                    ← solo en BORRADOR
```

#### Patrón de fila editable (siguiendo Plan 4 lección #3 + Plans 5, 6a)

- `useState` para los inputs y selects.
- `useState` paralelo para `saved*` inicializado desde props al montar.
- Botón "Guardar" visible solo cuando `isDirty`.
- En `useEffect([actionState])`, sincronizar `saved*` desde el resultado de la action (NO desde props).
- `updatePosta` / `updatePatrulla` retornan el registro actualizado y la action lo expone en `actionState.posta` / `actionState.patrulla`.

#### Componentes ya existentes a reusar

- `EventoMetadataForm`, `EventoEstadoControls`, `ActividadRow`, `AddActividadForm`, `DeleteEventoForm` — siguen funcionando, se extiende `EventoEstadoControls` con el gate de patrullas.

---

### Paso 9 — Server actions

Archivo: `src/app/(app)/admin/eventos/[id]/actions.ts`.

Agregar las 9 actions listadas en "Estructura de rutas". Cada una:
1. `requireRole(['ADMIN'])`.
2. Validación Zod del input.
3. Llamar al repo correspondiente.
4. Capturar `BusinessError` → `return { error: copy.es.json[code] }`.
5. Para mutaciones que retornan datos (update*), devolver el objeto en `actionState` para sync inline.

Validaciones Zod (sintetizadas):

```ts
// Posta create/update
const postaSchema = z.object({
  nombre: z.string().min(2).max(100).trim(),
  descripcion: z.string().max(500).optional(),
  weight: z.coerce.number().min(0.01).max(999.99),
})

// Patrulla create/update
const patrullaSchema = z.object({
  nombre: z.string().min(2).max(80).trim(),
  grupoScoutId: z.string().min(1),
  categoria: z.enum(["LOBATO", "EXPLORADOR", "PIONERO", "ROVER"]).optional().nullable(),
})
```

---

### Paso 10 — Copy en `es.json`

Agregar al namespace `admin.eventos`:

```json
{
  "postas": {
    "title": "Postas",
    "empty": "Aún no hay postas. Agregá la primera abajo.",
    "addTitle": "Agregar posta",
    "addSubmit": "Agregar",
    "row": {
      "nombre": "Nombre",
      "descripcion": "Descripción (opcional)",
      "weight": "Peso",
      "plantilla": "Plantilla",
      "plantillaSinAsignar": "(sin asignar)",
      "juez": "Juez",
      "juezSinAsignar": "(sin asignar)",
      "save": "Guardar",
      "delete": "Eliminar",
      "moveUp": "Subir",
      "moveDown": "Bajar",
      "deleteConfirm": "¿Eliminar la posta \"{{nombre}}\"?"
    }
  },
  "patrullas": {
    "title": "Patrullas",
    "empty": "Aún no hay patrullas inscritas. Agregá la primera abajo.",
    "addTitle": "Agregar patrulla",
    "addSubmit": "Agregar",
    "categoria": {
      "LOBATO": "Lobatos",
      "EXPLORADOR": "Exploradores",
      "PIONERO": "Pioneros",
      "ROVER": "Rovers",
      "MIXTA": "Mixta"
    },
    "row": {
      "nombre": "Nombre",
      "grupoScout": "Grupo scout",
      "categoria": "Categoría",
      "categoriaPlaceholder": "Mixta o sin definir",
      "save": "Guardar",
      "delete": "Eliminar",
      "deleteConfirm": "¿Eliminar la patrulla \"{{nombre}}\"?"
    }
  },
  "errors": {
    "...": "(existentes de Plan 6a)",
    "postaNoEncontrada": "Posta no encontrada",
    "patrullaNoEncontrada": "Patrulla no encontrada",
    "patrullaNombreDuplicado": "Ya existe una patrulla con ese nombre en este evento",
    "juezInvalido": "El usuario seleccionado no tiene rol de juez en este distrito",
    "grupoScoutInvalido": "El grupo scout seleccionado no pertenece al distrito",
    "plantillaInvalida": "La plantilla seleccionada no es válida o está archivada",
    "preActivacion": {
      "intro": "No se puede activar el evento. Resolvé estos puntos:",
      "actividadSinPostas": "{{count}} actividad sin postas: {{nombres}}",
      "actividadesSinPostas": "{{count}} actividades sin postas: {{nombres}}",
      "postaSinPlantilla": "{{count}} posta sin plantilla: {{nombres}}",
      "postasSinPlantilla": "{{count}} postas sin plantilla: {{nombres}}",
      "eventoSinPatrullas": "El evento no tiene patrullas inscritas"
    }
  }
}
```

---

### Paso 11 — Tests Vitest

Archivos:
- `src/repositories/posta.repo.test.ts` — nuevo.
- `src/repositories/patrulla.repo.test.ts` — nuevo.
- `src/repositories/evento.repo.test.ts` — extender con casos de gates ampliados.
- `src/repositories/score-template.repo.test.ts` — extender con casos donde `isTemplateLocked` retorna `true` por posta asignada.

> **Importante:** todos los tests usan `vi.hoisted` para los mocks (Plan 6a lección #2). No declarar `const mockFn = vi.fn()` antes de `vi.mock(...)`.

Casos prioritarios para `posta.repo.test.ts`:
- Crear posta con weight default 1.0 → ok.
- Crear posta con weight 2.5 → ok.
- Crear posta sin templateId → ok (es opcional).
- Crear posta con templateId de otra org → `BusinessError("PLANTILLA_INVALIDA")`.
- Crear posta con templateId archivado → `BusinessError("PLANTILLA_INVALIDA")`.
- Asignar juez con User sin membership en la org → `BusinessError("JUEZ_INVALIDO")`.
- Asignar juez con User rol ESPECTADOR → `BusinessError("JUEZ_INVALIDO")`.
- Asignar juez con User rol JUEZ → ok.
- Asignar juez con User rol ADMIN → ok.
- Desasignar juez (`assignJuez(postaId, null)`) → ok.
- Reordenar 3 postas → orden correcto sin violar `@@unique([actividadId, orden])`.
- Eliminar posta → restantes renumeradas.
- Tenant isolation: distrito A no puede ver/modificar postas de actividades de distrito B.
- Validar que `posta.actividad.evento.organizationId` se chequea en cada mutación (cada función probada con FK a evento de otra org).

Casos prioritarios para `patrulla.repo.test.ts`:
- Crear patrulla con grupoScoutId válido → ok.
- Crear patrulla con grupoScoutId de otra org → `BusinessError("GRUPO_SCOUT_INVALIDO")`.
- Crear dos patrullas con mismo nombre en mismo evento → segunda falla con `BusinessError("PATRULLA_NOMBRE_DUPLICADO")`.
- Crear patrulla con categoria=null (mixta) → ok.
- Crear patrulla con categoria=EXPLORADOR → ok.
- Update categoria → ok.
- Delete patrulla → ok, evento intacto.
- Tenant isolation: distrito A no puede ver/modificar patrullas de distrito B.

Casos a extender en `evento.repo.test.ts`:
- Activar evento con 1 actividad sin postas → `PRE_ACTIVACION_INCOMPLETA` con `errores: [{ code: "ACTIVIDAD_SIN_POSTAS", meta: { actividades: [...] } }]`.
- Activar con 1 posta sin plantilla → `PRE_ACTIVACION_INCOMPLETA` con `POSTA_SIN_PLANTILLA`.
- Activar con 0 patrullas → `PRE_ACTIVACION_INCOMPLETA` con `EVENTO_SIN_PATRULLAS`.
- Activar con todos los problemas (sin postas + sin patrullas + pesos != 100) → array `errores` con 3 entradas.
- Activar con todo OK (actividades 100%, postas con plantilla, ≥1 patrulla) → ok.

Casos a extender en `score-template.repo.test.ts`:
- `isTemplateLocked` retorna `false` si no hay postas con `templateId`.
- `isTemplateLocked` retorna `true` si al menos una posta usa la plantilla.
- `updateScoreTemplateCore` con plantilla en uso por posta → `BusinessError("IN_USE")`.
- `deleteScoreTemplate` con plantilla en uso por posta → `BusinessError("IN_USE")`.

Commit (consolidado): `test(repo): postas, patrullas y gates de pre-activación`

---

## Archivos creados / modificados

| Archivo | Acción | Función |
|---|---|---|
| `prisma/schema.prisma` | modificar | Agregar enum `PatrullaCategoria`, modelos `Posta` y `Patrulla`, relaciones inversas |
| `prisma/migrations/.../migration.sql` | crear | Migración generada por Prisma |
| `src/lib/errors.ts` | modificar | Códigos nuevos para postas, patrullas y gates de activación |
| `src/repositories/posta.repo.ts` | crear | CRUD de postas + asignación de plantilla y juez |
| `src/repositories/patrulla.repo.ts` | crear | CRUD de patrullas |
| `src/repositories/membership.repo.ts` | crear o extender | Helper `listJuecesAsignables` |
| `src/repositories/evento.repo.ts` | modificar | `canTransitionToActivo` ampliado con gates Plan 6b, acumulación de errores |
| `src/repositories/score-template.repo.ts` | modificar | Activar `isTemplateLocked` con consulta a `Posta` |
| `src/repositories/posta.repo.test.ts` | crear | Tests Vitest |
| `src/repositories/patrulla.repo.test.ts` | crear | Tests Vitest |
| `src/repositories/evento.repo.test.ts` | modificar | Casos de gates ampliados |
| `src/repositories/score-template.repo.test.ts` | modificar | Casos de plantilla lockeada por posta |
| `src/app/(app)/admin/eventos/[id]/page.tsx` | modificar | Cargar postas, patrullas, jueces asignables, plantillas activas, grupos scouts; ampliar layout |
| `src/app/(app)/admin/eventos/[id]/actions.ts` | modificar | 9 actions nuevas (postas + patrullas) |
| `src/components/admin/eventos/ActividadRow.tsx` | modificar | Renderizar `PostasInActividad` indentado |
| `src/components/admin/eventos/PostasInActividad.tsx` | crear | Wrapper de lista + form de agregar |
| `src/components/admin/eventos/PostaRow.tsx` | crear | Fila editable inline de posta |
| `src/components/admin/eventos/AddPostaForm.tsx` | crear | Form de agregar posta |
| `src/components/admin/eventos/PatrullasList.tsx` | crear | Sección de patrullas |
| `src/components/admin/eventos/PatrullaRow.tsx` | crear | Fila editable inline de patrulla |
| `src/components/admin/eventos/AddPatrullaForm.tsx` | crear | Form de agregar patrulla |
| `src/components/admin/eventos/EventoEstadoControls.tsx` | modificar | Gate client-side ampliado: deshabilitar "Activar" si sin patrullas |
| `src/messages/es.json` | modificar | Namespaces `admin.eventos.postas`, `admin.eventos.patrullas`, errores nuevos |
| `CLAUDE.md` | modificar | Marcar Plan 6b como completado en sección "Estado actual" |
| `docs/README.md` | modificar | Listar Plan 6b |
| `docs/plans/00-master-plan.md` | modificar | Marcar Plan 6b como ✅ ejecutado, registrar decisión PatrullaLead diferida a Plan 6 |

---

## Verificación

### Verificación automática

```bash
pnpm typecheck     # 0 errores
pnpm lint          # 0 errores
pnpm test          # tests del repo + extensiones en verde
pnpm prisma migrate status   # migración aplicada
pnpm build         # build exitoso
```

### Verificación manual end-to-end

Pre-requisito: distrito con ADMIN logueado, ≥1 grupo scout (Plan 4), ≥1 plantilla activa (Plan 5), ≥1 evento BORRADOR con ≥1 actividad y pesos = 100% (Plan 6a). Idealmente: 2 jueces invitados (Plan 4) con membership rol JUEZ.

**Escenario 1 — Crear posta con plantilla y juez**:
1. Abrir el detalle del evento BORRADOR.
2. En la actividad "Construcción de balsa", click "+ Agregar posta".
3. Completar: nombre "Amarres", descripción "evaluar amarre cuadrado", weight 1.0.
4. Submit → la posta aparece debajo de la actividad, con orden=1.
5. En el select "Plantilla", elegir una plantilla activa de Plan 5.
6. En el select "Juez", elegir un User con rol JUEZ.
7. Click "Guardar" → soft refresh → posta persistida con plantilla y juez. Campo `juezUser.name` se muestra en la fila.

**Escenario 2 — Posta sin plantilla en BORRADOR (válido)**:
1. Agregar otra posta "Nudos rápidos" sin asignar plantilla. Submit → ok, fila muestra "(sin asignar)" en plantilla.
2. El gate al activar debe detectar este caso (Escenario 7).

**Escenario 3 — Asignar juez inválido (defensa server)**:
1. Manualmente forzar un POST a `assignJuezAction` con un userId que no tiene membership en la org (ej: User de otro distrito).
2. Server retorna `BusinessError("JUEZ_INVALIDO")` → UI muestra panel rojo "El usuario seleccionado no tiene rol de juez en este distrito".

**Escenario 4 — Reordenar postas dentro de actividad**:
1. En "Construcción de balsa", crear 3 postas (orden 1, 2, 3).
2. Click ▼ en la primera → soft refresh → la primera y segunda intercambian (orden ahora 2, 1, 3).
3. Recargar página → orden persistido. Sin violación de `@@unique([actividadId, orden])`.

**Escenario 5 — Eliminar posta**:
1. Eliminar la posta "Amarres". Las restantes se renumeran (orden 1, 2 → 1, 2 contiguo).
2. Audit log registra `posta.deleted` con metadata `{ actividadId, nombre }`.

**Escenario 6 — Crear patrulla**:
1. En la sección "Patrullas", click "+ Agregar patrulla".
2. Completar: nombre "Halcones", grupo "Juan Pablo II", categoría "Exploradores".
3. Submit → patrulla aparece en la lista.
4. Crear segunda patrulla con mismo nombre "Halcones" en el mismo evento → server retorna `PATRULLA_NOMBRE_DUPLICADO`. UI muestra error.
5. Crear "Águilas" en grupo "Don Bosco" sin categoría → ok, fila muestra "Mixta o sin definir" en columna categoría.

**Escenario 7 — Gate al activar: pre-activación incompleta**:
1. Setup: evento con 2 actividades (40% + 60% = 100%), una sola actividad tiene 1 posta sin plantilla, 0 patrullas.
2. Click "Activar evento" → server retorna `PRE_ACTIVACION_INCOMPLETA` con array de 3 errores: `ACTIVIDAD_SIN_POSTAS` (1 actividad), `POSTA_SIN_PLANTILLA` (1 posta), `EVENTO_SIN_PATRULLAS`.
3. UI muestra panel rojo multi-línea:
   - "No se puede activar el evento. Resolvé estos puntos:"
   - "1 actividad sin postas: Cocina"
   - "1 posta sin plantilla: Amarres (en Construcción de balsa)"
   - "El evento no tiene patrullas inscritas"
4. Estado sigue en BORRADOR.

**Escenario 8 — Gate al activar: todo OK**:
1. Asignar plantilla a la posta "Amarres". Agregar postas a "Cocina". Agregar 1 patrulla.
2. Click "Activar evento" → estado cambia a ACTIVO. Botón "Cerrar evento" reemplaza al de "Activar".

**Escenario 9 — Botón "Activar evento" deshabilitado client-side por sin patrullas**:
1. Evento con actividades 100% y postas con plantilla, pero 0 patrullas.
2. Botón "Activar evento" deshabilitado, tooltip: "Falta al menos una patrulla inscrita".

**Escenario 10 — `isTemplateLocked` activa**:
1. Asignar la plantilla "Plantilla X" a una posta.
2. En `/admin/plantillas`, intentar editar el `core` de "Plantilla X" → server retorna `IN_USE`. UI muestra el aviso "Plantilla en uso por una posta; no se pueden modificar la modalidad ni las escalas".
3. Intentar archivar/eliminar → bloqueado igualmente.
4. Modificar metadata (nombre, descripción) → ok (esto sigue permitido en Plan 5).

**Escenario 11 — Tenant isolation**:
1. Loguear como admin de un segundo distrito.
2. Listar eventos → solo los del distrito B.
3. Intentar acceder a `/admin/eventos/[id-de-A]` → 404 (mismo patrón Plan 6a).
4. En el detalle de un evento de B, los selects de juez muestran solo Users con membership en B (no del distrito A).
5. Los selects de plantilla muestran solo plantillas de B.
6. Los selects de grupo scout muestran solo grupos de B.

**Escenario 12 — Auditoría**:
```sql
SELECT action, metadata, "createdAt"
FROM "AuditLog"
WHERE "organizationId" = '<tu-org-id>'
  AND (action LIKE 'posta%' OR action LIKE 'patrulla%')
ORDER BY "createdAt" DESC
LIMIT 30;
```
Confirmar presencia de: `posta.created`, `posta.updated`, `posta.deleted`, `posta.reordered`, `posta.templateAssigned`, `posta.juezAssigned`, `posta.juezUnassigned`, `patrulla.created`, `patrulla.updated`, `patrulla.deleted`.

**Escenario 13 — Cascade al eliminar evento BORRADOR**:
1. Crear evento BORRADOR completo con actividades, postas, patrullas.
2. Eliminar evento → cascade elimina actividades → cascade elimina postas. Patrullas también se eliminan (cascade desde Evento).
3. Audit log registra `evento.deleted`. Las eliminaciones en cascada NO disparan eventos individuales en audit (decisión: el `evento.deleted` lo cubre).

**Escenario 14 — Eliminar grupo con patrullas (defensa)**:
1. Intentar eliminar un Grupo Scout que tiene patrullas inscritas en algún evento.
2. Server retorna error de FK constraint (`onDelete: Restrict`). El repo de grupos (Plan 4) debe traducirlo a copy amigable.
3. **Tarea adicional**: revisar Plan 4 `grupoScout.repo.ts` para asegurar que captura este caso. Si no lo hace, agregar el guard en este Plan o en una nota para futuro plan.

### Criterios de aceptación

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en limpio.
- [ ] Migración Prisma se aplica sin warnings.
- [ ] CRUD de postas funciona: agregar, editar inline, reordenar, eliminar, asignar plantilla, asignar juez.
- [ ] CRUD de patrullas funciona: agregar, editar, eliminar.
- [ ] Reordenar postas respeta `@@unique([actividadId, orden])`.
- [ ] Validación de juez con rol JUEZ/ADMIN funciona; rechaza otros roles.
- [ ] Validación de plantilla pertenece a la org y no archivada funciona.
- [ ] Validación de grupo scout pertenece a la org funciona.
- [ ] `transicionarEstado(BORRADOR → ACTIVO)` valida los 4 gates: pesos = 100, postas por actividad, plantillas asignadas, patrullas ≥ 1.
- [ ] `PRE_ACTIVACION_INCOMPLETA` retorna array completo de errores (no fail-fast).
- [ ] Botón "Activar evento" deshabilitado client-side cuando algún gate falla.
- [ ] `isTemplateLocked` retorna `true` para plantillas asignadas a postas; `updateScoreTemplateCore` y `deleteScoreTemplate` son bloqueados.
- [ ] Tenant isolation verificada con dos distritos (postas, patrullas, jueces, plantillas, grupos).
- [ ] Todos los textos visibles vienen de `src/messages/es.json`.
- [ ] Audit log registra todas las mutaciones esperadas.
- [ ] `isEventoLocked` sigue retornando `false` (preparado para Plan 7a).
- [ ] PatrullaLead documentado como diferido a Plan 6 en master plan.

---

## Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Carga del aggregate evento se infla (postas + plantillas + jueces + patrullas + grupos) y el render se vuelve lento | Media | Un evento típico tiene < 5 actividades × 5 postas = 25 postas, < 20 patrullas. Aggregate manejable. Si la página se siente lenta, dividir en sub-Server Components con `Suspense` (deferido para Plan 7 si aplica). |
| Cache `eventos:orgId` se invalida demasiado seguido (cada mutación de posta/patrulla la dispara) | Baja | Aceptable: el costo de revalidación es bajo y la consistencia es valiosa. Tag granular por evento (`evento:eventoId`) sería over-engineering para MVP. |
| Validación de juez en cada `assignJuez` agrega latencia (extra query a Membership) | Baja | Una query indexada (`@@index([organizationId])`) es trivial. Aceptable. |
| Re-render del aggregate después de mutar una sola posta resetea inputs de otras postas en edición | Media | Patrón Plan 4 lección #3: cada `PostaRow` mantiene su `useState` independiente y solo sincroniza `saved*` desde su propio `actionState`. `revalidateTag` actualiza el Server Component pero los `useState` siguen vivos en cada fila. Cubierto por escenario 4. |
| El admin asigna juez, después le quita la membership, juez queda como "fantasma" en posta | Baja | Documentado en decisión #6. La UI puede mostrar warning si `juezUser.memberships` no incluye uno con rol JUEZ/ADMIN actual. Mejora menor — si surge, abrir issue. |
| Plantilla archivada no aparece en select pero la posta podría ya tener una asignada | Media | `findEventoById` incluye `template` con su `archivedAt`. La UI muestra el nombre de la plantilla incluso si está archivada (con badge "Archivada"), pero el select para reasignar solo lista activas. El admin puede ver el dato histórico. |
| Eliminar plantilla bloqueada por posta confunde al admin (mensaje genérico "IN_USE") | Baja | El copy de error en `es.json` ahora puede precisar "en uso por X postas". Plan 5 ya tiene el código `IN_USE`; refinar el mensaje en `es.json` durante Plan 6b. |
| FK `onDelete: Restrict` en `Patrulla.grupoScoutId` puede causar errores no manejados al borrar grupo | Media | Capturar `P2003` (FK constraint) en `deleteGrupoScout` (Plan 4) y traducir a `BusinessError("GRUPO_TIENE_PATRULLAS")` con guidance "Eliminá las patrullas de eventos BORRADOR antes de borrar el grupo". Tarea de verificación en Escenario 14. |
| Categoría DIRIGENTE no validada client-side podría enviarse via DevTools | Baja | El select solo lista los 4 valores. Server-side, Zod `z.enum(["LOBATO", "EXPLORADOR", "PIONERO", "ROVER"])` rechaza otros. Defensa en capas. |
| Reordenar posta dentro de una actividad con scores cargados (Plan 7a) podría confundir al juez | Media | Plan 7a tomará la decisión. Plan 6b deja el reorden libre. Si surge problema, lock por `isEventoLocked` lo bloqueará. |
| El gate `PRE_ACTIVACION_INCOMPLETA` con muchos errores satura el panel rojo | Baja | UI con scroll si necesario. Para MVP, lista plana es suficiente. Mejora futura: agrupar por tipo de error. |
| Cambios en el shape de `EventoConActividades` rompen el código de Plan 6a (ej: `EventoEstadoControls` recibe `actividades` con shape distinto) | Media | Plan 6b extiende, no reemplaza. Si el shape cambia (incluir postas dentro de cada actividad), revisar todos los consumidores: `EventoEstadoControls`, `ActividadRow`, lista de eventos. Tipos de TS atrapan los problemas en compile time. |

---

## Antes de ejecutar — checklist

- [ ] Plan 6a mergeado en `main`, todos los tests verdes.
- [ ] Branch limpio, `git status` sin pendientes.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pasan en `main`.
- [ ] Confirmar que existe el repo `membership.repo.ts` (Plan 4) o decidir crearlo en este plan.
- [ ] Confirmar que `cacheTags.memberships(orgId)` ya está definido en `src/repositories/cache-tags.ts` (Plan 4). Reusar.
- [ ] Confirmar que existe `listGruposScouts(orgId)` (Plan 4) y exporta el shape esperado para los selects de patrulla.
- [ ] Confirmar que el helper `slugify` no se necesita en este plan (Patrullas y Postas no tienen slug — solo nombre + IDs cuid2 internos).
- [ ] Confirmar la decisión de PatrullaLead diferido a Plan 6 (queda registrada en este plan + master plan).

---

## Proceso de planeación (educativo)

Este plan se redactó con Claude Opus en plan mode siguiendo el workflow Opus/Sonnet establecido en CLAUDE.md.

1. **Lectura previa**: el agente leyó `CLAUDE.md`, el master plan completo, Plan 6a en su totalidad (incluyendo lecciones aprendidas sobre `Decimal` en client components y `vi.hoisted` en Vitest), ADR-0003, `prisma/schema.prisma`, los repositorios de referencia (`score-template.repo.ts` y `evento.repo.ts`), y la página detalle de evento (`src/app/(app)/admin/eventos/[id]/page.tsx`). Detectó que `Posta`, `Patrulla` y el enum `PatrullaCategoria` no existen en el schema actual, y que Plan 6a dejó preparados dos puentes: `isEventoLocked()` retornando `false` y `isTemplateLocked()` retornando `false`. Plan 6b activa el segundo (consultando `Posta`) y deja el primero para Plan 7a.

2. **Decisiones planteadas en cuatro preguntas dirigidas (`AskUserQuestion`)**:
   - **Peso de postas dentro de la actividad**: `Decimal libre default 1.0` vs suma 100% vs sin peso. Usuario eligió **`Decimal libre default 1.0`** — coincide con el master plan (`Posta.weight`) y con la semántica del escultismo (multiplicadores simples, no porcentajes anidados).
   - **Scope de patrullas**: por evento global vs por actividad. Usuario eligió **por evento global** — coincide con el master plan ("Patrulla — equipo competidor, definido por evento") y simplifica el schema.
   - **Lock real (`isEventoLocked`)**: activar en 6b vs diferir a 7a. Usuario eligió **diferir a 7a** — sin scores cargados no hay riesgo de pérdida de datos, y bloquear por estado limitaría operaciones legítimas (reasignar juez ausente, agregar patrulla tardía).
   - **Gates al activar (multi-select)**: usuario eligió **3 de 4 gates**: ≥1 posta por actividad, plantilla asignada por posta, ≥1 patrulla. NO requirió juez asignado — coincide con la realidad operativa (jueces se asignan el día del evento).

3. **Decisiones tomadas sin preguntar** (por convención o por extensión directa de Plan 6a):
   - Capa de repositorios siguiendo ADR-0002 (lecturas con `unstable_cache`, escrituras transaccionales con audit log).
   - Cache tag compartido `eventos:orgId` para postas y patrullas (mismo aggregate del evento).
   - `revalidateTag` en cada mutación (Plan 5 lección #16, Plan 6a).
   - Filas editables inline siguiendo el patrón Plan 4 lección #3.
   - `BusinessError(code, meta?)` para errores de negocio (CLAUDE.md punto 19).
   - Botones ↑/↓ en lugar de drag-and-drop (mobile-friendly, sin librerías).
   - Constraint `@@unique([actividadId, orden])` y reorden con valor temporal `-1` (Plans 5 y 6a).
   - Enum nuevo `PatrullaCategoria` separado de `CategoriaScout` (paralelo a Plan 6a separando `ActividadTipo` de `ScoreTemplateCategoria`).
   - FK a `User` para juez con `onDelete: SetNull` (preservar dato histórico).
   - FK opcional `templateId` con gate al activar (vs FK obligatoria — interpretación del usuario al marcar "plantilla asignada" como gate).
   - PatrullaLead diferido a Plan 6 (sin consumidor que lo lea, agregarlo es trabajo muerto).
   - `canTransitionToActivo` reescrito acumulando errores (mejor UX que fail-fast).
   - Activar `isTemplateLocked` en Plan 6b como efecto colateral natural de introducir `Posta.templateId`.

4. **Reuso explícito de patrones** de Plans 4, 5 y 6a: estructura de rutas, capa de repositorios, audit log co-localizado, `useActionState` + `revalidateTag` granular, fila editable con estado `saved`, `BusinessError` con códigos. Plan 6b es en gran medida una aplicación directa del esqueleto de Plan 6a a dos entidades nuevas, con dos diferencias clave: validación de tenant a través de dos niveles (`actividad → evento → org` y `evento → org`), y el gate ampliado de pre-activación con acumulación de errores.

5. **Alineación con CLAUDE.md**: cada decisión técnica se contrastó contra las convenciones del proyecto (tenant isolation vía repos, naming bilingüe — `Posta` y `Patrulla` en español del dominio, server actions sobre API routes, Zod en el borde, copy en `es.json`, `BusinessError` para errores de negocio, repositorios para todo lo de DB, `cuid2` en IDs, `Decimal` para pesos). Sin contradicciones.

---

## Preguntas abiertas para el usuario (no bloqueantes)

1. ¿Conviene agregar visualización del **count de postas asignadas a juez X** dentro del select de juez (ej: "Juan Pérez (3 postas)")? Útil para distribuir carga, pero introduce queries extra. Decisión menor — se puede agregar en ejecución si el visual es trivial.
2. ¿Debe el panel de errores de `PRE_ACTIVACION_INCOMPLETA` tener **deep links** a las actividades/postas con problemas (anchor scroll dentro de la misma página)? UX mejor pero más complejo. Para MVP, lista plana es suficiente.
3. La activación de `isTemplateLocked` puede sorprender a usuarios que ya asignaron una plantilla y la querían modificar. **¿Mostrar un aviso visible en `/admin/plantillas`** cuando la plantilla está en uso (badge "En uso") para que el admin entienda por qué los botones de editar core / archivar / eliminar están deshabilitados? Mejora UX. Decisión menor.

---

## Commits sugeridos

| # | Mensaje |
|---|---|
| 1 | `feat(schema): postas con plantilla y juez, patrullas por evento` |
| 2 | `feat(repo): postas y patrullas con tenant isolation y validación de juez` |
| 3 | `feat(repo): activar isTemplateLocked y gates ampliados de pre-activación` |
| 4 | `feat(admin): postas inline en actividades y sección de patrullas` |
| 5 | `test(repo): postas, patrullas y gates de pre-activación` |
| 6 | `docs(plan): Plan 6b ejecutado con commits y lecciones aprendidas` |

---

## Lecciones aprendidas

### Lección #1 — Selects que auto-submitean deben ser controlados, no `defaultValue`

**Problema:** `PostaRow.tsx` usaba `defaultValue={currentTemplate?.id ?? ""}` y `defaultValue={posta.juezUser?.id ?? ""}` en los `<select>` de plantilla y juez. Estos selects auto-submiten al cambiar (`onChange → form.requestSubmit()`). Después de que el servidor devolvía la posta actualizada, el `useEffect([templateState])` actualizaba `currentTemplate` desde el resultado de la action, pero el DOM del select no se reseteaba — React no sincroniza `defaultValue` tras el mount. El select mostraba el valor anterior o quedaba desincronizado del estado lógico.

**Solución:** Convertir a selects controlados con estado local de ID: `useState(posta.templateId ?? "")` → `value={selectedTemplateId}` → actualizar desde `actionState` vía `useEffect`. El estado de ID (string) es la fuente de verdad del select; el objeto completo (`currentTemplate`) sigue como estado auxiliar para mostrar el nombre.

**Regla derivada:** **Todo `<select>` que auto-submita debe ser controlado (`value` + `onChange` con `setState`)**. El patrón `defaultValue` solo es válido para formularios donde el usuario hace submit manual y el componente se remonta después. Cuando hay actualizaciones parciales sin remount (Server Action + soft refresh), `defaultValue` queda obsoleto.

---

### Lección #2 — `whitespace-pre-wrap` es necesario para errores con saltos de línea en el DOM

**Problema:** El panel de error de `PRE_ACTIVACION_INCOMPLETA` acumula múltiples mensajes separados por `\n` (un error por línea). Sin `whitespace-pre-wrap`, el navegador colapsa los espacios en blanco y renderiza todo en una sola línea ilegible.

**Solución:** Agregar `whitespace-pre-wrap` a la clase CSS del div que renderiza `state.error`.

**Regla derivada:** Cuando una server action puede retornar strings multi-línea como mensaje de error (ej: `PRE_ACTIVACION_INCOMPLETA` con lista de gates fallidos), el contenedor HTML debe tener `whitespace-pre-wrap` o renderizar el string como JSX con `split('\n').map(...)`. Para MVP, `whitespace-pre-wrap` es la solución más simple.

---

### Lección #3 — `onDelete: Restrict` en FK requiere guard en el repo del lado opuesto

**Problema:** `Patrulla.grupoScoutId` tiene `onDelete: Restrict`. El escenario 14 del plan lo anticipó como "tarea adicional: revisar `grupoScout.repo.ts`". En la revisión de escenarios post-implementación se confirmó que `deleteGrupo` no manejaba el código `HAS_PATRULLAS`: si el admin intentaba borrar un grupo con patrullas inscriptas, se producía un error de FK no controlado (P2003) que llegaba sin traducir al usuario.

**Solución:** Agregar guard en `grupo.repo.ts` que cuenta las patrullas antes de eliminar y lanza `BusinessError("HAS_PATRULLAS", { count })`. En `grupos/actions.ts`, capturar ese código y mostrar "No se puede borrar: el grupo tiene X patrulla(s) inscripta(s) en eventos. Eliminá las patrullas primero."

**Regla derivada:** Cada vez que se agrega `onDelete: Restrict` a una FK, **verificar en ese mismo plan que el repo del lado "uno" (la entidad referenciada) maneje el caso de borrado bloqueado**. No dejarlo como "tarea futura" — el escenario de borrado es predecible y el usuario lo va a triggear.

---

### Lección #4 — El copy del `lockedNotice` debe actualizarse cuando cambia la condición de lock

**Problema:** `isTemplateLocked()` pasó de retornar `false` siempre a consultar `Posta.templateId`. El texto del aviso en `/admin/plantillas` seguía diciendo algo como "usada en X eventos" cuando en realidad debería decir "asignada a X postas". El copy estaba hardcodeado o en `es.json` con la semántica de "eventos", que era la condición que Plan 5 había asumido.

**Solución:** Actualizar el copy en `es.json` para reflejar "asignada a postas" y no "usada en eventos". El `lockedNotice` es un detalle de UX pero crítico para que el admin entienda por qué no puede editar la plantilla.

**Regla derivada:** Cuando se activa un lock que antes estaba deshabilitado, **revisar el copy completo del flujo de lock** (aviso en lista, tooltip en botones deshabilitados, mensaje de error) para asegurarse que el lenguaje refleja la nueva condición real.
