import { describe, expect, it } from 'vitest';

import { editionToForm, toUpdateBody, type Edition } from '@/lib/events/events';
import { sessionToForm, type Session } from '@/lib/programme/programme';

describe('edit forms start from what is stored', () => {
  it('reads an event back into the Add event form, and sends an emptied place to clear it', () => {
    const e = { name: 'GS-27', shortName: 'GS-27', category: 'summits', venue: null, city: 'Abuja', startsAt: new Date(2027, 8, 7, 9, 0).toISOString(), endsAt: new Date(2027, 8, 8, 17, 30).toISOString() } as unknown as Edition;
    const start = editionToForm(e);
    expect(start.range).toEqual({ start: '2027-09-07', end: '2027-09-08' });
    expect(start.times).toEqual({ start: '09:00', end: '17:30' });
    expect(start.form).toMatchObject({ venue: '', city: 'Abuja', category: 'summits' });
    const body = toUpdateBody({ ...start.form, startsAt: '2027-09-07T09:00', endsAt: '2027-09-08T17:30', venue: '', city: '' } as never);
    expect(body).toMatchObject({ venue: '', city: '' });
  });

  it('reads a session back into the Add session form', () => {
    const s = { title: 'Opening', description: null, type: 'mystery', track: 'general', day: 2, room: 'Main Hall', startsAt: new Date(2027, 8, 8, 9, 15).toISOString(), endsAt: new Date(2027, 8, 8, 10, 0).toISOString() } as unknown as Session;
    expect(sessionToForm(s)).toEqual({ title: 'Opening', description: '', type: 'panel', track: 'general', day: 2, startTime: '09:15', endTime: '10:00', room: 'Main Hall' });
  });
});
