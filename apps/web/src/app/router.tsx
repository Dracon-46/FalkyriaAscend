import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, Navigate, useRouteError } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { ErrorState, Loading } from '../components/ui/primitives';
import { AuthPage } from '../features/auth/AuthPage';
import { VerifyEmailPage } from '../features/auth/VerifyEmailPage';
import { useMe } from './session';

const page = (loader: () => Promise<Record<string, unknown>>, name: string) => {
  const C = lazy(async () => ({ default: (await loader())[name] as React.ComponentType }));
  return (
    <Suspense fallback={<Loading />}>
      <C />
    </Suspense>
  );
};

function Protected({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return <Loading label="Abrindo os portões…" />;
  if (me.isError)
    return (
      <div className="p-6">
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      </div>
    );
  if (!me.data) return <Navigate to="/entrar" replace />;
  return <>{children}</>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.data?.user.role !== 'admin') return <Navigate to="/" replace />;
  return <>{children}</>;
}

function RouteError() {
  const err = useRouteError();
  return (
    <div className="p-6">
      <ErrorState error={err instanceof Error ? err : new Error('Página não encontrada.')} onRetry={() => window.location.reload()} />
    </div>
  );
}

export const router = createBrowserRouter([
  { path: '/entrar', element: <AuthPage mode="login" /> },
  { path: '/cadastro', element: <AuthPage mode="register" /> },
  { path: '/verificar-email', element: <VerifyEmailPage /> },
  {
    path: '/',
    element: (
      <Protected>
        <AppLayout />
      </Protected>
    ),
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(() => import('../features/dashboard/DashboardPage'), 'DashboardPage') },
      { path: 'personagem', element: page(() => import('../features/character/CharacterPage'), 'CharacterPage') },
      { path: 'missoes', element: page(() => import('../features/missions/MissionsPage'), 'MissionsPage') },
      { path: 'missoes/:id', element: page(() => import('../features/missions/MissionDetailPage'), 'MissionDetailPage') },
      { path: 'metas', element: page(() => import('../features/goals/GoalsPage'), 'GoalsPage') },
      { path: 'habitos', element: page(() => import('../features/habits/HabitsPage'), 'HabitsPage') },
      { path: 'treinos', element: page(() => import('../features/training/TrainingPage'), 'TrainingPage') },
      { path: 'estudos', element: page(() => import('../features/study/StudyPage'), 'StudyPage') },
      { path: 'atributos', element: page(() => import('../features/attributes/AttributesPage'), 'AttributesPage') },
      { path: 'conquistas', element: page(() => import('../features/achievements/AchievementsPage'), 'AchievementsPage') },
      { path: 'inventario', element: page(() => import('../features/inventory/InventoryPage'), 'InventoryPage') },
      { path: 'loja', element: page(() => import('../features/shop/ShopPage'), 'ShopPage') },
      { path: 'estatisticas', element: page(() => import('../features/stats/StatsPage'), 'StatsPage') },
      { path: 'historico', element: page(() => import('../features/history/HistoryPage'), 'HistoryPage') },
      { path: 'temporadas', element: page(() => import('../features/seasons/SeasonsPage'), 'SeasonsPage') },
      { path: 'configuracoes', element: page(() => import('../features/settings/SettingsPage'), 'SettingsPage') },
      { path: 'admin', element: <AdminOnly>{page(() => import('../features/admin/AdminPage'), 'AdminPage')}</AdminOnly> },
      { path: 'admin/:resource', element: <AdminOnly>{page(() => import('../features/admin/AdminPage'), 'AdminPage')}</AdminOnly> },
      { path: '*', element: <RouteError /> },
    ],
  },
]);
