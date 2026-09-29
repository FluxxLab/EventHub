import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { api, ApiError, buildUrl, NetworkError, refreshSession, setSessionExpiredHandler } from '@/lib/api/client';
import { readTokens, writeTokens } from '@/lib/api/tokens';

/**
 * The client is the one path to the server, so its failure modes matter most: an expired token
 * refreshes exactly once however many requests hit it, a rejected refresh ends the session, and a
 * dead network is reported as such rather than as a server error.
 */
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('api client', () => {
  beforeEach(() => {
    sessionStorage.clear();
    writeTokens({ accessToken: 'old-access', refreshToken: 'old-refresh' });
  });
  afterEach(() => vi.restoreAllMocks());

  it('builds URLs under the API prefix and drops empty params', () => {
    expect(buildUrl('/sessions', { editionId: 'e1', q: '', page: undefined })).toBe(
      'http://localhost:3000/api/v1/sessions?editionId=e1',
    );
  });

  it('sends the bearer token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(200, { ok: true }));
    await api.get('/delegates/me');
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer old-access');
  });

  it('refreshes once for parallel 401s, then retries each request with the new token', async () => {
    let refreshCalls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCalls += 1;
        return json(200, { accessToken: 'new-access', refreshToken: 'new-refresh' });
      }
      const auth = (init?.headers as Record<string, string>).Authorization;
      return auth === 'Bearer new-access' ? json(200, { url }) : json(401, { message: 'Unauthorized' });
    });
    const results = await Promise.all([api.get('/a'), api.get('/b'), api.get('/c')]);
    expect(refreshCalls).toBe(1);
    expect(results).toHaveLength(3);
    expect(readTokens()).toEqual({ accessToken: 'new-access', refreshToken: 'new-refresh' });
  });

  it('ends the session when the refresh is rejected', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(401, { message: 'Unauthorized' }));
    await expect(api.get('/delegates/me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledTimes(1);
    expect(readTokens()).toBeNull();
  });

  it('surfaces the server message on errors, joining validation arrays', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json(400, { message: ['name is required', 'date is invalid'] }));
    await expect(api.post('/editions', {})).rejects.toMatchObject({ status: 400, message: 'name is required. date is invalid' });
  });

  it('rejects an HTML page instead of treating it as data (API address pointing at the console)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<!DOCTYPE html><html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    const error = await api.postPublic('/auth/login', { email: 'a@b.c', password: 'x' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toMatch(/Could not reach the PIC Events API/);
  });

  it('reports an unreachable server as a network error, not a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(api.get('/editions')).rejects.toBeInstanceOf(NetworkError);
  });

  it('does not refresh when there is no refresh token', async () => {
    sessionStorage.clear();
    await expect(refreshSession()).resolves.toBe('unauthorized');
  });
});
