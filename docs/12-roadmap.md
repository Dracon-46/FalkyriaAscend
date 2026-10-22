# 12 — Roadmap, status e ideias

## Status por fase

| Fase | Conteúdo | Status |
|---|---|---|
| 1 — Fundação | Monorepo, PostgreSQL, migrações, autenticação, tokens e casca da interface | ✅ |
| 2 — Motor | Curva, XP, atributos, maestria, livro-razão, transações, idempotência, testes | ✅ |
| 3 — Núcleo | Painel, missões, hábitos, penalidades, metas, estudos, treinos, histórico | ✅ |
| 4 — Economia e coleções | Loja, inventário, conquistas, títulos, habilidades, temporadas | ✅ |
| 5 — Analytics e interface | Gráficos, filtros, comparações e os 5 temas | ✅ |
| 6 — Integrações | Strava, Lyfta, Hevy e importação | 🟡 Código e testes prontos; **falta validar com credenciais reais** |
| 7 — Estabilização | Testes, segurança, acessibilidade, documentação, backup | 🟡 Base pronta; ver pendências |

## Pendências conhecidas

- [ ] Validar Lyfta com uma chave real, incluindo a unidade de peso (não documentada).
- [ ] Decidir sobre o Strava diante da política de 2026 (consultar developers@strava.com) e validar o OAuth/webhook com um app real.
- [ ] Notificações push (Web Push / VAPID), respeitando o horário silencioso já salvo.
- [x] Arquitetura: repositórios, consultas, unit of work, casos de uso e regras de dependência verificadas na CI (ADR-001).
- [x] Git Flow, CI (GitHub Actions), templates, CODEOWNERS, Dependabot e Prettier.
- [ ] Dividir páginas grandes da interface (Estudos e Treinos).
- [x] ESLint (TypeScript, React hooks) na CI, junto com Prettier e dependency-cruiser.
- [ ] Auditoria de acessibilidade com leitor de tela real e axe.
- [ ] Bloqueio distribuído do agendador, caso o app rode com mais de uma instância.

## Ideias propostas pelo dono do produto

### 1. Personagem 3D editável e animado (estilo "modo carreira")

- **Caminho viável:** um avatar 3D no navegador com three.js / React Three Fiber, a partir de um modelo-base riggado (formato glTF) com partes trocáveis: cabelo, roupas, armaduras e acessórios, que podem vir dos itens cosméticos da loja e do inventário. Animações (parado, comemorando ao subir de nível, treinando) podem ser feitas com clipes Mixamo, se a licença permitir, ou criados à mão.
- **Ligação com o jogo:** atributos alteram a aparência de forma sutil (postura, aura por rank), e equipar um item muda o modelo.
- **Custo:** alto. O maior esforço é arte e rigging, não código. É possível começar por avatar 2D em camadas e evoluir.

### 2. Foto → personagem

- Exige um modelo de IA de imagem (estilização ou geração de avatar). **Pontos de segurança:** a foto é dado biométrico sensível. Recomendo processar localmente ou num serviço com consentimento explícito, guardar só o avatar gerado, nunca a foto, e permitir apagar tudo.
- Pode rodar localmente com o OpenJarvis (abaixo) usando um modelo de imagem local, se o hardware permitir. Caso contrário, com um provedor externo e consentimento claro.

### 3. Missões e desafios gerados pelo próprio sistema

- **Já existe:** sugestões determinísticas (áreas negligenciadas, metas sem missões, hábitos com baixa adesão, ritmo de estudo), sempre como sugestão revisável e sem penalidade.
- **Próximo passo:** um gerador com IA que proponha missões a partir de metas, histórico e tempo disponível, sempre revisado pelo usuário antes de criar e passando pelas mesmas validações de dificuldade do motor.
- **Restrição:** dados vindos do Strava não podem ir para IA (política do Strava).

### 4. Integração com OpenJarvis (Stanford, Apache-2.0)

O OpenJarvis é um framework de agentes de IA **local-first**. Ele roda modelos no próprio computador (via Ollama, vLLM ou llama.cpp), expõe uma API compatível com OpenAI (`jarvis serve` → `http://localhost:8000`) e conecta ferramentas via MCP.

Integração proposta:

1. **Servidor MCP do Ascend:** ferramentas `listar_missoes`, `sugerir_missao`, `registrar_habito`, `resumo_do_dia` etc., chamando a própria API com um token pessoal e escopos restritos. Assim o Jarvis pode, por voz ou chat, consultar o progresso e registrar atividades.
2. **Mestre do jogo local:** o Ascend chama o endpoint OpenAI-compatível do Jarvis para gerar missões, narrativas de temporada e resumos semanais, **sem enviar dados para a nuvem**.
3. **Resumo matinal:** um agente agendado do Jarvis lê o painel e envia o plano do dia.

Para isso, o Ascend precisa de tokens de acesso pessoais com escopo (hoje só há sessão por cookie) e de um filtro que exclua dados do Strava. O desenho detalhado fica para um ADR próprio antes da implementação.

### 5. Dificuldade do XP

É intencionalmente difícil: o nível 100 leva cerca de 9 anos de alta consistência (ver doc 05). Tudo é calibrável em Configurações → Progressão, com simulação antes de publicar.
