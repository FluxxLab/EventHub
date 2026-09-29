/**
 * The check-in desk. A scan (USB scanner or camera) posts the ticket's signed payload to
 * `POST /tickets/admit`; typed text looks tickets up with `POST /tickets/find` and admits the one
 * picked, as if scanned. The door rules stay the API's: a ticket for N admits N, once each.
 */

export type AdmitResult = {
  status: 'admitted' | 'already_used';
  ticket: {
    id: string;
    code: string;
    tierName: string;
    ticketTypeId: string;
    quantity: number;
    guestName: string;
    edition: { id: string; name: string };
    qr: string;
  };
  holder: { name: string; title: string | null; organisation: string | null; country: string | null; photo: string | null };
  admitted: number;
  remaining: number;
  firstAdmittedAt: string | null;
  lastAdmittedAt: string | null;
};

export type TicketMatch = {
  ticketId: string;
  code: string;
  name: string;
  email: string;
  organisation: string | null;
  tierName: string;
  quantity: number;
  admitted: number;
  qr: string;
};

export type GateSummary = { editionId: string; tickets: number; places: number; admitted: number; ticketsUsed: number };

/** What a scanner types for a ticket QR: `PICT1.<ticket id>.<signature>`. */
export const isTicketQr = (text: string) => /^PICT1\.[^.\s]+\.[^.\s]+$/.test(text.trim());

/** The badge for an admitted person, in the shape the badge printer takes. */
export const badgeFor = (result: AdmitResult) => ({
  name: result.holder.name,
  title: result.holder.title,
  organisation: result.holder.organisation,
  country: result.holder.country,
  photo: result.holder.photo,
  tierName: result.ticket.tierName,
  code: result.ticket.code,
  qr: result.ticket.qr,
});

/** "at 09:14" for today, "on 7 Sept at 09:14" otherwise. */
export function whenAdmitted(iso: string | null, now: Date): string {
  if (!iso) return '';
  const at = new Date(iso);
  const time = at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' });
  const day = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Africa/Lagos' });
  return day(at) === day(now) ? `at ${time}` : `on ${day(at)} at ${time}`;
}

/** The line under the name: how many are in on a group ticket. */
export function placesLine(result: AdmitResult): string | null {
  if (result.ticket.quantity <= 1) return null;
  return `${result.admitted} of ${result.ticket.quantity} in on this ticket`;
}
