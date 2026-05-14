# CD con GitHub Actions

Guía para activar el deploy automático al VPS cada vez que un push a `main` pasa el CI. Asume que el VPS ya está corriendo (ver `01-deploy-vps.md`).

## Cómo funciona

```
push a main
    ↓
[validate] typecheck + lint + test + build
    ↓ solo si pasa
[deploy] SSH → git pull → docker build → docker up -d
```

El job `deploy` está definido en `.github/workflows/ci.yml` con `needs: validate`, por lo que nunca corre si los tests fallan. Los PRs solo corren `validate`; el deploy se activa únicamente en push directo a `main`.

Si el deploy falla en cualquier punto (`set -e` en el script), los containers con la versión anterior siguen corriendo y el CI queda en rojo.

## Paso 1 — Generar la clave SSH de deploy

En el VPS, logueado con el usuario que corre los containers (ej: `scout`):

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy -N ""
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Verificar que el archivo de claves autorizadas quedó bien:

```bash
cat ~/.ssh/authorized_keys   # debe incluir la línea "ssh-ed25519 ... github-actions-deploy"
```

Copiar el contenido de la clave privada (se usará en el paso 2):

```bash
cat ~/.ssh/github_deploy
```

## Paso 2 — Cargar los secrets en GitHub

Ir al repositorio en GitHub → **Settings → Secrets and variables → Actions → New repository secret**.

Crear estos tres secrets:

| Secret | Valor |
|---|---|
| `VPS_HOST` | IP pública o dominio del VPS (ej: `123.45.67.89`) |
| `VPS_USER` | Usuario SSH (ej: `scout`) |
| `VPS_SSH_KEY` | Contenido completo de `~/.ssh/github_deploy` (incluye `-----BEGIN...` y `-----END...`) |

> Los secrets nunca aparecen en los logs de GitHub Actions. Si se comprometen, rotar: generar un nuevo par de claves, reemplazar la entrada en `authorized_keys` y actualizar `VPS_SSH_KEY`.

## Paso 3 — Verificar que el repo es accesible desde el VPS

El deploy corre `git pull origin main` en el VPS. El repo debe poder clonarse sin credenciales interactivas. Opciones:

**Opción A — Repo público (más simple):** nada que hacer.

**Opción B — Repo privado vía HTTPS con token:**

```bash
# En el VPS — guardar credenciales en el store de git
git config --global credential.helper store
# Luego hacer un git pull manual la primera vez e ingresar usuario + personal access token
git pull origin main
```

**Opción C — Repo privado vía SSH (más robusto):**

```bash
# En el VPS — generar una deploy key separada para el repo
ssh-keygen -t ed25519 -C "vps-deploy-key" -f ~/.ssh/gh_repo -N ""
cat ~/.ssh/gh_repo.pub
```

Ir al repo en GitHub → **Settings → Deploy keys → Add deploy key** (solo lectura). Pegar el contenido de `gh_repo.pub`. Luego en el VPS:

```bash
# Configurar el remote para usar esa key
git remote set-url origin git@github.com:<org>/<repo>.git
# Agregar al ~/.ssh/config:
echo "Host github.com
  IdentityFile ~/.ssh/gh_repo
  StrictHostKeyChecking accept-new" >> ~/.ssh/config
```

## Paso 4 — Activar el CD

Hacer un push a `main` (puede ser el commit del workflow mismo). En GitHub → **Actions** se verá el workflow con dos jobs: `validate` y `deploy`. El deploy solo arranca cuando `validate` termina en verde.

Los logs del step `SSH deploy` muestran el output de cada comando en el VPS, incluyendo el `docker compose ps` final con el estado de los containers.

## Secretos adicionales en el VPS (`.env.prod`)

El workflow no transfiere `.env.prod` — ese archivo vive solo en el VPS y no está en el repo. Si necesitás actualizar una variable de entorno (ej: nuevo `AUTH_GOOGLE_SECRET`):

```bash
ssh scout@IP_DEL_VPS
nano /srv/puntajes-scout/.env.prod   # editar el valor
docker compose --env-file /srv/puntajes-scout/.env.prod \
  -f /srv/puntajes-scout/docker-compose.prod.yml \
  up -d app                          # reiniciar solo la app para que tome el nuevo valor
```

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Job `deploy` no aparece en el workflow | El push fue en una rama distinta de `main` o fue un PR | Solo pushes directos a `main` disparan el deploy |
| `Permission denied (publickey)` | `VPS_SSH_KEY` incorrecto o clave pública no en `authorized_keys` | Verificar con `ssh -i ~/.ssh/github_deploy VPS_USER@VPS_HOST` desde otra máquina |
| `Host key verification failed` | Primera conexión: el fingerprint del VPS no está en `known_hosts` | `appleboy/ssh-action` usa `StrictHostKeyChecking=no` por defecto — si falla, verificar que el host responde en el puerto 22 |
| `git pull` falla con auth error | Credenciales del repo no configuradas en el VPS | Ver Paso 3 según el tipo de repo (público / privado HTTPS / privado SSH) |
| `docker build` falla con OOM | VPS con poca RAM | Crear swapfile: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |
| Deploy verde pero app sin cambios | `git pull` no trajo nada (push a rama distinta) | Verificar que el commit está en `main`: `git log --oneline -1` en el VPS |
| Deploy roto: usuarios afectados | Fallo después de `up -d` | Ver `02-actualizar-app.md § Rollback` para revertir mientras se investiga |

## Consideraciones de seguridad

- La clave `github_deploy` da acceso SSH al VPS. Limitarla en `authorized_keys` con `command=` y `no-pty` si se quiere restringir a solo los comandos del script de deploy (hardening avanzado).
- Rotar la clave periódicamente o ante cualquier sospecha de compromiso.
- No agregar `VPS_SSH_KEY` a los secrets de entornos que no sean el repo principal (evitar que forks accedan al VPS).
- El usuario `scout` en el VPS no debe tener `sudo` sin password. Si el deploy necesita `sudo` (ej: para el cron de backup), usar `sudoers` con comandos específicos permitidos.
