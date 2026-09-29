import { API_URL } from '@/lib/config';
import { clearTokens, readTokens, writeTokens, type Tokens } from '@/lib/api/tokens';

/**
 * The one HTTP client for the console. Every server call goes through here: it adds the bearer
 * token, refreshes it once (single flight, across tabs) when it expires, aborts requests that
 * hang, and turns failures into `ApiError` (the server answered) or `NetworkError` (it did not).
 */

/** The server answered with an error; `message` is its plain-English reason. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly data?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The request never completed: offline, or it timed out. The UI offers a retry, not an error page. */
export class NetworkError extends Error {
  constructor(
    readonly kind: 'offline' | 'timeout',
    message: string,
  ) {
    super(message);
    this.name = 'NetworkError';
  }
}

type Params = Record<string, string | number | boolean | undefined | null>;

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  params?: Params;
  /** Send the access token (default true). Sign-in goes without one. */
  auth?: boolean;
  timeoutMs?: number;
  /** A caller's AbortSignal (TanStack Query passes one) so stale requests are cancelled. */
  signal?: AbortSignal;
  /** 'text' for text downloads (CSV, TXT), 'blob' for binary ones (PDF): the body is returned as is. */
  expect?: 'json' | 'text' | 'blob';
  /** Extra headers, such as an exhibitor scanner's stand key. */
  headers?: Record<string, string>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

/** Called when the session is gone for good (refresh rejected); the auth layer sends the user to sign-in. */
let onSessionExpired: () => void = () => undefined;
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

export function buildUrl(path: string, params?: Params): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function messageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const message = (body as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string' && message) return message;
  }
  return fallback;
}

type RefreshResult = 'refreshed' | 'unauthorized' | 'network-error';
let refreshing: Promise<RefreshResult> | null = null;

/**
 * Trades the refresh token for a new pair. Refresh tokens rotate and the API treats a replayed one
 * as theft, so only one refresh may run at a time: within this tab (the shared promise) and across
 * tabs (Web Locks, where supported).
 */
export function refreshSession(): Promise<RefreshResult> {
  if (refreshing) return refreshing;
  const run = async (): Promise<RefreshResult> => {
    const current = readTokens();
    if (!current) return 'unauthorized';
    try {
      const response = await fetch(buildUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!response.ok) return 'unauthorized';
      writeTokens((await response.json()) as Tokens);
      return 'refreshed';
    } catch {
      return 'network-error';
    }
  };
  refreshing = (async () => {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
      return navigator.locks.request('pic-admin-token-refresh', run);
    }
    return run();
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function request<T>(path: string, options: RequestOptions = {}, isRetry = false): Promise<T> {
  const { method = 'GET', body, params, auth = true, timeoutMs = DEFAULT_TIMEOUT_MS, signal, expect = 'json', headers: extra } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: expect === 'text' ? 'text/csv, text/plain, */*' : expect === 'blob' ? '*/*' : 'application/json',
    ...extra,
  };
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';
  if (auth) {
    const tokens = readTokens();
    if (tokens) headers.Authorization = `Bearer ${tokens.accessToken}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs);
  const onCallerAbort = () => controller.abort('cancelled');
  signal?.addEventListener('abort', onCallerAbort);

  let response: Response;
  try {
    response = await fetch(buildUrl(path, params), {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? (body as FormData) : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error; // cancelled by the caller: not a failure worth showing
    if (controller.signal.reason === 'timeout') {
      throw new NetworkError('timeout', 'The request timed out. Check your connection and try again.');
    }
    // fetch rejects the same way when the API is down or refuses CORS; only blame the connection
    // when the browser says it is offline.
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      throw new NetworkError(
        'offline',
        `Could not reach the PIC Events API at ${API_URL}. Check that the backend is running and try again.`,
      );
    }
    throw new NetworkError('offline', 'You appear to be offline. Check your connection and try again.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onCallerAbort);
  }

  if (response.status === 401 && auth && !isRetry) {
    const result = await refreshSession();
    if (result === 'refreshed') return request<T>(path, options, true);
    if (result === 'network-error') {
      throw new NetworkError('offline', 'You appear to be offline. Check your connection and try again.');
    }
    clearTokens();
    onSessionExpired();
  }

  // A binary download is handed over as it came; errors still fall through to the JSON handling.
  if (response.ok && expect === 'blob' && !(response.headers.get('content-type') ?? '').includes('html')) return (await response.blob()) as T;
  const text = response.status === 204 ? '' : await response.text();
  // The API only ever answers in JSON. An HTML page means the API address points somewhere else
  // (commonly this console itself); treating that page as data turned it into confusing errors.
  // A file download is text by design; an HTML page is still the "wrong address" case below.
  if (response.ok && expect === 'text' && !(response.headers.get('content-type') ?? '').includes('html')) return text as T;
  if (text && !(response.headers.get('content-type') ?? '').includes('json')) {
    throw new ApiError(
      502,
      `Could not reach the PIC Events API at ${API_URL}. Check that the backend is running and NEXT_PUBLIC_API_URL points at it.`,
    );
  }
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    throw new ApiError(response.status, messageFrom(payload, `Request failed (${response.status}).`), payload);
  }
  return payload as T;
}

export const api = {
  get: <T>(path: string, params?: Params, signal?: AbortSignal) => request<T>(path, { params, signal }),
  /** A file (CSV, TXT) as text, with the same auth, refresh and errors as every other call. */
  getText: (path: string, params?: Params) => request<string>(path, { params, expect: 'text' }),
  /** A binary file (PDF) as a Blob, same auth and errors. */
  getBlob: (path: string, params?: Params) => request<Blob>(path, { params, expect: 'blob', timeoutMs: 60_000 }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body }),
  delete: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body }),
  /** For the sign-in call, which has no token yet. */
  postPublic: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body, auth: false }),
  /** An exhibitor's stand scanner: no account, the stand's private key instead. */
  booth: <T>(key: string, path: string, method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET', body?: unknown) =>
    request<T>(path, { method, body, auth: false, headers: { 'X-Booth-Key': key } }),
  /** A food counter's scanner: its link key instead of a login. */
  counter: <T>(key: string, path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) =>
    request<T>(path, { method, body, auth: false, headers: { 'X-Counter-Key': key } }),
};
