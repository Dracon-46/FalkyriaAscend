import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Funções de serviço aceitam o banco ou uma transação em andamento. */
export type DbOrTx = Db | Tx;

// DATE e NUMERIC chegam como string; DATE permanece 'YYYY-MM-DD' (data local do usuário).
pg.types.setTypeParser(1082, (v) => v);

export type DatabaseSsl = 'disable' | 'require' | 'verify-full';

export interface DatabaseOptions {
  url: string;
  ssl?: DatabaseSsl;
  /** PEM da autoridade certificadora (obrigatório em `verify-full`). */
  caCert?: string;
  max?: number;
}

/** Traduz o modo de TLS para a configuração do driver `pg`. */
export function sslConfig(mode: DatabaseSsl = 'disable', caCert?: string): pg.PoolConfig['ssl'] {
  if (mode === 'disable') return false;
  if (mode === 'require') return { rejectUnauthorized: false };
  return { rejectUnauthorized: true, ca: caCert?.replace(/\\n/g, '\n') };
}

export function createDb(options: string | DatabaseOptions): { db: Db; pool: pg.Pool } {
  const o = typeof options === 'string' ? { url: options } : options;
  const pool = new pg.Pool({ connectionString: o.url, max: o.max ?? 10, ssl: sslConfig(o.ssl, o.caCert) });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
