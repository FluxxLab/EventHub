/** `GET /delegates` (organisers): up to 500 delegates, newest first. The fields the page uses. */

export const TIERS = ['standard', 'vip', 'vvip', 'press'] as const;
/** Tiers an organiser can set from this page; staff roles are granted on the Team page. */
export type DelegateTier = (typeof TIERS)[number];
export type AccessTier = DelegateTier | 'admin' | 'session_admin';

export const TIER_LABEL: Record<AccessTier, string> = {
  standard: 'Standard',
  vip: 'VIP',
  vvip: 'VVIP',
  press: 'Press',
  admin: 'Organiser',
  session_admin: 'Session operator',
};

/** Set on accounts made for ticket holders who have not signed in yet (TICKET_HOLDER_TAG). */
export const TICKET_HOLDER_TAG = 'ticket-holder';

export type Delegate = {
  id: string;
  name: string;
  email: string;
  organisation: string | null;
  title: string | null;
  country: string | null;
  accessTier: AccessTier;
  tracks: string[];
  interests: string[];
  tags: string[];
  pendingReview: boolean;
  flagged: boolean;
  createdAt: string;
  consentAt: string | null;
};

export const isStaff = (d: Pick<Delegate, 'accessTier'>) => d.accessTier === 'admin' || d.accessTier === 'session_admin';

export type DelegateStatus = 'pending' | 'approved' | 'unclaimed';
export const STATUS_LABEL: Record<DelegateStatus, string> = { pending: 'Pending review', approved: 'Approved', unclaimed: 'Ticket not claimed' };

/** Unclaimed ticket holder first (they have not signed in), then review state. */
export function statusOf(d: Pick<Delegate, 'tags' | 'pendingReview'>): DelegateStatus {
  if (d.tags.includes(TICKET_HOLDER_TAG)) return 'unclaimed';
  return d.pendingReview ? 'pending' : 'approved';
}

export type StatusFilter = DelegateStatus | 'all';

export function filterByStatus(delegates: Delegate[], status: StatusFilter): Delegate[] {
  return status === 'all' ? delegates : delegates.filter((d) => statusOf(d) === status);
}

export const countByStatus = (delegates: Delegate[]) =>
  delegates.reduce<Record<DelegateStatus, number>>(
    (acc, d) => {
      acc[statusOf(d)] += 1;
      return acc;
    },
    { pending: 0, approved: 0, unclaimed: 0 },
  );

export const PAGE_SIZE = 25;

/** One page of a list, and how many pages there are (at least one, so "Page 1 of 1" reads right). */
export function paginate<T>(items: T[], page: number, size = PAGE_SIZE): { rows: T[]; pages: number; page: number } {
  const pages = Math.max(1, Math.ceil(items.length / size));
  const safe = Math.min(Math.max(1, page), pages);
  return { rows: items.slice((safe - 1) * size, safe * size), pages, page: safe };
}

const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/**
 * The list as CSV, built in the console: the API's export route currently returns an empty body
 * (its handler does not await the file), so this is the dependable way to download.
 */
export function delegatesCsv(delegates: Delegate[]): string {
  const header = ['Name', 'Email', 'Organisation', 'Title', 'Country', 'Tier', 'Status', 'Tracks', 'Interests', 'Consent given', 'Registered'];
  const rows = delegates.map((d) => [
    d.name,
    d.email,
    d.organisation ?? '',
    d.title ?? '',
    d.country ?? '',
    TIER_LABEL[d.accessTier] ?? d.accessTier,
    STATUS_LABEL[statusOf(d)],
    d.tracks.join('; '),
    d.interests.join('; '),
    d.consentAt ?? '',
    d.createdAt,
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}
