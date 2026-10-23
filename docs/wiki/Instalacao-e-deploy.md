# Instalação e deploy

## Rodar localmente

Pré-requisitos: Node.js 22+ e PostgreSQL 16+ (ou Docker).

```bash
cp .env.example .env               # ajuste DATABASE_URL e gere INTEGRATION_ENCRYPTION_KEY
docker compose up -d db            # opcional: PostgreSQL via Docker
npm install
npm run dev                        # API em :3333 e interface em http://localhost:5173
```

As migrações rodam sozinhas quando a API inicia. Para ver o app com dados, use `npm run seed:demo`: cria uma conta de demonstração separada e identificada, que nunca se mistura com a sua.

## Produção (Supabase + Render)

```
celular / navegador ──HTTPS──▶ Render (Docker: API + interface) ──TLS──▶ Supabase PostgreSQL
```

1. **Banco:** projeto no Supabase na região *East US (North Virginia)*, conexão pelo *Session pooler* e certificado em `DATABASE_CA_CERT`.
2. **App:** no Render, **New → Blueprint** com este repositório. O `render.yaml` cria o serviço; preencha `DATABASE_URL`, `DATABASE_CA_CERT`, `APP_ORIGIN` e `INTEGRATION_ENCRYPTION_KEY`.
3. **Deploy contínuo:** cada release que entra na `main` e passa na CI é publicada sozinha.

O passo a passo completo, com planos, limites e backups, está no [guia de deploy](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/14-deploy.md).

## Backup

```bash
DATABASE_URL="<URI do banco>" apps/api/scripts/backup.sh
```

Restauração e política de retenção: [doc 10](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/10-backup-e-recuperacao.md).

## Variáveis de ambiente

A lista completa, sem valores reais, está em [`.env.example`](https://github.com/Dracon-46/FalkyriaAscend/blob/main/.env.example). Segredos ficam só no servidor e nunca no repositório.
