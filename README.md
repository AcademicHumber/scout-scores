# Puntajes Scout

Sistema web multi-tenant para registrar y publicar puntajes de eventos competitivos en distritos scouts.

## Stack

Next.js 15 (App Router) + TypeScript strict + Tailwind v4 + Prisma 7 + PostgreSQL 16. Self-hosted con Docker. Auth.js v5 con Google OAuth + login con email/contraseña. Despliegue en VPS con Caddy (Plan 10, pendiente).

## Cómo levantar el entorno de desarrollo

Requisitos: Node 22+, pnpm 10+, Docker.

**1. Instalar dependencias**

```bash
pnpm install
```

**2. Configurar variables de entorno**

```bash
cp .env.example .env
```

Editar `.env` y completar:

- `AUTH_SECRET` — generarlo con `pnpm dlx auth secret`
- `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — crear credenciales OAuth en [Google Cloud Console](https://console.cloud.google.com/). URI de redirección autorizada: `http://localhost:3000/api/auth/callback/google`
- `DATABASE_URL` — ya apunta a Postgres local por defecto; no requiere cambios si se usa Docker

**3. Levantar la base de datos y aplicar migraciones**

```bash
docker compose up -d db          # Postgres 16 en localhost:5432
pnpm prisma migrate dev          # aplica todas las migraciones
pnpm db:seed                     # carga datos demo (1 distrito, grupos, usuarios, eventos)
```

**4. Iniciar el servidor**

```bash
pnpm dev
```

Abrir http://localhost:3000.

**Scripts útiles**

```bash
pnpm typecheck     # verificar tipos TypeScript
pnpm lint          # ESLint
pnpm test          # tests Vitest
pnpm db:reset      # reiniciar DB y volver a aplicar migraciones + seed
```

## Qué funciona hoy

- **Multi-tenant**: cada Distrito Scout es un tenant aislado. Roles: `ADMIN | JUEZ | ESPECTADOR | JEFE_PATRULLA`.
- **Auth**: login con Google OAuth o email/contraseña propios, onboarding de nuevo distrito, invitaciones por email con deep link. Seed demo: `admin@demo.local / demo1234`.
- **Grupos scouts y miembros**: CRUD de grupos, gestión de memberships, perfil del distrito.
- **Plantillas de puntaje**: biblioteca de plantillas con modos `CRITERIOS` y `PUNTAJE_UNICO`, criterios `PUNTUABLE` y `DESEMPATE`, escalas discretas.
- **Eventos**: ciclo de vida `BORRADOR → ACTIVO → CERRADO → PUBLICADO`, actividades con peso porcentual (suma 100%), patrullas por evento.
- **Postas**: biblioteca reutilizable del distrito (`/admin/postas`) con descripción, duración, materiales y plantilla fija. Se asignan a actividades de eventos vía dialog; cada asignación tiene su propio juez, encargado y ayudantes. Historial de eventos por posta. Validación de unicidad por evento.

**Próximo:** despliegue a producción (Plan 10) — VPS, Docker Compose, Dockerfile multi-stage, Caddy, backups.

## Documentación

Toda la planificación vive en [`docs/plans/`](docs/plans/), versionada con git. Empezar por el [master plan](docs/plans/00-master-plan.md) o ver el [índice de planes](docs/README.md).
