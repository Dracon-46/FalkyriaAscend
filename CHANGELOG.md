# Changelog

Todas as mudanças relevantes deste projeto. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/), versionamento [SemVer](https://semver.org/lang/pt-BR/).

## [Não lançado]

### Adicionado
- Confirmação de e-mail no cadastro: quem cria conta recebe um link (válido por 24 h, de uso único, guardado só como hash) e só entra depois de confirmar. A tela de entrada permite reenviar o link (no máximo um por minuto, sem revelar se o e-mail existe). O envio usa SMTP, por padrão o Gmail com senha de app (`SMTP_USER`, `SMTP_PASSWORD`). Com o SMTP configurado a confirmação é exigida (`EMAIL_VERIFICATION=auto`). Contas existentes, a primeira conta e as criadas pelo Admin já entram confirmadas.

### Corrigido
- Site público em branco: o repositório de distribuição se chama `Ascend` e o caminho do GitHub Pages diferencia maiúsculas, então o site buscava os arquivos em `/ascend/` e não achava nada. O build usa `/Ascend/` e os links (README, documentação, wiki, site) apontam para https://dracon-46.github.io/Ascend/.

## [0.4.3] - 2026-10-27

### Alterado
- Código-fonte privado, distribuição pública separada: o site e o APK passam a ser publicados no repositório público [`Dracon-46/ascend`](https://github.com/Dracon-46/ascend), que não recebe código. O site vai compilado e sem source maps para o branch `gh-pages`. Cada release pública leva o APK versionado e a cópia fixa `Ascend.apk`. Guia em `docs/16-distribuicao.md`.
- Site: os botões "Baixar para Android" baixam o APK direto (`releases/latest/download/Ascend.apk`). Os links para o código e para a wiki saíram; entraram "Entrar" e "Abrir no navegador", que levam ao app.

## [0.4.2] - 2026-10-23

### Alterado
- Cadastro aberto por padrão em produção (`ALLOW_REGISTRATION=true` no `render.yaml`): o primeiro usuário continua sendo o administrador, e os seguintes entram como usuários comuns, com acesso só aos próprios dados e sem acesso à Administração. Teste de ponta a ponta cobre esse caminho.

### Corrigido
- Deploy no Render travado depois da 0.4.1. Com `autoDeployTrigger: checksPass`, o Render esperava todos os checks do commit, inclusive o smoke de produção, que por sua vez espera o deploy. O Render agora publica a cada commit na `main` (`autoDeployTrigger: commit`). A `main` só recebe PRs com a CI verde, e o smoke confere o app depois.

## [0.4.1] - 2026-10-23

### Adicionado
- Smoke de produção (workflow `Smoke de produção` e `npm run test:smoke`): testes de ponta a ponta com Playwright contra o app publicado, sem criar dados. Rodam depois de cada release (esperando o Render publicar o commit dela), a cada 6 horas e sob demanda. Conferem API e banco no ar, proteção CSRF, tela de entrada no desktop e no celular e o PWA. As execuções periódicas também evitam que o Supabase pause o projeto por inatividade.
- `/api/health` informa o commit publicado (`RENDER_GIT_COMMIT`, preenchido pelo Render).

### Corrigido
- Primeira execução: o cadastro do fundador feito na tela de entrada (`/entrar`) enviava um login e falhava com "E-mail ou senha inválidos". Agora cadastra. A tela também espera o servidor responder (o plano gratuito do Render leva até um minuto para acordar) e oferece "Tentar de novo" se ele não responder, em vez de mostrar o login sem saber se já existe conta.

## [0.4.0] - 2026-10-23

### Adicionado
- Site de apresentação do Ascend (`apps/site`), publicado no GitHub Pages pelo workflow `Site`: daisyUI 5 com os temas do app, animações com GSAP (ScrollTrigger) e Motion, rolagem suave com Lenis, ícones Lucide e fontes servidas pelo próprio site (Fontsource). Tabelas, ranks e curva de XP são gerados a partir do `@rpg/engine` no build.
- Animações de recompensa no app com Motion: subida de nível com raios, faíscas e contagem até o novo nível; avisos de recompensa e de conquista com entrada em destaque; moedas e XP do cabeçalho contam até o novo valor, com um "+N XP" ao ganhar experiência. Tudo respeita a opção de movimento reduzido do app e do sistema.

### Corrigido
- APK assinado: espaços e quebras de linha coladas junto com os segredos da chave (`ANDROID_KEYSTORE_*`, `ANDROID_KEY_*`) passam a ser descartados, em vez de quebrar a assinatura.
- Workflow `Android`: antes do build, confere se a senha abre o keystore, se o alias existe e se a senha da chave bate, e diz qual segredo está errado (sem exibir valores).

## [0.3.0] - 2026-10-23

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

[Não lançado]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.4.3...develop
[0.4.3]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Dracon-46/FalkyriaAscend/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Dracon-46/FalkyriaAscend/releases/tag/v0.1.0
