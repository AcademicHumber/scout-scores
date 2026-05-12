#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Restaura un dump de Postgres en la DB del compose de producción.
#
# Uso:
#   ./scripts/restore.sh                    # restaura el dump más reciente
#   ./scripts/restore.sh /ruta/al/dump      # restaura un dump específico
#
# CUIDADO: dropea todas las conexiones activas y reemplaza la DB existente.
# Pedir confirmación interactiva siempre.
# ----------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/puntajes-scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puntajes-scout}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

cd "$PROJECT_DIR"
set -a
# shellcheck disable=SC1091
source ./.env.prod
set +a

DUMP_FILE="${1:-}"
if [[ -z "$DUMP_FILE" ]]; then
    DUMP_FILE=$(find "$BACKUP_DIR" -maxdepth 1 -name 'puntajes_scout_*.dump' \
        -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)
fi

if [[ ! -f "$DUMP_FILE" ]]; then
    echo "ERROR: dump no encontrado: $DUMP_FILE" >&2
    exit 1
fi

echo "Restaurando: $DUMP_FILE"
echo "Hacia: $POSTGRES_DB en el container 'db'"
read -r -p "¿Continuar? Esto sobreescribe la DB actual [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Abortado."
    exit 0
fi

# Pasar el dump por stdin a pg_restore en el container.
# --clean dropea objetos antes de recrear; --if-exists evita error si no existen.
docker compose -f "$COMPOSE_FILE" exec -T db \
    pg_restore \
        --username="$POSTGRES_USER" \
        --dbname="$POSTGRES_DB" \
        --clean \
        --if-exists \
        --no-owner \
        --no-acl \
        --verbose \
    < "$DUMP_FILE"

echo "OK restore completado."
echo "Recordá: si el dump es de antes de una migración aplicada, re-correr 'docker compose up -d migrate'."
