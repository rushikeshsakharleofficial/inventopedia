#!/usr/bin/env sh
set -eu

UPLOAD_DIR="${UPLOAD_DIR:-./uploads}"
BACKUP_DIR="${BACKUP_DIR:-./backups/uploads}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/uploads_${STAMP}.tar.gz"

tar -czf "$OUT" "$UPLOAD_DIR"

find "$BACKUP_DIR" -type f -name "uploads_*.tar.gz" -mtime +14 -delete

echo "Backup written: $OUT"
