'use client';

import { useSyncExternalStore } from 'react';

import { useEditions } from '@/lib/events/use-editions';

/**
 * The event the organiser is working on, picked once (in the top bar, or any page's own picker)
 * and used by every page, remembered on this computer. It is not the app's "current" event: that
 * one is set in Events and decides what delegates see; this only decides what the console shows.
 */
const KEY = 'pic.admin.working-event';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: the current event, every time
  }
}

/** Switches every page to this event, here and in the console's other open tabs. */
export function setWorkingEvent(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // not remembered, but this tab still switches
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** The working event: the one picked, else the app's current event, else the newest. */
export function useWorkingEdition() {
  const editions = useEditions();
  const picked = useSyncExternalStore(subscribe, read, () => null);
  const list = editions.data ?? [];
  const edition = list.find((e) => e.id === picked) ?? list.find((e) => e.isCurrent) ?? list[0];
  return { editions, list, edition, setEditionId: setWorkingEvent };
}
