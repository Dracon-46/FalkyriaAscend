# 04 — Regras de gamificação

Todas as regras ficam em `@rpg/engine` e são parametrizadas pela configuração versionada (`DEFAULT_GAME_CONFIG`, editável em **Configurações → Progressão**). Cada recompensa grava a versão da configuração usada e a explicação do cálculo, então mudar a configuração não altera resultados passados.

## Sistemas independentes

| Sistema | O que mede | Como cresce |
|---|---|---|
| **XP geral** | Progressão vitalícia → nível | Missões, hábitos, estudos, treinos, metas, conquistas, marcos |
| **XP de atributo** | Dimensões (FOR, RES, VIT, INT, DIS, ORG, EXE, END) | XP base (antes de multiplicadores) × pesos da atividade |
| **Maestria** | Habilidades específicas (Economia, Corrida, Técnica...) | Tempo efetivo (limitado), conteúdo concluído, avaliações, marcos de domínio |
| **Moedas** | Economia da loja | Tabela por dificuldade/tempo, nunca ilimitada |

## Dificuldade

| Dificuldade | XP | Moedas |
|---|---:|---:|
| Rotineira | 10 | 2 |
| Fácil | 20 | 4 |
| Moderada | 40 | 8 |
| Difícil | 80 | 16 |
| Muito difícil | 150 | 30 |
| Épica | 300 | 60 |
| Lendária | 600 | 120 |

Proteções contra inflação:

- Dificuldade máxima por tipo de missão. Exemplo: diária até Difícil; Lendária só em longo prazo, projeto ou marco.
- **Épica** exige período de 7 dias ou mais e 3 objetivos ou mais. **Lendária** exige 28 dias ou mais e 3 objetivos ou mais.
- Missões Difícil+ no mesmo dia rendem 100%, 100%, 100% e depois 50% e 25%.
- Recompensa personalizada fica limitada a 2× a tabela.

## Recompensas por tempo (estudo e treino)

- Minutos efetivos: 100% até 60 min, 50% até 120 min, 25% até 240 min e 0 depois disso.
- Rendem 1 XP e 0,5 de maestria por minuto efetivo, mais 4 moedas a cada 30 min efetivos.
- O tipo de treino aplica um fator de intensidade entre 0,5 e 1,5. Distância rende +2 XP/km, até 21 km.
- Limites diários de XP: estudo 300, treino 250, hábitos 400, missões 1.500, registro rápido 150.
- Registro rápido rende 10 XP e 2 moedas. Repetições do mesmo título no dia rendem 100%, 100%, 50%, 25% e depois 0%.

## Multiplicador de consistência

Calculado sobre os hábitos cumpridos nos últimos 14 dias (cumpridos ÷ (cumpridos + falhas + toleradas)), com no mínimo 7 ocorrências: ≥ 90% dá ×1,10 e ≥ 75% dá ×1,05. Afeta XP geral e moedas, nunca atributos. Penalidades de "redução de multiplicador" diminuem esse valor temporariamente, mas nunca abaixo de ×1,00.

## Hábitos, sequências e tolerância

- Cada hábito tem sua própria sequência. Não existe uma sequência global.
- Cumprido conta +1. Falhou zera a sequência. Tolerado, dispensado, descanso e não programado são neutros: não quebram nem somam.
- Tolerância: até N falhas toleradas numa janela móvel de 7 dias (padrão 1). A regra "Sem tolerância" (`streak_reset`) desliga isso.
- Metas semanais (N vezes por semana) são avaliadas no domingo, e a meta é reduzida proporcionalmente pelos dias dispensados.
- Marcos de sequência (7, 30, 100 e 365 ocorrências) dão bônus uma única vez por hábito.

## Penalidades

Valor = min(teto, base + passo × (falhas consecutivas − 1)), limitado também a 40 moedas por dia, 150 por semana, **50% das moedas ganhas na semana** (teto proporcional contra espiral de punição) e ao saldo disponível. O saldo nunca fica negativo.

| Tipo | Efeito |
|---|---|
| Registro de falha | Só registra |
| Perda de moedas | Débito escalonado com os limites acima |
| Perda da recompensa potencial | Registro explícito |
| Redução de progresso | Objetivos manuais da missão-mãe ou de missões da mesma categoria, nunca abaixo de 0 |
| Perda de sequência | Ignora a tolerância |
| Redução do multiplicador | −x% por N dias (no máximo 50% e 30 dias) |
| Bloqueio de recompensa | Item da loja bloqueado por N dias |
| Perda de XP de habilidade | Opcional, desligada por padrão, até 50 por ocorrência |

**XP vitalício e nível geral nunca diminuem por falhas.**

Não há penalidade quando o hábito é necessidade básica, está pausado, há indisponibilidade registrada, o modo de recuperação está ativo ou a missão está suspensa. Com as penalidades suspensas, a falha é registrada sem consequência. Reagendar antes do prazo também não gera penalidade.

## Missões

- Estados: Disponível, Em andamento, Concluída, Falhou, Cancelada, Suspensa e Expirada.
- Cancelada e Suspensa exigem motivo e nunca contam como falha.
- Quando o prazo vence, a missão vira Falhou se houver penalidade configurada, ou Expirada se não houver.
- Missões compostas só concluem quando todos os objetivos obrigatórios forem cumpridos. Objetivos automáticos são calculados a partir dos registros feitos no período da missão.
- Recorrência: modelos ativos geram uma instância por dia, semana ou mês, de forma idempotente por período.

## Conquistas, níveis e ranks

- Conquistas usam uma DSL `{"all":[{"metric":"…","gte":N}]}` com 23 métricas, avaliada após cada ação. A recompensa é dada uma única vez.
- Ranks: G (1) · F (5) · E (10) · D (20) · C (30) · B (45) · A (60) · S (80) · SS (100). Cada rank concede um título e moedas.
