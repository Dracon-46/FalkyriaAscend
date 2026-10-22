#!/usr/bin/env bash
# Backup lógico do PostgreSQL (formato custom, compactado) com retenção.
# Uso: DATABASE_URL=... bash apps/api/scripts/backup.sh [diretório] [dias de retenção]
set -euo pipefail
DIR="${1:-$(dirname "$0")/../../../backups}"
KEEP_DAYS="${2:-30}"
: "${DATABASE_URL:?Defina DATABASE_URL}"
mkdir -p "$DIR"
FILE="$DIR/ascend-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --no-owner --dbname="$DATABASE_URL" --file="$FILE"
pg_restore --list "$FILE" > /dev/null   # verifica que o arquivo é legível
find "$DIR" -name 'ascend-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "Backup gravado em $FILE"
