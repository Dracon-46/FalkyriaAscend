# 08 — Design system

## Tokens (`apps/web/src/theme/themes.css`)

Todos os temas definem o mesmo conjunto de variáveis CSS:

- **Tipografia:** `--font-display/body/num`, `--body-size`, `--title-transform`, `--title-tracking`
- **Superfícies:** `--bg`, `--bg-2`, `--surface`, `--surface-2`, `--surface-hover`, `--panel-bg`, `--page-bg`
- **Bordas e texto:** `--border`, `--border-strong`, `--text`, `--text-muted`, `--text-faint`
- **Acentos:** `--accent(-strong/-soft/-contrast)`, `--accent-2(-soft)`
- **Estados:** `--success`, `--warning`, `--danger`, `--info`
- **Jogo:** `--xp` (gradiente da barra), `--coin`
- **Forma:** `--radius`, `--radius-sm`, `--shadow`, `--glow`, `--focus`, `--ornament`
- **Gráficos:** `--chart-1..8`, `--chart-grid`, `--chart-axis`
- **Efeitos:** `--fx` (0–1), intensidade de brilho e texturas. Fica reduzida com movimento reduzido.

O Tailwind lê os tokens via `@theme inline` (`bg-surface`, `text-muted`, `border-line`, `text-accent`…).

## Temas

| Tema | Identidade | Tipografia |
|---|---|---|
| Medieval | Pedra, couro e ouro envelhecido; vermelho profundo e verde floresta; cantoneiras de metal nos painéis | Cinzel + EB Garamond |
| Vampiros | Preto profundo, prata, bordô contido e roxo; filete prateado em arco | Cinzel Decorative + Cormorant Garamond |
| Anjos | Tema claro em marfim, ouro, prata e azul celeste; raios de luz e filete dourado | Marcellus + Spectral |
| Sistema | Fundo escuro com grade, painéis translúcidos, colchetes luminosos, ciano e violeta | Rajdhani + Inter + JetBrains Mono |
| Personalizado | Base escolhida + destaque e secundária + intensidade de efeitos | Da base |

A aplicação é uma só: o tema troca tokens e ornamentos (`[data-theme] .panel::before/after`), nunca a estrutura.

## Componentes (`apps/web/src/components`)

- **Primitivos:** Button (primary, secondary, ghost, danger; sm; carregando), IconButton, Input, Textarea, Select, Checkbox, Field (rótulo, dica, erro), Panel, PageHeader, Badge, ProgressBar (XP), Stat, Tabs, Segmented, EmptyState, ErrorState, Loading e Skeleton.
- **Camadas:** Modal (`<dialog>` nativo), ConfirmProvider (com motivo obrigatório para ações auditadas), ToastProvider (`toast.reward` padroniza XP, moedas, explicação, subida de nível e conquistas) e LevelUpOverlay.
- **Domínio:** DifficultyBadge (7 marcas), StatusBadge, TypeBadge, RarityBadge, Coins, Xp e AttrWeights.
- **Formulários:** useForm (o mesmo Zod da API), WeightsEditor, PenaltyRulesPicker, CategorySelect e WeekdayPicker.
- **Gráficos:** AttributeRadar (teia de aranha, atual vs. período anterior), TimeSeriesChart (barras, áreas e linhas com dois eixos), DonutChart e StatusStrip. Todos têm estado vazio, tooltip, legenda e alternativa em tabela.
- **Ícones:** um conjunto curado do lucide em `Icon.tsx`. Os nomes ficam guardados no banco, e emojis não são usados como ícones.

## Acessibilidade

Foco visível via `--focus`, link "Pular para o conteúdo", rótulos em todos os campos, `aria-pressed` em alternâncias, `role=alert` em erros, gráficos com versão em tabela, `prefers-reduced-motion` e preferência explícita, contraste verificado nos temas e alvos de toque de 36 px ou mais.

## Recursos substituíveis

O ícone do app fica em `public/icons/icon.svg`; os PNG do PWA são gerados com `npm run icons -w @rpg/web`. Nome e empresa ficam em `src/lib/brand.ts`.
