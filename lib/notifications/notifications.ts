import { z } from 'zod';

/** Who an announcement goes to (the API's AudienceSegment). */
export const SEGMENTS = ['all', 'vip', 'press', 'speakers', 'volunteers'] as const;
export type Segment = (typeof SEGMENTS)[number];

export const SEGMENT_LABEL: Record<Segment, string> = {
  all: 'Everyone',
  vip: 'VIP and VVIP',
  press: 'Press',
  speakers: 'Speakers',
  volunteers: 'Volunteers',
};

/** `GET /notifications` as an organiser sees it: everything sent, automatic pushes included. */
export type SentNotification = {
  /** Also sent on WhatsApp to delegates who opted in. */
  whatsapp?: boolean;
  /** Null: everyone in the segment; set: that event's delegates only. */
  editionId?: string | null;
  id: string;
  title: string;
  body: string;
  segment: Segment;
  delegateId: string | null;
  category: string | null;
  sessionId: string | null;
  linkUrl: string | null;
  sentAt: string | null;
  createdAt: string;
};

/** Categories the API sends on its own, named as an organiser would say them. */
export const CATEGORY_LABEL: Record<string, string> = {
  announcement: 'Announcement',
  'session-created': 'New session',
  'session-updated': 'Session changed',
  'session-live': 'Session live',
  'session-reminder': 'Reminder',
  'session-feedback': 'Feedback prompt',
  network: 'Networking',
};
export const categoryLabel = (category: string | null) => (category ? (CATEGORY_LABEL[category] ?? category) : 'Announcement');
/** Only announcements an organiser wrote can sensibly be retracted from the console. */
export const isAnnouncement = (n: Pick<SentNotification, 'category' | 'delegateId'>) => !n.delegateId && (n.category ?? 'announcement') === 'announcement';

/** The pushes the API sends by itself, which an organiser can switch off for an event. */
export const AUTOMATIC = [
  { key: 'session-live', label: 'A session goes live', hint: 'To everyone, the moment it starts.' },
  { key: 'session-reminder', label: 'A saved session is about to start', hint: '15 minutes before, to delegates who bookmarked it.' },
  { key: 'session-feedback', label: 'Ask for feedback', hint: '“How was it?” to attendees when a session ends.' },
  { key: 'session-updated', label: 'A session changes', hint: 'When its time or room moves.' },
  { key: 'session-created', label: 'A session is added', hint: 'When a new session is published.' },
] as const;
export type AutomaticKind = (typeof AUTOMATIC)[number]['key'];

/** Lock screens cut titles and bodies around these lengths; past them the text still sends, but is trimmed on phones. */
export const TITLE_VISIBLE = 50;
export const BODY_VISIBLE = 150;

export const TARGETS = ['none', 'session', 'link'] as const;
export type Target = (typeof TARGETS)[number];

export const announcementSchema = z
  .object({
    segment: z.enum(SEGMENTS),
    title: z.string().trim().min(1, 'Give it a title.').max(255, 'Keep the title under 255 characters.'),
    body: z.string().trim().min(1, 'Write the message.').max(1000, 'Keep the message under 1,000 characters.'),
    target: z.enum(TARGETS),
    sessionId: z.string(),
    linkUrl: z.string().trim(),
  })
  .superRefine((form, ctx) => {
    if (form.target === 'session' && !form.sessionId) ctx.addIssue({ code: 'custom', path: ['sessionId'], message: 'Pick the session it opens.' });
    if (form.target === 'link') {
      if (!/^https?:\/\/[^\s.]+\.[^\s]+$/i.test(form.linkUrl)) ctx.addIssue({ code: 'custom', path: ['linkUrl'], message: 'Enter a full web address, starting with https://' });
      else if (form.linkUrl.length > 500) ctx.addIssue({ code: 'custom', path: ['linkUrl'], message: 'Keep the address under 500 characters.' });
    }
  });
export type AnnouncementForm = z.input<typeof announcementSchema>;

export const emptyAnnouncement = (): AnnouncementForm => ({ segment: 'all', title: '', body: '', target: 'none', sessionId: '', linkUrl: '' });

/** `POST /notifications`: only the target that was chosen is sent. */
export function toAnnouncementBody(form: z.output<typeof announcementSchema>) {
  return {
    segment: form.segment,
    title: form.title,
    body: form.body,
    category: 'announcement',
    ...(form.target === 'session' ? { sessionId: form.sessionId } : {}),
    ...(form.target === 'link' ? { linkUrl: form.linkUrl } : {}),
  };
}

/** Flips one automatic push on or off in an edition's muted list. */
export function toggleMuted(muted: string[], kind: AutomaticKind, on: boolean): string[] {
  const without = muted.filter((k) => k !== kind);
  return on ? without : [...without, kind];
}
