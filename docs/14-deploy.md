# 14 — Deploy (Supabase + Render)

Arquitetura de produção: **um serviço Docker no Render** (API + interface servida pela API) e **PostgreSQL gerenciado no Supabase**. O Ascend usa só o banco do Supabase; autenticação, regras e armazenamento continuam no próprio app.

```
celular / navegador ──HTTPS──▶ Render (Virgínia) ──TLS──▶ Supabase Postgres (East US / North Virginia)
                               Docker: API Fastify + PWA       pooler de sessão (IPv4, porta 5432)
```

> **Mesma região.** O Render não tem região no Brasil. Banco e app precisam ficar juntos (Virgínia). Cada tela faz dezenas de consultas, e banco em São Paulo com app nos EUA deixaria tudo lento.

## 1. Banco no Supabase

1. Entre no [Supabase](https://supabase.com) com a **conta pessoal**. Use uma janela anônima se o navegador estiver logado em outra conta, para não criar o projeto na organização errada.
2. Crie uma organização (ex.: *Falkyria*) e um projeto `falkyria-ascend`:
   - **Region:** East US (North Virginia);
   - **Database password:** forte, guardada num gerenciador de senhas.
3. Em **Connect**, copie a URI do **Session pooler** (porta 5432) e troque `[YOUR-PASSWORD]` pela senha.
   - Não use a *Direct connection*: ela usa só IPv6, que o Render não alcança.
   - Não acrescente `?sslmode=...` à URI. O TLS é configurado por `DATABASE_SSL`, e o parâmetro na URI sobrescreveria essa configuração.
4. Em **Project Settings → Database → SSL Configuration**, baixe o certificado (`prod-ca-2021.crt` ou equivalente). O conteúdo dele vai em `DATABASE_CA_CERT`.
5. Opcional e recomendado: ative **Enforce SSL**.

As migrações são aplicadas automaticamente quando a API inicia. Não é preciso rodar nada no banco.

## 2. App no Render

1. Entre no [Render](https://render.com) com o GitHub e autorize o acesso ao repositório.
2. **New → Blueprint** e selecione o repositório. O Render lê o [`render.yaml`](../render.yaml) e cria o serviço `falkyria-ascend`.
3. Preencha as variáveis secretas (`sync: false`):

| Variável | Valor |
|---|---|
| `DATABASE_URL` | URI do Session pooler do passo 1.3 |
| `DATABASE_CA_CERT` | conteúdo do certificado do passo 1.4 (pode colar com quebras de linha) |
| `APP_ORIGIN` | URL pública do serviço, ex.: `https://falkyria-ascend.onrender.com` |
| `INTEGRATION_ENCRYPTION_KEY` | gere com `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |

4. O deploy roda **a partir da `main`** e **só depois que a CI do commit passa** (`autoDeployTrigger: checksPass`). Ou seja, cada release do Git Flow publica sozinha.
5. Abra a URL e cadastre-se: **o primeiro usuário vira administrador**. Novos cadastros ficam fechados (`ALLOW_REGISTRATION=false`).
6. No celular, abra a URL e use **Adicionar à tela inicial** para instalar o PWA.

### Conferir a produção

O workflow **Smoke de produção** testa o app publicado depois de cada release, a cada 6 horas e sob demanda (**Actions → Smoke de produção → Run workflow**). Os testes são somente leitura: nada é cadastrado. Para rodar daqui:

```bash
npm run test:smoke                                    # https://falkyria-ascend.onrender.com
SMOKE_BASE_URL=https://outro-endereco.onrender.com npm run test:smoke
```

Se o serviço estiver em outro endereço, defina a variável do repositório `ASCEND_APP_URL` (Settings → Secrets and variables → Actions → Variables). Ela vale para o smoke e para o APK.

## 3. Planos e limites

| Item | Gratuito | Observação |
|---|---|---|
| Render (web service) | hiberna após ~15 min sem acesso; o primeiro acesso depois disso demora cerca de 1 min | O plano *Starter* mantém o app sempre ligado. Hibernado, o agendador não roda, mas ao abrir o painel a avaliação preguiçosa fecha os dias pendentes (até 14). |
| Supabase | pausa o projeto após um período sem atividade | Uso diário evita a pausa. Confira os limites de conexões do pooler no seu plano (`DATABASE_POOL_MAX=5` por padrão). |

## 4. Backups

Confira a política de backups do seu plano no Supabase. Independentemente dela, mantenha um dump próprio:

```bash
DATABASE_URL="<URI do session pooler>" apps/api/scripts/backup.sh
```

Detalhes e restauração em [10 — Backup e recuperação](10-backup-e-recuperacao.md).

## 5. Integrações em produção

- **Strava:** a URL do webhook é `https://<APP_ORIGIN>/api/integrations/strava/webhook/<STRAVA_WEBHOOK_VERIFY_TOKEN>`, e a URL de callback do OAuth é `https://<APP_ORIGIN>/api/integrations/strava/callback`. Configure `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_WEBHOOK_VERIFY_TOKEN` no Render.
- **Lyfta e Hevy:** a chave de API de cada usuário é cadastrada na interface e fica cifrada no banco com `INTEGRATION_ENCRYPTION_KEY`. **Não troque essa chave depois de ter integrações conectadas**, senão as credenciais salvas deixam de ser legíveis.

## 6. Domínio próprio (opcional)

Adicione o domínio no Render (Settings → Custom Domains), aponte o DNS como indicado e atualize `APP_ORIGIN` para o novo endereço.
