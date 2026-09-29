'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { TicketType, TierBody } from '@/lib/ticketing/ticketing';

const key = (editionId: string | undefined) => ['admin', 'ticket-types', editionId ?? 'none'] as const;

let demoTiers: TicketType[] = [
  { id: 't1', editionId: 'demo-gs27', name: 'Standard', price: 25000, prices: { NGN: 25000, USD: 40, GHS: 300 }, perks: ['All plenaries and parallel sessions', 'Lunch both days'], section: 'General', capacity: 2000, sold: 1640, isActive: true, sortOrder: 0 },
  { id: 't2', editionId: 'demo-gs27', name: 'VIP', price: 150000, prices: { NGN: 150000, USD: 200 }, perks: ['Front rows', 'Speakers’ dinner', 'Airport pickup'], section: 'VIP', capacity: 400, sold: 312, isActive: true, sortOrder: 1 },
  { id: 't3', editionId: 'demo-gs27', name: 'Student', price: 5000, prices: { NGN: 5000 }, perks: ['All sessions'], section: 'General', capacity: 200, sold: 148, isActive: true, sortOrder: 2 },
  { id: 't4', editionId: 'demo-gs27', name: 'Press', price: null, prices: {}, perks: ['Media room access'], section: 'Press', capacity: null, sold: 52, isActive: true, sortOrder: 3 },
];

/** The tiers, and whether they came from the on-sale-only list (so off-sale tiers are missing). */
export type TierList = { tiers: TicketType[]; onSaleOnly: boolean };

/**
 * Every tier of the edition, on sale or not, from the organiser route
 * `GET /editions/:id/ticket-types/all`. Until the API has that route (404), it falls back to the
 * public list, which only has tiers on sale, and says so with `onSaleOnly`.
 */
export function useTicketTypes(editionId: string | undefined) {
  return useQuery({
    queryKey: key(editionId),
    queryFn: async ({ signal }): Promise<TierList> => {
      if (DEMO_MODE) return { tiers: demoTiers, onSaleOnly: false };
      try {
        return { tiers: await api.get<TicketType[]>(`/editions/${editionId}/ticket-types/all`, undefined, signal), onSaleOnly: false };
      } catch (error) {
        if (!(error instanceof ApiError && error.status === 404)) throw error;
        return { tiers: await api.get<TicketType[]>(`/editions/${editionId}/ticket-types`, undefined, signal), onSaleOnly: true };
      }
    },
    enabled: !!editionId,
  });
}



/** Creates or edits a tier, then refreshes the list. */
export function useTierMutations(editionId: string | undefined) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: key(editionId) });

  const create = useMutation({
    mutationFn: (body: TierBody) => {
      if (!DEMO_MODE) return api.post<TicketType>(`/editions/${editionId}/ticket-types`, body);
      const tier: TicketType = { id: `demo-${Date.now()}`, editionId: editionId!, sold: 0, sortOrder: demoTiers.length, capacity: null, ...body, price: body.price ?? null, prices: { ...(body.price ? { NGN: body.price } : {}), ...body.prices } };
      demoTiers = [...demoTiers, tier];
      return Promise.resolve(tier);
    },
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TierBody }) => {
      if (!DEMO_MODE) return api.patch<TicketType>(`/ticket-types/${id}`, body);
      demoTiers = demoTiers.map((t) => (t.id === id ? { ...t, ...body, price: body.price ?? null, prices: { ...t.prices, ...body.prices } } : t));
      return Promise.resolve(demoTiers.find((t) => t.id === id)!);
    },
    onSuccess: refresh,
  });
  return { create, update };
}
