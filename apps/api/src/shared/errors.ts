/** Erro de aplicação com status HTTP e código estável para a interface. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Autenticação necessária') => new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'Acesso negado') => new AppError(403, 'forbidden', message);
export const notFound = (what = 'Registro') => new AppError(404, 'not_found', `${what} não encontrado`);
export const conflict = (message: string, details?: unknown) => new AppError(409, 'conflict', message, details);
export const unprocessable = (message: string, details?: unknown) => new AppError(422, 'unprocessable', message, details);

/** Códigos de erro do PostgreSQL relevantes. */
export const PG = {
  uniqueViolation: '23505',
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  notNullViolation: '23502',
  serializationFailure: '40001',
  deadlock: '40P01',
} as const;

/** Forma mínima dos erros do driver `pg` (possivelmente encapsulados pelo Drizzle em `cause`). */
interface DriverError {
  code?: unknown;
  constraint?: unknown;
  cause?: unknown;
}

export function pgCode(err: unknown): string | undefined {
  let e = err as DriverError | undefined;
  // drizzle pode encapsular o erro do driver em `cause`.
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) return e.code;
    e = e.cause as DriverError | undefined;
  }
  return undefined;
}

export function pgConstraint(err: unknown): string | undefined {
  let e = err as DriverError | undefined;
  for (let i = 0; i < 3 && e; i++) {
    if (typeof e.constraint === 'string') return e.constraint;
    e = e.cause as DriverError | undefined;
  }
  return undefined;
}
