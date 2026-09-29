import { describe, expect, it } from 'vitest';

import { announcementSchema, categoryLabel, emptyAnnouncement, isAnnouncement, toAnnouncementBody, toggleMuted } from '@/lib/notifications/notifications';

describe('announcementSchema', () => {
  const base = { ...emptyAnnouncement(), title: ' Lunch is served ', body: 'Garden terrace, until 2pm.' };

  it('trims and sends only the chosen target', () => {
    const parsed = announcementSchema.parse(base);
    expect(toAnnouncementBody(parsed)).toEqual({ segment: 'all', title: 'Lunch is served', body: 'Garden terrace, until 2pm.', category: 'announcement' });
    const withSession = announcementSchema.parse({ ...base, target: 'session', sessionId: 's1', linkUrl: 'https://ignored.org' });
    expect(toAnnouncementBody(withSession)).toMatchObject({ sessionId: 's1' });
    expect(toAnnouncementBody(withSession)).not.toHaveProperty('linkUrl');
  });

  it('asks for the session or a full web address when that is the target', () => {
    const noSession = announcementSchema.safeParse({ ...base, target: 'session' });
    expect(noSession.success || noSession.error.issues[0]!.path).toEqual(['sessionId']);
    expect(announcementSchema.safeParse({ ...base, target: 'link', linkUrl: 'policycentre.org' }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, target: 'link', linkUrl: 'https://policycentre.org/communique' }).success).toBe(true);
  });

  it('needs a title and a message', () => {
    expect(announcementSchema.safeParse({ ...base, title: '  ' }).success).toBe(false);
    expect(announcementSchema.safeParse({ ...base, body: '' }).success).toBe(false);
  });
});

describe('sent notifications', () => {
  it('names categories and tells announcements from automatic pushes', () => {
    expect(categoryLabel('session-live')).toBe('Session live');
    expect(categoryLabel(null)).toBe('Announcement');
    expect(categoryLabel('something-new')).toBe('something-new');
    expect(isAnnouncement({ category: 'announcement', delegateId: null })).toBe(true);
    expect(isAnnouncement({ category: 'session-live', delegateId: null })).toBe(false);
    expect(isAnnouncement({ category: 'network', delegateId: 'd1' })).toBe(false);
  });
});

describe('toggleMuted', () => {
  it('mutes and unmutes one kind without duplicates', () => {
    expect(toggleMuted([], 'session-live', false)).toEqual(['session-live']);
    expect(toggleMuted(['session-live', 'session-reminder'], 'session-live', true)).toEqual(['session-reminder']);
    expect(toggleMuted(['session-live'], 'session-live', false)).toEqual(['session-live']);
  });
});
