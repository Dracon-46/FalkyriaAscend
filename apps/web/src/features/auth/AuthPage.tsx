import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loginInput, registerInput } from '@rpg/contracts';
import { api, ApiError, errorMessage } from '../../lib/api';
import { APP_NAME, APP_TAGLINE, COMPANY_NAME } from '../../lib/brand';
import { useMe } from '../../app/session';
import { Button, Input } from '../../components/ui/primitives';
import { FalkyriaSignature } from '../../components/ui/Falkyria';
import { Icon } from '../../components/ui/Icon';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const me = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useQuery({ queryKey: ['auth-status'], queryFn: () => api.get<{ hasUsers: boolean; registrationOpen: boolean }>('/api/auth/status') });
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Cadastro feito, aguardando a confirmação do e-mail.
  const [pending, setPending] = useState<{ email: string; emailSent: boolean } | null>(null);
  // Sem nenhuma conta, qualquer tela de acesso vira o cadastro do fundador (inclusive /entrar).
  const firstRun = status.data ? !status.data.hasUsers : false;
  const effectiveMode = firstRun ? 'register' : mode;
  const submit = useMutation({
    mutationFn: async () => {
      const schema = effectiveMode === 'login' ? loginInput : registerInput;
      const parsed = schema.safeParse(form);
      if (!parsed.success) {
        setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
        throw new Error('Verifique os campos destacados.');
      }
      setErrors({});
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return effectiveMode === 'login'
        ? api.post<AuthResult>('/api/auth/login', parsed.data)
        : api.post<AuthResult>('/api/auth/register', { ...parsed.data, timezone: tz });
    },
    onSuccess: async (result) => {
      if (result && 'verificationRequired' in result) {
        setPending({ email: result.email, emailSent: result.emailSent });
        return;
      }
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/');
    },
  });
  const notVerified = submit.error instanceof ApiError && submit.error.code === 'email_not_verified';

  if (me.data) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img src="/icons/icon.svg" alt="" width={64} height={64} className="mx-auto mb-3" />
          <h1 className="text-3xl tracking-[0.3em] text-accent">{APP_NAME.toUpperCase()}</h1>
          <p className="mt-1 text-muted">{APP_TAGLINE}</p>
          <FalkyriaSignature className="mt-2" />
        </div>
        {pending ? (
          <div className="panel space-y-4 text-center" role="status">
            <Icon name="mail" size={32} className="mx-auto text-accent" />
            <h2 className="panel-title justify-center">Confirme seu e-mail</h2>
            {pending.emailSent ? (
              <p className="text-sm text-muted">
                Enviamos um link para <strong className="text-fg">{pending.email}</strong>. Abra o e-mail, no celular ou no computador, para ativar a conta. Se
                não aparecer, confira o spam.
              </p>
            ) : (
              <p className="text-sm text-danger">A conta foi criada, mas não conseguimos enviar o e-mail agora. Peça um novo link abaixo.</p>
            )}
            <ResendVerification email={pending.email} />
            <p className="text-sm text-muted">
              Já confirmou?{' '}
              <Link className="link" to="/entrar" onClick={() => setPending(null)}>
                Entrar
              </Link>
            </p>
          </div>
        ) : !status.data ? (
          <div className="panel space-y-3 text-center" role="status">
            {status.isError ? (
              <>
                <p className="text-sm text-danger">Não foi possível falar com o servidor.</p>
                <Button variant="primary" onClick={() => void status.refetch()} loading={status.isFetching}>
                  Tentar de novo
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted">Conectando ao servidor…</p>
                <p className="text-xs text-faint">Se o servidor estava em repouso, isso pode levar até um minuto.</p>
              </>
            )}
          </div>
        ) : (
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
            {notVerified && <ResendVerification email={form.email} />}
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
        )}
        <p className="mt-8 text-center text-xs text-faint">© 2026 {COMPANY_NAME}. Todos os direitos reservados.</p>
      </div>
    </div>
  );
}

type AuthResult = { id: string; email: string; displayName: string; role: string } | { verificationRequired: true; email: string; emailSent: boolean };

/** Pede um novo link de confirmação. A resposta é sempre a mesma, exista ou não a conta. */
function ResendVerification({ email }: { email: string }) {
  const [wait, setWait] = useState(0);
  const resend = useMutation({
    mutationFn: () => api.post('/api/auth/resend-verification', { email }),
    onSuccess: () => setWait(60),
  });
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  return (
    <div className="space-y-2 text-center">
      <Button type="button" variant="ghost" onClick={() => resend.mutate()} loading={resend.isPending} disabled={wait > 0 || !email}>
        {wait > 0 ? `Reenviar em ${wait}s` : 'Reenviar e-mail de confirmação'}
      </Button>
      {resend.isSuccess && <p className="text-xs text-muted">Se a conta ainda não estiver confirmada, um novo link chega em instantes.</p>}
      {resend.isError && <p className="text-xs text-danger">{errorMessage(resend.error)}</p>}
    </div>
  );
}
