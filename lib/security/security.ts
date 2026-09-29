/** `GET /security/events`: newest first, a page at a time, each with who did it. */
export type Severity = 'info' | 'warning' | 'critical';

export type SecurityEvent = {
  id: string;
  type: string;
  description: string;
  severity: Severity;
  /** The actor's id (the API's name for it). */
  actionId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  /** Null when no one was signed in (a gate scan), or the account has since been deleted. */
  actor: { id: string; name: string; email: string; tier: string } | null;
};

/** Kinds of event, for the filter. Types the API adds later still show under "All kinds". */
export const GROUPS = {
  access: {
    label: 'Accounts & access',
    types: [
      'refresh_token_reuse',
      'password_changed',
      'google_linked',
      'delegate_registered',
      'admin_access_changed',
      'tier_changed',
      'staff_account_created',
      'delegate_deleted_account',
      'delegate_approval_changed',
      'delegates_approved_all',
    ],
  },
  changes: {
    label: 'Organiser changes',
    types: [
      'session_deleted',
      'session_status_changed',
      'registration_entry_added',
      'registration_entry_updated',
      'registration_entry_deleted',
      'notification_created',
      'notification_deleted',
      'trivia_live',
      'trivia_updated',
      'trivia_deleted',
      'pitch_topic_created',
      'pitch_topic_deleted',
      'pitch_entry_updated',
      'pitch_entry_deleted',
      'pitch_voting_opened',
      'pitch_voting_closed',
      'overlays_changed',
      'cut-to-break',
      'captions_cleared',
      'ingest_created',
      'ingest_rotated',
      'ingest_deleted',
      'certificate_design_saved',
      'certificate_design_removed',
    ],
  },
  moderation: {
    label: 'Reports & moderation',
    types: ['delegate_reported', 'comment_flagged', 'comment_hidden', 'comment_unhidden', 'comment_report_dismissed'],
  },
  exports: { label: 'Data exports', types: ['delegates_exported', 'transcript_exported', 'thread_exported'] },
  door: { label: 'Door & passes', types: ['pass_verification_failed'] },
} as const;
export type Group = keyof typeof GROUPS;

export const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Critical', warning: 'Warning', info: 'Info' };

const TIER_LABEL: Record<string, string> = {
  admin: 'Organiser',
  session_admin: 'Session operator',
  standard: 'Delegate',
  vip: 'VIP',
  vvip: 'VVIP',
  press: 'Press',
};
export const tierLabel = (tier: string) => TIER_LABEL[tier] ?? tier.replace(/_/g, ' ');

/** "session_deleted" → "Session deleted", "cut-to-break" → "Cut to break". */
export function typeLabel(type: string): string {
  const words = type.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function groupOf(type: string): Group | null {
  for (const [key, group] of Object.entries(GROUPS)) if ((group.types as readonly string[]).includes(type)) return key as Group;
  return null;
}

export type Period = 'any' | 'today' | '7' | '30';
export const PERIOD_LABEL: Record<Period, string> = { any: 'Any time', today: 'Today', '7': 'Last 7 days', '30': 'Last 30 days' };

/** The `from` instant for a period; "today" is today at the venue (Lagos, UTC+1). */
export function periodFrom(period: Period, now: number): string | undefined {
  if (period === 'any') return undefined;
  if (period === 'today') {
    const venueDay = new Date(now + 3_600_000).toISOString().slice(0, 10);
    return new Date(`${venueDay}T00:00:00+01:00`).toISOString();
  }
  return new Date(now - Number(period) * 86_400_000).toISOString();
}

const readable = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(readable).join(', ');
  return JSON.stringify(value);
};
const keyLabel = (key: string) => {
  const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * An event's details as label/value lines. Organiser actions carry the request's `params` and
 * `body`; those are unwrapped so "Id" and "Tier" read as fields, not as JSON.
 */
export function detailsOf(metadata: SecurityEvent['metadata']): { label: string; value: string }[] {
  if (!metadata) return [];
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if ((key === 'params' || key === 'body') && value && typeof value === 'object' && !Array.isArray(value)) Object.assign(flat, value);
    else flat[key] = value;
  }
  return Object.entries(flat)
    .map(([key, value]) => ({ label: keyLabel(key), value: readable(value) }))
    .filter((d) => d.value !== '' && d.value !== '{}');
}

const cell = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The rows on screen as CSV, BOM so Excel reads names correctly. */
export function eventsCsv(events: SecurityEvent[]): string {
  const header = ['Time', 'Severity', 'Event', 'Description', 'Who', 'Email', 'Role', 'Details'];
  const rows = events.map((e) => [
    e.createdAt,
    SEVERITY_LABEL[e.severity],
    typeLabel(e.type),
    e.description,
    e.actor?.name ?? (e.actionId ? 'Deleted account' : 'No one signed in'),
    e.actor?.email ?? '',
    e.actor ? tierLabel(e.actor.tier) : '',
    detailsOf(e.metadata)
      .map((d) => `${d.label}: ${d.value}`)
      .join('; '),
  ]);
  return `﻿${[header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n')}`;
}
