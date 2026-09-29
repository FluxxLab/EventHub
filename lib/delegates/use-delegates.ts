'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { Delegate, DelegateTier } from '@/lib/delegates/delegates';
import { DEMO_MODE } from '@/lib/demo';

const LIST = ['admin', 'delegates'] as const;

const days = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
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
  accessTier: tier as DelegateTier,
  tracks: i % 2 ? ['digital', 'economic'] : ['gbv'],
  interests: ['networking'],
  tags: tags as string[],
  pendingReview: pending as boolean,
  flagged: false,
  createdAt: days(i * 3),
  consentAt: days(i * 3),
}));

/**
 * Delegates matching a server-side search and tier (the API filters those; it returns at most 500
 * and has no paging, so the page pages the result itself). Keeps the last list on screen while a
 * new search loads.
 */
export function useDelegates(filters: { search: string; tier: DelegateTier | 'all'; editionId?: string }, enabled = true) {
  return useQuery({
    queryKey: [...LIST, filters.search, filters.tier, filters.editionId ?? 'all'],
    enabled,
    queryFn: ({ signal }) => {
      if (DEMO_MODE) {
        const q = filters.search.toLowerCase();
        return Promise.resolve(
          demoDelegates.filter(
            (d) =>
              (filters.tier === 'all' || d.accessTier === filters.tier) &&
              (!q || [d.name, d.email, d.organisation].some((v) => v?.toLowerCase().includes(q))),
          ),
        );
      }
      return api.get<Delegate[]>('/delegates', { search: filters.search || undefined, tier: filters.tier === 'all' ? undefined : filters.tier, editionId: filters.editionId }, signal);
    },
    placeholderData: keepPreviousData,
  });
}

/** Tier changes, approvals and "approve everyone"; each refreshes the list (they are audited server-side). */
export function useDelegateActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: LIST });
  const patchDemo = (id: string, change: Partial<Delegate>) => {
    demoDelegates = demoDelegates.map((d) => (d.id === id ? { ...d, ...change } : d));
  };

  const setTier = useMutation({
    // Changing a tier also approves the delegate (the API clears pendingReview).
    mutationFn: ({ id, tier }: { id: string; tier: DelegateTier }) =>
      DEMO_MODE ? Promise.resolve(patchDemo(id, { accessTier: tier, pendingReview: false })) : api.patch(`/delegates/${id}/tier`, { tier }),
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
  return { setTier, setApproval, approveAll };
}
