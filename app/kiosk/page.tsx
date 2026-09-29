'use client';

import { ArrowLeftIcon, CheckCircleIcon, ExclamationTriangleIcon, LockClosedIcon, QrCodeIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';

import { BadgeFrame } from '@/components/badges/badge-frame';
import { ExitCorner, PinInput, PinPad } from '@/components/kiosk/lock';
import { buttonClass } from '@/components/ui/button';
import { LogoLoader } from '@/components/ui/logo-loader';
import { QrScanner } from '@/components/ui/qr-scanner';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useSession } from '@/lib/auth/session';
import { DEFAULT_DESIGN, tierColour } from '@/lib/badges/badges';
import { badgesDocument, printHtml } from '@/lib/badges/print';
import { useBadgeDesign } from '@/lib/badges/use-badges';
import { badgeFor, isTicketQr, whenAdmitted, type AdmitResult } from '@/lib/checkin/checkin';
import { CAMERA_LABEL, exactCode, hashPin, loadKiosk, RESET_AFTER_MS, saveKiosk, validPin, type KioskCamera, type KioskConfig } from '@/lib/checkin/kiosk';
import { useAdmit, useFindTicket } from '@/lib/checkin/use-checkin';
import type { Edition } from '@/lib/events/events';
import { useEditions } from '@/lib/events/use-editions';
import { cn } from '@/lib/utils';

/**
 * Self check-in. Staff start it on a tablet or screen by the entrance, choosing the event and a
 * PIN; it then shows only the attendee screen, full-screen, until the PIN is entered (hold the
 * top-right corner for three seconds). Attendees scan their ticket QR or type their ticket code;
 * their badge prints in the event's badge design.
 */
export default function KioskPage() {
  const router = useRouter();
  const session = useSession();
  const editions = useEditions();
  const [config, setConfig] = useState<KioskConfig | null>(null);
  const [restored, setRestored] = useState(false);

  // a kiosk mid-event survives a refresh: read it back once, in the browser
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setConfig(loadKiosk());
      setRestored(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
  }, [session.status, router]);

  if (session.status !== 'signed-in' || !restored || editions.isPending) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" aria-busy="true">
        <LogoLoader />
      </div>
    );
  }
  const edition = config ? editions.data?.find((e) => e.id === config.editionId) : undefined;
  if (config && edition) {
    return (
      <Kiosk
        config={config}
        edition={edition}
        onExit={() => {
          saveKiosk(null);
          setConfig(null);
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        }}
      />
    );
  }
  return (
    <Setup
      editions={editions.data ?? []}
      onStart={(c) => {
        saveKiosk(c);
        setConfig(c);
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }}
    />
  );
}

/* ------------------------------------------------------------------ staff setup */

function Setup({ editions, onStart }: { editions: Edition[]; onStart: (c: KioskConfig) => void }) {
  const [editionId, setEditionId] = useState(editions.find((e) => e.isCurrent)?.id ?? editions[0]?.id ?? '');
  const [print, setPrint] = useState(true);
  const [camera, setCamera] = useState<KioskCamera>('user');
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [problem, setProblem] = useState<string | null>(null);

  const start = async (e: FormEvent) => {
    e.preventDefault();
    if (!editionId) return setProblem('Choose the event.');
    if (!validPin(pin)) return setProblem('Choose a PIN of 4 to 6 digits.');
    if (pin !== again) return setProblem('The two PINs are different.');
    onStart({ editionId, print, camera, pinHash: await hashPin(pin) });
  };

  const pinInput = 'h-11 rounded-lg border border-border bg-white px-3 text-lg tracking-[0.4em] text-ink outline-none focus:border-primary';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <form onSubmit={(e) => void start(e)} className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-border bg-surface p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <Image src="/pic-logo.png" alt="" width={44} height={44} priority />
          <div>
            <h1 className="text-xl font-medium text-ink">Self check-in</h1>
            <p className="text-sm text-[#7c7c7c]">For a screen at the entrance, where attendees check themselves in.</p>
          </div>
        </div>

        {editions.length === 0 ? (
          <p className="text-sm text-danger">No events are assigned to this account.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-ink">Event</span>
            <Select label="Event" value={editionId} options={editions.map((e) => ({ value: e.id, label: `${e.shortName} · ${e.name}` }))} onChange={setEditionId} />
          </div>
        )}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-ink">How attendees scan</legend>
          {(Object.keys(CAMERA_LABEL) as KioskCamera[]).map((c) => (
            <label key={c} className={cn('flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm', camera === c ? 'border-primary bg-primary-soft/40 text-ink' : 'border-border text-[#525252]')}>
              <input type="radio" name="camera" checked={camera === c} onChange={() => setCamera(c)} className="accent-primary" />
              {CAMERA_LABEL[c]}
            </label>
          ))}
        </fieldset>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p id="kiosk-print" className="text-sm text-ink">
              Print badges
            </p>
            <p className="text-xs text-[#7c7c7c]">In this event’s badge design. Start Chrome with --kiosk-printing so no print window appears.</p>
          </div>
          <Switch checked={print} onChange={setPrint} labelledBy="kiosk-print" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-sm text-ink">
            Staff PIN
            <PinInput name="kiosk-pin" value={pin} onChange={setPin} className={pinInput} />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            PIN again
            <PinInput name="kiosk-pin-again" value={again} onChange={setAgain} className={pinInput} />
          </label>
        </div>
        <p className="-mt-2 text-xs text-[#7c7c7c]">To leave the kiosk, hold the top-right corner of the screen for three seconds, then enter this PIN.</p>

        {problem && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {problem}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Link href="/check-in" className={buttonClass({ style: 'borderless', color: 'gray' })}>
            <ArrowLeftIcon className="size-4" />
            Back to the console
          </Link>
          <button type="submit" disabled={editions.length === 0} className={buttonClass()}>
            <LockClosedIcon className="size-4" />
            Start self check-in
          </button>
        </div>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ attendee screen */

type Screen =
  | { kind: 'ready' }
  | { kind: 'checking' }
  | { kind: 'code' }
  | { kind: 'welcome'; result: AdmitResult; printed: 'printing' | 'printed' | 'failed' | 'off' }
  | { kind: 'already'; result: AdmitResult }
  | { kind: 'problem'; message: string };

function Kiosk({ config, edition, onExit }: { config: KioskConfig; edition: Edition; onExit: () => void }) {
  const admit = useAdmit(edition.id);
  const find = useFindTicket(edition.id);
  const stored = useBadgeDesign(edition.id);
  const design = stored.data?.design ?? DEFAULT_DESIGN;
  const artworkUrl = stored.data?.artworkUrl ?? null;
  const [screen, setScreen] = useState<Screen>({ kind: 'ready' });
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const [exiting, setExiting] = useState(false);
  const scanner = useRef<HTMLInputElement>(null);
  const busy = screen.kind === 'checking';

  // the next person gets a clean screen
  useEffect(() => {
    if (screen.kind === 'ready' || screen.kind === 'checking') return;
    const timer = setTimeout(() => setScreen({ kind: 'ready' }), RESET_AFTER_MS[screen.kind]);
    return () => clearTimeout(timer);
  }, [screen]);

  // a hand scanner types into this hidden box, so keep it focused whenever nothing else needs typing
  useEffect(() => {
    if (screen.kind === 'code' || exiting) return;
    const keep = setInterval(() => {
      if (document.activeElement !== scanner.current) scanner.current?.focus({ preventScroll: true });
    }, 700);
    return () => clearInterval(keep);
  }, [screen.kind, exiting]);

  const letIn = useCallback(
    (qr: string) => {
      setScreen({ kind: 'checking' });
      admit.mutate(qr, {
        onSuccess: (result) => {
          if (result.status === 'already_used') return setScreen({ kind: 'already', result });
          setScreen({ kind: 'welcome', result, printed: config.print ? 'printing' : 'off' });
          if (!config.print) return;
          void badgesDocument([badgeFor(result)], design, edition.shortName, 'single', artworkUrl)
            .then(printHtml)
            .then(
              () => setScreen((s) => (s.kind === 'welcome' && s.result === result ? { ...s, printed: 'printed' } : s)),
              () => setScreen((s) => (s.kind === 'welcome' && s.result === result ? { ...s, printed: 'failed' } : s)),
            );
        },
        onError: (e) =>
          setScreen({
            kind: 'problem',
            message: /another event|is for /i.test(e.message) ? e.message : 'We could not read that ticket. Please try again, or see the help desk.',
          }),
      });
    },
    [admit, config.print, design, edition.shortName, artworkUrl],
  );

  const onScan = (text: string) => {
    if (busy || exiting) return;
    if (isTicketQr(text)) letIn(text.trim());
    else setScreen({ kind: 'problem', message: 'That is not a ticket QR. Scan the QR on your ticket in the PIC Events app or in your ticket email.' });
  };

  const onCode = (e: FormEvent) => {
    e.preventDefault();
    const typedCode = code.trim();
    if (typedCode.length < 6) return;
    setScreen({ kind: 'checking' });
    find.mutate(typedCode, {
      onSuccess: (matches) => {
        const ticket = exactCode(matches, typedCode);
        setCode('');
        if (ticket) letIn(ticket.qr);
        else setScreen({ kind: 'problem', message: 'No ticket has that code. Check it on your ticket, or see the help desk.' });
      },
      onError: () => setScreen({ kind: 'problem', message: 'We could not check that code. Please see the help desk.' }),
    });
  };

  return (
    <div className="relative flex min-h-dvh select-none flex-col bg-[#f4f6fb]" onContextMenu={(e) => e.preventDefault()}>
      <ExitCorner onUnlock={() => setExiting(true)} />
      {exiting && <PinPad pinHash={config.pinHash} onCancel={() => setExiting(false)} onUnlock={onExit} />}

      <input
        ref={scanner}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          onScan(typed);
          setTyped('');
        }}
        aria-hidden
        tabIndex={-1}
        autoComplete="off"
        className="absolute -left-[9999px] size-px opacity-0"
      />

      <header className="flex items-center gap-4 bg-primary px-8 py-5 text-white">
        <Image src="/pic-logo.png" alt="" width={52} height={52} className="rounded-lg bg-white p-1" priority />
        <div>
          <p className="text-sm uppercase tracking-widest text-[#f2b705]">Welcome to</p>
          <p className="text-2xl font-medium">{edition.name}</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-10 text-center" aria-live="assertive">
        {(screen.kind === 'ready' || screen.kind === 'checking') && (
          <div className="screen-in flex w-full flex-col items-center gap-8">
            <div>
              <h1 className="text-4xl font-medium text-ink">Check yourself in</h1>
              <p className="mt-3 text-xl text-[#525252]">Hold up the QR on your ticket, in the PIC Events app or your ticket email.</p>
            </div>
            {config.camera !== 'none' ? (
              <div className="relative w-full max-w-md">
                <QrScanner facing={config.camera} onCode={onScan} className="shadow-lg" />
                {busy && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/80 text-xl text-ink">Checking your ticket…</div>
                )}
              </div>
            ) : (
              <div className="flex size-64 flex-col items-center justify-center gap-4 rounded-3xl border-4 border-dashed border-primary/40 bg-white">
                <QrCodeIcon className="size-24 text-primary" strokeWidth={1} />
                <p className="text-lg text-[#525252]">{busy ? 'Checking your ticket…' : 'Scan below'}</p>
              </div>
            )}
            <button type="button" disabled={busy} onClick={() => setScreen({ kind: 'code' })} className="text-lg text-primary underline underline-offset-4">
              No QR? Type your ticket code
            </button>
          </div>
        )}

        {screen.kind === 'code' && (
          <form onSubmit={onCode} className="screen-in flex w-full max-w-lg flex-col items-center gap-5">
            <h1 className="text-3xl font-medium text-ink">Type your ticket code</h1>
            <p className="text-lg text-[#525252]">It is on your ticket, like PIC-VIP-3QX7.</p>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="Ticket code"
              placeholder="PIC-…"
              className="h-16 w-full rounded-2xl border-2 border-primary/40 bg-white px-5 text-center font-mono text-3xl tracking-widest text-ink outline-none focus:border-primary"
            />
            <div className="flex w-full gap-3">
              <button type="button" onClick={() => setScreen({ kind: 'ready' })} className={buttonClass({ style: 'soft', color: 'gray', className: 'h-14 flex-1 text-lg' })}>
                Back
              </button>
              <button type="submit" disabled={code.trim().length < 6} className={buttonClass({ className: 'h-14 flex-1 text-lg' })}>
                Check in
              </button>
            </div>
          </form>
        )}

        {screen.kind === 'welcome' && (
          <div className="screen-in flex flex-col items-center gap-6">
            <CheckCircleIcon className="check-pop size-20 text-success" strokeWidth={1.25} />
            <div>
              <p className="text-xl uppercase tracking-widest text-success">You’re checked in</p>
              <h1 className="mt-2 text-5xl font-medium text-ink">Welcome, {screen.result.holder.name.split(' ')[0]}!</h1>
              <p className="mt-3 inline-block rounded-full px-4 py-1 text-lg font-medium uppercase tracking-wide text-white" style={{ background: tierColour(design, screen.result.ticket.tierName) }}>
                {screen.result.ticket.tierName}
              </p>
            </div>
            {screen.printed !== 'off' && (
              <div className="flex flex-col items-center gap-3">
                <BadgeFrame person={badgeFor(screen.result)} design={design} eventShortName={edition.shortName} artworkUrl={artworkUrl} maxWidth={220} maxHeight={300} className="overflow-hidden rounded-md bg-white shadow-xl ring-1 ring-black/5" />
                <p className="text-xl text-[#525252]">
                  {screen.printed === 'failed' ? 'Your badge did not print. Please collect it from the help desk.' : screen.printed === 'printing' ? 'Printing your badge…' : 'Collect your badge from the printer.'}
                </p>
              </div>
            )}
          </div>
        )}

        {screen.kind === 'already' && (
          <div className="screen-in flex max-w-xl flex-col items-center gap-5">
            <ExclamationTriangleIcon className="size-20 text-gold" strokeWidth={1.25} />
            <h1 className="text-4xl font-medium text-ink">You’re already checked in</h1>
            <p className="text-xl text-[#525252]">
              This ticket was used {whenAdmitted(screen.result.lastAdmittedAt, new Date())}. If you need a new badge, please see the help desk.
            </p>
          </div>
        )}

        {screen.kind === 'problem' && (
          <div className="screen-in flex max-w-xl flex-col items-center gap-5" role="alert">
            <XCircleIcon className="size-20 text-danger" strokeWidth={1.25} />
            <h1 className="text-4xl font-medium text-ink">Sorry, that didn’t work</h1>
            <p className="text-xl text-[#525252]">{screen.message}</p>
            <button type="button" onClick={() => setScreen({ kind: 'ready' })} className={buttonClass({ className: 'h-14 px-8 text-lg' })}>
              Try again
            </button>
          </div>
        )}
      </main>

      <footer className="pb-6 text-center text-sm text-[#7c7c7c]">Need help? Our team at the help desk will check you in.</footer>
    </div>
  );
}
