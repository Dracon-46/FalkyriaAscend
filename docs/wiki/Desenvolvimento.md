# Desenvolvimento

## Estrutura

```
apps/api            API Fastify em camadas: http → casos de uso → serviços de domínio → repositórios e consultas
apps/web            interface React (PWA)
packages/engine     regras do jogo: curva de XP, recompensas, penalidades, sequências e economia (puro e testado)
packages/contracts  esquemas de entrada compartilhados (Zod)
e2e/                testes ponta a ponta (Playwright)
docs/               documentação técnica; docs/wiki é a fonte desta wiki
```

A arquitetura segue o [ADR-001](https://github.com/Dracon-46/Sistema-Gameficado/blob/main/docs/13-padroes-de-arquitetura.md), com 17 regras de dependência verificadas por `npm run lint:arch`. Regras de jogo entram primeiro no `packages/engine`, com teste unitário.

## Git Flow

| Branch | Sai de | Volta para |
|---|---|---|
| `feature/*`, `bugfix/*`, `docs/*`, `chore/*` | `develop` | `develop` (squash) |
| `release/X.Y.Z` | `develop` | `main` (merge commit) e depois `develop` |
| `hotfix/X.Y.Z` | `main` | `main` e `develop` |

Commits e títulos de PR seguem **Conventional Commits** em português (`feat(missoes): permite reagendar…`). A CI recusa branches fora do padrão.

## Antes de abrir um PR

```bash
npm run format:check && npm run lint && npm run typecheck && npm run lint:arch
npm test            # motor, interface e API com PostgreSQL real
npm run test:e2e    # quando mudar interface ou fluxo
```

## CI e releases

| Workflow | O que faz |
|---|---|
| **CI** | Formatação, lint, tipos, arquitetura, testes do motor e da API, build, E2E e imagem Docker |
| **Convenções de PR** | Valida Git Flow e Conventional Commits |
| **Release** | Depois da CI verde na `main`, cria a tag `vX.Y.Z` e a GitHub Release com as notas do CHANGELOG |
| **Wiki** | Publica `docs/wiki` nesta wiki a cada push na `main` |

Guia completo: [CONTRIBUTING.md](https://github.com/Dracon-46/Sistema-Gameficado/blob/main/CONTRIBUTING.md).
