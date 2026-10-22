import type { Db } from './persistence/client';
import type { Env } from './config/env';

/** Dependências compartilhadas pelas rotas. `now` é injetável para testes determinísticos. */
export interface AppContext {
  db: Db;
  env: Env;
  now: () => Date;
}
