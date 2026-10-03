'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { AccessTier, Delegate } from '@/lib/delegates/delegates';
import { DEMO_MODE } from '@/lib/demo';

const LIST = ['admin', 'delegates'] as const;

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
/** Demo ticket tiers, as the demo Ticketing lists them (t1 Standard, t2 VIP, t4 Press). */
const DEMO_TIER: Record<string, [string, string]> = { standard: ['t1', 'Standard'], vip: ['t2', 'VIP'], vvip: ['t2', 'VIP'], press: ['t4', 'Press'] };
let demoDelegates: Delegate[] = [
  ['Amina Yusuf', 'amina@pic.org.ng', 'Policy Innovation Centre', 'Director', 'vip', [], false],
  ['Tunde Bakare', 'tunde@paystack.com', 'Paystack', 'CTO', 'standard', [], true],
  ['Grace Obi', 'grace@nbs.gov.ng', 'NBS', 'Researcher', 'standard', [], false],
  ['Kwame Mensah', 'kwame@afdb.org', 'AfDB', 'Economist', 'vvip', [], false],
  ['Sarah Kimani', 'sarah@unwomen.org', 'UN Women', null, 'press', [], true],
  ['Chinwe Okoro', 'chinwe@example.com', null, null, 'standard', ['ticket-holder'], false],
  ['Ibrahim Musa', 'ibrahim@example.com', 'LSE', 'Student', 'standard', [], true],
].map(([name, email, organisation, title, tier, tags, pending], i) => ({
  id: `demo-d${i}`,
  name: name as string,
  email: email as string,
  organisation: organisation as string | null,
  title: title as string | null,
  country: 'NG',
  accessTier: tier as AccessTier,
  tickets: [{ ticketId: `demo-ticket-${i}`, editionId: 'demo-gs27', ticketTypeId: DEMO_TIER[tier as string]![0], tierName: DEMO_TIER[tier as string]![1] }],
  tracks: i % 2 ? ['digital', 'economic'] : ['gbv'],
  interests: ['networking'],
  tags: tags as string[],
  pendingReview: pending as boolean,
  flagged: false,
  createdAt: days(i * 3),
  consentAt: days(i * 3),
}));

/**
 * Delegates matching a server-side search and, within an event, a ticket tier (the API filters those; it returns at most 500
 * and has no paging, so the page pages the result itself). Keeps the last list on screen while a
 * new search loads.
 */
export function useDelegates(filters: { search: string; ticketTypeId: string | 'all'; editionId?: string }, enabled = true) {
  // a ticket tier belongs to an event: without one it does not filter
  const ticketTypeId = filters.editionId && filters.ticketTypeId !== 'all' ? filters.ticketTypeId : undefined;
  return useQuery({
    queryKey: [...LIST, filters.search, ticketTypeId ?? 'all', filters.editionId ?? 'all'],
    enabled,
    queryFn: ({ signal }) => {
      if (DEMO_MODE) {
        const q = filters.search.toLowerCase();
        return Promise.resolve(
          demoDelegates.filter(
            (d) =>
              (!ticketTypeId || d.tickets?.some((t) => t.ticketTypeId === ticketTypeId)) &&
              (!q || [d.name, d.email, d.organisation].some((v) => v?.toLowerCase().includes(q))),
          ),
        );
      }
      return api.get<Delegate[]>('/delegates', { search: filters.search || undefined, ticketTypeId, editionId: filters.editionId }, signal);
    },
    placeholderData: keepPreviousData,
  });
}

/** Moving a ticket to another tier, approvals and "approve everyone"; each refreshes the list (they are audited server-side). */
export function useDelegateActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: LIST });
  const patchDemo = (id: string, change: Partial<Delegate>) => {
    demoDelegates = demoDelegates.map((d) => (d.id === id ? { ...d, ...change } : d));
  };

  /** Another tier of the ticket's event, from Ticketing; its QR keeps working. */
  const moveTicket = useMutation({
    mutationFn: ({ ticketId, ticketTypeId, tierName }: { ticketId: string; ticketTypeId: string; tierName: string }) => {
      if (!DEMO_MODE) return api.patch(`/tickets/${ticketId}/ticket-type`, { ticketTypeId });
      demoDelegates = demoDelegates.map((d) => ({ ...d, tickets: d.tickets?.map((t) => (t.ticketId === ticketId ? { ...t, ticketTypeId, tierName } : t)) }));
      return Promise.resolve();
    },
    onSuccess: refresh,
  });
  const setApproval = useMutation({
    mutationFn: ({ id, approved }: { id: string; approved: boolean }) =>
      DEMO_MODE ? Promise.resolve(patchDemo(id, { pendingReview: !approved })) : api.patch(`/delegates/${id}/approval`, { approved }),
    onSuccess: refresh,
  });
  const approveAll = useMutation({
    mutationFn: () => {
      if (!DEMO_MODE) return api.post<{ approved: number }>('/delegates/approve-all');
      const approved = demoDelegates.filter((d) => d.pendingReview).length;
      demoDelegates = demoDelegates.map((d) => ({ ...d, pendingReview: false }));
      return Promise.resolve({ approved });
    },
    onSuccess: refresh,
  });
  return { moveTicket, setApproval, approveAll };
}
