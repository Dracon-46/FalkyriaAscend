# 01 — Requisitos

Ascend é um RPG pessoal de vida real (produto Falkyria). Ele transforma rotina, estudos, trabalho, treinos, hábitos e objetivos em progressão mensurável de longo prazo.

## Requisitos funcionais

| # | Requisito | Situação |
|---|---|---|
| RF01 | Cadastro e sessão. O primeiro usuário real vira administrador; contas de demonstração não contam. | Implementado |
| RF02 | Nível geral derivado do XP vitalício por uma curva progressiva configurável. O XP nunca é "gasto". | Implementado |
| RF03 | XP geral, XP de atributo, maestria (habilidades) e moedas como sistemas independentes. | Implementado |
| RF04 | Missões de 12 tipos e 7 estados, com dificuldade validada, objetivos compostos (manuais ou automáticos), recorrência por modelos, histórico de transições, evidência e reagendamento. | Implementado |
| RF05 | Hábitos com agenda (diária, dias da semana, N vezes por semana), tolerância, sequência própria, pausa e penalidades escolhidas por hábito. | Implementado |
| RF06 | Penalidades previsíveis: 8 tipos, escalonamento, tetos por ocorrência, limites diário e semanal, saldo nunca negativo, reversão auditada. | Implementado |
| RF07 | Proteções: indisponibilidade (doença, lesão, viagem...), modo de recuperação, suspensão de penalidades, dias de descanso. Necessidades básicas nunca são puníveis. | Implementado |
| RF08 | Metas com progresso por etapas ponderadas, missões vinculadas ou métrica, com dependências e recompensa na conclusão. | Implementado |
| RF09 | Estudos: áreas, disciplinas com pré-requisitos, recursos, sessões, avaliações e marcos de domínio. Tempo, conteúdo, desempenho e domínio aparecem separados. | Implementado |
| RF10 | Treinos: tipos configuráveis, séries, recordes pessoais (maior corrida, ritmo, 1RM estimado), exclusão com estorno. | Implementado |
| RF11 | Economia: livro-razão imutável, carteira projetada, loja com requisitos e limites, compra idempotente, inventário (possuir, equipar, consumir, resgatar). | Implementado |
| RF12 | Conquistas com critérios declarativos avaliados por um motor central; títulos, molduras e insígnias equipáveis. | Implementado |
| RF13 | Temporadas com recompensas por XP sazonal e resumo final. Encerrar uma temporada não apaga nada. | Implementado |
| RF14 | Estatísticas de progressão, produtividade, economia, atributos e maestria, com filtros, comparação de períodos e projeções rotuladas. | Implementado |
| RF15 | Histórico e auditoria: recompensas, moedas, penalidades, missões e alterações (antes e depois). | Implementado |
| RF16 | Administração: CRUD de todas as tabelas, ações auditadas sobre o livro-razão, verificação e reconstrução de integridade, ajustes manuais e gestão de usuários. | Implementado |
| RF17 | Temas Medieval, Vampiros, Anjos, Sistema e Personalizado, com preferência persistida e movimento reduzido. | Implementado |
| RF18 | Painel com widgets configuráveis (ordem, visibilidade, período). | Implementado |
| RF19 | Notificações internas por categoria. | Implementado. Push fica para uma fase posterior. |
| RF20 | Integrações Strava (OAuth e webhook), Lyfta e Hevy (chave de API) e importação JSON com deduplicação. | Implementado. Falta validar contra as APIs reais (ver doc 09). |
| RF21 | Exportação dos dados e exclusão da conta. | Implementado |
| RF22 | Sugestões de missões a partir de metas, hábitos, áreas negligenciadas e ritmo de estudo. Nada é criado automaticamente. | Implementado |

## Requisitos não funcionais

- **Integridade.** Toda alteração de saldo, XP ou estado de missão acontece em uma transação. Cada recompensa tem uma chave de idempotência única, e o livro-razão usa estornos em vez de edições. As projeções podem ser verificadas e reconstruídas.
- **Segurança.** Senhas usam scrypt. A sessão fica em cookie httpOnly com SameSite=Lax. Há defesa contra CSRF (cabeçalho customizado e verificação de Origin), rate limit em autenticação e compras, e validação Zod no backend. O escopo por usuário vale em todas as consultas. Tokens de integração são cifrados com AES-256-GCM. Logs saem sem cookies nem tokens, e erros 500 não expõem detalhes.
- **Persistência.** PostgreSQL com migrações versionadas, chaves estrangeiras, CHECKs (saldo ≥ 0, XP ≥ 0) e índices únicos.
- **Responsividade e acessibilidade.** O layout funciona de 360 px a telas largas. Os componentes usam rótulos, foco visível, `<dialog>` nativo e uma tabela alternativa para cada gráfico, e respeitam `prefers-reduced-motion`.
- **PWA.** O app é instalável e cacheia apenas a interface. Dados da API vêm sempre da rede.
- **Expansibilidade.** As regras ficam num único pacote puro (`@rpg/engine`) com configuração versionada. A arquitetura já é multiusuário.

## Premissas adotadas

1. O fuso padrão é `America/Sao_Paulo`. O dia é fechado às 04:00 locais, o que permite registros tardios.
2. A tolerância padrão de hábitos é de 1 falha por semana.
3. Os limites de penalidade são 40 moedas por dia e 150 por semana.
4. Recompensas personalizadas de missão ficam limitadas a 2× a tabela da dificuldade.
5. Pesos de atributos usam códigos imutáveis (ex.: `FOR`), validados no servidor.
6. A avaliação retroativa cobre no máximo 14 dias por execução, para evitar uma espiral de penalidades depois de longa ausência.
