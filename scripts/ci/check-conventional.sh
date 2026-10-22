#!/usr/bin/env bash
# Valida uma linha de assunto no formato Conventional Commits.
# Uso: check-conventional.sh "<tipo>(<escopo>)!: descrição"
set -euo pipefail

subject="${1:?assunto obrigatório}"
pattern='^(feat|fix|refactor|perf|test|docs|build|ci|chore|style|revert)(\([a-z0-9-]+\))?!?: .{3,100}$'

if [[ "$subject" =~ $pattern ]]; then
  echo "Conventional Commits ok: $subject"
else
  echo "::error::Fora do padrão Conventional Commits: '$subject'"
  echo "Formato: tipo(escopo): descrição — tipos: feat, fix, refactor, perf, test, docs, build, ci, chore, style, revert."
  exit 1
fi
