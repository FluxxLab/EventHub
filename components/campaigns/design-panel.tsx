'use client';

import { ArrowPathIcon, PhotoIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useId, useRef, useState } from 'react';

import { ColourPick } from '@/components/events/event-branding';
import { buttonClass } from '@/components/ui/button';
import { TextInput } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import type { CampaignDesign, CampaignImages } from '@/lib/campaigns/campaigns';
import { CAMPAIGN_IMAGE_MAX_BYTES, CAMPAIGN_IMAGE_TYPES, uploadCampaignImage } from '@/lib/campaigns/use-campaigns';
import { cn } from '@/lib/utils';

type Part = keyof CampaignImages;

const PART_TEXT: Record<Part, { label: string; hint: string }> = {
  logo: { label: 'Logo', hint: 'Top of the header, 44 px tall. A PNG with a transparent background looks best.' },
  banner: { label: 'Banner', hint: 'Full width under the header, such as the event flyer. At least 1200 px wide.' },
};

/**
 * The look of a campaign email: logo, banner, header and button colours, the header's text and a
 * footer line. A new campaign starts from the event's branding; "Use event branding" goes back to it.
 */
export function DesignPanel({
  editionId,
  design,
  pictures,
  onChange,
  onReset,
}: {
  editionId: string;
  design: CampaignDesign;
  pictures: CampaignImages;
  onChange: (design: CampaignDesign, pictures?: CampaignImages) => void;
  /** Back to the event's logo, cover and colour; absent until they have loaded. */
  onReset?: () => void;
}) {
  const id = useId();
  const edit = (next: Partial<CampaignDesign>) => onChange({ ...design, ...next });

  return (
    <div className="flex flex-col gap-5 border-b border-border px-6 py-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-ink">Design</p>
          <p className="text-xs text-[#7c7c7c]">How the email looks. It starts from the event’s branding.</p>
        </div>
        {onReset && (
          <button type="button" onClick={onReset} className={buttonClass({ style: 'borderless', color: 'gray' })}>
            <ArrowPathIcon className="size-4" />
            Use event branding
          </button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {(['logo', 'banner'] as const).map((part) => (
          <PictureSlot
            key={part}
            part={part}
            editionId={editionId}
            src={design[part] ? pictures[part] : null}
            onPicked={(key, preview) => onChange({ ...design, [part]: key }, { ...pictures, [part]: preview })}
            onRemove={() => onChange({ ...design, [part]: null }, { ...pictures, [part]: null })}
          />
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-header`} className="text-sm text-ink">
            Header colour
          </label>
          <ColourPick id={`${id}-header`} value={design.headerColor} onChange={(headerColor) => edit({ headerColor })} checkPale={false} />
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor={`${id}-button`} className="text-sm text-ink">
            Button colour
          </label>
          <ColourPick id={`${id}-button`} value={design.buttonColor} onChange={(buttonColor) => edit({ buttonColor })} checkPale={false} />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-eyebrow`} className="text-sm text-ink">
            Header line <span className="text-[#7c7c7c]">(above the event name; empty hides it)</span>
          </label>
          <TextInput id={`${id}-eyebrow`} value={design.eyebrow} maxLength={80} onChange={(e) => edit({ eyebrow: e.target.value })} placeholder="Policy Innovation Centre" />
        </div>
        <div className="flex h-10 items-center gap-3">
          <Switch checked={design.showEventName} onChange={(showEventName) => edit({ showEventName })} labelledBy={`${id}-name`} />
          <span id={`${id}-name`} className="text-sm text-ink">
            Event name in the header
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-footer`} className="text-sm text-ink">
          Footer <span className="text-[#7c7c7c]">(optional: contacts, sponsors)</span>
        </label>
        <textarea
          id={`${id}-footer`}
          value={design.footer}
          maxLength={500}
          rows={2}
          onChange={(e) => edit({ footer: e.target.value })}
          placeholder="Questions? Write to events@policycentre.org"
          className="rounded-lg border border-border bg-white px-3 py-2.5 text-sm leading-6 text-ink outline-none placeholder:text-placeholder focus:border-primary disabled:bg-[#f6f6f6]"
        />
      </div>
    </div>
  );
}

function PictureSlot({
  part,
  editionId,
  src,
  onPicked,
  onRemove,
}: {
  part: Part;
  editionId: string;
  src: string | null;
  onPicked: (key: string, preview: string) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const [progress, setProgress] = useState<number | null>(null);
  const { label, hint } = PART_TEXT[part];

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!CAMPAIGN_IMAGE_TYPES.includes(file.type)) return toast.push({ title: `${label} not added`, body: 'Use a PNG, JPG or GIF: other formats do not show in every email app.' });
    if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) return toast.push({ title: `${label} not added`, body: 'Keep it under 5 MB, so the email opens quickly.' });
    setProgress(0);
    try {
      const { key, preview } = await uploadCampaignImage(editionId, file, setProgress);
      onPicked(key, preview);
    } catch (e) {
      toast.push({ title: `${label} not uploaded`, body: e instanceof Error ? e.message : 'Try again.' });
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-ink">{label}</p>
      <div className={cn('flex items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-[#f6f6f6]', part === 'logo' ? 'h-20' : 'h-28')}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- a signed or just-picked picture, shown as is
          <img src={src} alt={`${label} preview`} className={cn('max-h-full', part === 'logo' ? 'max-w-[70%] object-contain p-2' : 'w-full object-cover')} />
        ) : (
          <PhotoIcon className="size-7 text-placeholder" aria-hidden />
        )}
      </div>
      <p className="text-xs text-[#7c7c7c]">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <input ref={input} type="file" accept={CAMPAIGN_IMAGE_TYPES.join(',')} className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void pick(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        <button type="button" disabled={progress !== null} onClick={() => input.current?.click()} className={buttonClass({ style: 'outline', color: 'gray' })}>
          <PhotoIcon className="size-4" />
          {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : src ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
        </button>
        {src && progress === null && (
          <button type="button" onClick={onRemove} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
            <TrashIcon className="size-4" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
