# Plan 14 — Migración de Caddy a Coolify

## Contexto

El proyecto usaba Caddy como reverse proxy corriendo como un servicio dentro del `docker-compose.prod.yml`. Se migra a Coolify (self-hosted en el VPS), que gestiona su propio reverse proxy (Traefik), SSL automático vía Let's Encrypt, y deployments desde su UI. El objetivo es eliminar la dependencia de Caddy, delegar routing/SSL a Coolify/Traefik, mover los security headers al código de la app para que sean independientes del proxy, y simplificar el CD reemplazando el deploy SSH de GitHub Actions por el webhook de Coolify.

## Alcance

**Incluye:**
- `docker-compose.prod.yml` — eliminar servicio `caddy`; `container_name` fijos para `db` y `app`; red `coolify` externa en `app`
- `Caddyfile` — eliminado
- `next.config.ts` — `headers()` con los security headers que antes ponía Caddy
- `.github/workflows/ci.yml` — job `deploy` reemplazado por curl al webhook de Coolify
- `scripts/backup.sh` — `docker exec puntajes-scout-db` en lugar de `docker compose exec db`
- `docs/operaciones/` — las tres guías reescritas para el flujo con Coolify

**No incluye:**
- Migrar la DB a "Managed Database" de Coolify (queda en el compose)
- Cambios en `Dockerfile`
- Configuración de HTTP/3 en Traefik
- Cambios en la lógica de la aplicación

## Decisiones técnicas

| Decisión | Elegida | Descartada | Motivo |
|---|---|---|---|
| Security headers | `next.config.ts` `headers()` | Labels de Traefik | Portables, viven en el código, no dependen del proxy |
| Backup script | `docker exec` con `container_name` fijo | `docker compose exec` (ruta de Coolify inestable) | Coolify maneja el compose desde `/data/coolify/applications/<uuid>/` — la ruta varía |
| Trigger de deploy | Curl al webhook de Coolify | SSH + git pull + build | Coolify es el orquestador; el build ocurre dentro de Coolify |
| Red Docker para Traefik | `coolify` network (external) en `app` | Port mapping `80:3000` | Coolify inyecta Traefik via red interna; no se exponen puertos directamente |

## Configuración manual en Coolify (post-merge)

Estos pasos se hacen una sola vez en la UI de Coolify después de aplicar los cambios del código:

1. **Crear la app**: New Resource → Docker Compose → conectar el repo GitHub
2. **Compose file**: `docker-compose.prod.yml`; main service = `app`; port = `3000`
3. **Variables de entorno**: cargar todas las vars (ver `01-deploy-vps.md § 7`)
4. **Dominio**: configurar el dominio público → cert automático via Traefik
5. **Webhook**: copiar la "Deploy Webhook URL" → guardarla como `COOLIFY_WEBHOOK_URL` en GitHub Secrets
6. **Secrets de GitHub a eliminar**: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`
7. **Backup en VPS**: crear `/srv/puntajes-scout/.env.prod` con las credenciales de Postgres (solo para el cron de backup)

## Verificación

1. `curl -I https://<dominio>` — verificar presencia de `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`
2. HTTPS funciona y el cert es válido (Let's Encrypt vía Traefik)
3. Coolify UI → App → en verde (healthcheck `/api/health` pasando)
4. Login con Google funciona (callback OAuth correcto con `AUTH_URL` en Coolify)
5. Push a `main` → CI pasa → curl al webhook → Coolify despliega → nueva versión visible
6. `sudo /srv/puntajes-scout/scripts/backup.sh` → genera `.dump` sin errores
7. PWA offline sigue funcionando (dominio HTTPS garantizado por Traefik)
