import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ApiError } from './lib/api';
import { router } from './app/router';
import { useMe } from './app/session';
import { ConfirmProvider } from './components/ui/Modal';
import { ToastProvider } from './components/ui/Toast';
import { restoreStoredTheme, ThemeSync } from './theme/ThemeProvider';
import { registerPwa } from './pwa';
import './index.css';

restoreStoredTheme();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  },
});

function Root() {
  const me = useMe();
  return (
    <ThemeSync settings={me.data?.settings}>
      <RouterProvider router={router} />
    </ThemeSync>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <Root />
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);

registerPwa();
