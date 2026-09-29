'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEFAULT_DESIGN, type BadgeDesign, type BadgeHolder } from '@/lib/badges/badges';
import { DEMO_MODE } from '@/lib/demo';
import { uploadFile } from '@/lib/uploads';

const designKey = (editionId: string) => ['admin', 'badge-design', editionId] as const;
const holdersKey = (editionId: string) => ['admin', 'badges', editionId] as const;

const demoDesigns = new Map<string, BadgeDesign & { artworkUrl: string | null }>();

const DEMO_PEOPLE: [string, string | null, string | null, string, string, string][] = [
  ['Ngozi Eze', 'Programme Director', 'Women in Policy Africa', 'Nigeria', 'VIP', 't2'],
  ['Amina Yusuf', 'Director, Gender Affairs', 'Policy Innovation Centre', 'Nigeria', 'VIP', 't2'],
  ['Kwame Mensah', 'Research Fellow', 'University of Ghana', 'Ghana', 'Standard', 't1'],
  ['Chiamaka Obi', 'Reporter', 'Channels Television', 'Nigeria', 'Press', 't4'],
  ['Tunde Bakare', null, 'Lagos Business School', 'Nigeria', 'Standard', 't1'],
  ['Fatima Bello', 'Student', 'Ahmadu Bello University', 'Nigeria', 'Student', 't3'],
  ['Grace Wanjiru Kamau-Otieno', 'Head of Partnerships and Stakeholder Engagement', 'African Development Bank Group', 'Kenya', 'Standard', 't1'],
  ['Emeka Nwosu', 'Founder', 'Kora Health', 'Nigeria', 'Standard', 't1'],
];

export const demoHolders = (): BadgeHolder[] =>
  DEMO_PEOPLE.map(([name, title, organisation, country, tierName, ticketTypeId], i) => {
    const ticketId = `demo-ticket-${i + 1}`;
    return {
      ticketId,
      code: `PIC-${tierName.slice(0, 3).toUpperCase()}-${(4817 + i * 373).toString(36).toUpperCase()}`,
      name,
      title,
      organisation,
      country,
      photo: null,
      tierName,
      ticketTypeId,
      section: tierName === 'VIP' ? 'VIP' : 'General',
      quantity: 1,
      qr: `PICT1.${ticketId}.demo-signature-only`,
      admitted: i % 3 === 0 ? 1 : 0,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

/** The event's badge design; the default until one is saved. `saved` says which. */
type DesignView = BadgeDesign & { artworkUrl: string | null };
export type StoredDesign = { design: BadgeDesign; artworkUrl: string | null; saved: boolean };

/** What the API answers, as the console keeps it; designs saved before artwork have neither field. */
const stored = (view: DesignView | null): StoredDesign => {
  if (!view) return { design: DEFAULT_DESIGN, artworkUrl: null, saved: false };
  const { artworkUrl, ...design } = view;
  return { design: { ...DEFAULT_DESIGN, ...design, artwork: design.artwork ?? null, layout: design.layout ?? null }, artworkUrl, saved: true };
};

/** The event's badge design, with a short-lived link to its artwork; the default until one is saved. */
export function useBadgeDesign(editionId: string) {
  return useQuery({
    queryKey: designKey(editionId),
    queryFn: async ({ signal }) => stored(DEMO_MODE ? (demoDesigns.get(editionId) ?? null) : await api.get<DesignView | null>(`/editions/${editionId}/badge-design`, undefined, signal)),
    // the artwork link is signed for 45 minutes
    refetchInterval: 30 * 60_000,
  });
}

export function useSaveBadgeDesign(editionId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ design, artworkUrl }: { design: BadgeDesign; artworkUrl: string | null }) => {
      if (DEMO_MODE) {
        const view = { ...design, artworkUrl: design.artwork ? artworkUrl : null };
        demoDesigns.set(editionId, view);
        return view;
      }
      return api.put<DesignView>(`/editions/${editionId}/badge-design`, design);
    },
    onSuccess: (view) => client.setQueryData(designKey(editionId), stored(view)),
  });
}

/**
 * Uploads artwork (PNG or JPG) and answers its storage key, to save with the design, and a local
 * link to show and print it until the design is saved and read back.
 */
export async function uploadBadgeArtwork(editionId: string, file: File, onProgress: (fraction: number) => void): Promise<{ key: string; url: string }> {
  const key = await uploadFile(file, { presignPath: `/editions/${editionId}/badge-design/upload-url`, contentType: file.type }, onProgress);
  return { key: DEMO_MODE ? `badges/${crypto.randomUUID()}` : key, url: URL.createObjectURL(file) };
}

/** Every ticket holder of the event, with the door QR. Staff-only; each fetch is audited. */
export function useBadgeHolders(editionId: string) {
  return useQuery({
    queryKey: holdersKey(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoHolders()) : api.get<BadgeHolder[]>(`/editions/${editionId}/badges`, undefined, signal)),
    staleTime: 60_000,
    // photo links are signed for 45 minutes: a page left open all day still prints them
    refetchInterval: 30 * 60_000,
  });
}
