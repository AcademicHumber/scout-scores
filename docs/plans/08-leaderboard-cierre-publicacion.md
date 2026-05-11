# Plan 8 — Leaderboard, cierre de evento y vistas públicas

## Contexto

Plan 7 (a/b/c/d) entregó scoring online + offline para el juez. Al final del evento, los datos en DB ya son completos: `ScoreSheet.totalPuntuable` y `totalDesempate` están persistidos por (asignación × patrulla), el evento puede transicionar a `CERRADO` cuando todas las planillas están en `ENVIADA` (gate `canTransitionToCerrado` ya existe), y el admin puede reabrir planillas individuales desde `/admin/eventos/[id]/planillas`.

Lo que falta es la fase de **resultado**: agregar las planillas en un ranking de patrullas, congelarlo, y compartirlo. Esto cierra el ciclo de Capa 1 — el sistema deja de ser solamente una herramienta operativa del staff y se convierte en algo que el público (familias, otros grupos scout, prensa local) consume.

Plan 8 entrega cuatro capacidades:

1. **Cálculo agregado** del leaderboard a partir de las planillas, con desempates y empates compartidos.
2. **Snapshot persistido** del ranking generado al publicar el evento (estable, replicable, indispensable para garantizar que la vista pública no cambie cada vez que un admin retoca algo internamente).
3. **Token público + URL `/resultados/[token]`** sin auth, accesible por QR, con vista visualmente destacada.
4. **Vistas autenticadas** (`/eventos`, `/eventos/[id]/resultados`) para ESPECTADOR y JEFE_PATRULLA dentro del shell admin.

El plan **no toca** el modelo de scoring (`ScoreSheet`, `ScoreEntry`, fórmulas) — opera enteramente sobre los totales ya calculados. Tampoco toca la capa offline ni el flujo del juez.

## Alcance

### Incluye

- Modelo: `EventLeaderboardSnapshot` (JSON precomputado por evento, 1:1 con `Evento`) y `PublicShareLink` (tokens compartibles, 1:N pero solo 1 activo por evento).
- Repo `leaderboard.repo.ts` con función pura `computeLeaderboard(eventoId, organizationId)` que devuelve el ranking calculado al vuelo, y `generateLeaderboardSnapshot(eventoId)` que persiste el resultado.
- Repo `public-share-link.repo.ts` para crear, revocar y resolver tokens.
- Vista admin `/admin/eventos/[id]/leaderboard` — siempre en tiempo real (calcula al vuelo). Incluye controles para generar/regenerar el snapshot, crear/copiar/revocar el link público, y muestra un banner cuando el snapshot está desactualizado respecto a la última mutación.
- Vista pública `/resultados/[token]` — sin auth, layout propio (`(public)/layout.tsx`), lee del snapshot. Estética "editorial podium": hero con datos del evento, podio destacado para 1°-2°-3°, tabla del resto, tabs por grupo scout.
- Vista autenticada `/eventos` (lista de eventos PUBLICADOS) y `/eventos/[id]/resultados` (mismo contenido que la pública pero dentro del shell `(app)`). Para JEFE_PATRULLA, highlight del grupo del usuario.
- Filtrado por `GrupoScout` en la vista pública/autenticada (tabs horizontales scrollables).
- Modificación de `transicionarEstado`: la transición `CERRADO → PUBLICADO` genera el snapshot y crea el `PublicShareLink` activo si no existe.
- Modificación menor de `dashboard/page.tsx`: redirect a `/eventos` para roles JEFE_PATRULLA y ESPECTADOR (mismo patrón que el redirect a `/juez/eventos` para JUEZ del Plan 7d).
- Actualización del `AppHeader` para mostrar enlace "Eventos" para roles JEFE_PATRULLA y ESPECTADOR.
- Cache tags nuevos (`leaderboard:orgId`, `publicShareLinks:orgId`).
- Strings i18n nuevos en namespace `leaderboard.*` y `eventos.publico.*`.

### No incluye

- **Exportación PDF / Excel.** Justificación detallada en la sección "Decisiones técnicas" abajo. Diferido a un Plan 8b o posterior.
- Multi-evento aggregation (ej: ranking acumulado del distrito a lo largo del año).
- Vista comparativa "rendimiento por bloque/actividad" cross-patrulla con gráficos. La vista del Plan 8 muestra el detalle por actividad/posta dentro del accordion de cada patrulla, pero no genera charts.
- Histórico de snapshots: solo se persiste **uno** por evento (regenerar lo sobreescribe). Los snapshots viejos no se versionan. Si más adelante se requiere auditoría de "qué publicaste el día X", se agrega `EventLeaderboardSnapshotHistory` o se cubre con `AuditLog`.
- Notificaciones push/email al publicar (out of scope; capa de comunicación se evalúa en Plan 9+).
- Watermark dinámico ni branding por organización en la vista pública. El nombre del distrito aparece en el hero, pero no logos personalizados.
- Re-cálculo on-the-fly en la vista pública si el snapshot no existe. La vista pública **siempre** lee del snapshot; si el snapshot no existe (estado anómalo), muestra error.
- Cambios en la lógica de scoring del Plan 7a/7b: las fórmulas, validaciones de escala y totales cacheados de `ScoreSheet` permanecen idénticos.
- Migración de cualquier ruta del juez. Plan 8 solo agrega rutas nuevas; no toca `(juez)/`.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **¿Snapshot al cerrar, al publicar, o ambos?** | Solo al publicar | El estado `CERRADO` es un puente del workflow del admin: un momento para revisar la planilla consolidada antes de exponerla. La vista pública solo existe a partir de `PUBLICADO`, así que el snapshot solo es necesario en ese punto. Esto evita generar y luego regenerar trabajo inútilmente. |
| **¿Vista admin lee del snapshot o calcula al vuelo?** | Al vuelo (con `unstable_cache`) | El admin debe ver siempre el estado actual: si reabre y reenvía una planilla, debe ver el cambio inmediato. Cachear la función con tag `leaderboard:orgId` la mantiene rápida y se invalida con cualquier mutación de score. |
| **¿Vista pública lee del snapshot o calcula al vuelo?** | Solo del snapshot | El snapshot es la promesa de estabilidad pública: si los admins corrigen algo después, no debe filtrar inadvertidamente al público. La regeneración es explícita y deliberada. |
| **¿Qué pasa con el snapshot si admin reabre una planilla post-publicación?** | Se queda igual; admin ve banner "Snapshot público desactualizado" y decide cuándo regenerar | Borrar el snapshot rompe la vista pública sin warning previo (URL muere). Regenerar automáticamente filtra cambios sin que el admin los apruebe (el público ve fluctuaciones). El control manual es la opción que respeta tanto al público como al admin. |
| **¿Cómo se detecta "snapshot desactualizado"?** | Comparar `snapshot.generatedAt` vs `MAX(scoreSheet.updatedAt)` del evento — derivado, no persistido | Evita un campo `dirty: boolean` que requiere mantenerse manualmente y puede quedar desincronizado. Una query agregada barata. |
| **¿Un link público o varios?** | 1:N por evento, pero solo **uno activo** a la vez (índice parcial `WHERE revokedAt IS NULL`) | Permite revocar y emitir uno nuevo cuando un token "se filtra" sin perder histórico. La unicidad parcial garantiza que la vista admin siempre pueda mostrar "el link". |
| **Forma del token** | `nanoid` style: 24 chars base64url-safe via `randomBytes(18).toString("base64url")` | 144 bits de entropía (suficiente para que no se enumere). URL-safe sin padding. Más corto que un UUID y suficientemente opaco. |
| **Forma del snapshot** | JSON con shape pre-calculado (ranking + breakdown por actividad/posta) | Un único `data: Json` evita una explosión de tablas. La vista lo consume tal cual sin joins. Trade-off: sin queries SQL contra el snapshot — pero no se necesitan, la vista pública es una sola pantalla. |
| **¿Vista pública con shell propio o reusando AppHeader?** | Route group `(public)/` con layout independiente | El AppHeader tiene SignOutButton, switcher de distrito, brand interno. La vista pública es para audiencia externa; debe sentirse "editorial", no "admin". Un layout limpio separado es más fácil que enmascarar. |
| **¿Vista para JEFE_PATRULLA y ESPECTADOR usa rutas separadas o reusa la pública?** | Reusan el mismo componente `LeaderboardView`, montado en `/eventos/[id]/resultados` con AppHeader | La vista en sí es idéntica. Lo único que cambia es el shell. Extraer el contenido a un componente reusable evita duplicación. |
| **¿Empates comparten posición?** | Sí: empate de `(totalPuntuable, totalDesempate)` → misma posición; siguiente patrulla salta el ordinal (1°, 2°, 2°, 4°) | Es la convención deportiva clásica. La fórmula de scoring ya prevé el desempate, así que un empate persistente es genuino y debe representarse. |
| **¿Patrulla sin planilla en una posta cuenta como 0 o se omite?** | Cuenta como 0 (la posta no califica para esa patrulla) | El gate `canTransitionToCerrado` ya garantiza que toda patrulla tiene planilla en toda posta antes de cerrar. Si se reabre una y se borra, el subtotal de esa posta cae a 0 — comportamiento esperado y consistente. |
| **¿Se puede publicar sin cerrar primero?** | No. Estado debe ser `CERRADO` antes de `PUBLICADO`, como ya define la máquina de estados | No se rompe la convención existente. Cerrar es la confirmación de "los datos están completos"; publicar es "compartir los datos completos". |
| **PDF / Excel — incluir o diferir** | **Diferir** | Justificación abajo en sección dedicada. |
| **Caching** | `unstable_cache` con tags `leaderboard:orgId` y `publicShareLinks:orgId`; invalidación en mutaciones de scoresheet, transición de evento, y cambios de share link | Granularidad por organización es la convención del proyecto (lección Plan 4). Si la regeneración masiva resulta excesiva en producción, se afina a `:orgId:eventoId` después. |

### Justificación de diferir PDF/Excel

El export a PDF/Excel se difiere a un plan futuro por estas razones:

- **Alcance**: Plan 8 ya entrega 6 archivos nuevos no triviales (snapshot + tokens + 3 vistas + componentes de UI con dirección estética propia), 2 modelos de schema, 4 server actions, e integración con la máquina de estados existente. Agregar PDF/Excel sumaría ~3-4 archivos más, dependencias pesadas (`@react-pdf/renderer` ~500KB, `xlsx` ~1MB), trabajo de typografía/layout específico al medio impreso, y propios criterios de verificación (cómo se ve en imprenta, cómo abre Excel en distintas versiones).
- **Cobertura del caso de uso por la vista pública**: el QR + URL ya cubren ~90% del uso esperado. Los participantes y padres acceden desde su celular. Imprimir el podio o exportar a Excel para análisis es secundario y puede esperar.
- **Visibilidad del trade-off**: diferir es explícito, no oculto. Cuando aparezca demanda real ("necesitamos imprimir el ranking para el cierre del campamento"), se hace un Plan 8b enfocado.
- **Dependencias**: `@react-pdf/renderer` requiere fonts embebidas (Barlow desde `@fontsource/barlow`) y un setup de templates separado del JSX de la web. `xlsx` tiene su propia API. Mejor concentrar ese trabajo en un plan dedicado.

Si el usuario insiste en incluirlo en este plan, lo ideal es un Excel mínimo (data raw, sin estilos) usando `xlsx` con un único endpoint `GET /api/eventos/[id]/leaderboard.xlsx` para admins. PDF se mantiene diferido por costo de typografía. Pero el default de este plan es: ninguno.

## Modelo de datos

### Cambios en `prisma/schema.prisma`

Dos modelos nuevos:

```prisma
model EventLeaderboardSnapshot {
  id                String   @id @default(cuid(2))
  eventoId          String   @unique
  organizationId    String
  data              Json     // LeaderboardSnapshotData — shape definido en leaderboard.repo.ts
  generatedAt       DateTime @default(now())
  generatedByUserId String?

  evento       Evento       @relation(fields: [eventoId], references: [id], onDelete: Cascade)
  organization Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  generatedBy  User?        @relation("LeaderboardSnapshotGeneratedBy", fields: [generatedByUserId], references: [id], onDelete: SetNull)

  @@index([organizationId])
  @@index([generatedAt])
}

model PublicShareLink {
  id             String    @id @default(cuid(2))
  organizationId String
  eventoId       String
  token          String    @unique
  createdAt      DateTime  @default(now())
  createdByUserId String?
  revokedAt      DateTime?
  revokedByUserId String?

  evento        Evento       @relation(fields: [eventoId], references: [id], onDelete: Cascade)
  organization  Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  createdBy     User?        @relation("PublicShareLinkCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  revokedBy     User?        @relation("PublicShareLinkRevokedBy", fields: [revokedByUserId], references: [id], onDelete: SetNull)

  @@index([eventoId])
  @@index([organizationId])
  // Índice único parcial: solo un link activo (revokedAt = null) por evento.
  // Se agrega a mano en la migración SQL como en el caso de Invitation (Plan 0b).
}
```

Cambios en relaciones existentes:

```prisma
model Evento {
  // ... existente ...
  leaderboardSnapshot EventLeaderboardSnapshot?
  publicShareLinks    PublicShareLink[]
}

model Organization {
  // ... existente ...
  leaderboardSnapshots EventLeaderboardSnapshot[]
  publicShareLinks     PublicShareLink[]
}

model User {
  // ... existente ...
  leaderboardSnapshotsGenerated EventLeaderboardSnapshot[] @relation("LeaderboardSnapshotGeneratedBy")
  publicShareLinksCreated       PublicShareLink[]          @relation("PublicShareLinkCreatedBy")
  publicShareLinksRevoked       PublicShareLink[]          @relation("PublicShareLinkRevokedBy")
}
```

### Migración

Nombre: `add_leaderboard_snapshot_and_public_share_link`.

SQL adicional manual al final de `migration.sql` (Prisma no puede generar índices únicos parciales declarativamente):

```sql
CREATE UNIQUE INDEX "PublicShareLink_eventoId_active_unique"
  ON "PublicShareLink"("eventoId")
  WHERE "revokedAt" IS NULL;
```

Sin backfill: ningún evento existente tiene snapshot ni link. Quedan en `null`/empty hasta que el admin publique.

### Forma del JSON snapshot (`leaderboard.repo.ts`)

```typescript
export type LeaderboardPostaBreakdown = {
  asignacionId: string
  postaNombre: string
  weight: number
  totalPuntuable: number | null  // null = patrulla sin planilla en esta posta
  totalDesempate: number | null
}

export type LeaderboardActividadBreakdown = {
  actividadId: string
  actividadNombre: string
  pesoRelativo: number  // 0..100
  subtotalActividad: number  // (pesoRelativo / 100) × Σ (posta.totalPuntuable × posta.weight)
  postas: LeaderboardPostaBreakdown[]
}

export type LeaderboardRow = {
  posicion: number  // 1, 2, 2, 4 (empate persistente comparte posición)
  patrullaId: string
  patrullaNombre: string
  grupoScoutId: string
  grupoScoutNombre: string
  totalPuntuable: number       // valor agregado del evento (suma ponderada)
  totalDesempate: number       // suma de criterios DESEMPATE de todas las planillas
  detalle: LeaderboardActividadBreakdown[]
}

export type LeaderboardSnapshotData = {
  eventoNombre: string
  eventoLugar: string | null
  eventoFechaInicio: string  // ISO
  eventoFechaFin: string | null  // ISO
  organizationNombre: string  // para mostrar en el hero
  generadoEn: string  // ISO — duplicado en EventLeaderboardSnapshot.generatedAt; aquí para conveniencia de la vista
  ranking: LeaderboardRow[]
  grupos: { id: string; nombre: string }[]  // para construir las tabs de filtro
}
```

Todos los `Decimal` ya están convertidos a `number` antes de persistir como JSON (Prisma serializa `Decimal` como string, lo cual rompe la vista; convertir explícitamente con `Number()`).

### Algoritmo de cálculo (función `computeLeaderboard`)

Pseudo-código:

```
1. Cargar el evento con todas sus actividades, asignaciones, posta, patrullas, scoreSheets ENVIADAS.
   - WHERE Evento.id = eventoId AND organizationId = organizationId
   - Solo incluir scoreSheets con estado = ENVIADA (las BORRADOR no cuentan).

2. Para cada patrulla del evento:
   a. Inicializar totalPuntuable = 0, totalDesempate = 0, detalle = [].
   b. Para cada actividad:
      i. subtotalActividad = 0
      ii. Para cada asignacionPosta de la actividad:
          - Buscar scoreSheet de (asignacion × patrulla).
          - Si existe y estado === "ENVIADA":
              postaPuntuable = sheet.totalPuntuable
              postaDesempate = sheet.totalDesempate
          - Si no:
              postaPuntuable = null  // contribuirá 0 al subtotal
              postaDesempate = null
          - subtotalActividad += (postaPuntuable ?? 0) × asignacion.weight
          - totalDesempate += (postaDesempate ?? 0)  // sin weight
          - Push posta a detalle de actividad.
      iii. Aplicar peso porcentual: subtotalActividad = subtotalActividad × (actividad.pesoRelativo / 100)
      iv. totalPuntuable += subtotalActividad
   c. Push fila a ranking.

3. Ordenar ranking:
   - DESC por totalPuntuable
   - Tie-break DESC por totalDesempate
   - Tie-break final ASC por patrullaNombre (visual; no afecta posición compartida)

4. Asignar posición con empate compartido:
   - posicion = 1 para la primera fila.
   - Para cada fila siguiente: si (totalPuntuable, totalDesempate) === (anterior.totalPuntuable, anterior.totalDesempate),
     mismo posicion. Si no, posicion = índice (base 1) en la lista ordenada.
   - Ej: [(100, 10), (90, 5), (90, 5), (80, 0)] → posiciones [1, 2, 2, 4].

5. Construir lista de grupos únicos (id + nombre) que aparecen en patrullas, ordenado por nombre.
```

`totalPuntuable` y `totalDesempate` ya están persistidos como `Decimal` en `ScoreSheet` por el Plan 7a — no se recalculan desde `ScoreEntry`.

**Importante**: `asignacion.weight` viene de `AsignacionPosta.weight` (Decimal(6,2), default 1). Es el multiplicador por uso de la posta en este evento — distinto del `weight` del template (que no existe).

## Implementación

Pasos en orden de dependencia. Cada paso debería dejar `pnpm typecheck` limpio antes del siguiente.

### 1. Schema + migración

- Editar `prisma/schema.prisma`: agregar `EventLeaderboardSnapshot`, `PublicShareLink`, sus relaciones y los relations nuevos en `Evento`, `Organization`, `User`.
- `pnpm prisma migrate dev --name add_leaderboard_snapshot_and_public_share_link`.
- Editar el `migration.sql` generado para agregar el `CREATE UNIQUE INDEX ... WHERE "revokedAt" IS NULL`.
- `pnpm prisma generate`.
- `pnpm typecheck` limpio.

### 2. Cache tags

`src/repositories/cache-tags.ts`: agregar `leaderboard: (orgId) => 'leaderboard:${orgId}'` y `publicShareLinks: (orgId) => 'publicShareLinks:${orgId}'`.

### 3. Repo `leaderboard.repo.ts`

`src/repositories/leaderboard.repo.ts` con la siguiente API:

```typescript
// Calcula al vuelo el ranking del evento. NO toca DB para escribir.
// Cacheado con tag leaderboard:orgId.
export function computeLeaderboard(
  organizationId: string,
  eventoId: string,
): Promise<LeaderboardSnapshotData>

// Persiste el resultado de computeLeaderboard como EventLeaderboardSnapshot.
// Idempotente: upsert por eventoId.
export async function generateLeaderboardSnapshot(
  organizationId: string,
  eventoId: string,
  actorUserId: string,
): Promise<{ generatedAt: Date }>

// Lee el snapshot persistido. Devuelve null si no existe.
// Cacheado con tag leaderboard:orgId.
export function getLeaderboardSnapshot(
  organizationId: string,
  eventoId: string,
): Promise<EventLeaderboardSnapshotWithData | null>

// Devuelve true si existe un snapshot Y la última mutación de scoreSheet del evento es posterior a generatedAt.
// No requiere persistir un campo dirty; deriva de timestamps.
export async function isSnapshotStale(
  organizationId: string,
  eventoId: string,
): Promise<boolean>
```

Implementar `computeLeaderboard` con la lógica del algoritmo descrito arriba. Ojo a los Decimal: usar `Number()` solo al final, hacer la aritmética con `Decimal` para precisión.

`generateLeaderboardSnapshot`:
- Llama `computeLeaderboard` (sin pasar por la cache — usar una variante interna `_computeLeaderboardInner` que no tenga `unstable_cache` envolviendo, o invalidar la cache antes).
- `prisma.eventLeaderboardSnapshot.upsert` con `where: { eventoId }`.
- AuditLog: `action: "evento.leaderboardSnapshotGenerated"`.
- `revalidateTag(cacheTags.leaderboard(organizationId))`.

`isSnapshotStale`:
- Si no hay snapshot → `false` (no está "stale" porque no existe).
- Si hay snapshot: query `prisma.scoreSheet.aggregate({ where: { asignacionPosta: { actividad: { eventoId } } }, _max: { updatedAt: true } })` y comparar.

### 4. Repo `public-share-link.repo.ts`

`src/repositories/public-share-link.repo.ts`:

```typescript
// Genera token aleatorio nuevo y crea PublicShareLink activo.
// Si ya existe uno activo para el evento, lo revoca primero (transacción) y crea el nuevo.
export async function createOrRotatePublicShareLink(
  organizationId: string,
  eventoId: string,
  actorUserId: string,
): Promise<{ token: string }>

// Marca revokedAt en el link activo. Si no hay activo, BusinessError("NO_ACTIVE_LINK").
export async function revokePublicShareLink(
  organizationId: string,
  eventoId: string,
  actorUserId: string,
): Promise<void>

// Cacheado.
export function findActivePublicShareLink(
  organizationId: string,
  eventoId: string,
): Promise<{ token: string; createdAt: Date } | null>

// Resuelve un token público (sin tenant) a su evento + snapshot.
// Devuelve null si el token no existe o está revocado.
// NO está cacheada por org porque se llama desde código sin tenant.
export async function resolvePublicShareToken(
  token: string,
): Promise<{
  organizationId: string
  eventoId: string
  snapshot: EventLeaderboardSnapshotWithData
} | null>
```

Token generation: `crypto.randomBytes(18).toString("base64url")`.

Cuando `resolvePublicShareToken` no encuentra el token o está revocado, devuelve `null` para que la página renderice un 404 genérico que no diferencie entre "no existe" y "revocado" (security: no revelar la existencia de eventos).

Una variante: si está revocado pero existe, podemos mostrar "Este link fue revocado". Eso da UX mejor para usuarios legítimos. Decisión: mostrar mensaje específico "Este link ya no está disponible" para tokens revocados, y 404 genérico para tokens inexistentes. La diferencia no leak información útil porque la única forma de saber un token es haberlo recibido del admin.

### 5. Modificar `evento.repo.ts`: hook al publicar

En `transicionarEstado`, cuando `target === "PUBLICADO"`:

```typescript
if (target === "PUBLICADO") {
  // Generar snapshot dentro de la misma transacción.
  // Si ya existía (ej: republicación tras revocar y reactivar — flujo no soportado por la máquina pero
  // posible si se construye un Plan 8b), se sobreescribe.
  await generateLeaderboardSnapshot(organizationId, id, actorUserId)
  // Crear link público activo si no existe (no rotar si ya hay uno).
  const existing = await prisma.publicShareLink.findFirst({
    where: { eventoId: id, revokedAt: null },
  })
  if (!existing) {
    await createOrRotatePublicShareLink(organizationId, id, actorUserId)
  }
}
```

**Importante sobre la transacción**: `generateLeaderboardSnapshot` usa `prisma` (no `tx`) hoy. Para mantener atomicidad, refactorear `generateLeaderboardSnapshot` para aceptar un `tx?: Prisma.TransactionClient` opcional, o ejecutarlo fuera de la transacción del `transicionarEstado` (orden: 1° transición, 2° snapshot, 3° link). El segundo enfoque es más simple. Si la generación del snapshot falla, el evento queda en `PUBLICADO` sin snapshot — la vista admin lo detectará y permitirá regenerar. Aceptable.

Decisión de implementación: **fuera de la transacción**, secuencial. Trade-off documentado.

### 6. Server actions

`src/app/(app)/admin/eventos/[id]/leaderboard/actions.ts`:

```typescript
export async function regenerateSnapshotAction(
  _prev: SnapshotState,
  formData: FormData,
): Promise<SnapshotState>

export async function rotatePublicShareLinkAction(
  _prev: ShareLinkState,
  formData: FormData,
): Promise<ShareLinkState>

export async function revokePublicShareLinkAction(
  _prev: ShareLinkState,
  formData: FormData,
): Promise<ShareLinkState>
```

`requireRole(["ADMIN"])` en cada una. Patrón de `useActionState` con `{ success: true }` o `{ error: string }` (lección Plan 6c #1: nunca `{}` para detectar éxito).

### 7. Vista admin `/admin/eventos/[id]/leaderboard`

`src/app/(app)/admin/eventos/[id]/leaderboard/page.tsx` (Server Component):

Contenido:
- Breadcrumb "← Nombre del evento" arriba.
- Título "Leaderboard" + badge del estado del evento.
- Sección **"Vista en tiempo real"**: render del `LeaderboardView` con datos de `computeLeaderboard`. Esto es lo que el admin debe consultar para tomar decisiones.
- Sección **"Snapshot público"**:
  - Si no hay snapshot: badge gris "No generado", botón "Generar snapshot" (la transición a PUBLICADO ya lo hace, pero permite forzar manualmente).
  - Si hay snapshot: timestamp de generación + nombre del usuario que lo generó.
  - Si `isSnapshotStale === true`: banner amarillo "El snapshot público está desactualizado respecto a las planillas. Regenerar" con botón.
- Sección **"Link público"**:
  - Si no hay link activo: botón "Generar link público".
  - Si hay link activo: input read-only con la URL completa (`${PUBLIC_BASE_URL}/resultados/${token}`), botón "Copiar al portapapeles", botón "Revocar y generar nuevo", botón "Revocar (sin reemplazar)".

Solo accesible si el evento está en estado `CERRADO` o `PUBLICADO` — antes no tiene sentido (datos incompletos).

### 8. Layout `(public)/layout.tsx` y vista pública

`src/app/(public)/layout.tsx`:

```tsx
import "../globals.css"
import { Barlow } from "next/font/google"

const barlow = Barlow({ subsets: ["latin"], weight: ["400", "600", "700", "900"] })

export const metadata = {
  title: "Resultados",
}

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={barlow.className}>
      <body className="bg-zinc-950 text-zinc-50 antialiased">
        {children}
      </body>
    </html>
  )
}
```

Notar que `(public)/layout.tsx` reemplaza el `app/layout.tsx` raíz para esa subtree (Next.js App Router permite layouts root distintos en route groups). Esto permite no cargar el AppHeader/SessionProvider/etc.

`src/app/(public)/resultados/[token]/page.tsx` (Server Component):

```tsx
export default async function ResultadosPublicosPage({
  params,
}: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await resolvePublicShareToken(token)

  if (!result) return <ResultadosNotFound />

  return <PublicLeaderboardView snapshot={result.snapshot.data as LeaderboardSnapshotData} />
}
```

`PublicLeaderboardView` es un Client Component que renderiza la estética editorial: hero + podio + tabla + tabs. (Client porque necesita state para los tabs de filtro.)

Si el token está revocado: `resolvePublicShareToken` devuelve null. Se podría diferenciar mostrando un mensaje específico "Este link fue revocado", pero el default es 404 genérico. Decisión: hacer la query "exists pero revoked" para mostrar mensaje específico — UX mejor, no leak meaningful.

Ajustar `resolvePublicShareToken` a `Promise<Result | "REVOKED" | null>`. Más limpio que dos funciones.

### 9. Componente `PublicLeaderboardView` (Client)

`src/components/leaderboard/PublicLeaderboardView.tsx`:

```tsx
"use client"

export function PublicLeaderboardView({
  snapshot,
  highlightGrupoId,  // opcional, para JEFE_PATRULLA
  isPublic,           // toggle de footer "Generado por puntajes-scout"
}: {
  snapshot: LeaderboardSnapshotData
  highlightGrupoId?: string
  isPublic?: boolean
})
```

Layout:
- **Hero** (`<header>`): full-width, padding generoso. Tipografía Barlow Black para nombre del evento (text-5xl mobile, text-7xl desktop). Subtítulo en gris claro: lugar + fecha. Pequeño tag "RESULTADOS OFICIALES" arriba.
- **Tabs de grupo** (sticky): "Todos" + un tab por grupo. Sticky en scroll. En `highlightGrupoId` definido, ese tab pre-seleccionado.
- **Podio** (visible cuando filtro = "Todos" y hay ≥3 patrullas): 3 cards lado a lado en desktop, stack en mobile. Card del 1° más grande/destacada (gold), 2° (silver), 3° (bronze). Cada card: posición grande, nombre patrulla, grupo, puntaje en mono.
- **Tabla** (resto del ranking): tipografía generosa, espaciado vertical amplio, fondo zinc-900 con borde sutil. Columnas: posición, patrulla, grupo, puntaje (mono). Cada fila clickeable expande accordion con `LeaderboardActividadBreakdown`.
- **Footer**: pequeño, neutral. "Última actualización: {generadoEn}" + "Generado por puntajes-scout" si `isPublic`.

Highlight del grupo del JEFE_PATRULLA: borde dorado en filas de su grupo. Tab "Mi grupo" pre-seleccionado.

Direccion estética: **editorial podium**. Inspiración: layouts de Olympics medal table, F1 results page. Lo opuesto a una "dashboard table" de admin.

### 10. Vista autenticada `/eventos`

`src/app/(app)/eventos/page.tsx` (Server Component):
- `requireOrg()` — todos los roles autenticados pueden ver eventos PUBLICADOS de su org.
- Lista los eventos PUBLICADOS de la org (sort por `publishedAt` DESC), cada uno como card con nombre + fecha + lugar + link a `/eventos/[id]/resultados`.
- Si no hay eventos publicados, mensaje empty.

### 11. Vista autenticada `/eventos/[id]/resultados`

`src/app/(app)/eventos/[id]/resultados/page.tsx` (Server Component):
- `requireOrg()`.
- `findEventoById(orgId, id)` — debe estar en `PUBLICADO`. Si no, 404.
- `getLeaderboardSnapshot(orgId, id)` — si no existe, error explícito "Aún no se generó el snapshot — contactá al admin".
- Determinar `highlightGrupoId`: si `user.activeRole === "JEFE_PATRULLA"`, usar `user.activeMembership.grupoScoutId`. (Disponible vía `getCurrentUser()`.)
- Renderiza `<PublicLeaderboardView snapshot={...} highlightGrupoId={...} isPublic={false} />`.

### 12. Redirect post-login y AppHeader

`src/app/(app)/dashboard/page.tsx`:

```tsx
if (user?.activeRole === "JEFE_PATRULLA" || user?.activeRole === "ESPECTADOR") {
  redirect("/eventos")
}
// (mantener el redirect existente para JUEZ → /juez/eventos)
```

`src/components/auth/AppHeader.tsx`: agregar enlace "Eventos" visible para todos los roles autenticados (es lectura pura — no riesgo de dar acceso a quien no debería). Para ADMIN/JUEZ es complementario al resto de la nav.

### 13. Strings i18n

Agregar al `src/messages/es.json`:

Namespace `leaderboard.*`:
- `tituloAdmin`, `tituloPublico`
- `resultadosOficiales`, `ultimaActualizacion`, `generadoPor`
- `posicion`, `patrulla`, `grupo`, `puntaje`, `desempate`
- `podio.titulo`, `podio.primero`, `podio.segundo`, `podio.tercero`
- `tabs.todos`, `tabs.miGrupo`
- `detalle.actividad`, `detalle.posta`, `detalle.peso`, `detalle.subtotal`
- `vacio.titulo`, `vacio.mensaje` (cuando no hay patrullas)
- `snapshot.noGenerado`, `snapshot.generadoEn`, `snapshot.desactualizado`, `snapshot.regenerar`, `snapshot.generar`
- `link.noActivo`, `link.activo`, `link.url`, `link.copiar`, `link.copiado`, `link.rotar`, `link.revocar`
- `revoked.titulo`, `revoked.mensaje`
- `notFound.titulo`, `notFound.mensaje`

Namespace `eventos.publico.*`:
- `lista.titulo`, `lista.descripcion`
- `lista.empty.titulo`, `lista.empty.mensaje`
- `card.fecha`, `card.lugar`, `card.verResultados`

### 14. Tests

Archivo nuevo: `src/repositories/leaderboard.repo.test.ts`.

Casos:

| # | Descripción |
|---|---|
| 1 | Evento sin patrullas → ranking vacío, grupos vacíos |
| 2 | 1 actividad (peso 100), 1 posta (weight 1), 2 patrullas con planillas distintas → ranking ordenado correctamente |
| 3 | 2 actividades (60/40), 1 posta cada una → cálculo proporcional correcto |
| 4 | Asignación con weight ≠ 1 → multiplicación correcta |
| 5 | Patrulla sin scoreSheet en una posta → cuenta como 0, otras postas igual |
| 6 | scoreSheet en BORRADOR → cuenta como 0 (no se incluye) |
| 7 | Empate por totalPuntuable, desempate por totalDesempate → orden correcto |
| 8 | Empate persistente (mismo puntuable y desempate) → comparten posición, siguiente salta ordinal |
| 9 | Solo criterios DESEMPATE en una planilla → no afectan totalPuntuable, sí afectan totalDesempate |
| 10 | `generateLeaderboardSnapshot` upsert idempotente → segunda llamada sobreescribe, no duplica |
| 11 | `isSnapshotStale` true cuando scoreSheet.updatedAt > snapshot.generatedAt |
| 12 | `isSnapshotStale` false cuando no hay snapshot |
| 13 | Tenant isolation: query con `organizationId` distinto no encuentra el evento |

Archivo nuevo: `src/repositories/public-share-link.repo.test.ts`.

Casos:

| # | Descripción |
|---|---|
| 1 | `createOrRotatePublicShareLink` crea link nuevo cuando no hay activo |
| 2 | `createOrRotatePublicShareLink` con link activo existente → revoca el viejo y crea uno nuevo |
| 3 | Solo un link puede tener `revokedAt = null` por evento (índice parcial) |
| 4 | `revokePublicShareLink` setea `revokedAt` y actor |
| 5 | `revokePublicShareLink` sin link activo → `BusinessError("NO_ACTIVE_LINK")` |
| 6 | `findActivePublicShareLink` devuelve null cuando todos están revocados |
| 7 | `resolvePublicShareToken` devuelve snapshot del evento correcto |
| 8 | `resolvePublicShareToken` con token revocado → devuelve `"REVOKED"` |
| 9 | `resolvePublicShareToken` con token inexistente → devuelve `null` |
| 10 | `resolvePublicShareToken` con evento sin snapshot → devuelve... (decisión: `null` para evitar leakage) |

Tests existentes que pueden romperse: `evento.repo.test.ts` si tiene casos de `transicionarEstado` con target PUBLICADO. Revisar y ajustar para que generen el snapshot mock o usen `prisma.publicShareLink.create` previo.

### 15. Verificación de typechecks finales

`pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

`pnpm build` puede fallar si `(public)/layout.tsx` rompe el árbol de root layouts. Verificar que Next.js 15 soporta múltiples root layouts (sí lo soporta cuando los route groups tienen layouts independientes — confirmar con la build).

## Archivos críticos

**Nuevos:**

- `prisma/migrations/<ts>_add_leaderboard_snapshot_and_public_share_link/migration.sql`
- `src/repositories/leaderboard.repo.ts`
- `src/repositories/leaderboard.repo.test.ts`
- `src/repositories/public-share-link.repo.ts`
- `src/repositories/public-share-link.repo.test.ts`
- `src/app/(app)/admin/eventos/[id]/leaderboard/page.tsx`
- `src/app/(app)/admin/eventos/[id]/leaderboard/actions.ts`
- `src/app/(app)/eventos/page.tsx`
- `src/app/(app)/eventos/[id]/resultados/page.tsx`
- `src/app/(public)/layout.tsx`
- `src/app/(public)/resultados/[token]/page.tsx`
- `src/components/leaderboard/PublicLeaderboardView.tsx` (Client)
- `src/components/leaderboard/Podium.tsx`
- `src/components/leaderboard/LeaderboardTable.tsx`
- `src/components/leaderboard/GrupoTabs.tsx`
- `src/components/leaderboard/PatrullaDetalleAccordion.tsx`
- `src/components/leaderboard/admin/SnapshotControls.tsx` (Client — botón regenerar + dirty banner)
- `src/components/leaderboard/admin/PublicShareLinkControls.tsx` (Client — copiar/rotar/revocar)
- `src/components/leaderboard/ResultadosNotFound.tsx`
- `src/components/leaderboard/ResultadosRevoked.tsx`

**Modificados:**

- `prisma/schema.prisma` — `EventLeaderboardSnapshot`, `PublicShareLink`, relations en `Evento`/`Organization`/`User`.
- `src/repositories/cache-tags.ts` — `leaderboard`, `publicShareLinks`.
- `src/repositories/evento.repo.ts` — `transicionarEstado` invoca `generateLeaderboardSnapshot` + `createOrRotatePublicShareLink` cuando `target === "PUBLICADO"`.
- `src/app/(app)/admin/eventos/[id]/page.tsx` — agregar link "Ver leaderboard" cuando `estado ∈ {CERRADO, PUBLICADO}` (similar al de planillas).
- `src/app/(app)/dashboard/page.tsx` — redirect para JEFE_PATRULLA y ESPECTADOR a `/eventos`.
- `src/components/auth/AppHeader.tsx` — link "Eventos" visible para todos los roles.
- `src/messages/es.json` — namespaces `leaderboard.*` y `eventos.publico.*`.
- `.env.example` — agregar `NEXT_PUBLIC_BASE_URL=http://localhost:3000` (ya puede existir; verificar). Necesario para construir URLs públicas absolutas en QR/copy-paste.

**Sin cambios:**

- `src/repositories/score-sheet.repo.ts` — el cálculo del leaderboard lee los totales ya cacheados.
- `src/repositories/posta.repo.ts`, `patrulla.repo.ts`.
- API routes del juez (`/api/juez/snapshot`, `/api/juez/sync`).
- Service worker.
- Capa offline de `/juez/`.
- `src/auth.ts`, `src/auth.config.ts`.

**Documentación nueva:**

- ADR opcional: `docs/adr/0005-snapshot-publicacion.md` si la decisión de "snapshot solo al publicar" amerita registro formal. Decidir tras revisión: probablemente sí, porque acopla la transición de estado con un side effect pesado.

## Verificación

### Entornos requeridos

| Escenario | Entorno | Razón |
|---|---|---|
| 1 — Cierre con planilla faltante | `pnpm dev` | Solo lógica de gate |
| 2 — Publicación happy path | `pnpm dev` | Genera snapshot + link, vista pública accesible |
| 3 — Vista admin tiempo real | `pnpm dev` | Reflejo inmediato de mutaciones |
| 4 — Snapshot desactualizado tras reapertura | `pnpm dev` | Banner aparece, regenerar funciona |
| 5 — Token revocado | `pnpm dev` | Mensaje específico, no 404 |
| 6 — Token inexistente | `pnpm dev` | 404 genérico |
| 7 — Token de otra org | `pnpm dev` con dos orgs | No leak entre tenants |
| 8 — Rotación de link | `pnpm dev` | Link viejo deja de funcionar, nuevo funciona |
| 9 — Vista pública mobile | `pnpm dev` con DevTools mobile | Estética editorial responsive |
| 10 — Highlight de grupo (JEFE_PATRULLA) | `pnpm dev` con usuario JEFE_PATRULLA | Filas del grupo destacadas |
| 11 — Empates compartidos | seed manual + `pnpm dev` | Posiciones 1, 2, 2, 4 |
| 12 — Build con dos root layouts | `pnpm build` | `(app)/layout.tsx` y `(public)/layout.tsx` coexisten |
| 13 — Vista pública sin SW interferencia | `pnpm build && pnpm start` | El SW del juez no debe cachear/romper `/resultados/[token]` |

---

### Escenario 1 — Cierre con planilla faltante

**Pasos**:
1. Crear evento con 2 patrullas, 1 actividad (peso 100), 1 posta. Activar.
2. Cargar y enviar planilla solo para 1 patrulla. Dejar la otra sin enviar.
3. Como ADMIN, intentar transicionar a CERRADO.

**Qué verificar**:
- El gate `canTransitionToCerrado` ya existente bloquea con mensaje "Faltan planillas: ..." (Plan 7a).
- No se genera snapshot.
- El estado del evento permanece en ACTIVO.

(Verificación de regresión: no debe romperse este gate.)

---

### Escenario 2 — Publicación happy path

**Pasos**:
1. Evento con 3 patrullas, 2 actividades (60/40), 2 postas en cada actividad. Cargar todas las planillas en ENVIADA.
2. ADMIN: transición a CERRADO (debería pasar el gate).
3. Ir a `/admin/eventos/[id]/leaderboard`. Verificar que muestra el ranking calculado al vuelo, sin snapshot persistido aún.
4. Volver a `/admin/eventos/[id]`, transición a PUBLICADO.
5. Volver a `/admin/eventos/[id]/leaderboard`. Verificar que ahora hay un snapshot con timestamp y un link público activo.

**Qué verificar**:
- En DB: una fila en `EventLeaderboardSnapshot` con `eventoId` correcto y `data` JSON válido (parseable, con shape esperado).
- En DB: una fila en `PublicShareLink` con `revokedAt = null`.
- AuditLog tiene una entrada `evento.leaderboardSnapshotGenerated` y `evento.publicShareLinkCreated`.
- La vista admin muestra el link copiable y dice "Snapshot generado el {timestamp}".
- Click en "Copiar al portapapeles" → portapapeles tiene la URL completa.
- Abrir esa URL en una pestaña sin auth (o ventana incógnito) → carga `/resultados/[token]` con el ranking visible.

---

### Escenario 3 — Vista admin tiempo real

**Pasos**:
1. Evento PUBLICADO con snapshot.
2. ADMIN va a `/admin/eventos/[id]/planillas` y reabre la planilla de una patrulla.
3. ADMIN vuelve a `/admin/eventos/[id]/leaderboard`.

**Qué verificar**:
- Sección "Vista en tiempo real": la patrulla con planilla reabierta tiene puntaje 0 en esa posta (su scoreSheet pasó a BORRADOR), y bajó en el ranking.
- Sección "Snapshot público": el banner "Snapshot público desactualizado" aparece (porque `scoreSheet.updatedAt > snapshot.generatedAt`).
- La vista pública (`/resultados/[token]`) sigue mostrando el ranking viejo (pre-reapertura). El público no ve el cambio hasta que admin regenere.

---

### Escenario 4 — Snapshot desactualizado tras reapertura

**Pasos**:
1. Continuación de escenario 3.
2. ADMIN entra a la vista admin del leaderboard, ve el banner "Snapshot público desactualizado".
3. Click en "Regenerar snapshot".

**Qué verificar**:
- En DB: `EventLeaderboardSnapshot.generatedAt` se actualiza al ahora.
- AuditLog tiene una nueva entrada `evento.leaderboardSnapshotGenerated`.
- El banner desaparece.
- Vista pública refleja ahora el nuevo ranking.
- El link público sigue siendo el mismo (no se rotó).

Caso adicional: la patrulla cuya planilla fue reabierta ahora aparece con puntaje 0 en esa posta y posición ajustada en el ranking público.

---

### Escenario 5 — Token revocado

**Pasos**:
1. Evento PUBLICADO con link activo.
2. Anotar la URL del link.
3. ADMIN: en `/admin/eventos/[id]/leaderboard`, click en "Revocar (sin reemplazar)".
4. Abrir la URL anterior en pestaña incógnito.

**Qué verificar**:
- Página muestra `<ResultadosRevoked>` con mensaje "Este link ya no está disponible. Contactá a los organizadores".
- HTTP status 404 (semánticamente correcto: el recurso no es accesible).
- En DB: `PublicShareLink.revokedAt` está seteado, `revokedByUserId` también.
- AuditLog tiene `evento.publicShareLinkRevoked`.
- Vista admin del leaderboard muestra "No hay link activo. Generar nuevo link".

---

### Escenario 6 — Token inexistente

**Pasos**:
1. Abrir `/resultados/aaaaaaaaaaaaaaaaaaaaaaaa` (24 chars random).

**Qué verificar**:
- Página muestra `<ResultadosNotFound>` con mensaje genérico "No encontramos resultados con este link".
- HTTP status 404.
- No leak: el mensaje es idéntico al que vería un usuario con un token de evento inexistente vs un evento no publicado vs cualquier otro caso.

---

### Escenario 7 — Token de otra org

**Pasos**:
1. ADMIN de Org A crea evento, lo publica, copia el token.
2. Loguearse como ADMIN de Org B (otra cuenta).
3. Pegar la URL `/resultados/[token-de-A]`.

**Qué verificar**:
- La vista pública carga normalmente con los datos del evento de Org A (es público, no requiere auth).
- ADMIN de B no puede acceder a `/admin/eventos/[id-de-A]/leaderboard` (404 por tenant gate del repo).
- ADMIN de B no puede revocar el token de A vía cualquier action (las server actions filtran por `organizationId` del usuario).

---

### Escenario 8 — Rotación de link

**Pasos**:
1. Evento PUBLICADO con link `T1` activo.
2. Anotar `T1`.
3. ADMIN: click en "Revocar y generar nuevo" → recibe `T2`.
4. Abrir `/resultados/T1` y `/resultados/T2`.

**Qué verificar**:
- `T1`: `<ResultadosRevoked>` (porque `revokedAt` está seteado).
- `T2`: ranking visible.
- En DB: dos filas en `PublicShareLink` para el mismo evento; `T1` con `revokedAt` no null, `T2` con `revokedAt` null.
- El índice parcial garantiza unicidad: intentar crear un tercer link sin revocar `T2` fallaría a nivel DB. La función `createOrRotatePublicShareLink` revoca antes de crear, evitando la colisión.

---

### Escenario 9 — Vista pública mobile

**Pasos**:
1. Evento PUBLICADO con 8 patrullas en 3 grupos.
2. Abrir `/resultados/[token]` en DevTools mobile (iPhone 12 / Android Pixel).

**Qué verificar**:
- Hero ocupa el viewport, tipografía legible sin zoom.
- Tabs scrollean horizontalmente sin overflow del body.
- Podio se apila verticalmente en mobile, mantiene el orden 1° > 2° > 3°.
- Tabla del resto: filas legibles, números monoespaciados a la derecha.
- Click en una fila: accordion expande sin layout shift.
- Touch targets ≥ 44px (regla de Apple).
- No requiere `<viewport>` zoom.
- Estética se siente **destacada** y **diferenciada** del admin — no un dashboard genérico (ver lección Plan 7a sobre dirección estética).

---

### Escenario 10 — Highlight de grupo (JEFE_PATRULLA)

**Pasos**:
1. Usuario con membership `JEFE_PATRULLA`, `grupoScoutId = G1`.
2. Loguearse → redirige a `/eventos`.
3. Click en un evento publicado → `/eventos/[id]/resultados`.

**Qué verificar**:
- Tab "Mi grupo" pre-seleccionada (mostrando solo patrullas de G1).
- Si vuelve a "Todos": las filas de patrullas de G1 tienen border o highlight visual (ej: `border-l-4 border-amber-400`).
- AppHeader visible (estamos en shell `(app)`).
- No hay link al admin del leaderboard ni controles de admin (los componentes son distintos).

---

### Escenario 11 — Empates compartidos

**Pasos**:
1. Setup manual: crear 4 patrullas con totales `[100, 90, 90, 80]` y desempates iguales para las del medio.
   - Lo más fácil es vía seed o manualmente cargando planillas con valores idénticos.
2. Publicar y abrir la vista pública.

**Qué verificar**:
- Posiciones mostradas: `1°, 2°, 2°, 4°`.
- En el JSON del snapshot: `ranking[1].posicion === ranking[2].posicion === 2`.
- Visualmente: las dos patrullas en 2° aparecen alineadas con el mismo ordinal (no "2°" y "3°").

Caso adicional: empate también en desempate → mismo ordinal. Si solo empate en `totalPuntuable` y diferencia en `totalDesempate` → posiciones distintas (la del desempate mayor es 2°, la otra 3°).

---

### Escenario 12 — Build con dos root layouts

**Pasos**:
1. `pnpm build`.

**Qué verificar**:
- Build exitoso. Si Next.js detecta el conflicto de root layouts, falla aquí; ajustar.
- En el output, `/resultados/[token]` aparece como ruta dinámica server-rendered.
- En el output, `/eventos`, `/eventos/[id]/resultados`, `/admin/eventos/[id]/leaderboard` aparecen.
- `/dashboard` redirige correctamente para JEFE_PATRULLA / ESPECTADOR (probar online).

---

### Escenario 13 — Vista pública sin SW interferencia

**Entorno**: `pnpm build && pnpm start`. Browser con SW del juez ya activo.

**Pasos**:
1. Loguearse como JUEZ → SW activo (Plan 7d).
2. Logout.
3. Sin loguearse, abrir `/resultados/[token]` en la misma pestaña.

**Qué verificar**:
- La página carga normalmente. El SW no debería interceptar `/resultados/**` (la regla de runtimeCaching del Plan 7b/d cubre solo `/juez/**`).
- Si el SW interfiere (por ejemplo, defaultCache de Serwist captura la navegación), agregar regla en `sw.ts`: `{ matcher: ({ url }) => url.pathname.startsWith("/resultados/"), handler: new NetworkOnly() }`. Verificar antes de cerrar el plan.
- Sin auth: la página renderiza sin redirigir a /login (no está protegida por middleware).

---

## Riesgos a vigilar durante ejecución

- **Múltiples root layouts en Next.js 15 App Router**: confirmar que `(public)/layout.tsx` puede coexistir como root layout independiente del `app/layout.tsx`. Next.js requiere que cada route group con layout root tenga `<html>` y `<body>`. Si falla, fallback: el layout raíz `app/layout.tsx` se mantiene minimalista y `(public)/layout.tsx` es un sub-layout que renderiza el chrome dark editorial.
- **Service worker capturando `/resultados/**`**: el SW del juez registra `/sw.js` global. Si la regla `defaultCache` de Serwist intercepta `/resultados/**` o falla con `ReadableStream` (lección Plan 7b #11), agregar `NetworkOnly` explícito para `/resultados/**` y `/eventos/**` antes de `defaultCache`.
- **Decimal serialization en el snapshot JSON**: `ScoreSheet.totalPuntuable` es `Decimal`. Convertir con `Number()` ANTES de persistir. El JSON guardado debe ser puramente primitivo.
- **`unstable_cache` y dependencias dinámicas**: `computeLeaderboard` usa `unstable_cache` con tag `leaderboard:orgId`. Si la función internamente llama a `prisma.evento.findUnique` con `eventoId` distinto, asegurarse de que la `cacheKey` incluya `eventoId` (sino se cachea cross-evento). Patrón: `unstable_cache(fn, ["leaderboard", organizationId, eventoId], { tags: [...] })`.
- **Atomicidad del publish**: si `generateLeaderboardSnapshot` falla después del `transicionarEstado`, el evento queda PUBLICADO sin snapshot. La vista admin debe manejar este caso (mostrar "Generar snapshot manualmente"). La vista pública con token devuelve `null` (sin snapshot). Aceptable como degradación.
- **`isSnapshotStale` performance**: la query `MAX(updatedAt)` sobre todas las planillas del evento debe usar el índice de `asignacionPostaId`. Para eventos con cientos de planillas debería ser sub-segundo. Si emerge como problema, persistir `eventoLeaderboardDirty: boolean` en `Evento` y mantener manualmente en mutaciones.
- **Empates con `>2` patrullas**: el algoritmo de posición compartida debe manejar correctamente cualquier cantidad. Tests del caso 8 deben cubrir 3 patrullas empatadas.
- **Tabs sticky con scroll horizontal en iOS Safari**: `position: sticky` con `overflow-x: auto` puede tener bugs en Safari. Probar y ajustar (ej: `position: sticky` en el contenedor padre con `top: 0`).
- **`crypto.randomBytes` en Edge runtime**: el repo `public-share-link` usa Node `crypto`. Si se importa desde un middleware o edge route, falla. Confirmar que solo se usa desde server actions / Server Components (no edge).
- **`PUBLIC_BASE_URL` para el copy-paste del link**: necesitamos un env var. En dev: `http://localhost:3000`. En prod: el dominio real. Sin esto, el botón "Copiar" del admin copia una URL relativa que no sirve para enviar por WhatsApp.
- **AuditLog actions**: definir naming consistente: `evento.leaderboardSnapshotGenerated`, `evento.publicShareLinkCreated`, `evento.publicShareLinkRevoked`, `evento.publicShareLinkRotated`.
- **Migración de tests existentes**: si `evento.repo.test.ts` testea `transicionarEstado` con target PUBLICADO, ahora necesita mockear `generateLeaderboardSnapshot` o tener fixtures completos.
- **Reentrada de `transicionarEstado` con PUBLICADO ya alcanzado**: la máquina de estados no permite `PUBLICADO → PUBLICADO`, pero conviene defender en el repo: si ya hay snapshot, no regenerar automáticamente (admin lo hace explícitamente). El check `if (!existing) { ... }` para link cubre esto en parte; replicarlo para snapshot.

## Lecciones aprendidas

### 1. `const ranking = rawRows.map(...)` con referencia circular causa ReferenceError

Al construir el array `ranking` con `Array.prototype.map` y al mismo tiempo referenciar `ranking[idx-1]` dentro del callback (para resolver la posición compartida en empates), JavaScript lanza `ReferenceError: Cannot access 'ranking' before initialization`. El bloque `map` ejecuta su callback durante la asignación, pero la variable `const ranking` todavía está en la temporal dead zone.

**Fix**: reemplazar `const ranking = rawRows.map(...)` por un bucle `for` que hace `ranking.push(...)`. El bucle puede leer `ranking[idx-1]` libremente porque `ranking` ya fue declarado como `const ranking: LeaderboardRow[] = []` antes del loop.

**Regla general**: si una función de array necesita leer el array que está construyendo (para acumular estado entre iteraciones), usar un bucle for en lugar de map/reduce.

### 2. `requireRole` devuelve `userId`, no `id`

La función `requireRole` en `auth-helpers.ts` devuelve `{ ...org, userId: user.id }`. El campo del ID del usuario autenticado es `userId`, no `id`. Los server actions que lo usan deben referenciarlo como `org.userId`. Un import accidental de `user.id` compila (TypeScript no lo detecta si el tipo tiene `id` por herencia de `org`), pero produce valores incorrectos en runtime.

**Patrón establecido**: en server actions, siempre `const org = await requireRole([...])` → `org.organizationId`, `org.userId`, `org.role`.

### 3. Route group layout NO puede ser root layout cuando existe `app/layout.tsx`

El plan asumía que `app/(public)/layout.tsx` con `<html>` y `<body>` sería un root layout independiente. **Esto es incorrecto.** En Next.js App Router, `app/layout.tsx` es siempre el root absoluto — cualquier layout dentro de un route group queda anidado dentro de él, nunca lo reemplaza. Tener `<html><body>` en ambos genera HTML inválido y un hydration mismatch que Next.js reporta en consola (servidor vs cliente difieren en className del body).

**Fix**: `(public)/layout.tsx` debe ser un passthrough (`return <>{children}</>`) sin `<html>` ni `<body>`. El dark/light theme va en el componente raíz de cada página (en nuestro caso `PublicLeaderboardView` envuelve todo con el `div` temático).

**Para tener roots verdaderamente independientes** (con `<html>` separado por route group), habría que eliminar `app/layout.tsx` y crear un layout raíz por cada route group. En este proyecto eso implicaría mover todas las rutas existentes — trade-off no vale la pena.

**Font en el layout público**: `app/layout.tsx` ya aplica `${barlow.variable}` al body, y `globals.css` define `--font-sans: var(--font-barlow), sans-serif`. El layout público hereda Barlow automáticamente sin necesidad de redeclararlo.

### 4. SW ya maneja `/resultados/**` correctamente sin cambios

El Service Worker del Plan 7d ya tiene una regla `navigate → NetworkOnly` que captura cualquier navegación que no sea `/juez/**`. Esta regla se evalúa ANTES de `defaultCache`, por lo que `/resultados/[token]` y `/eventos/**` reciben `NetworkOnly` automáticamente — no se cachean y siempre van a la red. No fue necesario agregar reglas adicionales en el SW.

### 5. Snapshot con `data.generadoEn` actualizado al momento del upsert

La función `_computeLeaderboardInner` calcula `generadoEn: new Date().toISOString()` al inicio. En `generateLeaderboardSnapshot`, se sobreescribe `data.generadoEn = new Date().toISOString()` después de que la función interna termina, para que el timestamp en el JSON coincida con el `generatedAt` que va al campo de la tabla. Sin este ajuste, el JSON podría tener un `generadoEn` unos milisegundos anterior al `generatedAt` real del upsert, causando inconsistencia visual en la vista pública ("Última actualización" podría mostrar un timestamp distinto al real).

### 6. Rutas públicas deben estar en `PUBLIC_PATHS` del middleware

El middleware de Auth.js en `auth.config.ts` define `PUBLIC_PATHS` con las rutas que no requieren autenticación. `/resultados` no estaba listada, por lo que el middleware redirigía a `/login` a usuarios no autenticados que accedían a la vista pública del leaderboard (incluyendo incógnito). El fix es agregar `"/resultados"` al array.

**Regla**: toda ruta nueva sin requisito de auth debe agregarse explícitamente a `PUBLIC_PATHS`. No hay detección automática.

### 7. Botón "Publicar evento" tenía guard hardcodeado como placeholder

`EventoEstadoControls.tsx` tenía `disabled={... || nextTarget === "PUBLICADO"}` con una nota "Disponible en Plan 7" — un placeholder de cuando la transición a PUBLICADO no estaba implementada. Al completar Plan 8, el guard no se eliminó y el botón quedó permanentemente desactivado para eventos CERRADOS. Fix: eliminar el guard y actualizar el label.

**Lección**: los placeholders con `disabled` hardcodeado son deuda técnica visible. Al completar la feature que los hace posibles, buscar y limpiar todos los puntos de bloqueo artificial.

### 8. `revalidateTag` debe cubrir todos los caches que lee una pantalla

La vista admin del leaderboard en tiempo real usa `computeLeaderboard`, cacheada con el tag `leaderboard:orgId`. Cuando el admin reabre una planilla (`reopenScoreSheet`) o el juez envía (`submitScoreSheet`), esas funciones invalidaban `scoreSheets:orgId` y `eventos:orgId`, pero **no** `leaderboard:orgId`. El leaderboard admin quedaba stale hasta que su cache expiraba o el admin borraba la caché del browser.

Fix: agregar `revalidateTag(cacheTags.leaderboard(organizationId))` en `reopenScoreSheet` y `submitScoreSheet`.

**Regla**: al agregar un nuevo `unstable_cache` con un tag nuevo, auditar todas las mutaciones que afectan los datos que cachea y agregar el `revalidateTag` correspondiente. El compilador no ayuda con esto — es responsabilidad del desarrollador al crear el nuevo cache.

## Commits asociados

| Hash | Descripción |
|---|---|
| `e35545a` | feat(leaderboard): cierre y publicación de eventos con vista pública (Plan 8) — commit principal |
| `b8a187a` | fix(eventos): habilitar botón Publicar evento en estado CERRADO |
| `76654a0` | fix(auth): agregar /resultados a PUBLIC_PATHS del middleware |
| `0bcba9b` | fix(public): eliminar html/body de (public)/layout para evitar hydration mismatch |
| `467ac21` | fix(admin/eventos): planillas y leaderboard al tope + planillas visible en PUBLICADO |
| `8ae56c6` | fix(leaderboard): invalidar cache leaderboard al mutar planillas |
| `3e91500` | style(leaderboard): tema claro de default con switch claro/oscuro persistente |
