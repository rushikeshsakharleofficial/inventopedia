#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-./backups/postgres}"
CONTAINER="${POSTGRES_CONTAINER:-inventopedia-postgres}"
DB="${POSTGRES_DB:-inventopedia}"
USER="${POSTGRES_USER:-inventopedia}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${DB}_${STAMP}.sql.gz"

docker exec "$CONTAINER" pg_dump -U "$USER" "$DB" | gzip > "$OUT"

find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -delete

echo "Backup written: $OUT"
