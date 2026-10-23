# Como o jogo funciona

O Ascend tem **quatro sistemas independentes**. Cada ação pode alimentar mais de um, mas nenhum "gasta" o outro.

| Sistema | O que mede | Como cresce |
|---|---|---|
| **XP geral** | Sua progressão vitalícia, que define o nível | Missões, hábitos, estudos, treinos, metas, conquistas e marcos |
| **XP de atributo** | Dimensões como Força, Intelecto e Disciplina | O XP base da atividade, distribuído pelos pesos de atributo dela |
| **Maestria** | Habilidades específicas (Corrida, Economia, Técnica…) | Tempo efetivo, conteúdo concluído, avaliações e marcos de domínio |
| **Moedas** | A economia da loja | Tabela por dificuldade e por tempo, sempre com limites |

## Níveis e ranks

O XP necessário para cada nível segue `13 · n^1,6 + 45`, e cada nível custa mais que o anterior. A curva foi escolhida por simulação com quatro perfis de jogador:

| Perfil | Nível 10 | Nível 30 | Nível 60 | Nível 100 |
|---|---:|---:|---:|---:|
| Moderado (~100 XP/dia) | 24 dias | ~1 ano | ~5,7 anos | — |
| Consistente (~250 XP/dia) | 12 dias | 5 meses | 2,4 anos | ~9 anos |

Ranks: **G** (1) · **F** (5) · **E** (10) · **D** (20) · **C** (30) · **B** (45) · **A** (60) · **S** (80) · **SS** (100). Cada rank concede um título e moedas.

**O XP vitalício e o nível nunca diminuem**, nem por falhas nem por penalidades.

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

Para evitar inflação: Épica exige 7 dias ou mais e 3 objetivos; Lendária exige 28 dias ou mais e 3 objetivos. A partir da quarta missão Difícil ou acima no mesmo dia, a recompensa cai para 50% e depois 25%.

## Estudo e treino

- Tempo efetivo: 100% até 60 min, 50% até 120 min, 25% até 240 min e nada depois disso.
- 1 XP e 0,5 de maestria por minuto efetivo, mais 4 moedas a cada 30 minutos.
- O tipo de treino aplica intensidade de 0,5 a 1,5; distância rende +2 XP/km, até 21 km.
- Limites diários de XP: estudo 300, treino 250, hábitos 400, missões 1.500 e registro rápido 150.

## Multiplicador de consistência

Calculado sobre os hábitos dos últimos 14 dias: cumprir 90% ou mais dá **×1,10**, e 75% ou mais dá **×1,05** em XP geral e moedas. Atributos não são multiplicados.

## Moedas e loja

Todo ganho e gasto vai para um **livro-razão imutável**. O saldo nunca fica negativo, e compras guardam o preço pago, então mudar o preço depois não altera o histórico. Itens comuns cabem numa semana de jogo; os grandes exigem meses.

## Tudo é configurável

Em **Configurações → Progressão** você ajusta a curva, os limites e as recompensas, com pré-visualização e simulação antes de publicar. Cada recompensa guarda a versão da configuração usada, então mudanças não reescrevem o passado.

Detalhes técnicos: [regras](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/04-regras-de-gamificacao.md), [curva de XP](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/05-curva-de-xp.md) e [economia](https://github.com/Dracon-46/FalkyriaAscend/blob/main/docs/06-economia.md).
