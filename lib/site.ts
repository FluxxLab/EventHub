/**
 * The public product site (`/welcome`): what PIC Events is, for organisers who might buy it.
 * Demo requests go by email for now; set NEXT_PUBLIC_SALES_EMAIL to the team's address.
 */

export const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL?.trim() || null;

/** A mail link with the demo request written, or null when no sales address is set. */
export function demoRequestMailto(from: string, to: string | null = SALES_EMAIL): string | null {
  if (!to) return null;
  const subject = 'PIC Events demo request';
  const body = `Hello,\n\nI would like a walkthrough of PIC Events for an upcoming event.\n\nMy email: ${from}\nOrganisation:\nEvent and expected attendance:\nPreferred dates:\n`;
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** A mail link asking to join the organisers' newsletter, or null when no sales address is set. */
export function newsletterMailto(from: string, to: string | null = SALES_EMAIL): string | null {
  if (!to) return null;
  const body = `Please add ${from} to the PIC Events newsletter for event organisers.`;
  return `mailto:${to}?subject=${encodeURIComponent('PIC Events newsletter')}&body=${encodeURIComponent(body)}`;
}
