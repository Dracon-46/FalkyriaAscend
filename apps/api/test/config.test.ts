import { describe, expect, it } from 'vitest';
import { databaseOptions, loadEnv } from '../src/config/env';
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
