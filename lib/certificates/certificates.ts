/** `GET /documents/purple-book`: the published Purple Book (`url` signed when it is an upload). */
export type PurpleBook = { key: string; title: string; url: string; sizeLabel: string | null; updatedAt: string };

/** `GET /certificates/verify/:code`. */
export type Verification = { valid: boolean; delegateName?: string; issuedAt?: string; event?: string };

/**
 * A code as the verify route expects it: upper case, without spaces a person adds when reading
 * it aloud or copying from print. Codes look like GS26-K7M2P-X4QRT.
 */
export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
}

/** Worth sending to the server: letters, digits and dashes, a sensible length. */
export const looksLikeCode = (code: string) => /^[A-Z0-9-]{6,32}$/.test(code);

/* ------------------------------------------------------- certificate design */

export type CertificateFont = 'sans' | 'serif';
export type CertificateAlign = 'left' | 'center' | 'right';

/** Where a line of text goes, all as fractions of the page (see the API's certificate-template.ts). */
export type TextPlacement = {
  x: number;
  y: number;
  size: number;
  maxWidth: number;
  color: string;
  font: CertificateFont;
  bold: boolean;
  align: CertificateAlign;
};

export type CertificateTemplate = {
  key: string;
  contentType: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  name: TextPlacement;
  code: TextPlacement | null;
  updatedAt: string;
};

/** `GET /editions/:id/certificate`. */
export type CertificateDesign = { template: CertificateTemplate | null; artworkUrl: string | null };

export const DEFAULT_NAME: TextPlacement = { x: 0.5, y: 0.52, size: 0.065, maxWidth: 0.7, color: '#002d74', font: 'serif', bold: false, align: 'center' };
export const DEFAULT_CODE: TextPlacement = { x: 0.5, y: 0.93, size: 0.018, maxWidth: 0.5, color: '#525252', font: 'sans', bold: false, align: 'center' };
export const SAMPLE_NAME = 'Adaeze Nwachukwu-Okonkwo';
export const ARTWORK_TYPES = ['image/png', 'image/jpeg'] as const;

/** The CSS font stack closest to the PDF's built-in fonts (Times, Helvetica). */
export const cssFont = (p: Pick<TextPlacement, 'font' | 'bold'>, px: number) =>
  `${p.bold ? '700' : '400'} ${px}px ${p.font === 'serif' ? '"Times New Roman", Times, serif' : 'Helvetica, Arial, sans-serif'}`;

/**
 * The same layout the API renders with, in fractions of the page: the box the text sits in and
 * its font size, a long name shrinking in 5% steps until it fits. `measure` returns a width in
 * the same unit as `pageWidth`.
 */
export function layoutFraction(
  p: TextPlacement,
  aspect: number,
  text: string,
  measure: (text: string, placement: TextPlacement, fontSizePx: number) => number,
  pageWidth = 1000,
): { left: number; top: number; width: number; fontSize: number } {
  const pageHeight = pageWidth / aspect;
  const width = p.maxWidth * pageWidth;
  let fontSize = p.size * pageHeight;
  while (fontSize > 8 * (pageHeight / 595.28) && measure(text, p, fontSize) > width) fontSize *= 0.95;
  const anchor = p.x * pageWidth;
  const left = p.align === 'center' ? anchor - width / 2 : p.align === 'right' ? anchor - width : anchor;
  const top = p.y * pageHeight - fontSize * 0.6;
  return { left: left / pageWidth, top: top / pageHeight, width: width / pageWidth, fontSize: fontSize / pageHeight };
}

/** Keeps a dragged point on the page. */
export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** A4 is 1.414:1. Artwork far off that shape is stretched onto the page, so it is worth a warning. */
export function aspectWarning(width: number, height: number): string | null {
  const ratio = Math.max(width, height) / Math.min(width, height);
  if (Math.abs(ratio - Math.SQRT2) / Math.SQRT2 <= 0.03) return null;
  return `This artwork is ${width}×${height}. Certificates print on A4, so it will be stretched to fit; export it at A4 shape (for example 3508×2480) to avoid that.`;
}

/** Artwork below this is soft when printed. */
export const lowResolution = (width: number, height: number) => Math.max(width, height) < 2000;
