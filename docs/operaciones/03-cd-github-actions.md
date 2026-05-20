# CD con GitHub Actions + Coolify

Guía para activar el deploy automático al VPS cada vez que un push a `main` pasa el CI. Asume que Coolify ya está instalado y la app configurada (ver `01-deploy-vps.md`).

## Cómo funciona

```
push a main
    ↓
[validate] typecheck + lint + test + build
    ↓ solo si pasa
[deploy] curl a la API de Coolify con Bearer token
    ↓
Coolify clona el repo, hace docker build y docker compose up
```

El job `deploy` está definido en `.github/workflows/ci.yml` con `needs: validate`, por lo que nunca corre si los tests fallan. Los PRs solo corren `validate`; el deploy se activa únicamente en push directo a `main`.

Si el deploy falla en Coolify, la versión anterior sigue corriendo y el job de CI queda en rojo.

## Paso 1 — Obtener el API token de Coolify

En la UI de Coolify:

1. Ir a **Keys & Tokens → API tokens → + New Token**
2. Darle un nombre (ej: `github-actions`)
3. Copiar el token generado (solo se muestra una vez)

## Paso 2 — Obtener el UUID de la app

En la UI de Coolify:

1. Ir a la app → **Settings**
2. Copiar el **UUID** de la aplicación (ej: `idi2glj7rw6scf64gg58ykv9`)

## Paso 3 — Cargar los secrets en GitHub

Ir al repositorio en GitHub → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valor |
|---|---|
| `COOLIFY_DEPLOY_URL` | `https://<tu-coolify-host>/api/deploy?uuid=<app-uuid>` |
| `COOLIFY_TOKEN` | El API token generado en el paso 1 |

Ejemplo de `COOLIFY_DEPLOY_URL`:
```
https://coolify.tu-vps.org/api/deploy?uuid=idi2glj7rw6scf64gg58ykv9
```

> El token va en el header `Authorization`, no en la URL — así no queda expuesto en los logs de GitHub Actions ni en el historial de requests.

## Paso 4 — Verificar el primer deploy automático

Hacer un push a `main`. En GitHub → **Actions** se verán dos jobs: `typecheck + lint + test + build` y `deploy via Coolify`. El deploy solo arranca cuando el primero termina en verde.

En Coolify UI → App → **Deployments** aparecerá el nuevo deploy en curso.

## Secrets anteriores ya no necesarios

Si el proyecto usaba el deploy por SSH anterior, estos secrets pueden eliminarse de GitHub:

| Secret | Motivo para eliminar |
|---|---|
| `VPS_HOST` | Ya no se usa SSH |
| `VPS_USER` | Ya no se usa SSH |
| `VPS_SSH_KEY` | Ya no se usa SSH |
| `COOLIFY_WEBHOOK_URL` | Reemplazado por `COOLIFY_DEPLOY_URL` + `COOLIFY_TOKEN` |

## Variables de entorno de la app

Las variables de entorno se gestionan en Coolify UI → App → **Environment Variables**. Si necesitás actualizar una (ej: nuevo `AUTH_GOOGLE_SECRET`):

1. Coolify UI → App → Environment Variables → editar el valor
2. Click **"Restart"** (sin rebuild) o **"Deploy"** (con rebuild, necesario para vars `NEXT_PUBLIC_*`)

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Job `deploy` no aparece en el workflow | Push en rama distinta de `main` o fue un PR | Solo pushes directos a `main` disparan el deploy |
| `curl: (22) ... 401 Unauthorized` | `COOLIFY_TOKEN` incorrecto o expirado | Regenerar el token en Coolify UI → Keys & Tokens. Actualizar el secret en GitHub. |
| `curl: (22) ... 404 Not Found` | `COOLIFY_DEPLOY_URL` incorrecta o UUID equivocado | Verificar el UUID en Coolify UI → App → Settings |
| El curl devuelve 200 pero Coolify no despliega | Coolify recibió el request pero la build falló | Ver logs en Coolify UI → App → Deployments |
| Build falla con OOM en Coolify | VPS con poca RAM durante `next build` | Crear swapfile en el VPS (ver `01-deploy-vps.md § 13`) |

## Consideraciones de seguridad

- El API token de Coolify da acceso completo a la API. Rotarlo en Coolify UI periódicamente o ante cualquier sospecha de compromiso. Actualizar `COOLIFY_TOKEN` en GitHub después de rotar.
- No loggear ni imprimir el token en los steps del workflow.
- Limitar el scope del token si Coolify lo permite en versiones futuras.
