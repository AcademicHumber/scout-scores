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
