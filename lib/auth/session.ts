'use client';

import { useSyncExternalStore } from 'react';

import { api, ApiError, setSessionExpiredHandler } from '@/lib/api/client';
import { clearTokens, readTokens, writeTokens, type Tokens } from '@/lib/api/tokens';
import { DEMO_MODE } from '@/lib/demo';

const DEMO_USER: StaffUser = { id: 'demo', name: 'Pascal Ahmadu', email: 'organiser@pic.org.ng', tier: 'admin', avatarUrl: null };
const DEMO_KEY = 'pic.admin.demo';

/**
 * Who may use the console: organisers (`admin`), event organisers who run only the events assigned
 * to them (`event_admin`), and caption/session operators (`session_admin`).
 */
export type StaffTier = 'admin' | 'event_admin' | 'session_admin';

export const TIER_LABEL: Record<StaffTier, string> = { admin: 'Organiser', event_admin: 'Event organiser', session_admin: 'Session operator' };

/** Organisers and event organisers: the event-running pages (the API keeps event organisers to their events). */
export const runsEvents = (tier: StaffTier) => tier === 'admin' || tier === 'event_admin';

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  tier: StaffTier;
  avatarUrl: string | null;
};

type Profile = { id: string; name: string; email: string; accessTier: string; avatarUrl: string | null };

const isStaff = (tier: string): tier is StaffTier => tier === 'admin' || tier === 'event_admin' || tier === 'session_admin';

type State = { status: 'loading' } | { status: 'signed-out' } | { status: 'signed-in'; user: StaffUser };

/**
 * One shared "loading" value. useSyncExternalStore compares snapshots by identity, so the server
 * snapshot must be the same object every call; a fresh `{ status: 'loading' }` each time makes
 * React warn about an infinite loop.
 */
const LOADING: State = { status: 'loading' };

let state: State = LOADING;
const listeners = new Set<() => void>();
const setState = (next: State) => {
  state = next;
  listeners.forEach((listener) => listener());
};

async function loadProfile(): Promise<StaffUser> {
  const profile = await api.get<Profile>('/delegates/me');
  if (!isStaff(profile.accessTier)) {
    throw new ApiError(403, 'This console is for PIC Events organisers. Your account is a delegate account.');
  }
  return { id: profile.id, name: profile.name, email: profile.email, tier: profile.accessTier, avatarUrl: profile.avatarUrl };
}

export const session = {
  getState: () => state,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Restores a session from this tab's stored tokens; runs once when the console opens. */
  async restore(): Promise<void> {
    if (DEMO_MODE) {
      setState(sessionStorage.getItem(DEMO_KEY) ? { status: 'signed-in', user: DEMO_USER } : { status: 'signed-out' });
      return;
    }
    if (!readTokens()) {
      setState({ status: 'signed-out' });
      return;
    }
    try {
      setState({ status: 'signed-in', user: await loadProfile() });
    } catch {
      clearTokens();
      setState({ status: 'signed-out' });
    }
  },

  /** Signs in and refuses delegate accounts: only staff tiers get a console session. */
  async signIn(email: string, password: string): Promise<StaffUser> {
    if (DEMO_MODE) {
      sessionStorage.setItem(DEMO_KEY, '1');
      setState({ status: 'signed-in', user: DEMO_USER });
      return DEMO_USER;
    }
    const tokens = await api.postPublic<Tokens>('/auth/login', { email: email.trim(), password });
    writeTokens(tokens);
    try {
      const user = await loadProfile();
      setState({ status: 'signed-in', user });
      return user;
    } catch (error) {
      // A delegate who signed in here must not keep a live token in the console's tab.
      await api.post('/auth/logout', { refreshToken: tokens.refreshToken }).catch(() => undefined);
      clearTokens();
      throw error;
    }
  },

  async signOut(): Promise<void> {
    if (DEMO_MODE) sessionStorage.removeItem(DEMO_KEY);
    const tokens = readTokens();
    if (tokens) await api.post('/auth/logout', { refreshToken: tokens.refreshToken }).catch(() => undefined);
    clearTokens();
    setState({ status: 'signed-out' });
  },
};

// A refresh the server rejected ends the session everywhere in this tab.
setSessionExpiredHandler(() => setState({ status: 'signed-out' }));

const getServerState = () => LOADING;

export function useSession(): State {
  return useSyncExternalStore(session.subscribe, session.getState, getServerState);
}
