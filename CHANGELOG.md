# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Site de apresentação do Ascend (`apps/site`), publicado no GitHub Pages pelo workflow `Site`: daisyUI 5 com os temas do app, animações com GSAP (ScrollTrigger) e Motion, rolagem suave com Lenis, ícones Lucide e fontes servidas pelo próprio site (Fontsource). Tabelas, ranks e curva de XP são gerados a partir do `@rpg/engine` no build.

### Adicionado
- App Android (`apps/mobile`, Capacitor 8): abre a interface publicada, com ícone, splash e tela própria sem conexão. O APK é compilado em todo PR e anexado a cada GitHub Release, assinado quando os segredos da chave estão configurados. Guia em `docs/15-app-android.md`.
- Wiki do GitHub com guia de uso (primeiros passos, regras do jogo, missões e penalidades, áreas do app, integrações, deploy, desenvolvimento e perguntas frequentes), versionada em `docs/wiki` e publicada pelo workflow `Wiki`.
- Código de conduta (`CODE_OF_CONDUCT.md`), baseado no Contributor Covenant 2.1.

### Corrigido
- A data de cadastro do usuário passa a vir do relógio da aplicação, não do banco. A avaliação diária começa nesse dia, e a diferença fazia os testes de hábitos e penalidades falharem a partir de 23/10/2026 (o relógio dos testes começa em 21/10).

### Alterado
- Repositório renomeado para `FalkyriaAscend`: links da documentação, da wiki, do CHANGELOG e dos templates de issue atualizados.
- Dependências atualizadas: react-router 8, lucide-react 1, @fastify/static 10, tsup 9, Playwright 1.64, Prettier 3.9 e typescript-eslint 8.72; Actions `checkout`, `setup-node` e `upload-artifact` v7, `docker/build-push-action` v7 e `docker/setup-buildx-action` v4.

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

[Não lançado]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.2.1...develop
[0.2.1]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Dracon-46/FalkyriaAscend/releases/tag/v0.1.0
