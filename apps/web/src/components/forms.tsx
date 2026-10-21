import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';
import { PENALTY_TYPE_LABELS } from '@rpg/engine';
import { api, ApiError } from '../lib/api';
import type { Lookups } from '../lib/types';
import { Icon } from './ui/Icon';
import { Button, Select, cx } from './ui/primitives';

/** Dados auxiliares para seletores (categorias, atributos, regras, habilidades). */
export function useLookups() {
  return useQuery({ queryKey: ['lookups'], queryFn: () => api.get<Lookups>('/api/lookups'), staleTime: 60_000 });
}

/**
 * Formulário controlado validado com o MESMO esquema Zod usado pela API.
 * Erros do servidor (400 com issues) também são mapeados para os campos.
 */
export function useForm<S extends z.ZodType>(schema: S, initial: z.input<S>) {
  const [values, setValues] = useState<z.input<S>>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof z.input<S>>(key: K, value: z.input<S>[K]) => setValues((v) => ({ ...(v as object), [key]: value }) as z.input<S>);
  const validate = (): z.output<S> | null => {
    const r = schema.safeParse(values);
    if (r.success) {
      setErrors({});
      return r.data;
    }
    const map: Record<string, string> = {};
    for (const i of r.error.issues) {
      const k = i.path.join('.');
      if (!map[k]) map[k] = i.message;
    }
    setErrors(map);
    return null;
  };
  const applyServerError = (err: unknown) => {
    if (err instanceof ApiError && Array.isArray((err.details as { issues?: unknown })?.issues)) {
      const map: Record<string, string> = {};
      for (const i of (err.details as { issues: Array<{ path: string; message: string }> }).issues) map[i.path] = i.message;
      setErrors(map);
    }
  };
  return { values, setValues, set, errors, validate, applyServerError, reset: () => setValues(initial) };
}

/** Editor de pesos de atributos: define para onde vai o XP de atributo de uma atividade. */
export function WeightsEditor({ value, onChange }: { value: Record<string, number>; onChange: (v: Record<string, number>) => void }) {
  const lookups = useLookups();
  const attrs = lookups.data?.attributes ?? [];
  const total = Object.values(value).reduce((a, b) => a + b, 0);
  return (
    <fieldset>
      <legend className="field-label">Atributos desenvolvidos</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {attrs.map((a) => {
          const w = value[a.code] ?? 0;
          return (
            <label key={a.code} className={cx('flex items-center gap-2 rounded-[var(--radius-sm)] border px-2 py-1.5 text-sm', w > 0 ? 'border-accent' : 'border-line')}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: a.color }} />
              <span className="num w-9">{a.code}</span>
              <input
                type="number"
                min={0}
                max={10}
                step={1}
                className="input !min-h-0 !px-1.5 !py-0.5 text-right"
                aria-label={`Peso de ${a.name}`}
                value={w || ''}
                placeholder="0"
                onChange={(e) => {
                  const n = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                  const next = { ...value };
                  if (n === 0) delete next[a.code];
                  else next[a.code] = n;
                  onChange(next);
                }}
              />
            </label>
          );
        })}
      </div>
      <p className="mt-1 text-xs text-faint">
        {total === 0 ? 'Sem atributos: a atividade concede apenas XP geral e moedas.' : `O XP de atributo é dividido proporcionalmente: ${Object.entries(value).map(([k, w]) => `${k} ${Math.round((w / total) * 100)}%`).join(', ')}.`}
      </p>
    </fieldset>
  );
}

/** Seleção explícita das penalidades aplicáveis (nunca todas por padrão). */
export function PenaltyRulesPicker({ value, onChange, disabled, disabledReason }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean; disabledReason?: string }) {
  const lookups = useLookups();
  const rules = (lookups.data?.penaltyRules ?? []).filter((r) => r.active);
  return (
    <fieldset disabled={disabled}>
      <legend className="field-label">Penalidades em caso de falha</legend>
      {disabled ? (
        <p className="text-sm text-faint">{disabledReason}</p>
      ) : rules.length === 0 ? (
        <p className="text-sm text-faint">Nenhuma regra cadastrada (Configurações → Penalidades).</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rules.map((r) => {
            const on = value.includes(r.id);
            return (
              <button
                key={r.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(on ? value.filter((x) => x !== r.id) : [...value, r.id])}
                className={cx('badge !py-1 text-[0.8rem]', on && '!border-danger !text-danger')}
                title={PENALTY_TYPE_LABELS[r.type]}
              >
                {on ? <Icon name="check" size={12} /> : <Icon name="plus" size={12} />}
                {r.name}
              </button>
            );
          })}
        </div>
      )}
      {!disabled && <p className="mt-1 text-xs text-faint">Sem seleção, a falha apenas é registrada. Suspensões, descanso e indisponibilidade nunca geram penalidade.</p>}
    </fieldset>
  );
}

export function CategorySelect({ value, onChange, label = 'Categoria', error }: { value: string | null | undefined; onChange: (v: string | null) => void; label?: string; error?: string }) {
  const lookups = useLookups();
  return (
    <Select
      label={label}
      value={value ?? ''}
      error={error}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder="Sem categoria"
      options={(lookups.data?.categories ?? []).map((c) => ({ value: c.id, label: c.isBasicNeed ? `${c.name} (sem penalidades)` : c.name }))}
    />
  );
}

export function WeekdayPicker({ mask, onChange }: { mask: number; onChange: (m: number) => void }) {
  const days = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  return (
    <div className="flex gap-1" role="group" aria-label="Dias da semana">
      {days.map((d, i) => {
        const on = (mask & (1 << i)) !== 0;
        return (
          <button
            key={i}
            type="button"
            aria-pressed={on}
            aria-label={names[i]}
            onClick={() => {
              const next = mask ^ (1 << i);
              if (next !== 0) onChange(next);
            }}
            className={cx('h-9 w-9 rounded-full border text-sm', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted')}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

export function FormActions({ onCancel, loading, submitLabel = 'Salvar' }: { onCancel: () => void; loading?: boolean; submitLabel?: string }) {
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>
        Cancelar
      </Button>
      <Button type="submit" variant="primary" loading={loading}>
        {submitLabel}
      </Button>
    </div>
  );
}
