# Pesquisa de integrações: Strava, Lyfta, Hevy

Data da pesquisa: 2026-10-21. Só fontes oficiais. Marcadores: **[confirmado]** quando o fato aparece literalmente numa fonte oficial; **[não confirmado]** quando a fonte oficial não diz.

---

## 1. Strava

Fontes principais:
- Auth: https://developers.strava.com/docs/authentication/
- Webhooks: https://developers.strava.com/docs/webhooks/
- Rate limits: https://developers.strava.com/docs/rate-limits/
- Referência: https://developers.strava.com/docs/reference/
- Changelog: https://developers.strava.com/docs/changelog/
- Getting started: https://developers.strava.com/docs/getting-started/
- API Agreement (vigente desde 2026-06-01): https://www.strava.com/legal/api
- API Policy (vigente desde 2026-06-01, faz parte do Agreement): https://www.strava.com/legal/api_policy

### 1.1 OAuth 2.0

| Item | Valor | Status / fonte |
|---|---|---|
| Authorize (web) | `GET https://www.strava.com/oauth/authorize` | [confirmado] auth |
| Authorize (mobile) | `GET https://www.strava.com/oauth/mobile/authorize` | [confirmado] auth |
| Parâmetros do authorize | `client_id` (obrigatório), `redirect_uri` (obrigatório, dentro do callback domain do app; `localhost`/`127.0.0.1` permitidos), `response_type=code` (obrigatório), `approval_prompt` (`auto` como padrão, ou `force`), `scope` (obrigatório, separado por vírgula ou espaço), `state` (opcional) | [confirmado] auth |
| Token | `POST https://www.strava.com/oauth/token` com `client_id`, `client_secret`, `code`, `grant_type=authorization_code`. O code é de curta duração e só pode ser usado uma vez | [confirmado] auth |
| Refresh | Mesmo endpoint, com `client_id`, `client_secret`, `grant_type=refresh_token`, `refresh_token` | [confirmado] auth |
| Validade do access token | **6 horas** | [confirmado] auth |
| Rotação do refresh token | O refresh token **pode mudar** a cada refresh, e o anterior é invalidado na hora. Persistir sempre o mais recente | [confirmado] auth |
| Comportamento do refresh | Se o token atual expira em mais de 1 h, o mesmo token é devolvido. Se expira em até 3600 s (ou já expirou), um novo é emitido | [confirmado] auth |
| `scope` na resposta | Desde 2026-04-23, as respostas de autenticação trazem `scope` (string separada por espaço) | [confirmado] changelog |
| Scopes | `read`, `read_all`, `profile:read_all`, `profile:write`, `activity:read`, `activity:read_all`, `activity:write`. O usuário pode desmarcar scopes, então é preciso checar os que voltaram | [confirmado] auth |
| Scope para webhooks de atividade | O `activity:read` é exigido para receber eventos de atividade | [confirmado] auth |
| Desautorização (legado) | `POST https://www.strava.com/oauth/deauthorize` com `access_token`. Invalida todos os tokens do app para o atleta | [confirmado] auth |
| Desautorização (recomendada) | `POST https://www.strava.com/oauth/revoke` com HTTP Basic (`client_id:client_secret`), `token` (obrigatório) e `token_type_hint` (opcional, `access_token` ou `refresh_token`). Responde 200 com corpo vazio, mesmo se o token não existir. É a recomendada desde 2026-06-01 e passa a ser **a única** em 2027-06-01 | [confirmado] auth + changelog |

Recomendação para o app: pedir `read,activity:read_all` (inclui atividades "Only Me"). Se não precisar de atividades privadas, `activity:read` basta.

### 1.2 Endpoints de atividades

Base URL: `https://www.strava.com/api/v3` [confirmado] referência. O changelog (2026-06-01) anuncia uma nova base **`api-v3.strava.com`**, disponível a partir de 2027-01-04 [confirmado] changelog. Convém deixar a base URL configurável.

**Listar atividades:** `GET /athlete/activities` [confirmado] referência
- Scope: `activity:read`. Atividades "Only Me" só aparecem com `activity:read_all`.
- Query params: `before` (epoch, int), `after` (epoch, int), `page` (padrão 1), `per_page` (padrão 30).
- Máximo de `per_page`: **[não confirmado]**. A referência não informa.
- Retorno: array de `SummaryActivity`.

**Atividade única:** `GET /activities/{id}` com `include_all_efforts` (bool) opcional [confirmado] referência
- Scope: `activity:read` para atividades Everyone/Followers e `activity:read_all` para "Only Me".
- Retorno: `DetailedActivity`.

**Campos relevantes** (SummaryActivity e DetailedActivity) [confirmado] referência:
- `id` (long), `name`
- `distance` (float, metros)
- `moving_time` e `elapsed_time` (int, segundos)
- `total_elevation_gain` (float; a unidade não aparece explícita no trecho lido, mas é tratada como metros) **[unidade não confirmada]**
- `type`: **deprecated**, prefer `sport_type`
- `sport_type` (enum SportType, inclui `WeightTraining`, `Run`, `Ride`, `Walk`, `Hike`, `Workout`, `HighIntensityIntervalTraining` etc.)
- `start_date` (UTC), `start_date_local`, `timezone`
- `average_speed` e `max_speed` (m/s)
- `kilojoules` (só rides), `manual`, `private`, `trainer`, `workout_type`
- `device_name` (adicionado ao summary em 2025-10-27, segundo o changelog)
- `calories`: **só no DetailedActivity**
- `average_heartrate`: aparece nos exemplos de resposta, mas não na definição formal dos modelos lida **[não confirmado como campo garantido]**
- Atividades com horário de início oculto devolvem meia-noite + 1 s em `start_date`/`start_date_local` (desde 2024-07-03) [confirmado] changelog

Desde 2026-05-21, uploads FIT trazem dados de séries de musculação e há upload JSON para weight training [confirmado] changelog. O changelog não diz se esses dados são expostos na leitura de atividades **[não confirmado]**.

### 1.3 Webhooks (push subscriptions)

Fonte: https://developers.strava.com/docs/webhooks/

| Item | Valor | Status |
|---|---|---|
| Criar subscription | `POST https://www.strava.com/api/v3/push_subscriptions` (form data): `client_id`, `client_secret`, `callback_url` (máx. 255 chars), `verify_token`. Resposta: `{"id": N}` | [confirmado] |
| Ver subscription | `GET https://www.strava.com/api/v3/push_subscriptions?client_id=&client_secret=` | [confirmado] |
| Apagar subscription | `DELETE https://www.strava.com/api/v3/push_subscriptions/{id}?client_id=&client_secret=`, responde 204 | [confirmado] |
| Limite | **1 subscription por aplicação**, cobrindo todos os atletas | [confirmado] |
| Handshake | O Strava faz `GET callback_url?hub.mode=subscribe&hub.challenge=...&hub.verify_token=...`. O app valida o `verify_token` e responde **200** com JSON `{"hub.challenge":"<valor>"}` em **até 2 s** | [confirmado] |
| Payload do evento | `object_type` (`activity` ou `athlete`), `object_id` (id da atividade ou do atleta), `aspect_type` (`create`, `update` ou `delete`), `updates` (hash), `owner_id` (id do atleta), `subscription_id`, `event_time` | [confirmado] |
| `updates` em atividades | As chaves possíveis são `title`, `type` e `private` (`"true"`/`"false"`) | [confirmado] |
| Desautorização | `updates` contém `"authorized": "false"` | [confirmado] |
| `object_type`/`aspect_type` exatos do evento de desautorização | Na prática o esperado é `object_type=athlete` + `aspect_type=update`, mas a página não mostra o exemplo completo | **[não confirmado]** |
| O payload só traz IDs? | Sim. O evento não traz os dados da atividade, então é preciso fazer `GET /activities/{object_id}` depois | [confirmado] (lista de campos) |
| Tempo de resposta | Responder **200 em até 2 s**. Processar de forma assíncrona | [confirmado] |
| Retries | "up to a total of three attempts" se não houver 200 | [confirmado] |
| Assinatura dos eventos | A doc **não menciona** assinatura/HMAC nem header de assinatura. O `verify_token` só vale no handshake | [confirmado: não há assinatura documentada] |
| Webhook é obrigatório? | "Per our API terms, you need to implement webhooks to know when an athlete has deauthorized" | [confirmado] getting-started |

Implicações de segurança: como os eventos não são assinados, valide `subscription_id` e `owner_id` contra os valores conhecidos e use uma URL de callback com segredo no path. Trate o evento só como gatilho e sempre releia a atividade pela API autenticada. Faça o processamento idempotente, porque pode haver retries.

### 1.4 Rate limits e tiers

Fonte: https://developers.strava.com/docs/rate-limits/ e https://developers.strava.com/docs/getting-started/

- Overall padrão: **200 req/15 min e 2.000 req/dia** [confirmado]
- "Non-upload" padrão (todos os endpoints exceto criação de atividade, upload e upload de mídia): **100 req/15 min e 1.000 req/dia** [confirmado]
- Read limit padrão: não informado explicitamente. Só aparece o valor do tier upgraded: 200/15 min e 2.000/dia [confirmado / padrão não confirmado]
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Usage`, `X-ReadRateLimit-Limit`, `X-ReadRateLimit-Usage`, cada um no formato "15min,diário" [confirmado]
- Reset: janelas de 15 min em :00, :15, :30 e :45; diário à meia-noite UTC. Estourar o limite devolve **429** [confirmado]
- **Single Player Mode**: apps novos começam com capacidade de **1 atleta** (só a própria conta do dev pode autenticar) [confirmado] rate-limits + getting-started
- Upgrade self-service: 10 atletas, overall 400/15 min e 4.000/dia. Acima de 10 atletas é preciso review [confirmado]
- **Pré-requisito: ter assinatura Strava para criar um app** ("A Strava subscription is a prerequisite for creating an app") [confirmado] getting-started. A API Policy §3.3 diz que apps Standard Tier estão sujeitos a requisitos de assinatura [confirmado] api_policy

Para um app pessoal de 1 usuário, o Single Player Mode basta. O webhook evita polling.

### 1.5 Mudanças de política relevantes (2024–2026)

- **2024-11 (efetivo em 11/nov/2024):** dados só podem ser exibidos ao próprio usuário. Também ficou proibido usar dados da API em modelos de IA [confirmado] https://press.strava.com/articles/updates-to-stravas-api-agreement
- **API Agreement + API Policy de 2026-06-01** [confirmado] https://www.strava.com/legal/api_policy:
  - §2.3 / §6.1: os dados de um usuário só podem ser exibidos a ele mesmo.
  - **§5.3: proíbe qualquer uso de dados Strava com "AI Application"**, incluindo "ingestion into a context window", RAG, embeddings e avaliação, direta ou indiretamente, e também dados derivados. A única exceção é o Strava MCP oficial (§3.5). **Isso impede mandar dados do Strava para um LLM, por exemplo para gerar missões ou feedback com IA.**
  - **§5.4:** proíbe processar dados Strava para analytics/insights e **proíbe combinar Strava Data com outros dados de cliente**. Isso afeta, por exemplo, misturar com dados de Lyfta/Hevy num score agregado. É ambíguo para uso pessoal; ver abaixo.
  - **§5.5 / §6.2: cache de no máximo 7 dias**, e é proibido manter "Persistent Index"/arquivo que exceda o escopo operacional.
  - **§6.3:** exclusões feitas no Strava precisam ser refletidas em **até 48 h**, o que exige tratar `aspect_type=delete`.
  - **§6.4:** só reter dados enquanto forem necessários para o propósito.
  - **§2.5 / §7.4:** apagar todos os dados do usuário em caso de desautorização ou pedido, em até 30 dias, com confirmação por escrito ao usuário.
  - §5.16: proíbe expor dados Strava via MCP server ou proxy próprio.
  - §3.3: tiers Standard (até 10 e até 9.999 usuários) e Extended Access (10.000+).
- **Club endpoints removidos em 2026-09-01; Explore Segments restrito ao Extended tier** [confirmado] changelog. Não afeta atividades.

**Impacto no design do app gamificado (interpretação, não é aconselhamento jurídico):** a opção mais segura é guardar só o **resultado derivado de gamificação** (XP ganho, ID da atividade, data, tipo) e não o payload bruto do Strava por mais de 7 dias. Ainda assim, §6.4/§5.4 ("data derived from Strava Data") deixam a retenção de dados derivados ambígua. Não use dados Strava em nenhum fluxo de LLM. Em caso de dúvida, escreva para developers@strava.com (contato indicado no Agreement). Até onde verifiquei, as fontes oficiais não trazem isenção explícita para app de uso pessoal **[não confirmado]**.

---

## 2. Lyfta

### 2.1 API pública: **existe** [confirmado]

Fontes:
- https://my.lyfta.app/developers
- https://my.lyfta.app/community/api
- OpenAPI 3.1: https://my.lyfta.app/openapi.json
- MCP: https://my.lyfta.app/community/mcp

| Item | Valor | Status |
|---|---|---|
| Base URL | `https://my.lyfta.app` (rotas em `/api/v1/...`) | [confirmado] openapi.json |
| Auth | `Authorization: Bearer <API_KEY>` | [confirmado] |
| Onde gerar a chave | https://my.lyfta.app/community/api, logado. A chave aparece uma vez só, e gerar uma nova revoga a anterior | [confirmado] |
| Precisa de Premium? | **Não.** Chave gratuita, leitura sem Premium | [confirmado] developers/community/api |
| Rate limit | **60 req/min e 5.000 req/dia** | [confirmado] |
| OAuth (alternativa) | Authorization code + PKCE: `https://my.lyfta.app/oauth/authorize` e `https://my.lyfta.app/oauth/token`, scope único `training:read` (somente leitura) | [confirmado] openapi.json |
| Sandbox sem auth | `GET https://my.lyfta.app/api/sandbox/v1/workouts` devolve dados de exemplo no mesmo formato | [confirmado] (testado, retornou JSON) |
| Webhooks | Nenhum documentado. O caminho é polling | [não confirmado: inexistente na doc] |
| Versão da API | `1.0.0` | [confirmado] openapi.json |

**Endpoints de leitura** (openapi.json) [confirmado]:
- `GET /api/v1/workouts`: treinos concluídos com exercícios, séries, reps e pesos. Params: `limit` (1–100, padrão 10), `page` (padrão 1), `from`/`to` (`YYYY-MM-DD`, dias UTC inclusivos, aplicados sobre `timeline_time`), `client_id` (só para coach). `limit=1` devolve o último treino. Erros: 400 (datas inválidas), 401, 429.
- `GET /api/v1/workouts/summary`: só cabeçalhos dos treinos, sem exercícios. `limit` 1–1000 (padrão 20) e `page`. Ordenado por id decrescente; soft-deleted omitidos.
- `GET /api/v1/exercises`: exercícios realizados. `GET /api/v1/exercises/library`: busca no catálogo. `GET /api/v1/exercises/progress`: progresso. Os parâmetros e schemas desses três não estão documentados **[não confirmado]**.
- `GET /api/v1/collections`, `/collections/{id}`, `/templates`, `/templates/{id}`, `/schedule`, `/clients` (coach, beta).
- Escrita (só com API key): `POST /api/v1/collections` e `POST /api/v1/templates`.

**Schema de resposta** (`WorkoutList` / `Workout`) [confirmado] openapi.json + sandbox:
```
{ status, count, total_records, total_pages, current_page, limit, workouts: [
  { id (int), title, body_weight, workout_perform_date (ISO), total_volume, totalLiftedWeight,
    user: { username },
    exercises: [ { exercise_id, excercise_name /* grafia com "cc" é a real */, exercise_type, exercise_rest_time,
      sets: [ { id, weight (string!), reps (string!), rir, duration, distance, set_type_id, is_completed (bool),
                record_type, record_level, record_value } ] } ] } ] }
```
- `weight` e `reps` vêm como **string** e precisam ser convertidos [confirmado].
- Unidade do `weight` (kg ou lb): **[não confirmado]**, a doc não especifica.
- Detecção de treinos editados ou apagados: não há endpoint de eventos/updated_since **[não confirmado]**. Sugestão: re-sincronizar uma janela recente com `from`/`to` e reconciliar por `id`.

### 2.2 Outras opções oficiais de exportação/sincronização
- Export de dados: por **e-mail para support@lyfta.app**, com assunto "Data export request". O link chega em até 30 dias, em formato legível por máquina ("such as JSON or CSV"). Não há botão no app descrito [confirmado] https://support.lyfta.app/en/article/download-your-data
- A página oficial "ai-instructions" diz "CSV export is available" [confirmado] https://www.lyfta.app/ai-instructions. O caminho no app não foi confirmado.
- **Strava:** sentido único Lyfta → Strava, publica automaticamente os treinos finalizados (descrição, séries e imagens configuráveis) [confirmado] https://support.lyfta.app/en/article/connect-strava. O `sport_type` usado no Strava **[não confirmado]**.
- **Apple Health:** sentido único Lyfta → Apple Health, grava treinos finalizados. O Health não guarda séries, reps nem carga [confirmado] https://support.lyfta.app/en/article/connect-apple-health
- **Health Connect, Garmin, Fitbit:** integrações listadas [confirmado] https://www.lyfta.app/ai-instructions. Detalhes de sentido e conteúdo **[não confirmado]** (artigo existe em https://support.lyfta.app/en/article/connect-health-connect, não lido).
- **Import** para o Lyfta de Hevy, Strong, JEFIT etc. via CSV [confirmado] https://support.lyfta.app/en/article/import-from-another-app

---

## 3. Hevy

Fonte: https://api.hevyapp.com/docs/ (Swagger, spec embutida em https://api.hevyapp.com/docs/swagger-ui-init.js)

| Item | Valor | Status |
|---|---|---|
| API oficial | Sim, "Hevy Public API" v0.0.1. Hevy avisa que pode mudar ou ser abandonada ("use it at your own risk") | [confirmado] |
| Base URL | `https://api.hevyapp.com` (rotas `/v1/...`) | [confirmado] |
| Auth | Header **`api-key: <chave>`** | [confirmado] |
| Requisito | **Só para usuários Hevy Pro** | [confirmado] |
| Onde gerar a chave | https://hevy.com/settings?developer | [confirmado] |
| Rate limit | Não documentado. Há só o pedido de não sincronizar exatamente em xx:00 e usar um minuto aleatório | [não confirmado (valores)] |
| Webhooks | Não aparecem na spec | [não confirmado: inexistente na spec] |

Endpoints de treino [confirmado]:
- `GET /v1/workouts?page=1&pageSize=10` (máximo de `pageSize` = 10)
- `GET /v1/workouts/count`
- `GET /v1/workouts/events?since=<ISO8601>&page&pageSize` (máx. 10): eventos de update/delete desde uma data, do mais novo para o mais antigo. É o mecanismo indicado para sync incremental.
- `GET /v1/workouts/{workoutId}`
- Também: `POST/PUT /v1/workouts`, `/v1/routines`, `/v1/exercise_templates` (pageSize máx. 100), `/v1/exercise_history/{exerciseTemplateId}?start_date&end_date`, `/v1/body_measurements`, `/v1/user/info`.

Campos do `Workout` [confirmado]: `id` (UUID), `title`, `routine_id`, `description`, `start_time`, `end_time`, `updated_at`, `created_at` e `exercises[]`. Cada exercício tem `index`, `title`, `notes`, `exercise_template_id`, `superset_id` e `sets[]`. Cada série tem `index`, `type` (`normal`/`warmup`/`dropset`/`failure`), **`weight_kg`**, `reps`, `distance_meters`, `duration_seconds` e `rpe`.

---

## 4. Conclusões para a arquitetura (Node.js/TS)

1. **Strava:** OAuth com refresh rotativo (persistir sempre o refresh mais novo; access token vale 6 h). Webhook com handshake em até 2 s e ACK 200 imediato, com processamento assíncrono e idempotente. Eventos sem assinatura: validar `subscription_id`/`owner_id` e reler a atividade pela API. Tratar `delete` (prazo de 48 h) e `authorized:"false"` (apagar dados e tokens). Usar `/oauth/revoke`. Deixar a base URL configurável por causa do `api-v3.strava.com` em 2027. **Não enviar dados Strava a LLMs** (§5.3). Evitar persistir dados brutos além de 7 dias. Para criar o app é preciso ter assinatura Strava.
2. **Lyfta:** API real com Bearer key gratuita, 60/min e 5.000/dia. Polling de `GET /api/v1/workouts?from=&to=`, convertendo `weight`/`reps` de string. Não há webhooks; a unidade de peso não está confirmada.
3. **Hevy:** header `api-key`, exige Pro. Sync incremental via `/v1/workouts/events?since=`. Peso em kg (`weight_kg`). `pageSize` máximo de 10.
4. **Alternativa indireta:** Lyfta → Strava (automático) faria os treinos de musculação chegarem pelo webhook do Strava. Mas aí ficam sujeitos às regras restritivas do Strava e sem séries/reps detalhadas na leitura **[não confirmado]**. A integração direta com a API do Lyfta é preferível.
