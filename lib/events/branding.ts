/**
 * An event's branding in the app: a cover picture (event cards and page headers), a logo (the
 * event's own screens) and one button colour. The colour is plain #rrggbb; the app writes white or
 * near-black on it, whichever reads better, so any colour an organiser picks stays legible.
 */

export const BRAND_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** PIC navy: what an event without its own colour uses. */
export const PIC_NAVY = '#002d74';

/** Quick picks; any other colour can be typed or chosen. */
export const BRAND_PRESETS = ['#002d74', '#0f6b3a', '#7a1f5c', '#b4461b', '#1f5f8b', '#5b3fa0', '#8a6d1d', '#222222'] as const;

/** The image types the API signs uploads for. */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const LIMITS = { cover: 10 * 1024 * 1024, logo: 2 * 1024 * 1024 } as const;

/** Why this file cannot be the cover or logo, or null when it can. */
export function imageProblem(file: Pick<File, 'type' | 'size'>, kind: 'cover' | 'logo'): string | null {
  if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) return 'Use a JPG, PNG or WebP image.';
  if (file.size > LIMITS[kind]) return `Keep it under ${LIMITS[kind] / 1024 / 1024} MB.`;
  return null;
}

/** "#0F6B3A" or "0f6b3a" as "#0f6b3a"; null when it is not a colour. */
export function normaliseColor(input: string): string | null {
  const v = input.trim().toLowerCase();
  const hex = v.startsWith('#') ? v : `#${v}`;
  return BRAND_COLOR_PATTERN.test(hex) ? hex : null;
}

/** WCAG relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two #rrggbb colours, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Text on a button of this colour: white, or near-black when white would not read. */
export const textOn = (hex: string): '#ffffff' | '#111111' => (contrast(hex, '#ffffff') >= contrast(hex, '#111111') ? '#ffffff' : '#111111');

/**
 * A warning when the colour is too pale to show up as a button on the app's white pages (under
 * 3:1 against white, the WCAG line for buttons and other non-text parts), else null.
 */
export const paleWarning = (hex: string): string | null =>
  contrast(hex, '#ffffff') < 3 ? 'This colour is pale on the app’s white pages; buttons may be hard to see. A deeper shade works better.' : null;
