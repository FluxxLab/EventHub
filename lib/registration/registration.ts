import { z } from 'zod';

import { TIER_LABEL, TIERS, type DelegateTier } from '@/lib/delegates/delegates';

/**
 * `GET /delegates/registration-list`: invitees organisers have pre-approved. Signing up with a
 * matching email or invite code grants `assignedTier` and prefills organisation and title.
 */
export type RegistrationEntry = {
  id: string;
  email: string | null;
  inviteCode: string | null;
  name: string | null;
  organisation: string | null;
  title: string | null;
  assignedTier: DelegateTier;
  claimedAt: string | null;
  claimedByDelegateId: string | null;
  createdAt: string;
};

export type EntryStatus = 'waiting' | 'claimed';
export const statusOf = (e: Pick<RegistrationEntry, 'claimedAt'>): EntryStatus => (e.claimedAt ? 'claimed' : 'waiting');

/** Entries matching a status and a search over name, email, organisation and code. */
export function filterEntries(entries: RegistrationEntry[], { status, query }: { status: EntryStatus | 'all'; query: string }) {
  const q = query.trim().toLowerCase();
  return entries.filter(
    (e) =>
      (status === 'all' || statusOf(e) === status) &&
      (!q || [e.name, e.email, e.organisation, e.inviteCode].some((v) => v?.toLowerCase().includes(q))),
  );
}

/* ------------------------------------------------------------------ form */

/** The invite code column is 50 characters (the API's DTO allows more, so the console enforces it). */
export const MAX_CODE = 50;

export const entrySchema = z
  .object({
    name: z.string().trim().max(255, 'Keep the name under 255 characters.'),
    email: z
      .string()
      .trim()
      .toLowerCase()
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email address, or leave it blank to use an invite code.'),
    inviteCode: z.string().trim().toUpperCase().max(MAX_CODE, `Keep the code to ${MAX_CODE} characters.`),
    organisation: z.string().trim().max(255, 'Keep the organisation under 255 characters.'),
    title: z.string().trim().max(100, 'Keep the title under 100 characters.'),
    assignedTier: z.enum(TIERS),
  })
  .refine((v) => v.email !== '' || v.name !== '', { path: ['name'], message: 'Give a name or an email, so you can tell who this invite is for.' });
export type EntryForm = z.input<typeof entrySchema>;

export const entryFormOf = (e: RegistrationEntry | null): EntryForm => ({
  name: e?.name ?? '',
  email: e?.email ?? '',
  inviteCode: e?.inviteCode ?? '',
  organisation: e?.organisation ?? '',
  title: e?.title ?? '',
  assignedTier: e?.assignedTier ?? 'standard',
});

/**
 * The body for create or update. On create, a blank code is left out (the API generates one);
 * blank organisation and title are sent as "" on update, which the API reads as "clear".
 */
export function toEntryBody(form: z.output<typeof entrySchema>, { update }: { update: boolean }) {
  return {
    assignedTier: form.assignedTier,
    ...(form.name ? { name: form.name } : {}),
    ...(form.email ? { email: form.email } : {}),
    ...(form.inviteCode ? { inviteCode: form.inviteCode } : {}),
    ...(form.organisation || update ? { organisation: form.organisation } : {}),
    ...(form.title || update ? { title: form.title } : {}),
  };
}

/* ---------------------------------------------------------------- CSV in/out */

/** Splits CSV text into rows of cells, honouring quotes ("a, b" and "" for a quote). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

const TIER_BY_LABEL = new Map<string, DelegateTier>(TIERS.flatMap((t) => [[t, t] as const, [TIER_LABEL[t].toLowerCase(), t] as const]));

export type ImportRow = { line: number; form: EntryForm; error: string | null };

/**
 * Rows from an uploaded CSV, each checked with the entry schema. The header row names the
 * columns (any order, any case): name, email, organisation, title, tier, code. Tier accepts
 * "vip" or "VIP" and defaults to standard.
 */
export function importRows(text: string): { rows: ImportRow[]; missingHeader: boolean } {
  const [header, ...data] = parseCsv(text);
  const cols = (header ?? []).map((h) => h.trim().toLowerCase());
  const at = (names: string[]) => cols.findIndex((c) => names.includes(c));
  const idx = {
    name: at(['name', 'full name']),
    email: at(['email', 'email address']),
    organisation: at(['organisation', 'organization', 'company']),
    title: at(['title', 'job title', 'role']),
    tier: at(['tier', 'access tier']),
    code: at(['code', 'invite code']),
  };
  if (idx.name < 0 && idx.email < 0) return { rows: [], missingHeader: true };
  const get = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');
  const rows = data.map((row, n) => {
    const tierText = get(row, idx.tier).toLowerCase();
    const tier = tierText ? TIER_BY_LABEL.get(tierText) : 'standard';
    const form: EntryForm = {
      name: get(row, idx.name),
      email: get(row, idx.email),
      organisation: get(row, idx.organisation),
      title: get(row, idx.title),
      inviteCode: get(row, idx.code),
      assignedTier: tier ?? 'standard',
    };
    const parsed = entrySchema.safeParse(form);
    const error = !tier ? `Unknown tier “${get(row, idx.tier)}”.` : parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Invalid row.');
    return { line: n + 2, form, error };
  });
  return { rows, missingHeader: false };
}

const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function entriesCsv(entries: RegistrationEntry[]): string {
  const header = ['Name', 'Email', 'Organisation', 'Title', 'Tier', 'Invite code', 'Status', 'Claimed'];
  const rows = entries.map((e) => [
    e.name ?? '',
    e.email ?? '',
    e.organisation ?? '',
    e.title ?? '',
    TIER_LABEL[e.assignedTier],
    e.inviteCode ?? '',
    statusOf(e) === 'claimed' ? 'Claimed' : 'Waiting',
    e.claimedAt ?? '',
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
}
