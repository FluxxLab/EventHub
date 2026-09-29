import { describe, expect, it } from 'vitest';

import { demoRequestMailto, newsletterMailto } from '@/lib/site';

describe('product site', () => {
  it('writes the demo request into a mail link', () => {
    const href = demoRequestMailto('ada@ngo.org', 'events@example.org')!;
    expect(href.startsWith('mailto:events@example.org?subject=PIC%20Events%20demo%20request&body=')).toBe(true);
    expect(decodeURIComponent(href.split('body=')[1]!)).toContain('My email: ada@ngo.org');
  });

  it('offers no link until a sales address is set', () => {
    expect(demoRequestMailto('ada@ngo.org', null)).toBeNull();
  });

  it('asks to join the newsletter by mail', () => {
    const href = newsletterMailto('ada@ngo.org', 'events@example.org')!;
    expect(decodeURIComponent(href.split('body=')[1]!)).toBe('Please add ada@ngo.org to the PIC Events newsletter for event organisers.');
    expect(newsletterMailto('ada@ngo.org', null)).toBeNull();
  });
});
