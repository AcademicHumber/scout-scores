#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Backup diario de Postgres a /var/backups/puntajes-scout/.
# Idempotente. Pensado para correr por cron como root.
#
# Uso:
#   ./scripts/backup.sh                   # backup nuevo + rotación
#   ./scripts/backup.sh --no-rotate       # backup sin tocar viejos
#
# Requiere: docker, .env.prod con POSTGRES_USER/PASSWORD/DB en PROJECT_DIR.
# Coolify no respeta container_name — el container se busca por labels de
# Docker Compose. Se puede sobreescribir con: DB_CONTAINER=<id> ./backup.sh
# ----------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/puntajes-scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puntajes-scout}"
LOG_FILE="${LOG_FILE:-/var/log/puntajes-scout/backup.log}"
RETENTION_COUNT="${RETENTION_COUNT:-30}"

mkdir -p "$BACKUP_DIR"
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    local ts
    ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    echo "[$ts] $*" | tee -a "$LOG_FILE"
}

cd "$PROJECT_DIR"

# Cargar POSTGRES_USER, POSTGRES_PASSWORD y POSTGRES_DB del .env.prod.
set -a
# shellcheck disable=SC1091
source ./.env.prod
set +a

# Resolver el container de Postgres. Coolify ignora container_name y usa su
# propio esquema de nombres — buscar por labels de Docker Compose en su lugar.
# Se puede sobreescribir manualmente: DB_CONTAINER=<id> ./scripts/backup.sh
if [[ -z "${DB_CONTAINER:-}" ]]; then
    DB_CONTAINER=$(docker ps -qf "label=com.docker.compose.service=db" \
                              -f "label=coolify.managed=true")
fi

if [[ -z "$DB_CONTAINER" ]]; then
    log "FALLO: no se encontró el container de Postgres"
    log "  Verificar: docker ps --filter 'label=com.docker.compose.service=db'"
    log "  O sobreescribir: DB_CONTAINER=<id> $0"
    exit 1
fi

DB_COUNT=$(echo "$DB_CONTAINER" | wc -w)
if [[ "$DB_COUNT" -gt 1 ]]; then
    log "ADVERTENCIA: $DB_COUNT containers coinciden — usando el primero. Sobreescribir con DB_CONTAINER=<id>."
    DB_CONTAINER=$(echo "$DB_CONTAINER" | awk '{print $1}')
fi

TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE="$BACKUP_DIR/puntajes_scout_${TIMESTAMP}.dump"

log "INICIO backup → $DUMP_FILE (container: $DB_CONTAINER)"

# pg_dump corre dentro del container de Postgres via docker exec.
# --format=custom es comprimido y compatible con pg_restore.
if docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
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
