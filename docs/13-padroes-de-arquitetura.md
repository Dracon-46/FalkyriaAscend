# 13 — Padrões de arquitetura (ADR-001)

**Status:** aceito e implementado · **Data:** 2026-10-22 · **Aplicação:** obrigatória e verificada automaticamente (`npm run lint:arch`, executado em `npm test` e na CI).

## Contexto

O produto vai crescer por anos: novos domínios, integrações, IA local e possivelmente vários usuários. As regras de negócio precisam ficar isoladas e testáveis, o acesso a dados precisa ser explícito e as dependências entre partes do código não podem se degradar com o tempo.

## Decisão

Adotamos a **arquitetura em camadas** do catálogo *Patterns of Enterprise Application Architecture* (Fowler), com um **domínio puro** em pacote próprio. As dependências só apontam para baixo:

```
┌───────────────────────────────────────────────────────────────────────┐
│ Apresentação HTTP     apps/api/src/http/**                             │ controllers: validar (Zod), autorizar,
│                                                                       │ chamar 1 caso de uso, responder
├───────────────────────────────────────────────────────────────────────┤
│ Casos de uso          apps/api/src/application/use-cases/**            │ pontos de entrada: abrem a Unit of Work,
│                                                                       │ resolvem a data local, orquestram serviços
├───────────────────────────────────────────────────────────────────────┤
│ Serviços de domínio   apps/api/src/application/*.ts                    │ regras com estado: recompensas, missões,
│                                                                       │ hábitos, penalidades, loja… (recebem `tx`)
├───────────────────────────────────────────────────────────────────────┤
│ Domínio puro          packages/engine/**                               │ cálculos determinísticos, sem I/O
├───────────────────────────────────────────────────────────────────────┤
│ Persistência          apps/api/src/persistence/**                      │ repositories/ (por agregado), queries/
│                                                                       │ (read models), unit-of-work, models, schema
│ Adaptadores           apps/api/src/integrations/**                     │ clientes HTTP externos + normalização
└───────────────────────────────────────────────────────────────────────┘
Raiz de composição: app.ts, server.ts, context.ts · Agendador: jobs/ · Compartilhado: shared/, config/, packages/contracts
```

## Padrões adotados

| Padrão | Onde | Regra |
|---|---|---|
| **Service Layer / casos de uso** | `application/use-cases/*.ts` | Únicos pontos de entrada dos controllers. Recebem `db` e `now`, abrem a transação e retornam dados. Não conhecem HTTP. Um caso de uso não chama outro. |
| **Serviços de domínio** | `application/*.ts` | Recebem `tx` (já dentro da transação) e aplicam as regras do motor. Nunca dependem de casos de uso. |
| **Domain Model (funcional)** | `packages/engine` | Funções puras, sem I/O, sem relógio implícito e sem dependências além do `zod`. |
| **Repository** | `persistence/repositories/*.ts` | Um módulo por agregado (missões, hábitos, metas, carteira, livro-razão, progressão, inventário…), com funções de intenção clara (`lockMission`, `insertGrantIfNew`, `findPenaltyCoinTx`). |
| **Query Object / Read Model** | `persistence/queries/*.ts` | Leituras agregadas (estatísticas, painel, histórico, métricas). Nunca escrevem. |
| **Unit of Work** | `persistence/unit-of-work.ts` | `inTransaction(db, fn)`: todo caso de uso que escreve roda numa única transação. |
| **Row models** | `persistence/models.ts` | Tipos das linhas e enumerações expostos à aplicação sem acoplá-la ao ORM. |
| **Template Method (CRUD)** | `application/crud.ts` + `persistence/repositories/user-owned.ts` | Escopo por usuário, auditoria e arquivamento padronizados; cada cadastro declara só sua validação (`prepare`). |
| **Livro-razão + projeções** | `reward_grants`, `coin_transactions`, `penalty_applications` | Somente inserção; correção por estorno. As projeções são reconstruíveis. |
| **Chave de idempotência** | recompensas, compras, penalidades, eventos externos | Toda operação que concede ou cobra tem chave única. |
| **Adapter / Anti-corruption layer** | `integrations/normalize.ts`, `clients.ts` | Formatos externos nunca vazam para a aplicação. |
| **Strategy** | curvas, tipos de penalidade | União discriminada com `switch` exaustivo. |
| **Specification** | critérios de conquista | DSL validada por Zod e um único avaliador. |
| **Registry** | recursos do Admin (`persistence/repositories/admin-resources.ts`) | Metadados derivados do schema; a aplicação só vê `ResourceMeta`. |
| **Dependency Injection (manual)** | `AppContext` (db, env, now) | Nada de singletons globais; o relógio é injetável. |

## Regras de dependência (verificadas pelo dependency-cruiser)

1. `packages/engine` não importa nada do monorepo, nem bibliotecas além do `zod`.
2. `http/**` só chama `application/use-cases/**` (e o tipo `CrudService` de `application/crud.ts`). Não importa `persistence/**`, `drizzle-orm` nem `pg`.
3. `application/**` não importa `drizzle-orm`, `pg`, `fastify` nem `http/**`. Da persistência, só `repositories/**`, `queries/**`, `unit-of-work.ts` e `models.ts`.
4. Serviços de domínio (`application/*.ts`) não importam casos de uso, e um caso de uso não importa outro.
5. `persistence/**` não importa camadas superiores.
6. `integrations/**` (adaptadores) não importa aplicação, HTTP nem persistência.
7. `jobs/**` não acessa o banco diretamente; `shared/**` é folha.
8. Sem dependências circulares em nenhum pacote.
9. Na interface (`apps/web`): `features/A` não importa `features/B`; `components/**` e `lib/**` não importam `features/**`; `lib/**` não importa `components/**`.

## Convenções

- Nomes de código em inglês; textos para o usuário em português.
- Repositórios recebem `(db: DbOrTx, userId, …)`. Toda consulta de dados do usuário filtra por `userId`, sem exceção.
- Casos de uso recebem `now: Date` e resolvem a data local do usuário com `todayFor()`.
- Erros são `AppError` (`shared/errors.ts`) com status e código estáveis. Controllers nunca montam respostas de erro manualmente.
- Entradas são validadas na borda (Zod de `@rpg/contracts`). As camadas internas confiam nos tipos.
- Toda alteração relevante grava auditoria (`application/audit.ts`).
- Regras de jogo novas entram primeiro no motor, com teste unitário, e depois na aplicação.
- Formatação por Prettier (`npm run format:check`) e `noUnusedLocals` ativo em todos os pacotes.

## Como adicionar uma funcionalidade

1. Regra de jogo: função pura em `packages/engine` + teste.
2. Dados: tabela em `persistence/schema.ts`, tipo em `models.ts`, `npm run db:generate`, funções no repositório do agregado.
3. Regra com estado: serviço de domínio em `application/<domínio>.ts` (recebe `tx`).
4. Ponto de entrada: caso de uso em `application/use-cases/<domínio>.ts` (abre a transação).
5. Borda: entrada Zod em `@rpg/contracts` e controller em `http/routes/*`.
6. Rode `npm run lint:arch` — a CI recusa violações.

## Consequências

- **Positivas:** as regras ficam testáveis sem banco, o acesso a dados fica explícito e a arquitetura não se degrada, porque a CI falha quando uma regra é violada. Trocar o ORM ou o banco afeta apenas `persistence/`.
- **Negativas:** mais arquivos e alguma cerimônia em operações simples. Aceitamos esse custo em troca de previsibilidade no longo prazo.
