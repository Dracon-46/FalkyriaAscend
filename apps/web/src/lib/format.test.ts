import { describe, expect, it } from 'vitest';
import { fmt, fmtDate, pct, relativeDays, signed } from './format';

describe('format', () => {
  it('formata números no padrão pt-BR e trata ausência', () => {
    expect(fmt(12345)).toBe('12.345');
    expect(fmt(null)).toBe('—');
    expect(pct(0.756)).toBe('76%');
  });

  it('exibe datas locais sem deslocamento de fuso', () => {
    expect(fmtDate('2026-01-01', { day: '2-digit', month: '2-digit', year: 'numeric' })).toBe('01/01/2026');
    expect(fmtDate(undefined)).toBe('—');
  });

  it('calcula diferença de dias e sinais', () => {
    expect(relativeDays('2026-10-01', '2026-10-21')).toBe(20);
    expect(signed(5)).toBe('+5');
    expect(signed(-5)).toBe('-5');
    expect(signed(0)).toBe('0');
  });
});
