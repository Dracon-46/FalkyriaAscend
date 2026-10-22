# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

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

[Não lançado]: https://github.com/Dracon-46/Sistema-Gameficado/compare/v0.1.0...develop
[0.1.0]: https://github.com/Dracon-46/Sistema-Gameficado/releases/tag/v0.1.0
