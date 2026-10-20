/**
 * Calls to action (`/editions/:id/calls-to-action`): what each session asked an organisation or
 * group to commit to. Analyse suggests them from the session's named transcript; organisers
 * review every one (edit, merge, approve, reject) before the approved ones go into the deck.
 */

export type CallToActionType = 'recommendation' | 'pledge';
export type CallToActionStatus = 'suggested' | 'approved' | 'rejected' | 'merged';

export type CallToAction = {
  id: string;
  editionId: string;
  sessionId: string | null;
  type: CallToActionType;
  action: string;
  shortText: string;
  directedAt: string;
  proposedBy: string | null;
  proposedByOrganisation: string | null;
  alsoProposedBy: string[];
  deadline: string | null;
  amount: string | null;
  theme: string | null;
  quote: string | null;
  saidAt: string | null;
  needsDetail: boolean;
  status: CallToActionStatus;
  mergedInto: string | null;
  source: 'ai' | 'manual';
  createdAt: string;
  updatedAt: string;
  /** Decks only, set by the deck dialog: a recommendation's organisations with delegates at the event (see presentLine). */
  present?: string | null;
};

export type CallsToActionBoard = {
  /** False until ANTHROPIC_API_KEY is set on the server: Analyse is off, the rest works. */
  aiReady: boolean;
  items: CallToAction[];
  analyses: { sessionId: string; analysedUpTo: string; runs: number }[];
};

export type AnalyseResult = { added: CallToAction[]; read: number; message: string };

export const TYPE_LABEL: Record<CallToActionType, string> = { recommendation: 'Recommendation', pledge: 'Pledge' };
export const STATUS_LABEL: Record<CallToActionStatus, string> = { suggested: 'To review', approved: 'Approved', rejected: 'Rejected', merged: 'Merged' };

/** The review tabs, in the order a reviewer works through them. */
export const STATUS_TABS = ['suggested', 'approved', 'rejected', 'all'] as const;
export type StatusTab = (typeof STATUS_TABS)[number];

/** The fields a reviewer edits, as the form holds them (empty strings for blanks). */
export type CallToActionForm = {
  type: CallToActionType;
  action: string;
  shortText: string;
  directedAt: string;
  proposedBy: string;
  proposedByOrganisation: string;
  deadline: string;
  amount: string;
  theme: string;
  quote: string;
  needsDetail: boolean;
  sessionId: string;
};

export const EMPTY_FORM: CallToActionForm = {
  type: 'recommendation',
  action: '',
  shortText: '',
  directedAt: '',
  proposedBy: '',
  proposedByOrganisation: '',
  deadline: '',
  amount: '',
  theme: '',
  quote: '',
  needsDetail: false,
  sessionId: '',
};

export const toForm = (c: CallToAction): CallToActionForm => ({
  type: c.type,
  action: c.action,
  shortText: c.shortText,
  directedAt: c.directedAt,
  proposedBy: c.proposedBy ?? '',
  proposedByOrganisation: c.proposedByOrganisation ?? '',
  deadline: c.deadline ?? '',
  amount: c.amount ?? '',
  theme: c.theme ?? '',
  quote: c.quote ?? '',
  needsDetail: c.needsDetail,
  sessionId: c.sessionId ?? '',
});

/** The first thing stopping the form from saving, or null. */
export function formProblem(f: CallToActionForm): string | null {
  if (!f.action.trim()) return 'Say what should be done.';
  if (!f.directedAt.trim()) return 'Say who is called on to commit.';
  if (f.shortText.trim().length > 200) return 'Keep the slide line under 200 characters.';
  return null;
}

/** The form as the API's body: blanks become null so they clear. */
export function toBody(f: CallToActionForm) {
  const blank = (v: string) => v.trim() || null;
  return {
    type: f.type,
    action: f.action.trim(),
    shortText: (f.shortText.trim() || f.action.trim()).slice(0, 200),
    directedAt: f.directedAt.trim(),
    proposedBy: blank(f.proposedBy),
    proposedByOrganisation: blank(f.proposedByOrganisation),
    deadline: blank(f.deadline),
    amount: blank(f.amount),
    theme: blank(f.theme),
    quote: blank(f.quote),
    needsDetail: f.needsDetail,
  };
}

/** Those shown on a tab, also narrowed by session and target; merged ones only under "all". */
export function filterCalls(items: CallToAction[], tab: StatusTab, sessionId: string, directedAt: string): CallToAction[] {
  return items.filter(
    (c) =>
      (tab === 'all' ? true : c.status === tab) &&
      (sessionId === 'all' || c.sessionId === sessionId) &&
      (directedAt === 'all' || c.directedAt.toLowerCase() === directedAt.toLowerCase()),
  );
}

export function countByStatus(items: CallToAction[]): Record<StatusTab, number> {
  const out: Record<StatusTab, number> = { suggested: 0, approved: 0, rejected: 0, all: items.length };
  for (const c of items) if (c.status !== 'merged') out[c.status]++;
  return out;
}

/** "Dr Amina Bello (NBS) and 2 others": who asked for it, with those merged in. */
export function voices(c: Pick<CallToAction, 'proposedBy' | 'proposedByOrganisation' | 'alsoProposedBy'>): string | null {
  const first = c.proposedBy ? (c.proposedByOrganisation ? `${c.proposedBy} (${c.proposedByOrganisation})` : c.proposedBy) : null;
  const more = c.alsoProposedBy.length;
  if (!first) return more ? `${more} ${more === 1 ? 'speaker' : 'speakers'}` : null;
  return more ? `${first} and ${more} ${more === 1 ? 'other' : 'others'}` : first;
}

const cell = (v: string | number | boolean | null | undefined) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The approved list (or any list) as CSV, which Excel opens: one row per call to action. */
export function callsCsv(items: CallToAction[], sessionTitle: (id: string | null) => string): string {
  const header = ['Directed at', 'Call to action', 'Slide line', 'Type', 'Proposed by', 'Organisation', 'Also proposed by', 'By when', 'How much', 'Theme', 'Session', 'Quote', 'Said at', 'Status'];
  const rows = items.map((c) => [
    c.directedAt,
    c.action,
    c.shortText,
    TYPE_LABEL[c.type],
    c.proposedBy,
    c.proposedByOrganisation,
    c.alsoProposedBy.join('; '),
    c.deadline,
    c.amount,
    c.theme,
    sessionTitle(c.sessionId),
    c.quote,
    c.saidAt,
    STATUS_LABEL[c.status],
  ]);
  // a byte-order mark, so Excel reads ₦ and accents correctly
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
}

/* ------------------------------------------------------------- stakeholders */

export type StakeholderDelegate = { id: string; name: string; title: string | null; email: string; admitted: boolean };

export type StakeholderSpeaker = { id: string; name: string; role: string | null };

/** One of the event's organisations, as `GET /editions/:id/calls-to-action/stakeholders` groups it from its delegates and speakers. */
export type Stakeholder = {
  name: string;
  /** Every way its people wrote it ("NITDA", "National Information Technology Development Agency"). */
  spellings: string[];
  /** Checked-in first. */
  delegates: StakeholderDelegate[];
  /** Its people on the programme. */
  speakers: StakeholderSpeaker[];
  /** Recommendations aimed at it: what it is asked to commit to. */
  asks: string[];
  /** Pledges by or for it. */
  commitments: string[];
};

/**
 * A broad target ("Federal Government") tied to one of the event's organisations: suggested by the
 * AI, then confirmed or rejected by an organiser. Only confirmed links count.
 */
export type StakeholderLink = { id: string; target: string; organisation: string; status: 'suggested' | 'confirmed'; reason: string | null };

export type StakeholderMap = {
  /** Links waiting for review and confirmed ones (rejected ones are not sent). */
  links: StakeholderLink[];
  stakeholders: Stakeholder[];
  /** Each call's organisations at the event. */
  byCall: Record<string, string[]>;
  /** Recommendation targets matching no organisation here ("Federal Government"), with how many calls name each. */
  unmatched: { target: string; calls: number }[];
};

/** "3 delegates, 1 speaker": how many of an organisation's people are at the event; empty when none. */
export function peopleCount(s: Pick<Stakeholder, 'delegates' | 'speakers'>): string {
  const n = (k: number, one: string) => `${k} ${one}${k === 1 ? '' : 's'}`;
  return [s.delegates.length ? n(s.delegates.length, 'delegate') : null, s.speakers.length ? n(s.speakers.length, 'speaker') : null].filter(Boolean).join(', ');
}

/** "3 delegates, 1 speaker here · NITDA" for a call: who from its organisations is at the event, or null when nobody is. */
export function hereFor(map: StakeholderMap | undefined, callId: string): { orgs: string[]; people: string } | null {
  const orgs = map?.byCall[callId] ?? [];
  if (!orgs.length) return null;
  const mine = map!.stakeholders.filter((s) => orgs.includes(s.name));
  const people = peopleCount({ delegates: mine.flatMap((s) => s.delegates), speakers: mine.flatMap((s) => s.speakers) });
  return people ? { orgs, people } : null;
}

/** "NITDA" from "National Information Technology Development Agency (NITDA)"; a name with no abbreviation as it is. */
export function shortOrg(name: string): string {
  const abbr = name.match(/\(([A-Za-z][A-Za-z&.-]{1,11})\)\s*$/);
  return abbr ? abbr[1]! : name.trim();
}

/**
 * A call's organisations that have people at the event, as one line for a deck: "NITDA (3
 * delegates, 1 speaker); World Bank (1 delegate)", busiest first, two at most and then "and 2 more".
 * Never names anyone: decks are shown on screen. Null when none. (The API writes the same line for
 * reports.)
 */
export function presentLine(map: StakeholderMap | undefined, callId: string): string | null {
  const people = (s: Stakeholder) => s.delegates.length + s.speakers.length;
  const orgs = (map?.byCall[callId] ?? [])
    .map((name) => map!.stakeholders.find((s) => s.name === name))
    .filter((s): s is Stakeholder => !!s && people(s) > 0)
    .sort((a, b) => people(b) - people(a));
  if (!orgs.length) return null;
  const shown = orgs.slice(0, 2).map((s) => `${shortOrg(s.name)} (${peopleCount(s)})`);
  const more = orgs.length - shown.length;
  return `${shown.join('; ')}${more ? ` and ${more} more` : ''}`;
}

/** The asks an organisation has no commitment for yet, if it has made none: who to follow up. */
export const openAsks = (s: Stakeholder) => (s.commitments.length ? 0 : s.asks.length);
