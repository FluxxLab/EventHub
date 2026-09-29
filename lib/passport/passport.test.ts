import { describe, expect, it } from 'vitest';

import { boothSchema, passportTotals, signsHtml, stampLink, type Booth } from '@/lib/passport/passport';

const booth = (id: string, over: Partial<Booth> = {}): Booth => ({ id, name: `Stand ${id}`, code: 'K7M2PX', location: null, isActive: true, sortOrder: 0, stamps: 0, ...over });

describe('passport', () => {
  it('encodes the link the app scanner stamps from', () => {
    expect(stampLink('K7M2PX')).toBe('picevents://passport/stamp?code=K7M2PX');
  });

  it('checks a stand, trimming and requiring a name', () => {
    expect(boothSchema.parse({ name: ' UN Women ', location: ' Hall B, stand 14 ', description: '' })).toEqual({ name: 'UN Women', location: 'Hall B, stand 14', description: '' });
    expect(boothSchema.safeParse({ name: '  ', location: '', description: '' }).success).toBe(false);
  });

  it('totals stands and stamps, and names the busiest', () => {
    const t = passportTotals([booth('a', { stamps: 40 }), booth('b', { stamps: 91, isActive: false }), booth('c')]);
    expect(t).toMatchObject({ active: 2, total: 3, stamps: 131 });
    expect(t.busiest?.id).toBe('b');
    expect(passportTotals([booth('x')]).busiest).toBeNull();
  });

  it('prints one escaped sign per stand', () => {
    const html = signsHtml([booth('a', { name: 'Women <in> Tech & Co', location: 'Hall B' }), booth('b')], { a: '<svg id="qa"></svg>' }, 'GS-27');
    expect(html.match(/class="sign"/g)).toHaveLength(2);
    expect(html).toContain('Women &lt;in&gt; Tech &amp; Co');
    expect(html).toContain('<svg id="qa"></svg>');
    expect(html).toContain('K7M2PX');
  });
});
