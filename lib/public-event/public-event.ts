import { z } from 'zod';

import { API_URL } from '@/lib/config';
import { money } from '@/lib/format';

/**
 * The public event page (`/e/<id>`): what a link shared from the delegate app opens for someone
 * without the app. `GET /editions/:id/public` needs no token, so this is the one place outside
 * `lib/api/client.ts` that calls the API; the page fetches it in the browser, and the Worker in
 * `worker/index.js` fetches the same summary for the link preview.
 */

/** `GET /editions/:id/public`. Parsed rather than trusted: a malformed answer is "unavailable", not a crash. */
export const publicEventSchema = z.object({
  id: z.string(),
  name: z.string(),
  shortName: z.string(),
  category: z.string(),
  status: z.enum(['announced', 'live', 'ended']),
  startsAt: z.string(),
  endsAt: z.string(),
  city: z.string().nullable(),
  venue: z.string().nullable(),
  address: z.string().nullable(),
  description: z.string().nullable(),
  coverUrl: z.string().nullable(),
  registrationOpen: z.boolean(),
  ticketsFrom: z.object({ amount: z.number(), currency: z.string() }).nullable().optional(),
});
export type PublicEvent = z.infer<typeof publicEventSchema>;

export type PublicEventResult = { kind: 'ok'; event: PublicEvent } | { kind: 'not-found' } | { kind: 'unavailable' };

/** How long a rendered page (and its link preview) may be behind the console. */
export const PUBLIC_EVENT_REVALIDATE_SECONDS = 60;
const TIMEOUT_MS = 5_000;

/**
 * Fetch one edition's public summary. Never throws: a missing or draft edition is `not-found`
 * (the page 404s), anything else going wrong (API down, slow, odd answer) is `unavailable` and the
 * page still offers "Open in the app".
 */
export async function fetchPublicEvent(id: string, fetcher: typeof fetch = fetch): Promise<PublicEventResult> {
  let response: Response;
  try {
    response = await fetcher(`${API_URL}/editions/${encodeURIComponent(id)}/public`, {
      headers: { accept: 'application/json' },
      next: { revalidate: PUBLIC_EVENT_REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { kind: 'unavailable' };
  }
  // 400 too: an id that is not an id is a broken link, which to the visitor is the same thing
  if (response.status === 404 || response.status === 400) return { kind: 'not-found' };
  if (!response.ok) return { kind: 'unavailable' };
  try {
    const parsed = publicEventSchema.safeParse(await response.json());
    return parsed.success ? { kind: 'ok', event: parsed.data } : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

/* ------------------------------------------------------------------ display */

/** Event times are Nigerian: render them there, whatever the server's clock zone. */
const TIME_ZONE = 'Africa/Lagos';

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
const weekdayFormat = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TIME_ZONE });

/** "Tuesday, 7 September 2027 · 08:00–17:00 WAT" for one day; "7–8 September 2027" across days. */
export function dateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return '';
  if (dayFormat.format(start) === dayFormat.format(end)) {
    return `${weekdayFormat.format(start)} · ${timeFormat.format(start)}–${timeFormat.format(end)} WAT`;
  }
  return dayFormat.formatRange(start, end);
}

/** "Transcorp Hilton, Abuja": whichever of venue and city are set, without repeating one. */
export function placeLine(event: Pick<PublicEvent, 'venue' | 'city'>): string {
  const parts = [event.venue, event.city].map((p) => p?.trim()).filter((p): p is string => Boolean(p));
  return [...new Set(parts)].join(', ');
}

/** "Tickets from ₦15,000", "Free to attend", or null when nothing is on sale or sales are closed. */
export function ticketLine(event: Pick<PublicEvent, 'ticketsFrom' | 'registrationOpen' | 'status'>): string | null {
  if (event.status === 'ended') return null;
  if (!event.registrationOpen) return 'Registration closed';
  if (!event.ticketsFrom) return null;
  return event.ticketsFrom.amount === 0 ? 'Free to attend' : `Tickets from ${money(event.ticketsFrom.amount, event.ticketsFrom.currency)}`;
}

export const STATUS_TEXT: Record<PublicEvent['status'], string> = {
  announced: 'Upcoming',
  live: 'Happening now',
  ended: 'Ended',
};

/** A one-line summary for link previews and search results: at most `max` characters, cut at a word. */
export function excerpt(text: string | null, max = 180): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.–-]+$/, '')}…`;
}

/** The preview description: the organiser's words when there are any, otherwise when and where. */
export function previewDescription(event: PublicEvent): string {
  const when = dateRange(event.startsAt, event.endsAt);
  const where = placeLine(event);
  const facts = [when, where].filter(Boolean).join(' · ');
  const about = excerpt(event.description, 160);
  return about ? `${facts}. ${about}` : facts;
}

/* -------------------------------------------------------------------- links */

/** The delegate app's URL scheme (`app.json` → `scheme`). */
export const APP_SCHEME = 'picevents';

/** Opens the event in the app (`src/app/events/[id].tsx` there). */
export const appEventLink = (id: string) => `${APP_SCHEME}://events/${encodeURIComponent(id)}`;

/** This page's path, as the app's share sheet builds it (`eventLink` in the app's `lib/event-cta.ts`). */
export const publicEventPath = (id: string) => `/e/${encodeURIComponent(id)}`;

/** The edition id in a shared link's path (`/e/<id>`), or null for anything else. */
export function eventIdFromPath(pathname: string): string | null {
  const match = /^\/e\/([^/?#]+)\/?$/.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}
