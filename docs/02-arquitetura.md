# 02 — Arquitetura

## Visão geral

```
apps/web  (React 19 + Vite + Tailwind 4 + React Query + Recharts, PWA)
   │  fetch /api (cookie de sessão + x-requested-with)
apps/api  (Fastify 5 + Drizzle ORM + Zod) — camadas do ADR-001 (docs/13)
   ├─ http/                     controllers finos: validam (Zod), autorizam, chamam 1 caso de uso
   ├─ application/use-cases/    casos de uso: abrem a Unit of Work e resolvem a data local
   ├─ application/*.ts          serviços de domínio (recompensas, missões, hábitos, penalidades…)
   ├─ persistence/repositories/ escrita e leitura por agregado (único lugar com Drizzle de escrita)
   ├─ persistence/queries/      read models (estatísticas, painel, histórico, métricas)
   ├─ persistence/              schema, migrações, unit-of-work, tipos de linha (models.ts)
   ├─ integrations/             adaptadores Strava / Lyfta / Hevy (clientes + normalização)
   ├─ jobs/                     agendador da avaliação diária
   └─ shared/, config/          erros, criptografia, ambiente
packages/engine     motor de gamificação PURO (sem I/O): curva, recompensas, penalidades,
                    sequências, conquistas, economia, simulações
packages/contracts  esquemas Zod de entrada compartilhados (API valida, interface reutiliza)
PostgreSQL 16
```

### Decisões e alternativas

| Decisão | Alternativas consideradas | Motivo da escolha |
|---|---|---|
| Monorepo com npm workspaces | pnpm, Nx | Menor atrito: npm já vem com o Node e o projeto não precisa de cache distribuído. |
| Fastify | NestJS, Express | Rápido e tipado, sem o peso de DI e decorators. Os plugins oficiais cobrem cookie, rate limit, helmet e static. |
| Drizzle | Prisma | Não precisa de binários externos (o ambiente tem proxy), gera migrações SQL legíveis, dá acesso direto a `FOR UPDATE` e tem tipos inferidos. |
| Motor puro em pacote próprio | Regras dentro dos serviços | A mesma função calcula recompensas na API, prevê valores na interface e roda simulações. Facilita testes unitários. |
| Sessão em cookie httpOnly | JWT no localStorage | Revogável, imune a roubo por XSS via JS e mais simples para uso same-origin. |
| Livro-razão + projeções | Somente campos de saldo | Auditoria completa, estornos e reconstrução de projeções. |
| Agendador em processo | Fila ou cron externo | Basta para uso pessoal. A avaliação é idempotente e também roda sob demanda (painel/admin). |

## Fluxo de uma recompensa

```
ação do usuário → controller valida (Zod) → caso de uso abre a transação (inTransaction)
   → serviço de domínio calcula com @rpg/engine (limites, multiplicador, retornos decrescentes)
   → grantReward(): repositório do livro-razão insere reward_grants (chave única) ON CONFLICT → idempotente
        → bloqueia character_progress (FOR UPDATE) → atualiza XP/nível → level_history + marcos
        → grant_attribute_xp / grant_skill_xp + projeções
        → postCoinTx(): bloqueia wallets (FOR UPDATE), grava coin_transactions (seq estrita), saldo ≥ 0
   → afterAction(): objetivos automáticos, metas, conquistas (motor central)
COMMIT
```

A ordem de bloqueio é sempre `character_progress` e depois `wallets`, o que evita deadlocks. Compras simultâneas são serializadas pela linha da carteira. Repetições com a mesma `Idempotency-Key` devolvem a compra original.

## Pipeline de integrações

`Atividade externa → normalização (integrations/normalize.ts) → validação → deduplicação (source+externalId único; registro manual equivalente é vinculado, não duplicado) → recordActivity() → recompensa idempotente → livro-razão`.

## Avaliação diária

`evaluateUser()` fecha cada dia local ainda não avaliado (no máximo 14 por execução), cada um numa transação própria:

- hábitos: dispensado, tolerado ou falha com penalidades;
- missões vencidas: falha (se houver penalidade) ou expiração.

Depois disso avança as temporadas, gera as missões recorrentes do período, cria os alertas de prazo e reavalia objetivos, metas e conquistas. A avaliação roda pelo agendador (`EVALUATION_INTERVAL_MINUTES`), de forma preguiçosa ao abrir o painel e manualmente pelo Admin.

## Segurança

Veja a seção de requisitos não funcionais em `01-requisitos.md`. Pontos de implementação:

- `http/plugins/auth.ts` + `use-cases/auth.ts`: sessão com o token só no cookie. O banco guarda apenas o SHA-256 do token, e a renovação é deslizante.
- `app.ts`: CSRF via cabeçalho `x-requested-with: rpg` e verificação de Origin, com exceção apenas para o webhook do Strava (protegido por um segredo no caminho). Helmet aplica CSP, e o handler de erros não vaza detalhes.
- Autorização: toda tabela de dados de usuário tem `user_id`. Toda consulta filtra por ele, e IDs referenciados são verificados com `assertOwned()` (repositório `ownership`). O Admin exige `role = admin`.

## Estilo arquitetural, SOLID e padrões de projeto

**Estilo.** Arquitetura em camadas (PoEAA) com um **núcleo funcional puro e uma casca imperativa** (*functional core, imperative shell*), formalizada no [ADR-001](13-padroes-de-arquitetura.md) e **verificada automaticamente** (`npm run lint:arch`, na CI). As regras de jogo ficam em `@rpg/engine`, só com funções puras: entram dados, saem decisões, sem banco nem HTTP. Os casos de uso orquestram transações, os serviços de domínio aplicam o motor, os repositórios e consultas isolam o banco e os controllers fazem a borda. O código é TypeScript funcional e tipado, organizado em módulos. Não há hierarquias de classes, porque isso não traria benefício para regras que são essencialmente cálculos sobre dados.

**SOLID, aplicado a módulos e funções:**

| Princípio | Como aparece | Onde |
|---|---|---|
| Responsabilidade única (S) | Cada módulo do motor cuida de um assunto. Na API, cada camada tem um papel: controller (borda), caso de uso (transação), serviço (regra), repositório (dados). | `packages/engine/src/*`, `apps/api/src/{http,application,persistence}` |
| Aberto/fechado (O) | Novas curvas, tipos de penalidade, métricas de conquista e recursos do Admin entram por configuração ou registro, sem mexer nos consumidores. | `curveConfigSchema`, `PENALTY_TYPES`, `ACHIEVEMENT_METRICS`, `persistence/repositories/admin-resources.ts`, `application/crud.ts` |
| Substituição de Liskov (L) | Serviços e repositórios aceitam `Db` ou `Tx` (`DbOrTx`), que são intercambiáveis, então a mesma função roda dentro ou fora de uma transação. Todo serviço de cadastro cumpre o mesmo contrato `CrudService`. | `persistence/unit-of-work.ts`, `application/crud.ts` |
| Segregação de interfaces (I) | Contratos de entrada pequenos e específicos (`missionInput`, `habitCheckinInput`...). Na interface, os componentes recebem apenas as props de que precisam. | `packages/contracts` |
| Inversão de dependência (D) | As dependências só apontam para baixo e são verificadas pela CI. O motor não depende de nada; a aplicação não conhece HTTP nem o ORM. Relógio (`now`), banco e ambiente são injetados no `AppContext`, o que deixa os testes determinísticos. | `context.ts`, `.dependency-cruiser.cjs` |

**Padrões de projeto usados de forma explícita:**

- **Livro-razão + projeções** (event sourcing leve): `reward_grants`, `coin_transactions` e `penalty_applications` são imutáveis, com correções por estorno. As projeções (`wallets`, `character_progress`, XP de atributos) podem ser reconstruídas.
- **Chave de idempotência**: recompensas, compras, penalidades e eventos de integração.
- **Service Layer + casos de uso**: `application/use-cases/*` são os únicos pontos de entrada dos controllers.
- **Repository / Query Object**: `persistence/repositories/*` por agregado; `persistence/queries/*` para leituras agregadas.
- **Unit of Work**: `inTransaction()`; cada caso de uso que escreve roda numa única transação do banco.
- **Strategy**: tipos de curva e de penalidade são uniões discriminadas resolvidas por `switch` exaustivo.
- **Adapter**: os normalizadores de Strava, Lyfta e Hevy convertem formatos externos num formato interno único.
- **Pipeline**: integração (normalizar → validar → deduplicar → recompensar).
- **Specification / DSL**: critérios de conquista declarativos, validados por Zod e avaliados por um único avaliador.
- **Registry**: o Admin deriva formulários e validação do schema do banco a partir de um registro de recursos.
- **Observer simplificado**: `afterAction()` reavalia objetivos, metas e conquistas depois de qualquer ação que altere progresso.
- **Template Method (CRUD)**: `crudService()` padroniza escopo por usuário, auditoria e arquivamento; cada recurso só declara sua validação (`prepare`). `registerCrud()` expõe o serviço em REST.

**Lacunas conhecidas, documentadas por transparência:**

1. Os repositórios são módulos de funções, não interfaces com implementações trocáveis. Trocar de banco afetaria só `persistence/`, mas testes sem PostgreSQL exigiriam extrair interfaces (hoje os testes de integração usam um banco real, de propósito).
2. Algumas páginas da interface ficaram grandes (Estudos e Treinos). Elas são candidatas a divisão por subcomponentes.
3. O agendador é em processo. Com várias instâncias, ele precisaria de um bloqueio distribuído; a avaliação já é idempotente e trava a linha de configurações do usuário.
