# Actualizar la app en el VPS

Guía de referencia rápida para deployar una nueva versión. Asume que el sistema ya está corriendo con Coolify (ver `01-deploy-vps.md` para el deploy inicial).

## Flujo normal (automático)

El CD está configurado para dispararse automáticamente en cada push a `main` que pase el CI:

```
push a main
    ↓
[CI] typecheck + lint + test + build
    ↓ solo si pasa
[deploy] curl al webhook de Coolify
    ↓
Coolify hace build y deploy del nuevo código
```

No es necesario conectarse al VPS. Ver el progreso en:
- **GitHub Actions**: pestaña "Actions" del repo — job `deploy via Coolify`
- **Coolify UI**: App → Deployments — logs de build y runtime en tiempo real

## Deploy manual (sin push)

Para forzar un redeploy sin cambiar código (ej: para aplicar nuevas variables de entorno):

Coolify UI → App → botón **"Deploy"**

## Actualizar variables de entorno

1. Coolify UI → App → **Environment Variables**
2. Editar el valor
3. Coolify UI → App → botón **"Restart"** (no hace rebuild — solo reinicia con las nuevas vars)

Si la variable afecta el build (ej: `NEXT_PUBLIC_*`), hacer **"Deploy"** en lugar de "Restart" para reconstruir la imagen.

## Verificar que el deploy fue exitoso

```bash
# Estado de los containers
docker ps --filter "name=puntajes-scout"

# Logs de la app (esperar "Ready in ...ms")
docker logs --tail=50 puntajes-scout-app

# Healthcheck desde afuera
curl -sf https://tu-dominio.org/api/health && echo "OK"
```

O directamente en Coolify UI → App → el indicador de estado debe estar en verde.

## Si la build falla

La versión anterior sigue corriendo. Ver los logs del build en Coolify UI → App → Deployments → el deploy fallido.

Causas comunes:

| Error en los logs | Causa | Fix |
|---|---|---|
| `Cannot find module` | Dependencia nueva no instalada en la imagen | Verificar que `package.json` y el lockfile fueron commiteados |
| `PrismaClientInitializationError` | `DATABASE_URL` incorrecta o Postgres no levantó | Verificar la variable en Coolify UI; `docker logs puntajes-scout-db` |
| `Migration failed to apply` | Conflicto de schema | Ver sección "Rollback con migración" más abajo |
| `next build` falla por OOM | VPS con poca RAM durante la build | Crear swapfile: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile` |

## Rollback

### Sin migración nueva (solo código)

**Opción A — desde Coolify UI** (más simple):

Coolify UI → App → **Deployments** → seleccionar un deploy anterior → **Redeploy**.

**Opción B — revertir con git**:

```bash
git log --oneline -10          # identificar el hash del deploy anterior
git revert <hash-roto>         # crea un commit de reversión
git push origin main           # dispara el CD automáticamente
```

### Con migración aplicada

Requiere el backup hecho antes del deploy. Los datos escritos entre el backup y el rollback se pierden.

```bash
# Ver qué backups hay disponibles
ls -lht /var/backups/puntajes-scout/

# Detener la app (la DB sigue corriendo para el restore)
docker stop puntajes-scout-app

# Restaurar
sudo /srv/puntajes-scout/scripts/restore.sh /var/backups/puntajes-scout/<archivo>.dump

# Revertir el código: hacer un revert commit y pushear, o redeploy de una versión anterior desde Coolify UI
```
