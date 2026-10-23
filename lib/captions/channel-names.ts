'use client';

import { useSyncExternalStore } from 'react';

/**
 * What each channel carries ("Main Hall lectern"), named once on the desk computer, as Dante
 * labels its channels: channel numbers alone mean nothing without the mixer's routing sheet.
 * Keyed by the channel's source key; kept in this browser.
 */
const KEY = 'pic.admin.channel-names';
const EVENT = 'pic:channel-names';
const EMPTY: Record<string, string> = {};

let cache: { raw: string | null; names: Record<string, string> } = { raw: null, names: EMPTY };

function read(): Record<string, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === cache.raw) return cache.names;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const names = parsed && typeof parsed === 'object' ? Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'string' && v.trim())) : {};
    cache = { raw, names: names as Record<string, string> };
    return cache.names;
  } catch {
    return EMPTY;
  }
}

function subscribe(listener: () => void) {
  window.addEventListener(EVENT, listener);
  window.addEventListener('storage', listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    window.removeEventListener('storage', listener);
  };
}

export function useChannelNames(): Record<string, string> {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function saveChannelNames(names: Record<string, string>) {
  const clean = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.trim().slice(0, 40)]).filter(([, v]) => v));
  try {
    localStorage.setItem(KEY, JSON.stringify(clean));
  } catch {
    // not remembered this time
  }
  window.dispatchEvent(new Event(EVENT));
}

/** "Ch 3 · Main Hall lectern", or the channel's own label when it has no name. */
export function channelLabel(source: string, fallback: string, names: Record<string, string>): string {
  const name = names[source];
  if (!name) return fallback;
  const channel = /#(\d+)$/.exec(source)?.[1];
  return channel ? `Ch ${Number(channel) + 1} · ${name}` : name;
}
