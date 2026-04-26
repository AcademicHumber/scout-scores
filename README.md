# Puntajes Scout

Sistema web multi-tenant para registrar y publicar puntajes de eventos competitivos en distritos scouts.

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind v4 + Prisma + PostgreSQL 16. Self-hosted con Docker. Auth.js v5 con Google OAuth (en Plan 1). Despliegue en VPS con Caddy (en Plan 9).

## Cómo levantar el entorno de desarrollo

Requisitos: Node 22+, pnpm 10+, Docker.

```bash
pnpm install
cp .env.example .env
docker compose up -d db
pnpm dev
```

Abrir http://localhost:3000.

## Documentación

Toda la planificación vive en [`docs/plans/`](docs/plans/), versionada con git como cualquier código fuente. Empezar por el [master plan](docs/plans/00-master-plan.md).

## Estado

En construcción — Plan 0a completado.
