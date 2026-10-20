import { describe, expect, it } from 'vitest';

import type { Edition } from '@/lib/events/events';
import { looseRoomKey, parsePin, roomClashes, roomSchema, toRoomBody, venueFormOf, venuePatch, venueSchema } from '@/lib/venue/venue';

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

describe('room clashes', () => {
  const room = (name: string, sessionCount: number, id: string | null = null) => ({ id, name, floor: null, notes: null, sessionCount });

  it('treats & and "and", spacing and punctuation as the same room', () => {
    expect(looseRoomKey('Acacia A&B')).toBe(looseRoomKey('Acacia A and B'));
    expect(looseRoomKey('acacia a & b')).toBe(looseRoomKey('Acacia A-B'));
    expect(looseRoomKey('Tamarind A')).not.toBe(looseRoomKey('Tamarind B'));
  });

  it('finds nothing when every room is written one way', () => {
    expect(roomClashes([room('Main Hall', 30, 'r1'), room('Tamarind A', 8), room('Tamarind B', 7)])).toEqual([]);
  });

  it('keeps the busiest spelling and renames an unused Venue description to it', () => {
    const [clash] = roomClashes([room('Acacia A&B', 9), room('Acacia A and B', 0, 'r2'), room('Main Hall', 30, 'r1')]);
    expect(clash!.keep.name).toBe('Acacia A&B');
    expect(clash!.fixes).toEqual([{ kind: 'rename', room: room('Acacia A and B', 0, 'r2') }]);
  });

  it('removes an unused description when the kept spelling is described too', () => {
    const [clash] = roomClashes([room('Acacia A&B', 9, 'r1'), room('Acacia A and B', 0, 'r2')]);
    expect(clash!.fixes.map((f) => f.kind)).toEqual(['remove']);
  });

  it('only one unused description can take the kept name; another is removed', () => {
    const [clash] = roomClashes([room('Acacia A&B', 9), room('Acacia A and B', 0, 'r2'), room('Acacia A & B', 0, 'r3')]);
    expect(clash!.fixes.map((f) => [f.kind, f.room.name])).toEqual([
      ['rename', 'Acacia A & B'],
      ['remove', 'Acacia A and B'],
    ]);
  });

  it('says sessions must be edited when both spellings have sessions', () => {
    const [clash] = roomClashes([room('Acacia A and B', 3), room('Acacia A&B', 9, 'r1')]);
    expect(clash!.keep.name).toBe('Acacia A&B');
    expect(clash!.fixes).toEqual([{ kind: 'sessions', room: room('Acacia A and B', 3) }]);
  });
});
