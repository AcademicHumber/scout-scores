# Puntajes Scout — Plan Maestro

## Contexto

Aplicación web para distritos scouts que necesitan registrar puntajes durante eventos competitivos (ej: una jornada en la ciudad donde patrullas recorren postas/actividades). Hoy se hace en papel o con planillas Excel improvisadas, lo cual hace lento y propenso a errores el cálculo final del leaderboard.

El sistema modela la jerarquía real del escultismo: cada **Distrito Scout** (organización / tenant) contiene varios **Grupos Scouts** (ej: "Grupo Scout Juan Pablo II", "Grupo Scout Don Bosco"), y cada grupo aporta **Patrullas** que compiten en los eventos del distrito.

El sistema permite que los administradores creen plantillas de puntuación, configuren eventos con sus postas, asignen jueces, y al cierre del evento generen automáticamente el ranking de patrullas. Los jueces cargan puntajes desde el celular (incluso sin conexión), y al final el público puede ver los resultados publicados.

**Resultado esperado:** un sistema productivo mantenido por el distrito scout, autohospedado en un VPS económico, con bajo costo operativo (~$5/mes), que pueda crecer a múltiples distritos si otros se suman.

El sistema arranca cubriendo la necesidad inmediata de scoring de eventos (**Capa 1**, planes 0a–9). La arquitectura está pensada para crecer en una segunda capa post-MVP que digitalice el padrón de scouts del grupo, su inscripción anual, y la cartilla de progresión individual (**Capa 2**, planes 10–14). Esta expansión no requiere refactor del núcleo: `MiembroScout` se introduce como stub en Plan 0b y se profundiza cuando la necesidad lo justifique.

---

## Filosofía de documentación (importante)

Este proyecto se construye también como **material educativo de desarrollo asistido por IA**. Por eso, todos los planes y decisiones quedan versionados dentro del repositorio del proyecto, no en una carpeta externa de Claude. La idea es que cualquier persona (estudiante, colega, futuro mantenedor) pueda leer la historia completa de cómo se planificó y construyó el sistema.

### Reglas de documentación

1. **Todos los planes viven en `docs/plans/`** del proyecto, versionados con git como cualquier código fuente.
2. **Cada plan documenta tres cosas**, no solo el qué:
   - **Qué**: el alcance concreto del sub-plan (entregables, archivos a crear/modificar).
   - **Por qué**: las decisiones tomadas y las alternativas descartadas, con razones.
   - **Cómo se planificó**: una sección "Proceso de planeación" que resume el ida y vuelta con la IA — qué preguntas se hicieron, qué clarificaciones surgieron, qué cambió en el camino.
3. **Convenciones de nombres**: archivos numerados para mantener orden de lectura: `00-master-plan.md`, `01-bootstrap-infraestructura.md`, `02-schema-nucleo-seed.md`, etc. El número refleja orden de ejecución, no jerarquía.
4. **Commits asociados**: cada sub-plan referencia los commits que lo implementaron una vez ejecutado, cerrando el ciclo plan → implementación → verificación.
5. **Tono**: español neutro, técnico pero accesible. Asume lector con conocimiento básico de desarrollo web pero no necesariamente del dominio scout o de IA.

### Estructura de `docs/`

```
docs/
├── plans/
│   ├── 00-master-plan.md           ← este documento
│   ├── 01-bootstrap-infra.md       ← Plan 0a  ✓ ejecutado
│   ├── 02-schema-nucleo-seed.md    ← Plan 0b
│   ├── 03-auth-google-tenant.md    ← Plan 1
│   ├── 04-miembros-grupos.md       ← Plan 2
│   ├── 05-plantillas.md            ← Plan 3
│   ├── 06a-eventos.md              ← Plan 4a
│   ├── 06b-postas-patrullas-jueces.md ← Plan 4b
│   ├── 07a-juez-online.md          ← Plan 5a
│   ├── 07b-pwa-offline-sync.md     ← Plan 5b
│   ├── 08-leaderboard-reportes.md  ← Plan 6
│   ├── 09-cierre-publicacion.md    ← Plan 7
│   ├── 10-correcciones-post-cierre.md ← Plan 8
│   ├── 11-deploy-produccion.md     ← Plan 9
│   │
│   │   — Capa 2: Personas y progresión —
│   ├── 12-padron-miembros-grupo.md    ← Plan 10
│   ├── 13-asociar-miembros-patrullas.md ← Plan 11
│   ├── 14-inscripcion-anual.md        ← Plan 12
│   ├── 15-cartilla-progresion.md      ← Plan 13
│   └── 16-perfil-scout.md             ← Plan 14
├── adr/                             ← Architecture Decision Records
│   └── 0001-arquitectura-en-capas.md  ← decisión de arquitectura en dos capas
└── README.md                         ← índice general del proyecto
```

> **Nota:** este archivo se redactó originalmente fuera del proyecto (sesión inicial de planeación con Claude en plan mode). El primer paso del Plan 0a es moverlo a `docs/plans/00-master-plan.md` dentro del repo y comprometerlo en el primer commit, para que toda la documentación viva junta de ahí en adelante.

---

## Workflow Opus / Sonnet (regla de proceso, aplica a TODOS los planes)

**Planeación con Opus, ejecución con Sonnet.**

- **Definición y planeación**: cada sub-plan se redacta y refina con **Claude Opus** (modelo más capaz para razonamiento, arquitectura y trade-offs). Esto incluye: lluvia de ideas, preguntas dirigidas al usuario, diseño del plan, validación cruzada con sub-agentes Plan, y todo el ida y vuelta hasta que el plan queda aprobado.
- **Ejecución**: una vez aprobado, el plan se ejecuta con **Claude Sonnet** (más rápido y económico, suficiente para implementación dirigida por un plan claro). Esto incluye: scaffolding, edits, commits, verificación.

**Por qué esta regla**: optimiza calidad donde más importa (decisiones arquitectónicas) y costo/velocidad donde el plan ya quita la ambigüedad (escritura de código). El plan detallado actúa como brief riguroso que un modelo más rápido puede ejecutar fielmente.

**Cómo aplicarla en cada sesión**:
1. Sesión arranca con Opus seleccionado (`/model` → `Opus`).
2. Se entra a plan mode, se hacen preguntas, se redacta el sub-plan.
3. Apenas el plan queda aprobado y se sale de plan mode, **cambiar a Sonnet** (`/model` → `Sonnet`) antes de empezar a ejecutar.
4. Si durante la ejecución surge una decisión arquitectónica no resuelta, se pausa, se vuelve a Opus, se decide, y se vuelve a Sonnet para continuar.

Esta regla se respeta para todo sub-plan posterior (0b, 1, 2, ...).

---

## Decisiones macro confirmadas

| Categoría | Decisión |
|---|---|
| Lenguaje / Framework | Next.js 15 (App Router) + TypeScript — versión estable, evitamos el 16 recién salido |
| ORM / DB | Prisma + PostgreSQL 16 |
| Auth | Auth.js v5 con Google OAuth (único método) |
| Hosting | VPS cloud económico (Hetzner / DigitalOcean / Oracle) |
| Dominio | Propio (~$10/año) |
| Empaquetado | Docker + Docker Compose |
| Reverse proxy | Caddy (HTTPS automático con Let's Encrypt) |
| Backups | `pg_dump` por cron a storage S3-compatible (Backblaze B2) |
| Idioma UI | Español neutro/latino (tú, tienes) |
| Mobile-first | Sí, especialmente la vista del juez |
| PWA / Offline | Sí, con sincronización al volver online |
| Real-time | No (leaderboard se publica al cierre) |
| Multi-tenant | Sí (cada **distrito scout** = `Organization` con datos aislados) |
| Jerarquía | Distrito → Grupos Scouts (persistentes) → Patrullas (por evento) |
| Patrullas | Por evento (no persistentes entre eventos), siempre asociadas a un Grupo Scout del distrito |
| Multi-juez por posta | No (un único juez asignado por posta) |
| Estrategia de evolución | Capa 1 — MVP de scoring (planes 0a–9) → Capa 2a — padrón de miembros (planes 10–11) → Capa 2b — inscripción y progresión (planes 12–14) |

---

## Arquitectura de despliegue

```
┌────────────────────────────────────────────────────┐
│  VPS Linux (Ubuntu 24.04 LTS)                      │
│                                                    │
│   ┌──────────────────────────────────────────┐    │
│   │  Caddy   (reverse proxy + HTTPS auto)    │    │
│   └────────────────┬─────────────────────────┘    │
│                    ↓                               │
│   ┌──────────────────────────────────────────┐    │
│   │  Next.js 15 (Node 22 LTS)                │    │
│   │  - App Router + Server Actions           │    │
│   │  - Auth.js v5                            │    │
│   │  - Prisma client                         │    │
│   └────────────────┬─────────────────────────┘    │
│                    ↓                               │
│   ┌──────────────────────────────────────────┐    │
│   │  PostgreSQL 16 (volumen persistente)     │    │
│   └──────────────────────────────────────────┘    │
│                                                    │
│   Cron diario: pg_dump → Backblaze B2             │
└────────────────────────────────────────────────────┘
                    ↑ HTTPS vía dominio propio
                    │
            Celulares / navegadores
```

---

## Modelo de dominio (alto nivel)

### Entidades principales

- **Organization (Distrito)** — el tenant. Representa un distrito scout (ej: "Distrito Scout Santa Cruz"). Datos completamente aislados de otros distritos. En código se llama `Organization` (genérico) pero en UI se muestra como "Distrito".
- **GrupoScout** — un grupo scout dentro del distrito (ej: "Grupo Scout Juan Pablo II", "Grupo Scout Don Bosco"). Persistente entre eventos. Gestionado por el admin del distrito.
- **User** — persona con cuenta Google. Puede pertenecer a múltiples distritos (vía `Membership`).
- **MiembroScout** — persona del dominio scout: puede ser un scout joven (sin cuenta) o un dirigente adulto (que probablemente sí tiene `User`). Pertenece a un `GrupoScout`. Existe independientemente de la autenticación. Campos mínimos en el stub (Plan 0b): `nombre`, `fechaNacimiento?`, `categoria?: LOBATO | EXPLORADOR | PIONERO | ROVER | DIRIGENTE`. FK opcional `userId → User`: cuando un dirigente se autentica con Google, se vincula su `MiembroScout` ya existente. **No confundir con `User`**: `User` es la cuenta autenticada; `MiembroScout` es la persona del dominio, anterior e independiente de la auth. Ver ADR-0001.
- **Membership** — relación `User ↔ Organization` con `role`: `ADMIN | JUEZ | ESPECTADOR | JEFE_PATRULLA`. Opcionalmente `grupoScoutId` (para futura visualización filtrada por grupo y para que Jefe de Patrulla quede ligado a su grupo).
- **Invitation** — email pre-registrado por admin con rol asignado y opcionalmente `grupoScoutId`, esperando que el invitado entre con Google.
- **Event** — un evento del distrito. Estados: `BORRADOR → ACTIVO → CERRADO → PUBLICADO`.
- **Actividad** — *[introducida en Plan 6a, ver ADR-0003]* bloque temático dentro de un evento con tipo (`COMPETICION | CONSTRUCCION | COCINA | OTRO`) y peso porcentual (`pesoRelativo: Decimal`). Las actividades de un evento suman 100% (validado al activar). Una actividad agrupa varias postas del mismo tipo temático.
- **Patrulla** — equipo competidor, **definido por evento** (no persistente entre eventos). Tiene `grupoScoutId` obligatorio (siempre representa a un grupo del distrito), `nombre` libre, y `categoria` opcional (ej: lobatos / scouts / caminantes / rovers — el nombre del equipo varía con la edad).
- **PatrullaLead** — relación opcional `Patrulla ↔ User` para que el rol Jefe de Patrulla vea sus resultados.
- **ScoreTemplate** — plantilla reutilizable de puntuación, scope distrital. Modos: `CRITERIOS` o `PUNTAJE_UNICO`.
- **TemplateCriterion** — un criterio dentro de una plantilla. Campo clave: `tipo: PUNTUABLE | DESEMPATE`. Los `DESEMPATE` (ej: comportamiento, espíritu scout) NO suman al total pero se usan para romper empates.
- **Posta** — una estación dentro de una actividad *(no directamente de un evento — ver ADR-0003)*. Tiene una plantilla asignada y un peso (`weight`, default 1.0). Cuelga de `Actividad`, no de `Evento`.
- **JudgeAssignment** — relación `Posta ↔ User` (1 juez por posta).
- **ScoreSheet** — planilla cargada para un par `(Posta, Patrulla)`. Una sola por par.
- **ScoreEntry** — valor cargado para un criterio dentro de una `ScoreSheet`.
- **ScoreSheetRevision** — historial append-only de cada guardado (incluye `clientId` y `clientSubmittedAt` para reconciliar sync offline).
- **EventLeaderboardSnapshot** — leaderboard congelado al cerrar el evento (JSON precomputado, regenerable). Permite filtrar por `grupoScoutId` para vistas por grupo.
- **PublicShareLink** — token para QR/URL público de leaderboard, con `revokedAt` para revocación.
- **AuditLog** — bitácora de acciones administrativas (eventos creados, cerrados, usuarios invitados, etc.).

### Reglas clave de scoring

- **Total de patrulla en una posta**: suma de `ScoreEntry` de criterios `PUNTUABLE`, multiplicada por `Posta.weight`.
- **Total de patrulla en una actividad**: suma ponderada de los totales de las postas de esa actividad.
- **Total de patrulla en el evento** *(jerarquía actualizada en ADR-0003)*:
  ```
  score_evento = Σ actividades (
    actividad.pesoRelativo / 100
    × Σ postas_de_actividad (posta.score_total × posta.weight)
  )
  ```
- **Empate**: se desempata por la suma de criterios `DESEMPATE` agregada por todas las postas de todas las actividades. Si persiste, empate compartido en el ranking.
- **Vistas filtradas por grupo**: el leaderboard puede mostrarse global (todas las patrullas del evento) o filtrado por `GrupoScout` para ver solo cómo le fue a un grupo específico. También puede segmentarse por actividad.

### Convenciones del schema

- Todas las tablas con scope organizacional llevan `organizationId` directo (no inferido por chain de FKs) y un índice compuesto `(organizationId, ...)`.
- IDs: `cuid2` (no autoincrement) — necesarios para URLs públicas y sync offline.
- Puntajes: `Decimal`, no `Float`.
- Timestamps: `createdAt` y `updatedAt` en todas las tablas.
- `MiembroScout` se introduce como stub en Plan 0b sin relaciones a `Patrulla` ni `Event`. Las relaciones llegan en Plan 4b (FK opcional `Patrulla → MiembroScout[]`) y se expanden en Plan 11. El enum `categoria` puede refinarse en Plan 13 con validación real del distrito.

---

## Sub-planes (roadmap de ejecución)

Cada item es un plan independiente que se ejecutará en una sesión separada para mantener el contexto manejable. El orden importa: las dependencias se indican en cada uno.

| # | Plan | Depende de | Entregable |
|---|---|---|---|
| **0a** | Bootstrap & infraestructura local | — | Next.js 15 + TS scaffolded, Tailwind, Prisma init (schema vacío), Docker Compose con Postgres local, Caddyfile, layout base en español, CI básico, **`docs/plans/00-master-plan.md` movido al repo + commit inicial**, `docs/README.md` con índice |
| **0b** | Schema núcleo + seed | 0a | Migraciones de `Organization` (Distrito), `GrupoScout`, `User`, `Membership`, `Invitation`, `AuditLog`, tablas Auth.js. Script de seed con datos demo (1 distrito, 3 grupos, usuarios) |
| **1** | Auth con Google + onboarding multi-tenant | 0b | Login con Google, crear-o-unirse a un Distrito en primer login, middleware con `organizationId` y `role` en sesión, guards de ruta por rol |
| **2** | Gestión de miembros, invitaciones y grupos scouts | 1 | CRUD de Grupos Scouts del distrito. Invitar por email (con grupo opcional), aceptar invitación, cambiar roles, listar/quitar miembros, editar configuración del distrito |
| **3** | Plantillas de puntaje (CRUD) | 1 (no requiere 2) | Editor de plantillas con modos `CRITERIOS` y `PUNTAJE_UNICO`. Soporte para criterios `PUNTUABLE` y `DESEMPATE`. Biblioteca scoping por distrito |
| **4a** | Eventos y ciclo de vida | 1 | CRUD de eventos, máquina de estados (`BORRADOR → ACTIVO → CERRADO → PUBLICADO`), CRUD de **actividades** con peso porcentual (suma 100% al activar), validaciones de transición, listado/detalle. *[Jerarquía actualizada: Evento → Actividad → Posta — ver ADR-0003]* |
| **4b** | Postas, patrullas, asignación de jueces | 2, 3, 4a | Agregar **postas** a actividad (con plantilla y peso, colgando de `Actividad` no de `Evento`), definir patrullas del evento (cada una asociada a un Grupo Scout existente del distrito + categoría opcional), asignar jefe de patrulla opcional, asignar juez único a cada posta. *[Ejecutado como Plan 6b. `PatrullaLead` diferido a Plan 6 — sin consumidor hasta que exista la vista del Jefe de Patrulla. Postas refactorizadas como entidad de biblioteca en Plan 6c.]* |
| **4c** | Postas como biblioteca reutilizable | 4b | Posta standalone con `organizationId`, CRUD dedicado en `/admin/postas`, `AsignacionPosta` como join table con datos por uso (juez, encargado, ayudantes, weight), validación de unicidad por evento, historial de uso por posta. *[Ejecutado como Plan 6c.]* |
| **5a** | Vista del juez — carga online (mobile-first) | 4b, 4c | UI mobile-first del juez, lista de sus postas asignadas en eventos activos, formulario de carga según modo de plantilla, guardado server-side |
| **5b** | PWA + cola offline + sync | 5a | Service worker, manifest, IndexedDB para puntajes pendientes, motor de sincronización con `clientId`/`clientSubmittedAt`, manejo de auth offline |
| **6** | Reportes, leaderboard y vistas públicas | 5a (5b no requerido) | Cálculo de leaderboard con desempates, snapshot al cierre, vista pública global (Espectador) vía link/QR, vista filtrada por Grupo Scout, vista del Jefe de Patrulla, exportar PDF/Excel |
| **7** | Cierre de evento y publicación | 6 | Validaciones de cierre (todas las planillas cargadas), congelar puntajes, generar snapshot, generar `PublicShareLink`, transición a `PUBLICADO` |
| **8** | Correcciones post-cierre | 7 | Reabrir una `ScoreSheet` específica sin reabrir el evento entero, regenerar snapshot, registro completo en `AuditLog` |
| **9** | Despliegue a producción + hardening | 8 | Servidor VPS aprovisionado, dominio + DNS configurados, Docker Compose de producción con Caddy, Google OAuth en dominio real, backups automáticos a B2, monitoreo básico (Sentry o equivalente self-hostable), checklist de seguridad |

**— Capa 2: Personas y progresión (post-MVP, después de Plan 9) —**

| # | Plan | Depende de | Entregable |
|---|---|---|---|
| **10** | Padrón de miembros del grupo | 2 | CRUD de `MiembroScout`, importación CSV opcional, vista de miembros por grupo dentro del distrito |
| **11** | Asociar miembros a patrullas | 4b, 10 | Vincular `MiembroScout` a patrullas de eventos. Eventos anteriores a Plan 11 quedan sin miembros vinculados, lo cual es aceptable por diseño |
| **12** | Inscripción anual digitalizada | 10 | Datos extendidos (médicos, autorizaciones parentales, archivos), ciclo anual de re-inscripción |
| **13** | Cartilla de progresión | 10 | Etapas, especialidades, promesas. Modelo a validar con el distrito antes de codear |
| **14** | Perfil del scout | 11, 13 | Vista del recorrido completo (eventos, scores, progresión). Reusa `cuid2` y `PublicShareLink` |

### Dependencias críticas cross-plan

- El campo `organizationId` y los guards de rol se establecen en **Plan 1** y son consumidos por todo lo posterior. Si se hace mal, hay que rehacerlo todo.
- El `clientId` y `clientSubmittedAt` en `ScoreSheetRevision` deben existir desde **Plan 5a** (no esperar al 5b) porque el sync de 5b los necesita.
- La copia en español se centraliza en **Plan 0a** en `src/messages/es.json` (o similar). No hardcodear strings en componentes.
- `MiembroScout` se introduce en **Plan 0b** como stub sin relaciones. Los eventos creados antes de Plan 11 no tendrán miembros vinculados a las patrullas, y eso es aceptable por diseño (ver ADR-0001).

---

## Convenciones cross-cutting

Estas convenciones se establecen en planes tempranos y deben respetarse en todos los siguientes:

1. **Tenant isolation**: todo query de Prisma a tablas con scope organizacional pasa por un wrapper que inyecta `where: { organizationId }`. Nunca `prisma.event.findMany()` directo en código de feature.
2. **Role guards**: un único helper `requireRole(['ADMIN'])` en server components y server actions. No checkear roles ad-hoc.
3. **Naming**: entidades en español del dominio se mantienen en español en código (`Posta`, `Patrulla`, `Plantilla`, `GrupoScout`) — no traducir a `Activity`, `Team`, `Template`. Excepción: conceptos genéricos del framework (`User`, `Session`, `Event`, `Organization`). En la UI `Organization` se renderiza como "Distrito".
4. **Timestamps**: siempre UTC en la DB, conversión a zona horaria del usuario en la UI.
5. **IDs en URLs**: usar `cuid2`. Nunca autoincrement expuesto.
6. **Server Actions over API routes**: para mutaciones internas usamos Server Actions. API routes solo para webhooks (sync de PWA, OAuth callbacks).
7. **Validación**: Zod en el borde de cada Server Action / API route. Tipos de Prisma adentro.
8. **Personas vs cuentas autenticadas**: `MiembroScout` (persona del dominio) y `User` (cuenta Google) son entidades separadas. No unificarlas. El linkeo es opcional vía `MiembroScout.userId?` — un dirigente probablemente tiene `User`; un lobato casi nunca. Ver ADR-0001.

---

## Archivos críticos (a crear durante la ejecución)

| Archivo | Plan donde nace | Función |
|---|---|---|
| `docs/plans/*.md` | 0a en adelante | Documentación viva del proceso (un archivo por sub-plan) |
| `docs/README.md` | 0a | Índice general de documentación del proyecto |
| `docs/adr/*.md` | según surjan | Architecture Decision Records — decisiones puntuales con su porqué |
| `prisma/schema.prisma` | 0b | Fuente única del modelo de datos |
| `src/lib/db.ts` | 0b | Cliente Prisma con middleware de tenant |
| `src/auth.ts` | 1 | Configuración Auth.js v5, callbacks de sesión |
| `src/middleware.ts` | 1 | Guards de tenant y rol en rutas |
| `src/lib/auth-helpers.ts` | 1 | `requireRole`, `getCurrentOrg`, `getCurrentUser` |
| `src/lib/miembros.ts` | 10 | Helpers para queries de `MiembroScout` con tenant isolation |
| `src/messages/es.json` | 0a | Copy en español, single source of truth |
| `docker-compose.yml` | 0a | Orquestación de Next + Postgres + Caddy (dev) |
| `docker-compose.prod.yml` | 9 | Orquestación de producción |
| `Caddyfile` | 0a / 9 | Configuración del reverse proxy |
| `scripts/backup.sh` | 9 | Script de backup `pg_dump` a B2 |

---

## Riesgos y decisiones diferidas

1. **Auth.js v5 + Next.js 15**: validar compatibilidad al iniciar Plan 1. Optamos explícitamente por Next.js 15 (estable y maduro) en lugar del recién salido Next.js 16, para evitar bugs de adopción temprana en un proyecto educativo. Migración a 16 queda como mejora futura. Fallback de auth: Lucia (más manual, menos features) o Clerk (de pago, más simple).
2. **PWA en iOS Safari**: la API de Background Sync no existe en iOS. El sync de Plan 5b debe dispararse en `visibilitychange` y al volver online manualmente. Probar en iPhone real (no solo en simulador).
3. **Auth offline del juez**: la sesión debe sobrevivir sin red durante una jornada de evento. Documentar y probar en Plan 5b: el juez se loguea en casa con WiFi, llega a la posta sin red, y puede cargar puntajes durante varias horas.
4. **Empate persistente**: si después de aplicar criterios `DESEMPATE` siguen empatados, el sistema muestra empate compartido (no inventa un orden). Confirmar UX en Plan 6.
5. **Public links son perpetuos** salvo revocación explícita. Implementar revocación desde el inicio en Plan 7.
6. **Backup remoto**: nunca dejar el VPS como única copia. Plan 9 incluye backup diario a Backblaze B2 (~$0.005/GB/mes).
7. **Expansión a Capa 2 sin perder velocidad en Capa 1**: la tentación de modelar inscripción/progresión antes de tener scoring en producción es un anti-patrón. `MiembroScout` se introduce como stub mínimo en 0b para mantener opciones abiertas. Los planes 12–13 (inscripción, progresión) requieren validación con un distrito real antes de codear — diseñarlos sin usuarios reales produce modelos erróneos.
8. **Decisiones diferidas explícitas** (no se incluyen en este roadmap, abrirán nuevos planes si se piden):
   - Evidencia fotográfica en planillas (requiere storage de blobs)
   - Penalizaciones y bonus globales
   - Premios especiales (scout/patrulla del evento)
   - Eventos multi-día con cortes intermedios
   - Notificaciones push/email a jefes de patrulla
   - Federación entre distritos (compartir plantillas, eventos inter-distritales)
   - Rol "Admin de Grupo Scout" (admin con scope limitado a un grupo dentro del distrito)

---

## Verificación end-to-end (al completar todos los planes)

El sistema se considera funcional cuando:

1. Un admin puede registrarse con Google, crear su Distrito Scout, registrar 2 Grupos Scouts (ej: "Juan Pablo II", "Don Bosco") e invitar a 2 jueces y 1 jefe de patrulla.
2. El admin puede crear una plantilla con 3 criterios `PUNTUABLE` y 1 criterio `DESEMPATE`.
3. El admin puede crear un evento con 3 postas (cada una con su plantilla y peso) y 4 patrullas distribuidas entre los 2 grupos scouts. Asignar jueces a cada posta.
4. Los 2 jueces pueden iniciar sesión desde sus celulares, perder conexión a internet, cargar puntajes para todas las patrullas en sus postas, y al volver online los datos se sincronizan sin pérdida.
5. El admin cierra el evento, se genera el snapshot del leaderboard, y la URL pública con QR muestra el ranking correcto incluyendo desempates por criterios `DESEMPATE`.
6. El leaderboard puede filtrarse por Grupo Scout para ver el ranking interno de cada grupo.
7. El jefe de patrulla puede iniciar sesión y ver solamente los resultados de su patrulla.
8. Si el admin descubre un error post-cierre, puede reabrir una sola planilla, corregirla, regenerar el snapshot, y ver el cambio reflejado.
9. El sistema corre en un VPS con dominio HTTPS válido, backup diario a B2 funcionando, y se sirve en menos de 1 segundo desde un celular 4G.

---

## Cómo continuar

Cuando estés listo para arrancar, abrí una nueva sesión en el directorio del proyecto y pedí: **"Trabajemos el Plan 0a — Bootstrap & infraestructura local"**. En esa sesión:

1. Se generará el plan detallado de Plan 0a (en plan mode, primero borrador en `~/.claude/plans/`).
2. Una vez aprobado, se ejecutará: scaffolding del proyecto + creación de `docs/plans/` + commit del master plan dentro del repo + commit del plan 0a también dentro del repo.
3. De ahí en adelante, **cada sub-plan se redacta directamente en `docs/plans/NN-nombre.md` del proyecto** y se versiona con git como cualquier otro archivo. Plan mode se sigue usando para refinar antes de ejecutar, pero el archivo final vive en el repo.

### Plantilla sugerida para cada sub-plan

```markdown
# Plan NN — Título del sub-plan

## Contexto
Por qué este plan existe ahora, qué problema resuelve, qué planes lo precedieron.

## Alcance
Qué incluye y qué NO incluye este plan (límites explícitos para evitar scope creep).

## Decisiones técnicas
Lista de decisiones tomadas, cada una con su alternativa descartada y la razón.

## Implementación
Pasos concretos, archivos a crear/modificar, snippets clave.

## Verificación
Cómo probar que funciona end-to-end (comandos, criterios de aceptación).

## Proceso de planeación
Resumen del intercambio con la IA durante el plan mode: qué preguntas surgieron, qué se clarificó, qué cambió respecto del primer borrador. Esta sección es la que da valor educativo al documento.

## Commits asociados
Lista de hashes/títulos de commit que implementaron este plan.
```

### Resumen del proceso de planeación de este master plan (educativo)

Para futuros lectores, este documento maestro surgió de un proceso iterativo en plan mode con Claude:

1. **Pregunta inicial abierta del usuario**: "quiero construir un sistema de puntajes para eventos scout".
2. **Preguntas dirigidas de la IA** (4 a la vez vía AskUserQuestion) sobre stack, roles, plantillas, real-time → primeras decisiones macro.
3. **Pregunta de profundización** sobre auth (Google OAuth elegido), mobile (mobile-first), offline (PWA con sync), tenancy (multi-tenant), patrullas (per-evento).
4. **Validación con agente Plan**: se invocó un sub-agente para criticar la arquitectura propuesta. Identificó gaps críticos:
   - Faltaban `JudgeAssignment`, `Invitation`, `PublicShareLink`, `PatrullaLead` como entidades.
   - El Plan 0 era demasiado grande, había que dividirlo.
   - El Plan 5 (PWA offline) era el de mayor riesgo y debía dividirse en online-first y offline después.
   - Faltaba un Plan 8 para correcciones post-cierre.
5. **Pivote del usuario sobre infraestructura**: descartó Vercel/managed DB por costos a largo plazo → cambio a self-hosted con Docker.
6. **Refinamiento de dominio del usuario**: corrigió que la organización es un **Distrito Scout** (no un Grupo), y que los Grupos Scouts son entidades intermedias persistentes que agrupan patrullas. También aclaró que ciertos criterios (comportamiento, espíritu scout) son solo de desempate, no puntuables.
7. **Decisión de versión**: se prefirió Next.js 15 estable sobre el recién salido 16 para reducir riesgo en proyecto educativo.
8. **Decisión de documentación**: el usuario explicitó que el proyecto sirve también como material de enseñanza de desarrollo asistido por IA, por lo que toda la documentación vive en el repo y cada plan explica el proceso, no solo el resultado.

Esta secuencia es ejemplo concreto de cómo una conversación iterativa con un asistente de IA, con preguntas dirigidas y validación cruzada, lleva de una idea vaga a un roadmap arquitectónico ejecutable.
