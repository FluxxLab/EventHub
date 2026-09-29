import { describe, expect, it } from 'vitest';

import type { Edition } from '@/lib/events/events';
import { parsePin, roomSchema, toRoomBody, venueFormOf, venuePatch, venueSchema } from '@/lib/venue/venue';

const edition = { venue: 'Transcorp Hilton', address: null, city: 'Abuja', latitude: 9.05, longitude: 7.49 } as Edition;

describe('venuePatch', () => {
  const before = venueFormOf(edition);

  it('sends only what changed', () => {
    const after = venueSchema.parse({ ...before, address: ' Plot 1, Aguiyi Ironsi St ' });
    expect(venuePatch(before, after)).toEqual({ address: 'Plot 1, Aguiyi Ironsi St' });
  });

  it('clears the pin with nulls when it is blanked', () => {
    const after = venueSchema.parse({ ...before, pin: '' });
    expect(venuePatch(before, after)).toEqual({ latitude: null, longitude: null });
  });

  it('sends a moved pin as numbers', () => {
    const after = venueSchema.parse({ ...before, pin: '9.06, 7.5' });
    expect(venuePatch(before, after)).toEqual({ latitude: 9.06, longitude: 7.5 });
  });

  it('sends nothing when nothing changed, however the pin is spaced', () => {
    expect(venuePatch(before, venueSchema.parse(before))).toEqual({});
    expect(venuePatch(before, venueSchema.parse({ ...before, pin: '9.05 ,  7.49' }))).toEqual({});
  });
});

describe('parsePin', () => {
  it('reads what Google Maps copies, and other separators', () => {
    expect(parsePin('9.0579, 7.4951')).toEqual({ lat: 9.0579, lng: 7.4951 });
    expect(parsePin('9.0579 7.4951')).toEqual({ lat: 9.0579, lng: 7.4951 });
    expect(parsePin('-33.9;18.4')).toEqual({ lat: -33.9, lng: 18.4 });
  });

  it('is null when blank and invalid when not two in-range numbers', () => {
    expect(parsePin('  ')).toBeNull();
    expect(parsePin('91, 7')).toBe('invalid');
    expect(parsePin('Abuja')).toBe('invalid');
    expect(parsePin('9.05')).toBe('invalid');
  });

  it('is enforced by the form', () => {
    expect(venueSchema.safeParse({ ...venueFormOf(edition), pin: 'east' }).success).toBe(false);
  });
});

describe('rooms', () => {
  it('tidies the name and sends blanks as null', () => {
    expect(toRoomBody(roomSchema.parse({ name: '  Hall   B ', floor: '', notes: 'Stage left' }))).toEqual({ name: 'Hall B', floor: null, notes: 'Stage left' });
  });

  it('requires a name', () => {
    expect(roomSchema.safeParse({ name: ' ', floor: '', notes: '' }).success).toBe(false);
  });
});
