# Actualizar la app en el VPS

Guía de referencia rápida para deployar una nueva versión. Asume que el sistema ya está corriendo (ver `01-deploy-vps.md` para el deploy inicial).

## Flujo normal

```bash
# 1. Entrar al VPS y posicionarse en el proyecto
ssh scout@IP_DEL_VPS
cd /srv/puntajes-scout

# 2. Backup preventivo (siempre antes de deployar)
sudo ./scripts/backup.sh --no-rotate

# 3. Traer los cambios del repo
git pull origin main

# 4. Reconstruir la imagen de la app
docker compose --env-file .env.prod -f docker-compose.prod.yml build app

# 5. Reiniciar con la nueva imagen
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

El servicio `migrate` corre automáticamente al hacer `up -d` y aplica cualquier migración nueva antes de que el `app` reciba tráfico. Si no hay migraciones, termina en segundos sin efecto.

## Verificar que el deploy fue exitoso

```bash
# Estado de los containers (todos deben estar healthy)
docker compose --env-file .env.prod -f docker-compose.prod.yml ps

# Logs de la app (esperar "Ready in ...ms")
docker compose --env-file .env.prod -f docker-compose.prod.yml logs --tail=50 app

# Logs de migraciones (verificar que aplicó y terminó sin errores)
docker compose --env-file .env.prod -f docker-compose.prod.yml logs migrate

# Healthcheck desde afuera
curl -sf https://tu-dominio.org/api/health && echo "OK"
```

## Si la build falla

Los containers en producción siguen corriendo con la versión anterior. Investigar el error:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml logs app
```

Causas comunes:

| Error en los logs | Causa | Fix |
|---|---|---|
| `Cannot find module` | Dependencia nueva no instalada en la imagen | Hacer `build` de nuevo; el Dockerfile corre `pnpm install` — verificar que `package.json` fue commiteado |
| `PrismaClientInitializationError` | `DATABASE_URL` no definida o Postgres no levantó | `docker compose ps db`; si está unhealthy, `docker compose logs db` |
| `Migration failed to apply` | Conflicto de schema | Ver sección "Rollback con migración" más abajo |
| `next build` falla por TS/lint | Error de tipado en el código | Corregir y hacer nuevo commit/push antes de deployar |
| OOM (sin memoria) | VPS con poca RAM durante la build | Crear swapfile (ver `01-deploy-vps.md § 12`) o hacer la build en otro lugar y subir la imagen |

## Si necesitás forzar el reinicio de un servicio

```bash
# Reiniciar solo la app (sin rebuild)
docker compose --env-file .env.prod -f docker-compose.prod.yml restart app

# Reiniciar todo (db incluida — cortar tráfico brevemente)
docker compose --env-file .env.prod -f docker-compose.prod.yml down
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

## Rollback

### Sin migración nueva (solo código)

```bash
git log --oneline -10          # identificar el hash del deploy anterior
git checkout <hash-anterior>
docker compose --env-file .env.prod -f docker-compose.prod.yml build app
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d
```

### Con migración aplicada

Requiere el backup hecho en el paso 2. Los datos escritos entre el backup y el rollback se pierden.

```bash
# Ver qué backups hay disponibles
ls -lht /var/backups/puntajes-scout/

# Detener app y caddy (db sigue corriendo para el restore)
docker compose --env-file .env.prod -f docker-compose.prod.yml stop app caddy

# Restaurar
sudo ./scripts/restore.sh /var/backups/puntajes-scout/<archivo>.dump

# Volver al código anterior y rebuilder
git checkout <hash-anterior>
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

## Alias útil (opcional)

Para evitar escribir el comando largo cada vez, agregar al `~/.bashrc` del VPS:

```bash
alias dc-scout='docker compose --env-file /srv/puntajes-scout/.env.prod -f /srv/puntajes-scout/docker-compose.prod.yml'
```

Después de `source ~/.bashrc`:

```bash
dc-scout ps
dc-scout logs -f app
dc-scout build app && dc-scout up -d
```
