'use client';

import QRCode from 'qrcode';

import { badgeMarkup, badgesHtml, brandedDesign, type BadgeDesign, type BadgeHolder, type PrintLayout } from '@/lib/badges/badges';
import type { StoredDesign } from '@/lib/badges/use-badges';

/** A badge's QR as SVG: the ticket's signed door payload. */
export const qrSvg = (payload: string) => QRCode.toString(payload, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#292929' } });

/** PIC's logo; absolute, since the print document has no base URL. */
export const badgeLogo = () => `${window.location.origin}/pic-logo.png`;

/**
 * The picture a design's logo choice comes to: the event's logo (PIC's while the event has none),
 * PIC's, the one uploaded for badges, or none.
 */
export function badgeLogoFor(design: Pick<BadgeDesign, 'logo'>, sources: { eventLogo: string | null | undefined; uploadedLogo: string | null | undefined }): string | null {
  if (design.logo === 'none') return null;
  if (design.logo === 'custom') return sources.uploadedLogo ?? null;
  if (design.logo === 'event') return sources.eventLogo ?? badgeLogo();
  return badgeLogo();
}

/**
 * What an event's badges print with: its saved design, or its branding until one is saved, the
 * artwork's link, and the logo the design asks for.
 */
export function badgeLook(stored: StoredDesign | undefined, event: { brandColor?: string | null; logoUrl?: string | null }) {
  const design = stored?.saved ? stored.design : brandedDesign(event);
  return { design, artworkUrl: stored?.artworkUrl ?? null, logo: badgeLogoFor(design, { eventLogo: event.logoUrl, uploadedLogo: stored?.logoUrl }) };
}

export type BadgePerson = Pick<BadgeHolder, 'name' | 'title' | 'organisation' | 'country' | 'tierName' | 'code' | 'qr'> & { photo?: string | null };

/** The print document for these people's badges. */
export async function badgesDocument(people: BadgePerson[], design: BadgeDesign, eventShortName: string, layout: PrintLayout, artworkUrl: string | null = null, logo: string | null = badgeLogo()): Promise<string> {
  const event = { shortName: eventShortName, logo, artworkUrl };
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
