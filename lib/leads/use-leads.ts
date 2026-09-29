'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { demoHolders } from '@/lib/badges/use-badges';
import { DEMO_MODE } from '@/lib/demo';
import type { BoothLeadSummary, ExhibitorView, Lead, LeadRating, ScanResult } from '@/lib/leads/leads';

/* ------------------------------------------------------------------ demo */

const now = () => new Date().toISOString();
let demoLeads: Lead[] = demoHolders()
  .slice(0, 3)
  .map((h, i) => ({
    id: `demo-lead-${i}`,
    boothId: 'demo-booth',
    name: h.name,
    title: h.title,
    organisation: h.organisation,
    email: `${h.name.split(' ')[0]!.toLowerCase()}@example.com`,
    country: h.country,
    tier: h.tierName,
    note: i === 0 ? 'Wants a demo after the summit' : null,
    rating: (['hot', 'warm', null] as const)[i]!,
    createdAt: new Date(Date.now() - (i + 1) * 23 * 60_000).toISOString(),
    updatedAt: now(),
  }));
const demoLinks = new Map<string, string>();

/* ------------------------------------------------------------ organisers */

const summaryKey = (editionId: string) => ['admin', 'lead-summary', editionId] as const;

/** Leads per stand, and which stands have a scanner link out. */
export function useLeadSummary(editionId: string) {
  return useQuery({
    queryKey: summaryKey(editionId),
    queryFn: ({ signal }): Promise<BoothLeadSummary[]> => {
      if (!DEMO_MODE) return api.get<BoothLeadSummary[]>(`/editions/${editionId}/leads/summary`, undefined, signal);
      return Promise.resolve([...demoLinks].map(([boothId, at]) => ({ boothId, leads: boothId === 'b1' ? demoLeads.length : 0, linkCreatedAt: at })));
    },
    refetchInterval: 60_000,
  });
}

export function useLeadLinkActions(editionId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: summaryKey(editionId) });
  const issue = useMutation({
    mutationFn: (boothId: string): Promise<{ key: string }> => {
      if (!DEMO_MODE) return api.post<{ key: string }>(`/booths/${boothId}/lead-link`);
      demoLinks.set(boothId, now());
      return Promise.resolve({ key: 'demo' });
    },
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: async (boothId: string) => {
      if (DEMO_MODE) demoLinks.delete(boothId);
      else await api.delete(`/booths/${boothId}/lead-link`);
    },
    onSuccess: refresh,
  });
  /** Every stand's leads, fetched when exporting (the fetch is recorded in the security log). */
  const exportAll = useMutation({
    mutationFn: (): Promise<Lead[]> => (DEMO_MODE ? Promise.resolve(demoLeads.map((l) => ({ ...l, boothId: 'b1' }))) : api.get<Lead[]>(`/editions/${editionId}/leads`)),
  });
  return { issue, revoke, exportAll };
}

/* ------------------------------------------------------------- exhibitors */

const exhibitorKey = (key: string) => ['exhibitor', key] as const;

/** The stand, its event and its leads, for the key in the scanner link. */
export function useExhibitor(key: string) {
  return useQuery({
    queryKey: exhibitorKey(key),
    queryFn: (): Promise<ExhibitorView> =>
      DEMO_MODE
        ? Promise.resolve({ booth: { id: 'demo-booth', name: 'Kora Health', location: 'Hall B, stand 14' }, edition: { id: 'demo-gs27', name: 'GS-27 Gender & Inclusion Summit', shortName: 'GS-27' }, leads: demoLeads })
        : api.booth<ExhibitorView>(key, '/exhibitor'),
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });
}

export function useExhibitorActions(key: string) {
  const client = useQueryClient();
  const put = (leads: (list: Lead[]) => Lead[]) => client.setQueryData<ExhibitorView>(exhibitorKey(key), (v) => (v ? { ...v, leads: leads(v.leads) } : v));

  const scan = useMutation({
    mutationFn: (qr: string): Promise<ScanResult> => {
      if (!DEMO_MODE) return api.booth<ScanResult>(key, '/exhibitor/scan', 'POST', { qr: qr.trim() });
      const h = demoHolders().find((x) => x.qr === qr.trim());
      if (!h) return Promise.reject(new ApiError(404, 'That is not a PIC Events badge. Scan the QR on the badge or on the ticket in the app.'));
      const found = demoLeads.find((l) => l.name === h.name);
      if (found) return Promise.resolve({ lead: found, isNew: false });
      const lead: Lead = { id: `demo-lead-${Date.now()}`, boothId: 'demo-booth', name: h.name, title: h.title, organisation: h.organisation, email: `${h.name.split(' ')[0]!.toLowerCase()}@example.com`, country: h.country, tier: h.tierName, note: null, rating: null, createdAt: now(), updatedAt: now() };
      demoLeads = [lead, ...demoLeads];
      return Promise.resolve({ lead, isNew: true });
    },
    onSuccess: ({ lead, isNew }) => put((list) => (isNew ? [lead, ...list] : list.map((l) => (l.id === lead.id ? lead : l)))),
  });

  const update = useMutation({
    mutationFn: ({ id, ...change }: { id: string; note?: string | null; rating?: LeadRating | null }): Promise<Lead> => {
      if (!DEMO_MODE) return api.booth<Lead>(key, `/exhibitor/leads/${id}`, 'PATCH', change);
      demoLeads = demoLeads.map((l) => (l.id === id ? { ...l, ...change, updatedAt: now() } : l));
      return Promise.resolve(demoLeads.find((l) => l.id === id)!);
    },
    onSuccess: (lead) => put((list) => list.map((l) => (l.id === lead.id ? lead : l))),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) demoLeads = demoLeads.filter((l) => l.id !== id);
      else await api.booth(key, `/exhibitor/leads/${id}`, 'DELETE');
      return id;
    },
    onSuccess: (id) => put((list) => list.filter((l) => l.id !== id)),
  });

  return { scan, update, remove };
}
