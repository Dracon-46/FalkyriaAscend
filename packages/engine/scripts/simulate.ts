/**
 * Gera o relatório de simulação de progressão e economia em Markdown.
 * Uso: npm run simulate -- [--out ../../docs/simulacoes.md] [--years 10]
 */
import { writeFileSync } from 'node:fs';
import { DEFAULT_GAME_CONFIG, DEFAULT_PROFILES, curveTable, formatDuration, simulateProfile, type CurveConfig, type GameConfig } from '../src/index';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const out = outIdx >= 0 ? args[outIdx + 1] : null;
const yearsIdx = args.indexOf('--years');
const years = yearsIdx >= 0 ? Number(args[yearsIdx + 1]) : 12;
const days = Math.round(years * 365.25);
const marks = [2, 5, 10, 20, 30, 45, 60, 80, 100];

const candidates: Array<{ name: string; curve: CurveConfig }> = [
  { name: 'Potência 13·n^1.6+45 (ESCOLHIDA)', curve: DEFAULT_GAME_CONFIG.curves.character },
  { name: 'Potência 20·n^1.6+60 (escala original)', curve: { kind: 'power', A: 20, p: 1.6, B: 60, maxLevel: 999 } },
  { name: 'Potência p=1.8', curve: { kind: 'power', A: 12, p: 1.8, B: 60, maxLevel: 999 } },
  { name: 'Potência p=2.0', curve: { kind: 'power', A: 8, p: 2, B: 80, maxLevel: 999 } },
  { name: 'Exponencial 6%', curve: { kind: 'exponential', base: 150, growth: 1.06, maxLevel: 999 } },
  { name: 'Exponencial 8%', curve: { kind: 'exponential', base: 100, growth: 1.08, maxLevel: 999 } },
  { name: 'Híbrida p=1.6 + 1.5% após 25', curve: { kind: 'hybrid', A: 18, p: 1.6, B: 70, knee: 25, growth: 1.015, maxLevel: 999 } },
];

const lines: string[] = [];
const p = (s = '') => lines.push(s);

p('# Simulações de progressão e economia');
p();
p(`> Gerado por \`npm run simulate\` em ${new Date().toISOString().slice(0, 10)} com a configuração v${DEFAULT_GAME_CONFIG.version}.`);
p('> As simulações usam as mesmas funções de recompensa da API (`@rpg/engine`). São estimativas sob premissas explícitas, não promessas.');
p();
p('## Perfis simulados');
p();
for (const prof of DEFAULT_PROFILES) p(`- **${prof.label}** — ${prof.description}`);
p();
p('Premissas comuns: semente aleatória fixa (42); hábitos “Rotineira”; missões diárias/semanais/mensais conforme o perfil;');
p('não inclui bônus de conquistas, marcos de sequência e temporadas (que aceleram levemente a progressão).');
p();

for (const c of candidates) {
  const cfg: GameConfig = { ...DEFAULT_GAME_CONFIG, curves: { ...DEFAULT_GAME_CONFIG.curves, character: c.curve } };
  p(`## Curva: ${c.name}`);
  p();
  p('`' + JSON.stringify(c.curve) + '`');
  p();
  const table = curveTable(c.curve, [2, 5, 10, 20, 30, 50, 75, 100]);
  p('| Nível | XP para o nível | XP acumulado |');
  p('|---:|---:|---:|');
  for (const r of table) p(`| ${r.level} | ${r.required.toLocaleString('pt-BR')} | ${r.cumulative.toLocaleString('pt-BR')} |`);
  p();
  p(`| Perfil | XP/dia | ${marks.map((m) => `Nv ${m}`).join(' | ')} |`);
  p(`|---|---:|${marks.map(() => '---:').join('|')}|`);
  for (const prof of DEFAULT_PROFILES) {
    const r = simulateProfile(prof, cfg, { days, levelMarks: marks });
    p(`| ${r.label} | ${Math.round(r.avgXpPerDay)} | ${marks.map((m) => formatDuration(r.levelReachedDay[m] ?? null)).join(' | ')} |`);
  }
  p();
}

p('## Economia de moedas (configuração padrão)');
p();
p('Penalidade simulada: 1 hábito com regra “Perda de moedas” (base 5, +5 por falha consecutiva, teto 20; limite diário 40).');
p();
p('| Perfil | Moedas brutas/dia | Penalidades/dia | Líquido/semana | Dias p/ item comum (60) | Especial (250) | Grande (1.000) | Épico (3.000) |');
p('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const prof of DEFAULT_PROFILES) {
  const r = simulateProfile(prof, DEFAULT_GAME_CONFIG, { days: 365, penalty: { base: 5, step: 5, max: 20 } });
  const net = r.avgCoinsPerDay - r.avgPenaltyCoinsPerDay;
  const d = (price: number) => (net > 0 ? `${Math.ceil(price / net)} d` : '—');
  p(
    `| ${r.label} | ${r.avgCoinsPerDay.toFixed(1)} | ${r.avgPenaltyCoinsPerDay.toFixed(1)} | ${(net * 7).toFixed(0)} | ${d(60)} | ${d(250)} | ${d(1000)} | ${d(3000)} |`,
  );
}
p();
p('Leitura: “dias para” assume que todo o saldo líquido é poupado para aquele item. Na prática o usuário gasta em itens comuns,');
p('então itens grandes exigem semanas a meses de consistência — o objetivo é que a loja continue relevante após meses de uso.');
p();

const report = lines.join('\n');
if (out) {
  writeFileSync(out, report + '\n');
  console.log(`Relatório gravado em ${out}`);
} else {
  console.log(report);
}
