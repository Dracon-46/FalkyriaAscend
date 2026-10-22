# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

## [0.2.1] - 2026-10-22

### Corrigido
- Workflow `Release`: no disparo manual, o checkout é do commit do workflow, e o alvo informado só define onde a tag aponta. Antes, publicar uma versão antiga falhava porque o script de notas não existia naquele commit.

## [0.2.0] - 2026-10-22

### Adicionado
- Deploy em produção com Supabase (PostgreSQL) e Render (Docker): `render.yaml`, guia em `docs/14-deploy.md`, TLS configurável na conexão com o banco (`DATABASE_SSL`, `DATABASE_CA_CERT`) e tamanho do pool (`DATABASE_POOL_MAX`).
- Workflow `Release`: depois da CI verde na `main`, cria a tag `vX.Y.Z` e a GitHub Release com as notas do CHANGELOG.

### Corrigido
- Validação do Git Flow aceita as branches do Dependabot (`dependabot/…` → `develop`), e o Dependabot deixa de propor versões major do Node e de `@types/node`.

## [0.1.0] - 2026-10-22

Primeira versão do Ascend.

### Adicionado
- Motor de gamificação (`@rpg/engine`): curva de XP calibrada por simulação, recompensas com retornos decrescentes e limites diários, penalidades com tetos e proteções (descanso, doença, modo de recuperação; necessidades básicas nunca punidas), sequências, conquistas e economia com livro-razão imutável.
- API (Fastify + PostgreSQL): missões, hábitos, metas, estudos, treinos, loja, inventário, conquistas, temporadas, estatísticas, histórico, avaliador diário, admin com CRUD completo e auditoria, integrações Strava/Lyfta/Hevy.
- Interface (React + PWA): 15 áreas, admin, gráfico radar de atributos e cinco temas (Medieval, Vampiros, Anjos, Sistema e Personalizado).
- Docker, backup e restauração, dados de demonstração separados, testes unitários, de integração e E2E.
- Arquitetura em camadas (ADR-001): controllers → casos de uso (Unit of Work) → serviços de domínio → repositórios e consultas, com 17 regras de dependência verificadas por `npm run lint:arch`.
- Git Flow, CI no GitHub Actions (formatação, lint, tipos, arquitetura, motor, API com PostgreSQL, build, E2E e Docker), validação de branch e título de PR, templates de PR e issue, CODEOWNERS, Dependabot, CONTRIBUTING e SECURITY.
- Prettier e ESLint (TypeScript e React hooks).

### Conhecido
- Integrações Strava, Lyfta e Hevy implementadas e testadas com dados de exemplo, mas ainda não validadas com credenciais reais.

[Não lançado]: https://github.com/Dracon-46/Sistema-Gameficado/compare/v0.2.1...develop
[0.2.1]: https://github.com/Dracon-46/Sistema-Gameficado/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Dracon-46/Sistema-Gameficado/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Dracon-46/Sistema-Gameficado/releases/tag/v0.1.0
