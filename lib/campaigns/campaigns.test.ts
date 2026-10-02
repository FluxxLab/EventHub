import { describe, expect, it } from 'vitest';

import { draftProblem, EMPTY_DRAFT, engagementLine, insertAt, merge, rate, renderCampaign, statusLine, unknownFields } from '@/lib/campaigns/campaigns';
import { count } from '@/lib/format';

const ada = { email: 'ada@x.org', name: 'Ada Okafor', code: 'PIC-VIP-AB12', tier: 'VIP' };

describe('email campaigns', () => {
  it('merges each person’s details like the API does', () => {
    expect(merge('Hi {{ First_Name }}, your {{tier}} ticket {{ticket_code}} for {{event}}', ada, 'GS-27')).toBe('Hi Ada, your VIP ticket PIC-VIP-AB12 for GS-27');
    expect(unknownFields('{{seat}} {{name}}')).toEqual(['seat']);
  });

  it('previews escaped, with paragraphs, links and the button', () => {
    const { subject, html } = renderCampaign({ subject: 'For {{name}}', body: 'Hi <b>{{first_name}}</b>\n\nhttps://pic.org/x.', buttonLabel: 'Open', buttonUrl: 'https://pic.org/?a=1&b=2', audience: EMPTY_DRAFT.audience, design: null }, ada, 'GS-27');
    expect(subject).toBe('For Ada Okafor');
    expect(html).toContain('Hi &lt;b&gt;Ada&lt;/b&gt;</p>');
    expect(html).toContain('<a href="https://pic.org/x"');
    expect(html).toContain('href="https://pic.org/?a=1&amp;b=2"');
  });

  it('says what stops a draft from being saved', () => {
    const ok = { ...EMPTY_DRAFT, subject: 'Hello', body: 'Hi {{first_name}}' };
    expect(draftProblem(ok)).toBeNull();
    expect(draftProblem({ ...ok, subject: ' ' })).toBe('Write a subject.');
    expect(draftProblem({ ...ok, body: 'Hi {{firstname}}' })).toContain('{{firstname}}');
    expect(draftProblem({ ...ok, buttonLabel: 'Open' })).toContain('both its words');
    expect(draftProblem({ ...ok, buttonLabel: 'Open', buttonUrl: 'pic.org' })).toContain('https://');
  });

  it('reports sending progress and failures', () => {
    expect(statusLine({ status: 'draft', recipients: 0, sent: 0, failed: 0 }, count)).toBe('Draft');
    expect(statusLine({ status: 'sending', recipients: 1200, sent: 338, failed: 2 }, count)).toBe('Sending: 340 of 1,200 · 2 failed');
    expect(statusLine({ status: 'sent', recipients: 1200, sent: 1198, failed: 2 }, count)).toBe('Sent to 1,198 · 2 failed');
  });

  it('reports opens and clicks only for tracked campaigns that went out', () => {
    expect(engagementLine({ status: 'sent', sent: 1000, opened: 431, clicked: 118, tracked: true })).toBe('43% opened · 12% clicked');
    expect(engagementLine({ status: 'sent', sent: 1000, opened: 431, clicked: 118, tracked: false })).toBeNull();
    expect(engagementLine({ status: 'draft', sent: 0, opened: 0, clicked: 0, tracked: true })).toBeNull();
    expect(rate(1, 3)).toBe(33);
    expect(rate(0, 0)).toBeNull();
  });

  it('inserts a detail at the cursor, spaced from the words around it', () => {
    expect(insertAt('Hello!', 5, 5, 'first_name')).toEqual({ text: 'Hello {{first_name}}!', cursor: 20 });
    expect(insertAt('Dear ', 5, 5, 'name')).toEqual({ text: 'Dear {{name}}', cursor: 13 });
    expect(insertAt('Hi you', 3, 6, 'first_name').text).toBe('Hi {{first_name}}');
  });
});
