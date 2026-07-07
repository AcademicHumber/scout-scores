# Documentación de puntajes-scout

Esta carpeta versiona los **planes de implementación** y ADRs del proyecto.
Filosofía: cada plan documenta el qué, el por qué y el cómo se planificó (ver master plan).

- [Best practices y caveats](best-practices.md) — documento de traspaso: principios innegociables, los tres subsistemas complejos (auth, cache, offline), caveats comunes y raros, guía de upgrades y checklist de cierre.

## Planes — Capa 1: Scoring (MVP)

- [00 — Master plan](plans/00-master-plan.md) — visión completa del sistema y roadmap.
- [01 — Bootstrap & infraestructura local](plans/01-bootstrap-infra.md) — scaffold inicial. ✓
- [02 — Schema núcleo + seed](plans/02-schema-nucleo-seed.md) ✓
- [03 — Auth con Google + onboarding multi-tenant](plans/03-auth-onboarding.md) ✓
- [03b — React Best Practices (análisis Vercel skill)](plans/03b-react-best-practices.md) ✓
- [03c — Design System: identidad de marca Scout](plans/03c-design-system.md) ✓
- [04 — Gestión de invitaciones, memberships, grupos scouts y perfil del distrito](plans/04-invitaciones-memberships.md) ✓
- [05 — Plantillas de puntaje](plans/05-plantillas.md) ✓
- [06a — Eventos y ciclo de vida](plans/06a-eventos.md) ✓
- [06b — Postas, patrullas, asignación de jueces](plans/06b-postas-patrullas-jueces.md) ✓
- [06c — Postas como biblioteca reutilizable](plans/06c-postas-biblioteca.md) ✓
- [07a — Scoring online y vista del juez](plans/07a-scoring-juez.md) ✓
- [07b — PWA + cola offline + sync](plans/07b-pwa-offline-sync.md) ✓
- [07c — Vista del juez como Client Components hidratados desde IDB](plans/07c-juez-client-components.md) ✓
- [07d — Catch-all SPA para `/juez/**` + fixes de SW caching offline](plans/07d-catch-all-spa-y-fixes-sw.md) ✓
- [08 — Leaderboard, cierre de evento y vistas públicas](plans/08-leaderboard-cierre-publicacion.md) ✓
- [09 — Login con email y contraseña (alternativa a Google)](plans/09-auth-credentials.md) ✓
- [10 — Despliegue a producción + hardening](plans/10-deploy-produccion.md) ✓
- [11 — Documentación pública para administradores y participantes](plans/11-docs-publica.md) ✓
- [12 — Mobile UI admin: correcciones de overflow y formularios](plans/12-mobile-admin-ui.md) ✓
- [13 — Refactor del onboarding: unirse como Espectador](plans/13-onboarding-refactor.md) ✓
- [13b — Refresh de sesión tras cambio de rol hecho por otro usuario](plans/13b-refresh-sesion-post-cambio-rol.md) ✓
- [13c — Server Actions interceptadas por el middleware de onboarding](plans/13c-server-actions-middleware-redirect.md) ✓
- [14 — Migración de Caddy a Coolify como reverse proxy](plans/14-coolify-migration.md) ✓
- [15 — Mover ScoreTemplate de Posta a Actividad + leyenda de puntajes](plans/15-template-por-actividad.md) ✓
- [16 — Postas creadas por jueces](plans/16-postas-por-juez.md) ✓ ([preplan](plans/16-postas-por-juez-preplan.md))

> **Renumeración**: el deploy estaba previsto inicialmente como Plan 9. Tras intercalar el Plan 9 (login propio), el deploy pasó a Plan 10. Las referencias a "Plan 9" en los planes históricos 01–08 reflejan el estado del proyecto en el momento en que se escribieron y se mantienen como artefacto educativo.

## Planes — Capa 2: Personas y progresión (post-MVP)

Números tentativos; se confirman al planificar cada uno. (Los números 14–16 previstos originalmente para esta capa quedaron usados por planes de la Capa 1.)

- 17 — Padrón de miembros del grupo _(pendiente)_
- 18 — Asociar miembros a patrullas _(pendiente)_
- 19 — Inscripción anual digitalizada _(pendiente)_
- 20 — Cartilla de progresión _(pendiente)_
- 21 — Perfil del scout _(pendiente)_

## ADRs

- [ADR-0001 — Arquitectura en dos capas: scoring primero, personas después](adr/0001-arquitectura-en-capas.md)
- [ADR-0002 — Capa de repositorios con unstable_cache y revalidateTag](adr/0002-repository-layer.md)
- [ADR-0003 — Jerarquía Evento → Actividad → Posta](adr/0003-jerarquia-evento-actividad-posta.md)
- [ADR-0004 — Modo offline del juez: PWA con IndexedDB, cola de sync y SPA catch-all](adr/0004-modo-offline-pwa-spa.md)
