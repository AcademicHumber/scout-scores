# Plan 10 — Despliegue a producción + hardening

> **Nota de renumeración**: este plan se redactó originalmente como Plan 9. Tras la decisión de intercalar el Plan 9 (login con email y contraseña, complementando Google OAuth), el deploy pasó a Plan 10. Los subplanes deferidos (`10b`: off-VPS backups + Sentry, `10c`: CD desde GitHub Actions) reflejan el mismo corrimiento. Las referencias a "Plan 9" en planes históricos 01–08 se mantienen como reflejo del estado al momento de su escritura.

## Contexto

Plan 8 cerró el ciclo funcional de Capa 1: scoring offline del juez, leaderboard publicable y vista pública sin auth. Plan 9 sumó el login con email y contraseña. La aplicación funciona end-to-end en `pnpm dev` con un Postgres local en Docker. Lo que falta es **operacionalizar** el sistema: que un distrito real pueda usarlo en una jornada de competencia, con HTTPS, dominio propio, datos persistentes, backups y un mínimo de observabilidad.

Plan 10 entrega la infraestructura para que el sistema corra en un VPS Ubuntu 24.04 LTS (~$5/mes), accesible desde celulares por un dominio público con HTTPS automático, con backups diarios al disco del VPS y un workflow básico de CI que evita regresiones en cada PR. El deploy es manual (SSH + `git pull && docker compose up -d --build`); GitHub Actions solo valida (no despliega).

El plan **no toca** el dominio de la aplicación: ningún cambio en schema de DB, ninguna nueva entidad, ninguna ruta de feature. Toca infraestructura, configuración y operación.

## Alcance

### Incluye

- **Dockerfile multi-stage** para Next.js 15 + pnpm 10 + Node 22 LTS, con salida `standalone` de Next.js para imagen runtime mínima.
- **`docker-compose.prod.yml`** con tres servicios persistentes (`db`, `app`, `caddy`) y un servicio one-shot (`migrate`) que corre `prisma migrate deploy` antes de levantar `app`.
- **Caddyfile** ampliado: HTTPS automático con Let's Encrypt, security headers, gzip/zstd, log a stdout.
- **`.env.prod.example`** documentado con todas las env vars necesarias (sin valores reales).
- **Endpoint `/api/health`** que verifica conexión a DB y devuelve 200/503. Usado por el healthcheck de Compose.
- **Script `scripts/backup.sh`**: `pg_dump` comprimido con `gzip` a `/var/backups/puntajes-scout/`, retención de 30 archivos, log en `/var/log/puntajes-scout/backup.log`. Idempotente, ejecutable por cron.
- **Script `scripts/restore.sh`**: companion del anterior. Restaura el dump más reciente (o uno específico por argumento) a la DB.
- **Documentación operativa** (`docs/operaciones/01-deploy-vps.md`): paso a paso desde un VPS limpio hasta tener la app corriendo bajo un dominio HTTPS. Incluye configuración de Google OAuth con dominio real.
- **Workflow CI** (`.github/workflows/ci.yml`): corre `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` en cada PR a `main` y en pushes a `main`. No toca el VPS.
- **Cambios mínimos a `next.config.ts`**: agregar `output: "standalone"` y `outputFileTracingIncludes` para que el cliente Prisma generado quede dentro de la imagen runner.
- **Cambios mínimos a `.gitignore` y `.dockerignore`**: aislar `.env.prod`, `node_modules`, `.next`, `postgres-data`, etc.
- **`AUTH_TRUST_HOST=true`** y `NEXT_PUBLIC_BASE_URL` con el dominio real, documentados en el `.env.prod.example` y en la guía operativa.
- **Checklist de hardening**: headers HTTP, AUTH_SECRET con entropía, Postgres no expuesto al exterior, logs accesibles, env vars no commiteadas, firewall del VPS.

### No incluye

- **Backups off-VPS** (Backblaze B2, S3, etc.). Los backups quedan en el filesystem del VPS por decisión del usuario para esta iteración. Esto es un riesgo conocido (si se pierde el VPS, se pierden los backups) y queda explícitamente documentado como hardening pendiente para un Plan 10b.
- **Encriptación client-side de los dumps** (GPG). Mismo motivo: `pg_dump` queda en plano en el filesystem del VPS, accesible solo por el usuario root. Aceptable mientras los datos sean operativos del scoring (sin fichas médicas, que llegan en Capa 2 con Plan 12).
- **Despliegue automático desde GitHub Actions** (CD). El workflow solo valida (CI), no despliega. Deploy manual vía SSH. Diferido a un Plan 10c si el ritmo de releases lo justifica.
- **Registry privada** (ghcr.io, Docker Hub). La imagen se construye en el VPS al hacer deploy (`docker compose build`). Trade-off: build toma 1-2 minutos en el VPS, pero evita el setup de registry y secrets.
- **Sentry / monitoreo de errores**. Diferido a Plan 10b. Para Capa 1 el monitoreo es: logs de Caddy + logs de la app vía `docker compose logs`. Es suficiente para un MVP de un solo distrito.
- **Métricas de performance** (Prometheus, Grafana). Mismo argumento: overhead operacional alto vs valor en MVP. La verificación end-to-end (Escenario 10) cubre el SLA "<1s desde 4G" manualmente.
- **Multi-VPS / load balancer / CDN**. Un VPS único es suficiente para un distrito (decenas de usuarios concurrentes en el peak del evento). Cuando aparezca multi-distrito real, se evalúa.
- **Migraciones hacia atrás (down migrations)**. Prisma no las soporta nativamente. Estrategia de rollback documentada: usar tag de imagen anterior + restore de backup pre-migración. No se construye herramienta para `prisma migrate undo`.
- **Renovación automática de credenciales** (rotación de `AUTH_SECRET`, claves de Google OAuth). Quedan estáticas hasta que el operador rote a mano. Documentado.
- **Notificaciones operativas** (alertas de backup fallido, app caída, disco lleno). Diferido. Por ahora: el operador revisa `docker compose ps` y `tail -f /var/log/puntajes-scout/backup.log` periódicamente.

## Decisiones técnicas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| **`output` de Next.js** | `"standalone"` | La imagen runner final pesa ~150 MB en lugar de ~500 MB+ con `node_modules` completo. Arrancar el container baja de 8s a 2s. Standalone genera `server.js` y solo los `node_modules` traceados. Necesario para que un VPS de 1-2 GB de RAM aguante con margen. |
| **Migraciones en producción** | Servicio Compose one-shot `migrate` con `restart: "no"` que corre antes de `app` (vía `service_completed_successfully`) | Más visible que un entrypoint script (logs separados, exit code claro). Más atómico que correr a mano post-deploy (no se olvida). Más simple que un init container de Kubernetes (no estamos en K8s). El servicio reusa el stage `builder` del Dockerfile (que tiene Prisma CLI instalado), evitando construir una imagen separada. |
| **Imagen del migrator** | Mismo Dockerfile, target `builder` | Evita un Dockerfile separado. BuildKit cachea las layers compartidas (`deps` stage es compartido), así que el costo es cero después de la primera build. La imagen builder pesa más pero corre solo durante migraciones (segundos), no se mantiene activa. |
| **CI vs CD** | Solo CI (typecheck + lint + test + build); deploy manual | Confirmado por el usuario. Suma confianza (regresiones detectadas en PR) sin riesgo (no hay credenciales SSH ni tokens en GitHub). Cuando el ritmo de release amerite CD, se hace en Plan 10c. |
| **Backups: destino** | Filesystem del VPS (`/var/backups/puntajes-scout/`) con retención local de 30 días | Confirmado por el usuario para esta iteración. **Riesgo conocido y documentado**: si el VPS muere (delete accidental, incidente del proveedor, fallo de disco), se pierden los backups. Plan 10b agregará destino off-VPS. Mientras tanto, el operador puede rsync manualmente a una máquina propia si se acerca un evento crítico. |
| **Backups: cron** | `crontab` del usuario root del VPS, diario a las 03:00 local | Simple, sin dependencias adicionales. Logs de cron + log propio del script. Alternativa systemd-timers se evaluó: es overkill para una tarea diaria. |
| **Backups: formato** | `pg_dump --format=custom --compress=9` + sufijo `.dump` | Formato custom (binario) es más rápido para restore selectivo y soporta `--jobs` paralelo. Comprimido con `--compress=9` (zlib level 9), no se re-comprime con `gzip`. `pg_restore` lo lee directamente. Más eficiente que SQL plano + gzip. |
| **Reverse proxy** | Caddy (ya elegido en master plan) | HTTPS automático con Let's Encrypt sin scripting (`tls internal` para staging, automático para dominios reales). Configuración declarativa de 20 líneas vs nginx + certbot. Mantenimiento cero del cert. |
| **Healthcheck de `app`** | `GET /api/health` que pinga `prisma.$queryRaw\`SELECT 1\`` | Verifica que Node + Next + Prisma + DB estén vivos en una sola request. Endpoint tiene que ser público (no requiere auth) — agregar a `PUBLIC_PATHS` del middleware (lección Plan 8 #6). El healthcheck de Postgres ya existe vía `pg_isready`. |
| **Healthcheck de `caddy`** | Sin healthcheck explícito | Caddy se autoadministra; si crashea, `restart: unless-stopped` lo levanta. No hay endpoint estándar para chequear estado interno sin intrusión. |
| **Network de Compose** | Red interna `internal` para `db`/`app`/`migrate`; `caddy` también en `internal` y único con puertos publicados (80/443) | Postgres no expuesto al exterior. Solo Caddy ve la red pública. App y db se hablan por nombre de servicio (`db:5432`, `app:3000`) sin DNS público. |
| **Storage de Postgres** | Volumen named `postgres-data` (no bind mount) | Los volumes named son gestionados por Docker, sobreviven a `docker compose down` (no a `down -v`). Los bind mounts a `/var/lib/...` requieren UID matching y permissions. Para producción, named volume es la convención. |
| **Storage de certs Caddy** | Volumen named `caddy-data` + `caddy-config` | Caddy persiste certs y account de Let's Encrypt en `/data`. Sin esto, cada `docker compose up` regenera certs y se llega al rate limit de Let's Encrypt (5 por week por dominio) en pocos restarts. |
| **Engine de Postgres** | Postgres 16-alpine (mismo que dev) | Consistencia dev/prod. La imagen alpine pesa 80 MB vs 130 MB de la default. |
| **Versión de Node** | `node:22-alpine` (Node 22 LTS) | Master plan lo definió. Alpine reduce imagen. Caveat: musl en lugar de glibc puede fallar con algunos binarios nativos. `pg` y `@prisma/adapter-pg` son JS puro, sin issue. Si emerge problema, fallback a `node:22-slim` (debian-slim, glibc, ~60 MB más). |
| **Package manager en imagen** | Corepack + `pnpm@10.33.0` (pin del `packageManager` field de package.json) | Corepack viene con Node 22, no requiere `npm install -g pnpm`. La versión exacta se lee del `packageManager` field, evitando drift entre dev y prod. |
| **`prisma generate` en build** | Stage `builder` corre `pnpm prisma generate` después de `pnpm install` y antes de `pnpm build` | El cliente generado vive en `src/generated/prisma` (config del schema). Sin `generate`, el `tsc` del build falla con "module not found". |
| **`@prisma/adapter-pg` en runtime** | Incluido en el trace de standalone vía import directo desde `src/lib/db.ts` | Next.js trace lo detecta porque está importado. Si emergen warnings de "module not traced", agregar a `outputFileTracingIncludes`. |
| **Seed en producción** | **No correr.** El seed es para datos demo de dev | Documentado en la guía operativa. La org y el primer admin se crean vía el flujo de onboarding normal (login con Google → crear distrito). Si el operador necesita un dataset pre-cargado por algún motivo (testing, demo a stakeholder), corre `pnpm prisma db seed` manualmente, pero no por default. |
| **`AUTH_SECRET` en prod** | Generado con `openssl rand -base64 32` (32 bytes = 256 bits de entropía). Documentado en la guía | Auth.js requiere ≥32 bytes para HS256. `pnpm dlx auth secret` también funciona pero requiere conexión y descarga del paquete; `openssl` está siempre disponible en Ubuntu. |
| **Headers de seguridad** | Definidos en `Caddyfile` con `header` directive — `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (y CSP relajada documentada como "ajustar después") | Caddy ya termina TLS, así que es el lugar correcto. Centralizar en Caddyfile evita duplicar entre Next.js y proxy. CSP estricta requiere auditoría de los inline scripts de Next.js (RSC, hydration); se difiere para no romper la app sin un ciclo de testing dedicado. |
| **Rate limiting** | No incluido en Plan 10 | Caddy soporta rate limiting solo vía plugin externo (`caddy-rate-limit`), que requiere build custom de Caddy. Para el tráfico esperado (decenas de usuarios concurrentes durante eventos esporádicos), no es prioritario. Postgres + Auth.js absorben el abuso de login. Si emerge tráfico hostil, se evalúa fail2ban a nivel host o Cloudflare gratis frente a Caddy. |
| **Logs** | `docker compose logs -f` durante operación; rotación gestionada por Docker (`max-size=10m, max-file=3` en compose) | Sin agregar stack de logging dedicado (Loki, ELK). Para un VPS único de un MVP, `docker compose logs --tail=200 app` es suficiente. Rotación automática de Docker evita que los logs llenen el disco. |
| **CI: cuándo correr** | En cada `push` a `main` y en cada PR contra `main` | Cubre el flujo del proyecto: trabajo en branch → PR → merge a main. No corre en otros branches sin PR (ahorra minutos del free tier). |
| **CI: matriz de Node** | Solo Node 22 (LTS, target del `engines`) | Probar en multi-version es overhead sin valor: producción corre Node 22. Si se decide upgradar a 24 después, se cambia el matrix. |
| **CI: cache de pnpm** | `actions/setup-node@v4` con `cache: 'pnpm'` | Ahorra ~30s por job. Estándar. |
| **CI: DB para tests** | Service container Postgres 16-alpine en el job | Los tests del Plan 8 (`leaderboard.repo.test.ts`, `public-share-link.repo.test.ts`) requieren Postgres real (no mocks). El service container es la forma estándar de levantar uno por job. |

### Por qué backups locales por ahora

El usuario decidió mantener los backups en el filesystem del VPS por simplicidad operativa: sin cuenta B2, sin claves API, sin segunda dependencia que pueda fallar. Esto es defendible para un MVP donde:

- El sistema corre principalmente durante eventos puntuales (jornadas de scoring); fuera de evento, la pérdida potencial es de configuración y datos históricos pero no operativos en curso.
- El operador puede `scp` el directorio de backups a una máquina propia antes/después de un evento crítico.
- La superficie de fallo a controlar es menor (un solo lugar donde mirar).

**Riesgos a aceptar conscientemente**:
1. Si el VPS muere (incidente del proveedor, eliminación accidental, ataque), se pierde la DB y los backups simultáneamente.
2. Snapshots del proveedor (Hetzner/DO ofrecen ~$1/mes por snapshot semanal) son una mitigación parcial barata pero opcional.
3. Plan 10b agregará off-VPS sync (rclone o restic a B2/Storj/etc.) cuando el operador lo priorice.

Esta decisión queda visible en este plan y en `docs/operaciones/01-deploy-vps.md` para que cualquier operador futuro entienda el trade-off.

## Pre-requisitos para ejecutar el plan

El operador (humano que despliega) debe tener:

1. **VPS Ubuntu 24.04 LTS** con acceso SSH y privilegios sudo. Mínimo recomendado: 2 vCPU, 2 GB RAM, 40 GB disco (Hetzner CX22 / DO Basic Droplet $6/mes / Oracle Free Tier "Always Free" cubre).
2. **Dominio propio** (~$10/año en Namecheap, Porkbun, etc.) con permiso de editar registros DNS.
3. **Cuenta de Google Cloud Console** para crear el OAuth client (gratis).
4. **Docker Engine + Docker Compose v2 instalados** en el VPS. Para Ubuntu 24.04: `curl -fsSL https://get.docker.com | sh` (instala ambos). El usuario ejecutor debe estar en el grupo `docker` o usar `sudo`.
5. **Repositorio del proyecto cloneable**: el VPS debe poder hacer `git clone https://github.com/<org>/puntajes-scout.git`. Si el repo es privado, deploy key SSH agregada al VPS.

No se asume conocimiento previo de Caddy, Postgres en Docker o Compose. La guía operativa explica los comandos.

## Implementación

Pasos en orden de dependencia. Cada paso debería dejar `pnpm typecheck && pnpm build` limpio antes del siguiente (en local, no en VPS).

### 1. `next.config.ts`: standalone + tracing

Editar `next.config.ts`:

```ts
import type { NextConfig } from "next"
import withSerwist from "@serwist/next"

const nextConfig: NextConfig = {
  output: "standalone",
  // El cliente Prisma generado vive en src/generated/prisma. Next trace lo
  // detecta como código de la app, pero sus archivos auxiliares (engine
  // schema, runtime helpers) pueden no entrar en el trace. Forzar inclusión.
  outputFileTracingIncludes: {
    "/*": ["./src/generated/prisma/**/*"],
  },
}

export default process.env.NODE_ENV === "development"
  ? nextConfig
  : withSerwist({
      swSrc: "src/app/sw.ts",
      swDest: "public/sw.js",
    })(nextConfig)
```

Validar con `pnpm build`. El output debe imprimir `λ /standalone` o equivalente y crear `.next/standalone/server.js`.

### 2. Endpoint `/api/health`

Crear `src/app/api/health/route.ts`:

```ts
import { prisma } from "@/lib/db"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok" }, { status: 200 })
  } catch (error) {
    console.error("[health] DB check failed", error)
    return NextResponse.json({ status: "error" }, { status: 503 })
  }
}
```

Agregar `/api/health` a `PUBLIC_PATHS` en `src/auth.config.ts` (lección Plan 8 #6: el middleware redirige a `/login` por default si no está listada).

### 3. `Dockerfile`

Crear `Dockerfile` en la raíz del repo:

```dockerfile
# syntax=docker/dockerfile:1.7

# ----------------------------------------------------------------------------
# Stage: deps — instala node_modules con pnpm. Cacheable mientras no cambie
# pnpm-lock.yaml ni package.json.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# Corepack viene con Node 22; pin a la version del packageManager field.
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Solo lockfile + manifest para maximizar cache.
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ----------------------------------------------------------------------------
# Stage: builder — copia el source completo, genera Prisma client y construye
# la app de Next con output standalone. Esta stage también la usa el servicio
# `migrate` para correr `prisma migrate deploy` (tiene Prisma CLI instalado).
# ----------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Reusar node_modules del stage deps.
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generar el cliente Prisma. El output va a src/generated/prisma según schema.
RUN pnpm prisma generate

# DATABASE_URL no es necesaria en build (no se ejecuta SQL durante next build),
# pero algunos imports a runtime config la pueden requerir. Pasar dummy si falla.
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ----------------------------------------------------------------------------
# Stage: runner — imagen final mínima. Solo lo que server.js necesita.
# ----------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Usuario no-root para correr la app.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 --ingroup nodejs nextjs

# Standalone produce server.js + node_modules tracados en .next/standalone/.
# public/ y .next/static/ no se copian automáticamente — hay que hacerlo a mano.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs

EXPOSE 3000

# Healthcheck Docker-nativo (compose lo usa también).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget --quiet --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
```

Notas:
- BuildKit (Docker 23+) interpreta la línea `# syntax=...`. Compose builds usan BuildKit por default desde 2022.
- Si la imagen final pesa >300 MB, revisar que `output: "standalone"` esté activo y que `.dockerignore` (siguiente paso) excluya `node_modules` del contexto.
- El `wget` viene en `node:22-alpine` por default (paquete `wget` está en el base image alpine).

### 4. `.dockerignore`

Crear `.dockerignore` en la raíz:

```gitignore
# Build artifacts
.next
out
build
dist
.turbo

# Deps (se reinstalan en el container)
node_modules
.pnpm-store

# Env y secretos (NUNCA en imagen)
.env
.env.*
!.env.example

# Generado por Prisma (se regenera en el container)
src/generated

# Local DB y volumenes
postgres-data
.docker

# Editor / OS
.vscode
.idea
.DS_Store
Thumbs.db

# Git y CI
.git
.github
.claude

# Tests / coverage
coverage
.vitest

# Documentación (no aporta a imagen)
docs

# Scripts de operación (corren en el host, no en el container)
scripts
```

Validar: `docker build -t puntajes-scout-test .` debería completar sin copiar `node_modules` ni `docs/`.

### 5. `docker-compose.prod.yml`

Crear `docker-compose.prod.yml` en la raíz:

```yaml
name: puntajes-scout

services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  migrate:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder
    command: ["pnpm", "prisma", "migrate", "deploy"]
    environment:
      DATABASE_URL: ${DATABASE_URL}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - internal
    restart: "no"

  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: runner
    restart: unless-stopped
    environment:
      DATABASE_URL: ${DATABASE_URL}
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_GOOGLE_ID: ${AUTH_GOOGLE_ID}
      AUTH_GOOGLE_SECRET: ${AUTH_GOOGLE_SECRET}
      AUTH_TRUST_HOST: ${AUTH_TRUST_HOST}
      NEXT_PUBLIC_BASE_URL: ${NEXT_PUBLIC_BASE_URL}
    depends_on:
      db:
        condition: service_healthy
      migrate:
        condition: service_completed_successfully
    networks:
      - internal
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--spider", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
      - "443:443/udp"  # HTTP/3 (QUIC)
    environment:
      APP_DOMAIN: ${APP_DOMAIN}
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
      - caddy-config:/config
    networks:
      - internal
    depends_on:
      app:
        condition: service_healthy
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

volumes:
  postgres-data:
  caddy-data:
  caddy-config:

networks:
  internal:
    driver: bridge
```

Notas:
- `name: puntajes-scout` fija el project name; sin esto, Compose lo deriva del directorio (ruido si el operador clona en distintos paths).
- El servicio `migrate` reusa el stage `builder` del Dockerfile — más rápido que mantener un Dockerfile separado, y BuildKit comparte layers.
- **Postgres no expone puertos al host** (sin `ports:` clave). Solo `caddy` está expuesto. Validable con `docker compose -f docker-compose.prod.yml ps`: solo `caddy` debe aparecer con port mapping.
- `depends_on` con `service_completed_successfully` requiere Compose v2.1+. Verificar con `docker compose version`.
- Healthcheck de `app` usa el endpoint creado en paso 2.

### 6. `Caddyfile` (actualización)

Reemplazar el `Caddyfile` actual con:

```Caddyfile
{
    # Email para Let's Encrypt (registro de cuenta + notificaciones de cert).
    email {$ACME_EMAIL}
}

{$APP_DOMAIN} {
    encode gzip zstd

    # --- Headers de seguridad ---
    header {
        # HSTS: forzar HTTPS por 1 año, incluyendo subdominios. Borrar
        # `preload` si todavía no se sometió el dominio a la lista de HSTS preload.
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        # Evita que el browser adivine MIME types.
        X-Content-Type-Options "nosniff"
        # Solo enviar Referer al mismo origen.
        Referrer-Policy "strict-origin-when-cross-origin"
        # Bloquear APIs sensibles que la app no usa.
        Permissions-Policy "camera=(), microphone=(), geolocation=(), interest-cohort=()"
        # Quitar el header Server por defecto.
        -Server
    }

    # --- Reverse proxy a la app ---
    reverse_proxy app:3000 {
        # Pasar IP real al backend (Auth.js / logs).
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-Proto {scheme}
    }

    # --- Logs en formato JSON a stdout ---
    log {
        output stdout
        format json
        level INFO
    }
}

# Redirección www → apex (opcional; activar si el operador registra ambos).
# www.{$APP_DOMAIN} {
#     redir https://{$APP_DOMAIN}{uri} permanent
# }
```

Notas:
- `email` es requerido por Let's Encrypt para emisión de cert. Documentado en `.env.prod.example`.
- `tls internal` no se usa: con un dominio público real, Caddy obtiene cert de Let's Encrypt automáticamente.
- CSP no se incluye: requiere auditoría dedicada de los inline scripts de Next.js (RSC, hydration, Auth.js). Documentado en hardening pendiente.
- HTTP/3 vía UDP/443: Caddy lo activa por default si el container expone el puerto.

### 7. `.env.prod.example`

Crear `.env.prod.example` en la raíz:

```bash
# ============================================================================
#  Variables de entorno — PRODUCCIÓN
# ============================================================================
# Copiar este archivo a `.env.prod` en el VPS y rellenar valores reales.
# `.env.prod` está en .gitignore y NUNCA debe commitearse.
# Compose carga este archivo automáticamente con: --env-file .env.prod

# --- Postgres ---
POSTGRES_USER=scout
POSTGRES_PASSWORD=         # Generar con: openssl rand -base64 24
POSTGRES_DB=puntajes_scout

# --- Cadena de conexión a Postgres (la consume la app y `migrate`) ---
# El host `db` resuelve dentro de la red interna de Compose.
DATABASE_URL=postgresql://scout:CAMBIAR@db:5432/puntajes_scout

# --- Auth.js ---
# Generar con: openssl rand -base64 32  (al menos 32 bytes)
AUTH_SECRET=
AUTH_TRUST_HOST=true

# --- Google OAuth (console.cloud.google.com) ---
# Authorized redirect URI a configurar en Google: https://TU_DOMINIO/api/auth/callback/google
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# --- URL pública del sistema ---
# Usada para construir URLs absolutas (links del leaderboard, etc).
NEXT_PUBLIC_BASE_URL=https://tu-dominio.org

# --- Caddy ---
# Dominio del sistema (sin protocolo, sin slash).
APP_DOMAIN=tu-dominio.org
# Email para Let's Encrypt (recibe alertas si la renovación falla).
ACME_EMAIL=admin@tu-dominio.org
```

`.gitignore` ya contiene `.env*` con excepción de `.env.example`. Verificar que también excluye `.env.prod`. (Lo hace; el patrón `.env*` cubre.)

### 8. `scripts/backup.sh`

Crear `scripts/backup.sh`:

```bash
#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Backup diario de Postgres a /var/backups/puntajes-scout/.
# Idempotente. Pensado para correr por cron como root.
#
# Uso:
#   ./scripts/backup.sh                   # backup nuevo + rotación
#   ./scripts/backup.sh --no-rotate       # backup sin tocar viejos
#
# Requiere: docker, docker compose v2, .env.prod con DATABASE_URL en el
# directorio del proyecto (donde vive docker-compose.prod.yml).
# ----------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/puntajes-scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puntajes-scout}"
LOG_FILE="${LOG_FILE:-/var/log/puntajes-scout/backup.log}"
RETENTION_COUNT="${RETENTION_COUNT:-30}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[$ts] $*" | tee -a "$LOG_FILE"
}

cd "$PROJECT_DIR"

# Cargar POSTGRES_USER y POSTGRES_DB del .env.prod (resto se ignora).
set -a
# shellcheck disable=SC1091
source ./.env.prod
set +a

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE="$BACKUP_DIR/puntajes_scout_${TIMESTAMP}.dump"

log "INICIO backup → $DUMP_FILE"

# pg_dump corre dentro del container `db`. --format=custom es comprimido y
# compatible con pg_restore. --jobs requiere directorio (lo evitamos).
if docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_dump \
        --username="$POSTGRES_USER" \
        --dbname="$POSTGRES_DB" \
        --format=custom \
        --compress=9 \
        --no-owner \
        --no-acl \
    > "$DUMP_FILE"; then
    SIZE=$(du -h "$DUMP_FILE" | cut -f1)
    log "OK backup completado ($SIZE)"
else
    log "FALLO pg_dump exit=$?"
    rm -f "$DUMP_FILE"
    exit 1
fi

# Rotación: mantener los $RETENTION_COUNT más recientes.
if [[ "${1:-}" != "--no-rotate" ]]; then
    REMOVED=$(find "$BACKUP_DIR" -maxdepth 1 -name 'puntajes_scout_*.dump' \
        -printf '%T@ %p\n' \
        | sort -nr \
        | tail -n +$((RETENTION_COUNT + 1)) \
        | cut -d' ' -f2-)

    if [[ -n "$REMOVED" ]]; then
        echo "$REMOVED" | xargs rm -v -- 2>&1 | tee -a "$LOG_FILE"
        log "Rotación: eliminados $(echo "$REMOVED" | wc -l) archivos (retención=$RETENTION_COUNT)"
    fi
fi

log "FIN backup OK"
```

Hacer ejecutable: `chmod +x scripts/backup.sh`. (En el VPS; el bit ejecutable se preserva en git si se commitea con `git update-index --chmod=+x scripts/backup.sh`.)

Cron entry (a configurar en el VPS, no en el repo):

```cron
0 3 * * * /srv/puntajes-scout/scripts/backup.sh >> /var/log/puntajes-scout/cron.log 2>&1
```

### 9. `scripts/restore.sh`

Crear `scripts/restore.sh`:

```bash
#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Restaura un dump de Postgres en la DB del compose de producción.
#
# Uso:
#   ./scripts/restore.sh                    # restaura el dump más reciente
#   ./scripts/restore.sh /ruta/al/dump      # restaura un dump específico
#
# CUIDADO: dropea todas las conexiones activas y reemplaza la DB existente.
# Pedir confirmación interactiva siempre.
# ----------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/puntajes-scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puntajes-scout}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$PROJECT_DIR"
set -a
# shellcheck disable=SC1091
source ./.env.prod
set +a

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" ]]; then
    DUMP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name 'puntajes_scout_*.dump' \
        -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
fi

if [[ ! -f "$DUMP_FILE" ]]; then
    echo "ERROR: dump no encontrado: $DUMP_FILE" >&2
    exit 1
fi

echo "Restaurando: $DUMP_FILE"
echo "Hacia: $POSTGRES_DB en el container 'db'"
read -r -p "¿Continuar? Esto sobreescribe la DB actual [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Abortado."
    exit 0
fi

# Pasar el dump por stdin a pg_restore en el container.
# --clean dropea objetos antes de recrear; --if-exists evita error si no existen.
docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_restore \
        --username="$POSTGRES_USER" \
        --dbname="$POSTGRES_DB" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        --verbose \
    < "$DUMP_FILE"

echo "OK restore completado."
echo "Recordá: si el dump es de antes de una migración aplicada, re-correr 'docker compose up -d migrate'."
```

Hacer ejecutable.

### 10. Workflow CI: `.github/workflows/ci.yml`

Crear `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    name: typecheck + lint + test + build
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: scout
          POSTGRES_PASSWORD: scout_ci_password
          POSTGRES_DB: puntajes_scout_ci
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U scout -d puntajes_scout_ci"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5

    env:
      DATABASE_URL: postgresql://scout:scout_ci_password@localhost:5432/puntajes_scout_ci
      AUTH_SECRET: ci-secret-not-used-but-required-for-build
      AUTH_TRUST_HOST: "true"
      NEXT_PUBLIC_BASE_URL: http://localhost:3000

    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Generate Prisma client
        run: pnpm prisma generate

      - name: Apply migrations to CI database
        run: pnpm prisma migrate deploy

      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
```

Notas:
- Las env vars del job permiten correr `pnpm build` sin warnings de variables faltantes.
- El service container Postgres permite que los tests del Plan 8 (que requieren DB real) corran sin mocks.
- Si `pnpm prisma migrate deploy` falla por estado inicial vacío, agregar `pnpm prisma migrate reset --force --skip-seed` antes (asume DB limpia, que es el caso del service container).

### 11. Documentación operativa: `docs/operaciones/01-deploy-vps.md`

Crear `docs/operaciones/01-deploy-vps.md`. Es la guía paso-a-paso que el operador sigue desde un VPS limpio.

Estructura del documento (contenido detallado abajo en sección "Setup en VPS desde cero"):

```markdown
# Deploy a VPS — Guía operativa

## 1. Pre-requisitos
## 2. Aprovisionar el VPS
## 3. Configurar dominio y DNS
## 4. Instalar Docker
## 5. Crear Google OAuth client
## 6. Clonar y configurar el proyecto
## 7. Generar secretos
## 8. Primera build y arranque
## 9. Verificar HTTPS y Google OAuth
## 10. Configurar backups por cron
## 11. Updates posteriores (deploy de nueva versión)
## 12. Troubleshooting
## 13. Hardening pendiente (Plan 10b)
```

(Ver sección detallada abajo.)

### 12. Modificaciones menores

- `.gitignore`: ya cubre `.env*`. Verificar que `.env.prod` y `.env.prod.local` no aparezcan en `git status` después de crearlos.
- `src/auth.config.ts`: agregar `"/api/health"` a `PUBLIC_PATHS`.
- `src/messages/es.json`: no se tocan strings — Plan 10 no toca UI.
- README.md (raíz del repo): agregar sección "Deploy a producción" con link a `docs/operaciones/01-deploy-vps.md`.

## Archivos críticos

**Nuevos**:

- `Dockerfile`
- `.dockerignore`
- `docker-compose.prod.yml`
- `.env.prod.example`
- `scripts/backup.sh` (ejecutable)
- `scripts/restore.sh` (ejecutable)
- `src/app/api/health/route.ts`
- `.github/workflows/ci.yml`
- `docs/operaciones/01-deploy-vps.md`

**Modificados**:

- `next.config.ts` — `output: "standalone"` + `outputFileTracingIncludes`.
- `Caddyfile` — security headers, log JSON, comentarios.
- `src/auth.config.ts` — `/api/health` en `PUBLIC_PATHS`.
- `README.md` — sección "Deploy a producción" con link a guía operativa.
- `docs/README.md` — agregar Plan 10 al índice (probablemente ya esté el placeholder).

**Sin cambios**:

- Schema Prisma.
- Cualquier server action / repo / componente del dominio.
- Service worker.
- Auth.js callbacks.
- API routes del juez (`/api/juez/*`).

**Documentación nueva**:

- `docs/operaciones/01-deploy-vps.md` (guía paso-a-paso).
- ADR opcional: `docs/adr/0006-deploy-y-ops-mvp.md` si las decisiones de "backups locales por ahora", "no CD", "sin Sentry en MVP" merecen registro formal. Probable: sí.

## Setup en VPS desde cero (referencia para `docs/operaciones/01-deploy-vps.md`)

Esta sección es el contenido base que va a la guía operativa. Comandos concretos para Ubuntu 24.04 LTS.

### 2. Aprovisionar el VPS

Cualquier proveedor sirve. Recomendaciones por costo:
- **Hetzner CX22** (€4.50/mes): 2 vCPU AMD, 4 GB RAM, 40 GB SSD, 20 TB tráfico. Mejor relación precio/recursos.
- **DigitalOcean Basic Droplet** ($6/mes): 1 vCPU, 1 GB RAM, 25 GB SSD. Suficiente para empezar pero con menos margen.
- **Oracle Free Tier "Always Free"** ($0): 4 vCPU ARM, 24 GB RAM (compartidos entre instancias). Gratis pero ARM agrega fricciones (algunas imágenes Docker no tienen variant arm64).

Crear instancia con Ubuntu 24.04 LTS, agregar SSH key. Nota la IP pública.

### 3. Configurar DNS

En el panel de DNS del registrador (Namecheap, Porkbun, Cloudflare, etc.), crear:
- Registro A: `tu-dominio.org` → IP del VPS.
- Opcional: registro A para `www.tu-dominio.org` con la misma IP (Caddyfile tiene la redirección comentada).

Esperar propagación (5-30 min). Validar con `dig +short tu-dominio.org`.

### 4. Instalar Docker

SSH al VPS:

```bash
ssh root@IP_DEL_VPS
```

Instalar Docker Engine y Compose v2:

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version  # debe ser >= 2.20
```

Crear usuario no-root para operación (opcional pero recomendado):

```bash
adduser scout
usermod -aG docker scout
usermod -aG sudo scout
```

Configurar firewall básico (UFW viene en Ubuntu):

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (Caddy)
ufw allow 443/tcp    # HTTPS (Caddy)
ufw allow 443/udp    # HTTP/3 / QUIC
ufw enable
ufw status
```

Postgres no se expone (no se abre 5432). Validable: `ss -tlnp | grep 5432` debe estar vacío después del deploy.

### 5. Crear Google OAuth client

1. Ir a https://console.cloud.google.com/apis/credentials.
2. Crear proyecto si no existe (ej: "puntajes-scout-prod").
3. Configurar OAuth consent screen: tipo "External", scopes mínimos (`email`, `profile`, `openid`). Publicar (modo "In production") para evitar el cap de 100 testers.
4. Crear "OAuth 2.0 Client ID" → tipo "Web application".
5. Authorized redirect URI: `https://tu-dominio.org/api/auth/callback/google` (exacto, sin slash final).
6. Copiar Client ID y Client Secret.

### 6. Clonar y configurar el proyecto

```bash
sudo mkdir -p /srv/puntajes-scout
sudo chown $USER:$USER /srv/puntajes-scout
git clone https://github.com/<org>/puntajes-scout.git /srv/puntajes-scout
cd /srv/puntajes-scout
```

Crear `.env.prod`:

```bash
cp .env.prod.example .env.prod
chmod 600 .env.prod
```

Editar `.env.prod` con los valores reales (siguiente paso para los secretos).

### 7. Generar secretos

```bash
# AUTH_SECRET
openssl rand -base64 32

# POSTGRES_PASSWORD
openssl rand -base64 24
```

Pegar los valores en `.env.prod`. Construir el `DATABASE_URL` con el password generado:

```
DATABASE_URL=postgresql://scout:<PASSWORD>@db:5432/puntajes_scout
```

Pegar `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` desde Google Console. Setear `APP_DOMAIN`, `ACME_EMAIL`, `NEXT_PUBLIC_BASE_URL`.

### 8. Primera build y arranque

```bash
cd /srv/puntajes-scout
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Seguir los logs:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f
```

Esperar a ver:
- `db` → `database system is ready to accept connections`
- `migrate` → `All migrations have been successfully applied.` y exit 0
- `app` → `Ready in ...ms`
- `caddy` → `serving initial configuration` y certificado emitido por Let's Encrypt (mensaje `certificate obtained successfully`)

Verificar:

```bash
curl -I https://tu-dominio.org/api/health
# Debería devolver 200 OK con header HSTS
```

### 9. Verificar HTTPS y login

Abrir `https://tu-dominio.org` en el navegador. Click "Iniciar sesión con Google" → flujo Google → vuelta al onboarding del distrito. Si falla:
- "redirect_uri_mismatch" → revisar URI exacta en Google Console (debe ser `https://tu-dominio.org/api/auth/callback/google`).
- "Untrusted Host" → confirmar `AUTH_TRUST_HOST=true` en `.env.prod` y restart de `app`.

### 10. Configurar backups por cron

```bash
sudo crontab -e
# Agregar al final:
0 3 * * * /srv/puntajes-scout/scripts/backup.sh >> /var/log/puntajes-scout/cron.log 2>&1
```

Probar manualmente:

```bash
sudo /srv/puntajes-scout/scripts/backup.sh
ls -lh /var/backups/puntajes-scout/
tail /var/log/puntajes-scout/backup.log
```

### 11. Updates posteriores (nueva versión de la app)

Workflow manual:

```bash
cd /srv/puntajes-scout
git pull origin main
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
# El servicio `migrate` corre automáticamente si hay migraciones nuevas.
```

Si la build falla, los containers viejos siguen corriendo (Compose no los reemplaza hasta que la imagen nueva esté lista). Si el `migrate` falla, `app` no se actualiza (depends_on con `service_completed_successfully`).

### 12. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `caddy` no obtiene cert | DNS no propagado / puerto 80 cerrado | Verificar `dig` y `ufw status`. Esperar y reintentar. |
| `app` se reinicia en loop | Falla healthcheck | `docker compose logs app` — buscar el error real. Verificar que `/api/health` esté en `PUBLIC_PATHS`. |
| `migrate` falla con "Migration failed" | Schema drift entre repo y DB | `docker compose exec migrate pnpm prisma migrate status`. Resolver según el output. Posible necesidad de restore de backup. |
| Login con Google da "Configuration error" | `AUTH_SECRET` faltante o muy corto | Regenerar con `openssl rand -base64 32`. Restart `app`. |
| `/resultados/[token]` redirige a /login | Token revocado, o `/resultados` no en `PUBLIC_PATHS` | Verificar `auth.config.ts` (lección Plan 8 #6). |
| Disco lleno | Logs de Docker / dumps acumulados | `docker system prune -a`; revisar `RETENTION_COUNT` del backup. |

### 13. Hardening pendiente (futuras iteraciones)

Documentado para que un operador futuro priorice según necesidad:

- **Backups off-VPS** (Plan 10b): rclone a Backblaze B2 / Storj / Wasabi. ~$0.005/GB/mes.
- **Encriptación de backups** (Plan 10b): GPG client-side antes de subir, especialmente cuando llegue Capa 2 con datos médicos.
- **Sentry / monitoreo de errores** (Plan 10b): Sentry cloud free tier (5K errors/mes) o GlitchTip self-hosted en otro VPS.
- **CD desde GitHub Actions** (Plan 10c): cuando el ritmo de release lo amerite.
- **CSP estricta** en Caddy: requiere auditoría de inline scripts de Next.js.
- **Rate limiting** (fail2ban a nivel host o Caddy con plugin custom).
- **Snapshots del proveedor**: Hetzner/DO ofrecen snapshots semanales por ~$1/mes. Mitigación parcial barata del riesgo de pérdida del VPS.
- **Rotación de secretos**: documentar cadencia (AUTH_SECRET cada 6-12 meses, OAuth secrets si se sospecha leak).

## Verificación

### Entornos requeridos

| Escenario | Entorno | Razón |
|---|---|---|
| 1 — Build local exitoso | `docker build .` en máquina dev | Detectar problemas de Dockerfile sin tocar VPS |
| 2 — Compose local exitoso | `docker compose -f docker-compose.prod.yml up` con `.env.prod` dummy | Detectar problemas de orquestación localmente |
| 3 — Deploy desde cero en VPS | VPS Ubuntu 24.04 limpio | Verificación end-to-end real |
| 4 — Backup y restore | VPS con sistema corriendo | Validar el ciclo de DR |
| 5 — Renovación de cert | VPS con cert emitido | Caddy lo hace automático; verificar logs |
| 6 — Crash y autorestart | VPS | `restart: unless-stopped` funciona |
| 7 — Migración nueva en deploy | VPS + branch con migración nueva | El servicio `migrate` la aplica |
| 8 — Rollback | VPS | Estrategia de vuelta atrás funciona |
| 9 — Login Google en dominio real | VPS con HTTPS | OAuth completo |
| 10 — SW del juez offline en prod | VPS + browser mobile | El SW del Plan 7 sigue funcionando |
| 11 — Performance TTFB | VPS desde 4G | <1s según master plan |
| 12 — Headers de seguridad | VPS, `curl -I` | HSTS y demás presentes |
| 13 — Postgres no expuesto | VPS, escaneo de puertos externo | Solo 80/443 abiertos |
| 14 — CI bloquea PR con regresión | GitHub | Workflow falla y bloquea merge |

---

### Escenario 1 — Build local del Dockerfile

**Pasos**:
1. En máquina dev (Windows con Docker Desktop o Linux), `cd C:\src\puntajes-scout`.
2. `docker build -t puntajes-scout-test .`

**Qué verificar**:
- Build completa sin errores.
- Output muestra los stages `deps`, `builder`, `runner`.
- Imagen final pesa <250 MB: `docker image ls puntajes-scout-test`.
- Si pesa más, revisar `.dockerignore` (no debe colarse `node_modules` ni `docs/`).

---

### Escenario 2 — Compose local con `.env.prod` dummy

**Pasos**:
1. Crear `.env.prod.local` (no commiteado) con valores dummy: `APP_DOMAIN=localhost`, `AUTH_SECRET=$(openssl rand -base64 32)`, etc.
2. `docker compose --env-file .env.prod.local -f docker-compose.prod.yml up`.

**Qué verificar**:
- `db` arranca y pasa healthcheck.
- `migrate` corre y exit 0.
- `app` arranca, healthcheck pasa.
- `caddy` arranca pero falla al obtener cert (esperado en `localhost` sin DNS público; ignorar).
- `curl -I http://localhost/api/health` (vía Caddy en HTTP) → 200.

Trade-off del escenario: Caddy requiere TLS por default. Para test local podemos agregar `:80` antes del bloque del dominio temporalmente, o usar `tls internal` con CA local. Documentar en la guía operativa que el escenario 2 es opcional y el escenario 3 (VPS real) es el de verdad.

---

### Escenario 3 — Deploy desde cero en VPS limpio

**Pasos**:
1. Aprovisionar VPS Ubuntu 24.04 LTS.
2. Apuntar dominio (registro A en DNS).
3. Seguir literalmente los pasos 4-9 de `docs/operaciones/01-deploy-vps.md`.

**Qué verificar**:
- `docker compose ps` muestra `db`, `app`, `caddy` como `running (healthy)`.
- `docker compose logs migrate` muestra "All migrations have been successfully applied."
- `https://tu-dominio.org/api/health` devuelve 200.
- `https://tu-dominio.org/login` carga la página de login con el botón de Google.
- Login con Google completo → onboarding → dashboard.
- Crear un evento mínimo end-to-end (un grupo scout, una patrulla, una posta, una plantilla, cargar planilla, publicar) → ver leaderboard público en `https://tu-dominio.org/resultados/[token]`.

Tiempo esperado: 30-45 minutos desde VPS limpio hasta sistema funcional con el primer login.

---

### Escenario 4 — Backup y restore

**Pasos**:
1. En VPS con sistema corriendo y al menos un evento publicado.
2. `sudo /srv/puntajes-scout/scripts/backup.sh`.
3. Validar: `ls -lh /var/backups/puntajes-scout/` muestra el dump nuevo.
4. Validar: `tail /var/log/puntajes-scout/backup.log` muestra `INICIO` y `FIN backup OK`.
5. Test de restore: en otro entorno (preferiblemente otra DB/contenedor temporal, NO la prod activa), correr `pg_restore` sobre el dump y verificar que las tablas tienen filas.

**Qué verificar**:
- El archivo `.dump` existe y pesa coherente con el tamaño de la DB (cientos de KB para una DB con datos demo).
- El log es legible y termina en éxito.
- La rotación funciona: correr el script 32 veces y validar que solo quedan los 30 más nuevos.

Caveat de la rotación 32 veces: en práctica no se hace en verificación. Confiar en el código y validar con un `RETENTION_COUNT=2` temporal corriendo el script 4 veces.

---

### Escenario 5 — Renovación automática de cert Caddy

**Pasos**:
1. Sistema corriendo con cert válido.
2. Comprobar fecha de expiración: `curl -vI https://tu-dominio.org 2>&1 | grep -E "expire|valid"`.
3. Esperar a la renovación natural (Caddy renueva ~30 días antes del vencimiento).
4. Alternativamente, forzar: `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile` no fuerza renovación; mejor borrar el cert y reiniciar (destructivo, no hacer en prod).

**Qué verificar**:
- En logs de Caddy: `certificate obtained successfully` periódicamente.
- Cert nunca llega a expirar (alarma del operador si pasa: revisar logs de Caddy).

Verificación práctica: confiar en Caddy. Caddy lleva años haciendo esto bien. Documentar en troubleshooting el comando para forzar renovación si emerge problema.

---

### Escenario 6 — Crash y autorestart

**Pasos**:
1. Sistema corriendo.
2. `docker compose kill app` (mata el container abruptamente).
3. Esperar 5-10 segundos.
4. `docker compose ps`.

**Qué verificar**:
- `app` aparece como `running` nuevamente.
- `docker compose logs app | head -20` muestra el restart.
- `https://tu-dominio.org/api/health` responde 200 después del start_period (~20s).

Mismo escenario para `db`: matarlo, esperar, validar reaparición. **No matar `caddy` en producción** sin razón — los volúmenes persisten cert pero un restart innecesario es ruido.

---

### Escenario 7 — Migración nueva en deploy

**Pasos**:
1. Branch nueva con una migración trivial (ej: agregar columna nullable a una tabla menor).
2. PR → merge a `main`.
3. CI pasa (Escenario 14).
4. En VPS: `git pull && docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`.

**Qué verificar**:
- Compose construye nuevas imágenes.
- `migrate` corre, aplica la migración nueva, exit 0.
- `app` se reemplaza con la nueva versión.
- `psql` adentro del container `db` muestra la columna nueva: `\d "NombreTabla"`.
- Sin downtime visible (Compose hace recreate con healthcheck).

---

### Escenario 8 — Rollback

**Caso A: rollback de imagen sin migración nueva**.

**Pasos**:
1. `cd /srv/puntajes-scout && git log --oneline -5` — anotar hash de la versión anterior.
2. `git checkout <hash-anterior>`.
3. `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`.

**Qué verificar**:
- App vuelve a la versión anterior.
- DB sigue intacta (no hubo migración).

**Caso B: rollback con migración aplicada**.

**Pasos**:
1. Identificar el último backup pre-deploy: `ls -lt /var/backups/puntajes-scout/ | head`.
2. `git checkout <hash-anterior>`.
3. `docker compose --env-file .env.prod -f docker-compose.prod.yml stop app caddy`.
4. `./scripts/restore.sh /var/backups/puntajes-scout/<dump-pre-deploy>.dump`.
5. `docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build`.

**Qué verificar**:
- DB restaurada al estado pre-migración.
- App vieja arranca contra DB vieja.
- **Limitación**: cualquier dato escrito entre el dump y el rollback se pierde. Documentar.

---

### Escenario 9 — Login con Google en dominio real

**Pasos**:
1. En el VPS: app corriendo, Google OAuth configurado con redirect URI exacta.
2. Abrir `https://tu-dominio.org/login` en navegador.
3. Click "Continuar con Google" → seleccionar cuenta → consentir scopes.

**Qué verificar**:
- Redirect vuelve a `https://tu-dominio.org/api/auth/callback/google?code=...`.
- Vuelve a la home autenticado, o al onboarding si es el primer usuario.
- Cookie de sesión se setea con `Secure`, `HttpOnly`, `SameSite=Lax`.
- Refrescar mantiene la sesión.

Errores típicos:
- `redirect_uri_mismatch`: revisar URI exacta en Google Console (sin slash final).
- "Untrusted host": `AUTH_TRUST_HOST=true` faltante.

---

### Escenario 10 — SW del juez offline en prod

**Pasos**:
1. En el VPS: app corriendo.
2. Login como JUEZ asignado a una posta.
3. Navegar `/juez/eventos/[id]/postas/[id]/patrullas/[id]/cargar`.
4. DevTools → Application → Service Workers — confirmar `sw.js` activo.
5. Activar offline en DevTools.
6. Cargar puntajes, navegar entre postas/patrullas.
7. Volver online.

**Qué verificar**:
- Las páginas del juez funcionan offline (Plan 7 funcionalidad).
- Al volver online, el badge de sync envía las ops pendientes.
- El SW se sirve por HTTPS (requisito de PWA).
- `/api/health` no se cachea por el SW (regla `NetworkOnly` del Plan 7d cubre todas las navegaciones non-juez).

Verificar en DevTools → Network: `sw.js` viene con `Service-Worker-Allowed: /`. Si Caddy no lo permite, agregar header en Caddyfile (no debería ser necesario, Next.js lo emite por default).

---

### Escenario 11 — Performance TTFB desde 4G

**Pasos**:
1. Celular real con 4G (no WiFi).
2. Abrir `https://tu-dominio.org/resultados/[token]`.
3. Medir tiempo a primera renderización con DevTools mobile o Lighthouse.

**Qué verificar**:
- TTFB < 500ms.
- LCP < 1500ms (objetivo del master plan: <1s para la página completa, ambicioso pero alcanzable con SSR + zstd).

Si TTFB es alto:
- Verificar región del VPS vs ubicación geográfica de los usuarios.
- Considerar Cloudflare gratis frente a Caddy (CDN + cache de estáticos).

---

### Escenario 12 — Headers de seguridad

**Pasos**:
1. `curl -I https://tu-dominio.org`.
2. Validar también con https://securityheaders.com (opcional, externo).

**Qué verificar**:
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` presente.
- `X-Content-Type-Options: nosniff` presente.
- `Referrer-Policy: strict-origin-when-cross-origin` presente.
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()` presente.
- `Server` header ausente (lo quita el `-Server` de Caddy).
- HTTP/2 o HTTP/3 activo (`HTTP/2 200` en la respuesta).

---

### Escenario 13 — Postgres no expuesto

**Pasos**:
1. Desde otra máquina (no el VPS): `nmap -p 5432 IP_DEL_VPS`.
2. Validar también: `psql -h IP_DEL_VPS -U scout -d puntajes_scout` debe fallar con timeout.

**Qué verificar**:
- Nmap reporta `5432/tcp filtered` (UFW lo bloquea) o `closed` (no hay listener público).
- Adentro del VPS: `ss -tlnp | grep 5432` también vacío (Postgres está en la red interna de Compose, no en el host).

Si emerge listener en `0.0.0.0:5432`, hay un error de configuración: el `db` service del compose NO debe tener `ports:` clave.

---

### Escenario 14 — CI bloquea PR con regresión

**Pasos**:
1. Branch nueva con un cambio que rompe `pnpm typecheck` (ej: variable typed wrong).
2. PR contra `main`.

**Qué verificar**:
- GitHub Actions arranca.
- El job `validate` falla en el step `pnpm typecheck`.
- El PR muestra status check rojo.
- El botón "Merge" está bloqueado (si el branch tiene "Require status checks" en GitHub Settings).

Mismo escenario con un test fallando: el step `pnpm test` falla.

Caso happy: PR con cambio válido pasa CI y se puede mergear.

---

## Riesgos a vigilar durante ejecución

- **Trace de standalone no incluye Prisma client generado**: el `outputFileTracingIncludes` cubre el caso pero puede emerger un edge case con sub-imports (`@/generated/prisma/runtime/library.js`). Si el container falla con `Cannot find module '@/generated/prisma/...'`, ampliar el tracing include o copiar `node_modules/.prisma` y `node_modules/@prisma/client` explícitamente en el Dockerfile.
- **`pg` con bindings nativos**: `pg` puede usar `pg-native` (binding a libpq en C) opcionalmente. Si el bundle lo intenta cargar y no existe, log warnings. No es bloqueante. Si emerge error, agregar `pg-native` a externals o ignorarlo en webpack/turbopack config.
- **Caddy 2 + HTTP/3 + Docker**: el puerto UDP 443 requiere `443:443/udp` explícito en el compose. Sin esto, HTTP/3 falla y Caddy cae a HTTP/2 (no es crisis pero pierde performance).
- **Let's Encrypt rate limit en testing**: 5 certs por week por dominio. Si el operador hace `docker compose down -v` (que borra `caddy-data`) varias veces seguidas, se llega al límite. Usar `tls internal` para iteración local; en VPS, no borrar el volumen.
- **Tiempo de build en VPS pequeño**: en un VPS de 1 vCPU + 1 GB RAM, `next build` puede tardar 3-5 minutos y puede OOM con TypeScript checking activo. Si emerge OOM, swapfile de 2 GB lo cubre: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. Documentar en troubleshooting.
- **`migrate` service falla con "P3014: Prisma Migrate could not create the shadow database"**: `migrate deploy` no necesita shadow DB, así que no debería emerger. Si emerge, confirmar que el comando es `migrate deploy` y no `migrate dev`.
- **Permission denied en `/data` de Caddy**: el container Caddy corre como root por default; el volume `caddy-data` se crea con permisos correctos. Si se cambia a non-root, ajustar permisos.
- **`NEXT_PUBLIC_*` se hornea en build**: `NEXT_PUBLIC_BASE_URL` se inserta en el bundle del cliente durante `pnpm build`. Si cambia el dominio post-build, hay que rebuildar la imagen. Documentar.
- **Tests del Plan 8 fallan en CI por DB pristine**: si los tests asumen un seed previo, fallar en CI. Revisar al ejecutar — los tests deberían crear sus propias fixtures (revisar `leaderboard.repo.test.ts`). Si no, ajustar.
- **`pnpm install --frozen-lockfile` falla en CI por drift**: si alguien hizo `pnpm add` sin commit del lockfile, CI falla. Es exactamente el comportamiento deseado (forza commit del lock), pero documentar para evitar confusión.
- **Hidden environment variables del build**: `pnpm build` puede leer variables del entorno y "hornearlas" en chunks del cliente. Auditar el build output para confirmar que `AUTH_SECRET`, `POSTGRES_PASSWORD`, etc. NO aparecen en `_next/static/chunks/*`. Comando: `grep -r "AUTH_SECRET" .next/static/` debería estar vacío.
- **Healthcheck de `app` corre antes de que server.js esté listo**: el `start_period: 20s` da margen. Si en VPS lentos no alcanza, ampliar a 60s. Síntoma: `app` aparece como "unhealthy" justo después del startup y se reinicia.
- **`migrate` reusa `target: builder` que es grande (~600 MB)**: si emerge presión de disco en el VPS, considerar un Dockerfile dedicado para el migrator con solo Prisma CLI + schema. Dejar para Plan 10b.
- **`docker compose pull` en deploys**: no aplica porque construimos local. Pero si en algún momento se mueve a registry, `docker compose pull` antes de `up` evita pulls implícitos en el medio del start.
- **`.env.prod` con permisos open**: `chmod 600 .env.prod` está documentado en la guía. Si se olvida, `docker-compose` igual funciona pero el archivo es legible por otros usuarios del VPS. Auditar.

## Checklist de hardening (resumen ejecutable para el operador)

Tras completar el deploy, validar uno por uno:

- [ ] HTTPS funciona con cert válido de Let's Encrypt.
- [ ] HTTP redirige a HTTPS (Caddy lo hace automático).
- [ ] HSTS header presente en respuestas.
- [ ] `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` presentes.
- [ ] Server header ausente.
- [ ] Postgres no expuesto al exterior (escaneo nmap desde otra máquina lo confirma).
- [ ] Solo puertos 22/80/443 abiertos en UFW.
- [ ] SSH solo permite key-based auth (deshabilitar password en `/etc/ssh/sshd_config`: `PasswordAuthentication no`).
- [ ] Usuario root SSH deshabilitado o root login con key only.
- [ ] `.env.prod` con permisos `600` y dueño correcto.
- [ ] `AUTH_SECRET` con ≥32 bytes generado con `openssl rand`.
- [ ] `POSTGRES_PASSWORD` aleatorio (no `scout_dev_password`).
- [ ] Cron de backup configurado y validado con ejecución manual.
- [ ] Logs accesibles vía `docker compose logs` y `/var/log/puntajes-scout/backup.log`.
- [ ] Rotación de logs de Docker activa (`max-size: 10m`, `max-file: 3`) — verificar `/var/lib/docker/containers/<id>/*.log`.
- [ ] Healthcheck de `app` y `db` reportan healthy.
- [ ] Snapshot del proveedor configurado (Hetzner/DO ofrecen, ~$1/mes — opcional pero recomendado).

Items pendientes (Plan 10b o posterior):
- [ ] Backups off-VPS.
- [ ] Encriptación de backups.
- [ ] Sentry / monitoreo de errores.
- [ ] CD desde GitHub Actions.
- [ ] CSP estricta.
- [ ] Rate limiting (fail2ban o Caddy plugin).

## Lecciones aprendidas

### #1 — `output: "standalone"` falla con EPERM en Windows por symlinks

**Qué pasó**: al agregar `output: "standalone"` a `next.config.ts` y correr `pnpm build` en Windows, el build falló con `EPERM: operation not permitted, symlink`. Next.js crea symlinks en `.next/standalone/node_modules/` para el trace de dependencias, y Windows requiere Developer Mode o permisos de Administrador para crear symlinks sin privilegios elevados.

**Workaround**: hacer `output: "standalone"` condicional vía variable de entorno `NEXT_STANDALONE=true`. El Dockerfile setea `ENV NEXT_STANDALONE=true` antes de `pnpm build`, y el CI setea la misma env var. Los builds locales en Windows no setean esa variable y corren sin el modo standalone (solo verifican que el código compila). En Linux/Docker el modo standalone funciona correctamente y produce `.next/standalone/server.js`.

**Regla permanente**: cualquier config de Next.js que dependa de symlinks del SO debe ser condicional entre Windows (dev) y Linux (prod/CI). Documentar en next.config.ts con comentario explicativo.

### #2 — `.env.prod.example` ignorado por el patrón `.env*` del `.gitignore`

**Qué pasó**: el `.gitignore` tenía `!.env.example` pero no `!.env.prod.example`. Al hacer `git add .env.prod.example`, git lo rechazó porque el patrón `.env*` lo matchea y la excepción solo cubría `.env.example`.

**Fix**: agregar `!.env.prod.example` al `.gitignore`.

**Regla permanente**: cuando se agregue un nuevo archivo `.env.*.example` (template sin secretos), agregar la excepción correspondiente al `.gitignore` en el mismo commit.

### #3 — El Caddyfile original no tenía `email` global para Let's Encrypt

**Qué pasó**: el Caddyfile heredado del Plan 0a solo tenía el bloque de dominio. Para que Caddy emita certs de Let's Encrypt en producción, requiere un `email` de registro de cuenta ACME (para notificaciones de renovación). Se usa `{$ACME_EMAIL}` — variable de entorno inyectada en `docker-compose.prod.yml`.

**Regla permanente**: Caddy emite certs automáticamente para dominios públicos sin config extra — pero el `email` es requerido para registrar la cuenta ACME. Sin él, Let's Encrypt puede rechazar la emisión en dominios con rate limiting.

### #4 — `ACME_EMAIL` necesita estar en `caddy` environment y pasarse al compose

**Qué pasó**: el compose inicial solo pasaba `APP_DOMAIN` a `caddy`. Al usar `{$ACME_EMAIL}` en el Caddyfile, era necesario también pasar `ACME_EMAIL` en el bloque `environment` del servicio `caddy` en `docker-compose.prod.yml`. Se actualizó a tiempo antes de problemas en producción.

**Regla permanente**: cada variable `{$VAR}` usada en Caddyfile debe estar listada en el `environment` del servicio `caddy` en el compose.

## Commits asociados

| Hash | Descripción |
|---|---|
| `55f8a93` | feat(infra): deploy a VPS con Docker Compose, Caddy y CI (Plan 10) |
