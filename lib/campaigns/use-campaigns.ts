'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import type { Audience, Campaign, CampaignDraft } from '@/lib/campaigns/campaigns';
import { DEMO_MODE } from '@/lib/demo';

const listKey = (editionId: string) => ['admin', 'campaigns', editionId] as const;

/* Demo: a sent campaign, one on its way, and a draft; sending counts up. */
const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
let demoList: Campaign[] = [
  {
    id: 'demo-c1',
    editionId: 'demo-gs27',
    subject: 'Your ticket to {{event}} is confirmed',
    body: 'Dear {{first_name}},\n\nThank you for registering for {{event}}. Your ticket code is {{ticket_code}}.\n\nBring the QR in the PIC Events app to the entrance, and your badge will be printed at the desk.',
    buttonLabel: 'See the programme',
    buttonUrl: 'https://policycentre.org/gs27/programme',
    audience: { kind: 'all', ticketTypeIds: [] },
    status: 'sent',
    recipients: 1412,
    sent: 1409,
    failed: 3,
    opened: 612,
    clicked: 187,
    tracked: true,
    createdAt: iso(12),
    updatedAt: iso(12),
    queuedAt: iso(12),
    finishedAt: iso(12),
  },
  {
    id: 'demo-c2',
    editionId: 'demo-gs27',
    subject: 'VIP dinner: your invitation',
    body: 'Dear {{first_name}},\n\nAs a {{tier}} guest you are invited to the speakers’ dinner on the first evening.',
    buttonLabel: null,
    buttonUrl: null,
    audience: { kind: 'all', ticketTypeIds: ['t2'] },
    status: 'draft',
    recipients: 0,
    sent: 0,
    failed: 0,
    opened: 0,
    clicked: 0,
    tracked: false,
    createdAt: iso(1),
    updatedAt: iso(1),
    queuedAt: null,
    finishedAt: null,
  },
];
const DEMO_TIER_SIZE: Record<string, number> = { t1: 1640, t2: 312, t3: 148, t4: 52 };
function demoSize(a: Audience): number {
  const base = a.ticketTypeIds.length ? a.ticketTypeIds.reduce((n, id) => n + (DEMO_TIER_SIZE[id] ?? 0), 0) : 2152;
  return a.kind === 'all' ? base : Math.round(base * (a.kind === 'checked_in' ? 0.19 : 0.81));
}
function demoTick() {
  demoList = demoList.map((c) => {
    if (c.status !== 'sending') return c;
    const sent = Math.min(c.recipients, c.sent + Math.ceil(c.recipients / 6));
    return sent >= c.recipients ? { ...c, sent, status: 'sent', finishedAt: new Date().toISOString() } : { ...c, sent };
  });
}

/** The event's campaigns, newest first; refreshed every few seconds while one is sending. */
export function useCampaigns(editionId: string) {
  return useQuery({
    queryKey: listKey(editionId),
    queryFn: ({ signal }) => {
      if (!DEMO_MODE) return api.get<Campaign[]>(`/editions/${editionId}/campaigns`, undefined, signal);
      demoTick();
      return Promise.resolve(demoList.map((c) => ({ ...c, editionId })));
    },
    refetchInterval: (query) => (query.state.data?.some((c) => c.status === 'sending') ? 3000 : false),
  });
}

/** A sent campaign's links, most clicked first. */
export function useCampaignLinks(campaign: Pick<Campaign, 'id' | 'status' | 'tracked'>) {
  return useQuery({
    queryKey: ['admin', 'campaign-links', campaign.id],
    queryFn: ({ signal }): Promise<{ url: string; clicks: number }[]> =>
      DEMO_MODE
        ? Promise.resolve(campaign.id === 'demo-c1' ? [{ url: 'https://policycentre.org/gs27/programme', clicks: 164 }, { url: 'https://policycentre.org/gs27/venue', clicks: 41 }] : [])
        : api.get<{ url: string; clicks: number }[]>(`/campaigns/${campaign.id}/links`, undefined, signal),
    enabled: campaign.tracked && campaign.status !== 'draft',
    refetchInterval: 60_000,
  });
}

/** How many an audience reaches, once the choice has settled for a moment. */
export function useAudienceSize(editionId: string, audience: Audience) {
  const [settled, setSettled] = useState(audience);
  const key = JSON.stringify(audience);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(JSON.parse(key) as Audience), 300);
    return () => clearTimeout(timer);
  }, [key]);
  return useQuery({
    queryKey: ['admin', 'campaign-audience', editionId, JSON.stringify(settled)],
    queryFn: () =>
      DEMO_MODE
        ? Promise.resolve({ count: demoSize(settled), unsubscribed: Math.round(demoSize(settled) * 0.01) })
        : api.post<{ count: number; unsubscribed: number }>(`/editions/${editionId}/campaigns/audience-size`, { audience: settled }),
    placeholderData: keepPreviousData,
  });
}

const body = (d: CampaignDraft) => ({ ...d, buttonLabel: d.buttonLabel?.trim() || null, buttonUrl: d.buttonUrl?.trim() || null });

export function useCampaignActions(editionId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: listKey(editionId) });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: CampaignDraft }): Promise<Campaign> => {
      if (DEMO_MODE) {
        const now = new Date().toISOString();
        if (id) {
          demoList = demoList.map((c) => (c.id === id ? { ...c, ...body(draft), updatedAt: now } : c));
          return demoList.find((c) => c.id === id)!;
        }
        const created: Campaign = { id: `demo-${Date.now()}`, editionId, ...body(draft), status: 'draft', recipients: 0, sent: 0, failed: 0, opened: 0, clicked: 0, tracked: false, createdAt: now, updatedAt: now, queuedAt: null, finishedAt: null };
        demoList = [created, ...demoList];
        return created;
      }
      return id ? api.patch<Campaign>(`/campaigns/${id}`, body(draft)) : api.post<Campaign>(`/editions/${editionId}/campaigns`, body(draft));
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (DEMO_MODE) demoList = demoList.filter((c) => c.id !== id);
      else await api.delete(`/campaigns/${id}`);
    },
    onSuccess: refresh,
  });

  const test = useMutation({
    mutationFn: (id: string): Promise<{ to: string }> => (DEMO_MODE ? new Promise((r) => setTimeout(() => r({ to: 'you@policycentre.org' }), 500)) : api.post<{ to: string }>(`/campaigns/${id}/test`)),
  });

  const send = useMutation({
    mutationFn: async (id: string): Promise<Campaign> => {
      if (DEMO_MODE) {
        demoList = demoList.map((c) => (c.id === id ? { ...c, status: 'sending', recipients: demoSize(c.audience), sent: 0, tracked: true, queuedAt: new Date().toISOString() } : c));
        return demoList.find((c) => c.id === id)!;
      }
      return api.post<Campaign>(`/campaigns/${id}/send`);
    },
    onSuccess: refresh,
  });

  return { save, remove, test, send };
}
