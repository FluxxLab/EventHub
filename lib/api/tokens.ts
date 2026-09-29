/**
 * The organiser's token pair. The PIC Events API issues bearer tokens (no cookies), so the
 * console keeps them in `sessionStorage`: they survive a reload but end with the tab, which is
 * the right lifetime for a shared venue laptop. Access to this module is the only way to read
 * or change them.
 */
export type Tokens = { accessToken: string; refreshToken: string };

const KEY = 'pic.admin.tokens';

const storage = (): Storage | null => (typeof window === 'undefined' ? null : window.sessionStorage);

export function readTokens(): Tokens | null {
  try {
    const raw = storage()?.getItem(KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  } catch {
    return null;
  }
}

export function writeTokens(tokens: Tokens): void {
  try {
    storage()?.setItem(KEY, JSON.stringify({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }));
  } catch {
    // Storage full or blocked: the session lasts until the next reload.
  }
}

export function clearTokens(): void {
  try {
    storage()?.removeItem(KEY);
  } catch {
    // Nothing stored.
  }
}
