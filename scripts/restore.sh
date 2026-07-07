#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# Restaura un dump de Postgres en la DB de producción.
#
# Uso:
#   ./scripts/restore.sh                    # restaura el dump más reciente
#   ./scripts/restore.sh /ruta/al/dump      # restaura un dump específico
#
# Requiere: docker, .env.prod con POSTGRES_USER/PASSWORD/DB en PROJECT_DIR.
# Coolify no respeta container_name — el container se busca por labels de
# Docker Compose. Se puede sobreescribir con: DB_CONTAINER=<id> ./restore.sh
# (mismo mecanismo que backup.sh — necesario cuando Postgres corre como
# recurso de Database separado en Coolify, no como servicio de este compose).
#
# CUIDADO: dropea todas las conexiones activas y reemplaza la DB existente.
# Pedir confirmación interactiva siempre.
# ----------------------------------------------------------------------------
set -euo pipefail

PROJECT_DIR="${PROJECT_DIR:-/srv/puntajes-scout}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/puntajes-scout}"

cd "$PROJECT_DIR"
set -a
# shellcheck disable=SC1091
source ./.env.prod
set +a

if [[ -z "${DB_CONTAINER:-}" ]]; then
    DB_CONTAINER=$(docker ps -qf "label=com.docker.compose.service=db" \
                              -f "label=coolify.managed=true")
fi

if [[ -z "$DB_CONTAINER" ]]; then
    echo "ERROR: no se encontró el container de Postgres" >&2
    echo "  Verificar: docker ps --filter 'label=com.docker.compose.service=db'" >&2
    echo "  O sobreescribir: DB_CONTAINER=<id> $0" >&2
    exit 1
fi

DB_COUNT=$(echo "$DB_CONTAINER" | wc -w)
if [[ "$DB_COUNT" -gt 1 ]]; then
    echo "ADVERTENCIA: $DB_COUNT containers coinciden — usando el primero. Sobreescribir con DB_CONTAINER=<id>." >&2
    DB_CONTAINER=$(echo "$DB_CONTAINER" | awk '{print $1}')
fi

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
echo "Hacia: $POSTGRES_DB en el container '$DB_CONTAINER'"
read -r -p "¿Continuar? Esto sobreescribe la DB actual [y/N]: " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Abortado."
    exit 0
fi

# Pasar el dump por stdin a pg_restore en el container.
# --clean dropea objetos antes de recrear; --if-exists evita error si no existen.
docker exec -i -e PGPASSWORD="$POSTGRES_PASSWORD" "$DB_CONTAINER" \
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
echo "Recordá: si el dump es de antes de una migración aplicada, re-correr el deploy para que el servicio 'migrate' la vuelva a aplicar."
