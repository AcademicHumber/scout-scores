# Puntajes Scout

Sistema web multi-tenant para registrar y publicar puntajes de eventos competitivos en distritos scouts.

## Stack

Next.js 15 (App Router) + TypeScript strict + Tailwind v4 + Prisma 7 + PostgreSQL 16. Self-hosted con Docker. Auth.js v5 con Google OAuth. Despliegue en VPS con Caddy (Plan 9, pendiente).

## Cómo levantar el entorno de desarrollo

Requisitos: Node 22+, pnpm 10+, Docker.

```bash
pnpm install
cp .env.example .env        # DATABASE_URL apunta a Postgres local
docker compose up -d db     # Postgres 16 en localhost:5432
pnpm dev                    # Next.js en localhost:3000
```

Abrir http://localhost:3000.

## Qué funciona hoy

- **Multi-tenant**: cada Distrito Scout es un tenant aislado. Roles: `ADMIN | JUEZ | ESPECTADOR | JEFE_PATRULLA`.
- **Auth**: login con Google OAuth, onboarding de nuevo distrito, invitaciones por email con deep link.
- **Grupos scouts y miembros**: CRUD de grupos, gestión de memberships, perfil del distrito.
- **Plantillas de puntaje**: biblioteca de plantillas con modos `CRITERIOS` y `PUNTAJE_UNICO`, criterios `PUNTUABLE` y `DESEMPATE`, escalas discretas.
- **Eventos**: ciclo de vida `BORRADOR → ACTIVO → CERRADO → PUBLICADO`, actividades con peso porcentual (suma 100%), patrullas por evento.
- **Postas**: CRUD inline dentro de actividades, asignación de plantilla y juez por posta, gates de pre-activación con acumulación de errores.

**Próximo:** refactorizar postas como entidad de biblioteca reutilizable (Plan 6c), luego scoring real — carga de planillas por el juez (Plan 7a).

## Documentación

Toda la planificación vive en [`docs/plans/`](docs/plans/), versionada con git. Empezar por el [master plan](docs/plans/00-master-plan.md) o ver el [índice de planes](docs/README.md).
