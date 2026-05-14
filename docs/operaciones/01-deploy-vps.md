# Deploy a VPS — Guía operativa

Sistema: puntajes-scout. Stack: Next.js 15 + Prisma 7 + Postgres 16 + Caddy, orquestado con Docker Compose.

## 1. Pre-requisitos

- VPS Ubuntu 24.04 LTS con acceso SSH (ver opciones en sección 2).
- Dominio propio con permiso de editar DNS (~$10/año).
- Cuenta Google Cloud Console para OAuth (gratis).
- Docker Engine + Compose v2 instalados en el VPS.
- Repo cloneable desde el VPS.

## 2. Aprovisionar el VPS

Opciones recomendadas por costo:

- **Hetzner CX22** (€4.50/mes): 2 vCPU AMD, 4 GB RAM, 40 GB SSD, 20 TB tráfico. Mejor relación precio/recursos.
- **DigitalOcean Basic Droplet** ($6/mes): 1 vCPU, 1 GB RAM, 25 GB SSD. Suficiente para empezar pero con menos margen.
- **Oracle Free Tier "Always Free"** ($0): 4 vCPU ARM, 24 GB RAM (compartidos). Gratis pero ARM agrega fricciones con algunas imágenes Docker.

Crear instancia con Ubuntu 24.04 LTS, agregar SSH key. Anotar la IP pública.

## 3. Configurar DNS

En el panel de DNS del registrador (Namecheap, Porkbun, Cloudflare, etc.), crear:

- Registro A: `tu-dominio.org` → IP del VPS.
- Opcional: registro A para `www.tu-dominio.org` con la misma IP (Caddyfile tiene la redirección comentada).

Esperar propagación (5-30 min). Validar:

```bash
dig +short tu-dominio.org
```

## 4. Instalar Docker

```bash
ssh root@IP_DEL_VPS
```

Instalar Docker Engine y Compose v2:

```bash
curl -fsSL https://get.docker.com | sh
docker --version
docker compose version  # debe ser >= 2.20
```

Crear usuario no-root para operación (recomendado):

```bash
adduser scout
usermod -aG docker scout
usermod -aG sudo scout
```

Configurar firewall con UFW:

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

Postgres no se expone (no abrir 5432). Verificable después del deploy: `ss -tlnp | grep 5432` debe estar vacío.

## 5. Crear Google OAuth client

1. Ir a https://console.cloud.google.com/apis/credentials.
2. Crear proyecto si no existe (ej: "puntajes-scout-prod").
3. Configurar OAuth consent screen: tipo "External", scopes mínimos (`email`, `profile`, `openid`). Publicar (modo "In production") para evitar el cap de 100 testers.
4. Crear "OAuth 2.0 Client ID" → tipo "Web application".
5. Authorized redirect URI: `https://tu-dominio.org/api/auth/callback/google` (exacto, sin slash final).
6. Copiar Client ID y Client Secret.

## 6. Clonar y configurar el proyecto

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

Editar `.env.prod` con los valores reales (sección 7).

## 7. Generar secretos

```bash
# AUTH_SECRET (mínimo 32 bytes — base64 está bien porque no va en una URL)
openssl rand -base64 32

# POSTGRES_PASSWORD — usar hex para evitar '/', '+', '=' que rompen DATABASE_URL
openssl rand -hex 24
```

Pegar los valores en `.env.prod`. Construir el `DATABASE_URL` con el password generado:

```
DATABASE_URL=postgresql://scout:<PASSWORD>@db:5432/puntajes_scout
```

Pegar `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` desde Google Console. Completar `APP_DOMAIN`, `ACME_EMAIL`, `NEXT_PUBLIC_BASE_URL`.

Ejemplo de `.env.prod` completo (reemplazar todos los valores en mayúsculas):

```bash
POSTGRES_USER=scout
POSTGRES_PASSWORD=GENERAR_CON_OPENSSL
POSTGRES_DB=puntajes_scout
DATABASE_URL=postgresql://scout:GENERAR_CON_OPENSSL@db:5432/puntajes_scout
AUTH_SECRET=GENERAR_CON_OPENSSL_32BYTES
AUTH_URL=https://tu-dominio.org
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=DESDE_GOOGLE_CONSOLE
AUTH_GOOGLE_SECRET=DESDE_GOOGLE_CONSOLE
NEXT_PUBLIC_BASE_URL=https://tu-dominio.org
APP_DOMAIN=tu-dominio.org
ACME_EMAIL=admin@tu-dominio.org
```

## 8. Primera build y arranque

```bash
cd /srv/puntajes-scout
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

Seguir los logs:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f
```

Esperar ver en los logs:
- `db` → `database system is ready to accept connections`
- `migrate` → `All migrations have been successfully applied.` y exit 0
- `app` → `Ready in ...ms`
- `caddy` → `serving initial configuration` y `certificate obtained successfully`

Verificar health:

```bash
curl -I https://tu-dominio.org/api/health
# Debe devolver HTTP/2 200 con header Strict-Transport-Security
```

## 8b. Seed opcional (solo para demo)

La DB arranca vacía — solo el schema aplicado por `migrate`. El primer usuario que entra con Google completa el onboarding y crea su distrito desde cero. **No correr el seed en producción por defecto.**

Si necesitás un dataset de demo (ej: mostrarle el sistema a alguien antes de tener datos reales), ejecutar una vez después del arranque:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml exec app pnpm prisma db seed
```

Esto carga 1 distrito demo, grupos, usuarios y eventos. El seed es idempotente (puede correrse varias veces sin duplicar datos). Credenciales demo: `admin@demo.local / demo1234`.

## 9. Verificar HTTPS y login

Abrir `https://tu-dominio.org` en el navegador:
- Click "Continuar con Google" → flujo Google → onboarding del distrito.
- O click "Iniciar sesión" e ingresar email/contraseña si hay una cuenta existente.

**Errores típicos:**
- `redirect_uri_mismatch`: revisar URI exacta en Google Console (debe ser `https://tu-dominio.org/api/auth/callback/google`, sin slash final).
- "Untrusted Host": confirmar `AUTH_TRUST_HOST=true` en `.env.prod` y hacer restart de `app`.

## 10. Configurar backups por cron

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

Verificar que el archivo `.dump` se creó y el log termina con `FIN backup OK`.

## 11. Updates posteriores (nueva versión de la app)

```bash
cd /srv/puntajes-scout
git pull origin main
docker compose --env-file .env.prod -f docker-compose.prod.yml build
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

El servicio `migrate` corre automáticamente si hay migraciones nuevas. Si la build falla, los containers viejos siguen corriendo.

**Recomendado antes de cada deploy con migraciones**: hacer un backup manual primero:

```bash
sudo /srv/puntajes-scout/scripts/backup.sh --no-rotate
```

## 12. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| `caddy` no obtiene cert | DNS no propagado / puerto 80 cerrado | Verificar `dig` y `ufw status`. Esperar y reintentar. |
| `app` se reinicia en loop | Falla healthcheck | `docker compose logs app` — buscar el error real. Verificar que `/api/health` esté en `PUBLIC_PATHS`. |
| `migrate` falla con "Migration failed" | Schema drift entre repo y DB | `docker compose exec migrate pnpm prisma migrate status`. Resolver según el output. |
| Login con Google da "Configuration error" | `AUTH_SECRET` faltante o muy corto | Regenerar con `openssl rand -base64 32`. Restart `app`. |
| Sign-out o callback redirige a `0.0.0.0:3000` | `AUTH_URL` no definida en `.env.prod` | Agregar `AUTH_URL=https://tu-dominio.org` y hacer restart de `app`. |
| `/resultados/[token]` redirige a /login | Token revocado o `/resultados` no en `PUBLIC_PATHS` | Verificar `auth.config.ts`. |
| Disco lleno | Logs de Docker / dumps acumulados | `docker system prune -a`; revisar `RETENTION_COUNT` del backup. |
| Build OOM en VPS pequeño | Memoria insuficiente para `next build` | Crear swapfile: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| CD falla con `cannot open '.git/FETCH_HEAD': Permission denied` | El `git clone` inicial se hizo como `root` u otro usuario distinto al `VPS_USER` del secret | En el VPS: `sudo chown -R <VPS_USER>:<VPS_USER> /srv/puntajes-scout`. La sección 6 ya evita esto con `sudo chown $USER:$USER` antes del clone. |
| `app` unhealthy en startup | `start_period` muy corto | Ampliar a `start_period: 60s` en `docker-compose.prod.yml`. |

### Verificar estado del sistema

```bash
# Estado de todos los containers
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

# Logs de la app (últimas 100 líneas)
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=100 app

# Logs de migraciones del último deploy
docker compose --env-file .env.prod -f docker-compose.prod.yml logs migrate
```

### Rollback de versión

**Sin migración nueva:**

```bash
git checkout <hash-anterior>
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

**Con migración aplicada** (requiere backup pre-deploy):

```bash
git checkout <hash-anterior>
docker compose --env-file .env.prod -f docker-compose.prod.yml stop app caddy
./scripts/restore.sh /var/backups/puntajes-scout/<dump-pre-deploy>.dump
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

⚠️ Cualquier dato escrito entre el dump y el rollback se pierde.

## 13. Hardening pendiente (Plan 10b)

Documentado para priorización futura:

- **Backups off-VPS** (rclone a Backblaze B2 / Storj / Wasabi). Riesgo actual: si el VPS muere, se pierden DB y backups simultáneamente.
- **Encriptación de backups** (GPG). Prioritario cuando llegue Capa 2 con datos médicos (Plan 12).
- **Sentry / monitoreo de errores**. Sentry cloud free tier (5K errors/mes) o GlitchTip self-hosted.
- **CD desde GitHub Actions** (Plan 10c). Cuando el ritmo de release lo amerite.
- **CSP estricta**. Requiere auditoría de inline scripts de Next.js (RSC, hydration, Auth.js).
- **Rate limiting** (fail2ban a nivel host o Caddy con plugin custom).
- **Snapshots del proveedor** (Hetzner/DO, ~$1/mes). Mitigación parcial barata del riesgo de pérdida del VPS.

## Checklist de hardening

Tras completar el deploy, validar uno por uno:

- [ ] HTTPS funciona con cert válido de Let's Encrypt.
- [ ] HTTP redirige a HTTPS (Caddy lo hace automático).
- [ ] HSTS header presente: `curl -I https://tu-dominio.org | grep Strict-Transport`
- [ ] `X-Content-Type-Options: nosniff` presente.
- [ ] `Referrer-Policy` y `Permissions-Policy` presentes.
- [ ] `Server` header ausente.
- [ ] Postgres no expuesto al exterior: `nmap -p 5432 IP_DEL_VPS` → filtered/closed.
- [ ] Solo puertos 22/80/443 abiertos: `ufw status`.
- [ ] SSH solo permite key-based auth: `PasswordAuthentication no` en `/etc/ssh/sshd_config`.
- [ ] `.env.prod` con permisos `600`: `stat /srv/puntajes-scout/.env.prod`.
- [ ] `AUTH_SECRET` generado con `openssl rand -base64 32` (≥32 bytes).
- [ ] `POSTGRES_PASSWORD` aleatorio (no valor de ejemplo).
- [ ] Cron de backup configurado y probado manualmente.
- [ ] Logs accesibles vía `docker compose logs`.
- [ ] Healthcheck de `app` y `db` reportan `(healthy)` en `docker compose ps`.
