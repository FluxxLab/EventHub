'use client';

import QRCode from 'qrcode';

import { badgeMarkup, badgesHtml, type BadgeDesign, type BadgeHolder, type PrintLayout } from '@/lib/badges/badges';

/** A badge's QR as SVG: the ticket's signed door payload. */
export const qrSvg = (payload: string) => QRCode.toString(payload, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#292929' } });

/** The logo on badges; absolute, since the print document has no base URL. */
export const badgeLogo = () => `${window.location.origin}/pic-logo.png`;

export type BadgePerson = Pick<BadgeHolder, 'name' | 'title' | 'organisation' | 'country' | 'tierName' | 'code' | 'qr'> & { photo?: string | null };

/** The print document for these people's badges. */
export async function badgesDocument(people: BadgePerson[], design: BadgeDesign, eventShortName: string, layout: PrintLayout, artworkUrl: string | null = null): Promise<string> {
  const event = { shortName: eventShortName, logo: badgeLogo(), artworkUrl };
  const badges = await Promise.all(people.map(async (p) => badgeMarkup(p, design, event, design.fields.includes('qr') ? await qrSvg(p.qr) : '')));
  return badgesHtml(badges, design.size, layout, `${eventShortName} badges`);
}

/**
 * Prints a document from a hidden frame: no pop-up to be blocked, and with Chrome started with
 * `--kiosk-printing` it goes straight to the default printer with no dialog. Waits for images (the
 * logo) first, so no badge prints without it.
 */
export async function printHtml(html: string): Promise<void> {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) {
    frame.remove();
    throw new Error('The browser would not open a print frame.');
  }
  doc.open();
  doc.write(html);
  doc.close();
  await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((done) => ((img.onload = done), (img.onerror = done))))));
  const remove = () => setTimeout(() => frame.remove(), 1000);
  win.addEventListener('afterprint', remove, { once: true });
  // a fallback: some browsers never fire afterprint for a frame
  setTimeout(() => frame.isConnected && frame.remove(), 120_000);
  // printing focuses the frame; give focus back, or a desk's scanner types into nothing
  const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  win.focus();
  win.print();
  before?.focus();
}
