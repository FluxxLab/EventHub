'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { LeadHour, LeadsReport } from '@/lib/leads/report';

/* Demo: a two-day exhibition with a lunchtime rush. */
function demoHours(scale: number, seed: number): LeadHour[] {
  const shape = [2, 5, 8, 6, 11, 9, 4, 6, 3];
  return ['2027-09-07', '2027-09-08'].flatMap((day, d) =>
    shape.map((v, i) => ({ day, hour: 9 + i, leads: Math.max(0, Math.round(v * scale * (d ? 0.7 : 1) + ((seed * (i + 3)) % 3) - 1)) })).filter((h) => h.leads > 0),
  );
}
const stand = (boothId: string, name: string, location: string, scale: number, seed: number, stamps: number) => {
  const byHour = demoHours(scale, seed);
  const leads = byHour.reduce((n, h) => n + h.leads, 0);
  return { boothId, name, location, isActive: true, stamps, leads, hot: Math.round(leads * 0.22), warm: Math.round(leads * 0.41), cold: Math.round(leads * 0.14), withNotes: Math.round(leads * 0.3), byHour };
};
const DEMO: Omit<LeadsReport, 'editionId'> = {
  ticketHolders: 2152,
  delegatesScanned: 431,
  stands: [
    stand('b4', 'Policy Innovation Centre', 'Exhibition hall, stand 1', 1.6, 2, 211),
    stand('b1', 'UN Women Nigeria', 'Exhibition hall, stand 3', 1.2, 1, 168),
    stand('b2', 'Women in Tech Africa', 'Exhibition hall, stand 7', 0.8, 3, 142),
    stand('b3', 'NIMC enrolment desk', 'Foyer', 0.4, 5, 96),
    { boothId: 'b5', name: 'Sponsor lounge', location: 'Level 1', isActive: false, stamps: 39, leads: 0, hot: 0, warm: 0, cold: 0, withNotes: 0, byHour: [] },
  ].sort((a, b) => b.leads - a.leads),
};

/** The exhibition in numbers; refreshed each minute while the hall is open. */
export function useLeadsReport(editionId: string) {
  return useQuery({
    queryKey: ['admin', 'leads-report', editionId],
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve({ editionId, ...DEMO }) : api.get<LeadsReport>(`/editions/${editionId}/leads/report`, undefined, signal)),
    refetchInterval: 60_000,
  });
}
