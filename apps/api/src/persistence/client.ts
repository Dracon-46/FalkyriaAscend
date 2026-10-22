import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Funções de serviço aceitam o banco ou uma transação em andamento. */
export type DbOrTx = Db | Tx;

// DATE e NUMERIC chegam como string; DATE permanece 'YYYY-MM-DD' (data local do usuário).
pg.types.setTypeParser(1082, (v) => v);

export function createDb(databaseUrl: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

export { schema };
