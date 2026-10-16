'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * A value kept in the address (`?tab=approved`), so refresh, Back and a shared link land on the
 * same tab or filter. Changes replace the current history entry rather than adding one, so Back
 * still leaves the page. Read straight from `location`, which a statically exported page can do
 * without a Suspense boundary.
 */
const EVENT = 'pic:url-state';

function subscribe(onChange: () => void) {
  window.addEventListener('popstate', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/** Reads `key` from the address; `fallback` when absent or not one of `allowed`. */
export function useUrlParam<T extends string>(key: string, fallback: T, allowed?: readonly T[]): [T, (next: T) => void] {
  const raw = useSyncExternalStore(
    subscribe,
    () => new URLSearchParams(window.location.search).get(key),
    () => null,
  );
  const value = raw !== null && (!allowed || (allowed as readonly string[]).includes(raw)) ? (raw as T) : fallback;
  const set = useCallback(
    (next: T) => {
      const url = new URL(window.location.href);
      if (next === fallback) url.searchParams.delete(key);
      else url.searchParams.set(key, next);
      window.history.replaceState(window.history.state, '', url);
      window.dispatchEvent(new Event(EVENT));
    },
    [key, fallback],
  );
  return [value, set];
}
