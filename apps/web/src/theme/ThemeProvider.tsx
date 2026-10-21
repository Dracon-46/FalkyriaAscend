import { useEffect, type ReactNode } from 'react';
import type { Settings, ThemeKey } from '../lib/types';

const STORAGE_KEY = 'ascend.theme';

export const THEME_META: Record<ThemeKey, { label: string; description: string; swatch: string[] }> = {
  medieval: { label: 'Medieval', description: 'Reino de pedra, metal e pergaminho: ouro envelhecido, marfim, vermelho profundo.', swatch: ['#100d0a', '#c9a84c', '#9e2b25', '#ece3cf'] },
  vampire: { label: 'Vampiros', description: 'Grimório gótico e aristocrático: preto profundo, prata envelhecida, bordô contido.', swatch: ['#08060a', '#b8b4c4', '#8f1d33', '#5b2a6e'] },
  angel: { label: 'Anjos', description: 'Catedral celestial clara: marfim, ouro, prata e azul celeste, com raios de luz.', swatch: ['#f4efe4', '#8c6a1c', '#2f5f99', '#fffdf8'] },
  system: { label: 'Sistema', description: 'Interface de status de anime: painéis translúcidos, bordas luminosas, ciano e violeta.', swatch: ['#04060c', '#3ad7ff', '#8b5cf6', '#dce8ff'] },
  custom: { label: 'Personalizado', description: 'Escolha a base, as cores de destaque e a intensidade dos efeitos.', swatch: ['#1d1711', '#888', '#555', '#eee'] },
};

type ThemePrefs = Pick<Settings, 'theme' | 'customTheme' | 'reducedMotion'>;

/** Aplica o tema no elemento <html>. Todas as telas compartilham a mesma estrutura. */
export function applyTheme(p: ThemePrefs) {
  const root = document.documentElement;
  const base = p.theme === 'custom' ? (p.customTheme?.base ?? 'medieval') : p.theme;
  root.dataset.theme = base;
  root.dataset.motion = p.reducedMotion === 'on' ? 'reduced' : p.reducedMotion === 'off' ? 'full' : '';
  if (!root.dataset.motion) delete root.dataset.motion;
  const systemReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const reduced = p.reducedMotion === 'on' || (p.reducedMotion === 'system' && systemReduced);
  const effects = p.theme === 'custom' ? (p.customTheme?.effects ?? 1) : 1;
  root.style.setProperty('--fx', String(reduced ? Math.min(effects, 0.35) : effects));
  if (p.theme === 'custom' && p.customTheme) {
    root.style.setProperty('--accent', p.customTheme.accent);
    root.style.setProperty('--accent-strong', `color-mix(in srgb, ${p.customTheme.accent} 80%, white)`);
    root.style.setProperty('--accent-soft', `color-mix(in srgb, ${p.customTheme.accent} 14%, transparent)`);
    root.style.setProperty('--accent-2', p.customTheme.accent2);
    root.style.setProperty('--accent-2-soft', `color-mix(in srgb, ${p.customTheme.accent2} 18%, transparent)`);
    root.style.setProperty('--chart-1', p.customTheme.accent);
    root.style.setProperty('--chart-2', p.customTheme.accent2);
  } else {
    for (const v of ['--accent', '--accent-strong', '--accent-soft', '--accent-2', '--accent-2-soft', '--chart-1', '--chart-2']) root.style.removeProperty(v);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#100d0a');
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* armazenamento indisponível: apenas não lembra o tema antes do login */
  }
  window.dispatchEvent(new Event('ascend:theme'));
}

export function restoreStoredTheme() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) applyTheme(JSON.parse(raw) as ThemePrefs);
  } catch {
    /* ignorado */
  }
}

export function ThemeSync({ settings, children }: { settings: ThemePrefs | null | undefined; children: ReactNode }) {
  useEffect(() => {
    if (settings) applyTheme(settings);
  }, [settings?.theme, settings?.reducedMotion, JSON.stringify(settings?.customTheme)]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>{children}</>;
}
