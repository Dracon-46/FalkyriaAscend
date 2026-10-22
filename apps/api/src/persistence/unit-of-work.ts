/**
 * Unit of Work: todo caso de uso que escreve roda numa única transação.
 * A aplicação conhece apenas estes tipos — nunca o cliente do banco diretamente.
 */
import type { Db, DbOrTx, Tx } from './client';

export type { Db, DbOrTx, Tx };

export function inTransaction<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(work);
}
