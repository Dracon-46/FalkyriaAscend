# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Git Flow (`main`/`develop`/`feature`/`release`/`hotfix`), CI no GitHub Actions (tipos, arquitetura, motor, API com PostgreSQL, build, E2E e Docker), templates de PR e issue, CODEOWNERS, Dependabot, CONTRIBUTING e SECURITY.
- ADR-001: arquitetura em camadas com regras de dependência verificadas por `npm run lint:arch`.

### Alterado
- API reorganizada em `http/`, `application/`, `persistence/` (repositórios, consultas e unit of work), `integrations/`, `shared/` e `config/`.

## [0.1.0]

### Adicionado
- Motor de gamificação (`@rpg/engine`): curva de XP calibrada por simulação, recompensas, penalidades com tetos e proteções, sequências, conquistas e economia.
- API (Fastify + PostgreSQL): missões, hábitos, metas, estudos, treinos, loja, inventário, conquistas, temporadas, estatísticas, histórico, avaliador diário, admin com CRUD completo e auditoria, integrações Strava/Lyfta/Hevy.
- Interface (React + PWA): 15 áreas, admin, gráfico radar de atributos e cinco temas.
- Docker, backup e restauração, dados de demonstração separados, testes unitários, de integração e E2E.
