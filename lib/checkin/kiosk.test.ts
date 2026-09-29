import { describe, expect, it } from 'vitest';

import type { TicketMatch } from '@/lib/checkin/checkin';
import { exactCode, hashPin, validPin } from '@/lib/checkin/kiosk';

const match = (code: string, name = 'Ngozi Eze'): TicketMatch => ({ ticketId: code, code, name, email: 'n@x.org', organisation: null, tierName: 'VIP', quantity: 1, admitted: 0, qr: `PICT1.${code}.sig` });

describe('self check-in kiosk', () => {
  it('accepts only an exact ticket code, however it is typed', () => {
    const found = [match('PIC-VIP-3QX7'), match('PIC-VIP-3QX8', 'Someone Else')];
    expect(exactCode(found, 'pic vip 3qx7')?.name).toBe('Ngozi Eze');
    expect(exactCode(found, 'PIC-VIP-3QX8')?.name).toBe('Someone Else');
    // a name or part of a code never picks someone: the lookup behind it also matches names
    expect(exactCode(found, 'Ngozi')).toBeNull();
    expect(exactCode(found, 'PIC-VIP')).toBeNull();
    expect(exactCode([], 'PIC-VIP-3QX7')).toBeNull();
  });

  it('takes a PIN of four to six digits, and keeps only its hash', async () => {
    expect(validPin('1234')).toBe(true);
    expect(validPin('123456')).toBe(true);
    expect(validPin('123')).toBe(false);
    expect(validPin('12a4')).toBe(false);
    const hash = await hashPin('2468');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(await hashPin('2468'));
    expect(hash).not.toBe(await hashPin('2469'));
  });
});
