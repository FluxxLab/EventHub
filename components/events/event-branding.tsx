'use client';

import { CheckCircleIcon, CheckIcon, DocumentTextIcon, PaintBrushIcon, PhotoIcon } from '@heroicons/react/24/outline';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toaster';
import { BRAND_PRESETS, IMAGE_TYPES, imageProblem, normaliseColor, paleWarning, PIC_NAVY, textOn } from '@/lib/events/branding';
import { DECK_TEMPLATE_LABEL, type DeckTemplate, type Edition } from '@/lib/events/events';
import { useSaveBranding, type BrandingChange } from '@/lib/events/use-editions';
import { cn } from '@/lib/utils';

/** What the event has now, for the previews. */
type Current = Pick<Edition, 'name' | 'shortName'> & {
  coverUrl?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  logoDarkUrl?: string | null;
  brandGuideUrl?: string | null;
  brandGuideName?: string | null;
  deckTemplate?: DeckTemplate;
};

/** The largest brand guide accepted: the decks' designer reads guides up to about this size. */
const MAX_GUIDE_MB = 24;

/** The brand guide: a PDF the call-to-action decks are designed from. Shown by name. */
function GuidePick({
  id,
  file,
  current,
  onChange,
}: {
  id: string;
  file: File | null | undefined;
  current: { url?: string | null; name?: string | null };
  onChange: (file: File | null | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const name = file === undefined ? (current.url ? (current.name ?? 'Brand guide.pdf') : null) : (file?.name ?? null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    const why = f.type !== 'application/pdf' ? 'Choose a PDF.' : f.size > MAX_GUIDE_MB * 1024 * 1024 ? `The guide must be ${MAX_GUIDE_MB} MB or smaller.` : null;
    setProblem(why);
    if (!why) onChange(f);
  };
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface-soft px-4 py-3"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        <DocumentTextIcon className="size-6 shrink-0 text-placeholder" aria-hidden />
        <div className="min-w-0 flex-1">
          {name ? (
            current.url && file === undefined ? (
              <a href={current.url} target="_blank" rel="noreferrer" className="block truncate text-sm text-primary hover:underline">
                {name}
              </a>
            ) : (
              <p className="truncate text-sm text-ink">{name}</p>
            )
          ) : (
            <p className="text-sm text-placeholder">No brand guide yet</p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => input.current?.click()} className="font-medium text-primary hover:underline">
          {name ? 'Replace' : 'Choose the PDF'}
        </button>
        {name && (
          <button type="button" onClick={() => onChange(null)} className="text-ink-soft hover:underline">
            Remove
          </button>
        )}
        {file !== undefined && (
          <button type="button" onClick={() => onChange(undefined)} className="text-ink-soft hover:underline">
            Undo
          </button>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {problem && <p className="text-sm text-danger">{problem}</p>}
    </div>
  );
}

/** A picked file's preview URL, released when it changes or the form closes. */
function useFileUrl(file: File | null | undefined): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

/** The picture the event will show: the new file, nothing if removed, else what it has now. */
function useShown(file: File | null | undefined, current: string | null | undefined) {
  const picked = useFileUrl(file);
  return file === undefined ? (current ?? null) : picked;
}

function ImagePick({
  id,
  kind,
  file,
  shown,
  onChange,
  dark = false,
}: {
  id: string;
  kind: 'cover' | 'logo';
  file: File | null | undefined;
  shown: string | null;
  onChange: (file: File | null | undefined) => void;
  /** Preview on a dark ground: the logo for dark backgrounds. */
  dark?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const pick = (f: File | undefined) => {
    if (!f) return;
    const why = imageProblem(f, kind);
    setProblem(why);
    if (!why) onChange(f);
  };
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          'relative flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-border',
          dark ? 'bg-[#1a1f36]' : 'bg-surface-soft',
          kind === 'cover' ? 'aspect-[16/9] w-full' : 'size-24',
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          pick(e.dataTransfer.files[0]);
        }}
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- a local preview or the stored picture's signed URL
          <img src={shown} alt="" className={cn('size-full', kind === 'cover' ? 'object-cover' : 'object-contain p-2')} />
        ) : (
          <PhotoIcon className="size-8 text-placeholder" aria-hidden />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" onClick={() => input.current?.click()} className="font-medium text-primary hover:underline">
          {shown ? 'Replace' : kind === 'cover' ? 'Choose a picture' : 'Choose a logo'}
        </button>
        {shown && (
          <button type="button" onClick={() => onChange(null)} className="text-ink-soft hover:underline">
            Remove
          </button>
        )}
        {file !== undefined && (
          <button type="button" onClick={() => onChange(undefined)} className="text-ink-soft hover:underline">
            Undo
          </button>
        )}
      </div>
      <input
        ref={input}
        id={id}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        className="sr-only"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {problem && (
        <p role="alert" className="text-xs text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}

/** Preset swatches, any colour, or a typed hex. `checkPale` warns when white text would not read on it. */
export function ColourPick({ id, value, onChange, checkPale = true }: { id: string; value: string; onChange: (hex: string) => void; checkPale?: boolean }) {
  const [typed, setTyped] = useState(value);
  const [shownFor, setShownFor] = useState(value);
  if (shownFor !== value) {
    setShownFor(value);
    setTyped(value);
  }
  const warning = checkPale ? paleWarning(value) : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Quick colours">
        {BRAND_PRESETS.map((hex) => (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={value === hex}
            aria-label={hex === PIC_NAVY ? 'PIC navy' : hex}
            onClick={() => onChange(hex)}
            className={cn('flex size-8 items-center justify-center rounded-full ring-offset-2', value === hex && 'ring-2 ring-ink')}
            style={{ background: hex }}
          >
            {value === hex && <CheckIcon className="size-4" style={{ color: textOn(hex) }} />}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Pick any colour" className="h-10 w-12 cursor-pointer rounded-lg border border-border bg-surface p-1" />
        <input
          id={id}
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            const hex = normaliseColor(e.target.value);
            if (hex) onChange(hex);
          }}
          spellCheck={false}
          autoComplete="off"
          maxLength={7}
          className="h-10 w-28 rounded-lg border border-border bg-surface px-3 font-mono text-sm uppercase text-ink outline-none focus:border-primary"
        />
      </div>
      {warning && <p className="text-xs text-gold">{warning}</p>}
    </div>
  );
}

/** How the event's page starts in the app: cover, logo and name, and a button in its colour. */
function AppPreview({ current, cover, logo, colour }: { current: Current; cover: string | null; logo: string | null; colour: string }) {
  return (
    <div className="w-full max-w-xs overflow-hidden rounded-xl border border-border bg-surface" aria-label="How it looks in the app">
      <div className="aspect-[16/9] bg-surface-soft">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview
          <img src={cover} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-placeholder">The app’s shared artwork</div>
        )}
      </div>
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- preview
            <img src={logo} alt="" className="size-9 rounded-lg border border-border object-contain p-0.5" />
          ) : (
            <span className="flex size-9 items-center justify-center rounded-lg text-[0.625rem] font-medium" style={{ background: colour, color: textOn(colour) }}>
              {current.shortName.slice(0, 4) || 'PIC'}
            </span>
          )}
          <p className="truncate text-sm font-medium text-ink">{current.name || 'Your event'}</p>
        </div>
        <span className="flex h-9 items-center justify-center rounded-lg text-sm font-medium" style={{ background: colour, color: textOn(colour) }}>
          Get tickets
        </span>
      </div>
    </div>
  );
}

/**
 * The branding fields, for the Add event form and the Branding dialog: a cover picture, a logo and
 * the button colour, with a preview of the app. `value` holds only what changes.
 */
export function EventBrandingFields({ id, current, value, onChange }: { id: string; current: Current; value: BrandingChange; onChange: (next: BrandingChange) => void }) {
  const cover = useShown(value.cover, current.coverUrl);
  const logo = useShown(value.logo, current.logoUrl);
  const logoDark = useShown(value.logoDark, current.logoDarkUrl);
  const colour = (value.brandColor === undefined ? current.brandColor : value.brandColor) ?? PIC_NAVY;
  return (
    <>
      <Field id={`${id}-cover`} label="Event picture" optional className="sm:col-span-2" hint="On the event’s card and page in the app. Landscape, at least 1200 × 675; JPG, PNG or WebP up to 10 MB.">
        <ImagePick id={`${id}-cover`} kind="cover" file={value.cover} shown={cover} onChange={(cover) => onChange({ ...value, cover })} />
      </Field>
      <Field id={`${id}-logo`} label="Logo" optional hint="Square, with a transparent or white background; up to 2 MB.">
        <ImagePick id={`${id}-logo`} kind="logo" file={value.logo} shown={logo} onChange={(logo) => onChange({ ...value, logo })} />
      </Field>
      <Field id={`${id}-logo-dark`} label="Logo for dark backgrounds" optional hint="For dark slides, usually a white wordmark; used in call-to-action decks.">
        <ImagePick id={`${id}-logo-dark`} kind="logo" dark file={value.logoDark} shown={logoDark} onChange={(logoDark) => onChange({ ...value, logoDark })} />
      </Field>
      <Field id={`${id}-guide`} label="Brand guide" optional className="sm:col-span-2" hint={`A PDF up to ${MAX_GUIDE_MB} MB; call-to-action decks follow its colours, fonts and logo rules.`}>
        <GuidePick id={`${id}-guide`} file={value.guide} current={{ url: current.brandGuideUrl, name: current.brandGuideName }} onChange={(guide) => onChange({ ...value, guide })} />
      </Field>
      <Field
        id={`${id}-deck`}
        label="Call-to-action decks"
        className="sm:col-span-2"
        hint="Designed for the event follows its logo, colours and brand guide each time; the Build template uses Build's commitment slides, with cards or a table."
      >
        <Select
          id={`${id}-deck`}
          value={value.deckTemplate ?? current.deckTemplate ?? 'designed'}
          options={(Object.keys(DECK_TEMPLATE_LABEL) as DeckTemplate[]).map((t) => ({ value: t, label: DECK_TEMPLATE_LABEL[t] }))}
          onChange={(deckTemplate) => onChange({ ...value, deckTemplate: deckTemplate === (current.deckTemplate ?? 'designed') ? undefined : deckTemplate })}
        />
      </Field>
      <Field id={`${id}-colour`} label="Button colour" hint="Buttons and highlights in the app; the text on it turns white or black to stay readable.">
        <ColourPick id={`${id}-colour`} value={colour} onChange={(hex) => onChange({ ...value, brandColor: hex === PIC_NAVY && !current.brandColor ? undefined : hex })} />
      </Field>
      <div className="flex flex-col gap-2 sm:col-span-2">
        <p className="text-sm text-ink">Preview</p>
        <AppPreview current={current} cover={cover} logo={logo} colour={colour} />
      </div>
    </>
  );
}

/** Nothing to save: every field left as it was. */
export const brandingUnchanged = (change: BrandingChange) =>
  change.cover === undefined && change.logo === undefined && change.brandColor === undefined && change.logoDark === undefined && change.guide === undefined && change.deckTemplate === undefined;

/** The Events table's Branding dialog: the same fields, saved on their own. */
export function EventBrandingDialog({ edition, onClose }: { edition: Edition | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveBranding();
  const [change, setChange] = useState<BrandingChange>({});
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  const [step, setStep] = useState<string | null>(null);
  if (edition && openedFor !== edition.id) {
    setOpenedFor(edition.id);
    setChange({});
  }
  const close = () => {
    setOpenedFor(null);
    setStep(null);
    save.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!edition) return;
    if (brandingUnchanged(change)) return close();
    save.mutate(
      { editionId: edition.id, change, onProgress: setStep },
      {
        onSuccess: () => {
          toast.push({ title: 'Branding saved', body: `${edition.shortName} shows its new look in the app.`, leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' } });
          close();
        },
        onSettled: () => setStep(null),
      },
    );
  };
  return (
    <FormDialog
      open={edition !== null}
      icon={PaintBrushIcon}
      title={`Branding: ${edition?.shortName ?? ''}`}
      subtitle="The picture, logo and button colour delegates see for this event in the app."
      pending={save.isPending}
      submitLabel={save.isPending ? (step ?? 'Saving…') : 'Save'}
      error={save.error?.message ?? null}
      onClose={close}
      onSubmit={submit}
      dirty={edition !== null && !brandingUnchanged(change)}
    >
      {edition && (
        <div className="grid gap-5 sm:grid-cols-2">
          <EventBrandingFields id="edit-branding" current={edition} value={change} onChange={setChange} />
        </div>
      )}
    </FormDialog>
  );
}
