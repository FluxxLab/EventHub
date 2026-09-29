/**
 * Importing attendees: a spreadsheet (CSV, or cells pasted from Excel or Google Sheets) becomes
 * tickets for one event, through `POST /editions/:id/tickets/issue` in batches. Everything here is
 * pure: reading the table, guessing which column is which, and checking each row before anything
 * is sent.
 */

export const BATCH_SIZE = 500;
export const MAX_ROWS = 20_000;

export const IMPORT_FIELDS = ['name', 'firstName', 'lastName', 'email', 'organisation', 'title', 'country', 'tier'] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number];

export const FIELD_LABEL: Record<ImportField, string> = {
  name: 'Full name',
  firstName: 'First name',
  lastName: 'Last name',
  email: 'Email',
  organisation: 'Organisation',
  title: 'Job title',
  country: 'Country',
  tier: 'Ticket tier',
};

/** Which column (index) holds each field; -1 when the file does not have it. */
export type Mapping = Record<ImportField, number>;

export type Table = { headers: string[]; rows: string[][] };

/* ------------------------------------------------------------------- reading */

/** The delimiter a file most likely uses: tabs from a paste, semicolons from European Excel, else commas. */
function delimiterOf(firstLine: string): string {
  if (firstLine.includes('\t')) return '\t';
  const count = (c: string) => firstLine.split(c).length - 1;
  return count(';') > count(',') ? ';' : ',';
}

/** RFC 4180 CSV (quotes, doubled quotes, newlines inside quotes), or tab-separated text. */
export function parseTable(text: string): Table {
  const src = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const delimiter = delimiterOf(src.slice(0, src.indexOf('\n') === -1 ? undefined : src.indexOf('\n')));
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === '') quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
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
  const clean = rows.map((r) => r.map((v) => v.trim())).filter((r) => r.some((v) => v !== ''));
  const [headers = [], ...body] = clean;
  return { headers, rows: body };
}

/** A cell as read from an Excel workbook. */
export type SheetCell = string | number | boolean | Date | null | undefined;

/** A cell as the text the rest of the import works with. */
function cellText(v: SheetCell): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  // long numbers (phone numbers typed as numbers) in full, never as 2.348e+12
  if (typeof v === 'number') return Number.isInteger(v) ? v.toLocaleString('en-US', { useGrouping: false }) : String(v);
  return String(v);
}

/**
 * An Excel sheet as a table: cells as text, empty rows dropped, and the first row that has anything
 * in it taken as the headings (a title row above them is common, and skipped when it is a single cell).
 */
export function tableFromSheet(data: SheetCell[][]): Table {
  const rows = data.map((r) => r.map((c) => cellText(c).trim())).filter((r) => r.some((v) => v !== ''));
  // "Attendee list, GS-27" alone on the first row, headings below it
  const start = rows.length > 1 && rows[0]!.filter(Boolean).length === 1 && rows[1]!.filter(Boolean).length > 1 ? 1 : 0;
  const [headers = [], ...body] = rows.slice(start);
  return { headers, rows: body };
}

/** Whether an Excel sheet has anything to import (a heading row and at least one row under it). */
export const sheetHasRows = (data: SheetCell[][]) => tableFromSheet(data).rows.length > 0;

/* ------------------------------------------------------------------- columns */

const norm = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

/** Header names each field goes by, in EventX, Eventbrite, Google Forms and hand-made sheets. */
const ALIASES: Record<ImportField, string[]> = {
  name: ['name', 'fullname', 'attendeename', 'attendee', 'guestname', 'delegatename', 'participantname', 'yourname', 'nameonbadge', 'badgename'],
  firstName: ['firstname', 'givenname', 'forename', 'first'],
  lastName: ['lastname', 'surname', 'familyname', 'last'],
  email: ['email', 'emailaddress', 'email1', 'attendeeemail', 'workemail', 'youremail', 'mail'],
  organisation: ['organisation', 'organization', 'company', 'companyname', 'institution', 'employer', 'organisationname', 'organizationname', 'affiliation'],
  title: ['jobtitle', 'title', 'position', 'designation', 'role', 'jobrole'],
  country: ['country', 'countryofresidence', 'nationality', 'countryregion', 'location'],
  tier: ['tickettype', 'ticket', 'tier', 'tickettier', 'category', 'ticketname', 'ticketclass', 'registrationtype', 'attendeetype'],
};

/** A first guess at which column is which, from the headers. */
export function guessMapping(headers: string[]): Mapping {
  const keys = headers.map(norm);
  const taken = new Set<number>();
  const mapping = Object.fromEntries(IMPORT_FIELDS.map((f) => [f, -1])) as Mapping;
  // exact names first, so "Email" is not taken by a looser match for another field
  for (const pass of ['exact', 'loose'] as const) {
    for (const field of IMPORT_FIELDS) {
      if (mapping[field] !== -1) continue;
      const i = keys.findIndex((k, idx) => !taken.has(idx) && (pass === 'exact' ? ALIASES[field].includes(k) : ALIASES[field].some((a) => a.length > 3 && k.includes(a))));
      if (i !== -1) {
        mapping[field] = i;
        taken.add(i);
      }
    }
  }
  return mapping;
}

/* --------------------------------------------------------------------- rows */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type Tier = { id: string; name: string };

export type RowProblem = 'no_name' | 'no_email' | 'bad_email' | 'duplicate' | 'no_tier';
export const PROBLEM_LABEL: Record<RowProblem, string> = {
  no_name: 'No name',
  no_email: 'No email',
  bad_email: 'Email looks wrong',
  duplicate: 'Same email as an earlier row',
  no_tier: 'Choose a tier for this value',
};

export type ImportRow = {
  /** The row's line in the file, counting the header as 1. */
  line: number;
  name: string;
  email: string;
  organisation: string;
  title: string;
  country: string;
  /** What the file says, for the tier table. */
  tierValue: string;
  ticketTypeId: string | null;
  problem: RowProblem | null;
};

const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? '').trim() : '');

/** The distinct tier values in the file, most common first. */
export function tierValues(table: Table, mapping: Mapping): { value: string; rows: number }[] {
  if (mapping.tier < 0) return [];
  const counts = new Map<string, number>();
  for (const r of table.rows) {
    const v = cell(r, mapping.tier);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts].map(([value, rows]) => ({ value, rows })).sort((a, b) => b.rows - a.rows || a.value.localeCompare(b.value));
}

/** A file's tier value to one of the event's tiers, by name, ignoring case and spacing; else null. */
export function matchTier(value: string, tiers: Tier[]): string | null {
  const v = norm(value);
  if (!v) return null;
  return (tiers.find((t) => norm(t.name) === v) ?? tiers.find((t) => v.includes(norm(t.name)) || norm(t.name).includes(v)))?.id ?? null;
}

/**
 * Each row as it would be imported, with the first problem that stops it. `tierChoice` maps a
 * file's tier value to a tier id; without a tier column every row gets `defaultTier`.
 */
export function buildRows(table: Table, mapping: Mapping, tierChoice: Record<string, string>, defaultTier: string | null): ImportRow[] {
  const seen = new Set<string>();
  return table.rows.map((r, i) => {
    const whole = cell(r, mapping.name);
    const name = (whole || [cell(r, mapping.firstName), cell(r, mapping.lastName)].filter(Boolean).join(' ')).replace(/\s+/g, ' ');
    const email = cell(r, mapping.email).toLowerCase();
    const tierValue = cell(r, mapping.tier);
    const ticketTypeId = mapping.tier >= 0 ? (tierChoice[tierValue] ?? null) : defaultTier;
    let problem: RowProblem | null = null;
    if (!name) problem = 'no_name';
    else if (!email) problem = 'no_email';
    else if (!EMAIL.test(email)) problem = 'bad_email';
    else if (seen.has(email)) problem = 'duplicate';
    else if (!ticketTypeId) problem = 'no_tier';
    if (email && EMAIL.test(email)) seen.add(email);
    return {
      line: i + 2,
      name,
      email,
      organisation: cell(r, mapping.organisation),
      title: cell(r, mapping.title),
      country: cell(r, mapping.country),
      tierValue,
      ticketTypeId,
      problem,
    };
  });
}

/** What goes to the API for a ready row; blanks are left out, and long values cut to what the API takes. */
export function toIssueRow(r: ImportRow) {
  const opt = (v: string, max: number) => (v ? { value: v.slice(0, max) } : null);
  return {
    name: r.name.slice(0, 255),
    email: r.email,
    ticketTypeId: r.ticketTypeId!,
    ...(opt(r.organisation, 255) && { organisation: r.organisation.slice(0, 255) }),
    ...(opt(r.title, 100) && { title: r.title.slice(0, 100) }),
    ...(opt(r.country, 100) && { country: r.country.slice(0, 100) }),
  };
}

export function chunk<T>(items: T[], size = BATCH_SIZE): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));
}

/* ------------------------------------------------------------------ results */

export type IssueResponse = {
  issued: { email: string; name: string; code: string; ticketId: string; created: boolean }[];
  skipped: { email: string; reason: 'has_ticket' | 'duplicate' }[];
};

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** A CSV of what happened to every row, to keep with the event's records. */
export function reportCsv(rows: ImportRow[], results: IssueResponse, stoppedAt: number | null): string {
  const issued = new Map(results.issued.map((i) => [i.email, i]));
  const skipped = new Map(results.skipped.map((s) => [s.email, s.reason]));
  const lines = rows.map((r) => {
    const done = issued.get(r.email);
    const status = r.problem
      ? `Not imported: ${PROBLEM_LABEL[r.problem]}`
      : done
        ? done.created
          ? 'Ticket issued (new account)'
          : 'Ticket issued'
        : skipped.get(r.email) === 'has_ticket'
          ? 'Already had a ticket'
          : stoppedAt !== null
            ? 'Not imported: the import stopped'
            : 'Not imported';
    return [String(r.line), r.name, r.email, status, done?.code ?? ''].map(csvCell).join(',');
  });
  return ['Line,Name,Email,Result,Ticket code', ...lines].join('\n');
}
