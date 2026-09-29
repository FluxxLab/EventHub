'use client';

import { AcademicCapIcon, ArrowDownTrayIcon, ArrowPathIcon, ExclamationTriangleIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import {
  ARTWORK_TYPES,
  aspectWarning,
  clamp01,
  cssFont,
  DEFAULT_CODE,
  DEFAULT_NAME,
  layoutFraction,
  lowResolution,
  SAMPLE_NAME,
  type CertificateAlign,
  type CertificateDesign,
  type TextPlacement,
} from '@/lib/certificates/certificates';
import { fetchSampleCertificate, useCertificateDesign, useRemoveCertificateDesign, useSaveCertificateDesign, type DesignArtwork } from '@/lib/certificates/use-certificates';
import { dateRange, type Edition } from '@/lib/events/events';
import { ago } from '@/lib/format';
import { formatBytes } from '@/lib/materials/materials';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

type Which = 'name' | 'code';
type Draft = { artwork: DesignArtwork | null; name: TextPlacement; code: TextPlacement | null };

const MAX_BYTES = 20 * 1024 * 1024;
const SWATCHES = [
  { value: '#002d74', label: 'PIC navy' },
  { value: '#c9a227', label: 'Gold' },
  { value: '#1a1a1a', label: 'Black' },
  { value: '#525252', label: 'Grey' },
  { value: '#ffffff', label: 'White' },
];
const SAMPLE_CODE = 'GS27-SAMPL-ECODE';
/** Nearer than this to the middle snaps to it: most certificates centre the name. */
const SNAP = 0.012;

function fromDesign(design: CertificateDesign): Draft {
  const t = design.template;
  if (!t || !design.artworkUrl) return { artwork: null, name: DEFAULT_NAME, code: DEFAULT_CODE };
  return { artwork: { key: t.key, contentType: t.contentType, width: t.width, height: t.height, previewUrl: design.artworkUrl }, name: t.name, code: t.code };
}

const sameText = (a: Draft, b: Draft) => JSON.stringify([a.name, a.code]) === JSON.stringify([b.name, b.code]);

let measureContext: CanvasRenderingContext2D | null = null;
/** Width of the text in the browser's closest match to the PDF font (Times or Helvetica). */
function measure(text: string, p: TextPlacement, px: number): number {
  if (typeof document === 'undefined') return 0;
  measureContext ??= document.createElement('canvas').getContext('2d');
  if (!measureContext) return 0;
  measureContext.font = cssFont(p, px);
  return measureContext.measureText(text).width;
}

function readImage(file: File): Promise<{ width: number; height: number; url: string }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That image could not be read. Export it again as a PNG or JPG.'));
    };
    image.src = url;
  });
}

function useElementWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return [setElement, width] as const;
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-border bg-[#f6f6f6] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn('h-8 flex-1 rounded-md px-2 text-sm', value === o.value ? 'bg-surface font-medium text-ink shadow-sm' : 'text-[#525252] hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Control({ label, value, children }: { label: string; value?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-[#525252]">{label}</span>
        {value && <span className="tabular-nums text-[#7c7c7c]">{value}</span>}
      </div>
      {children}
    </div>
  );
}

/** One line of text on the preview: dragged with the pointer, nudged with the arrow keys. */
function TextBox({
  label,
  text,
  p,
  width,
  height,
  selected,
  onSelect,
  onMove,
  onDragging,
}: {
  label: string;
  text: string;
  p: TextPlacement;
  width: number;
  height: number;
  selected: boolean;
  onSelect: () => void;
  onMove: (x: number, y: number) => void;
  onDragging: (dragging: boolean) => void;
}) {
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  const box = layoutFraction(p, width / height, text, measure, width);
  const end = () => {
    drag.current = null;
    onDragging(false);
  };
  const move = (e: PointerEvent) => {
    const d = drag.current;
    if (d) onMove(d.x + (e.clientX - d.px) / width, d.y + (e.clientY - d.py) / height);
  };
  const nudge = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 0.02 : 0.004;
    const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
    const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
    if (!dx && !dy) return;
    e.preventDefault();
    onMove(p.x + dx, p.y + dy);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label}. Drag to move, or use the arrow keys.`}
      aria-pressed={selected}
      onFocus={onSelect}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { px: e.clientX, py: e.clientY, x: p.x, y: p.y };
        onSelect();
        onDragging(true);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={nudge}
      className={cn(
        'absolute cursor-move touch-none select-none whitespace-nowrap outline-offset-2',
        selected ? 'outline-2 outline-primary' : 'outline-1 outline-[#7c7c7c]/70 outline-dashed hover:outline-primary',
      )}
      style={{
        left: `${box.left * 100}%`,
        top: `${box.top * 100}%`,
        width: `${box.width * 100}%`,
        font: cssFont(p, box.fontSize * height),
        lineHeight: 1,
        color: p.color,
        textAlign: p.align,
      }}
    >
      {text}
    </div>
  );
}

function Controls({ which, p, pageHeightPt, onChange }: { which: Which; p: TextPlacement; pageHeightPt: number; onChange: (p: TextPlacement) => void }) {
  const id = useId();
  const set = (patch: Partial<TextPlacement>) => onChange({ ...p, ...patch });
  return (
    <div className="grid gap-4">
      <Control label="Typeface">
        <div className="flex gap-2">
          <div className="flex-1">
            <Segmented
              label="Typeface"
              value={p.font}
              options={[
                { value: 'serif', label: 'Serif' },
                { value: 'sans', label: 'Sans' },
              ]}
              onChange={(font) => set({ font })}
            />
          </div>
          <button
            type="button"
            aria-pressed={p.bold}
            onClick={() => set({ bold: !p.bold })}
            className={cn('h-9 w-10 rounded-lg border text-sm font-bold', p.bold ? 'border-primary bg-primary-soft text-primary' : 'border-border text-[#525252] hover:border-[#bdbdbd]')}
          >
            <span className="sr-only">Bold</span>
            <span aria-hidden>B</span>
          </button>
        </div>
      </Control>
      <Control label="Size" value={`${Math.round(p.size * pageHeightPt)} pt`}>
        <input
          id={`${id}-size`}
          aria-label={`${which === 'name' ? 'Name' : 'Code'} size`}
          type="range"
          min={0.01}
          max={which === 'name' ? 0.15 : 0.05}
          step={0.001}
          value={p.size}
          onChange={(e) => set({ size: Number(e.target.value) })}
          className="accent-primary"
        />
      </Control>
      <Control label="Widest it may run" value={`${Math.round(p.maxWidth * 100)}% of the page`}>
        <input
          aria-label={`${which === 'name' ? 'Name' : 'Code'} width`}
          type="range"
          min={0.1}
          max={1}
          step={0.01}
          value={p.maxWidth}
          onChange={(e) => set({ maxWidth: Number(e.target.value) })}
          className="accent-primary"
        />
      </Control>
      <Control label="Alignment">
        <Segmented<CertificateAlign>
          label="Alignment"
          value={p.align}
          options={[
            { value: 'left', label: 'Left' },
            { value: 'center', label: 'Centre' },
            { value: 'right', label: 'Right' },
          ]}
          onChange={(align) => set({ align })}
        />
      </Control>
      <Control label="Colour" value={p.color}>
        <div className="flex items-center gap-2">
          {SWATCHES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.label}
              aria-label={s.label}
              aria-pressed={p.color.toLowerCase() === s.value}
              onClick={() => set({ color: s.value })}
              className={cn('size-7 rounded-full border border-border', p.color.toLowerCase() === s.value && 'ring-2 ring-primary ring-offset-2')}
              style={{ background: s.value }}
            />
          ))}
          <label className="relative ml-auto flex h-7 cursor-pointer items-center rounded-md border border-border px-2 text-xs text-[#525252] hover:border-[#bdbdbd]">
            Custom
            <input type="color" value={p.color} onChange={(e) => set({ color: e.target.value })} className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
        </div>
      </Control>
    </div>
  );
}

/**
 * The edition's certificate: the organiser uploads the artwork (the name left blank), places the
 * name and verification code on it, and the API prints each delegate's name there when they
 * download. The preview lays text out the way the PDF does, so what is shown is what they get.
 */
export function CertificateDesigner({ editions }: { editions: Edition[] }) {
  const id = useId();
  const toast = useToast();
  const now = useNow(60_000).getTime();
  const [editionId, setEditionId] = useState(() => (editions.find((e) => e.isCurrent) ?? editions[0])?.id);
  const edition = editions.find((e) => e.id === editionId);
  const design = useCertificateDesign(editionId);
  const [progress, setProgress] = useState<number | null>(null);
  const save = useSaveCertificateDesign(editionId, setProgress);
  const remove = useRemoveCertificateDesign(editionId);

  const [draft, setDraft] = useState<Draft>({ artwork: null, name: DEFAULT_NAME, code: DEFAULT_CODE });
  const [syncedFor, setSyncedFor] = useState<string | null>(null);
  const [which, setWhich] = useState<Which>('name');
  const [sampleName, setSampleName] = useState(SAMPLE_NAME);
  const [problem, setProblem] = useState<string | null>(null);
  const [switchTo, setSwitchTo] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewRef, previewWidth] = useElementWidth();

  // Take the saved design into the editor when it loads or changes (a save, another event).
  const stamp = design.data ? `${editionId}:${design.data.template?.updatedAt ?? 'none'}` : null;
  if (stamp && design.data && stamp !== syncedFor) {
    setSyncedFor(stamp);
    setDraft(fromDesign(design.data));
    setProblem(null);
  }

  const saved = design.data ? fromDesign(design.data) : null;
  const template = design.data?.template ?? null;
  const dirty = Boolean(draft.artwork && (draft.artwork.file || !saved || !sameText(draft, saved)));
  const artwork = draft.artwork;
  const portrait = artwork ? artwork.height > artwork.width : false;
  // The PDF is A4 and the artwork is stretched onto it, so the preview is A4 too.
  const aspect = portrait ? 1 / Math.SQRT2 : Math.SQRT2;
  const pageHeightPt = portrait ? 841.89 : 595.28;
  const previewHeight = previewWidth / aspect;
  const selected = which === 'code' ? draft.code : draft.name;
  const warnings = artwork ? [aspectWarning(artwork.width, artwork.height), lowResolution(artwork.width, artwork.height) ? `At ${artwork.width}×${artwork.height} the artwork will look soft in print. 3508×2480 (A4 at 300 dpi) is sharp.` : null].filter(Boolean) : [];

  const place = (w: Which, p: TextPlacement) => setDraft((d) => ({ ...d, [w]: p }));
  const moveTo = (w: Which, x: number, y: number) => {
    const p = w === 'code' ? draft.code : draft.name;
    if (!p) return;
    const snapped = Math.abs(x - 0.5) < SNAP ? 0.5 : x;
    place(w, { ...p, x: clamp01(snapped), y: clamp01(y) });
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!(ARTWORK_TYPES as readonly string[]).includes(file.type)) return setProblem('Upload the design as a PNG or JPG. Export PDFs and other formats to PNG first.');
    if (file.size > MAX_BYTES) return setProblem(`That file is ${formatBytes(file.size)}. Keep the artwork under ${formatBytes(MAX_BYTES)}.`);
    try {
      const image = await readImage(file);
      if (Math.min(image.width, image.height) < 100) return setProblem('That image is too small to print.');
      if (draft.artwork?.file) URL.revokeObjectURL(draft.artwork.previewUrl);
      setProblem(null);
      setDraft((d) => ({ ...d, artwork: { file, contentType: file.type as DesignArtwork['contentType'], width: image.width, height: image.height, previewUrl: image.url } }));
    } catch (error) {
      setProblem((error as Error).message);
    }
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void pick(e.dataTransfer.files[0]);
  };

  const submit = (confirmed = false) => {
    if (!artwork || !edition) return;
    // new artwork over a design delegates already download: say which event before replacing it
    if (artwork.file && template && !confirmed) return setReplacing(true);
    setReplacing(false);
    save.mutate(
      { artwork, name: draft.name, code: draft.code },
      {
        onSuccess: () =>
          toast.push({ title: 'Certificate saved', body: `Delegates at ${edition.shortName} can download it with their name printed on it.`, leading: { kind: 'icon', icon: AcademicCapIcon, tone: 'success' } }),
      },
    );
  };
  const discard = () => {
    if (saved) setDraft(saved);
    setProblem(null);
  };
  const downloadSample = async () => {
    if (!edition) return;
    setDownloading(true);
    try {
      const blob = await fetchSampleCertificate(edition.id, sampleName.trim() || SAMPLE_NAME);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${edition.shortName.replace(/[^\w-]+/g, '-')}-sample-certificate.pdf`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (error) {
      toast.push({ title: 'No sample', body: (error as Error).message, leading: { kind: 'icon', icon: ExclamationTriangleIcon, tone: 'danger' } });
    } finally {
      setDownloading(false);
    }
  };
  const chooseEdition = (next: string) => {
    if (next === editionId) return;
    if (dirty) return setSwitchTo(next);
    setEditionId(next);
  };

  const fileInput = (
    <input id={`${id}-file`} type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => {
      void pick(e.target.files?.[0]);
      e.target.value = '';
    }} />
  );

  return (
    <section aria-labelledby={`${id}-t`} className="overflow-hidden rounded-2xl border border-border bg-surface lg:col-span-2">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-medium text-ink">
            <AcademicCapIcon className="size-5 text-primary" /> Certificate
            {template && !dirty && (
              <Tag tone="green" dot>
                Live in the app
              </Tag>
            )}
            {dirty && (
              <Tag tone="gold" dot>
                Unsaved changes
              </Tag>
            )}
            {!template && !dirty && <Tag>Not set up</Tag>}
          </h2>
          <p className="text-sm text-[#7c7c7c]">
            {template ? `Each delegate downloads this with their own name. Saved ${ago(template.updatedAt, now).toLowerCase()}.` : 'Delegates can download a certificate for this event once a design is saved.'}
          </p>
        </div>
      </header>
      {/* Always shown, even with one event: the organiser must see which event the design is for. */}
      <div className="flex flex-col gap-2 border-b border-border bg-[#f6f6f6] px-6 py-3 sm:flex-row sm:items-center sm:gap-3">
        <label htmlFor={`${id}-event`} className="text-sm text-[#525252]">
          Event
        </label>
        <div className="w-full sm:w-96">
          <Select id={`${id}-event`} value={editionId ?? ''} options={editions.map((e) => ({ value: e.id, label: `${e.name} · ${dateRange(e.startsAt, e.endsAt)}` }))} onChange={chooseEdition} />
        </div>
        <p className="text-xs text-[#7c7c7c]">Each event has its own certificate.</p>
      </div>

      {design.isPending ? (
        <div className="p-6">
          <Skeleton className="aspect-[1.414] w-full" />
        </div>
      ) : design.isError ? (
        <p role="alert" className="p-6 text-sm text-danger">
          {design.error.message}
        </p>
      ) : !artwork ? (
        <div className="p-6">
          <label
            htmlFor={`${id}-file`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={drop}
            className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-14 text-center', dragOver ? 'border-primary bg-primary-soft/40' : 'border-[#bdbdbd] hover:border-primary')}
          >
            <PhotoIcon className="size-8 text-[#7c7c7c]" />
            <span className="text-[15px] text-ink">Upload the certificate for {edition?.name ?? 'this event'}</span>
            <span className="max-w-md text-sm text-[#7c7c7c]">
              PNG or JPG, A4 landscape or portrait. 3508×2480 px prints sharply. Leave the name blank: you place it on the next step, and each delegate’s is printed there.
            </span>
            <span className={buttonClass({ style: 'outline', color: 'gray', className: 'mt-2' })}>Choose a file</span>
            {fileInput}
          </label>
          {problem && <p className="mt-3 text-sm text-danger">{problem}</p>}
        </div>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div className="border-b border-border p-4 sm:p-6 lg:border-r lg:border-b-0">
            <div
              ref={previewRef}
              onDragOver={(e) => e.preventDefault()}
              onDrop={drop}
              className="relative w-full overflow-hidden rounded-md bg-[#f1f1f1] shadow-[0_1px_3px_rgba(0,0,0,.12)]"
              style={{ aspectRatio: String(aspect) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed or local URL, drawn stretched exactly as the PDF places it */}
              <img src={artwork.previewUrl} alt="Certificate artwork" draggable={false} className="absolute inset-0 size-full select-none object-fill" />
              {previewWidth > 0 && (
                <>
                  {dragging && selected?.x === 0.5 && <div aria-hidden className="pointer-events-none absolute inset-y-0 left-1/2 border-l border-dashed border-primary/40" />}
                  <TextBox label="Delegate name" text={sampleName.trim() || SAMPLE_NAME} p={draft.name} width={previewWidth} height={previewHeight} selected={which === 'name'} onSelect={() => setWhich('name')} onMove={(x, y) => moveTo('name', x, y)} onDragging={setDragging} />
                  {draft.code && (
                    <TextBox label="Certificate code" text={SAMPLE_CODE} p={draft.code} width={previewWidth} height={previewHeight} selected={which === 'code'} onSelect={() => setWhich('code')} onMove={(x, y) => moveTo('code', x, y)} onDragging={setDragging} />
                  )}
                </>
              )}
            </div>
            <p className="mt-3 text-xs text-[#7c7c7c]">Drag the name and code into place. Arrow keys nudge the selected one; hold Shift for bigger steps. Long names shrink to fit their width.</p>
            {warnings.map((w) => (
              <p key={w} className="mt-2 flex items-start gap-1.5 text-xs text-gold">
                <ExclamationTriangleIcon className="mt-px size-3.5 shrink-0" /> {w}
              </p>
            ))}
            {problem && <p className="mt-2 text-sm text-danger">{problem}</p>}
          </div>

          <div className="grid content-start gap-5 p-4 sm:p-6">
            <Segmented<Which>
              label="Text to edit"
              value={which}
              options={[
                { value: 'name', label: 'Name' },
                { value: 'code', label: 'Code' },
              ]}
              onChange={setWhich}
            />
            {which === 'name' ? (
              <Control label="Preview with">
                <TextInput aria-label="Sample name" value={sampleName} onChange={(e) => setSampleName(e.target.value)} maxLength={120} />
              </Control>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id={`${id}-code-l`} className="text-sm text-ink">
                    Print the code
                  </p>
                  <p className="text-xs text-[#7c7c7c]">Lets anyone confirm the certificate is genuine.</p>
                </div>
                <Switch checked={Boolean(draft.code)} labelledBy={`${id}-code-l`} onChange={(on) => setDraft((d) => ({ ...d, code: on ? (saved?.code ?? DEFAULT_CODE) : null }))} />
              </div>
            )}
            {selected ? <Controls which={which} p={selected} pageHeightPt={pageHeightPt} onChange={(p) => place(which, p)} /> : <p className="text-sm text-[#7c7c7c]">The code is left off. Verifiers will have nothing to check.</p>}
          </div>
        </div>
      )}

      {artwork && (
        <footer className="flex flex-wrap items-center gap-2 border-t border-border bg-[#f6f6f6] px-4 py-3 sm:px-6">
          {template && (
            <button type="button" onClick={() => setRemoving(true)} className={buttonClass({ style: 'borderless', color: 'danger' })}>
              Remove
            </button>
          )}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <label htmlFor={`${id}-file`} className={buttonClass({ style: 'outline', color: 'gray', className: 'cursor-pointer' })}>
              <ArrowPathIcon className="size-4" /> Replace artwork
              {fileInput}
            </label>
            {dirty && saved?.artwork ? (
              <button type="button" onClick={discard} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Discard
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void downloadSample()}
                disabled={!template || downloading}
                title={template ? 'The saved design, rendered as a delegate gets it' : 'Save the design first'}
                className={buttonClass({ style: 'outline', color: 'gray' })}
              >
                <ArrowDownTrayIcon className="size-4" /> {downloading ? 'Preparing…' : 'Sample PDF'}
              </button>
            )}
            <button type="button" onClick={() => submit()} disabled={!dirty || save.isPending} className={buttonClass()}>
              {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : save.isPending ? 'Saving…' : `Save for ${edition?.shortName ?? 'this event'}`}
            </button>
          </div>
          {save.error && <p className="w-full text-right text-sm text-danger">{save.error.message}</p>}
        </footer>
      )}

      <ConfirmDialog
        open={removing}
        title="Remove the certificate?"
        confirmLabel="Remove"
        pendingLabel="Removing…"
        pending={remove.isPending}
        tone="danger"
        onCancel={() => setRemoving(false)}
        onConfirm={() =>
          remove.mutate(undefined, {
            onSuccess: () => {
              setRemoving(false);
              toast.push({ title: 'Certificate removed', body: `Delegates at ${edition?.shortName ?? 'this event'} can no longer download one.`, leading: { kind: 'icon', icon: AcademicCapIcon, tone: 'success' } });
            },
          })
        }
      >
        Delegates at {edition?.name ?? 'this event'} will no longer be able to download a certificate. Ones already downloaded keep working, and their codes still verify.
      </ConfirmDialog>
      <ConfirmDialog open={replacing} title={`Replace the ${edition?.shortName ?? ''} certificate?`} confirmLabel="Replace" onCancel={() => setReplacing(false)} onConfirm={() => submit(true)}>
        Delegates at {edition?.name ?? 'this event'} will download the new design from now on. Certificates already downloaded keep their old look, and their codes still verify.
      </ConfirmDialog>
      <ConfirmDialog
        open={switchTo !== null}
        title="Discard your changes?"
        confirmLabel="Discard"
        tone="danger"
        onCancel={() => setSwitchTo(null)}
        onConfirm={() => {
          setEditionId(switchTo ?? editionId);
          setSwitchTo(null);
        }}
      >
        The certificate for {edition?.name ?? 'this event'} has unsaved changes.
      </ConfirmDialog>
    </section>
  );
}
