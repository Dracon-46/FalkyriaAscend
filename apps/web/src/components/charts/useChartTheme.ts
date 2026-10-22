import { useEffect, useState } from 'react';

export interface ChartTheme {
  series: string[];
  grid: string;
  axis: string;
  text: string;
  muted: string;
  surface: string;
  border: string;
  accent: string;
  accent2: string;
  success: string;
  danger: string;
  warning: string;
  font: string;
  animate: boolean;
}

function read(): ChartTheme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  const fx = Number(v('--fx') || 1);
  return {
    series: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => v(`--chart-${i}`)),
    grid: v('--chart-grid'),
    axis: v('--chart-axis'),
    text: v('--text'),
    muted: v('--text-muted'),
    surface: v('--surface-2'),
    border: v('--border'),
    accent: v('--accent'),
    accent2: v('--accent-2'),
    success: v('--success'),
    danger: v('--danger'),
    warning: v('--warning'),
    font: v('--font-body'),
    animate: fx > 0.5 && document.documentElement.dataset.motion !== 'reduced',
  };
}

/** Cores dos gráficos derivadas do tema ativo (atualiza ao trocar de tema). */
export function useChartTheme(): ChartTheme {
  const [t, setT] = useState<ChartTheme>(() => read());
  useEffect(() => {
    const update = () => setT(read());
    window.addEventListener('ascend:theme', update);
    return () => window.removeEventListener('ascend:theme', update);
  }, []);
  return t;
}
