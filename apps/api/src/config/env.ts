import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1).default('postgresql://rpg:rpg@localhost:5432/rpg_dev'),
  /**
   * TLS na conexão com o banco: `disable` (local), `require` (cifrado, sem validar o certificado)
   * ou `verify-full` (cifrado e validado com DATABASE_CA_CERT). Bancos gerenciados: use `verify-full`.
   */
  DATABASE_SSL: z.enum(['disable', 'require', 'verify-full']).default('disable'),
  /** Certificado da autoridade do banco (PEM); quebras de linha podem vir como \n. */
  DATABASE_CA_CERT: z.string().optional(),
  /** Conexões simultâneas no pool (respeite o limite do pooler do provedor). */
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  /** Origem pública da interface (CORS/CSRF e redirecionamentos OAuth). */
  APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  /** Permite novos cadastros após o primeiro usuário (o primeiro sempre é permitido e vira admin). */
  ALLOW_REGISTRATION: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** 32 bytes em base64 para cifrar tokens de integração. */
  INTEGRATION_ENCRYPTION_KEY: z.string().optional(),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  STRAVA_API_BASE: z.string().url().default('https://www.strava.com/api/v3'),
  LYFTA_API_BASE: z.string().url().default('https://my.lyfta.app'),
  /** Intervalo do avaliador diário (penalidades, expiração, recorrências). 0 desativa. */
  EVALUATION_INTERVAL_MINUTES: z.coerce.number().int().min(0).default(15),
  /** Diretório do build da interface para servir em produção (opcional). */
  WEB_DIST_DIR: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  /** Commit publicado, preenchido pelo Render a cada deploy. Exposto em /api/health para o smoke de produção. */
  RENDER_GIT_COMMIT: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  const env = envSchema.parse({ ...process.env, ...overrides });
  if (env.DATABASE_SSL === 'verify-full' && !env.DATABASE_CA_CERT) {
    throw new Error('DATABASE_SSL=verify-full exige DATABASE_CA_CERT (certificado PEM da autoridade do banco).');
  }
  return env;
}

/** Opções de conexão do banco derivadas do ambiente. */
export function databaseOptions(env: Env) {
  return { url: env.DATABASE_URL, ssl: env.DATABASE_SSL, caCert: env.DATABASE_CA_CERT, max: env.DATABASE_POOL_MAX };
}
