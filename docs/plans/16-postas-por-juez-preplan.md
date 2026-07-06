# Plan 16 (preplan) — Postas creadas por jueces

> **Esto NO es el plan final.** Es un resumen de la conversación de alineación previa, escrito para que se redacte el plan formal con Claude Opus en plan mode (workflow habitual, CLAUDE.md). El plan formal debe seguir el formato de Plan 6b / Plan 15 (Contexto, Alcance incluye/no incluye, Decisiones técnicas, Modelo de datos, Implementación por pasos, Tests, Verificación) y puede revisar el detalle técnico de lo que sigue, pero **las decisiones de producto de la sección "Decisiones ya tomadas" no deberían revisitarse** sin volver a hablar con el usuario — ya fueron discutidas y confirmadas explícitamente.

---

## Contexto / motivación

Feedback recibido de administradores reales del sistema: transcribir las fichas de posta de todos los dirigentes a mano (vía `/admin/postas`) es mucho trabajo para una sola persona. Los dirigentes (jueces) ya envían sus fichas de posta en un formulario Excel antes de cada evento. La idea: que puedan cargarlas directo en el sistema, vinculadas a las actividades previstas para el evento, sin pasar por el admin como intermediario.

**Prerrequisito**: Plan 15 (mover `templateId` de `Posta` a `Actividad`) debe estar completado y verificado antes de arrancar este plan. Sin eso, el juez tendría que lidiar con la asignación de plantilla al crear su posta — justo lo que se decidió evitar.

---

## Decisiones ya tomadas (confirmadas con el usuario, no revisitar sin preguntar)

1. **Arquitectura: online-only, fuera del SPA offline de `/juez/**`.** Server Actions normales, sin IndexedDB/snapshot/sync engine ni catch-all router (`JuezRouterProvider`). El motor offline (Plan 7b–7d) está pensado para scoring en eventos `ACTIVO` sin garantía de conectividad; la planificación (`BORRADOR`) no tiene ese requisito, así que extenderlo sería costo sin beneficio. Ver ADR-0004 — este nuevo flujo probablemente amerita su propia entrada de "reglas permanentes" o una nota de alcance ahí.

2. **Enlaces desde el SPA offline hacia rutas online se deshabilitan cuando `!navigator.onLine`.** Esto incluye tanto los enlaces nuevos hacia el flujo de postas-por-juez como el enlace ya existente "Ver eventos publicados" (`EventosListView.tsx`, agregado en sesión previa) hacia `/eventos`. Objetivo: no mostrar como clickeable algo que fallaría por falta de red, dentro de una superficie (`/juez`) que el usuario espera que funcione offline.

3. **El template de puntaje NO se toca en este flujo.** Ya vive en `Actividad` (Plan 15). El juez que crea una posta solo carga datos descriptivos: nombre, descripción, duración, materiales, encargado, ayudantes. No ve ni elige `ScoreTemplate`.

4. **Auto-asignación inmediata.** Al crear la posta y elegir a qué actividad se vincula, se crea el `AsignacionPosta` correspondiente con `juezUserId` = el juez que la creó. No queda un estado intermedio "sin asignar" a la espera de que el admin confirme.

5. **Edición habilitada hasta que el evento pase a `ACTIVO`.** El juez puede seguir ajustando su posta (nombre, descripción, materiales, etc.) mientras el evento sigue en `BORRADOR`. Mismo momento de lock conceptual que `isTemplateLocked`/`isEventoLocked` ya usan en el resto del sistema.

6. **Reuso de nombres de posta vía biblioteca existente.** Como `Posta` es una entidad reutilizable del distrito (`@@unique([organizationId, nombre])`, Plan 6c), si el nombre que escribe el juez coincide (o es similar) a una posta ya existente, se le debe ofrecer reusarla (vincularla a la actividad actual) en vez de fallar directo con un error de nombre duplicado o crear sin darse cuenta una colisión.

7. **Visibilidad: cualquier `JUEZ` del distrito** puede ver los eventos en `BORRADOR` y las actividades de cada uno, sin necesitar una asignación previa. Es intencional: hoy el admin no sabe de antemano qué dirigente va a postular qué posta, así que restringir por asignación previa no tendría sentido (nadie estaría asignado todavía).

---

## Áreas que el plan formal (con Opus) todavía necesita diseñar en detalle

Estas son preguntas de **implementación**, no de producto — quedan abiertas a criterio de quien redacte el plan formal, pero vale la pena que Opus las resuelva explícitamente en la sección de Decisiones técnicas:

- **Rutas concretas**: ¿una página nueva fuera de `/juez/**` (ej. `/juez/postas/nueva`, análoga a como `/eventos` ya vive fuera del SPA) o dentro de `(app)` con su propio layout? Definir dónde vive el "modo planificación" del juez y cómo se navega desde `/juez/eventos` hacia ahí (dado el punto 2 de arriba: el link debe respetar el estado online/offline).
- **Repos/queries nuevas**: listar eventos `BORRADOR` visibles para jueces y sus actividades — los repos equivalentes (`listEventosParaJuez`, etc.) fueron eliminados en Plan 7c porque estaban acoplados al snapshot offline; hace falta una versión nueva, online, sin esa dependencia.
- **UI de "coincidencias" al escribir el nombre de la posta** (decisión #6): mecanismo concreto — ¿autocomplete en vivo contra `Posta` de la org, debounce, cuántos resultados, cómo se distingue "crear nueva" de "reusar existente" en el formulario.
- **Qué pasa si dos jueces intentan asignarse a la misma actividad** (o la misma posta) casi simultáneamente — validación de unicidad ya existe a nivel `AsignacionPosta` (`@@unique([postaId, actividadId])`), pero conviene decidir el mensaje de error y si se ofrece alguna alternativa (ej. "esa posta ya fue asignada por otro juez a esta actividad").
- **Auditoría**: qué entradas de `AuditLog` se generan (creación de posta por juez, auto-asignación) — seguir el patrón existente de `posta.created`, `.templateAssigned`, etc. de Plan 6b/6c.
- **Notificación al admin**: fuera de alcance salvo que se decida agregar una vista tipo "postas pendientes de revisión" (análoga a `/juez/pendientes` de Plan 13, pero para admins) — a definir si entra en este plan o queda para uno futuro.
- **Validación de permisos**: confirmar que un `JUEZ` sin ninguna membership de rol elevado no pueda editar/eliminar postas creadas por *otros* jueces (solo la propia, o el admin).
- **Tests**: cobertura de repos nuevos + gates existentes (no deberían romperse: una actividad con posta creada por juez pero sin template todavía sigue bloqueando la activación, gate ya cubierto por Plan 15).

---

## Referencias

- `docs/plans/15-template-por-actividad.md` — prerrequisito directo.
- `docs/plans/06c-postas-biblioteca.md` — modelo `Posta`/`AsignacionPosta` que este plan extiende.
- `docs/plans/07a-scoring-juez.md`, `07b`, `07c`, `07d` — por qué el flujo offline no aplica acá (decisión #1).
- `docs/adr/0004-modo-offline-pwa-spa.md` — reglas permanentes del modo offline; evaluar si necesita una nota nueva de alcance ("este ADR no aplica a flujos de planificación online-only").
