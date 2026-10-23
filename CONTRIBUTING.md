# Como contribuir com o Ascend

## Git Flow

| Branch | Sai de | Volta para | Como entra | Observação |
|---|---|---|---|---|
| `main` | — | — | PR de `release/*` ou `hotfix/*` (merge commit) | Produção. Cada merge recebe a tag `vX.Y.Z`. |
| `develop` | `main` | — | PR de `feature/*`, `bugfix/*`, `docs/*`, `chore/*` (squash) | Integração; sempre verde. |
| `feature/<descricao>` | `develop` | `develop` | PR | Funcionalidade nova. |
| `bugfix/<descricao>` | `develop` | `develop` | PR | Correção de algo ainda não lançado. |
| `docs/<descricao>`, `chore/<descricao>` | `develop` | `develop` | PR | Documentação e manutenção. |
| `dependabot/…` | `develop` | `develop` | PR (squash) | Criada pelo Dependabot. Atualizações major do Node e de `@types/node` são ignoradas: trocar a versão do Node é decisão explícita, só para LTS. |
| `release/X.Y.Z` | `develop` | `main` e `develop` | PR | Congela a versão: só correções, CHANGELOG e versão. |
| `hotfix/X.Y.Z` | `main` | `main` e `develop` | PR | Correção urgente em produção. |

Regras:

- Nomes em minúsculas e kebab-case (`feature/avatar-2d`, `release/0.2.0`). Nomes aleatórios ou gerados por ferramentas são proibidos. A CI recusa PRs fora do padrão (`scripts/ci/check-gitflow.sh`).
- Ninguém faz push direto em `main` ou `develop`.
- Uma branch, um assunto. PRs pequenos são revisados mais rápido.

```bash
git switch develop && git pull
git switch -c feature/minha-funcionalidade
# ... commits ...
git push -u origin feature/minha-funcionalidade   # e abra o PR para develop
```

## Commits e títulos de PR

[Conventional Commits](https://www.conventionalcommits.org/pt-br/), em português e no imperativo:

```
feat(missoes): permite reagendar missão antes do prazo
fix(api): impede compra duplicada com a mesma chave de idempotência
refactor(persistence): extrai repositório da carteira
```

Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`. Use `!` para mudanças incompatíveis (`feat(api)!: …`). Escopos usuais: `engine`, `api`, `web`, `persistence`, `admin`, `integracoes`, `e2e`, `docker`.

Commits não levam rodapés de ferramentas nem coautoria automática.

## Antes de abrir o PR

```bash
npm run format:check
npm run lint
npm run typecheck
npm run lint:arch       # regras do ADR-001
npm test                # motor + API com PostgreSQL real
npm run test:e2e        # se mudou interface ou fluxo
```

Preencha o template do PR e informe só os testes que você realmente executou.

## Pipeline (GitHub Actions)

| Workflow | Quando | Jobs |
|---|---|---|
| `CI` | PR para `main`, `develop`, `release/**`; push em `main`, `develop`, `release/**`, `hotfix/**` | qualidade (Prettier, ESLint, typecheck e arquitetura), testes do motor, testes da API com PostgreSQL, build, E2E Playwright e imagem Docker |
| `Convenções de PR` | todo PR | origem/destino no Git Flow e título em Conventional Commits |
| `Release` | CI verde em push na `main`; manual | tag `vX.Y.Z` e GitHub Release com as notas do CHANGELOG |
| `Wiki` | push na `main` que altere `docs/wiki`; manual | publica `docs/wiki` na wiki do GitHub (páginas removidas também saem) |
| Dependabot | semanal/mensal | atualizações de npm, Actions e Docker, sempre contra `develop` |

## Configuração recomendada do repositório (Settings)

Isto é feito pelo dono do repositório na interface do GitHub:

1. **Branch padrão:** `develop`.
2. **Regras (Rulesets) para `main` e `develop`:** exigir PR; exigir os checks `Qualidade (formatação, lint, tipos e arquitetura)`, `Testes do motor`, `Testes de integração da API`, `Build de produção`, `Testes ponta a ponta (Playwright)` e `Git Flow e Conventional Commits`; exigir branch atualizada; exigir revisão de Code Owners; bloquear force push e exclusão; exigir histórico linear apenas em `develop`.
3. **Merge:** permitir *squash* (padrão para `develop`) e *merge commit* (para `release/*` e `hotfix/*` em `main`); desativar *rebase merge*; apagar a branch após o merge.
4. **Segurança:** ativar Dependabot alerts, secret scanning e push protection.

## Versionamento e release

[SemVer](https://semver.org/lang/pt-BR/). Fluxo:

```bash
git switch develop && git pull
git switch -c release/0.2.0
# atualizar version nos package.json e mover "Não lançado" para [0.2.0] no CHANGELOG.md
git push -u origin release/0.2.0     # PR para main (merge commit)
# depois do merge: PR de main → develop para trazer de volta os ajustes da release
```

A tag `v0.2.0` e a GitHub Release são criadas pelo workflow `Release` assim que a CI passa no commit da `main`. As notas vêm da seção `[0.2.0]` do CHANGELOG; sem essa seção, a release falha. Para publicar uma versão manualmente (por exemplo, uma anterior ao workflow), use **Actions → Release → Run workflow** com a versão e o SHA do commit.

## Wiki

A wiki do GitHub é gerada a partir de `docs/wiki`: edite ali e abra um PR. Editar direto na wiki não adianta, porque a próxima publicação sobrescreve. Links entre páginas usam o nome da página sem extensão (`[Primeiros passos](Primeiros-passos)`).

## Arquitetura

Leia o [ADR-001](docs/13-padroes-de-arquitetura.md) antes de mexer na API. Regras de jogo entram primeiro em `packages/engine`, com teste.
