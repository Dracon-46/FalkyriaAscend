import { useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../lib/api';
import { APP_NAME } from '../../lib/brand';
import { Icon } from '../../components/ui/Icon';

/** Destino do link enviado por e-mail: confirma a conta e já entra. */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const qc = useQueryClient();
  const navigate = useNavigate();
  const started = useRef(false);
  const verify = useMutation({
    mutationFn: () => api.post('/api/auth/verify-email', { token }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      navigate('/', { replace: true });
    },
  });

  useEffect(() => {
    // O link é de uso único: dispara uma vez só (o StrictMode executa efeitos duas vezes em desenvolvimento).
    if (started.current || !token) return;
    started.current = true;
    verify.mutate();
  }, [token, verify]);

  const failed = !token || verify.isError;
  return (
    <div className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="panel w-full max-w-md space-y-4 text-center" role="status">
        <p className="text-sm tracking-[0.3em] text-accent">{APP_NAME.toUpperCase()}</p>
        {failed ? (
          <>
            <Icon name="alert-triangle" size={32} className="mx-auto text-danger" />
            <h1 className="panel-title justify-center">Não foi possível confirmar</h1>
            <p className="text-sm text-muted">{token ? errorMessage(verify.error) : 'O link está incompleto. Abra o endereço completo que veio no e-mail.'}</p>
            <p className="text-sm text-muted">
              Entre com seu e-mail e senha para receber um novo link:{' '}
              <Link className="link" to="/entrar">
                ir para a entrada
              </Link>
            </p>
          </>
        ) : (
          <>
            <Icon name="mail" size={32} className="mx-auto text-accent" />
            <h1 className="panel-title justify-center">Confirmando seu e-mail…</h1>
            <p className="text-sm text-muted">Só um instante.</p>
          </>
        )}
      </div>
    </div>
  );
}
