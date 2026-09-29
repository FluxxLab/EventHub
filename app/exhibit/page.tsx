'use client';

import { ArrowDownTrayIcon, CameraIcon, CheckCircleIcon, ChevronDownIcon, ExclamationTriangleIcon, InformationCircleIcon, TrashIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { canUseCamera, QrScanner } from '@/components/ui/qr-scanner';
import { ApiError } from '@/lib/api/client';
import { downloadCsv, keyFromHash, LEAD_RATINGS, leadsCsv, RATING_LABEL, ratingCounts, type Lead, type LeadRating } from '@/lib/leads/leads';
import { useExhibitor, useExhibitorActions } from '@/lib/leads/use-leads';
import { cn } from '@/lib/utils';

const subscribeHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const RATING_TONE: Record<LeadRating, string> = {
  hot: 'border-danger bg-danger text-white',
  warm: 'border-gold bg-gold text-ink',
  cold: 'border-[#51c0ff] bg-[#51c0ff] text-ink',
};

/**
 * An exhibitor's lead scanner, opened from the stand's private link on a phone. No account: the key
 * after `#` says which stand it is. Scan a delegate's badge, mark how keen they are, add a note;
 * download everyone as a spreadsheet at the end of the day.
 */
export default function ExhibitPage() {
  // null until the browser has read the link (the server never sees what follows `#`)
  const key = useSyncExternalStore(subscribeHash, () => keyFromHash(window.location.hash) ?? '', () => null);
  return (
    <div className="min-h-dvh bg-[#f6f6f6]">
      {key === null ? null : key === '' ? <Invalid /> : <Scanner key={key} standKey={key} />}
    </div>
  );
}

function Invalid({ message }: { message?: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <Image src="/pic-logo.png" alt="Policy Innovation Centre" width={72} height={72} priority />
      <h1 className="text-xl font-medium text-ink">This scanner link does not work</h1>
      <p className="text-sm text-[#525252]">{message ?? 'It may have been copied only in part, or replaced by a newer link.'} Ask the event organisers for your stand’s current link.</p>
    </main>
  );
}

function Scanner({ standKey }: { standKey: string }) {
  const view = useExhibitor(standKey);
  const { scan, update, remove } = useExhibitorActions(standKey);
  const [camera, setCamera] = useState(false);
  const [cameraOk, setCameraOk] = useState(false);
  const [last, setLast] = useState<{ id: string; isNew: boolean } | { error: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  // after mount: whether this phone has a camera to offer
  useEffect(() => {
    const id = requestAnimationFrame(() => setCameraOk(canUseCamera()));
    return () => cancelAnimationFrame(id);
  }, []);

  if (view.isPending) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md items-center justify-center">
        <p className="text-sm text-[#7c7c7c]">Opening the scanner…</p>
      </main>
    );
  }
  if (view.isError) {
    if (view.error instanceof ApiError && view.error.status === 401) return <Invalid message={view.error.message.replace(/ Ask the organisers.*$/, '')} />;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-medium text-ink">The scanner could not load.</p>
        <p className="text-sm text-[#525252]">{view.error.message}</p>
        <button type="button" onClick={() => void view.refetch()} className={buttonClass()}>
          Try again
        </button>
      </main>
    );
  }

  const { booth, edition, leads } = view.data;
  const counts = ratingCounts(leads);
  const current = last && 'id' in last ? leads.find((l) => l.id === last.id) : null;

  const onCode = (text: string) =>
    scan.mutate(text, {
      onSuccess: ({ lead, isNew }) => {
        setLast({ id: lead.id, isNew });
        navigator.vibrate?.(isNew ? 80 : [40, 60, 40]);
      },
      onError: (e) => setLast({ error: e.message }),
    });
  const onTyped = (e: FormEvent) => {
    e.preventDefault();
    if (typed.trim()) onCode(typed);
    setTyped('');
  };

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-4 pb-10 pt-4">
      <header className="flex items-center gap-3">
        <Image src="/pic-logo.png" alt="" width={40} height={40} className="shrink-0" priority />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-medium text-ink">{booth.name}</h1>
          <p className="truncate text-xs text-[#7c7c7c]">
            {edition.shortName}
            {booth.location ? ` · ${booth.location}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-medium leading-none tabular-nums text-ink">{leads.length}</p>
          <p className="text-xs text-[#7c7c7c]">{leads.length === 1 ? 'lead' : 'leads'}</p>
        </div>
      </header>

      {camera ? (
        <QrScanner onCode={onCode} onClose={() => setCamera(false)} />
      ) : (
        <button type="button" onClick={() => setCamera(true)} disabled={!cameraOk} className={buttonClass({ className: 'h-14 w-full text-base' })}>
          <CameraIcon className="size-6" />
          Scan a badge
        </button>
      )}
      {!cameraOk && <p className="-mt-2 text-center text-xs text-[#7c7c7c]">This browser cannot use the camera. Open the link in Chrome or Safari, or use a scanner below.</p>}

      <form onSubmit={onTyped} className="flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Or scan with a hand scanner here"
          aria-label="Code from a hand scanner"
          autoComplete="off"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none placeholder:text-placeholder focus:border-primary"
        />
        <button type="submit" className={buttonClass({ style: 'outline', color: 'gray', className: 'h-10' })}>
          Add
        </button>
      </form>

      <div aria-live="polite">
        {scan.isPending && <p className="rounded-xl bg-white p-4 text-sm text-[#525252] shadow-sm">Checking the badge…</p>}
        {!scan.isPending && last && 'error' in last && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft p-4 text-sm text-danger">
            <XCircleIcon className="size-5 shrink-0" />
            {last.error}
          </p>
        )}
        {!scan.isPending && current && last && 'isNew' in last && (
          <div className={cn('rounded-xl bg-white p-4 shadow-sm ring-1', last.isNew ? 'ring-success/40' : 'ring-border')}>
            <p className={cn('flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide', last.isNew ? 'text-success' : 'text-[#7c7c7c]')}>
              {last.isNew ? <CheckCircleIcon className="size-4" /> : <InformationCircleIcon className="size-4" />}
              {last.isNew ? 'New lead' : `Already scanned at ${time(current.createdAt)}`}
            </p>
            <LeadDetails lead={current} onRate={(rating) => update.mutate({ id: current.id, rating })} onNote={(note) => update.mutate({ id: current.id, note })} />
          </div>
        )}
      </div>

      <section aria-labelledby="leads-title" className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="leads-title" className="text-sm font-medium text-ink">
            Leads
          </h2>
          <p className="text-xs text-[#7c7c7c]">
            {counts.hot} hot · {counts.warm} warm · {counts.cold} cold
          </p>
        </div>
        {leads.length === 0 ? (
          <p className="rounded-xl bg-white p-6 text-center text-sm text-[#7c7c7c] shadow-sm">Nobody yet. Scan the QR on a visitor’s badge to add them.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-xl bg-white shadow-sm">
            {leads.map((l) => (
              <li key={l.id}>
                <button type="button" onClick={() => setOpen(open === l.id ? null : l.id)} aria-expanded={open === l.id} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{l.name}</p>
                    <p className="truncate text-xs text-[#7c7c7c]">{[l.organisation, time(l.createdAt)].filter(Boolean).join(' · ')}</p>
                  </div>
                  {l.rating && <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-medium', RATING_TONE[l.rating])}>{RATING_LABEL[l.rating]}</span>}
                  <ChevronDownIcon className={cn('size-4 shrink-0 text-[#7c7c7c] transition-transform', open === l.id && 'rotate-180')} />
                </button>
                {open === l.id && (
                  <div className="border-t border-border bg-[#fafafa] px-4 pb-4">
                    <LeadDetails lead={l} onRate={(rating) => update.mutate({ id: l.id, rating })} onNote={(note) => update.mutate({ id: l.id, note })} />
                    <button type="button" onClick={() => remove.mutate(l.id, { onSuccess: () => setOpen(null) })} className={buttonClass({ style: 'borderless', color: 'gray', className: 'mt-2 h-8 px-0 hover:text-danger' })}>
                      <TrashIcon className="size-4" />
                      Remove, scanned by mistake
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <button type="button" disabled={leads.length === 0} onClick={() => downloadCsv(`${booth.name.replace(/[^\w-]+/g, '-')}-leads.csv`, leadsCsv(leads))} className={buttonClass({ style: 'outline', color: 'gray', className: 'w-full' })}>
        <ArrowDownTrayIcon className="size-4" />
        Download leads (CSV)
      </button>
      <p className="flex items-start gap-1.5 text-xs text-[#7c7c7c]">
        <ExclamationTriangleIcon className="mt-px size-4 shrink-0" />
        Keep this link to your stand’s staff: anyone with it can see your leads. The organisers can replace it if it is shared by mistake.
      </p>
    </main>
  );
}

/** Contact details, how keen they are, and a note that saves when you leave the box. */
function LeadDetails({ lead, onRate, onNote }: { lead: Lead; onRate: (rating: LeadRating | null) => void; onNote: (note: string | null) => void }) {
  const [note, setNote] = useState(lead.note ?? '');
  return (
    <div className="mt-2 flex flex-col gap-3">
      <div>
        <p className="text-lg font-medium text-ink">{lead.name}</p>
        {(lead.title || lead.organisation) && <p className="text-sm text-[#525252]">{[lead.title, lead.organisation].filter(Boolean).join(', ')}</p>}
        <a href={`mailto:${lead.email}`} className="text-sm text-primary underline">
          {lead.email}
        </a>
        <p className="text-xs text-[#7c7c7c]">{[lead.country, `${lead.tier} ticket`].filter(Boolean).join(' · ')}</p>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label="Interest">
        {LEAD_RATINGS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={lead.rating === r}
            onClick={() => onRate(lead.rating === r ? null : r)}
            className={cn('h-10 flex-1 rounded-lg border text-sm font-medium transition-colors', lead.rating === r ? RATING_TONE[r] : 'border-border bg-white text-[#525252]')}
          >
            {RATING_LABEL[r]}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={() => note.trim() !== (lead.note ?? '') && onNote(note.trim() || null)}
        rows={2}
        maxLength={1000}
        placeholder="Note: what they asked about, follow-up…"
        aria-label={`Note about ${lead.name}`}
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm text-ink outline-none placeholder:text-placeholder focus:border-primary"
      />
    </div>
  );
}
