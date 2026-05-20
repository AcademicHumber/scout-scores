# Deploy a VPS — Guía operativa

Sistema: puntajes-scout. Stack: Next.js 15 + Prisma 7 + Postgres 16 + Coolify/Traefik, orquestado con Docker Compose.

## 1. Pre-requisitos

- VPS Ubuntu 24.04 LTS con acceso SSH (ver opciones en sección 2).
- Dominio propio con permiso de editar DNS (~$10/año).
- Cuenta Google Cloud Console para OAuth (gratis).
- **Coolify instalado en el VPS** (instala Docker automáticamente — ver sección 4).

## 2. Aprovisionar el VPS

Opciones recomendadas por costo:

- **Hetzner CX22** (€4.50/mes): 2 vCPU AMD, 4 GB RAM, 40 GB SSD, 20 TB tráfico. Mejor relación precio/recursos.
- **DigitalOcean Basic Droplet** ($6/mes): 1 vCPU, 1 GB RAM, 25 GB SSD. Suficiente para empezar pero con menos margen.
- **Oracle Free Tier "Always Free"** ($0): 4 vCPU ARM, 24 GB RAM (compartidos). Gratis pero ARM agrega fricciones con algunas imágenes Docker.

Crear instancia con Ubuntu 24.04 LTS, agregar SSH key. Anotar la IP pública.

## 3. Configurar DNS

En el panel de DNS del registrador (Namecheap, Porkbun, Cloudflare, etc.), crear:

- Registro A: `tu-dominio.org` → IP del VPS.

Esperar propagación (5-30 min). Validar:

```bash
dig +short tu-dominio.org
```

## 4. Instalar Coolify

```bash
ssh root@IP_DEL_VPS
```

Instalar Coolify (instala Docker y configura Traefik automáticamente):

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Acceder a la UI en `http://IP_DEL_VPS:8000` y completar el setup inicial (crear cuenta de administrador).

Configurar firewall con UFW:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp     # SSH
ufw allow 80/tcp     # HTTP (Traefik — redirecciona a HTTPS)
ufw allow 443/tcp    # HTTPS (Traefik)
ufw allow 8000/tcp   # Coolify UI (restringir a tu IP si es posible)
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

## 6. Generar secretos

```bash
# AUTH_SECRET (mínimo 32 bytes)
openssl rand -base64 32

# POSTGRES_PASSWORD — hex para evitar '/', '+', '=' que rompen DATABASE_URL
openssl rand -hex 24
```

Construir el `DATABASE_URL` con el password generado:

```
DATABASE_URL=postgresql://scout:<PASSWORD>@puntajes-scout-db:5432/puntajes_scout
```

> Nota: el host en `DATABASE_URL` es `puntajes-scout-db` (el `container_name` del servicio `db`), no `db` ni `localhost`.

## 7. Configurar la app en Coolify

En la UI de Coolify (`http://IP_DEL_VPS:8000`):

1. **New Resource → Docker Compose** → conectar el repo de GitHub.
2. **Compose file**: `docker-compose.prod.yml`; **Main service**: `app`; **Port**: `3000`.
3. **Environment Variables**: cargar todas las variables (ver tabla abajo). Marcarlas como "Build" las que deben estar disponibles en el build, y "Runtime" las demás.
4. **Domain**: configurar `tu-dominio.org` → Coolify/Traefik gestiona el certificado Let's Encrypt automáticamente.
5. **Deploy**: hacer click en "Deploy" para el primer deploy.

Variables de entorno a cargar en Coolify:

```bash
POSTGRES_USER=scout
POSTGRES_PASSWORD=GENERAR_CON_OPENSSL
POSTGRES_DB=puntajes_scout
DATABASE_URL=postgresql://scout:GENERAR_CON_OPENSSL@puntajes-scout-db:5432/puntajes_scout
AUTH_SECRET=GENERAR_CON_OPENSSL_32BYTES
AUTH_URL=https://tu-dominio.org
AUTH_TRUST_HOST=true
AUTH_GOOGLE_ID=DESDE_GOOGLE_CONSOLE
AUTH_GOOGLE_SECRET=DESDE_GOOGLE_CONSOLE
NEXT_PUBLIC_BASE_URL=https://tu-dominio.org
```

## 8. Verificar el primer deploy

Coolify UI → App → mostrar los logs de build y runtime. Esperar ver:
- `migrate` → `All migrations have been successfully applied.` y exit 0
- `app` → `Ready in ...ms`
- El servicio `app` aparece en verde (healthcheck pasando)

Verificar health desde afuera:

```bash
curl -I https://tu-dominio.org/api/health
# Debe devolver HTTP/2 200 con header Strict-Transport-Security
```

## 8b. Seed opcional (solo para demo)

La DB arranca vacía — solo el schema aplicado por `migrate`. El primer usuario que entra con Google completa el onboarding y crea su distrito desde cero. **No correr el seed en producción por defecto.**

Si necesitás un dataset de demo, ejecutar una vez:

```bash
docker exec puntajes-scout-app pnpm prisma db seed
```

Credenciales demo: `admin@demo.local / demo1234`. El seed es idempotente.

## 9. Verificar HTTPS y login

Abrir `https://tu-dominio.org` en el navegador:
- Click "Continuar con Google" → flujo Google → onboarding del distrito.
- O click "Iniciar sesión" e ingresar email/contraseña si hay una cuenta existente.

**Errores típicos:**
- `redirect_uri_mismatch`: revisar URI exacta en Google Console (debe ser `https://tu-dominio.org/api/auth/callback/google`, sin slash final).
- "Untrusted Host": confirmar `AUTH_TRUST_HOST=true` en Coolify UI y hacer restart del servicio `app`.

## 10. Configurar CD (webhook de Coolify)

Para que los pushes a `main` desplieguen automáticamente:

1. En Coolify UI → App → **Settings → Deployments** → copiar la **"Deploy Webhook URL"**.
2. En GitHub → repo → **Settings → Secrets and variables → Actions → New repository secret**:
   - Nombre: `COOLIFY_WEBHOOK_URL`
   - Valor: la URL copiada del paso anterior
3. El workflow de CI (`.github/workflows/ci.yml`) ya tiene el job `deploy` configurado para llamar ese webhook después de que el CI pase.

Ver `docs/operaciones/03-cd-github-actions.md` para más detalle.

## 11. Configurar backups por cron

El script `scripts/backup.sh` requiere un `.env.prod` con las credenciales de Postgres en el VPS. Crear ese archivo manualmente (independiente de Coolify):

```bash
sudo mkdir -p /srv/puntajes-scout
sudo nano /srv/puntajes-scout/.env.prod
```

Contenido mínimo (solo las 3 variables que usa el backup):

```bash
POSTGRES_USER=scout
POSTGRES_PASSWORD=<el mismo password que cargaste en Coolify>
POSTGRES_DB=puntajes_scout
```

```bash
chmod 600 /srv/puntajes-scout/.env.prod
```

Copiar el script de backup al VPS (o clonar el repo allí):

```bash
# Opción A — clonar el repo (permite recibir updates del script vía git pull)
git clone https://github.com/<org>/puntajes-scout.git /srv/puntajes-scout

# Opción B — copiar solo el script
scp scripts/backup.sh scout@IP_DEL_VPS:/srv/puntajes-scout/scripts/
```

Configurar el cron:

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

## 12. Updates posteriores (nueva versión de la app)

El flujo normal es automático: push a `main` → CI pasa → webhook dispara Coolify → Coolify hace build y deploy.

Para disparar un deploy manual sin código nuevo: Coolify UI → App → botón **"Deploy"**.

**Recomendado antes de cada deploy con migraciones**: hacer un backup manual primero:

```bash
sudo /srv/puntajes-scout/scripts/backup.sh --no-rotate
```

## 13. Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Traefik no enruta / 404 en el dominio | El servicio `app` no está en la red `coolify` | Verificar `docker network inspect coolify` — el container `puntajes-scout-app` debe aparecer. Forzar redeploy en Coolify UI. |
| Coolify no ve la app como healthy | Healthcheck falla en startup | Ver logs en Coolify UI → App. Ampliar `start_period` a `60s` en `docker-compose.prod.yml` si el primer boot es lento. |
| Cert SSL no se genera | DNS no propagado | `dig +short tu-dominio.org` — debe apuntar al VPS. Esperar y reintentar redeploy. |
| `app` se reinicia en loop | Error en runtime o falta una variable | Coolify UI → App → Logs → buscar el error real. Verificar que todas las env vars están cargadas. |
| `migrate` falla | Schema drift o DB inaccesible | Coolify UI → App → Logs de `migrate`. Verificar `DATABASE_URL` y que `db` esté healthy. |
| Login con Google da "Configuration error" | `AUTH_SECRET` faltante o muy corto | Regenerar con `openssl rand -base64 32`. Actualizar en Coolify UI → restart `app`. |
| Sign-out o callback redirige a `0.0.0.0:3000` | `AUTH_URL` no definida | Agregar `AUTH_URL=https://tu-dominio.org` en Coolify UI → restart `app`. |
| `/resultados/[token]` redirige a /login | Token revocado o `/resultados` no en `PUBLIC_PATHS` | Verificar `auth.config.ts`. |
| Disco lleno | Logs de Docker / dumps acumulados | `docker system prune -a`; revisar `RETENTION_COUNT` del backup. |
| Build OOM en VPS pequeño | Memoria insuficiente para `next build` | Crear swapfile: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |

### Verificar estado del sistema

```bash
# Estado de todos los containers gestionados por Coolify
docker ps --filter "name=puntajes-scout"

# Logs de la app (últimas 100 líneas)
docker logs --tail=100 puntajes-scout-app

# Logs de la DB
docker logs --tail=50 puntajes-scout-db
```

### Rollback de versión

**Sin migración nueva:**

En Coolify UI → App → **Deployments** → seleccionar un deploy anterior → **Redeploy**.

O vía git + webhook:

```bash
git revert <hash-roto>
git push origin main   # CI valida → webhook → Coolify despliega la reversión
```

**Con migración aplicada** (requiere backup pre-deploy):

```bash
# Detener la app (la DB sigue corriendo para el restore)
docker stop puntajes-scout-app

# Restaurar
sudo ./scripts/restore.sh /var/backups/puntajes-scout/<dump-pre-deploy>.dump

# Revertir el código y disparar el redeploy desde Coolify UI
```

⚠️ Cualquier dato escrito entre el dump y el rollback se pierde.

## 14. Hardening pendiente

Documentado para priorización futura:

- **Backups off-VPS** (rclone a Backblaze B2 / Storj / Wasabi). Riesgo actual: si el VPS muere, se pierden DB y backups simultáneamente.
- **Encriptación de backups** (GPG). Prioritario cuando llegue Capa 2 con datos médicos.
- **Sentry / monitoreo de errores**. Sentry cloud free tier (5K errors/mes) o GlitchTip self-hosted.
- **CSP estricta**. Requiere auditoría de inline scripts de Next.js (RSC, hydration, Auth.js).
- **Rate limiting** (fail2ban a nivel host o middleware de Traefik).
- **Snapshots del proveedor** (Hetzner/DO, ~$1/mes). Mitigación parcial barata del riesgo de pérdida del VPS.

## Checklist de hardening

Tras completar el deploy, validar uno por uno:

- [ ] HTTPS funciona con cert válido de Let's Encrypt (Traefik).
- [ ] HTTP redirige a HTTPS (Traefik lo hace automático).
- [ ] HSTS header presente: `curl -I https://tu-dominio.org | grep Strict-Transport`
- [ ] `X-Content-Type-Options: nosniff` presente.
- [ ] `Referrer-Policy` y `Permissions-Policy` presentes.
- [ ] Postgres no expuesto al exterior: `nmap -p 5432 IP_DEL_VPS` → filtered/closed.
- [ ] Solo puertos 22/80/443 abiertos (más 8000 para Coolify UI si aplica): `ufw status`.
- [ ] SSH solo permite key-based auth: `PasswordAuthentication no` en `/etc/ssh/sshd_config`.
- [ ] `.env.prod` del backup con permisos `600`: `stat /srv/puntajes-scout/.env.prod`.
- [ ] `AUTH_SECRET` generado con `openssl rand -base64 32` (≥32 bytes).
- [ ] `POSTGRES_PASSWORD` aleatorio (no valor de ejemplo).
- [ ] Cron de backup configurado y probado manualmente.
- [ ] Healthcheck de `app` y `db` reportan healthy en Coolify UI y en `docker ps`.
