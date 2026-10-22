import { registerSW } from 'virtual:pwa-register';

/** Registra o service worker (apenas a casca do app é armazenada; dados vêm sempre da API). */
export function registerPwa() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const update = registerSW({
    onNeedRefresh() {
      if (window.confirm('Uma nova versão do Ascend está disponível. Atualizar agora?')) void update(true);
    },
  });
}
