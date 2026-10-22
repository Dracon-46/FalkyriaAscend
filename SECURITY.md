# Política de segurança

## Como reportar

Não abra issue pública. Use o canal privado do GitHub: **Security → Report a vulnerability** (Security Advisories) neste repositório. Informe passos para reproduzir, impacto e versão afetada. Respondemos em até 5 dias úteis.

## Versões suportadas

| Versão | Suporte |
|---|---|
| `main` (última release) | ✅ |
| anteriores | ❌ |

## Práticas adotadas

- Senhas com scrypt; sessão em cookie `httpOnly` + `SameSite=Lax`; o banco guarda só o hash do token.
- Proteção CSRF (cabeçalho dedicado + verificação de Origin), CSP via Helmet e limite de requisições.
- Tokens de integrações cifrados com AES-256-GCM (`INTEGRATION_ENCRYPTION_KEY`) e nunca registrados em log.
- Recompensas calculadas só no servidor, com chaves de idempotência e livro-razão imutável.
- Segredos só em variáveis de ambiente; `.env` nunca é versionado (`.env.example` não tem valores reais).
