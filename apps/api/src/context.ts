import type { Db } from './db/client';
import type { Env } from './env';

/** Dependências compartilhadas pelas rotas. `now` é injetável para testes determinísticos. */
export interface AppContext {
  db: Db;
  env: Env;
  now: () => Date;
}
