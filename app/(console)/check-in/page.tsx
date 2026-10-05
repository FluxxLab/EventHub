'use client';

import { ArrowPathIcon, CameraIcon, CheckCircleIcon, ExclamationTriangleIcon, MagnifyingGlassIcon, PrinterIcon, QrCodeIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { canUseCamera, QrScanner } from '@/components/ui/qr-scanner';
import { Switch } from '@/components/ui/switch';
import { tierColour, type BadgeDesign } from '@/lib/badges/badges';
import { badgeLook, badgesDocument, printHtml } from '@/lib/badges/print';
import { useBadgeDesign } from '@/lib/badges/use-badges';
import { badgeFor, isTicketQr, placesLine, whenAdmitted, type AdmitResult, type TicketMatch } from '@/lib/checkin/checkin';
import { useAdmit, useFindTicket, useGateSummary } from '@/lib/checkin/use-checkin';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { count } from '@/lib/format';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
/** Back to "ready" this long after a result, so the next person sees a clean screen. */
const RESET_MS = 12_000;

/* --------------------------------------------- per-desk preference: print on check-in */

const PRINT_KEY = 'pic.checkin.autoprint';
const printListeners = new Set<() => void>();
function readAutoPrint(): boolean {
  try {
    return window.localStorage.getItem(PRINT_KEY) !== 'off';
  } catch {
    return true;
  }
}
function writeAutoPrint(on: boolean) {
  try {
    window.localStorage.setItem(PRINT_KEY, on ? 'on' : 'off');
  } catch {
    // private window: the choice lasts until the page closes
    memoryAutoPrint = on;
  }
  printListeners.forEach((l) => l());
}
let memoryAutoPrint: boolean | null = null;
function useAutoPrint(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (l) => {
      printListeners.add(l);
      return () => printListeners.delete(l);
    },
    () => memoryAutoPrint ?? readAutoPrint(),
    () => true,
  );
  return [on, writeAutoPrint];
}

/* ------------------------------------------------------------------------ the desk */

type PrintState = 'printing' | 'printed' | 'failed' | 'off';
type View =
  | { kind: 'ready' }
  | { kind: 'busy'; label: string }
  | { kind: 'result'; result: AdmitResult; print: PrintState }
  | { kind: 'matches'; query: string; matches: TicketMatch[] }
  | { kind: 'error'; title: string; body: string };

type Recent = { key: string; result: AdmitResult; at: string };

/** The check-in desk: scan or look someone up, let them in, and print their badge. */
export default function CheckInPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Check-in desk">
      {(editionId) => <Desk edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

function Desk({ edition }: { edition: Edition }) {
  const admit = useAdmit(edition.id);
  const find = useFindTicket(edition.id);
  const gate = useGateSummary(edition.id);
  const stored = useBadgeDesign(edition.id);
  const { design, artworkUrl, logo } = badgeLook(stored.data, edition);
  const [autoPrint, setAutoPrint] = useAutoPrint();
  const cameraReady = useSyncExternalStore(
    () => () => undefined,
    canUseCamera,
    () => false,
  );

  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [camera, setCamera] = useState(false);
  const [view, setView] = useState<View>({ kind: 'ready' });
  const [recent, setRecent] = useState<Recent[]>([]);

  const focus = useCallback(() => setTimeout(() => input.current?.focus(), 0), []);

  // A result clears itself, so the next person never reads the last one's name.
  useEffect(() => {
    if (view.kind !== 'result' && view.kind !== 'error') return;
    const timer = setTimeout(() => setView({ kind: 'ready' }), RESET_MS);
    return () => clearTimeout(timer);
  }, [view]);

  const print = useCallback(
    async (result: AdmitResult): Promise<PrintState> => {
      try {
        await printHtml(await badgesDocument([badgeFor(result)], design, edition.shortName, 'single', artworkUrl, logo));
        return 'printed';
      } catch {
        return 'failed';
      }
    },
    [design, edition.shortName, artworkUrl, logo],
  );

  const letIn = useCallback(
    (qr: string) => {
      setView({ kind: 'busy', label: 'Checking the ticket…' });
      admit.mutate(qr, {
        onSuccess: (result) => {
          const printing = result.status === 'admitted' && autoPrint;
          setView({ kind: 'result', result, print: printing ? 'printing' : 'off' });
          if (result.status === 'admitted') setRecent((r) => [{ key: `${result.ticket.id}:${Date.now()}`, result, at: new Date().toISOString() }, ...r].slice(0, 8));
          if (printing)
            void print(result).then((state) => {
              setView((v) => (v.kind === 'result' && v.result === result ? { ...v, print: state } : v));
              focus();
            });
          focus();
        },
        onError: (e) => {
          setView({ kind: 'error', title: 'Not let in', body: e.message });
          focus();
        },
      });
    },
    [admit, autoPrint, focus, print],
  );

  const submit = (value: string) => {
    const q = value.trim();
    setText('');
    if (!q) return;
    if (isTicketQr(q)) return letIn(q);
    if (q.length < 2) return;
    setView({ kind: 'busy', label: `Looking for “${q}”…` });
    find.mutate(q, {
      onSuccess: (matches) => {
        const exact = matches.length === 1 && matches[0]!.code.toLowerCase() === q.toLowerCase();
        if (exact) return letIn(matches[0]!.qr);
        setView(matches.length ? { kind: 'matches', query: q, matches } : { kind: 'error', title: 'No ticket found', body: `Nothing for “${q}” at ${edition.shortName}. Check the spelling, or try their email or ticket code.` });
        focus();
      },
      onError: (e) => {
        setView({ kind: 'error', title: 'Search failed', body: e.message });
        focus();
      },
    });
  };

  const reprint = async (result: AdmitResult) => {
    setView({ kind: 'result', result, print: 'printing' });
    const state = await print(result);
    setView((v) => (v.kind === 'result' && v.result === result ? { ...v, print: state } : v));
    focus();
  };

  const onForm = (e: FormEvent) => {
    e.preventDefault();
    submit(text);
  };

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="desk-title" className={cardClass}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <h2 id="desk-title" className="text-base font-medium text-ink">
            Check-in desk
          </h2>
          <p className="text-sm text-[#525252]" aria-live="polite">
            {gate.data ? (
              <>
                <span className="font-medium tabular-nums text-ink">{count(gate.data.admitted)}</span> of {count(gate.data.places)} checked in
              </>
            ) : (
              ' '
            )}
          </p>
        </header>

        <div className="flex flex-col gap-5 p-6">
          <form onSubmit={onForm} className="flex gap-2">
            <label className="flex h-14 min-w-0 flex-1 items-center gap-3 rounded-xl border-2 border-primary/30 bg-white px-4 focus-within:border-primary">
              <QrCodeIcon className="size-6 shrink-0 text-primary" aria-hidden />
              <span className="sr-only">Scan a ticket, or type a name, email or ticket code</span>
              <input
                ref={input}
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={() =>
                  setTimeout(() => {
                    // nothing else took focus (or the print frame did): back to the box, for the scanner
                    const now = document.activeElement;
                    if (!now || now === document.body || now.tagName === 'IFRAME') input.current?.focus();
                  }, 150)
                }
                placeholder="Scan a ticket, or type a name, email or code"
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-lg text-ink outline-none placeholder:text-placeholder"
              />
            </label>
            <button type="submit" className={buttonClass({ className: 'h-14 px-5' })} aria-label="Find">
              <MagnifyingGlassIcon className="size-5" />
            </button>
            {cameraReady && (
              <button type="button" onClick={() => setCamera((c) => !c)} aria-pressed={camera} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-14 px-4' })} aria-label={camera ? 'Close camera' : 'Scan with camera'}>
                <CameraIcon className="size-5" />
              </button>
            )}
          </form>

          {camera && <QrScanner onCode={submit} onClose={() => setCamera(false)} />}

          <div className="min-h-72" aria-live="assertive">
            <Outcome view={view} design={design} onPick={(m) => letIn(m.qr)} onReprint={(r) => void reprint(r)} onDone={() => (setView({ kind: 'ready' }), focus())} />
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-5">
        <section aria-label="Desk settings" className={cn(cardClass, 'flex flex-col gap-3 p-5')}>
          <div className="flex items-center justify-between gap-3">
            <p id="autoprint-label" className="text-sm text-ink">
              Print a badge at check-in
            </p>
            <Switch checked={autoPrint} onChange={setAutoPrint} labelledBy="autoprint-label" />
          </div>
          <p className="text-xs leading-5 text-[#7c7c7c]">
            {autoPrint ? 'Each person’s badge prints as they are let in.' : 'Badges are not printed here; use Reprint when someone needs one.'} For printing without the print window, open this desk in Chrome started with <code className="rounded bg-[#f1f1f1] px-1">--kiosk-printing</code>.
          </p>
          <p className="text-xs text-[#7c7c7c]">This setting is kept on this computer only.</p>
        </section>

        <section aria-labelledby="recent-title" className={cardClass}>
          <h2 id="recent-title" className="border-b border-border px-5 py-3 text-sm font-medium text-ink">
            Checked in at this desk
          </h2>
          {recent.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[#7c7c7c]">Nobody yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.key} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: tierColour(design, r.result.ticket.tierName) }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">{r.result.holder.name}</p>
                    <p className="text-xs text-[#7c7c7c]">
                      {r.result.ticket.tierName} · {new Date(r.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <button type="button" onClick={() => void reprint(r.result)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8 px-2' })} aria-label={`Reprint ${r.result.holder.name}'s badge`} title="Reprint badge">
                    <PrinterIcon className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}

function Outcome({ view, design, onPick, onReprint, onDone }: { view: View; design: BadgeDesign; onPick: (m: TicketMatch) => void; onReprint: (r: AdmitResult) => void; onDone: () => void }) {
  if (view.kind === 'ready') {
    return (
      <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border text-center">
        <QrCodeIcon className="size-12 text-[#bdbdbd]" strokeWidth={1} />
        <p className="text-lg text-ink">Ready for the next person</p>
        <p className="max-w-sm text-sm text-[#7c7c7c]">Scan the QR on their ticket in the PIC Events app, or on their emailed or printed ticket. No QR? Type their name, email or ticket code.</p>
      </div>
    );
  }
  if (view.kind === 'busy') {
    return (
      <div className="flex h-72 items-center justify-center gap-3 rounded-xl bg-[#f6f6f6] text-[#525252]">
        <ArrowPathIcon className="size-5 animate-spin" />
        {view.label}
      </div>
    );
  }
  if (view.kind === 'error') {
    return (
      <div role="alert" className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl bg-danger/5 px-6 text-center ring-1 ring-danger/20">
        <XCircleIcon className="size-14 text-danger" strokeWidth={1.25} />
        <p className="text-2xl font-medium text-ink">{view.title}</p>
        <p className="max-w-md text-[#525252]">{view.body}</p>
      </div>
    );
  }
  if (view.kind === 'matches') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-[#525252]">
          {view.matches.length === 1 ? 'One ticket' : `${view.matches.length} tickets`} for “{view.query}”. Check it is them, then let them in.
        </p>
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {view.matches.map((m) => (
            <li key={m.ticketId} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-ink">{m.name}</p>
                <p className="truncate text-xs text-[#7c7c7c]">{[m.email, m.organisation, m.code].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm text-[#525252]">
                <span className="size-2.5 rounded-sm" style={{ background: tierColour(design, m.tierName) }} aria-hidden />
                {m.tierName}
              </span>
              <span className="w-24 text-right text-sm text-[#7c7c7c]">{m.admitted >= m.quantity ? 'Already in' : m.quantity > 1 ? `${m.admitted} of ${m.quantity} in` : 'Not in yet'}</span>
              <button type="button" onClick={() => onPick(m)} className={buttonClass(m.admitted >= m.quantity ? { style: 'outline', color: 'gray', className: 'h-9 w-24' } : { className: 'h-9 w-24' })}>
                {m.admitted >= m.quantity ? 'View' : 'Check in'}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const { result, print } = view;
  const ok = result.status === 'admitted';
  const band = tierColour(design, result.ticket.tierName);
  const details = [result.holder.title, result.holder.organisation].filter(Boolean).join(', ');
  const places = placesLine(result);
  return (
    <div className={cn('flex min-h-72 flex-col items-center justify-center gap-2 rounded-xl px-6 py-8 text-center ring-1', ok ? 'bg-success/5 ring-success/25' : 'bg-gold/10 ring-gold/30')}>
      {ok ? <CheckCircleIcon className="size-14 text-success" strokeWidth={1.25} /> : <ExclamationTriangleIcon className="size-14 text-gold" strokeWidth={1.25} />}
      <p className={cn('text-sm font-medium uppercase tracking-wide', ok ? 'text-success' : 'text-[#8a6d00]')}>{ok ? 'Welcome' : `Already checked in ${whenAdmitted(result.lastAdmittedAt, new Date())}`}</p>
      <p className="text-3xl font-medium text-ink">{result.holder.name}</p>
      {details && <p className="text-[#525252]">{details}</p>}
      <span className="mt-1 rounded-full px-3 py-1 text-sm font-medium uppercase tracking-wide text-white" style={{ background: band }}>
        {result.ticket.tierName}
      </span>
      {places && <p className="text-sm text-[#525252]">{places}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-3 text-sm">
        {print === 'printing' && (
          <span className="inline-flex items-center gap-2 text-[#525252]">
            <ArrowPathIcon className="size-4 animate-spin" /> Printing badge…
          </span>
        )}
        {print === 'printed' && (
          <span className="inline-flex items-center gap-2 text-success">
            <PrinterIcon className="size-4" /> Badge sent to the printer
          </span>
        )}
        {print === 'failed' && <span className="text-danger">The badge did not print.</span>}
        {print !== 'printing' && (
          <button type="button" onClick={() => onReprint(result)} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9' })}>
            <PrinterIcon className="size-4" />
            {print === 'off' && ok ? 'Print badge' : 'Reprint badge'}
          </button>
        )}
        <button type="button" onClick={onDone} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-9' })}>
          Next person
        </button>
      </div>
    </div>
  );
}
