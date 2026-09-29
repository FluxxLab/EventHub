import { z } from 'zod';

/** `GET /editions` (organisers only): every edition, newest first. The fields the Events page uses. */
export type EditionStatus = 'draft' | 'announced' | 'live' | 'ended';

export const EDITION_CATEGORIES = [
  'summits',
  'workshops',
  'roundtables',
  'conferences',
  'fellowships',
  'training',
  'exhibitions',
  'community',
] as const;
export type EditionCategory = (typeof EDITION_CATEGORIES)[number];

export type Edition = {
  id: string;
  name: string;
  shortName: string;
  startsAt: string;
  endsAt: string;
  venue: string | null;
  /** Street address for the app's venue page. */
  address?: string | null;
  city: string | null;
  /** The map pin; both set or both null. */
  latitude?: number | null;
  longitude?: number | null;
  category: EditionCategory;
  status: EditionStatus;
  registrationOpen: boolean;
  /** The edition the delegate app is pointed at. At most one. */
  isCurrent: boolean;
  /** Its tracks and interests: values from the shared lists (see lib/catalog/topics). */
  trackValues?: string[];
  interestValues?: string[];
  /** Automatic pushes switched off for this edition (see lib/notifications). */
  mutedNotifications?: string[];
  coverImage: string | null;
  /** The cover and logo as URLs the console can show (uploads are stored as keys). */
  coverUrl?: string | null;
  logoUrl?: string | null;
  /** The event's button colour in the app, #rrggbb, or null for PIC navy. */
  brandColor?: string | null;
  createdAt: string;
};

export const STATUS_LABEL: Record<EditionStatus, string> = {
  draft: 'Draft',
  announced: 'Announced',
  live: 'Live',
  ended: 'Ended',
};

export const categoryLabel = (category: EditionCategory) => category.charAt(0).toUpperCase() + category.slice(1);

/** "7 – 8 Sep 2027", "30 Sep – 2 Oct 2027", "7 Sep 2027". */
export function dateRange(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const full = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  if (start.toDateString() === end.toDateString()) return full(start);
  if (start.getFullYear() !== end.getFullYear()) return `${full(start)} – ${full(end)}`;
  const sameMonth = start.getMonth() === end.getMonth();
  const head = start.toLocaleDateString('en-GB', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
  return `${head} – ${full(end)}`;
}

/** Where it happens, from the venue and city it has. */
export const placeOf = (edition: Pick<Edition, 'venue' | 'city'>) => [edition.venue, edition.city].filter(Boolean).join(', ');

/* ----------------------------------------------------------------- sorting */

export type SortKey = 'name' | 'startsAt' | 'status';
export type Sort = { key: SortKey; dir: 'asc' | 'desc' };

/** Lifecycle order, so "status" sorts draft → announced → live → ended rather than alphabetically. */
const STATUS_ORDER: Record<EditionStatus, number> = { draft: 0, announced: 1, live: 2, ended: 3 };

export function sortEditions(editions: Edition[], sort: Sort): Edition[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const value = (e: Edition) =>
    sort.key === 'name' ? e.name.toLowerCase() : sort.key === 'status' ? STATUS_ORDER[e.status] : Date.parse(e.startsAt);
  return [...editions].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    if (x < y) return -sign;
    if (x > y) return sign;
    // Ties fall back to the newest start first, so the order never jumps between renders.
    return Date.parse(b.startsAt) - Date.parse(a.startsAt);
  });
}

/* --------------------------------------------------------------- export */

const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** The table as CSV, one row per edition, quoted where a value needs it. */
export function editionsCsv(editions: Edition[]): string {
  const header = ['Name', 'Short name', 'Starts', 'Ends', 'Venue', 'City', 'Category', 'Status', 'Registration', 'Current'];
  const rows = editions.map((e) => [
    e.name,
    e.shortName,
    e.startsAt,
    e.endsAt,
    e.venue ?? '',
    e.city ?? '',
    categoryLabel(e.category),
    STATUS_LABEL[e.status],
    e.registrationOpen ? 'Open' : 'Closed',
    e.isCurrent ? 'Yes' : 'No',
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}

/* ------------------------------------------------------------- create form */

/** The "Add event" form, checked before it is sent; the API validates again. */
export const createEditionSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter the event name.').max(255, 'Keep the name under 255 characters.'),
    shortName: z.string().trim().min(1, 'Enter a short name, such as GS-27.').max(50, 'Keep the short name under 50 characters.'),
    startsAt: z.string().min(1, 'Choose when it starts.'),
    endsAt: z.string().min(1, 'Choose when it ends.'),
    venue: z.string().trim().max(255, 'Keep the venue under 255 characters.'),
    city: z.string().trim().max(100, 'Keep the city under 100 characters.'),
    category: z.enum(EDITION_CATEGORIES),
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.endsAt) > new Date(v.startsAt), {
    path: ['endsAt'],
    message: 'It has to end after it starts.',
  });

export type CreateEditionForm = z.input<typeof createEditionSchema>;

/** The form's values as the `POST /editions` body: ISO instants, blanks left out. */
export function toCreateBody(form: z.output<typeof createEditionSchema>) {
  return {
    name: form.name,
    shortName: form.shortName,
    startsAt: new Date(form.startsAt).toISOString(),
    endsAt: new Date(form.endsAt).toISOString(),
    category: form.category,
    ...(form.venue ? { venue: form.venue } : {}),
    ...(form.city ? { city: form.city } : {}),
  };
}

/** A stored instant as the form's local day and time: "2027-09-07" and "09:00". */
export function localParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, time: `${two(d.getHours())}:${two(d.getMinutes())}` };
}

/** An event as the Add event form's values, for editing it. */
export function editionToForm(e: Edition): { form: CreateEditionForm; range: { start: string; end: string }; times: { start: string; end: string } } {
  const start = localParts(e.startsAt);
  const end = localParts(e.endsAt);
  return {
    form: { name: e.name, shortName: e.shortName, startsAt: '', endsAt: '', venue: e.venue ?? '', city: e.city ?? '', category: e.category },
    range: { start: start.date, end: end.date },
    times: { start: start.time, end: end.time },
  };
}

/** The edit form as the `PATCH /editions/:id` body: like create, but an emptied venue or city is sent, which clears it. */
export const toUpdateBody = (form: z.output<typeof createEditionSchema>) => ({ ...toCreateBody(form), venue: form.venue, city: form.city });
