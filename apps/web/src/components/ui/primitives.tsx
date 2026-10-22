import clsx from 'clsx';
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './Icon';

export { clsx as cx };

// ------------------------------------------------------------------ Botões

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: string;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, loading, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={clsx('btn', `btn-${variant}`, size === 'sm' && 'btn-sm', !children && 'btn-icon', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon ? <Icon name={icon} size={size === 'sm' ? 14 : 16} /> : null}
      {children}
    </button>
  );
});

export function IconButton({ icon, label, ...rest }: Omit<ButtonProps, 'children' | 'icon'> & { icon: string; label: string }) {
  return <Button variant="ghost" icon={icon} aria-label={label} title={label} {...rest} />;
}

// ------------------------------------------------------------------ Campos

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-faint">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: ReactNode; error?: string | null }>(
  function Input({ label, hint, error, className, id, ...rest }, ref) {
    const auto = useId();
    const input = <input ref={ref} id={id ?? auto} className={clsx('input', className)} aria-invalid={error ? true : undefined} {...rest} />;
    return label ? (
      <Field label={label} hint={hint} error={error} htmlFor={id ?? auto}>
        {input}
      </Field>
    ) : (
      input
    );
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; hint?: ReactNode; error?: string | null }
>(function Textarea({ label, hint, error, className, id, ...rest }, ref) {
  const auto = useId();
  const el = <textarea ref={ref} id={id ?? auto} className={clsx('input', className)} aria-invalid={error ? true : undefined} {...rest} />;
  return label ? (
    <Field label={label} hint={hint} error={error} htmlFor={id ?? auto}>
      {el}
    </Field>
  ) : (
    el
  );
});

export interface Option {
  value: string;
  label: string;
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { label?: string; hint?: ReactNode; error?: string | null; options: Option[]; placeholder?: string }
>(function Select({ label, hint, error, options, placeholder, className, id, ...rest }, ref) {
  const auto = useId();
  const el = (
    <select ref={ref} id={id ?? auto} className={clsx('input', className)} aria-invalid={error ? true : undefined} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
  return label ? (
    <Field label={label} hint={hint} error={error} htmlFor={id ?? auto}>
      {el}
    </Field>
  ) : (
    el
  );
});

export function Checkbox({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2">
      <input id={id} type="checkbox" className="checkbox mt-1" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="text-sm">
        {label}
        {hint && <span className="block text-xs text-faint">{hint}</span>}
      </label>
    </div>
  );
}

// ------------------------------------------------------------------ Estrutura

export function Panel({
  title,
  icon,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  icon?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={clsx('panel', className)} id={id} aria-label={typeof title === 'string' ? title : undefined}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3">
          {title ? (
            <h2 className="panel-title flex-1">
              {icon && <Icon name={icon} size={15} />}
              {title}
            </h2>
          ) : (
            <span />
          )}
          {actions && <div className="-mt-1 mb-3 flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: ReactNode; icon?: string; actions?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl text-fg sm:text-3xl" style={{ letterSpacing: 'calc(var(--title-tracking) * 0.4)' }}>
          {icon && <Icon name={icon} size={26} className="text-accent" />}
          {title}
        </h1>
        {subtitle && <p className="mt-1 max-w-3xl text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Spinner({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" role="status" aria-label="Carregando">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('skeleton', className)} aria-hidden="true" />;
}

export function Loading({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-muted" role="status">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon = 'compass', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-8 text-center">
      <Icon name={icon} size={30} className="mb-2 text-faint" />
      <p className="font-display text-fg">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Não foi possível carregar.';
  return (
    <div className="panel flex flex-wrap items-center gap-3 border-danger/40 text-sm" role="alert">
      <Icon name="alert-triangle" className="text-danger" />
      <span className="flex-1">{message}</span>
      {onRetry && (
        <Button size="sm" icon="refresh" onClick={onRetry}>
          Tentar novamente
        </Button>
      )}
    </div>
  );
}

export function Badge({
  children,
  tone,
  className,
  title,
}: {
  children: ReactNode;
  tone?: 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'muted';
  className?: string;
  title?: string;
}) {
  const style =
    tone && tone !== 'muted'
      ? {
          color: `var(--${tone === 'accent' ? 'accent' : tone})`,
          borderColor: `color-mix(in srgb, var(--${tone === 'accent' ? 'accent' : tone}) 45%, transparent)`,
          background: `color-mix(in srgb, var(--${tone === 'accent' ? 'accent' : tone}) 12%, transparent)`,
        }
      : undefined;
  return (
    <span className={clsx('badge', className)} style={style} title={title}>
      {children}
    </span>
  );
}

export function ProgressBar({ value, xp, label, className, color }: { value: number; xp?: boolean; label?: string; className?: string; color?: string }) {
  const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={clsx('bar', xp && 'bar-xp', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
      aria-label={label}
    >
      <span style={{ width: `${v * 100}%`, ...(color ? { background: color } : {}) }} />
    </div>
  );
}

export function Stat({ label, value, hint, icon, tone }: { label: string; value: ReactNode; hint?: ReactNode; icon?: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 text-xs text-faint uppercase" style={{ letterSpacing: '0.08em' }}>
        {icon && <Icon name={icon} size={13} />}
        {label}
      </div>
      <div className="num mt-0.5 truncate text-xl" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      {hint && <div className="truncate text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ value: T; label: string; icon?: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          type="button"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            '-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors',
            value === t.value ? 'border-accent text-accent' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.icon && <Icon name={t.icon} size={15} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius)] border border-line bg-bg-2 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'rounded-[var(--radius-sm)] px-2.5 py-1 text-xs transition-colors',
            value === o.value ? 'bg-accent-soft text-accent' : 'text-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
