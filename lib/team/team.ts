import { z } from 'zod';

/**
 * Staff roles: organisers run everything; event organisers run only the events assigned to them;
 * session operators run live rooms only.
 */
export const STAFF_ROLES = ['admin', 'event_admin', 'session_admin'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const ROLE_LABEL: Record<StaffRole, string> = { admin: 'Organiser', event_admin: 'Event organiser', session_admin: 'Session operator' };
export const ROLE_HINT: Record<StaffRole, string> = {
  admin: 'Full console: every event, tickets, delegates, live operations and settings.',
  event_admin: 'Only the events you choose below: their programme, tickets, delegates and live day.',
  session_admin: 'Live rooms only: captions, questions, polls and discussions.',
};

/** `GET /delegates/admins`: staff accounts. */
export type StaffMember = { id: string; name: string; email: string; accessTier: StaffRole; createdAt: string; managedEditionIds?: string[] };

/** `POST /delegates/staff`, checked first: the API asks for the same (name 2–120, password 8–128). */
export const staffSchema = z
  .object({
  name: z.string().trim().min(2, 'Enter their full name.').max(120, 'Keep the name under 120 characters.'),
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.')),
  password: z.string().min(8, 'Use at least 8 characters.').max(128, 'Keep it under 128 characters.'),
    role: z.enum(STAFF_ROLES),
    /** The events an event organiser runs; ignored for the other roles. */
    editionIds: z.array(z.string()).default([]),
  })
  .refine((v) => v.role !== 'event_admin' || v.editionIds.length > 0, { path: ['editionIds'], message: 'Choose at least one event they run.' });
export type StaffForm = z.input<typeof staffSchema>;

/**
 * A readable temporary password to hand over (the person changes it after signing in): three
 * short words' worth of letters and digits, no look-alike characters.
 */
export function temporaryPassword(random: () => number = Math.random): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const block = () => Array.from({ length: 4 }, () => chars[Math.floor(random() * chars.length)]).join('');
  return `${block()}-${block()}-${block()}`;
}

/** Whether the signed-in organiser may remove this person's access (the API refuses self and the last organiser). */
export function removalBlocker(member: StaffMember, staff: StaffMember[], selfId: string | undefined): string | null {
  if (member.id === selfId) return 'You cannot remove your own access.';
  if (member.accessTier === 'admin' && staff.filter((s) => s.accessTier === 'admin').length <= 1) return 'The last organiser cannot be removed.';
  return null;
}
