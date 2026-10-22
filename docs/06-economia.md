# 06 — Economia de moedas

## Fontes

- Tabela de dificuldade (missões e hábitos).
- Tempo efetivo (4 moedas a cada 30 min).
- Conquistas e marcos de sequência, uma única vez cada.
- Marcos de nível (10 × o nível do rank).
- Recompensas sazonais.
- Ajustes administrativos auditados.

Todas respeitam limites diários e retornos decrescentes, e nenhuma ação trivial repetida gera moedas ilimitadas.

## Controle

- Livro-razão `coin_transactions` imutável, com tipos ganho, gasto, penalidade, reembolso, estorno e ajuste. Cada lançamento guarda categoria de origem, motivo, data local, saldo após o lançamento e uma sequência estrita.
- `wallets` é uma projeção com saldo, total recebido, total gasto e total perdido em penalidades. É atualizada na mesma transação, verificável e reconstruível.
- O saldo nunca fica negativo, e isso é garantido no código e por CHECK no banco.
- Compras gravam o preço pago e um *snapshot* do item, então mudar o preço não altera o histórico.

## Simulação (1 ano, configuração padrão)

Resultado completo em [`simulacoes.md`](simulacoes.md), considerando 1 hábito com multa leve:

| Perfil | Moedas brutas/dia | Penalidades/dia | Líquido/semana | Item comum (60) | Especial (250) | Grande (1.000) | Épico (3.000) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 2,6 | 1,0 | 11 | 37 d | 153 d | 611 d | 1.832 d |
| Moderado | 16,3 | 2,2 | 99 | 5 d | 18 d | 71 d | 213 d |
| Consistente | 38,3 | 0,5 | 265 | 2 d | 7 d | 27 d | 80 d |
| Alternante | 14,3 | 1,2 | 92 | 5 d | 20 d | 77 d | 230 d |

"Dias para" assume que todo o saldo líquido é poupado. O usuário de demonstração (60 dias de atividade alta) acumulou cerca de 1.800 moedas, ou seja, ~30 por dia, coerente com os perfis moderado e consistente.

**Ajuste feito a partir da simulação.** Na primeira versão, o perfil pouco ativo perdia em multas 100% do que ganhava (2,6 de 2,6 moedas por dia): uma espiral de punição. Por isso foi criado o **teto proporcional**: as multas em moedas de uma semana não passam de 50% das moedas ganhas na própria semana (`penalties.maxShareOfWeeklyEarnings`). A falha continua registrada e a sequência continua sendo quebrada; só a perda de moedas é limitada.

## Catálogo inicial da loja

| Item | Preço | Regras |
|---|---:|---|
| Episódio de série | 40 | — |
| 1 hora de lazer livre | 60 | — |
| Fragmento rúnico | 150 | Colecionável, limite de 12 |
| Sessão de cinema em casa | 250 | Intervalo de 3 dias |
| Refeição especial | 300 | Intervalo de 7 dias |
| Moldura de bronze | 300 | — |
| Título "O Persistente" | 400 | A partir do nível 5 |
| Insígnia do Corredor | 500 | — |
| Aura dourada | 600 | A partir do nível 10 |
| Moldura de prata | 900 | A partir do nível 15 |
| Compra planejada (pequena) | 1.000 | Intervalo de 14 dias |
| Experiência especial | 3.000 | A partir do nível 10 |
| Item físico desejado | 5.000 | A partir do nível 15 |

Itens comuns são acessíveis toda semana. Os grandes exigem meses, o que mantém a loja relevante. Descanso, alimentação e cuidados básicos **nunca** devem ser cadastrados como itens pagos.

## Penalidades na economia

A multa leve começa em 5 moedas e sobe 5 a cada falha consecutiva, até 20. Os limites globais são 40 moedas por dia, 150 por semana e 50% das moedas ganhas na semana. No perfil moderado, as multas custaram 2,2 moedas por dia (~13% do ganho), o suficiente para dar consequência sem criar uma espiral.
