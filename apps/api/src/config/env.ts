import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1).default('postgresql://rpg:rpg@localhost:5432/rpg_dev'),
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
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(overrides: Partial<Record<keyof Env, string>> = {}): Env {
  return envSchema.parse({ ...process.env, ...overrides });
}
