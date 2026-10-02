'use client';

import { ArrowPathIcon, CheckIcon, ExclamationTriangleIcon, EyeIcon, IdentificationIcon, MagnifyingGlassIcon, PhotoIcon, PrinterIcon, TrashIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { useSubPage } from '@/components/shell/breadcrumbs';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Pagination } from '@/components/ui/pagination';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import {
  artworkMismatch,
  artworkPixels,
  BADGE_FIELDS,
  BADGE_PARTS,
  BADGE_SIZES,
  badgeCss,
  badgeMarkup,
  clampPlacement,
  defaultLayout,
  PART_LABEL,
  FIELD_LABEL,
  filterHolders,
  sameDesign,
  SHEET_GRID,
  SIZE_LABEL,
  SIZE_MM,
  tierColour,
  withTierColour,
  type BadgeDesign,
  type BadgeHolder,
  type BadgePart,
  type BadgePlacement,
  type PrintLayout,
} from '@/lib/badges/badges';
import { badgeLogo, badgesDocument, printHtml, qrSvg } from '@/lib/badges/print';
import { uploadBadgeArtwork, useBadgeDesign, useBadgeHolders, useSaveBadgeDesign } from '@/lib/badges/use-badges';
import { paginate } from '@/lib/delegates/delegates';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { count } from '@/lib/format';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const th = 'h-12 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';
const SWATCHES = ['#002d74', '#10a957', '#b8860b', '#8b5cf6', '#e0115f', '#fe9239', '#292929'];
const MM = 3.7795;

/**
 * The made-up person the preview shows, and the test print uses, until the event has a ticket
 * holder: the design can be checked on paper before anyone registers. Its QR does not scan.
 */
const SAMPLE_HOLDER: BadgeHolder = {
  ticketId: 'sample',
  code: 'PIC-VIP-3QX7',
  name: 'Ngozi Eze',
  title: 'Programme Director',
  organisation: 'Women in Policy Africa',
  country: 'Nigeria',
  photo: null,
  tierName: 'VIP',
  ticketTypeId: 'sample',
  section: '',
  quantity: 1,
  qr: 'PICT1.sample',
  admitted: 0,
};

/** Prints the badges from a hidden frame (silent with Chrome's --kiosk-printing). */
async function printBadges(holders: BadgeHolder[], design: BadgeDesign, edition: Edition, layout: PrintLayout, artworkUrl: string | null): Promise<void> {
  await printHtml(await badgesDocument(holders, design, edition.shortName, layout, artworkUrl));
}

/** The badge at true size, scaled to fit: the same HTML and CSS the printer gets. */
function BadgePreview({
  holder,
  design,
  edition,
  artworkUrl,
  onPlace,
}: {
  holder: BadgeHolder | null;
  design: BadgeDesign;
  edition: Edition;
  artworkUrl: string | null;
  /** With artwork: the photo, name and QR can be dragged (or moved with the arrow keys) into place. */
  onPlace?: (part: BadgePart, placement: BadgePlacement) => void;
}) {
  const [svg, setSvg] = useState('');
  const payload = holder?.qr ?? SAMPLE_HOLDER.qr;
  useEffect(() => {
    let live = true;
    void qrSvg(payload).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [payload]);
  const sample = holder ?? SAMPLE_HOLDER;
  // the QR arrives after mount, so the document (which needs the page's origin for the logo) is only built in the browser
  const doc = svg ? `<!doctype html><html><head><style>${badgeCss(design.size)}html,body{overflow:hidden}</style></head><body>${badgeMarkup(sample, design, { shortName: edition.shortName, logo: badgeLogo(), artworkUrl }, svg)}</body></html>` : '';

  const { w, h } = SIZE_MM[design.size];
  const scale = Math.min(320 / (w * MM), 380 / (h * MM));
  const layout = design.artwork && artworkUrl ? design.layout : null;
  const parts = BADGE_PARTS.filter((p) => (p === 'photo' ? design.fields.includes('photo') : p === 'scan' ? design.fields.includes('qr') || design.fields.includes('code') : true));
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative overflow-hidden rounded-md bg-white shadow-lg ring-1 ring-black/5" style={{ width: w * MM * scale, height: h * MM * scale }}>
        {onPlace && layout && parts.map((part) => <PlaceHandle key={part} part={part} placement={layout[part]} onPlace={(p) => onPlace(part, p)} />)}
        {doc && (
          <iframe
            title={`Badge preview for ${sample.name}`}
            srcDoc={doc}
            // no scripts; same origin only so it can show artwork just uploaded (a link in this browser)
            sandbox="allow-same-origin"
            className="pointer-events-none origin-top-left border-0"
            scrolling="no"
            style={{ width: Math.ceil(w * MM), height: Math.ceil(h * MM), transform: `scale(${scale})` }}
          />
        )}
      </div>
      <p className="text-xs text-[#7c7c7c]">
        {holder ? holder.name : 'Sample badge'} · prints at {Math.round(w)} × {Math.round(h)} mm
      </p>
      {onPlace && layout && <p className="-mt-1 text-center text-xs text-[#7c7c7c]">Drag the photo, name and QR into place, or select one and use the arrow keys.</p>}
    </div>
  );
}

/** A draggable marker over a part on the preview; arrow keys nudge it (Shift for bigger steps). */
function PlaceHandle({ part, placement, onPlace }: { part: BadgePart; placement: BadgePlacement; onPlace: (p: BadgePlacement) => void }) {
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    onPlace(clampPlacement({ ...placement, x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }));
  };
  const nudge = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    onPlace(clampPlacement({ ...placement, x: placement.x + d[0]!, y: placement.y + d[1]! }));
  };
  return (
    <button
      type="button"
      aria-label={`${PART_LABEL[part]}: ${Math.round(placement.x * 100)}% across, ${Math.round(placement.y * 100)}% down. Drag, or use the arrow keys.`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
      }}
      onPointerMove={move}
      onKeyDown={nudge}
      className="group absolute z-10 flex -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full outline-none active:cursor-grabbing"
      style={{ left: `${placement.x * 100}%`, top: `${placement.y * 100}%`, width: 44, height: 44 }}
    >
      <span className="absolute inset-0 rounded-full border-2 border-dashed border-primary/70 bg-primary/10 group-focus-visible:border-solid group-focus-visible:bg-primary/20" />
      <span className="relative rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium leading-none text-white">{PART_LABEL[part].split(' ')[0]}</span>
    </button>
  );
}

/** Upload, replace or remove the organisers' own artwork, and size the parts placed on it. */
function ArtworkSection({
  editionId,
  design,
  artworkUrl,
  onUploaded,
  onRemove,
  onScale,
}: {
  editionId: string;
  design: BadgeDesign;
  artworkUrl: string | null;
  onUploaded: (key: string, url: string) => void;
  onRemove: () => void;
  onScale: (part: BadgePart, scale: number) => void;
}) {
  const inputId = useId();
  const [progress, setProgress] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [shape, setShape] = useState<{ width: number; height: number } | null>(null);
  const px = artworkPixels(design.size);
  const { w, h } = SIZE_MM[design.size];

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!['image/png', 'image/jpeg'].includes(file.type)) return setProblem('Use a PNG or JPG image. Export PDF or SVG designs as PNG first.');
    if (file.size > 10 * 1024 * 1024) return setProblem('That image is over 10 MB. Export it at 300 dpi as a JPG to make it smaller.');
    setProgress(0);
    try {
      const { key, url } = await uploadBadgeArtwork(editionId, file, setProgress);
      onUploaded(key, url);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'The upload failed. Try again.');
    } finally {
      setProgress(null);
    }
  };

  const mismatch = shape ? artworkMismatch(design.size, shape) : 0;
  const low = shape ? shape.width < px.width * 0.6 : false;

  return (
    <Section title="Background artwork">
      {!design.artwork || !artworkUrl ? (
        <>
          <p className="-mt-1 text-xs text-[#7c7c7c]">
            Use your own design, with sponsors and branding, in place of the header band. Make it {Math.round(w)} × {Math.round(h)} mm ({px.width} × {px.height} px at 300 dpi), leaving clear space for the name, photo and QR.
          </p>
          <label htmlFor={inputId} className={cn(buttonClass({ style: 'outline', color: 'gray' }), 'w-fit cursor-pointer', progress !== null && 'pointer-events-none opacity-60')}>
            <PhotoIcon className="size-4" />
            {progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : 'Upload artwork'}
          </label>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- a signed storage link, not a static asset */}
            <img
              src={artworkUrl}
              alt="Badge artwork"
              onLoad={(e) => setShape({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
              className="h-20 w-auto rounded border border-border object-contain"
            />
            <div className="flex flex-col gap-1.5">
              <label htmlFor={inputId} className={cn(buttonClass({ style: 'borderless', color: 'gray', className: 'h-8 w-fit px-2' }), 'cursor-pointer', progress !== null && 'pointer-events-none opacity-60')}>
                <PhotoIcon className="size-4" />
                {progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : 'Replace'}
              </label>
              <button type="button" onClick={onRemove} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8 w-fit px-2 hover:text-danger' })}>
                <TrashIcon className="size-4" />
                Remove artwork
              </button>
            </div>
          </div>
          {(mismatch > 0.03 || low) && (
            <p className="flex items-start gap-1.5 text-xs text-[#8a6d00]">
              <ExclamationTriangleIcon className="mt-px size-4 shrink-0" />
              {mismatch > 0.03 ? `This image is a different shape from a ${SIZE_LABEL[design.size].split(' · ')[0]} badge, so its edges are cropped. ` : ''}
              {low ? `At ${shape!.width} px wide it may print soft; ${px.width} px is best.` : ''}
            </p>
          )}
          {design.layout && (
            <ul className="flex flex-col gap-2">
              {BADGE_PARTS.map((part) => (
                <li key={part} className="grid grid-cols-[8rem_minmax(0,1fr)_3rem] items-center gap-3">
                  <label htmlFor={`${inputId}-${part}`} className="text-sm text-[#525252]">
                    {PART_LABEL[part]}
                  </label>
                  <input
                    id={`${inputId}-${part}`}
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={design.layout![part].scale}
                    onChange={(e) => onScale(part, Number(e.target.value))}
                    className="accent-primary"
                  />
                  <span className="text-right text-xs tabular-nums text-[#7c7c7c]">{Math.round(design.layout![part].scale * 100)}%</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <input id={inputId} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      {problem && <p className="text-xs text-danger">{problem}</p>}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 border-b border-border px-5 py-4 last:border-b-0">
      <p className="text-sm font-medium text-ink">{title}</p>
      {children}
    </div>
  );
}

function ColourPicker({ value, onChange, label }: { value: string; onChange: (hex: string) => void; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={label}>
      {SWATCHES.map((s) => (
        <button
          key={s}
          type="button"
          aria-label={s}
          aria-pressed={value.toLowerCase() === s}
          onClick={() => onChange(s)}
          className={cn('size-6 rounded-full border border-border', value.toLowerCase() === s && 'ring-2 ring-primary ring-offset-2')}
          style={{ background: s }}
        />
      ))}
      <label className="relative flex h-6 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-xs text-[#525252] hover:border-[#bdbdbd]">
        <span className="size-3 rounded-sm" style={{ background: value }} aria-hidden />
        Custom
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={`${label}: custom colour`} />
      </label>
    </div>
  );
}

/** One person's badge, opened from the list, with a print button for a reprint at the desk. */
function PreviewDialog({
  holder,
  design,
  edition,
  artworkUrl,
  printing,
  onPrint,
  onClose,
}: {
  holder: BadgeHolder | null;
  design: BadgeDesign;
  edition: Edition;
  artworkUrl: string | null;
  printing: boolean;
  onPrint: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (holder && !dialog.open) dialog.showModal();
    if (!holder && dialog.open) dialog.close();
  }, [holder]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={modalClass('md')}
    >
      {holder && (
        <div className="flex flex-col gap-5 p-6">
          <ModalHeader icon={IdentificationIcon} title={holder.name} titleId={titleId} subtitle={`${holder.tierName} · ${holder.code}`} />
          <div className="rounded-lg bg-[#f6f6f6] py-5">
            <BadgePreview holder={holder} design={design} edition={edition} artworkUrl={artworkUrl} />
          </div>
          <ModalActions>
            <button type="button" autoFocus onClick={onClose} className={cancelClass}>
              Close
            </button>
            <button type="button" disabled={printing} onClick={onPrint} className={buttonClass()}>
              <PrinterIcon className="size-4" />
              Print badge
            </button>
          </ModalActions>
        </div>
      )}
    </dialog>
  );
}

/** Badges: design each event's badge, then print them for everyone or reprint one at the desk. */
export default function BadgesPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Badges carry the ticket's door QR">
      {(editionId) => <BadgeBoard edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

function BadgeBoard({ edition }: { edition: Edition }) {
  const toast = useToast();
  const stored = useBadgeDesign(edition.id);
  const save = useSaveBadgeDesign(edition.id);
  const holders = useBadgeHolders(edition.id);
  const tiers = useTicketTypes(edition.id);

  const [draft, setDraft] = useState<BadgeDesign | null>(null);
  const design = draft ?? stored.data?.design ?? null;
  const dirty = !!draft && !!stored.data && !sameDesign(draft, stored.data.design);
  // just-uploaded artwork shows from this browser's copy until the design is saved and read back
  const [localArt, setLocalArt] = useState<{ key: string; url: string } | null>(null);
  const artworkUrl = design?.artwork ? (localArt?.key === design.artwork ? localArt.url : (stored.data?.artworkUrl ?? null)) : null;

  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('all');
  const [layout, setLayout] = useState<PrintLayout>('sheet');
  const [pageNo, setPageNo] = useState(1);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [tab, setTab] = useState<'print' | 'design'>('print');
  useSubPage(tab === 'design' ? 'Design' : null, () => setTab('print'));

  const all = useMemo(() => holders.data ?? [], [holders.data]);
  const shown = useMemo(() => filterHolders(all, search, tier), [all, search, tier]);
  const { rows, pages, page } = paginate(shown, pageNo);
  const previewing = all.find((h) => h.ticketId === previewId) ?? null;
  const sample = shown[0] ?? all[0] ?? null;
  const tierNames = useMemo(() => {
    const names = new Set((tiers.data?.tiers ?? []).map((t) => t.name));
    all.forEach((h) => names.add(h.tierName));
    return [...names];
  }, [tiers.data, all]);
  const tierOptions = useMemo(() => {
    const seen = new Map<string, string>();
    (tiers.data?.tiers ?? []).forEach((t) => seen.set(t.id, t.name));
    all.forEach((h) => seen.set(h.ticketTypeId, h.tierName));
    return [{ value: 'all', label: 'All tiers' }, ...[...seen].map(([value, label]) => ({ value, label }))];
  }, [tiers.data, all]);

  if (stored.isPending || !design) return <Skeleton className="h-[36rem] w-full rounded-2xl" />;
  if (stored.isError) {
    return (
      <p role="alert" className={cn(cardClass, 'p-6 text-sm text-danger')}>
        {stored.error.message}
      </p>
    );
  }

  const edit = (next: Partial<BadgeDesign>) => setDraft({ ...design, ...next });
  const toggle = (field: (typeof BADGE_FIELDS)[number], on: boolean) => edit({ fields: on ? BADGE_FIELDS.filter((f) => f === field || design.fields.includes(f)) : design.fields.filter((f) => f !== field) });

  const print = async (list: BadgeHolder[], how: PrintLayout) => {
    if (list.length === 0) return;
    setPrinting(true);
    try {
      await printBadges(list, design, edition, how, artworkUrl);
    } catch (e) {
      toast.push({ title: 'Badges not printed', body: e instanceof Error ? e.message : 'Try again.', leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } });
    } finally {
      setPrinting(false);
    }
  };

  const perSheet = SHEET_GRID[design.size].cols * SHEET_GRID[design.size].rows;

  const tabs = [
    { value: 'print' as const, label: 'Print badges' },
    { value: 'design' as const, label: 'Design' },
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Badges" className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={tab === t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                tab === t.value ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink',
              )}
            >
              {t.label}
              {t.value === 'design' && dirty && <span className="size-1.5 rounded-full bg-gold" aria-label="unsaved changes" />}
            </button>
          ))}
        </div>
        {tab === 'print' && (
          <p className="text-sm text-[#7c7c7c]">
            {dirty ? 'Printing with your unsaved design changes. ' : stored.data?.saved ? '' : 'Printing with the default design. '}
            <button type="button" onClick={() => setTab('design')} className="text-primary hover:underline">
              {dirty ? 'Review and save' : 'Change the design'}
            </button>
          </p>
        )}
      </div>

      {tab === 'design' && (
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section aria-labelledby="badge-design" className={cardClass}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id="badge-design" className="text-base font-medium text-ink">
                Badge design
              </h2>
              <p className="text-sm text-[#7c7c7c]">{stored.data?.saved ? `Saved for ${edition.shortName}` : 'Not saved yet: the default design prints until you save one.'}</p>
            </div>
            <div className="flex items-center gap-2">
              {dirty && (
                <button type="button" onClick={() => setDraft(null)} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                  <ArrowPathIcon className="size-4" />
                  Undo changes
                </button>
              )}
              <button
                type="button"
                disabled={(!dirty && !!stored.data?.saved) || save.isPending}
                onClick={() =>
                  save.mutate({ design, artworkUrl }, {
                    onSuccess: () => {
                      setDraft(null);
                      toast.push({ title: 'Badge design saved', body: `Badges for ${edition.shortName} print with it from now on.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } });
                    },
                    onError: (e) => toast.push({ title: 'Design not saved', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
                  })
                }
                className={buttonClass()}
              >
                <CheckIcon className="size-4" />
                {save.isPending ? 'Saving…' : `Save for ${edition.shortName}`}
              </button>
            </div>
          </header>

          <Section title="Size">
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Badge size">
              {BADGE_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={design.size === s}
                  onClick={() => edit({ size: s })}
                  className={cn('rounded-lg border px-3 py-2.5 text-left text-sm transition-colors', design.size === s ? 'border-primary bg-primary-soft/40 text-ink' : 'border-border text-[#525252] hover:border-[#bdbdbd]')}
                >
                  <span className="block font-medium">{SIZE_LABEL[s].split(' · ')[0]}</span>
                  <span className="block text-xs text-[#7c7c7c]">{SIZE_LABEL[s].split(' · ')[1]}</span>
                </button>
              ))}
            </div>
          </Section>

          <ArtworkSection
            editionId={edition.id}
            design={design}
            artworkUrl={artworkUrl}
            onUploaded={(key, url) => {
              setLocalArt({ key, url });
              edit({ artwork: key, layout: design.layout ?? defaultLayout(design.size) });
            }}
            onRemove={() => edit({ artwork: null, layout: null })}
            onScale={(part, scale) => design.layout && edit({ layout: { ...design.layout, [part]: clampPlacement({ ...design.layout[part], scale }) } })}
          />

          <Section title={design.artwork ? 'Accent colour' : 'Header colour'}>
            {design.artwork && <p className="-mt-1 text-xs text-[#7c7c7c]">Your artwork replaces the header band; this colours the initials shown for people without a photo.</p>}
            <ColourPicker label={design.artwork ? 'Accent colour' : 'Header colour'} value={design.accent} onChange={(accent) => edit({ accent })} />
          </Section>

          <Section title="On the badge">
            <p className="-mt-1 text-xs text-[#7c7c7c]">The name is always printed. Blank details are left out for that person.</p>
            <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
              {BADGE_FIELDS.map((f) => (
                <li key={f} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-[#525252]">{FIELD_LABEL[f]}</span>
                  <Switch checked={design.fields.includes(f)} onChange={(on) => toggle(f, on)} label={FIELD_LABEL[f]} />
                </li>
              ))}
            </ul>
            {!design.fields.includes('qr') && <p className="text-xs text-danger">Without the QR code, the badge cannot be scanned at the door.</p>}
          </Section>

          {design.fields.includes('tier') && (
            <Section title="Tier colours">
              <p className="-mt-1 text-xs text-[#7c7c7c]">The band at the foot of the badge, so the door and ushers can tell tiers apart at a glance.</p>
              {tierNames.length === 0 ? (
                <p className="text-sm text-[#7c7c7c]">No ticket tiers yet.</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {tierNames.map((name) => (
                    <li key={name} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="w-28 truncate text-sm text-ink">{name}</span>
                      <ColourPicker label={`${name} colour`} value={tierColour(design, name)} onChange={(c) => setDraft(withTierColour(design, name, c))} />
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          )}
        </section>

        <section aria-label="Preview" className={cn(cardClass, 'flex flex-col items-center gap-4 bg-[#f6f6f6] px-5 py-6 lg:sticky lg:top-4')}>
          <BadgePreview
            holder={sample}
            design={design}
            edition={edition}
            artworkUrl={artworkUrl}
            onPlace={(part, placement) => design.layout && edit({ layout: { ...design.layout, [part]: placement } })}
          />
          <button type="button" disabled={printing} onClick={() => void print([sample ?? SAMPLE_HOLDER], 'single')} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <PrinterIcon className="size-4" />
            Print a test badge
          </button>
        </section>
      </div>
      )}

      {tab === 'print' && (
      <section aria-labelledby="badge-holders" className={cardClass}>
        <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4">
          <div className="mr-auto">
            <h2 id="badge-holders" className="text-base font-medium text-ink">
              Ticket holders
            </h2>
            <p className="text-sm text-[#7c7c7c]">{holders.data ? `${count(shown.length)} of ${count(all.length)} ${all.length === 1 ? 'badge' : 'badges'}` : 'Loading…'}</p>
          </div>
          <TextInput
            icon={MagnifyingGlassIcon}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPageNo(1);
            }}
            placeholder="Name, organisation or code"
            aria-label="Search ticket holders"
            className="w-64"
          />
          <div className="w-40">
            <Select
              label="Tier"
              value={tier}
              options={tierOptions}
              onChange={(v) => {
                setTier(v);
                setPageNo(1);
              }}
            />
          </div>
          <div className="w-52">
            <Select<PrintLayout>
              label="Print layout"
              value={layout}
              options={[
                { value: 'sheet', label: `A4 sheets · ${perSheet} per page` },
                { value: 'single', label: 'Badge printer · 1 per page' },
              ]}
              onChange={setLayout}
            />
          </div>
          <button type="button" disabled={shown.length === 0 || printing} onClick={() => void print(shown, layout)} className={buttonClass()}>
            <PrinterIcon className="size-4" />
            {printing ? 'Preparing…' : `Print ${count(shown.length)} ${shown.length === 1 ? 'badge' : 'badges'}`}
          </button>
        </header>

        {holders.isPending ? (
          <div className="flex flex-col gap-2 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : holders.isError ? (
          <div role="alert" className="p-10 text-center">
            <p className="font-medium text-ink">Ticket holders could not load.</p>
            <p className="mt-1 text-sm text-muted">{holders.error.message}</p>
            <button type="button" onClick={() => void holders.refetch()} className={buttonClass({ className: 'mt-4' })}>
              Try again
            </button>
          </div>
        ) : all.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary">
              <IdentificationIcon className="size-6" />
            </span>
            <p className="font-medium text-ink">No tickets issued yet</p>
            <p className="max-w-md text-sm text-[#7c7c7c]">A badge appears here for every ticket as soon as it is paid for or issued.</p>
          </div>
        ) : shown.length === 0 ? (
          <p className="px-6 py-12 text-center text-sm text-[#7c7c7c]">Nobody matches. Try another name or tier.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse">
                <thead>
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Tier</th>
                    <th className={th}>Ticket code</th>
                    <th className={th}>At the door</th>
                    <th className={cn(th, 'text-right')}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.ticketId}>
                      <td className={td}>
                        <p className="text-ink">{h.name}</p>
                        <p className="text-xs text-[#7c7c7c]">{[h.title, h.organisation].filter(Boolean).join(', ') || '—'}</p>
                      </td>
                      <td className={td}>
                        <span className="inline-flex items-center gap-2 text-[#525252]">
                          <span className="size-2.5 rounded-sm" style={{ background: tierColour(design, h.tierName) }} aria-hidden />
                          {h.tierName}
                        </span>
                      </td>
                      <td className={cn(td, 'font-mono text-xs text-[#525252]')}>{h.code}</td>
                      <td className={cn(td, 'text-[#525252]')}>{h.admitted > 0 ? `In${h.quantity > 1 ? ` · ${h.admitted} of ${h.quantity}` : ''}` : 'Not yet'}</td>
                      <td className={cn(td, 'text-right whitespace-nowrap')}>
                        <button type="button" onClick={() => setPreviewId(h.ticketId)} className={buttonClass({ style: 'borderless', color: 'gray' })} aria-label={`Preview ${h.name}'s badge`}>
                          <EyeIcon className="size-4" />
                          Preview
                        </button>
                        <button type="button" disabled={printing} onClick={() => void print([h], 'single')} className={buttonClass({ style: 'borderless', color: 'primary' })} aria-label={`Print ${h.name}'s badge`}>
                          <PrinterIcon className="size-4" />
                          Print
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end px-5 py-3">
              <Pagination page={page} pages={pages} onChange={setPageNo} label="Badge pages" />
            </div>
          </>
        )}
      </section>
      )}
      <PreviewDialog
        holder={previewing}
        design={design}
        edition={edition}
        artworkUrl={artworkUrl}
        printing={printing}
        onPrint={() => previewing && void print([previewing], 'single')}
        onClose={() => setPreviewId(null)}
      />
    </div>
  );
}
