'use client';

import { useSyncExternalStore } from 'react';

/**
 * The console's appearance: light (the default), dark, or following the computer's setting. Kept
 * per browser and applied as `data-theme` on <html>; the colours live in globals.css. A small
 * script in the root layout applies it before the first paint, so a dark console never flashes
 * white on load.
 */
export type Theme = 'light' | 'dark' | 'system';
export const THEMES: { value: Theme; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match my computer' },
];
const KEY = 'pic.admin.theme';
const CHANGE = 'pic:theme';

/** Runs in <head> before React: sets the remembered theme. Kept tiny and self-contained. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${KEY}');document.documentElement.dataset.theme=t==='dark'||t==='system'?t:'light'}catch(e){document.documentElement.dataset.theme='light'}`;

function read(): Theme {
  try {
    const t = window.localStorage.getItem(KEY);
    return t === 'dark' || t === 'system' ? t : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(theme: Theme) {
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    // applies for this visit only
  }
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(CHANGE));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE, onChange);
  return () => window.removeEventListener(CHANGE, onChange);
}

export const useTheme = () => useSyncExternalStore(subscribe, read, () => 'light' as Theme);
