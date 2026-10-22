## Objetivo

<!-- O que muda e por quê. Referencie a issue: Closes #123 -->

## Tipo de mudança

- [ ] `feat`: nova funcionalidade
- [ ] `fix` / `bugfix`: correção
- [ ] `refactor`: sem mudança de comportamento
- [ ] `docs`, `test`, `ci`, `build` ou `chore`
- [ ] **Quebra compatibilidade** (dados, API ou configuração)

## Como foi testado

<!-- Liste os comandos executados e o resultado real. Não marque o que não foi executado. -->

- [ ] `npm run format:check`
- [ ] `npm run typecheck`
- [ ] `npm run lint:arch`
- [ ] `npm test` (motor + API com banco real)
- [ ] `npm run test:e2e` (quando há mudança de interface ou fluxo)

## Checklist

- [ ] Branch segue o Git Flow (`feature/…` → `develop`, `release/X.Y.Z` → `main`, `hotfix/X.Y.Z` → `main`)
- [ ] Título no formato Conventional Commits
- [ ] Regras de jogo novas estão no motor e têm teste unitário
- [ ] Migração criada com `npm run db:generate` (se o schema mudou)
- [ ] Documentação atualizada (`docs/`, README, CHANGELOG)
- [ ] Sem segredos, tokens ou dados pessoais no código, nos logs ou nos testes
