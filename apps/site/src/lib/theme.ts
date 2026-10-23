import { useCallback, useEffect, useState } from 'react';
import { THEMES, type ThemeId } from '../data';

const KEY = 'ascend-site-theme';
const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);

function stored(): ThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (isTheme(v)) return v;
  } catch {
    /* armazenamento indisponível: usa o padrão */
  }
  return 'medieval';
}

/** Tema do site (cores do daisyUI + tipografia), lembrado entre visitas. */
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(stored);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--color-base-100').trim() || '#100d0a');
  }, [theme]);
  const setTheme = useCallback((t: ThemeId) => {
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignora */
    }
  }, []);
  return { theme, setTheme };
}
