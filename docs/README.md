# Documentación de puntajes-scout

Esta carpeta versiona los **planes de implementación** y ADRs del proyecto.
Filosofía: cada plan documenta el qué, el por qué y el cómo se planificó (ver master plan).

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
- [06c — Postas como biblioteca reutilizable](plans/06c-postas-biblioteca.md) _(pendiente)_
- 07a — Vista del juez (online) _(pendiente)_
- 07b — PWA + cola offline + sync _(pendiente)_
- 08 — Reportes, leaderboard y vistas públicas _(pendiente)_
- 09 — Cierre de evento y publicación _(pendiente)_
- 10 — Correcciones post-cierre _(pendiente)_
- 11 — Despliegue a producción + hardening _(pendiente)_

## Planes — Capa 2: Personas y progresión (post-MVP)

- 12 — Padrón de miembros del grupo _(pendiente)_
- 13 — Asociar miembros a patrullas _(pendiente)_
- 14 — Inscripción anual digitalizada _(pendiente)_
- 15 — Cartilla de progresión _(pendiente)_
- 16 — Perfil del scout _(pendiente)_

## ADRs

- [ADR-0001 — Arquitectura en dos capas: scoring primero, personas después](adr/0001-arquitectura-en-capas.md)
- [ADR-0002 — Capa de repositorios con unstable_cache y revalidateTag](adr/0002-repository-layer.md)
- [ADR-0003 — Jerarquía Evento → Actividad → Posta](adr/0003-jerarquia-evento-actividad-posta.md)
