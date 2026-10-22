# 05 — Curva de XP

**Fórmula escolhida:** `XP_necessário(n) = arredondar(13 · n^1,6 + 45)`, onde n é o nível de destino (n ≥ 2). O nível 1 começa com 0 XP. O nível é derivado do XP vitalício por busca binária numa tabela acumulada (`packages/engine/src/curve.ts`), que é a única implementação usada pela API, pela interface e pelas simulações.

## Como foi escolhida

1. Foram simuladas 7 curvas: potência com p = 1,6, 1,8 e 2,0; exponencial de 6% e 8%; e híbrida (potência com cauda exponencial).
2. Os testes usaram 4 perfis (pouco ativo, moderado, consistente e alternante) e **as mesmas funções de recompensa da API**, com limites, retornos decrescentes e multiplicador.
3. Os resultados completos estão em [`simulacoes.md`](simulacoes.md) e podem ser regenerados com `npm run simulate`.

## Por que potência e não exponencial

- **Exponencial** é rápida demais no começo e explode no fim. Com 8%, o nível 100 exige 188 mil XP só para aquele nível, e o perfil moderado chega ao nível 30 em 2 meses e depois praticamente para.
- **Potência p = 2,0** deixa o nível 60 inalcançável para quem é moderado.
- **Potência p = 1,6** dá crescimento perceptível e cada nível é mais caro que o anterior. Também mantém marcos raros alcançáveis com anos de consistência.
- A primeira calibração (A = 20, B = 60) ficou lenta demais com as recompensas reais. O perfil moderado levaria 18 meses até o nível 30, e por isso a escala foi reduzida para A = 13, B = 45.

## Resultado (curva escolhida)

| Perfil | XP/dia | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 5,9 meses | 2,1 anos | 5,6 anos | — | — | — |
| Moderado | 102 | 24 d | 4,6 meses | 11,7 meses | 2,7 anos | 5,7 anos | — |
| Consistente | 247 | 12 d | 58 d | 5 meses | 14 meses | 2,4 anos | **9 anos** |
| Alternante | 98 | 16 d | 3,7 meses | 12 meses | 2,9 anos | 6 anos | — |

A dificuldade é alta de propósito: o nível 100 (rank SS, "Além dos Mortais") é um marco raro de quase uma década de consistência.

## Consequências dos parâmetros

- **A** (escala) multiplica o custo de todos os níveis.
- **p** (progressividade) faz os níveis altos encarecerem mais rápido que os iniciais.
- **B** (dificuldade inicial) pesa mais nos primeiros níveis.
- Mudanças são feitas em **Configurações → Progressão**, com pré-visualização do nível atual e das simulações. Publicar cria uma nova versão auditada. O histórico de níveis já alcançados permanece; o nível exibido passa a usar a nova curva.

## Testes

Ficam em `packages/engine/test/curve.test.ts`: monotonicidade, igualdade entre acumulado e soma, limites exatos (1 XP a menos não sobe), subida de vários níveis numa só operação, nível máximo e validação de parâmetros.
