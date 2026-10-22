import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../persistence/unit-of-work';
import { evaluateAllUsers } from '../application/evaluation';

/** Agendador simples em processo: fecha os dias de todos os usuários periodicamente. */
export function startScheduler(db: Db, minutes: number, log: FastifyBaseLogger): () => void {
  if (minutes <= 0) return () => undefined;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const results = await evaluateAllUsers(db);
      const failed = results.filter((r) => !r.ok);
      if (failed.length) log.warn({ failed: failed.length }, 'Avaliação diária com falhas');
    } catch (err) {
      log.error({ err }, 'Falha no agendador');
    } finally {
      running = false;
    }
  };
  const first = setTimeout(tick, 10_000);
  const handle = setInterval(tick, minutes * 60_000);
  return () => {
    clearTimeout(first);
    clearInterval(handle);
  };
}
