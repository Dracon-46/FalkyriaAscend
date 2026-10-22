# 13 — Padrões de arquitetura (ADR-001)

**Status:** aceito · **Data:** 2026-10-22 · **Aplicação:** obrigatória e verificada automaticamente (`npm run lint:arch`, executado em `npm test`).

## Contexto

O produto vai crescer por anos: novos domínios, integrações, IA local e possivelmente vários usuários. As regras de negócio precisam ficar isoladas e testáveis, o acesso a dados precisa ser explícito e as dependências entre partes do código não podem se degradar com o tempo.

## Decisão

Adotamos a **arquitetura em camadas** do catálogo *Patterns of Enterprise Application Architecture* (Fowler), com um **domínio puro** separado em pacote próprio. As dependências só apontam para baixo:

```
┌──────────────────────────────────────────────────────────────┐
│ Apresentação HTTP   apps/api/src/http/**                      │  controllers: validar entrada (contracts),
│                                                              │  autorizar, chamar 1 caso de uso, responder
├──────────────────────────────────────────────────────────────┤
│ Aplicação           apps/api/src/application/**               │  Service Layer: casos de uso, transações
│                                                              │  (Unit of Work), orquestração
├──────────────────────────────────────────────────────────────┤
│ Domínio             packages/engine/**                        │  regras puras, sem I/O
├──────────────────────────────────────────────────────────────┤
│ Persistência        apps/api/src/persistence/**               │  Repository (escrita por agregado),
│                                                              │  Query Object / read models (leitura), schema
│ Adaptadores         apps/api/src/integrations/**              │  clientes HTTP externos + normalização
└──────────────────────────────────────────────────────────────┘
Raiz de composição: app.ts, server.ts, context.ts (montam tudo; podem importar qualquer camada)
Compartilhado: apps/api/src/shared/** (erros, criptografia) e packages/contracts (entradas Zod)
```

## Padrões adotados

| Padrão | Onde | Regra |
|---|---|---|
| **Service Layer** | `application/*.ts` | Um caso de uso por função exportada. Recebe dados já validados e retorna dados. Não conhece HTTP. |
| **Domain Model (funcional)** | `packages/engine` | Funções puras e determinísticas, sem I/O, sem relógio implícito e sem dependências além do `zod`. |
| **Repository** | `persistence/repositories/*.ts` | Um módulo por agregado (missões, hábitos, carteira…), com funções de intenção clara (`findOwned`, `lockWallet`, `insertGrant`). É o **único** lugar de escrita com Drizzle. |
| **Query Object / Read Model** | `persistence/queries/*.ts` | Consultas de leitura agregadas (estatísticas, painel, histórico). Nunca escrevem. |
| **Unit of Work** | `persistence/unit-of-work.ts` | `inTransaction(db, fn)`: um caso de uso que escreve roda numa única transação. Funções aceitam `Tx`. |
| **Livro-razão + projeções** | `reward_grants`, `coin_transactions`, `penalty_applications` | Somente inserção; correção por estorno. As projeções são reconstruíveis. |
| **Chave de idempotência** | recompensas, compras, penalidades, eventos externos | Toda operação que concede ou cobra tem chave única. |
| **Adapter / Anti-corruption layer** | `integrations/normalize.ts`, `clients.ts` | Formatos externos nunca vazam para a aplicação. |
| **Strategy** | curvas, tipos de penalidade | União discriminada com `switch` exaustivo. |
| **Specification** | critérios de conquista | DSL validada por Zod e um único avaliador. |
| **Registry** | recursos do Admin | Metadados derivados do schema. |
| **Dependency Injection (manual)** | `AppContext` (db, env, now) | Nada de singletons globais; o relógio é injetável. |

## Regras de dependência (verificadas)

1. `packages/engine` não importa nada do monorepo, nem bibliotecas além do `zod`.
2. `http/**` **não** importa `persistence/**` nem `drizzle-orm`. Fala apenas com `application/**`, `shared/**`, `@rpg/contracts` e `@rpg/engine` (rótulos e tipos).
3. `application/**` **não** importa `drizzle-orm` nem `persistence/schema`. Acessa dados só via `persistence/repositories/**`, `persistence/queries/**` e `persistence/unit-of-work`.
4. `persistence/**` **não** importa `application/**` nem `http/**`.
5. `integrations/**` (adaptadores) **não** importa `application/**`, `http/**` nem `persistence/**`.
6. Sem dependências circulares em nenhum pacote.
7. Na interface (`apps/web`): `features/A` não importa `features/B`; `components/**` e `lib/**` não importam `features/**`; `lib/**` não importa `components/**`.

## Convenções

- Nomes de código em inglês; textos para o usuário em português.
- Funções de repositório recebem `(db: DbOrTx, userId, …)`. Toda consulta de dados do usuário filtra por `userId`, sem exceção.
- Erros de domínio e aplicação são `AppError` (`shared/errors.ts`) com status e código estáveis. Rotas nunca montam respostas de erro manualmente.
- Entradas são validadas na borda (Zod de `@rpg/contracts`). Camadas internas confiam nos tipos.
- Toda alteração relevante grava auditoria (`application/audit.ts`).
- Novas regras de jogo entram primeiro no motor, com teste unitário, e depois na aplicação.

## Consequências

- **Positivas:** as regras ficam testáveis sem banco, os pontos de acesso a dados ficam explícitos e a arquitetura não se degrada, porque a CI falha quando uma regra é violada. Trocar o ORM ou o banco afeta apenas `persistence/`.
- **Negativas:** mais arquivos e alguma cerimônia em operações simples. Aceitamos esse custo em troca de previsibilidade no longo prazo.
