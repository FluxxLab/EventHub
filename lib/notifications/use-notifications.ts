'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { useRealtimeEvents } from '@/lib/api/realtime';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition } from '@/lib/events/events';
import type { SentNotification } from '@/lib/notifications/notifications';

const SENT = ['admin', 'notifications', 'sent'] as const;
const EDITIONS = ['admin', 'editions'] as const;

const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const sent = (id: string, over: Partial<SentNotification>): SentNotification => ({
  id,
  title: '',
  body: '',
  segment: 'all',
  delegateId: null,
  category: 'announcement',
  sessionId: null,
  linkUrl: null,
  sentAt: ago(5),
  createdAt: ago(5),
  ...over,
});
let demoSent: SentNotification[] = [
  sent('n1', { title: 'Digital IDs and the last mile', body: 'Now live in Hall A', category: 'session-live', sessionId: 'd2', sentAt: ago(12) }),
  sent('n2', { title: 'Lunch is served', body: 'On the garden terrace until 2pm. Vegetarian options at the far table.', sentAt: ago(48) }),
  sent('n3', { title: 'Press briefing moved', body: 'The press briefing is now at 3:30pm in the Media Room.', segment: 'press', sentAt: ago(95) }),
  sent('n4', { title: 'How was the opening plenary?', body: 'Two taps to tell us.', category: 'session-feedback', sessionId: 'd1', sentAt: ago(130) }),
];

/**
 * Everything sent (the API gives organisers every segment and the automatic pushes), newest first.
 * Refetched the moment the API says one was sent or deleted (it sends only the id); the 30 s poll
 * covers a dropped connection.
 */
export function useSentNotifications() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: SENT });
  useRealtimeEvents({ 'notification:sent': refresh, 'notification:deleted': refresh });
  return useQuery({
    queryKey: SENT,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoSent) : api.get<SentNotification[]>('/notifications', undefined, signal)),
    refetchInterval: 30_000,
  });
}

/** `editionId` sends to that event's delegates only; left out, everyone in the segment. */
export type AnnouncementBody = { segment: string; title: string; body: string; category: string; sessionId?: string; linkUrl?: string; editionId?: string; /** Also to delegates who opted in to WhatsApp. */ whatsapp?: boolean };

/** Send an announcement (queued at once; delivery runs in the background), or retract one. */
export function useNotificationActions() {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: SENT });

  const send = useMutation({
    mutationFn: (body: AnnouncementBody): Promise<SentNotification> => {
      if (!DEMO_MODE) return api.post<SentNotification>('/notifications', body);
      const created = sent(`n-${Date.now()}`, { ...(body as Partial<SentNotification>), sentAt: new Date().toISOString() });
      demoSent = [created, ...demoSent];
      return Promise.resolve(created);
    },
    // Delivery is queued, so the row gets its sentAt a moment later: look again shortly.
    onSuccess: () => {
      refresh();
      setTimeout(refresh, 4_000);
    },
  });

  const retract = useMutation({
    mutationFn: ({ id }: { id: string }) => {
      if (!DEMO_MODE) return api.delete(`/notifications/${id}`);
      demoSent = demoSent.filter((n) => n.id !== id);
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  return { send, retract };
}

/** Switches automatic pushes on or off for an edition (the full muted list replaces the old one). */
export function useMutedNotifications(editionId: string | undefined) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (muted: string[]) =>
      DEMO_MODE ? Promise.resolve({ id: editionId, mutedNotifications: muted } as Edition) : api.patch<Edition>(`/editions/${editionId}`, { mutedNotifications: muted }),
    onMutate: (muted) => {
      const before = client.getQueryData<Edition[]>(EDITIONS);
      client.setQueryData<Edition[]>(EDITIONS, (was) => was?.map((e) => (e.id === editionId ? { ...e, mutedNotifications: muted } : e)));
      return { before };
    },
    onError: (_error: Error, _muted, context) => context?.before && client.setQueryData(EDITIONS, context.before),
  });
}

/**
 * How many delegates in this audience would also get the announcement on WhatsApp (opted in, with
 * a phone), and whether WhatsApp is connected on the server (`live`); without it messages are only
 * logged.
 */
export function useWhatsAppReach(segment: string, editionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'notifications', 'whatsapp-reach', segment, editionId ?? 'all'] as const,
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve({ recipients: 128, live: false }) : api.get<{ recipients: number; live: boolean }>('/notifications/whatsapp-reach', { segment, editionId }, signal),
    enabled,
    staleTime: 30_000,
  });
}
