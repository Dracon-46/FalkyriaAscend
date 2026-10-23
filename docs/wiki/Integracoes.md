# Integrações

As integrações ficam em **Configurações → Integrações**. Toda atividade importada passa pelas mesmas regras e limites de uma atividade registrada à mão, e não é contada duas vezes.

| Provedor | Como conecta | Situação |
|---|---|---|
| **Lyfta** | Chave de API (gratuita) | Implementada e testada com dados de exemplo; falta validar com uma chave real. |
| **Hevy** | Chave de API (exige plano Pro) | Implementada e testada com dados de exemplo; falta validar com uma conta Pro. |
| **Strava** | Login OAuth + webhook | Implementada e testada; exige criar um app no Strava e configurar `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_WEBHOOK_VERIFY_TOKEN` no servidor. |
| **Importação JSON** | Arquivo | Funcionando e coberta por testes. |

## Segurança

- Chaves e tokens são cifrados no banco (AES-256-GCM) e nunca aparecem em log.
- Desconectar o Strava apaga os dados derivados; excluir uma atividade no Strava estorna a recompensa.

## Strava: atenção à política

Desde 01/06/2026 a política do Strava proíbe usar os dados com IA e limita o cache. Antes de ligar a integração em produção, vale confirmar o uso pessoal com developers@strava.com. Para musculação, a integração direta com a Lyfta é a alternativa recomendada.

Detalhes técnicos: [doc 09](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/09-integracoes.md) e [pesquisa das APIs](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/09b-pesquisa-apis-externas.md).
