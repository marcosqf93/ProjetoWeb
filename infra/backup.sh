#!/usr/bin/env bash
set -euo pipefail

DATE=$(date +%F-%H%M)
OUT_DIR="/var/backups/podben"
DB_URL="${DATABASE_URL:?DATABASE_URL not set}"
ENC_KEY="${BACKUP_KEY:?BACKUP_KEY not set}"

mkdir -p "$OUT_DIR"

pg_dump "$DB_URL" | gzip > "$OUT_DIR/podben-$DATE.sql.gz"
openssl enc -aes-256-cbc -salt -pbkdf2 -in "$OUT_DIR/podben-$DATE.sql.gz" -out "$OUT_DIR/podben-$DATE.sql.gz.enc" -k "$ENC_KEY"
rm "$OUT_DIR/podben-$DATE.sql.gz"

find "$OUT_DIR" -name '*.enc' -mtime +30 -delete
