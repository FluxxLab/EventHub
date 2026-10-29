/**
 * After a deploy, a page opened before it still asks for the old build's code files, which are
 * gone ("Failed to load chunk ..."). Reloading picks up the new build. Reloads at most once a
 * minute, so a chunk that is missing for some other reason cannot loop the page.
 */

const KEY = 'stale-build-reloaded-at';

export const isStaleBuild = (e: unknown): boolean => {
  const text = e instanceof Error ? `${e.name} ${e.message}` : typeof e === 'string' ? e : '';
  return /ChunkLoadError|Failed to load chunk|Loading chunk [\w/.-]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(text);
};

/** Reloads the page when `e` is a stale build's missing chunk. True when it is reloading. */
export function reloadIfStale(e: unknown): boolean {
  if (typeof window === 'undefined' || !isStaleBuild(e)) return false;
  try {
    const last = Number(sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // no session storage: reload anyway, once per page load at worst
  }
  window.location.reload();
  return true;
}

/** The message a dialog shows while the page reloads. */
export const RELOADING = 'The console was just updated. Reloading the page… try again once it opens.';
