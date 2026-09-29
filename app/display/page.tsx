'use client';

import { ArrowLeftIcon, ArrowRightIcon, ArrowRightStartOnRectangleIcon, ArrowsPointingOutIcon, HandThumbDownIcon, HandThumbUpIcon, XMarkIcon } from '@heroicons/react/24/outline';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { LogoLoader } from '@/components/ui/logo-loader';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useSession } from '@/lib/auth/session';
import { useCaptionFeed } from '@/lib/captions/use-captions';
import { boardStatus, freshNotice, hhmm, lobbyPages, loadDisplay, mostLiked, roomReaction, wallComments, wallSession, PAGE_SECONDS, programmeDay, recentNotices, roomNow, roomRows, roomsOf, roomsPages, rowState, saveDisplay, timeLeft, topQuestions, type BoardStatus, type DisplayConfig, type DisplayKind, type RoomRow, type RoomsPage } from '@/lib/display/display';
import type { ModComment } from '@/lib/discussions/discussions';
import { useDiscussionWall } from '@/lib/discussions/use-discussions';
import { useEditions } from '@/lib/events/use-editions';
import type { BoardSession } from '@/lib/live/live';
import { useBoard, useLiveRealtime } from '@/lib/live/use-live';
import type { SentNotification } from '@/lib/notifications/notifications';
import { useSentNotifications } from '@/lib/notifications/use-notifications';
import { shares } from '@/lib/polls/polls';
import { usePolls } from '@/lib/polls/use-polls';
import { useQuestions } from '@/lib/questions/use-questions';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

/**
 * Display boards for screens around the venue: the lobby, one room, or a room's discussion wall.
 * Staff start one on the screen's browser and it runs live, following the current event like the
 * other live-day tools. F toggles full screen (Esc also leaves it); the arrow at the bottom right
 * goes back to this setup.
 */
export default function DisplayPage() {
  const router = useRouter();
  const session = useSession();
  const [config, setConfig] = useState<DisplayConfig | null>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setConfig(loadDisplay());
      setRestored(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (session.status === 'signed-out') router.replace('/sign-in');
  }, [session.status, router]);

  if (session.status !== 'signed-in' || !restored) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background" aria-busy="true">
        <LogoLoader />
      </div>
    );
  }
  if (config) {
    return (
      <Board
        config={config}
        onExit={() => {
          saveDisplay(null);
          setConfig(null);
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
        }}
      />
    );
  }
  return (
    <Setup
      onStart={(c) => {
        saveDisplay(c);
        setConfig(c);
        void document.documentElement.requestFullscreen?.().catch(() => undefined);
      }}
    />
  );
}

/* ------------------------------------------------------------------ staff setup */

function Setup({ onStart }: { onStart: (c: DisplayConfig) => void }) {
  const board = useBoard();
  const rooms = roomsOf(board.data ?? []);
  const [kind, setKind] = useState<DisplayKind>('lobby');
  const [room, setRoom] = useState('');
  const [captions, setCaptions] = useState(true);
  const [appUrl, setAppUrl] = useState('');
  const [wifi, setWifi] = useState('');
  const [seconds, setSeconds] = useState('15');
  const [problem, setProblem] = useState<string | null>(null);
  const chosenRoom = room || rooms[0] || '';

  const start = (e: FormEvent) => {
    e.preventDefault();
    if (kind !== 'lobby' && !chosenRoom) return setProblem('There are no rooms with sessions yet.');
    if (appUrl.trim() && !/^https:\/\/\S+\.\S+/.test(appUrl.trim())) return setProblem('The app link should start with https://');
    onStart({ kind, room: kind !== 'lobby' ? chosenRoom : null, captions, appUrl: appUrl.trim() || null, wifi: wifi.trim() || null, seconds: Number(seconds) });
  };
  const input = 'h-11 rounded-lg border border-border bg-white px-3 text-sm text-ink outline-none focus:border-primary';

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <form onSubmit={start} className="flex w-full max-w-lg flex-col gap-5 rounded-2xl border border-border bg-surface p-7 shadow-sm">
        <div className="flex items-center gap-3">
          <Image src="/pic-logo.png" alt="" width={44} height={44} priority />
          <div>
            <h1 className="text-xl font-medium text-ink">Display board</h1>
            <p className="text-sm text-[#7c7c7c]">For a TV or projector at the venue. Shows the current event, live.</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Screen">
          {(
            [
              ['lobby', 'Lobby', 'What’s on in every room, next up, announcements'],
              ['room', 'One room', 'Its session, the live poll, top questions, captions'],
              ['discussion', 'Discussion wall', 'A room’s session discussion, live, with the room’s reaction'],
            ] as const
          ).map(([k, label, hint]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn('rounded-lg border px-3 py-3 text-left', kind === k ? 'border-primary bg-primary-soft/40' : 'border-border')}>
              <span className="block text-sm font-medium text-ink">{label}</span>
              <span className="block text-xs text-[#7c7c7c]">{hint}</span>
            </button>
          ))}
        </div>

        {kind !== 'lobby' && (
          <div className="flex flex-col gap-1">
            <span className="text-sm text-ink">Room</span>
            {rooms.length ? <Select label="Room" value={chosenRoom} options={rooms.map((r) => ({ value: r, label: r }))} onChange={setRoom} /> : <p className="text-sm text-[#7c7c7c]">{board.isPending ? 'Loading rooms…' : 'No sessions have rooms yet.'}</p>}
            {kind === 'discussion' && <span className="text-xs text-[#7c7c7c]">Follows whichever session is on in this room. Reported comments stay off the screen until a moderator keeps them.</span>}
          </div>
        )}
        {kind === 'room' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <p id="display-captions" className="text-sm text-ink">
                Live captions along the bottom
              </p>
              <Switch checked={captions} onChange={setCaptions} labelledBy="display-captions" />
            </div>
          </>
        )}

        <label className="flex flex-col gap-1 text-sm text-ink">
          Link to get the app <span className="-mt-1 text-xs text-[#7c7c7c]">Shown as a QR code; leave empty for none.</span>
          <input name="display-app-link" type="url" autoComplete="off" data-1p-ignore data-lpignore="true" value={appUrl} onChange={(e) => setAppUrl(e.target.value)} placeholder="https://" className={input} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink">
          Wi-Fi line <span className="-mt-1 text-xs text-[#7c7c7c]">Optional, e.g. “PIC-Guest · password summit2027”.</span>
          <input name="display-wifi-line" type="text" autoComplete="off" data-1p-ignore data-lpignore="true" value={wifi} onChange={(e) => setWifi(e.target.value)} maxLength={80} className={input} />
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-sm text-ink">Seconds per page</span>
          <Select label="Seconds per page" value={seconds} options={PAGE_SECONDS.map((n) => ({ value: String(n), label: `${n} seconds` }))} onChange={setSeconds} />
        </div>
        <p className="rounded-lg bg-surface-soft px-3 py-2 text-xs text-[#525252]">
          Press <kbd className="rounded border border-border bg-white px-1.5 font-sans">F</kbd> on the board for full screen, and F or <kbd className="rounded border border-border bg-white px-1.5 font-sans">Esc</kbd> to leave it. The arrow at the bottom right comes back here.
        </p>

        {problem && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
            {problem}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <Link href="/live" className={buttonClass({ style: 'borderless', color: 'gray' })}>
            <ArrowLeftIcon className="size-4" /> Back to the console
          </Link>
          <button type="submit" className={buttonClass()}>
            <ArrowsPointingOutIcon className="size-4" /> Start the board
          </button>
        </div>
      </form>
    </main>
  );
}

/* ------------------------------------------------------------------ the screen */

/*
 * The board is the dashboard's own parts: the page background, a Card with its titled header strip,
 * the dashboard table (muted column labels, divider-ruled rows, medium-weight first column) and
 * the design system's Tags for status. It is laid out at console size and zoomed to fill the whole
 * screen edge to edge: about 520 layout pixels tall (at least 700 wide), so on a 1080-line display
 * box the 16 px rows land at about 33 px, and the six rows share the height evenly.
 */
const STAGE_H = 520;
const STAGE_MIN_W = 700;
const ROWS = 6;
const TAG: Record<BoardStatus['tone'], TagTone> = { green: 'green', yellow: 'gold', blue: 'primary', dim: 'gray' };

/** The zoom that fills the screen, and the layout size that zoom leaves: no letterbox, whatever the shape. */
function useStageScale(): { scale: number; width: number; height: number } {
  const [fit, setFit] = useState({ scale: 1, width: STAGE_MIN_W, height: STAGE_H });
  useEffect(() => {
    const measure = () => {
      const w = document.documentElement.clientWidth || window.innerWidth;
      const h = document.documentElement.clientHeight || window.innerHeight;
      const scale = Math.min(h / STAGE_H, w / STAGE_MIN_W);
      setFit({ scale, width: w / scale, height: h / scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(document.documentElement);
    document.addEventListener('fullscreenchange', measure);
    return () => {
      observer.disconnect();
      document.removeEventListener('fullscreenchange', measure);
    };
  }, []);
  return fit;
}

/** Full screen again after the browser drops it (Esc, a reload): double-click or double-tap the board. */
function goFullscreen() {
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
}

/** F toggles full screen (Esc leaves it too, as the browser does anyway). */
function useFullscreenKey() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      else goFullscreen();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

/** Which page is showing: turns every `seconds`, starting at `first`. */
function usePager(count: number, seconds: number, first = 0): number {
  const [index, setIndex] = useState(first);
  useEffect(() => {
    if (count <= 1) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % count), seconds * 1000);
    return () => clearInterval(timer);
  }, [count, seconds]);
  return count ? index % count : 0;
}

/** "PIC-Guest · password summit2027" as a network and a password, when it reads that way. */
function splitWifi(line: string): { network: string; password: string | null } {
  const m = /^(.*?)\s*[·|,;]\s*(?:password|pass|pw)?\s*:?\s*(.+)$/i.exec(line);
  return m && m[1] ? { network: m[1].trim(), password: m[2]!.trim() } : { network: line, password: null };
}

function Board({ config, onExit }: { config: DisplayConfig; onExit: () => void }) {
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const board = useBoard();
  useLiveRealtime();
  const now = useNow(15_000);
  const fit = useStageScale();
  useFullscreenKey();
  const [qr, setQr] = useState('');

  useEffect(() => {
    if (!config.appUrl) return;
    let live = true;
    void QRCode.toString(config.appUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then((s) => live && setQr(s));
    return () => {
      live = false;
    };
  }, [config.appUrl]);

  const sessions = board.data ?? [];
  const wifi = config.wifi ? splitWifi(config.wifi) : null;

  return (
    <div className="relative h-dvh select-none overflow-hidden bg-background" onContextMenu={(e) => e.preventDefault()} onDoubleClick={goFullscreen}>

      <div className="absolute left-0 top-0 flex flex-col gap-3 overflow-hidden bg-background px-5 py-4" style={{ width: fit.width, height: fit.height, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>
        <header className="flex shrink-0 items-center gap-3">
          <Image src="/pic-logo.png" alt="Policy Innovation Centre" width={56} height={56} className="size-14 object-contain" priority />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-medium text-ink">{edition?.name ?? 'PIC Events'}</h1>
            <p className="truncate text-base text-muted">{config.kind !== 'lobby' ? (config.room ?? 'Room') : now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
          </div>
          {wifi && (
            <div className="max-w-56 text-right text-sm">
              <p className="text-muted">Wi-Fi</p>
              <p className="truncate font-medium text-ink">{wifi.network}</p>
              {wifi.password && <p className="truncate text-ink">{wifi.password}</p>}
            </div>
          )}
          <p className="pl-3 text-5xl font-medium tabular-nums text-ink">{now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
        </header>

        <div className="min-h-0 flex-1">
          {board.isPending && !board.data ? (
            <BoardCard title="Programme" index={0} pages={1} seconds={config.seconds}>
              <p className="py-8 text-center text-base text-muted">Loading the programme…</p>
            </BoardCard>
          ) : config.kind === 'discussion' ? (
            <DiscussionBoard sessions={sessions} room={config.room ?? ''} now={now} />
          ) : config.kind === 'lobby' ? (
            <LobbyBoard sessions={sessions} now={now} editionId={edition?.id ?? null} seconds={config.seconds} />
          ) : (
            <RoomBoard sessions={sessions} room={config.room ?? ''} now={now} editionId={edition?.id} seconds={config.seconds} captions={config.captions} />
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-4 text-sm text-muted">
          <p>{config.kind === 'discussion' ? 'Join the discussion in the PIC Events app, on this session’s page.' : config.kind === 'room' ? 'Ask questions and vote in the PIC Events app.' : 'Times may change. Live updates are in the PIC Events app.'}</p>
          <div className="flex items-center gap-4">
            {qr && (
              <div className="flex items-center gap-2">
                <span>Get the app</span>
                <span className="size-16 rounded-md border border-border bg-white p-1 [&_svg]:size-full" aria-hidden dangerouslySetInnerHTML={{ __html: qr }} />
              </div>
            )}
            {/* back to the setup */}
            <button type="button" onClick={onExit} onDoubleClick={(e) => e.stopPropagation()} aria-label="Close the board" className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-muted hover:text-ink">
              <ArrowRightStartOnRectangleIcon className="size-5" />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** The dashboard Card, filling the stage's middle, with the page count in its header and a line counting down to the next page. */
function BoardCard({ title, index, pages, seconds, children }: { title: string; index: number; pages: number; seconds: number; children: ReactNode }) {
  return (
    <div className="relative h-full overflow-hidden rounded-lg">
      <Card
        title={title}
        className="h-full"
        action={
          pages > 1 ? (
            <span className="text-base tabular-nums text-muted">
              Page {index + 1} of {pages}
            </span>
          ) : undefined
        }
      >
        <div key={index} className="screen-in flex min-h-0 flex-1 flex-col">
          {children}
        </div>
      </Card>
      {pages > 1 && (
        <div className="absolute inset-x-0 bottom-0 h-1 bg-divider" aria-hidden>
          <style>{'@keyframes pic-page-turn{from{width:0}to{width:100%}}'}</style>
          <div key={`${index}-${pages}`} className="h-full bg-primary" style={{ animation: `pic-page-turn ${seconds}s linear forwards` }} />
        </div>
      )}
    </div>
  );
}

// The dashboard table's look (components/dashboard/table-card.tsx), a size up: muted column labels,
// divider-ruled rows, medium-weight lead column. Always six rows, sharing the card's height evenly,
// so a short page keeps the same row size as a full one.
const th = 'pb-2 text-left text-sm font-medium text-muted';
const td = 'min-w-0 self-center truncate pr-4 text-base text-ink';

type BoardColumn = { label: string; width: string; className?: string };

function BoardTable({ columns, rows, label }: { columns: BoardColumn[]; rows: { key: string; dim?: boolean; flash?: boolean; cells: ReactNode[] }[]; label: string }) {
  const template = columns.map((c) => c.width).join(' ');
  return (
    <div role="table" aria-label={label} className="grid min-h-0 flex-1" style={{ gridTemplateColumns: template, gridTemplateRows: `auto repeat(${ROWS}, minmax(0, 1fr))` }}>
      <div role="row" className="col-span-full grid grid-cols-subgrid">
        {columns.map((c, i) => (
          <span key={i} role="columnheader" className={cn(th, c.className)}>
            {c.label}
          </span>
        ))}
      </div>
      {Array.from({ length: ROWS }, (_, i) => rows[i]).map((row, i) => (
        <div key={row?.key ?? `blank-${i}`} role="row" className={cn('col-span-full grid grid-cols-subgrid border-t border-divider', row?.dim && 'opacity-50', row?.flash && 'row-flash')}>
          {row?.cells.map((cell, j) => (
            <span key={j} role="cell" className={cn(td, columns[j]?.className)}>
              {cell}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function SessionTable({ rows, now, third }: { rows: BoardSession[]; now: Date; third: { label: string; value: (s: BoardSession) => string } }) {
  const [open, setOpen] = useState<BoardSession | null>(null);
  return (
    <>
      <BoardTable
        label="Programme"
        columns={[
          { label: 'Time', width: '5rem', className: 'tabular-nums' },
          { label: 'Session', width: 'minmax(0, 1fr)' },
          { label: third.label, width: '11rem' },
          { label: 'Status', width: '10rem', className: 'pr-0 text-right' },
          { label: '', width: '3.5rem', className: 'pr-0 text-right' },
        ]}
        rows={rows.map((s) => {
          const status = boardStatus(s, now);
          return {
            key: s.id,
            dim: status.tone === 'dim',
            cells: [
              hhmm(s.startsAt),
              <span key="t" className="font-medium">
                {s.title}
              </span>,
              third.value(s),
              <Tag key="s" tone={TAG[status.tone]} dot className="h-7 px-3 text-sm">
                {status.label}
              </Tag>,
              <button
                key="o"
                type="button"
                onClick={() => setOpen(s)}
                onDoubleClick={(e) => e.stopPropagation()}
                aria-label={`More about ${s.title}`}
                className={arrowButton}
              >
                <ArrowRightIcon className="size-5" />
              </button>,
            ],
          };
        })}
      />
      {open && <SessionPopup session={rows.find((r) => r.id === open.id) ?? open} now={now} onClose={() => setOpen(null)} />}
    </>
  );
}

/**
 * Closes a full-screen pop-up after 30 seconds or on Esc, so a screen left on one item goes back to
 * the board. Keeps the latest onClose in a ref: the board re-renders with the clock, and a new
 * callback each time must not restart the timer.
 */
function useAutoClose(onClose: () => void) {
  const latest = useRef(onClose);
  useEffect(() => {
    latest.current = onClose;
  });
  useEffect(() => {
    const timer = setTimeout(() => latest.current(), 30_000);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && latest.current();
    window.addEventListener('keydown', esc);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', esc);
    };
  }, []);
}

/** One item filling the screen, in the dashboard's card: a pill, a large title, then the details. Fixed inside the zoomed stage, so it zooms with the board. */
function FullScreenPopup({ label, pill, title, onClose, children }: { label: string; pill: ReactNode; title: string; onClose: () => void; children: ReactNode }) {
  useAutoClose(onClose);
  return (
    <section role="dialog" aria-modal="true" aria-label={label} className="pop-in fixed inset-0 z-30 flex flex-col gap-4 bg-background px-5 py-4" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-surface">
        <header className="flex items-start justify-between gap-6 border-b border-border px-8 py-6">
          <div className="min-w-0">
            {pill}
            <h2 className="mt-4 line-clamp-2 text-5xl font-medium leading-tight text-ink">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Back to the board" className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-border text-muted hover:text-ink">
            <XMarkIcon className="size-8" />
          </button>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-hidden px-8 py-7">{children}</div>
      </div>
      <p className="shrink-0 text-sm text-muted">Back to the board in 30 seconds, or press the cross.</p>
    </section>
  );
}

/** One session full screen: time, room, track and speakers. */
function SessionPopup({ session, now, onClose }: { session: BoardSession; now: Date; onClose: () => void }) {
  const status = boardStatus(session, now);
  return (
    <FullScreenPopup
      label={session.title}
      title={session.title}
      onClose={onClose}
      pill={
        <Tag tone={TAG[status.tone]} dot className="h-9 px-4 text-lg">
          {status.label}
        </Tag>
      }
    >
      <dl className="grid grid-cols-3 gap-6">
        {(
          [
            ['Time', `${hhmm(session.startsAt)} – ${hhmm(session.endsAt)}`],
            ['Room', session.room || '–'],
            ['Track', [session.track, session.type].filter(Boolean).join(' · ') || '–'],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-lg text-muted">{label}</dt>
            <dd className="mt-1 truncate text-3xl font-medium capitalize tabular-nums text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {session.speakers.length > 0 && (
        <div className="min-h-0 border-t border-divider pt-6">
          <p className="text-lg text-muted">{session.speakers.length === 1 ? 'Speaker' : 'Speakers'}</p>
          <ul className="mt-3 flex flex-col gap-3">
            {session.speakers.slice(0, 4).map((sp) => (
              <li key={sp.id} className="truncate text-2xl text-ink">
                <span className="font-medium">{sp.name}</span>
                {[sp.role, sp.organisation].filter(Boolean).length > 0 && <span className="text-muted"> · {[sp.role, sp.organisation].filter(Boolean).join(', ')}</span>}
              </li>
            ))}
            {session.speakers.length > 4 && <li className="text-2xl text-muted">and {session.speakers.length - 4} more</li>}
          </ul>
        </div>
      )}
    </FullScreenPopup>
  );
}

/** One announcement full screen: the whole message, large. */
function NoticePopup({ notice, onClose }: { notice: SentNotification; onClose: () => void }) {
  return (
    <FullScreenPopup
      label={notice.title}
      title={notice.title}
      onClose={onClose}
      pill={
        <Tag tone="primary" dot className="h-9 px-4 text-lg">
          Announcement · {hhmm(notice.sentAt!)}
        </Tag>
      }
    >
      {notice.body ? <p className="line-clamp-6 whitespace-pre-line text-3xl leading-snug text-ink">{notice.body}</p> : null}
    </FullScreenPopup>
  );
}

const arrowButton = 'inline-flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-ink hover:border-primary hover:text-primary';

/** The announcements page: time, title and message, with an arrow opening each one full screen. */
function NoticesTable({ rows }: { rows: SentNotification[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const shown = rows.find((n) => n.id === open);
  return (
    <>
      <BoardTable
        label="Announcements"
        columns={[
          { label: 'Time', width: '5rem', className: 'tabular-nums' },
          { label: 'Announcement', width: 'minmax(0, 1fr)' },
          { label: '', width: '3.5rem', className: 'pr-0 text-right' },
        ]}
        rows={rows.map((n) => ({
          key: n.id,
          cells: [
            hhmm(n.sentAt!),
            <span key="n" className="block truncate">
              <span className="font-medium">{n.title}</span>
              {n.body && <span className="text-muted"> · {n.body}</span>}
            </span>,
            <button key="o" type="button" onClick={() => setOpen(n.id)} onDoubleClick={(e) => e.stopPropagation()} aria-label={`Read ${n.title}`} className={arrowButton}>
              <ArrowRightIcon className="size-5" />
            </button>,
          ],
        }))}
      />
      {shown && <NoticePopup notice={shown} onClose={() => setOpen(null)} />}
    </>
  );
}

function LobbyBoard({ sessions, now, editionId, seconds }: { sessions: BoardSession[]; now: Date; editionId: string | null; seconds: number }) {
  const sent = useSentNotifications();
  const day = programmeDay(sessions, now);
  const notices = recentNotices(sent.data ?? [], editionId, now);
  const pages = roomsPages(roomRows(day?.sessions ?? [], now), notices);
  // A just-sent announcement turns the board straight to the announcements page.
  const fresh = freshNotice(notices, now);
  const first = fresh ? Math.max(0, pages.findIndex((p) => p.kind === 'notices')) : 0;
  return <LobbyPages key={`${pages.length}:${fresh?.id ?? ''}`} pages={pages} first={first} day={day?.day ?? null} now={now} seconds={seconds} />;
}

function LobbyPages({ pages, first, day, now, seconds }: { pages: RoomsPage[]; first: number; day: number | null; now: Date; seconds: number }) {
  const index = usePager(pages.length, seconds, first);
  const page = pages[index]!;
  if (page.kind === 'notices') {
    return (
      <BoardCard title="Announcements" index={index} pages={pages.length} seconds={seconds}>
        <NoticesTable rows={page.rows} />
      </BoardCard>
    );
  }
  return (
    <BoardCard title={day ? `Day ${day} · rooms` : 'Rooms'} index={index} pages={pages.length} seconds={seconds}>
      {page.kind === 'empty' ? <p className="py-8 text-center text-base text-muted">The rooms appear here once sessions are added.</p> : <RoomsTable rows={page.rows} now={now} />}
    </BoardCard>
  );
}

/** One row per room: what is on there now, with its status, and what is up next. The arrow opens the room's session full screen. */
function RoomsTable({ rows, now }: { rows: RoomRow[]; now: Date }) {
  const [open, setOpen] = useState<string | null>(null);
  // What each room shows (its session and status). When that changes while the page is up, e.g. a
  // session goes live, the room's row flashes once. Worked out during render, React's pattern for
  // state that follows props; nothing flashes when the page first appears.
  const states = new Map(rows.map((r) => [r.room, `${r.now?.id ?? ''}:${r.now ? boardStatus(r.now, now).label : 'free'}`]));
  const signature = [...states].join('|');
  const [seen, setSeen] = useState({ signature, states, flash: new Set<string>(), round: 0 });
  if (seen.signature !== signature) {
    const flash = new Set([...states].filter(([room, state]) => seen.states.has(room) && seen.states.get(room) !== state).map(([room]) => room));
    setSeen({ signature, states, flash, round: seen.round + 1 });
  }
  const shown = rows.find((r) => r.room === open);
  const openSession = shown ? (shown.now ?? shown.next) : null;
  return (
    <>
      <BoardTable
        label="Rooms"
        columns={[
          { label: 'Room', width: '10rem' },
          { label: 'Now', width: 'minmax(0, 1.2fr)' },
          { label: 'Status', width: '9.5rem' },
          { label: 'Up next', width: 'minmax(0, 1fr)' },
          { label: '', width: '3.5rem', className: 'pr-0 text-right' },
        ]}
        rows={rows.map((r) => {
          const status = r.now ? boardStatus(r.now, now) : null;
          const flash = seen.flash.has(r.room);
          return {
            // a new key replays the flash on the next change
            key: flash ? `${r.room}:${seen.round}` : r.room,
            flash,
            cells: [
              <span key="r" className="font-medium">
                {r.room}
              </span>,
              r.now ? (
                <span key="n" className="font-medium">
                  {r.now.title}
                </span>
              ) : (
                <span key="n" className="text-muted">
                  Nothing on
                </span>
              ),
              status && r.now ? (
                <Tag key="s" tone={TAG[status.tone]} dot className="h-7 px-3 text-sm">
                  {status.tone === 'green' ? timeLeft(r.now, now) : status.label}
                </Tag>
              ) : (
                <Tag key="s" tone="gray" className="h-7 px-3 text-sm">
                  Free
                </Tag>
              ),
              r.next ? (
                <span key="x">
                  <span className="tabular-nums text-muted">{hhmm(r.next.startsAt)}</span> {r.next.title}
                </span>
              ) : (
                <span key="x" className="text-muted">
                  Nothing more today
                </span>
              ),
              r.now || r.next ? (
                <button
                  key="o"
                  type="button"
                  onClick={() => setOpen(r.room)}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-label={`More about ${r.room}`}
                  className={arrowButton}
                >
                  <ArrowRightIcon className="size-5" />
                </button>
              ) : null,
            ],
          };
        })}
      />
      {openSession && <SessionPopup session={openSession} now={now} onClose={() => setOpen(null)} />}
    </>
  );
}

type RoomView = { kind: 'poll' } | { kind: 'programme'; rows: BoardSession[] } | { kind: 'questions' };
type OpenPoll = NonNullable<ReturnType<typeof usePolls>['data']>[number];

function RoomBoard({ sessions, room, now, editionId, seconds, captions }: { sessions: BoardSession[]; room: string; now: Date; editionId: string | undefined; seconds: number; captions: boolean }) {
  const { current } = roomNow(sessions, room, now);
  const day = programmeDay(sessions, now);
  const here = (day?.sessions ?? []).filter((s) => s.room === room);
  const polls = usePolls(editionId);
  const questions = useQuestions(current?.id);
  const poll = current ? (polls.data ?? []).find((p) => p.status === 'open' && p.sessionId === current.id) : undefined;
  const top = topQuestions(questions.data ?? [], 6);
  // An open poll holds the screen; otherwise the room's day, six rows a page, then its top questions.
  const pages: RoomView[] = poll
    ? [{ kind: 'poll' }]
    : [...lobbyPages(here, []).flatMap((p): RoomView[] => (p.kind === 'programme' ? [{ kind: 'programme', rows: p.rows }] : [])), ...(top.length ? [{ kind: 'questions' as const }] : [])];
  const first = Math.max(
    0,
    pages.findIndex((p) => p.kind === 'programme' && p.rows.some((s) => rowState(s, now) !== 'done')),
  );
  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1">
        <RoomPages key={pages.map((p) => p.kind).join()} pages={pages} first={first} now={now} poll={poll} top={top} seconds={seconds} />
      </div>
      {captions && current && <CaptionLine sessionId={current.id} />}
    </div>
  );
}

function RoomPages({ pages, first, now, poll, top, seconds }: { pages: RoomView[]; first: number; now: Date; poll: OpenPoll | undefined; top: ReturnType<typeof topQuestions>; seconds: number }) {
  const index = usePager(pages.length, seconds, first);
  const page = pages[index];
  if (page?.kind === 'poll' && poll) return <PollCard poll={poll} />;
  if (page?.kind === 'questions') {
    return (
      <BoardCard title="Top questions" index={index} pages={pages.length} seconds={seconds}>
        <BoardTable
          label="Top questions"
          columns={[
            { label: 'Question', width: 'minmax(0, 1fr)' },
            { label: 'Asked by', width: '12rem', className: 'text-muted' },
            { label: 'Votes', width: '5rem', className: 'pr-0 text-right tabular-nums' },
          ]}
          rows={top.map((q) => ({
            key: q.id,
            cells: [
              <span key="q" className="font-medium">
                {q.text}
              </span>,
              q.author.name,
              q.upvotes,
            ],
          }))}
        />
      </BoardCard>
    );
  }
  return (
    <BoardCard title="Today in this room" index={index} pages={pages.length} seconds={seconds}>
      {page?.kind === 'programme' ? <SessionTable rows={page.rows} now={now} third={{ label: 'Ends', value: (s) => hhmm(s.endsAt) }} /> : <p className="py-8 text-center text-base text-muted">No sessions in this room today.</p>}
    </BoardCard>
  );
}

/** A live poll as a dashboard card: one option a row, with its share as a bar once results show. */
function PollCard({ poll }: { poll: OpenPoll }) {
  const counts = poll.counts ?? poll.options.map(() => 0);
  const pct = shares(counts);
  const lead = Math.max(...counts);
  return (
    <BoardCard title="Live poll" index={0} pages={1} seconds={0}>
      <p className="truncate text-base font-medium text-ink">{poll.question}</p>
      <ul className="mt-3 flex flex-col gap-2.5">
        {poll.options.slice(0, 5).map((o, i) => {
          const leading = counts[i] === lead && lead > 0;
          return (
            <li key={i}>
              <div className="flex items-baseline justify-between gap-4 text-sm text-ink">
                <span className={cn('truncate', leading && poll.showResults && 'font-medium')}>{o}</span>
                {poll.showResults && <span className="tabular-nums">{pct[i]}%</span>}
              </div>
              {poll.showResults && (
                <div className="mt-1 h-2 rounded-full bg-surface-soft">
                  <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', leading ? 'bg-primary' : 'bg-chart-2')} style={{ width: `${pct[i]}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-auto pt-2 text-xs tabular-nums text-muted">
        {poll.total.toLocaleString('en-GB')} {poll.total === 1 ? 'vote' : 'votes'}
        {poll.showResults ? '' : ' · results when the poll closes'}
      </p>
    </BoardCard>
  );
}

/** One line of live captions under the card. Labelled, since they are machine-made. */
function CaptionLine({ sessionId }: { sessionId: string }) {
  const feed = useCaptionFeed(sessionId);
  const line = feed.interim?.text ?? feed.finals.at(-1)?.text;
  if (!line) return null;
  return (
    <div className="shrink-0 rounded-lg border border-border bg-surface px-4 py-2">
      <p className="truncate text-sm text-ink">{line}</p>
      <p className="text-xs text-muted">Live captions, generated automatically</p>
    </div>
  );
}

/* ------------------------------------------------------------------ discussion wall */

/**
 * A room's session discussion, live: the newest comments (each slides in as it is posted), the
 * room's reaction (likes against dislikes across the thread) and its most liked comments. Built
 * from the dashboard's Cards like the other boards.
 */
function DiscussionBoard({ sessions, room, now }: { sessions: BoardSession[]; room: string; now: Date }) {
  const session = wallSession(sessions, room, now);
  const { comments, locked } = useDiscussionWall(session?.id);
  if (!session) {
    return (
      <Card title="Live discussion" className="h-full">
        <p className="py-8 text-center text-base text-muted">No sessions in this room today.</p>
      </Card>
    );
  }
  const all = comments.data ?? [];
  const latest = wallComments(all);
  const liked = mostLiked(all);
  const reaction = roomReaction(all);
  const status = boardStatus(session, now);
  return (
    <div className="grid h-full grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-4">
      <Card
        title={session.title}
        className="h-full min-h-0 overflow-hidden"
        action={
          <span className="flex items-center gap-2">
            {locked && (
              <Tag tone="gray" className="h-7 px-3 text-sm">
                Discussion closed
              </Tag>
            )}
            <Tag tone={TAG[status.tone]} dot className="h-7 px-3 text-sm">
              {status.label}
            </Tag>
          </span>
        }
      >
        {comments.isPending ? (
          <p className="py-8 text-center text-base text-muted">Loading the discussion…</p>
        ) : latest.length === 0 ? (
          <p className="py-8 text-center text-base text-muted">No comments yet. Be the first: open this session in the PIC Events app.</p>
        ) : (
          <ul className="flex min-h-0 flex-col overflow-hidden" aria-live="polite">
            {latest.map((c) => (
              <WallComment key={c.id} comment={c} now={now} />
            ))}
          </ul>
        )}
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <Card title="Room reaction">
          {reaction.positive === null ? (
            <p className="py-2 text-base text-muted">No reactions yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-4xl font-medium tabular-nums text-ink">
                {reaction.positive}% <span className="text-base font-normal text-muted">positive</span>
              </p>
              <div className="flex h-3 overflow-hidden rounded-full bg-surface-soft" aria-hidden>
                <div className="h-full bg-success transition-[width] duration-700 ease-out" style={{ width: `${reaction.positive}%` }} />
                <div className="h-full flex-1 bg-danger/70" />
              </div>
              <p className="flex items-center gap-4 text-base tabular-nums text-ink">
                <span className="flex items-center gap-1.5">
                  <HandThumbUpIcon className="size-5 text-success" /> {reaction.likes.toLocaleString('en-GB')}
                </span>
                <span className="flex items-center gap-1.5">
                  <HandThumbDownIcon className="size-5 text-danger" /> {reaction.dislikes.toLocaleString('en-GB')}
                </span>
              </p>
            </div>
          )}
        </Card>
        <Card title="Most liked" className="min-h-0 flex-1 overflow-hidden">
          {liked.length === 0 ? (
            <p className="py-2 text-base text-muted">Nothing liked yet.</p>
          ) : (
            <ol className="flex flex-col">
              {liked.map((c) => (
                <li key={c.id} className="border-t border-divider py-2 first:border-t-0 first:pt-0">
                  <p className="line-clamp-2 text-sm text-ink">{c.body}</p>
                  <p className="mt-0.5 flex items-center justify-between gap-2 text-xs text-muted">
                    <span className="truncate">{c.authorName}</span>
                    <span className="flex shrink-0 items-center gap-1 tabular-nums text-ink">
                      <HandThumbUpIcon className="size-4 text-success" /> {c.likes}
                    </span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

/** One comment on the wall: who, how long ago, what they said and its likes. Slides in when it arrives. */
function WallComment({ comment, now }: { comment: ModComment; now: Date }) {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(comment.createdAt)) / 60_000));
  return (
    <li className="screen-in flex gap-4 border-t border-divider py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium text-ink">{comment.authorName}</span>
          {comment.authorOrganisation && <span className="text-muted"> · {comment.authorOrganisation}</span>}
          <span className="text-muted"> · {minutes < 1 ? 'just now' : `${minutes} min ago`}</span>
        </p>
        <p className="mt-0.5 line-clamp-2 text-base text-ink">{comment.body}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-sm tabular-nums">
        <span className="flex items-center gap-1 text-ink">
          <HandThumbUpIcon className="size-4 text-success" /> {comment.likes}
        </span>
        {comment.dislikes > 0 && (
          <span className="flex items-center gap-1 text-muted">
            <HandThumbDownIcon className="size-4" /> {comment.dislikes}
          </span>
        )}
      </div>
    </li>
  );
}
