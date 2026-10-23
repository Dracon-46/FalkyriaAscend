# Ascend

**RPG pessoal de vida real, um produto Falkyria.** Ascend transforma rotina, estudos, trabalho, treinos, hábitos e objetivos em progressão de longo prazo: níveis com dificuldade crescente, atributos, maestria, missões, penalidades previsíveis, moedas, loja, conquistas, temporadas e estatísticas. A interface tem cinco temas (Medieval, Vampiros, Anjos, Sistema e Personalizado).

**Conheça o projeto:** [dracon-46.github.io/FalkyriaAscend](https://dracon-46.github.io/FalkyriaAscend/)

## Stack

| Camada | Tecnologia |
|---|---|
| Interface | React 19, Vite 7, TypeScript, Tailwind CSS 4, TanStack Query, Recharts, PWA |
| Android | Capacitor 8 (APK publicado em cada release) |
| API | Node.js 22, Fastify 5, Drizzle ORM, Zod |
| Banco | PostgreSQL 16 (migrações versionadas) |
| Regras | `@rpg/engine`: motor de gamificação puro e testado |
| Testes | Vitest (unidade e integração com banco real) e Playwright (ponta a ponta) |

```
apps/api            API em camadas (http → casos de uso → serviços → repositórios), avaliador diário, admin, integrações
apps/web            interface (16 áreas + administração)
apps/mobile         app Android (Capacitor) que abre a interface publicada
apps/site           site de apresentação (GitHub Pages): daisyUI, GSAP, Motion e Lenis
packages/engine     regras: curva de XP, recompensas, penalidades, sequências, economia
packages/contracts  esquemas de entrada compartilhados (Zod)
docs/               requisitos, arquitetura, modelo de dados, regras, simulações…
e2e/                testes Playwright
```

## Como rodar (desenvolvimento)

Pré-requisitos: Node.js 22+ e PostgreSQL 16+ (ou Docker).

```bash
cp .env.example .env               # ajuste DATABASE_URL e gere INTEGRATION_ENCRYPTION_KEY
docker compose up -d db            # opcional: PostgreSQL via Docker
npm install
npm run db:migrate                 # aplica as migrações (a API também aplica ao iniciar)
npm run dev                        # API em :3333 e interface em http://localhost:5173
```

O **primeiro cadastro** vira administrador. Depois disso, novos cadastros só funcionam com `ALLOW_REGISTRATION=true`, ou pelo Admin.

### Dados de demonstração (separados dos reais)

```bash
npm run seed:demo    # cria demo@falkyria.local / demonstracao-falkyria com 60 dias de histórico
```

A conta de demonstração é marcada (`is_demo`), identificada na interface e nunca mistura dados com a sua conta. Ela também não ocupa o lugar de "primeiro administrador".

## Testes

```bash
createdb rpg_test && createdb rpg_e2e   # bancos de teste (usuário rpg/rpg por padrão)
npm test                                # arquitetura + 151 testes: motor (55), interface (3) e API com banco real (93)
npm run test:e2e                        # 7 testes Playwright (desktop e celular)
npm run simulate                        # regera docs/simulacoes.md
npm run format:check && npm run lint && npm run typecheck && npm run lint:arch   # verificações da CI
```

## Como contribuir

O projeto segue **Git Flow** (`main`, `develop`, `feature/*`, `release/*`, `hotfix/*`) e **Conventional Commits**, com CI obrigatória em todo pull request. Veja [CONTRIBUTING.md](CONTRIBUTING.md), o [código de conduta](CODE_OF_CONDUCT.md), [SECURITY.md](SECURITY.md) e o [CHANGELOG](CHANGELOG.md).

## Produção

```bash
docker compose --profile app up -d --build   # banco + aplicação em http://localhost:3333
```

**Em produção na nuvem:** Supabase (PostgreSQL) + Render (Docker), com deploy automático a cada release na `main`. Passo a passo em [docs/14-deploy.md](docs/14-deploy.md).

Ou sem Docker: `npm run build` e depois `WEB_DIST_DIR=../web/dist npm start -w @rpg/api`. A API serve a interface, aplica as migrações e roda o avaliador diário. Backups: `apps/api/scripts/backup.sh` (ver `docs/10-backup-e-recuperacao.md`).

## Documentação

Guia de uso (para quem joga): a **[Wiki](https://github.com/Dracon-46/FalkyriaAscend/wiki)**, gerada a partir de [`docs/wiki`](docs/wiki).

Documentação técnica:

1. [Requisitos](docs/01-requisitos.md)
2. [Arquitetura, SOLID e padrões](docs/02-arquitetura.md) e [ADR-001: padrões de arquitetura](docs/13-padroes-de-arquitetura.md)
3. [Modelo de dados e diagrama ER](docs/03-modelo-de-dados.md)
4. [Regras de gamificação](docs/04-regras-de-gamificacao.md)
5. [Curva de XP](docs/05-curva-de-xp.md) e [simulações](docs/simulacoes.md)
6. [Economia de moedas](docs/06-economia.md)
7. [Catálogo inicial](docs/07-catalogo-inicial.md)
8. [Design system](docs/08-design-system.md)
9. [Integrações](docs/09-integracoes.md) e [pesquisa das APIs](docs/09b-pesquisa-apis-externas.md)
10. [Backup e recuperação](docs/10-backup-e-recuperacao.md)
11. [Estratégia de testes](docs/11-estrategia-de-testes.md)
12. [Roadmap, pendências e ideias](docs/12-roadmap.md)
13. [ADR-001: padrões de arquitetura](docs/13-padroes-de-arquitetura.md)
14. [Deploy (Supabase + Render)](docs/14-deploy.md)
15. [App Android](docs/15-app-android.md)

O protótipo HTML original foi preservado em `docs/legacy/`.
