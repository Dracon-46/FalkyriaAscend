import type { Db } from './persistence/client';
import type { Env } from './config/env';
import type { Mailer } from './integrations/mailer';

/** Dependências compartilhadas pelas rotas. `now` e `mailer` são injetáveis para testes determinísticos. */
export interface AppContext {
  db: Db;
  env: Env;
  now: () => Date;
  mailer: Mailer;
}
