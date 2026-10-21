import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Textarea } from './primitives';
import { Icon } from './Icon';

/** Modal acessível baseado no elemento nativo <dialog> (foco, Esc e camada superior). */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`panel m-auto w-[calc(100%-1.5rem)] ${width} max-h-[90dvh] overflow-hidden p-0 text-fg backdrop:bg-black/60 backdrop:backdrop-blur-sm`}
      aria-labelledby="modal-title"
    >
      {open && (
        <div className="flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
            <h2 id="modal-title" className="text-lg">
              {title}
            </h2>
            <Button variant="ghost" icon="x" aria-label="Fechar" onClick={onClose} />
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** Exige um motivo (ex.: estornos e cancelamentos), registrado na auditoria. */
  requireReason?: boolean;
}

type ConfirmFn = (o: ConfirmOptions) => Promise<{ ok: boolean; reason: string }>;
const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (r: { ok: boolean; reason: string }) => void }) | null>(null);
  const [reason, setReason] = useState('');
  const confirm = useCallback<ConfirmFn>(
    (o) =>
      new Promise((resolve) => {
        setReason('');
        setState({ ...o, resolve });
      }),
    [],
  );
  const close = (ok: boolean) => {
    state?.resolve({ ok, reason: reason.trim() });
    setState(null);
  };
  const reasonMissing = Boolean(state?.requireReason && reason.trim().length < 3);
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={state !== null}
        onClose={() => close(false)}
        title={state?.title ?? ''}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} disabled={reasonMissing} onClick={() => close(true)}>
              {state?.confirmLabel ?? 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="flex gap-3">
          {state?.danger && <Icon name="alert-triangle" className="mt-0.5 shrink-0 text-danger" />}
          <div className="text-muted">{state?.message}</div>
        </div>
        {state?.requireReason && (
          <div className="mt-4">
            <Textarea label="Motivo (registrado na auditoria)" value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus />
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('ConfirmProvider ausente');
  return ctx;
}
