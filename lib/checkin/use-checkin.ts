'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { demoHolders } from '@/lib/badges/use-badges';
import type { AdmitResult, GateSummary, TicketMatch } from '@/lib/checkin/checkin';
import { DEMO_MODE } from '@/lib/demo';

const summaryKey = (editionId: string) => ['admin', 'admissions', editionId] as const;

/* Demo: the badge demo's holders are the tickets; admissions are kept in memory. */
const demoAdmitted = new Map<string, string[]>();

function demoAdmit(qr: string, editionId: string): AdmitResult {
  const holder = demoHolders().find((h) => h.qr === qr.trim());
  if (!holder) throw new ApiError(404, 'This QR is not a valid PIC Events ticket', null);
  const times = demoAdmitted.get(holder.ticketId) ?? (holder.admitted ? [new Date(Date.now() - 42 * 60_000).toISOString()] : []);
  const status = times.length >= holder.quantity ? 'already_used' : 'admitted';
  if (status === 'admitted') times.push(new Date().toISOString());
  demoAdmitted.set(holder.ticketId, times);
  return {
    status,
    ticket: { id: holder.ticketId, code: holder.code, tierName: holder.tierName, ticketTypeId: holder.ticketTypeId, quantity: holder.quantity, guestName: holder.name, edition: { id: editionId, name: 'GS-27' }, qr: holder.qr },
    holder: { name: holder.name, title: holder.title, organisation: holder.organisation, country: holder.country, photo: holder.photo },
    admitted: times.length,
    remaining: Math.max(0, holder.quantity - times.length),
    firstAdmittedAt: times[0] ?? null,
    lastAdmittedAt: times[times.length - 1] ?? null,
  };
}

/** How many are through the gate. Refreshes every half minute, as other desks admit people too. */
export function useGateSummary(editionId: string) {
  return useQuery({
    queryKey: summaryKey(editionId),
    queryFn: ({ signal }): Promise<GateSummary> => {
      if (!DEMO_MODE) return api.get<GateSummary>(`/editions/${editionId}/admissions`, undefined, signal);
      const extra = [...demoAdmitted.values()].reduce((n, t) => n + t.length, 0);
      return Promise.resolve({ editionId, tickets: 2152, places: 2152, admitted: 412 + extra, ticketsUsed: 412 + extra });
    },
    refetchInterval: 30_000,
  });
}

/** Admits one person on a ticket's payload, scanned or picked from a search. */
export function useAdmit(editionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (qr: string): Promise<AdmitResult> => (DEMO_MODE ? Promise.resolve().then(() => demoAdmit(qr, editionId)) : api.post<AdmitResult>('/tickets/admit', { qr: qr.trim(), editionId })),
    onSuccess: () => void client.invalidateQueries({ queryKey: summaryKey(editionId) }),
  });
}

/** Tickets by what someone says at the desk: their ticket code, email or name. */
export function useFindTicket(editionId: string) {
  return useMutation({
    mutationFn: (query: string): Promise<TicketMatch[]> => {
      if (!DEMO_MODE) return api.post<TicketMatch[]>('/tickets/find', { editionId, query: query.trim() });
      const q = query.trim().toLowerCase();
      return Promise.resolve(
        demoHolders()
          .filter((h) => h.code.toLowerCase() === q || h.name.toLowerCase().includes(q))
          .map((h) => ({
            ticketId: h.ticketId,
            code: h.code,
            name: h.name,
            email: `${h.name.split(' ')[0]!.toLowerCase()}@example.com`,
            organisation: h.organisation,
            tierName: h.tierName,
            quantity: h.quantity,
            admitted: (demoAdmitted.get(h.ticketId) ?? []).length || h.admitted,
            qr: h.qr,
          })),
      );
    },
  });
}
