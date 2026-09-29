import { describe, expect, it } from 'vitest';

import { badgeFor, isTicketQr, placesLine, whenAdmitted, type AdmitResult } from '@/lib/checkin/checkin';

const result = (over: Partial<AdmitResult['ticket']> = {}, admitted = 1): AdmitResult => ({
  status: 'admitted',
  ticket: { id: 't1', code: 'PIC-VIP-AB12', tierName: 'VIP', ticketTypeId: 'tt2', quantity: 1, guestName: 'N. Eze', edition: { id: 'e1', name: 'GS-27' }, qr: 'PICT1.t1.sig', ...over },
  holder: { name: 'Ngozi Eze', title: 'Director', organisation: 'WIPA', country: null, photo: null },
  admitted,
  remaining: 0,
  firstAdmittedAt: null,
  lastAdmittedAt: null,
});

describe('check-in desk', () => {
  it('tells a scanned ticket from typed text', () => {
    expect(isTicketQr('PICT1.1111-2222.abcDEF_-x')).toBe(true);
    expect(isTicketQr(' PICT1.a.b \n')).toBe(true);
    expect(isTicketQr('PIC-VIP-AB12')).toBe(false);
    expect(isTicketQr('ngozi@example.com')).toBe(false);
    expect(isTicketQr('PICT1.a')).toBe(false);
  });

  it('prints the badge with the account name, not the checkout name', () => {
    expect(badgeFor(result())).toEqual({ name: 'Ngozi Eze', title: 'Director', organisation: 'WIPA', country: null, photo: null, tierName: 'VIP', code: 'PIC-VIP-AB12', qr: 'PICT1.t1.sig' });
  });

  it('counts places only on group tickets', () => {
    expect(placesLine(result())).toBeNull();
    expect(placesLine(result({ quantity: 3 }, 2))).toBe('2 of 3 in on this ticket');
  });

  it('says when someone came in, with the day if not today', () => {
    const now = new Date('2027-09-07T12:00:00+01:00');
    expect(whenAdmitted('2027-09-07T09:14:00+01:00', now)).toBe('at 09:14');
    expect(whenAdmitted('2027-09-06T17:05:00+01:00', now)).toBe('on 6 Sept at 17:05');
    expect(whenAdmitted(null, now)).toBe('');
  });
});
