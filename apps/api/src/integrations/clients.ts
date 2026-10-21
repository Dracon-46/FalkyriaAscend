/**
 * Clientes HTTP mínimos das APIs oficiais. Nenhum segredo é registrado em log.
 * Strava: https://developers.strava.com/docs/  ·  Lyfta: https://my.lyfta.app/developers  ·  Hevy: https://api.hevyapp.com/docs/
 */
import { AppError } from '../lib/errors';
import type { HevyWorkout, LyftaWorkout, StravaActivityPayload } from './normalize';

const TIMEOUT_MS = 15_000;

async function request<T>(url: string, init: RequestInit & { label: string }): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (res.status === 429) throw new AppError(429, 'rate_limited', `${init.label}: limite de requisições atingido. Tente mais tarde.`);
    if (res.status === 401 || res.status === 403) throw new AppError(502, 'integration_auth', `${init.label}: credencial recusada (${res.status}). Reconecte a integração.`);
    if (!res.ok) throw new AppError(502, 'integration_error', `${init.label}: resposta ${res.status}.`);
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError(502, 'integration_unreachable', `${init.label}: falha de comunicação.`);
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------------ Strava

export interface StravaTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  scope?: string;
  athlete?: { id: number };
}

export const STRAVA_AUTHORIZE_URL = 'https://www.strava.com/oauth/authorize';
export const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token';
export const STRAVA_REVOKE_URL = 'https://www.strava.com/oauth/revoke';
export const STRAVA_SCOPES = 'read,activity:read_all';

export function stravaAuthorizeUrl(clientId: string, redirectUri: string, state: string) {
  const p = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', approval_prompt: 'auto', scope: STRAVA_SCOPES, state });
  return `${STRAVA_AUTHORIZE_URL}?${p.toString()}`;
}

export function stravaExchange(clientId: string, clientSecret: string, code: string) {
  return request<StravaTokenResponse>(STRAVA_TOKEN_URL, {
    label: 'Strava',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, grant_type: 'authorization_code' }),
  });
}

/** O refresh token pode mudar a cada renovação: sempre persistir o mais recente. */
export function stravaRefresh(clientId: string, clientSecret: string, refreshToken: string) {
  return request<StravaTokenResponse>(STRAVA_TOKEN_URL, {
    label: 'Strava',
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken }),
  });
}

export function stravaRevoke(clientId: string, clientSecret: string, token: string) {
  return request<void>(STRAVA_REVOKE_URL, {
    label: 'Strava',
    method: 'POST',
    headers: { authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token }),
  });
}

export function stravaGetActivity(base: string, accessToken: string, id: string) {
  return request<StravaActivityPayload>(`${base}/activities/${encodeURIComponent(id)}`, { label: 'Strava', headers: { authorization: `Bearer ${accessToken}` } });
}

export function stravaListActivities(base: string, accessToken: string, afterEpoch: number, page: number) {
  const p = new URLSearchParams({ after: String(afterEpoch), page: String(page), per_page: '50' });
  return request<StravaActivityPayload[]>(`${base}/athlete/activities?${p}`, { label: 'Strava', headers: { authorization: `Bearer ${accessToken}` } });
}

// ------------------------------------------------------------------ Lyfta

export interface LyftaWorkoutList {
  workouts: LyftaWorkout[];
  total_pages?: number;
  current_page?: number;
}

/** GET /api/v1/workouts?from&to&limit&page (limit 1–100; datas UTC inclusivas). 60 req/min. */
export function lyftaListWorkouts(base: string, apiKey: string, from: string, to: string, page: number) {
  const p = new URLSearchParams({ from, to, limit: '100', page: String(page) });
  return request<LyftaWorkoutList>(`${base}/api/v1/workouts?${p}`, { label: 'Lyfta', headers: { authorization: `Bearer ${apiKey}` } });
}

// ------------------------------------------------------------------ Hevy

export interface HevyWorkoutList {
  workouts: HevyWorkout[];
  page_count?: number;
  page?: number;
}

/** GET /v1/workouts?page&pageSize (pageSize máx. 10). Requer Hevy Pro. */
export function hevyListWorkouts(apiKey: string, page: number) {
  const p = new URLSearchParams({ page: String(page), pageSize: '10' });
  return request<HevyWorkoutList>(`https://api.hevyapp.com/v1/workouts?${p}`, { label: 'Hevy', headers: { 'api-key': apiKey } });
}
