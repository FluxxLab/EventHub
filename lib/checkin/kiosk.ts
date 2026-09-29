/**
 * Self check-in: a tablet or screen at the entrance where attendees check themselves in and their
 * badge prints. It runs on a staff login (the door-staff tier is enough) and is locked to the
 * attendee screen until staff enter the PIN they chose when starting it. Unlike the staff desk it
 * never lists or searches people: an attendee scans their own QR or types their own ticket code.
 */

import type { TicketMatch } from '@/lib/checkin/checkin';

export type KioskCamera = 'user' | 'environment' | 'none';

export type KioskConfig = {
  editionId: string;
  /** Print the badge as each person checks in. */
  print: boolean;
  /** The camera facing the attendee (a tablet on a stand), the back one, or a USB scanner only. */
  camera: KioskCamera;
  /** SHA-256 of the staff PIN, which leaves kiosk mode. */
  pinHash: string;
};

export const CAMERA_LABEL: Record<KioskCamera, string> = {
  user: 'Front camera (tablet facing the attendee)',
  environment: 'Back camera',
  none: 'Scanner only (USB or Bluetooth)',
};

/** Four to six digits: short enough to type on a touch screen, not guessable by a passer-by at once. */
export const validPin = (pin: string) => /^\d{4,6}$/.test(pin);

export async function hashPin(pin: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`pic-kiosk:${pin}`));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A ticket code as typed on a touch screen: case, spaces and dashes do not matter. */
const normCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * The ticket whose code is exactly what was typed, or null. The lookup behind it also matches
 * names and emails, which a public screen must never offer: only an exact code counts.
 */
export function exactCode(matches: TicketMatch[], typed: string): TicketMatch | null {
  const want = normCode(typed);
  if (want.length < 6) return null;
  return matches.find((m) => normCode(m.code) === want) ?? null;
}

const KEY = 'pic.kiosk';

/** The running kiosk, kept for this browser tab so a refresh stays in kiosk mode. */
export function loadKiosk(): KioskConfig | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as Partial<KioskConfig>) : null;
    return v && typeof v.editionId === 'string' && typeof v.pinHash === 'string' ? { editionId: v.editionId, pinHash: v.pinHash, print: v.print !== false, camera: v.camera ?? 'user' } : null;
  } catch {
    return null;
  }
}

export function saveKiosk(config: KioskConfig | null) {
  try {
    if (config) window.sessionStorage.setItem(KEY, JSON.stringify(config));
    else window.sessionStorage.removeItem(KEY);
  } catch {
    // private window: kiosk mode lasts until the page is reloaded
  }
}

/** How long each screen stays before the kiosk is ready for the next person. */
export const RESET_AFTER_MS = { welcome: 9000, already: 10_000, problem: 8000, code: 45_000 } as const;
