#!/usr/bin/env bash
# Valida o par (branch de origem → branch de destino) de um pull request segundo o Git Flow.
# Uso: check-gitflow.sh <head_ref> <base_ref>
set -euo pipefail

head="${1:?branch de origem obrigatória}"
base="${2:?branch de destino obrigatória}"

slug='[a-z0-9]+(-[a-z0-9]+)*'
semver='[0-9]+\.[0-9]+\.[0-9]+'

fail() {
  echo "::error::$1"
  echo "Consulte CONTRIBUTING.md (seção Git Flow)."
  exit 1
}

case "$head" in
  feature/* | bugfix/* | docs/* | chore/*)
    [[ "$head" =~ ^(feature|bugfix|docs|chore)/${slug}$ ]] || fail "Nome inválido: '$head'. Use <tipo>/<descricao-em-kebab-case>."
    [[ "$base" == "develop" ]] || fail "'$head' deve ser integrada em 'develop', não em '$base'."
    ;;
  release/*)
    [[ "$head" =~ ^release/${semver}$ ]] || fail "Nome inválido: '$head'. Use release/X.Y.Z."
    [[ "$base" == "main" || "$base" == "develop" ]] || fail "'$head' deve ir para 'main' (e voltar para 'develop')."
    ;;
  hotfix/*)
    [[ "$head" =~ ^hotfix/${semver}$ ]] || fail "Nome inválido: '$head'. Use hotfix/X.Y.Z."
    [[ "$base" == "main" || "$base" == "develop" || "$base" =~ ^release/ ]] || fail "'$head' deve ir para 'main' e 'develop'."
    ;;
  dependabot/*)
    [[ "$base" == "develop" ]] || fail "Atualizações do Dependabot entram em 'develop', não em '$base'."
    ;;
  main)
    [[ "$base" == "develop" ]] || fail "'main' só pode ser sincronizada de volta em 'develop'."
    ;;
  develop)
    fail "'develop' não é integrada por PR; abra uma release/X.Y.Z."
    ;;
  *)
    fail "Branch fora do Git Flow: '$head'. Use feature/, bugfix/, release/, hotfix/, docs/ ou chore/."
    ;;
esac

echo "Git Flow ok: $head → $base"
