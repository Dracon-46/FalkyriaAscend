# 09 — Integrações

Os fatos sobre as APIs, com fontes e marcadores confirmado/não confirmado, estão em [`09b-pesquisa-apis-externas.md`](09b-pesquisa-apis-externas.md), pesquisado em 21/10/2026.

## Arquitetura

Cada integração é isolada em `apps/api/src/integrations/`:

- `clients.ts`: HTTP mínimo com timeout e erros padronizados, sem nunca registrar segredos.
- `normalize.ts`: funções puras que convertem Strava, Lyfta e Hevy num `ExternalActivity` único (testadas com fixtures).
- `service.ts`: deduplicação, resolução de tipo e exercício, e chamada de `recordActivity()`. O motor de gamificação não conhece nenhuma API externa.

```
externo → normalizar → validar → deduplicar (source + externalId; manual equivalente é vinculado) → evento interno → recompensa → livro-razão
```

## Situação por provedor

| Provedor | Implementado | Validado contra a API real? |
|---|---|---|
| **Lyfta** | Chave Bearer cifrada, `GET /api/v1/workouts?from&to&limit&page`, conversão de `weight`/`reps` (strings), unidade kg/lb configurável, duração estimada (3 min por série, porque a API não informa) | **Não.** Normalização testada com o formato do sandbox oficial; falta testar com uma chave real. |
| **Hevy** | Chave `api-key` (exige Pro), `GET /v1/workouts`, `weight_kg`, duração por início e fim | **Não.** Precisa de conta Pro. |
| **Strava** | OAuth (state em cookie, refresh rotativo sempre persistido), sincronização de 14 dias, webhook com handshake, segredo no caminho, validação do `owner_id`, releitura da atividade, exclusão com estorno, desautorização apagando dados derivados, `/oauth/revoke` | **Não.** Exige criar um app no Strava (com assinatura) e configurar `STRAVA_CLIENT_ID/SECRET`. Handshake e deduplicação de eventos estão cobertos por testes. |
| **Importação JSON** | `POST /api/import/activities` com deduplicação | Sim (testes de integração e E2E) |

## Avisos importantes (Strava, política vigente desde 01/06/2026)

- **Proibido usar dados do Strava com IA**, inclusive colocá-los em contexto de LLM. Qualquer recurso de IA futuro (ver doc 12) deve excluir atividades com `source = 'strava'`.
- Cache de no máximo 7 dias e proibição de combinar com outros dados de cliente: a retenção de dados derivados (XP e atividade resumida) é ambígua para uso pessoal. Recomendo confirmar com developers@strava.com antes de ligar a integração.
- Exclusões no Strava devem refletir em até 48 h; o webhook `delete` já estorna a recompensa.
- Alternativa recomendada para musculação: integração direta com a **Lyfta** (API oficial gratuita), em vez de Lyfta → Strava.

## Configuração

- Variáveis em `.env.example`: `INTEGRATION_ENCRYPTION_KEY` (obrigatória para guardar credenciais), `STRAVA_*`, `LYFTA_API_BASE`.
- URL do webhook do Strava: `https://SEU_DOMINIO/api/integrations/strava/webhook/<STRAVA_WEBHOOK_VERIFY_TOKEN>`.
- Assinatura do webhook: `POST https://www.strava.com/api/v3/push_subscriptions` com `client_id`, `client_secret`, `callback_url` e `verify_token`.
