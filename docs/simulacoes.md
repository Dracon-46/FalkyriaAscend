# Simulações de progressão e economia

> Gerado por `npm run simulate` em 2026-10-22 com a configuração v1.
> As simulações usam as mesmas funções de recompensa da API (`@rpg/engine`). São estimativas sob premissas explícitas, não promessas.

## Perfis simulados

- **Pouco ativo** — ~40% dos dias ativos; 2 de 4 hábitos; estudo e treino curtos e esporádicos.
- **Moderadamente ativo** — ~75% dos dias ativos; 5 hábitos (80%); 1h de estudo e ~50 min de treino em metade dos dias.
- **Altamente consistente** — ~93% dos dias ativos; 6 hábitos (95%); 90 min de estudo e 1h de treino quase diários.
- **Alterna atividade e pausa** — 6 semanas no ritmo alto, 4 semanas quase inativo (10% dos dias), em ciclos.

Premissas comuns: semente aleatória fixa (42); hábitos “Rotineira”; missões diárias/semanais/mensais conforme o perfil;
não inclui bônus de conquistas, marcos de sequência e temporadas (que aceleram levemente a progressão).

## Curva: Potência 13·n^1.6+45 (ESCOLHIDA)

`{"kind":"power","A":13,"p":1.6,"B":45,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 84 | 84 |
| 5 | 216 | 584 |
| 10 | 563 | 2.647 |
| 20 | 1.614 | 13.705 |
| 30 | 3.046 | 37.437 |
| 50 | 6.842 | 136.310 |
| 75 | 13.048 | 384.924 |
| 100 | 20.649 | 807.215 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 7 d | 27 d | 5.9 meses | 2.1 anos | 5.6 anos | — | — | — | — |
| Moderadamente ativo | 102 | 1 d | 5 d | 24 d | 4.6 meses | 11.7 meses | 2.7 anos | 5.7 anos | — | — |
| Altamente consistente | 247 | 1 d | 3 d | 12 d | 58 d | 5.0 meses | 14.1 meses | 2.4 anos | 5.1 anos | 9.0 anos |
| Alterna atividade e pausa | 98 | 1 d | 4 d | 16 d | 3.7 meses | 12.0 meses | 2.9 anos | 6.0 anos | — | — |

## Curva: Potência 20·n^1.6+60 (escala original)

`{"kind":"power","A":20,"p":1.6,"B":60,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 121 | 121 |
| 5 | 323 | 864 |
| 10 | 856 | 3.992 |
| 20 | 2.474 | 20.910 |
| 30 | 4.678 | 57.331 |
| 50 | 10.516 | 209.259 |
| 75 | 20.065 | 591.510 |
| 100 | 31.758 | 1.240.960 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 8 d | 38 d | 8.5 meses | 3.1 anos | 8.7 anos | — | — | — | — |
| Moderadamente ativo | 102 | 2 d | 9 d | 42 d | 6.7 meses | 17.9 meses | 4.2 anos | 9.0 anos | — | — |
| Altamente consistente | 247 | 1 d | 4 d | 16 d | 2.8 meses | 7.6 meses | 21.6 meses | 3.7 anos | 7.8 anos | — |
| Alterna atividade e pausa | 98 | 1 d | 5 d | 26 d | 6.0 meses | 18.6 meses | 4.5 anos | 9.3 anos | — | — |

## Curva: Potência p=1.8

`{"kind":"power","A":12,"p":1.8,"B":60,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 102 | 102 |
| 5 | 277 | 732 |
| 10 | 817 | 3.622 |
| 20 | 2.697 | 21.298 |
| 30 | 5.530 | 63.099 |
| 50 | 13.779 | 254.811 |
| 75 | 28.524 | 781.137 |
| 100 | 47.833 | 1.736.059 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 8 d | 32 d | 7.9 meses | 3.2 anos | 9.5 anos | — | — | — | — |
| Moderadamente ativo | 102 | 2 d | 7 d | 38 d | 6.8 meses | 19.8 meses | 5.0 anos | 11.3 anos | — | — |
| Altamente consistente | 247 | 1 d | 3 d | 15 d | 2.9 meses | 8.5 meses | 2.1 anos | 4.7 anos | 10.4 anos | — |
| Alterna atividade e pausa | 98 | 1 d | 5 d | 24 d | 6.5 meses | 20.8 meses | 5.4 anos | 11.8 anos | — | — |

## Curva: Potência p=2.0

`{"kind":"power","A":8,"p":2,"B":80,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 112 | 112 |
| 5 | 280 | 752 |
| 10 | 880 | 3.792 |
| 20 | 3.280 | 24.472 |
| 30 | 7.280 | 77.952 |
| 50 | 20.080 | 347.312 |
| 75 | 45.080 | 1.153.512 |
| 100 | 80.080 | 2.714.712 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 8 d | 32 d | 8.2 meses | 3.7 anos | 11.6 anos | — | — | — | — |
| Moderadamente ativo | 102 | 2 d | 7 d | 40 d | 7.9 meses | 2.1 anos | 6.8 anos | — | — | — |
| Altamente consistente | 247 | 1 d | 3 d | 15 d | 3.3 meses | 10.5 meses | 2.9 anos | 6.6 anos | — | — |
| Alterna atividade e pausa | 98 | 1 d | 5 d | 25 d | 7.7 meses | 2.1 anos | 7.1 anos | — | — | — |

## Curva: Exponencial 6%

`{"kind":"exponential","base":150,"growth":1.06,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 150 | 150 |
| 5 | 179 | 657 |
| 10 | 239 | 1.725 |
| 20 | 428 | 5.065 |
| 30 | 767 | 11.047 |
| 50 | 2.459 | 40.947 |
| 75 | 10.554 | 183.960 |
| 100 | 45.297 | 797.747 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 9 d | 31 d | 3.4 meses | 10.8 meses | 20.6 meses | 4.5 anos | 11.2 anos | — | — |
| Moderadamente ativo | 102 | 2 d | 6 d | 15 d | 53 d | 3.8 meses | 9.3 meses | 23.9 meses | 6.5 anos | — |
| Altamente consistente | 247 | 1 d | 3 d | 7 d | 21 d | 48 d | 4.0 meses | 10.1 meses | 2.8 anos | 8.8 anos |
| Alterna atividade e pausa | 98 | 1 d | 4 d | 12 d | 32 d | 3.2 meses | 9.7 meses | 2.0 anos | 6.9 anos | — |

## Curva: Exponencial 8%

`{"kind":"exponential","base":100,"growth":1.08,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 100 | 100 |
| 5 | 126 | 451 |
| 10 | 185 | 1.249 |
| 20 | 400 | 4.146 |
| 30 | 863 | 10.399 |
| 50 | 4.021 | 53.039 |
| 75 | 27.538 | 370.519 |
| 100 | 188.594 | 2.544.775 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 8 d | 23 d | 2.1 meses | 8.9 meses | 19.5 meses | 5.4 anos | — | — | — |
| Moderadamente ativo | 102 | 1 d | 5 d | 13 d | 42 d | 3.6 meses | 11.2 meses | 3.1 anos | — | — |
| Altamente consistente | 247 | 1 d | 2 d | 5 d | 17 d | 45 d | 4.8 meses | 15.6 meses | 6.1 anos | — |
| Alterna atividade e pausa | 98 | 1 d | 3 d | 8 d | 28 d | 3.0 meses | 11.6 meses | 3.2 anos | — | — |

## Curva: Híbrida p=1.6 + 1.5% após 25

`{"kind":"hybrid","A":18,"p":1.6,"B":70,"knee":25,"growth":1.015,"maxLevel":999}`

| Nível | XP para o nível | XP acumulado |
|---:|---:|---:|
| 2 | 125 | 125 |
| 5 | 306 | 840 |
| 10 | 787 | 3.734 |
| 20 | 2.242 | 19.120 |
| 30 | 4.553 | 52.963 |
| 50 | 13.756 | 229.552 |
| 75 | 38.050 | 851.354 |
| 100 | 87.355 | 2.375.295 |

| Perfil | XP/dia | Nv 2 | Nv 5 | Nv 10 | Nv 20 | Nv 30 | Nv 45 | Nv 60 | Nv 80 | Nv 100 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 18 | 8 d | 38 d | 8.1 meses | 2.8 anos | 7.9 anos | — | — | — | — |
| Moderadamente ativo | 102 | 2 d | 9 d | 39 d | 6.3 meses | 16.6 meses | 4.4 anos | 10.9 anos | — | — |
| Altamente consistente | 247 | 1 d | 4 d | 15 d | 2.6 meses | 7.0 meses | 22.6 meses | 4.5 anos | 11.8 anos | — |
| Alterna atividade e pausa | 98 | 1 d | 5 d | 25 d | 5.6 meses | 16.9 meses | 4.7 anos | 11.4 anos | — | — |

## Economia de moedas (configuração padrão)

Penalidade simulada: 1 hábito com regra “Perda de moedas” (base 5, +5 por falha consecutiva, teto 20; limite diário 40).

| Perfil | Moedas brutas/dia | Penalidades/dia | Líquido/semana | Dias p/ item comum (60) | Especial (250) | Grande (1.000) | Épico (3.000) |
|---|---:|---:|---:|---:|---:|---:|---:|
| Pouco ativo | 2.6 | 1.0 | 11 | 37 d | 153 d | 611 d | 1832 d |
| Moderadamente ativo | 16.3 | 2.2 | 99 | 5 d | 18 d | 71 d | 213 d |
| Altamente consistente | 38.3 | 0.5 | 265 | 2 d | 7 d | 27 d | 80 d |
| Alterna atividade e pausa | 14.3 | 1.2 | 92 | 5 d | 20 d | 77 d | 230 d |

Leitura: “dias para” assume que todo o saldo líquido é poupado para aquele item. Na prática o usuário gasta em itens comuns,
então itens grandes exigem semanas a meses de consistência — o objetivo é que a loja continue relevante após meses de uso.

