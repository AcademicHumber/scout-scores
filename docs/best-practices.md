# Handoff: best practices y caveats del proyecto

> Documento de traspaso escrito desde la perspectiva de quien lideró técnicamente el proyecto
> desde el Plan 0 hasta el cierre de la Capa 1. Su objetivo es que cualquier ingeniero que
> continúe el trabajo entienda **qué reglas son innegociables, por qué existen, dónde vive la
> complejidad real y qué trampas ya nos mordieron** — para no volver a pagarlas.
>
> Este documento complementa (no reemplaza) a las convenciones numeradas del proyecto, que
> viven en dos archivos: `CLAUDE.md` (raíz, convenciones globales) y `src/lib/offline/CLAUDE.md`
> (convenciones #27–36 y #50, exclusivas del subsistema offline — se cargan automáticamente al
> trabajar ahí). Acá están organizadas por tema, con el razonamiento detrás y con la guía de
> mantenimiento a futuro.

---

## 1. Cómo se trabaja en este proyecto (el proceso es parte del producto)

Este repo es, deliberadamente, **material educativo de desarrollo asistido por IA**. Eso impone
reglas de proceso que valen tanto como las de código:

1. **Todo cambio no trivial nace de un plan versionado en `docs/plans/`.** El plan documenta el
   qué, el por qué y el cómo se decidió. No se ejecuta trabajo grande "de memoria": si no hay
   plan, primero se redacta uno.
2. **Planear con el modelo más capaz, ejecutar con el más rápido.** Históricamente: planes con
   Opus en plan mode, ejecución con Sonnet. Si durante la ejecución aparece una decisión
   arquitectónica, se pausa, se decide con el modelo de planificación, y se retoma.
3. **Un sub-plan por sesión.** No mezclar planes en una misma sesión: mantiene el contexto
   focalizado y la trazabilidad educativa (cada commit referencia su plan).
4. **Los escenarios de verificación del plan son el criterio de done.** Un plan no está completo
   hasta revisar cada escenario contra la implementación real. Si un escenario revela un bug,
   se corrige en el momento — no se difiere a otro plan salvo que sea trabajo nuevo fuera de
   alcance. El Plan 16 es el ejemplo canónico: la revisión del escenario de ownership hizo
   aparecer la vista "mis postas" que no estaba en el plan original.
5. **Las lecciones aprendidas se destilan.** Cada plan cierra con una sección de lecciones; las
   que son reglas permanentes se promueven a convención numerada en `CLAUDE.md`. Si descubrís
   una trampa nueva, ese es el circuito: lección en el plan → convención en `CLAUDE.md`.
6. **Decisiones estructurales van a un ADR** (`docs/adr/`). Hay cuatro; leelos antes de tocar
   sus áreas: capas (0001), repositorios y cache (0002), jerarquía Evento→Actividad→Posta
   (0003), y el modo offline completo (0004).
7. **Versiones estables sobre bleeding edge.** Se eligió Next 15 sobre 16 a propósito. Antes de
   subir una major, esperá a que madure y leé la sección 9 de este documento.
8. **Testing manual en browser con casos numerados.** No hay Playwright ni automatización de
   browser, por decisión explícita: la verificación end-to-end la hace una persona siguiendo
   una lista de casos. `pnpm typecheck` + `pnpm build` + `pnpm test` son la validación
   automática suficiente antes de eso. No dejar `pnpm dev` corriendo en background al terminar.

---

## 2. Principios innegociables de código

Estos no se relajan "por esta vez". Cada uno existe porque su violación es un bug de seguridad,
de datos o de UX que ya vimos o que es inevitable a escala multi-tenant.

### 2.1 Tenant isolation, siempre y en todas partes

- El tenant es la `Organization` (mostrada como "Distrito"). **Todo query a una tabla con scope
  de organización lleva `where: { organizationId }`**, sin excepción. Nunca un
  `prisma.event.findMany()` desnudo en código de feature.
- `forOrg()` para queries simples; `prisma.*` con `where: { organizationId }` explícito cuando
  se necesita `include`/`select` tipado (convención #18).
- El aislamiento se extiende al cache: los tags de `unstable_cache` llevan el `orgId`
  (`memberships:org-abc`), definidos en `src/repositories/cache-tags.ts`. Revalidar el tag de
  una org jamás debe afectar a otra.
- En code review, un query sin scope de tenant es blocker automático, aunque "el caller ya
  filtró". La defensa es en profundidad: el repo garantiza el scope por sí mismo.

### 2.2 La capa de repositorios es la única puerta a la DB

- Toda interacción con la DB vive en `src/repositories/`. **Ningún archivo de feature importa
  `@/lib/db`.** Las excepciones (config de Auth.js, onboarding pre-tenant, deep link de
  invitación) están documentadas en la convención #14 y en el ADR-0002 — no agregues una nueva
  sin documentarla igual.
- Los repos lanzan `BusinessError(code, meta?)` para errores esperados; las actions los
  capturan y devuelven `{ error: string }`. Los errores inesperados (fallo de DB, bug) se dejan
  propagar con `throw`. **Nunca mezclar los dos mecanismos** en una misma ruta de error.

### 2.3 Mutaciones = Server Actions, validadas con Zod en el borde

- API routes solo para lo que no puede ser Server Action: webhooks, sync de la PWA, OAuth
  callbacks, health check. Todo lo demás es Server Action.
- Zod valida en el borde de cada action/route; adentro se trabaja con tipos de Prisma.
- Errores de negocio: `return { error }` + `useActionState`. Si una action exitosa no tiene
  datos que devolver, retorná `{ success: true }` — un `{}` es indistinguible del estado
  inicial (convención #20).

### 2.4 Modelo de datos

- **IDs `cuid2` en todas las tablas.** Requerido para URLs públicas y sync offline. Nunca
  autoincrement.
- **Puntajes en `Decimal`, nunca `Float`.** Y recordá que `Decimal` no cruza el boundary
  Server→Client: convertir con `Number()`/`.toString()` antes de pasarlo como prop
  (convención #26).
- **`MiembroScout` ≠ `User`.** `User` es una cuenta autenticada; `MiembroScout` es una persona
  del dominio scout que existe sin auth, con linkeo opcional vía `userId?`. Esta separación es
  la base de toda la Capa 2 — no la colapsen por conveniencia (ADR-0001).
- **Naming bilingüe con intención**: dominio scout en español (`Posta`, `Patrulla`,
  `GrupoScout`), framework en inglés (`User`, `Event`, `Organization`).

### 2.5 Copy centralizado

- Todo string visible al usuario vive en `src/messages/es.json`. Nada hardcodeado en
  componentes. Es la única fuente; el día que haya i18n real, esto es lo que lo hace posible.

---

## 3. Los tres subsistemas donde vive la complejidad

El 80% de los bugs sutiles del proyecto salió de estos tres lugares. Si vas a tocar uno,
leé primero su sección completa en `CLAUDE.md` y el ADR correspondiente.

### 3.1 Auth (Auth.js v5 con estrategia JWT)

La raíz de casi todos los problemas: **con estrategia JWT, el estado de sesión vive en la
cookie del usuario, y el servidor no puede empujarle actualizaciones**. Todo lo demás son
consecuencias:

- **Config partida en dos archivos** porque el middleware corre en Edge y no puede importar
  Prisma: `auth.config.ts` (Edge-safe) y `auth.ts` (completa). El middleware importa **solo**
  `auth.config.ts`. Cualquier campo custom del JWT que el middleware necesite debe estar
  mapeado en el `session` callback de `auth.config.ts` — si solo está en `auth.ts`, el
  middleware no lo ve (convenciones #9–10).
- **Mutaste memberships → refrescá el JWT** con `unstable_update({ refreshMemberships: true })`
  antes del `redirect()`. Sin esto el middleware lee el JWT viejo (convención #13).
- **Otro usuario te cambió el rol → tu JWT no se entera solo.** Por eso existe
  `SessionRefresher` (montado en `(app)` y `(juez)`): dispara el refresh al montar, al
  recuperar foco y cada 3 minutos (convención #45). Y ojo: `update()` de `next-auth/react` se
  descarta en silencio si el `SessionProvider` está en `loading` — todo layout que monte
  `SessionProvider` debe pasarle la `session` server-side como prop inicial (convención #49).
- **El middleware ve TODAS las requests, incluidos los POST de Server Actions.** Las reglas de
  redirect de navegación deben dejar pasar requests con header `next-action`; solo los gates de
  seguridad reales (`!auth?.user`) aplican siempre (convención #47). Ignorar esto produce el
  críptico "An unexpected response was received from the server".
- **Rutas públicas nuevas van a `PUBLIC_PATHS`** en `auth.config.ts` a mano — no hay detección
  automática (convención #39).
- `signOut` siempre desde el cliente (convención #11). Cadenas de redirect anidados
  desincronizan el `canonicalUrl` del router: si sabés de antemano el destino final, redirigí
  directo (convención #48).

### 3.2 Cache (unstable_cache + revalidateTag + Router Cache)

La regla madre: **el compilador no puede verificar la coherencia del cache — sos vos**.

- `revalidateTag` **solo para mutaciones estructurales** (aparecen/desaparecen filas). Para
  updates de valores en una fila existente, NO revalidar: devolver los valores confirmados en
  el return de la action y actualizar estado local desde ahí. `revalidateTag` dispara un soft
  refresh que puede pisar `useState` con datos stale del Router Cache (convención #16).
- Corolario del mismo problema: **nunca sincronizar inputs controlados desde props vía
  `useEffect`** — sincronizar solo desde el resultado de la action (convención #17).
- **Al crear un cache con tag nuevo, auditar TODAS las mutaciones que escriben esos datos** y
  agregarles el `revalidateTag`. Una mutación que invalida `scoreSheets:orgId` pero no
  `leaderboard:orgId` deja el leaderboard stale silenciosamente (convención #41).
- **Al sumar un consumidor nuevo a una query cacheada, verificá que el `select` trae lo que ese
  consumidor necesita.** Ensanchar el select es seguro para los consumidores existentes, pero
  no asumas que "ya trae todo" porque otro consumidor funcionaba (convención #53).

### 3.3 El modo offline del juez (PWA + IndexedDB + SPA catch-all)

**El subsistema más frágil del proyecto.** Lectura obligatoria antes de tocarlo: ADR-0004
completo y `src/lib/offline/CLAUDE.md` (donde viven sus convenciones #27–36 y #50). Sus reglas
permanentes, resumidas:

- **Dentro de `/juez/**` el router de Next.js no navega**: solo `useJuezRouter().navigate()` o
  `JuezLink`. Un `router.push()` cambia la URL pero deja la vista vieja en pantalla, sin error
  visible (convención #50). Este bug estuvo "aceptado" durante meses documentado como
  limitación; no lo era.
- **Serwist**: handlers como instancias de clase, nunca strings (`new NetworkOnly()`, no
  `"NetworkOnly"` — el string no se resuelve y falla en silencio, convención #31). Todas las
  navegaciones deben ser `NetworkOnly` antes de `...defaultCache`, porque el App Router produce
  streams que el Cache API no puede almacenar (convención #32). El SW va deshabilitado en
  desarrollo y `src/app/sw.ts` excluido del tsconfig principal (convención #27).
- **IndexedDB**: en el callback `upgrade`, limpiar stores vía `transaction.objectStore().clear()`,
  nunca `db.clear()` (convención #34). La cola offline se drena ordenando por `createdAt`, no
  por clave primaria (convención #28). Cada bump de versión del IDB debe decidir qué stores se
  wipean.
- **`useSyncEngine` / `useJuezData`**: el sync necesita `userId`/`organizationId` para hidratar
  y detectar cambio de tenant (convención #29); necesita `syncNow()` en el mount inicial, no
  solo en `online`/`visibilitychange` (convención #33); y el estado `"empty"` solo es válido
  cuando `lastHydratedAt > 0` — antes de eso es `"loading"` (convenciones #35–36).
- **Limitación conocida y aceptada**: las rutas `/juez/**` solo funcionan offline si el SW las
  cacheó en una visita previa. Soportar páginas nunca visitadas en modo avión requeriría CSR
  completo con hidratación desde IDB — está fuera de alcance y documentado (convención #30).
- La idempotencia del sync se garantiza con `SyncOpLog` y la detección de conflictos con
  `ScoreSheet.version`: **toda mutación nueva sobre `ScoreSheet` debe bumpear `version`**, o el
  sistema de conflictos queda ciego a ella.

---

## 4. Caveats comunes (te van a pasar en el primer mes)

Trampas de frecuencia alta, en orden aproximado de probabilidad:

- **`useActionState` + estado React**: si el form vive en `useState` y no en inputs DOM,
  serializar a `FormData` y llamar al dispatch dentro de `startTransition(() => dispatch(fd))`.
  Sin la transition, `isPending` no actualiza (convención #22).
- **Dos acciones en una card = dos `<form>` hermanas**, nunca anidadas — el browser ignora la
  form interna sin avisar (convención #42).
- **`<dialog>` nativo necesita `m-auto`**: el preflight de Tailwind v4 pisa el `margin: auto`
  del UA stylesheet y el modal aparece pegado a la esquina (convención #21).
- **`Decimal` como prop a un Client Component** rompe la serialización: convertir en el Server
  Component (convención #26).
- **Borrar una página y correr typecheck**: `rm -rf .next/types` primero, o `tsc` falla con
  `Cannot find module` por tipos cacheados de la ruta muerta (convención #38).
- **PowerShell + rutas con `[param]`**: `Remove-Item`, `Move-Item`, etc. interpretan los
  corchetes como glob y fallan **en silencio**. Usar `-LiteralPath` siempre que el path tenga
  corchetes de App Router (convención #37).
- **Layouts de route groups no son root layouts**: `app/layout.tsx` es siempre el root; el del
  group es un wrapper sin `<html><body>` o hay hydration mismatch (convención #40). Y si una
  sección necesita shell visual propio, va a su propio route group, con `SessionProvider` si
  usa `SignOutButton` (convención #24).
- **`<select>` con filtro en un Server Component**: extraer un Client Component chico con
  `useSearchParams` + `router.push` preservando los demás parámetros. No dejar controles
  `disabled` como placeholder: se implementan o se eliminan (convención #44).
- **UI**: antes de cualquier trabajo visual, leer `.agents/skills/frontend-design/SKILL.md` y
  elegir una dirección estética concreta. Los patrones mobile validados (touch targets 56/64px,
  `active:scale`, bordes por estado) están en la convención #25 — reusarlos, no reinventarlos.

---

## 5. Caveats poco comunes (te van a pasar una vez al año, y van a doler)

- **Migraciones que estrechan una invariante** (ej: "template por posta" → "template por
  actividad"): correr primero una query de solo lectura que detecte los datos que el modelo
  viejo permitía y el nuevo no. Backfill automático solo para los casos sin conflicto; los
  conflictivos quedan en `null` para resolución humana. **Nunca resolver un conflicto de datos
  arbitrariamente en un backfill** — el Plan 15 encontró 2 conflictos reales en producción, uno
  en un evento ya `ACTIVO` (convención #52).
- **Carreras de unicidad**: la validación en app de "esta posta ya está asignada a este evento"
  no cubre dos requests concurrentes. La red de seguridad es el unique constraint de DB + un
  `.catch` del `P2002` que lo traduce a `BusinessError`. Si agregás una validación de unicidad
  en app, preguntate si necesita el mismo doble candado (patrón del Plan 16 en `asignarPosta`).
- **Funciones de hooks externos no son referencias estables**: `useSession().update` cambia de
  identidad al llamarse. En deps de un efecto "de una sola vez" produce un loop infinito
  (nos pasó: rebote infinito `/admin`↔`/login`). Patrón: guardarla en un `useRef` actualizado
  en un efecto aparte, y el callback con deps `[]` (convención #46).
- **Claves huérfanas tolerantes por diseño**: `Posta.criteriosDescripciones` puede quedar con
  claves de un template viejo si la posta se reusa con otro template. Se ignoran al renderizar
  en vez de romper. Si agregás JSON flexible similar, definí explícitamente la política de
  claves huérfanas (convención #51).
- **Índices parciales de Postgres** (en `Invitation` y `PublicShareLink`): Prisma no los
  expresa del todo en el schema; viven en el SQL de la migración. Si regenerás una migración
  desde cero o cambiás esas tablas, verificá que el índice parcial sobrevive.
- **La regla del último ADMIN**: una org no puede quedarse sin administradores; la regla vive
  en el repo de memberships. Cualquier flujo nuevo que degrade roles o borre memberships debe
  pasar por ahí, no reimplementarla.
- **Lockout de credenciales**: `AuthAttempt` implementa 5 intentos / 15 min. Si tocás el flujo
  de login con password, mantené el registro de intentos — es la única defensa contra fuerza
  bruta, no hay captcha ni rate limiting de infraestructura.

---

## 6. Testing: qué se cubre y qué no, a propósito

- **137 tests con Vitest**, concentrados en donde el riesgo es real: repositorios (tenant
  isolation, reglas de negocio, `BusinessError` codes), reglas de membership/invitaciones,
  ranking del leaderboard (empates, breakdown), lockout de auth, y las transacciones nuevas
  (`crearPostaYAsignar`, ownership por juez, carrera de asignación).
- **No hay tests de browser automatizados, por decisión.** La verificación E2E es manual,
  guiada por los escenarios del plan. Al terminar una feature, entregá la lista numerada de
  casos para que una persona los clickee.
- La pirámide correcta para features nuevas: (1) tests de repo para toda regla de negocio
  nueva, (2) typecheck + lint + build en verde, (3) escenarios manuales del plan revisados
  contra el código, (4) verificación humana en browser.
- CI (`.github/workflows/ci.yml`) corre con service container de Postgres. Si un test necesita
  DB, ya tiene el patrón; no mockees Prisma para evitar levantarla.

---

## 7. Operaciones

- **Producción**: Docker multi-stage standalone (`NEXT_STANDALONE=true`),
  `docker-compose.prod.yml` con `db/migrate/app`, y **Coolify como reverse proxy desde el
  Plan 14** (`docs/plans/14-coolify-migration.md`): el servicio `caddy` y el `Caddyfile` fueron
  eliminados, los security headers viven en `headers()` de `next.config.ts`, y el CD es un
  webhook de Coolify desde GitHub Actions. Las guías de `docs/operaciones/` ya están
  reescritas para ese flujo.
- **Migraciones en producción** corren en el servicio `migrate` antes de levantar `app`. Nunca
  `prisma db push` en prod; siempre migraciones versionadas.
- **Backups**: `scripts/backup.sh` / `restore.sh` con `pg_dump --format=custom`. Verificá
  periódicamente que el backup es restaurable — un backup no probado no existe.
- **Health check**: `/api/health`, público (está en `PUBLIC_PATHS`).
- **Guías operativas** en `docs/operaciones/` (deploy, actualización, CD con GitHub Actions).
  Mantenerlas al día es parte del done de cualquier cambio de infraestructura.

---

## 8. Deuda y riesgos conocidos (estado a julio 2026)

1. **`next-auth@5.0.0-beta.31`**: es una beta pineada. Es el riesgo de dependencia más alto del
   proyecto — el split config, el `session` callback y el comportamiento de `update()` son
   exactamente el tipo de cosa que una beta cambia. Al subirla: releer convenciones #9–13,
   #45–49 y re-verificar los escenarios de auth de los Planes 1, 13b y 13c.
2. **Renumeración de planes**: los planes históricos 01–08 referencian "Plan 9" (deploy) que
   hoy es el Plan 10. Se mantiene como artefacto educativo — no "corregir" los docs viejos.
3. **Capa 2 abre números de plan que colisionan** con 14/15/16 ya usados por la Capa 1 (el
   índice de `docs/README.md` los marca tentativos, y `CLAUDE.md` aún dice "planes 10–14" para
   la Capa 2). Renumerar al planificar el primero.
4. **Limitación offline de SSR** (convención #30): decisión consciente, no bug. Si algún día se
   quiere modo avión total, es una migración a CSR con hidratación desde IDB — plan propio.
5. **Sin rate limiting de infraestructura**: el lockout de `AuthAttempt` es la única defensa.
   Si el proyecto crece en exposición pública, agregar rate limiting en el proxy.

---

## 9. Guía para upgrades de dependencias

Antes de subir una major, esto es lo que se rompe primero en cada una:

- **Next.js**: el Router Cache y `unstable_cache` (toda la sección 3.2 depende de
  comportamiento semi-documentado), el header `next-action` del middleware, la serialización de
  Server Actions como props (convención #54), y el streaming SSR que motiva la convención #32.
  Releer las convenciones de cache y correr TODOS los escenarios offline del ADR-0004.
- **Prisma**: el generator `prisma-client` + `@prisma/adapter-pg` es obligatorio; los imports
  vienen de `@/generated/prisma/client`, nunca de `@prisma/client`. Verificar que los índices
  parciales sobreviven cualquier regeneración.
- **Serwist**: re-verificar los tres gotchas (instancias vs strings, navegaciones NetworkOnly,
  `stripRscParam`) con la app buildeada, no en dev — el SW está deshabilitado en desarrollo.
- **Tailwind**: el preflight es la fuente de la trampa del `<dialog>` (convención #21); revisar
  el changelog del preflight específicamente.
- **React**: `startTransition` + `useActionState` (convención #22) y el timing de efectos
  padre/hijo del que depende la convención #49.

Regla general: **un upgrade de major es un plan**, con escenarios de verificación propios, no
un commit de "bump deps".

---

## 10. Checklist de cierre para cualquier feature

Antes de dar por terminado un cambio:

- [ ] Todo query nuevo tiene scope de tenant y vive en `src/repositories/`.
- [ ] Toda mutación estructural nueva revalida **todos** los tags que leen esos datos
      (auditá los caches existentes, el compilador no lo hace).
- [ ] Toda ruta pública nueva está en `PUBLIC_PATHS`.
- [ ] Toda mutación de memberships refresca el JWT antes del redirect.
- [ ] Toda mutación de `ScoreSheet` bumpea `version`.
- [ ] Copy nuevo en `es.json`, no hardcodeado.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` en verde
      (con `rm -rf .next/types` previo si se borraron rutas).
- [ ] Escenarios de verificación del plan revisados contra el código real.
- [ ] Lecciones nuevas escritas en el plan; las permanentes promovidas a `CLAUDE.md`.
- [ ] Lista de casos manuales numerados entregada para verificación en browser.

---

*Si algo de este documento contradice al código, el código es la verdad — pero investigá por
qué divergieron antes de decidir cuál de los dos corregir. La mayoría de estas reglas se
escribieron con el bug todavía sangrando.*
