# 11 — Estratégia de testes

| Camada | Ferramenta | Onde | Quantidade |
|---|---|---|---:|
| Motor (unidade) | Vitest | `packages/engine/test` | 55 |
| API (integração com PostgreSQL real) | Vitest + `app.inject` | `apps/api/test/api.test.ts` | 89 |
| Normalização das integrações | Vitest | `apps/api/test/normalize.test.ts` | 4 |
| Ponta a ponta | Playwright (Chromium) | `e2e/` | 7 |

Comandos:

- `npm test`: unidade e integração. Exige PostgreSQL com o banco `rpg_test`; a URL pode ser trocada com `TEST_DATABASE_URL`.
- `npm run test:e2e`: sobe a API na porta 3334 e a interface na 5174, sobre o banco `rpg_e2e`, recriado a cada execução.

## Cobertura dos itens exigidos

- **Curva de XP:** XP por nível, acumulado, vários níveis numa operação, limites e arredondamento (curve.test).
- **Recompensas:** duplicadas e idempotência; missões compostas; diminuição e limites (rewards.test, api.test).
- **Falhas e penalidades:** escalonamento, tetos, teto proporcional, tolerância, suspensões, indisponibilidade, dias de descanso, reversão auditada (rules.test, api.test).
- **Compras:** saldo insuficiente, compra simultânea (5 em paralelo, só 2 aprovadas) e repetição com a mesma chave (api.test).
- **Estornos, livro-razão e recuperação:** estorno, reembolso, integridade, adulteração detectada e reconstrução (api.test).
- **Integrações:** deduplicação de importação repetida, eventos de webhook repetidos e handshake (api.test, normalize.test).
- **Conquistas e atributos:** desbloqueio único e progressão de atributos (api.test).
- **Interface:** troca e persistência de tema (api.test, E2E); persistência após recarregar (E2E); autorização entre usuários (api.test).
- **Smoke:** os 53 endpoints de leitura respondem 200 com dados reais.

O relógio é injetável (`AppContext.now`), o que torna determinísticos os testes de dias, prazos e avaliação.
