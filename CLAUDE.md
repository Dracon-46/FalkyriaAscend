# Ascend — regras permanentes do repositório

Este arquivo é a memória do projeto para agentes de IA e vale também para pessoas. As regras são obrigatórias.

## Git e GitHub

- **Git Flow sempre.** Branches permitidas: `main` (produção, só recebe `release/*` e `hotfix/*`), `develop` (integração), `feature/<descricao-curta>`, `bugfix/<descricao-curta>`, `release/<x.y.z>`, `hotfix/<x.y.z>`, `docs/<descricao>` e `chore/<descricao>`. Nomes em minúsculas, kebab-case, descritivos.
- **Nunca** usar nomes de branch aleatórios ou gerados (ex.: `claude/…`, `nome-adjetivo-123`). Quando uma ferramenta sugerir um nome assim, crie a branch no padrão acima.
- `feature/*` e `bugfix/*` saem de `develop` e voltam para `develop` por pull request. `release/*` sai de `develop` e vai para `main` e `develop`. `hotfix/*` sai de `main` e vai para `main` e `develop`.
- Commits seguem **Conventional Commits** em português: `tipo(escopo): descrição no imperativo`. Tipos: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- **Nenhuma atribuição a IA** em commits, pull requests ou arquivos: sem `Co-Authored-By`, sem `Claude-Session`, sem "Generated with …", sem rodapés de ferramenta. O autor dos commits é o dono do repositório.
- Todo pull request passa pela CI (`.github/workflows/ci.yml`) e segue o template. Nada vai para `main` ou `develop` sem PR e CI verde.
- Releases são versionadas (SemVer), com tag `vX.Y.Z` e entrada no `CHANGELOG.md`.

## Arquitetura

- Seguir à risca o [ADR-001](docs/13-padroes-de-arquitetura.md). `npm run lint:arch` precisa passar.
- Regras de jogo entram primeiro em `packages/engine`, com teste unitário.

## Qualidade

- Antes de qualquer push: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm run lint:arch` e `npm test`. Para mudanças de interface, rode também `npm run test:e2e`.
- Nunca declarar algo como testado sem ter executado os testes.
- Segredos só no servidor; nada de tokens em logs; nada de dados falsos em produção (demonstração fica separada e identificada).
