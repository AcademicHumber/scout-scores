# Plan 0a — Bootstrap & infraestructura local

> **AVISO IMPORTANTE — Alcance reducido en ESTA sesión**
>
> El usuario decidió no ejecutar el Plan 0a en esta sesión por límite de tokens. La única acción a ejecutar AHORA es:
>
> 1. **Escribir `C:\src\puntajes-scout\HOW-TO-CONTINUE.md`** con instrucciones detalladas para retomar el Plan 0a en una próxima sesión.
>
> Después de escribir ese archivo, **NO ejecutar nada más del plan**. El resto del documento (scaffolding, Prisma, Docker, etc.) queda como referencia completa para la sesión que retome la ejecución.

## Contexto

El proyecto **puntajes-scout** se construye paso a paso, un sub-plan por sesión, según el roadmap definido en el [master plan](../../.claude/plans/i-want-to-build-cozy-alpaca.md). Hoy el directorio `C:\src\puntajes-scout` está vacío y el master plan vive todavía en `~/.claude/plans/i-want-to-build-cozy-alpaca.md`.

Plan 0a es el primer escalón ejecutable: dejar el repositorio inicializado, con el toolchain mínimo funcionando localmente y la documentación versionada **dentro** del repo. Una vez completo, cualquier sub-plan posterior (Plan 0b en adelante) puede asumir como dado el scaffolding, la base de datos local, el layout en español y el CI básico.

El criterio de éxito es concreto: un colaborador clonando el repo debería poder hacer `pnpm install && docker compose up -d db && pnpm dev` y ver una página simple en `http://localhost:3000` con copy en español, conectada a un Postgres local listo para recibir migraciones (cuando lleguen en Plan 0b).

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

Esta regla queda documentada en el master plan y se respeta para todo sub-plan posterior (0b, 1, 2, ...).

---

## Alcance

### Incluye

- Scaffold de **Next.js 15.x** (App Router) + **TypeScript strict** + **Tailwind v4**, instalado con **pnpm**.
- **Estructura `src/`** con `src/app/`, `src/lib/` (vacío por ahora), `src/messages/es.json` con copy base en español neutro/tuteo.
- **Layout base en español**: `<html lang="es">`, metadata en español, viewport mobile-first, sin features (será expandido en planes posteriores).
- **Prisma init** con `schema.prisma` mínimo (solo `generator` + `datasource`, sin modelos). Modelos vienen en Plan 0b.
- **Docker Compose** con un único servicio `db` (Postgres 16-alpine) con volumen persistente. Next.js corre en el host, **no en Docker** (mejor DX en dev).
- **Caddyfile** template para producción, versionado pero **no usado en dev**. Sirve como referencia para Plan 9.
- **`.env.example`** con `DATABASE_URL` apuntando al Postgres local.
- **CI básico** en `.github/workflows/ci.yml`: lint + typecheck + build, con Node 22 + pnpm cache. No corre tests ni DB (no hace falta todavía).
- **Documentación versionada en el repo**:
  - `docs/README.md` — índice de la carpeta de docs.
  - `docs/plans/00-master-plan.md` — copia exacta del master plan, movido desde `~/.claude/plans/`.
  - `docs/plans/01-bootstrap-infra.md` — este mismo plan, copiado desde `~/.claude/plans/purrfect-waddling-quail.md`.
- **Configuración auxiliar**:
  - `.gitattributes` con line endings normalizados (clave en Windows).
  - `.editorconfig` para consistencia entre editores.
  - `.nvmrc` fijando Node 22 (LTS coincide con prod), `engines.node` permisivo en `package.json`.
  - `README.md` raíz con instrucciones de "cómo levantar dev".
- **Repo git inicializado** localmente con branch `main`. Varios commits temáticos (ver sección Commits).
- **Sin push a GitHub** todavía: el remoto se agrega en una sesión futura cuando el usuario lo decida.

### NO incluye (explícito, para evitar scope creep)

- Modelos de Prisma, migraciones, seed → **Plan 0b**.
- Auth.js, Google OAuth, middleware de tenant → **Plan 1**.
- PWA, service worker, manifest → **Plan 5b**.
- Tests (Vitest, Playwright, etc.) → cuando haya código a testear (Plan 0b/1).
- Husky / lint-staged / pre-commit hooks → opcional, no parte de 0a.
- i18n library (next-intl, react-intl) → la app es **monolingüe español**, basta importar `messages/es.json` directo.
- Caddy levantado en dev → solo el archivo está versionado para Plan 9.
- Sentry, Plausible, observabilidad → Plan 9.

---

## Decisiones técnicas

### Stack y herramientas

| Decisión | Elección | Alternativa descartada | Razón |
|---|---|---|---|
| Package manager | **pnpm 10** | npm, yarn | Lockfile estricto, store global ahorra disco, default del ecosistema Next.js moderno. Ya instalado. |
| Estilos | **Tailwind v4** | Tailwind v3, vanilla CSS | v4 ya estable más de un año (abril 2026), default de `create-next-app` actual. Configuración vía PostCSS, sin `tailwind.config.ts`. |
| Estructura | **`src/` directory** | Sin `src/` (App Router en raíz) | El master plan referencia explícitamente `src/lib/db.ts`, `src/messages/es.json`, etc. Mantiene root limpio. |
| Versión de Node | **Node 22 LTS pinneado** | Node 24 (instalado), Node 20 | Coincide con la versión de prod del master plan. `.nvmrc` + `engines: ">=22.0.0 <25"` (permite Node 24 instalado en dev pero documenta el target). |
| Branch principal | **`main`** | `master` | Convención moderna. `git init -b main`. |

### Docker en dev

- Solo `db` (Postgres 16-alpine) en compose. Next.js corre con `pnpm dev` en el host.
- Razón: HMR rápido, debugging con breakpoints fácil (sin port forward), menos fricción en Windows con bind mounts.
- El `Caddyfile` queda versionado para producción pero **no se referencia desde docker-compose.yml**. Plan 9 creará un `docker-compose.prod.yml` separado.
- Credenciales de dev: `scout / scout_dev_password / puntajes_scout_dev` — solo locales, no son secretos. Igual van en `.env` (gitignored), con plantilla en `.env.example`.

### CI

- Workflow único: `ci.yml` con jobs `lint`, `typecheck`, `build`.
- Trigger: push a `main` + PRs a `main`.
- No corre tests ni levanta DB (schema vacío, nada que probar todavía). Cuando haya schema y tests reales, se expande en plan futuro.
- Setup: actions/checkout → pnpm/action-setup → actions/setup-node con cache de pnpm → `pnpm install --frozen-lockfile` → tres steps separados.

### Documentación

- El master plan se **copia** (no se mueve permanentemente) a `docs/plans/00-master-plan.md`. Mantenemos el original en `~/.claude/plans/i-want-to-build-cozy-alpaca.md` como historial; el repo es la fuente de verdad de aquí en adelante.
- Este mismo plan (Plan 0a) se copia a `docs/plans/01-bootstrap-infra.md` apenas se aprueba, como dicta la regla del master plan.
- `docs/README.md` es un índice corto: enlaces a cada plan + breve descripción.

---

## Implementación

### Paso 1 — Verificar entorno y crear scaffold

```bash
# Verificar versiones (ya hecho en plan mode)
# Node v24.14.1, pnpm 10.33.0, docker 28.1.1 ✓

cd C:/src/puntajes-scout
pnpm create next-app@latest . \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --import-alias "@/*" \
  --use-pnpm \
  --turbopack \
  --no-experimental-https \
  --skip-install
```

> Notas: `--skip-install` para revisar el `package.json` antes; después `pnpm install`. `--turbopack` activa el bundler nuevo de Next 15 (default). El comando se ejecuta en el directorio vacío (el `.` final).

```bash
pnpm install
```

### Paso 2 — Configurar git desde cero

```bash
git init -b main
```

Crear `.gitattributes`:
```
* text=auto eol=lf
*.{cmd,bat,ps1} text eol=crlf
```

Verificar que `.gitignore` (creado por create-next-app) ya incluye `node_modules`, `.next`, `.env*`. Agregar lo que falte:
```
# DB local
postgres-data/
# Editor
.idea/
.vscode/*
!.vscode/settings.json
```

Commit inicial (vacío, marca el origen):
```bash
git commit --allow-empty -m "chore: inicio del proyecto puntajes-scout"
```

### Paso 3 — Documentación al repo

**3.a — Actualizar el master plan original con la regla Opus/Sonnet.**

Antes de copiar el master plan al repo, editar `~/.claude/plans/i-want-to-build-cozy-alpaca.md` para insertar una sección nueva titulada **"Workflow Opus / Sonnet"** justo después de "Filosofía de documentación", con el mismo contenido que la sección de este plan 0a (planear con Opus, ejecutar con Sonnet, por qué, cómo aplicarla). Así queda registrado para siempre como regla de proceso del proyecto y todas las copias futuras lo heredan.

**3.b — Crear `docs/README.md`:**
```markdown
# Documentación de puntajes-scout

Esta carpeta versiona los **planes de implementación** y futuros ADRs del proyecto.
Filosofía: cada plan documenta el qué, el por qué y el cómo se planificó (ver master plan).

## Planes

- [00 — Master plan](plans/00-master-plan.md) — visión completa del sistema y roadmap.
- [01 — Bootstrap & infraestructura local](plans/01-bootstrap-infra.md) — scaffold inicial.

## ADRs

(Por crear según surjan decisiones puntuales.)
```

Copiar `~/.claude/plans/i-want-to-build-cozy-alpaca.md` (ya con la sección Opus/Sonnet añadida en 3.a) → `docs/plans/00-master-plan.md`.
Copiar `~/.claude/plans/purrfect-waddling-quail.md` → `docs/plans/01-bootstrap-infra.md`.

Commit:
```bash
git add docs/
git commit -m "docs: agregar master plan (con workflow Opus/Sonnet) y plan 0a al repo"
```

### Paso 4 — Configuración auxiliar

Crear `.nvmrc`:
```
22
```

Crear `.editorconfig`:
```
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```

Editar `package.json` para agregar:
```json
{
  "engines": { "node": ">=22.0.0 <25" },
  "packageManager": "pnpm@10.33.0"
}
```

Y completar scripts (los que `create-next-app` no agrega):
```json
{
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit"
  }
}
```

Commit:
```bash
git add .nvmrc .editorconfig package.json
git commit -m "chore: fijar versión de Node, editorconfig y scripts"
```

### Paso 5 — Prisma con schema vacío

```bash
pnpm add -D prisma
pnpm add @prisma/client
pnpm prisma init --datasource-provider postgresql --output ../src/generated/prisma-client
```

> Esto crea `prisma/schema.prisma` y un `.env` con `DATABASE_URL` placeholder.

Editar `prisma/schema.prisma` para que quede mínimo (lo que `init` deja ya está cerca):
```prisma
generator client {
  provider = "prisma-client-js"
  output   = "../src/generated/prisma-client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

Crear `.env.example` (versionado):
```
DATABASE_URL="postgresql://scout:scout_dev_password@localhost:5432/puntajes_scout_dev"
```

Sobreescribir el `.env` (gitignored) con la misma URL.

Commit:
```bash
git add prisma/ .env.example package.json pnpm-lock.yaml
git commit -m "chore: instalar Prisma con schema vacío"
```

### Paso 6 — Docker Compose y Caddyfile

Crear `docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: puntajes-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: scout
      POSTGRES_PASSWORD: scout_dev_password
      POSTGRES_DB: puntajes_scout_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U scout -d puntajes_scout_dev"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

Crear `Caddyfile` (template, no se levanta en dev):
```
# Configuración de producción. APP_DOMAIN se inyecta vía env en Plan 9.
{$APP_DOMAIN} {
    encode gzip zstd
    reverse_proxy app:3000

    log {
        output stdout
        format console
    }
}
```

Crear `.dockerignore` (para cuando Plan 9 dockerice la app):
```
node_modules
.next
.git
.env*
docs
postgres-data
README.md
```

Commit:
```bash
git add docker-compose.yml Caddyfile .dockerignore
git commit -m "chore: agregar Docker Compose para Postgres dev y Caddyfile de prod"
```

### Paso 7 — Layout en español + messages

Crear `src/messages/es.json`:
```json
{
  "app": {
    "name": "Puntajes Scout",
    "tagline": "Sistema de puntajes para eventos del distrito"
  },
  "common": {
    "loading": "Cargando...",
    "error": "Ocurrió un error",
    "retry": "Reintentar"
  }
}
```

Editar `src/app/layout.tsx`:
```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import messages from "@/messages/es.json";

export const metadata: Metadata = {
  title: messages.app.name,
  description: messages.app.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1f3a8a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
      </body>
    </html>
  );
}
```

Reemplazar `src/app/page.tsx` con un placeholder simple en español:
```tsx
import messages from "@/messages/es.json";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold">{messages.app.name}</h1>
        <p className="mt-4 text-lg text-gray-600">{messages.app.tagline}</p>
      </div>
    </main>
  );
}
```

Eliminar fonts de Google que `create-next-app` agrega por default (no las usamos por ahora; mantienen footprint mínimo). Eliminar el contenido de ejemplo en `globals.css` y dejar solo:
```css
@import "tailwindcss";
```

Commit:
```bash
git add src/
git commit -m "feat: layout base en español + mensajes centralizados"
```

### Paso 8 — CI workflow

Crear `.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm build
        env:
          DATABASE_URL: postgresql://placeholder:placeholder@localhost:5432/placeholder
```

> `DATABASE_URL` se setea aunque no haya DB porque Prisma client se genera durante `build` y necesita la variable presente (no necesita conectarse).

Commit:
```bash
git add .github/
git commit -m "ci: agregar workflow básico (lint, typecheck, build)"
```

### Paso 9 — README raíz

Reemplazar el `README.md` autogenerado con uno propio del proyecto:
```markdown
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
```

Commit:
```bash
git add README.md
git commit -m "docs: README raíz con instrucciones de dev"
```

---

## Verificación

Al completar la implementación, los siguientes comandos deben pasar **sin errores**:

```bash
# Toolchain
node --version          # v22.x o superior
pnpm --version          # 10.x

# Instalación limpia
pnpm install --frozen-lockfile

# Calidad
pnpm lint
pnpm typecheck
pnpm build

# DB local
docker compose up -d db
docker compose ps        # db debe estar Up (healthy)

# App
pnpm dev                 # luego abrir http://localhost:3000
```

### Criterios de aceptación

- [ ] Dirige a `http://localhost:3000` y se ve "Puntajes Scout" + tagline en español, con `<html lang="es">` en el HTML fuente.
- [ ] El servidor de Next compila sin warnings de TS y sin errores de ESLint.
- [ ] `docker compose up -d db` deja Postgres escuchando en `localhost:5432` y el healthcheck pasa.
- [ ] `prisma/schema.prisma` existe con `provider = "postgresql"` y `DATABASE_URL` desde env.
- [ ] `docs/plans/00-master-plan.md` y `docs/plans/01-bootstrap-infra.md` existen y son legibles desde el repo.
- [ ] `git log --oneline` muestra ~8 commits temáticos (no un único monocommit).
- [ ] `.github/workflows/ci.yml` está versionado y se renderiza correcto en GitHub cuando se push.

---

## Proceso de planeación

Resumen del intercambio que produjo este plan, para futuros lectores:

1. **Punto de partida**: el master plan (`docs/plans/00-master-plan.md`) ya tenía el alcance de Plan 0a en una fila de tabla. La sesión empezó con el directorio `C:\src\puntajes-scout` vacío.
2. **Verificación de toolchain previa**: antes de redactar el plan se chequeó qué versiones de Node/pnpm/Docker/git había instaladas, para no proponer pasos imposibles. Resultado: Node 24 (no 22), pnpm 10, Docker 28, git 2.49, **sin** `gh` CLI.
3. **Tres preguntas dirigidas al usuario** (vía `AskUserQuestion`):
   - **Package manager**: pnpm vs npm vs yarn → eligió pnpm (recomendado).
   - **Estrategia de Docker en dev**: solo Postgres vs stack completo → eligió solo Postgres (recomendado, mejor DX).
   - **Repo remoto**: GitHub ahora vs solo local → eligió solo local + CI listo (recomendado, evita pausa por falta de `gh` CLI).
4. **Decisiones implícitas tomadas sin preguntar** (porque eran "default razonable"):
   - Tailwind v4 (default actual de `create-next-app`).
   - Estructura `src/` (consistente con el master plan).
   - Branch `main` (convención moderna).
   - Sin Husky/tests/PWA en 0a (fuera de alcance del master plan para este escalón).
5. **Pin de Node**: el host tenía Node 24 pero el master plan apunta a Node 22 LTS para producción. Resolución: `.nvmrc` con `22` + `engines.node: ">=22.0.0 <25"` para no obligar a downgradear localmente pero documentar el target.
6. **Granularidad de commits**: se eligió ~8 commits temáticos en lugar de uno único "bootstrap". Razón: el repo es material educativo, y ver la secuencia de commits ayuda a un lector futuro a entender el orden lógico de bootstrapping.
7. **Output de Prisma a `src/generated/prisma-client`**: detalle aparentemente menor pero deliberado — Prisma 5+ recomienda salir del `node_modules/.prisma` para que el código generado sea visible en el editor y versionable si hace falta.
8. **Regla Opus/Sonnet introducida durante este plan**: al revisar este sub-plan, el usuario pidió formalizar que la planeación se hace con Opus y la ejecución con Sonnet. La regla se documentó como sección dedicada en este plan, se agregó como paso 3.a (editar el master plan original antes de copiarlo al repo) y queda como convención de proyecto para todos los sub-planes futuros.

---

## Antes de ejecutar — checklist

- [ ] **Cambiar modelo a Sonnet** (`/model` → `Sonnet`). La planeación se hizo con Opus; la ejecución debe correr con Sonnet según la regla del workflow.
- [ ] Confirmar que `C:\src\puntajes-scout` sigue vacío (si no, frenar y revisar).
- [ ] Tener Docker Desktop corriendo antes del paso 6 (Compose).

---

## Commits asociados

(Se completarán durante la ejecución. Lista esperada, ~8 commits:)

1. `chore: inicio del proyecto puntajes-scout` (commit vacío inicial)
2. `chore: scaffold Next.js 15 + TypeScript + Tailwind con pnpm` (output de create-next-app)
3. `docs: agregar master plan y plan 0a al repo`
4. `chore: fijar versión de Node, editorconfig y scripts`
5. `chore: instalar Prisma con schema vacío`
6. `chore: agregar Docker Compose para Postgres dev y Caddyfile de prod`
7. `feat: layout base en español + mensajes centralizados`
8. `ci: agregar workflow básico (lint, typecheck, build)`
9. `docs: README raíz con instrucciones de dev`
