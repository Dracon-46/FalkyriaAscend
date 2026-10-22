#!/usr/bin/env bash
# Restaura um backup gerado por backup.sh. ATENÇÃO: substitui os dados do banco de destino.
# Uso: DATABASE_URL=... bash apps/api/scripts/restore.sh arquivo.dump
set -euo pipefail
FILE="${1:?Informe o arquivo .dump}"
: "${DATABASE_URL:?Defina DATABASE_URL}"
read -r -p "Restaurar $FILE em $DATABASE_URL? Os dados atuais serão substituídos. Digite RESTAURAR: " ok
[ "$ok" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$FILE"
echo "Restauração concluída. Rode a verificação de integridade em Administração."
