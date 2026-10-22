# 07 — Catálogo inicial

Criado por usuário no cadastro (`apps/api/src/services/defaults.ts`). Tudo é editável em suas telas ou no Admin. Nada disso é dado de atividade: não há XP, missões concluídas nem histórico fictício.

## Atributos

| Código | Atributo | Evolui com |
|---|---|---|
| FOR | Força | Musculação |
| RES | Resistência | Corrida, caminhada, ciclismo |
| VIT | Vitalidade | Mobilidade e hábitos de saúde |
| INT | Intelecto | Estudos, conteúdos e avaliações |
| DIS | Disciplina | Hábitos cumpridos no dia programado |
| ORG | Organização | Planejamento, revisões e finanças |
| EXE | Execução | Missões e metas concluídas |
| END | Fortaleza mental | Missões Difíceis ou acima e treinos longos (o "END" do protótipo) |

Revisão da lista sugerida:

- *Consistência* virou **métrica** (sequências, taxas e multiplicador), não um atributo.
- *Conhecimento por disciplina* virou **maestria** na árvore de habilidades.
- *Maestria técnica* ficou como ramos de habilidade.

Do protótipo original foram mantidos FOR, VIT, DIS, INT e END. CON (conhecimento) passou a ser maestria; ESP, DES e CAR podem ser criados em Atributos.

## Árvore de habilidades

- Treinamento de força: Força máxima, Técnica, Resistência muscular
- Condicionamento: Corrida, Capacidade aeróbica, Ciclismo
- Recuperação: Mobilidade, Cuidados com a saúde
- Conhecimento: Economia, História, Tecnologia (cada disciplina nova cria sua habilidade)
- Autodomínio: Hábitos, Rotina
- Planejamento: Organização pessoal, Finanças pessoais
- Projetos: Planejamento de projetos, Desenvolvimento, Conclusão
- Superação: Desafios difíceis, Provas de resistência

## Modelos de missão

- **Semana de desenvolvimento** (ativo): semanal e Difícil, com conclusão automática. Objetivos: estudar 5 h, treinar 3 vezes e cumprir 20 hábitos.
- **Revisão semanal** (inativo): semanal e Fácil.
- **Revisão mensal de metas** (inativo): mensal e Moderada.

## Regras de penalidade

Registro de falha, Multa leve (5 / +5 / teto 20), Multa de missão crítica (15 / +10 / teto 40), Freio de consistência (−5% por 3 dias) e Sem tolerância.

## Conquistas (37)

Cobrem consistência (sequências de 7, 30 e 100; 100 e 1.000 hábitos; semanas perfeitas), projetos (1, 25, 100 e 500 missões; Difícil+ e Épica+), estudos (sessões, 100 h, avaliações aprovadas), força (treinos, musculação, recordes), resistência (meia maratona, **Operação 42K**, 500 km e **"O chefe caiu"** com 1.250 km, o "HP do Boss" do protótipo), marcos de nível (10, 30, 60 e 100), economia, metas, temporadas, versatilidade e exploração (secreta).

## Ranks e marcos

G Civil (1) · F Recruta (5) · E Soldado (10) · D Lutador (20) · C Veterano (30) · B Elite (45) · A Mestre (60) · S Lendário (80) · SS Além dos Mortais (100). Cada marco concede um título exclusivo e 10 × o nível em moedas.
