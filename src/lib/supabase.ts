import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

/** Forgiving about how the values were pasted into Netlify: stray spaces, quotes, or the
 *  "/rest/v1/" ending that the Supabase Data API page shows next to the URL. */
const clean = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/^['"]+|['"]+$/g, '').trim() : '') || undefined;
export const projectUrl = (v: unknown) => clean(v)?.replace(/\/+$/, '').replace(/\/(rest|auth)\/v1$/i, '').replace(/\/+$/, '');

const url = projectUrl(import.meta.env.VITE_SUPABASE_URL);
const key = clean(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY);

/** False until the Netlify (or local) environment has the Supabase URL and key. */
export const supabaseConfigured = Boolean(url && key);

/**
 * A request that hangs (the laptop slept, the Wi-Fi dropped) gives up after 30 seconds
 * with an error the app can show, instead of leaving a button spinning forever.
 * File uploads and downloads get as long as they need.
 */
const REQUEST_TIMEOUT_MS = 30_000;
const fetchWithTimeout: typeof fetch = (input, init) => {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (href.includes('/storage/v1/') || typeof AbortSignal.timeout !== 'function') return fetch(input, init);
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal
    ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([init.signal, timeout]) : init.signal)
    : timeout;
  return fetch(input, { ...init, signal }).catch((err: unknown) => {
    if ((err as Error)?.name === 'TimeoutError') throw new Error('NUUKE could not reach the server — check your internet and try again.');
    throw err;
  });
};

export const supabase = createClient<Database>(url ?? 'http://localhost:54321', key ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nuuke-auth' },
  global: { fetch: fetchWithTimeout },
});

type Fn = Database['public']['Functions'];

/**
 * Calls a database function and throws its message (which the SQL writes for people,
 * e.g. "Pick when to call them back") instead of returning { error }.
 */
export async function rpc<T = unknown, N extends keyof Fn = keyof Fn>(name: N, args?: Fn[N]['Args']): Promise<T> {
  const { data, error } = await supabase.rpc(name, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

/** Same for table queries: unwrap or throw. */
export function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Admin account actions run on Netlify with the secret key; see netlify/functions/admin-users.mts. */
export async function adminUsers<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/admin-users', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${data.session?.access_token ?? ''}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json as T;
}
