import { describe, expect, it } from 'vitest';
import { databaseOptions, emailVerificationRequired, loadEnv } from '../src/config/env';
import { sslConfig } from '../src/persistence/client';

describe('configuração do banco', () => {
  it('desativa TLS por padrão (desenvolvimento local)', () => {
    expect(sslConfig()).toBe(false);
    expect(loadEnv({ DATABASE_URL: 'postgresql://x' }).DATABASE_SSL).toBe('disable');
  });

  it('require cifra sem validar o certificado', () => {
    expect(sslConfig('require')).toEqual({ rejectUnauthorized: false });
  });

  it('verify-full valida o certificado e aceita quebras de linha escapadas', () => {
    expect(sslConfig('verify-full', '-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----')).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
    });
  });

  it('verify-full sem certificado é recusado na inicialização', () => {
    expect(() => loadEnv({ DATABASE_URL: 'postgresql://x', DATABASE_SSL: 'verify-full' })).toThrow(/DATABASE_CA_CERT/);
  });

  it('repassa url, TLS, certificado e tamanho do pool', () => {
    const env = loadEnv({ DATABASE_URL: 'postgresql://x', DATABASE_SSL: 'require', DATABASE_POOL_MAX: '5' });
    expect(databaseOptions(env)).toEqual({ url: 'postgresql://x', ssl: 'require', caCert: undefined, max: 5 });
  });
});

describe('configuração de e-mail', () => {
  const base = { DATABASE_URL: 'postgresql://x' };
  const smtp = { SMTP_USER: 'ascend@gmail.com', SMTP_PASSWORD: 'abcd efgh ijkl mnop' };

  it('auto: sem SMTP a confirmação fica desligada; com SMTP passa a ser exigida', () => {
    expect(emailVerificationRequired(loadEnv(base))).toBe(false);
    expect(emailVerificationRequired(loadEnv({ ...base, ...smtp }))).toBe(true);
  });

  it('off desliga mesmo com SMTP; required sem SMTP é recusado na inicialização', () => {
    expect(emailVerificationRequired(loadEnv({ ...base, ...smtp, EMAIL_VERIFICATION: 'off' }))).toBe(false);
    expect(() => loadEnv({ ...base, EMAIL_VERIFICATION: 'required' })).toThrow(/SMTP_USER/);
  });

  it('ignora os espaços da senha de app do Gmail e usa o Gmail por padrão', () => {
    const env = loadEnv({ ...base, ...smtp });
    expect(env.SMTP_PASSWORD).toBe('abcdefghijklmnop');
    expect(env.SMTP_HOST).toBe('smtp.gmail.com');
    expect(env.SMTP_PORT).toBe(465);
  });
});
