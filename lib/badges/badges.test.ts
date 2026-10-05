import { describe, expect, it } from 'vitest';

import { artworkMismatch, artworkPixels, badgeMarkup, badgesHtml, brandedDesign, clampPlacement, defaultLayout, DEFAULT_DESIGN, filterHolders, initials, sameDesign, textOn, tierColour, withTierColour, type BadgeHolder } from '@/lib/badges/badges';

const holder = (over: Partial<BadgeHolder> = {}): BadgeHolder => ({
  ticketId: 't1',
  code: 'PIC-VIP-AB12',
  name: 'Ngozi Eze',
  title: 'Director',
  organisation: 'Women <in> Policy & Co',
  country: 'Nigeria',
  photo: null,
  tierName: 'VIP',
  ticketTypeId: 'tt2',
  section: 'VIP',
  quantity: 1,
  qr: 'PICT1.t1.sig',
  admitted: 0,
  ...over,
});
const event = { shortName: 'GS-27', logo: 'https://console/pic-logo.png' };

describe('badges', () => {
  it('colours a tier band, falling back to the header colour', () => {
    const d = withTierColour(DEFAULT_DESIGN, 'VIP', '#B8860B');
    expect(tierColour(d, 'VIP')).toBe('#b8860b');
    expect(tierColour(d, 'Standard')).toBe('#002d74');
    // choosing the header colour again drops the tier's own
    expect(withTierColour(d, 'VIP', '#002D74').tierColours).toEqual([]);
  });

  it('picks readable text on the band', () => {
    expect(textOn('#002d74')).toBe('#ffffff');
    expect(textOn('#ffd400')).toBe('#292929');
    expect(textOn('#ffffff')).toBe('#292929');
  });

  it('prints only the chosen details, escaped, and skips blank ones', () => {
    const html = badgeMarkup(holder({ country: null }), { ...DEFAULT_DESIGN, fields: ['organisation', 'country', 'code'] }, event, '<svg id="qr"></svg>');
    expect(html).toContain('Women &lt;in&gt; Policy &amp; Co');
    expect(html).not.toContain('Director');
    expect(html).not.toContain('class="country"');
    expect(html).toContain('PIC-VIP-AB12');
    expect(html).not.toContain('<svg id="qr">');
    expect(html).not.toContain('<footer');
  });

  it('shows the photo, or initials without one, only when chosen', () => {
    const d = { ...DEFAULT_DESIGN, fields: ['photo' as const] };
    expect(badgeMarkup(holder({ photo: 'https://signed/a.jpg?x=1&y=2' }), d, event, '')).toContain('<img src="https://signed/a.jpg?x=1&amp;y=2"');
    expect(badgeMarkup(holder(), d, event, '')).toContain('<span>NE</span>');
    expect(badgeMarkup(holder(), DEFAULT_DESIGN, event, '')).not.toContain('class="photo"');
    expect(initials('  grace wanjiru kamau ')).toBe('GK');
    expect(initials('Ada')).toBe('A');
  });

  it('places the parts on artwork, in place of the header band', () => {
    const d = { ...DEFAULT_DESIGN, fields: ['photo' as const, 'qr' as const], artwork: 'badges/k', layout: defaultLayout('a6') };
    const html = badgeMarkup(holder(), d, { ...event, artworkUrl: 'https://signed/art.png' }, '<svg id="qr"></svg>');
    expect(html).toContain('<img class="bg" src="https://signed/art.png"');
    expect(html).not.toContain('<header');
    expect(html).toContain('class="part who" style="left:50%;top:52%;transform:translate(-50%,-50%) scale(1)"');
    expect(html).toContain('class="part scan"');
    // no link to the artwork yet: the standard layout, rather than a badge with nothing behind it
    expect(badgeMarkup(holder(), d, event, '')).toContain('<header');
  });

  it('keeps dragged parts on the badge and sizes within range', () => {
    expect(clampPlacement({ x: -0.2, y: 1.4, scale: 3 })).toEqual({ x: 0.03, y: 0.97, scale: 2 });
    expect(clampPlacement({ x: 0.12345, y: 0.5, scale: 0.333 })).toEqual({ x: 0.123, y: 0.5, scale: 0.5 });
    expect(defaultLayout('4x3').scan.x).toBeGreaterThan(defaultLayout('4x3').who.x);
  });

  it('warns about artwork of another shape, and says what size to make it', () => {
    expect(artworkPixels('a6')).toEqual({ width: 1240, height: 1748 });
    expect(artworkMismatch('a6', { width: 1240, height: 1748 })).toBeLessThan(0.01);
    expect(artworkMismatch('a6', { width: 1920, height: 1080 })).toBeGreaterThan(0.5);
  });

  it('lays sheets out by how many fit on A4', () => {
    const six = Array.from({ length: 6 }, () => '<article class="badge"></article>');
    expect(badgesHtml(six, 'a6', 'sheet', 'x').match(/class="sheet"/g)).toHaveLength(2);
    expect(badgesHtml(six, '4x3', 'sheet', 'x').match(/class="sheet"/g)).toHaveLength(1);
    const single = badgesHtml(six, 'cr80', 'single', 'x');
    expect(single.match(/class="page"/g)).toHaveLength(6);
    expect(single).toContain('@page{size:54mm 85.6mm;margin:0}');
  });

  it('finds holders by name, organisation or code within a tier', () => {
    const list = [holder(), holder({ ticketId: 't2', name: 'Kwame Mensah', organisation: 'University of Ghana', code: 'PIC-STA-9', ticketTypeId: 'tt1', tierName: 'Standard' })];
    expect(filterHolders(list, 'ghana', 'all').map((h) => h.ticketId)).toEqual(['t2']);
    expect(filterHolders(list, 'pic-vip', 'all').map((h) => h.ticketId)).toEqual(['t1']);
    expect(filterHolders(list, '', 'tt1').map((h) => h.ticketId)).toEqual(['t2']);
  });

  it('compares designs regardless of order', () => {
    const a = { ...DEFAULT_DESIGN, fields: ['qr', 'title'] as const, tierColours: [{ tier: 'A', colour: '#111111' }, { tier: 'B', colour: '#222222' }] };
    const b = { ...DEFAULT_DESIGN, fields: ['title', 'qr'] as const, tierColours: [{ tier: 'B', colour: '#222222' }, { tier: 'A', colour: '#111111' }] };
    expect(sameDesign({ ...a, fields: [...a.fields] }, { ...b, fields: [...b.fields] })).toBe(true);
    expect(sameDesign(DEFAULT_DESIGN, { ...DEFAULT_DESIGN, size: 'cr80' })).toBe(false);
  });
});

describe('the badge look', () => {
  const who = holder();
  it('starts from the event colour and its logo, else PIC', () => {
    expect(brandedDesign({ brandColor: '#0F6B3A', logoUrl: 'https://signed/logo.png' })).toMatchObject({ accent: '#0f6b3a', logo: 'event' });
    expect(brandedDesign({})).toMatchObject({ accent: '#002d74', logo: 'pic' });
  });

  it('prints the header words chosen, or the short name, and leaves an empty header out', () => {
    expect(badgeMarkup(who, { ...DEFAULT_DESIGN, heading: 'Build 2026' }, event, '')).toContain('<span class="event">Build 2026</span>');
    expect(badgeMarkup(who, DEFAULT_DESIGN, event, '')).toContain(`<span class="event">${event.shortName}</span>`);
    expect(badgeMarkup(who, { ...DEFAULT_DESIGN, heading: '' }, { ...event, logo: null }, '')).not.toContain('<header');
  });

  it('draws a light header with a rule of the header colour', () => {
    const html = badgeMarkup(who, { ...DEFAULT_DESIGN, headerStyle: 'light', accent: '#0f6b3a' }, event, '');
    expect(html).toContain('<header class="light" style="border-bottom-color:#0f6b3a;color:#0f6b3a">');
    expect(html).toContain('class="logo bare"');
  });

  it('turns text white on a dark card and keeps the QR on white', () => {
    const html = badgeMarkup(who, { ...DEFAULT_DESIGN, background: '#002d74', fields: ['qr'] }, event, '<svg></svg>');
    expect(html).toContain('class="badge size-a6 tinted"');
    expect(html).toContain('--ink:#ffffff');
  });
});

