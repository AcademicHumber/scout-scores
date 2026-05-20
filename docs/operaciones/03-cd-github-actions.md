# CD con GitHub Actions + Coolify

Guía para activar el deploy automático al VPS cada vez que un push a `main` pasa el CI. Asume que Coolify ya está instalado y la app configurada (ver `01-deploy-vps.md`).

## Cómo funciona

```
push a main
    ↓
[validate] typecheck + lint + test + build
    ↓ solo si pasa
[deploy] curl al webhook de Coolify
    ↓
Coolify clona el repo, hace docker build y docker compose up
```

El job `deploy` está definido en `.github/workflows/ci.yml` con `needs: validate`, por lo que nunca corre si los tests fallan. Los PRs solo corren `validate`; el deploy se activa únicamente en push directo a `main`.

Si el deploy falla en Coolify, la versión anterior sigue corriendo y el job de CI queda en rojo (el curl devuelve error).

## Paso 1 — Obtener el webhook de Coolify

En la UI de Coolify:

1. Ir a la app → **Settings → Deployments**
2. Copiar la **"Deploy Webhook URL"** (algo como `https://coolify.tu-vps.org/api/v1/deploy?uuid=...&token=...`)

## Paso 2 — Cargar el secret en GitHub

Ir al repositorio en GitHub → **Settings → Secrets and variables → Actions → New repository secret**.

| Secret | Valor |
|---|---|
| `COOLIFY_WEBHOOK_URL` | La URL copiada del paso anterior (incluye el token) |

> El token está embebido en la URL. Si se compromete, regenerarlo en Coolify UI → App → Settings → Deployments → "Regenerate token". Actualizar el secret en GitHub.

## Paso 3 — Verificar el primer deploy automático

Hacer un push a `main` (puede ser cualquier cambio). En GitHub → **Actions** se verán dos jobs: `typecheck + lint + test + build` y `deploy via Coolify`. El deploy solo arranca cuando el primero termina en verde.

En Coolify UI → App → **Deployments** aparecerá el nuevo deploy en curso con sus logs de build y runtime.

## Secrets anteriores ya no necesarios

Si el proyecto usaba el deploy por SSH anterior, estos secrets pueden eliminarse de GitHub:

| Secret | Motivo para eliminar |
|---|---|
| `VPS_HOST` | Ya no se usa SSH |
| `VPS_USER` | Ya no se usa SSH |
| `VPS_SSH_KEY` | Ya no se usa SSH |

## Variables de entorno de la app

Las variables de entorno ya no viven en un `.env.prod` en el VPS — se gestionan en Coolify UI → App → **Environment Variables**. Si necesitás actualizar una (ej: nuevo `AUTH_GOOGLE_SECRET`):

1. Coolify UI → App → Environment Variables → editar el valor
2. Click **"Restart"** (sin rebuild) o **"Deploy"** (con rebuild, necesario para vars `NEXT_PUBLIC_*`)

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| Job `deploy` no aparece en el workflow | El push fue en una rama distinta de `main` o fue un PR | Solo pushes directos a `main` disparan el deploy |
| `curl: (22) The requested URL returned error: 4xx` | Webhook URL incorrecta o token inválido | Verificar `COOLIFY_WEBHOOK_URL` en GitHub Secrets; regenerar token en Coolify si hace falta |
| El curl devuelve 200 pero Coolify no despliega | Coolify recibió el webhook pero la build falló | Ver logs en Coolify UI → App → Deployments |
| Build falla con OOM en Coolify | VPS con poca RAM durante `next build` | Crear swapfile en el VPS (ver `01-deploy-vps.md § 13`) |
| Deploy verde pero app sin cambios | El webhook disparó pero Coolify usó el código cacheado | Forzar redeploy manual desde Coolify UI |

## Consideraciones de seguridad

- El token de Coolify está embebido en la URL del webhook. Tratar `COOLIFY_WEBHOOK_URL` con el mismo cuidado que cualquier secret.
- Rotar el token en Coolify UI periódicamente o ante cualquier sospecha de compromiso. Actualizar el secret en GitHub después de rotar.
- No compartir la webhook URL fuera del repositorio. No loggearla en CI.
