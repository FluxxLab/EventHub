'use client';

import { useEffect, useState } from 'react';

import { badgeCss, badgeMarkup, SIZE_MM, type BadgeDesign } from '@/lib/badges/badges';
import { badgeLogo, qrSvg, type BadgePerson } from '@/lib/badges/print';

const MM = 3.7795;

/**
 * One badge, drawn exactly as it prints (same markup and styles), scaled to fit `maxWidth` ×
 * `maxHeight` pixels. Scripts never run in it; it shows only what the badge prints.
 */
export function BadgeFrame({
  person,
  design,
  eventShortName,
  artworkUrl,
  logo,
  maxWidth,
  maxHeight,
  className,
}: {
  person: BadgePerson;
  design: BadgeDesign;
  eventShortName: string;
  artworkUrl: string | null;
  /** The logo the design asks for (`badgeLogoFor`); left out, PIC's. */
  logo?: string | null;
  maxWidth: number;
  maxHeight: number;
  className?: string;
}) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let live = true;
    void qrSvg(person.qr).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [person.qr]);

  const { w, h } = SIZE_MM[design.size];
  const scale = Math.min(maxWidth / (w * MM), maxHeight / (h * MM));
  // built once the QR is ready: it needs the page's address for the logo, known only in the browser
  const doc = svg
    ? `<!doctype html><html><head><style>${badgeCss(design.size)}html,body{overflow:hidden}</style></head><body>${badgeMarkup(person, design, { shortName: eventShortName, logo: logo === undefined ? badgeLogo() : logo, artworkUrl }, design.fields.includes('qr') ? svg : '')}</body></html>`
    : '';
  return (
    <div className={className} style={{ width: w * MM * scale, height: h * MM * scale }}>
      {doc && (
        <iframe
          title={`Badge for ${person.name}`}
          srcDoc={doc}
          sandbox="allow-same-origin"
          scrolling="no"
          className="pointer-events-none origin-top-left border-0"
          style={{ width: Math.ceil(w * MM), height: Math.ceil(h * MM), transform: `scale(${scale})` }}
        />
      )}
    </div>
  );
}
