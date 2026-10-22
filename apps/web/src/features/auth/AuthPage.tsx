import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loginInput, registerInput } from '@rpg/contracts';
import { api, errorMessage } from '../../lib/api';
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from '../../lib/brand';
import { useMe } from '../../app/session';
import { Button, Input } from '../../components/ui/primitives';
import { Icon } from '../../components/ui/Icon';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api.get<{ hasUsers: boolean; registrationOpen: boolean }>('/api/auth/status') });
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const submit = useMutation({
    mutationFn: async () => {
      const schema = mode === 'login' ? loginInput : registerInput;
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        throw new Error('Verifique os campos destacados.');
      }
      setErrors({});
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return mode === 'login' ? api.post('/api/auth/login', parsed.data) : api.post('/api/auth/register', { ...parsed.data, timezone: tz });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
  });

  if (me.data) return <Navigate to="/" replace />;
  const firstRun = status.data && !status.data.hasUsers;
  const effectiveMode = firstRun ? 'register' : mode;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/icons/icon.svg" alt="" width={64} height={64} className="mx-auto mb-3" />
          <h1 className="text-3xl tracking-[0.3em] text-accent">{APP_NAME.toUpperCase()}</h1>
          <p className="mt-1 text-muted">{APP_TAGLINE}</p>
          <p className="mt-1 text-xs tracking-[0.25em] text-faint uppercase">um produto {COMPANY_NAME}</p>
        </div>
        <form
          className="panel space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit.mutate();
          }}
          noValidate
        >
          <h2 className="panel-title">{effectiveMode === 'login' ? 'Entrar no reino' : firstRun ? 'Criar o personagem fundador' : 'Criar conta'}</h2>
          {firstRun && (
            <p className="flex gap-2 text-sm text-muted">
              <Icon name="info" className="mt-0.5 shrink-0 text-info" />
              Primeira execução: esta conta será a administradora da instalação.
            </p>
          )}
          {effectiveMode === 'register' && (
            <Input
              label="Nome do personagem"
              value={form.displayName}
              onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              error={errors.displayName}
              autoComplete="nickname"
            />
          )}
          <Input
            label="E-mail"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
            autoComplete="email"
          />
          <Input
            label="Senha"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password}
            autoComplete={effectiveMode === 'login' ? 'current-password' : 'new-password'}
            hint={effectiveMode === 'register' ? 'Mínimo de 10 caracteres.' : undefined}
          />
          {submit.isError && (
            <p className="text-sm text-danger" role="alert">
              {errorMessage(submit.error)}
            </p>
          )}
          <Button type="submit" variant="primary" className="w-full" loading={submit.isPending}>
            {effectiveMode === 'login' ? 'Entrar' : 'Começar a jornada'}
          </Button>
          {!firstRun && status.data?.registrationOpen && (
            <p className="text-center text-sm text-muted">
              {mode === 'login' ? (
                <>
                  Novo por aqui?{' '}
                  <Link className="link" to="/cadastro">
                    Criar conta
                  </Link>
                </>
              ) : (
                <>
                  Já tem conta?{' '}
                  <Link className="link" to="/entrar">
                    Entrar
                  </Link>
                </>
              )}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
