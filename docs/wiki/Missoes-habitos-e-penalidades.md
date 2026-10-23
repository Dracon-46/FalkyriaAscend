# Missões, hábitos e penalidades

## Missões

- **Estados:** Disponível, Em andamento, Concluída, Falhou, Cancelada, Suspensa e Expirada.
- **Cancelar ou suspender** exige um motivo e nunca conta como falha.
- **Prazo vencido:** a missão vira *Falhou* se tiver penalidade configurada, ou *Expirada* se não tiver.
- **Missões compostas** só concluem quando todos os objetivos obrigatórios forem cumpridos. Objetivos automáticos (ex.: "estudar 5 h") são calculados a partir dos seus registros no período.
- **Recorrência:** modelos ativos geram uma missão por dia, semana ou mês, sem duplicar.
- **Reagendar antes do prazo** nunca gera penalidade.

## Hábitos e sequências

- Cada hábito tem sua própria sequência; não existe sequência global.
- **Cumprido** soma +1. **Falhou** zera a sequência.
- **Tolerado, dispensado, descanso e não programado** são neutros: não quebram nem somam.
- **Tolerância:** por padrão, 1 falha tolerada a cada 7 dias. A regra *Sem tolerância* desliga isso.
- **Metas semanais** (N vezes por semana) são avaliadas no domingo, descontando os dias dispensados.
- **Marcos de sequência** (7, 30, 100 e 365) dão bônus uma única vez por hábito.

## Penalidades

Cada hábito ou missão escolhe suas penalidades. O valor cresce com falhas consecutivas até um teto:

`valor = min(teto, base + passo × (falhas consecutivas − 1))`

E ainda respeita limites globais: **40 moedas por dia**, **150 por semana** e **no máximo 50% das moedas ganhas na semana**, para nunca virar uma espiral de punição. O saldo nunca fica negativo.

| Tipo | Efeito |
|---|---|
| Registro de falha | Só registra |
| Perda de moedas | Débito escalonado, com os limites acima |
| Perda da recompensa potencial | Registra o que deixou de ganhar |
| Redução de progresso | Volta objetivos manuais relacionados, nunca abaixo de 0 |
| Perda de sequência | Quebra a sequência ignorando a tolerância |
| Redução do multiplicador | −x% por N dias (no máximo 50% e 30 dias) |
| Bloqueio de recompensa | Bloqueia um item da loja por N dias |
| Perda de XP de habilidade | Opcional e desligada por padrão |

## Quando não há penalidade

- O hábito é **necessidade básica**;
- o hábito está **pausado**;
- há **indisponibilidade** registrada (doença, lesão, viagem…);
- o **modo de recuperação** está ativo ou as penalidades estão suspensas;
- a missão está **suspensa**.

Nesses casos a falha é registrada para o seu histórico, mas sem consequência. Depois de uma ausência longa, o sistema avalia no máximo os últimos 14 dias, para não acumular penalidades de uma vez.

Toda penalidade aplicada aparece em **Histórico** e pode ser revertida pelo Admin, com auditoria.
