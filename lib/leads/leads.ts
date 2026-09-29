/**
 * Exhibition lead capture. Organisers make each stand a private scanner link (Passport page); stand
 * staff open it on a phone, scan delegates' badges and note how keen each one is. The link carries
 * the stand's key after `#`, so it never reaches a server log; the page sends it as a header.
 */

export const LEAD_RATINGS = ['hot', 'warm', 'cold'] as const;
export type LeadRating = (typeof LEAD_RATINGS)[number];
export const RATING_LABEL: Record<LeadRating, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };

export type Lead = {
  id: string;
  boothId: string;
  name: string;
  title: string | null;
  organisation: string | null;
  email: string;
  country: string | null;
  tier: string;
  note: string | null;
  rating: LeadRating | null;
  createdAt: string;
  updatedAt: string;
};

export type ExhibitorView = {
  booth: { id: string; name: string; location: string | null };
  edition: { id: string; name: string; shortName: string };
  leads: Lead[];
};

export type ScanResult = { lead: Lead; isNew: boolean };

export type BoothLeadSummary = { boothId: string; leads: number; linkCreatedAt: string | null };

const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[A-Za-z0-9_-]{20,}$/i;

/** The stand key from a scanner link's `#…`, or null when there is none or it is mangled. */
export function keyFromHash(hash: string): string | null {
  const key = decodeURIComponent(hash.replace(/^#/, '')).trim();
  return KEY.test(key) || key === DEMO_KEY ? key : null;
}

/** The demo stand's key, so the demo build can show the scanner. */
export const DEMO_KEY = 'demo';

/** The link stand staff open on their phone. */
export const scannerLink = (origin: string, key: string) => `${origin}/exhibit#${key}`;

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Leads as a CSV, with the stand's name when exporting several stands at once. */
export function leadsCsv(leads: Lead[], boothName?: (boothId: string) => string): string {
  const head = [...(boothName ? ['Stand'] : []), 'Name', 'Job title', 'Organisation', 'Email', 'Country', 'Ticket', 'Interest', 'Note', 'Scanned at'];
  const rows = leads.map((l) =>
    [...(boothName ? [boothName(l.boothId)] : []), l.name, l.title ?? '', l.organisation ?? '', l.email, l.country ?? '', l.tier, l.rating ? RATING_LABEL[l.rating] : '', l.note ?? '', new Date(l.createdAt).toISOString().slice(0, 16).replace('T', ' ')]
      .map(csvCell)
      .join(','),
  );
  return [head.join(','), ...rows].join('\n');
}

/** Saves text as a CSV file (with a byte-order mark, so Excel reads the accents). */
export function downloadCsv(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/** Counts by interest, for the scanner's header. */
export function ratingCounts(leads: Lead[]): Record<LeadRating | 'unrated', number> {
  const counts = { hot: 0, warm: 0, cold: 0, unrated: 0 };
  for (const l of leads) counts[l.rating ?? 'unrated'] += 1;
  return counts;
}
