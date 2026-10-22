#!/usr/bin/env bash
# Imprime a seção de uma versão do CHANGELOG.md (sem o título), para as notas da release.
# Uso: release-notes.sh <versão> [arquivo]
set -euo pipefail

version="${1:?versão obrigatória (ex.: 0.2.0)}"
file="${2:-CHANGELOG.md}"

notes="$(awk -v v="$version" '
  index($0, "## [" v "]") == 1 { inside = 1; next }
  inside && /^## \[/ { exit }
  inside && /^\[[^]]+\]: / { next }
  inside { print }
' "$file")"

if [[ -z "${notes//[[:space:]]/}" ]]; then
  echo "::error::Versão $version não encontrada no $file" >&2
  exit 1
fi
printf '%s\n' "$notes"
