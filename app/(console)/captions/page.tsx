'use client';

import {
  AdjustmentsVerticalIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  MicrophoneIcon,
  NoSymbolIcon,
  PlayCircleIcon,
  SignalIcon,
  StopCircleIcon,
  TrashIcon,
  TvIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { useRealtimeStatus } from '@/lib/api/realtime';
import {
  deskRooms,
  FLOOR_DB,
  meterFraction,
  meterZone,
  paragraphs,
  parseSourceKey,
  readPatch,
  sameRoom,
  sourceKey,
  sourceOptions,
  speakerLabel,
  uncaptioned,
  type DeskPatch,
} from '@/lib/captions/captions';
import type { RoomState } from '@/lib/captions/room-capture';
import type { CaptureSource } from '@/lib/ingest/ingest';
import { useIngestRooms } from '@/lib/ingest/use-ingest';
import { useCaptionActions, useCaptionFeed, useLiveSessions, useSoundDesk, type ChannelLevel, type MicPermission } from '@/lib/captions/use-captions';
import { useEditions } from '@/lib/events/use-editions';
import { currentDay } from '@/lib/live/live';
import { useBoard } from '@/lib/live/use-live';
import type { Session } from '@/lib/programme/programme';
import { useRooms } from '@/lib/venue/use-venue';
import { cn } from '@/lib/utils';
import { MicsPanel } from '@/components/captions/mics-panel';

const TABS = [
  { key: 'monitor', label: 'Monitor', icon: TvIcon },
  { key: 'desk', label: 'Sound desk', icon: AdjustmentsVerticalIcon },
  { key: 'mics', label: 'Mics', icon: MicrophoneIcon },
] as const;


const hms = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });


type Tab = (typeof TABS)[number]['key'];

function Tabs({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const next = TABS[(TABS.findIndex((t) => t.key === tab) + 1) % TABS.length]!.key;
    onChange(next);
    document.getElementById(`captions-tab-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Captions sections" onKeyDown={onKey} className="flex gap-6 border-b border-border">
      {TABS.map((t) => {
        const selected = tab === t.key;
        return (
          <button
            key={t.key}
            id={`captions-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`captions-panel-${t.key}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-1 pb-3 text-sm transition-colors',
              selected ? 'border-primary font-medium text-primary' : 'border-transparent text-[#525252] hover:text-ink',
            )}
          >
            <t.icon className="size-4" />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function ConnectionDot() {
  const connection = useRealtimeStatus();
  const label = { live: 'Connected', connecting: 'Connecting…', offline: 'Not connected', demo: 'Demo data' }[connection];
  return (
    <p className="flex items-center gap-2 text-xs text-[#7c7c7c]" aria-live="polite">
      <span
        className={cn(
          'size-2 rounded-full',
          connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder',
        )}
        aria-hidden
      />
      {label}
    </p>
  );
}

/* ----------------------------------------------------------------- monitor */

/** The running caption stream for one session, as paragraphs, following the newest line. */
function CaptionStream({ session }: { session: Session }) {
  const feed = useCaptionFeed(session.id);
  const { clear, exportTranscript } = useCaptionActions(session.id);
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  const blocks = useMemo(() => paragraphs(feed.finals), [feed.finals]);

  // Stay pinned to the newest line unless the operator has scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following) el.scrollTop = el.scrollHeight;
  }, [feed, following]);
  const onScroll = () => {
    const el = scroller.current;
    if (el) setFollowing(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const download = (format: 'csv' | 'txt') =>
    exportTranscript.mutate(
      { format, title: session.title },
      { onError: (e) => toast.push({ title: 'Transcript not downloaded', leading: { kind: 'icon', icon: ExclamationTriangleIcon, tone: 'danger' }, body: e.message }) },
    );

  return (
    <section aria-label={`Captions for ${session.title}`} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-base font-medium text-ink">{session.title}</p>
          <p className="text-xs text-[#7c7c7c]">
            {session.room} · {feed.finals.length} {feed.finals.length === 1 ? 'line' : 'lines'} on screen
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => download('csv')} disabled={exportTranscript.isPending} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" />
            CSV
          </button>
          <button type="button" onClick={() => download('txt')} disabled={exportTranscript.isPending} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" />
            TXT
          </button>
          <button type="button" onClick={() => setConfirmClear(true)} className={buttonClass({ style: 'soft', color: 'danger' })}>
            <TrashIcon className="size-4" />
            Clear
          </button>
        </div>
      </header>

      <div ref={scroller} onScroll={onScroll} aria-live="off" className="relative h-[28rem] overflow-y-auto px-5 py-4">
        {blocks.length === 0 && !feed.interim ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-[#7c7c7c]">
            <MicrophoneIcon className="mb-2 size-8" />
            Waiting for the first words. Captions appear here as soon as the capture desk sends audio.
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {blocks.map((p) => (
              <div key={p.lines[0]!.seq} className="flex gap-4">
                <p className="w-16 shrink-0 pt-0.5 text-xs tabular-nums text-[#7c7c7c]">{hms(p.at)}</p>
                <div className="min-w-0">
                  {speakerLabel(p.speaker) && <p className="mb-0.5 text-xs font-medium text-primary">{speakerLabel(p.speaker)}</p>}
                  <p className="text-[15px] leading-7 text-ink">{p.lines.map((l) => l.text).join(' ')}</p>
                </div>
              </div>
            ))}
            {feed.interim && (
              <div className="flex gap-4">
                <p className="w-16 shrink-0 pt-0.5 text-xs text-[#7c7c7c]">now</p>
                <p className="text-[15px] leading-7 text-[#7c7c7c] italic">{feed.interim.text}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {!following && (
        <div className="border-t border-border bg-[#f6f6f6] px-5 py-2 text-right">
          <button type="button" onClick={() => setFollowing(true)} className={buttonClass({ style: 'borderless', className: 'h-8' })}>
            Jump to latest
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmClear}
        title="Clear the captions?"
        confirmLabel="Clear captions"
        pendingLabel="Clearing…"
        pending={clear.isPending}
        tone="danger"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() =>
          clear.mutate(undefined, {
            onSuccess: () => {
              setConfirmClear(false);
              toast.push({ title: 'Captions cleared', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: 'Every screen following this session starts fresh.' });
            },
          })
        }
      >
        The caption screen empties for everyone following this session, in the app and on the stream. The full transcript is kept and can still be downloaded.
        {clear.error && <span className="mt-2 block text-xs text-danger">{clear.error.message}</span>}
      </ConfirmDialog>
    </section>
  );
}

function Monitor({ sessions }: { sessions: Session[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === picked) ?? sessions[0];

  if (!session) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-[#7c7c7c]">
        <SignalIcon className="mx-auto mb-2 size-8" />
        No session is live right now. Start one from Live ops, and its captions appear here.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {sessions.length > 1 && (
        <Select
          label="Live session"
          value={session.id}
          options={sessions.map((s) => ({ value: s.id, label: `${s.room} · ${s.title}` }))}
          onChange={setPicked}
          className="max-w-md"
        />
      )}
      {/* Keyed so switching sessions starts a fresh feed. */}
      <CaptionStream key={session.id} session={session} />
      <p className="text-xs text-[#7c7c7c]">Watching here counts as one caption listener on Live ops.</p>
    </div>
  );
}

/* -------------------------------------------------------------- sound desk */

const PATCH_KEY = 'pic.admin.sound-desk-patch';

const ZONE_BG = { ok: 'bg-success', hot: 'bg-gold', clip: 'bg-danger' } as const;

/** A vertical peak meter on the broadcast scale (-60 to 0 dBFS), with a peak-hold line. */
function ChannelMeter({ level, label }: { level: ChannelLevel | undefined; label: string }) {
  const db = level?.db ?? FLOOR_DB;
  const hold = level?.hold ?? FLOOR_DB;
  return (
    <div
      className="relative mx-auto h-16 w-2 overflow-hidden rounded-sm bg-[#ececec]"
      role="meter"
      aria-label={`${label} level`}
      aria-valuemin={FLOOR_DB}
      aria-valuemax={0}
      aria-valuenow={Math.round(db)}
      aria-valuetext={db <= FLOOR_DB ? 'silent' : `${Math.round(db)} dBFS`}
    >
      <span className={cn('absolute inset-x-0 bottom-0', ZONE_BG[meterZone(db)])} style={{ height: `${meterFraction(db) * 100}%` }} />
      {hold > FLOOR_DB && <span className={cn('absolute inset-x-0 h-0.5', ZONE_BG[meterZone(hold)])} style={{ bottom: `calc(${meterFraction(hold) * 100}% - 2px)` }} />}
    </div>
  );
}

function RoomStatusTag({ state, patched, elsewhere }: { state: RoomState | undefined; patched: boolean; elsewhere: CaptureSource | null }) {
  if (!state && elsewhere) {
    return (
      <Tag tone="green" dot>
        {elsewhere === 'ingest' ? 'Venue stream' : 'Other desk'}
      </Tag>
    );
  }
  if (!state) return patched ? <Tag>Ready</Tag> : <span className="text-xs text-[#7c7c7c]">Not patched</span>;
  if (state.status === 'capturing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 text-xs leading-5 text-on-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-on-primary" aria-hidden />
        On air
      </span>
    );
  }
  if (state.status === 'error') return <Tag tone="danger" dot>Stopped</Tag>;
  return (
    <Tag tone="gold" dot>
      {{ starting: 'Starting…', waiting: elsewhere === 'ingest' ? 'Standing by' : 'Waiting', reconnecting: 'Reconnecting' }[state.status]}
    </Tag>
  );
}

const SETUP_STEPS = [
  { title: 'At the mixer', body: 'Send each room to its own output: an aux, matrix or direct out, speech only.' },
  { title: 'Into this computer', body: 'Cable those outputs into a USB audio interface, one input per room.' },
  { title: 'Here', body: 'Connect the interface, check each channel moves, and patch it to its room.' },
];

/** Before any audio: what the desk needs, and the browser permission, explained before it is asked. */
function DeskSetup({
  permission,
  connecting,
  error,
  streamed,
  onConnect,
}: {
  permission: MicPermission;
  connecting: boolean;
  error: string | null;
  /** Rooms captioned from venue streams right now; the desk is then their backup. */
  streamed: string[];
  onConnect: () => void;
}) {
  return (
    <section aria-labelledby="desk-setup" className="rounded-2xl border border-border bg-surface p-6 md:p-8">
      {streamed.length > 0 && (
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-success-soft px-4 py-3 text-sm text-success">
          <SignalIcon className="mt-0.5 size-4 shrink-0" />
          {streamed.length === 1 ? `${streamed[0]} is` : `${streamed.length} rooms are`} captioned from the venue stream, with no desk needed. Set this desk up as a
          backup: a room on stand-by takes over by itself if its stream stops.
        </p>
      )}
      <h2 id="desk-setup" className="text-lg font-medium text-ink">
        Caption every room from the sound desk
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-[#525252]">
        One computer next to the venue mixer takes each room&apos;s audio on its own channel, so no room needs an operator with a microphone.
      </p>

      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {SETUP_STEPS.map((step, i) => (
          <li key={step.title} className="rounded-xl border border-border p-4">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">{i + 1}</span>
            <p className="mt-3 text-sm font-medium text-ink">{step.title}</p>
            <p className="mt-0.5 text-sm text-[#525252]">{step.body}</p>
          </li>
        ))}
      </ol>

      {permission === 'denied' ? (
        <div role="alert" className="mt-6 rounded-xl border border-danger/30 bg-danger-soft p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-danger">
            <NoSymbolIcon className="size-5" />
            This browser is blocking audio inputs for the console
          </p>
          <ol className="mt-2 list-decimal space-y-0.5 pl-11 text-sm text-ink">
            <li>Click the site controls icon at the left of the address bar.</li>
            <li>Set Microphone to Allow.</li>
            <li>Reload this page, then connect again.</li>
          </ol>
          <button type="button" onClick={() => window.location.reload()} className={buttonClass({ style: 'outline', color: 'gray', className: 'mt-3 ml-7' })}>
            <ArrowPathIcon className="size-4" />
            Reload page
          </button>
        </div>
      ) : (
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <button type="button" onClick={onConnect} disabled={connecting} className={buttonClass()}>
            <AdjustmentsVerticalIcon className="size-4" />
            {connecting ? 'Connecting…' : 'Connect audio interface'}
          </button>
          {permission !== 'granted' && (
            <p className="max-w-md text-xs text-[#7c7c7c]">The browser will ask to use your microphone. Choose Allow: that is how it reaches the interface. Audio goes only to the caption service.</p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-danger">
          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0" />
          {error}
        </p>
      )}
    </section>
  );
}

function Summary({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' | 'success' }) {
  return (
    <div className={cn('rounded-lg border bg-surface px-5 py-4', tone === 'danger' ? 'border-danger/40' : 'border-border')}>
      <p className="text-sm text-[#525252]">{label}</p>
      <p className={cn('mt-1 text-2xl font-medium tabular-nums', tone === 'danger' ? 'text-danger' : tone === 'success' ? 'text-success' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-[#7c7c7c]" title={hint}>{hint}</p>}
    </div>
  );
}

type Confirm = { kind: 'room'; room: string } | { kind: 'all' } | { kind: 'disconnect' };

/**
 * The sound desk: one computer beside the venue mixer captions every room. Rooms (from Venue &
 * rooms and the programme) run down the side, the interface's channels across the top with their
 * meters, and a room is patched to a channel by clicking where they cross, as in a routing matrix.
 */
function SoundDesk({ live }: { live: Session[] }) {
  const desk = useSoundDesk();
  const board = useBoard();
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const venueRooms = useRooms(edition);
  // What the server sees: which rooms a venue stream or another desk is captioning.
  const server = useIngestRooms();
  const elsewhere = (room: string): CaptureSource | null =>
    server.disabled ? null : (server.data?.find((r) => sameRoom(r.room, room))?.captioning ?? null);
  // Remembered on this computer, so the desk is ready the next morning. (The desk renders only
  // once live sessions have loaded in the browser, so reading storage here is safe.)
  const [patch, setPatch] = useState<DeskPatch>(() => {
    try {
      return readPatch(localStorage.getItem(PATCH_KEY));
    } catch {
      return {};
    }
  });
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const updatePatch = (room: string, change: Partial<DeskPatch[string]>) =>
    setPatch((all) => {
      const next = { ...all, [room]: { ...(all[room] ?? { source: '', diarise: false }), ...change } };
      try {
        localStorage.setItem(PATCH_KEY, JSON.stringify(next));
      } catch {
        // Not remembered, but still used for this visit.
      }
      return next;
    });

  const programmeRooms = useMemo(() => {
    const sessions = board.data ?? [];
    const { day } = currentDay(sessions);
    return sessions.filter((s) => s.day === day).map((s) => s.room);
  }, [board.data]);
  const rooms = deskRooms((venueRooms.data ?? []).map((r) => r.name), programmeRooms, live.map((s) => s.room));
  const channels = useMemo(() => sourceOptions(desk.inputs ?? []), [desk.inputs]);
  const patchedSource = (room: string) => {
    const source = patch[room]?.source;
    return source && channels.some((c) => c.value === source) ? source : null;
  };
  const running = Object.keys(desk.rooms).filter((room) => desk.rooms[room]?.status !== 'error');
  const captioning = running.filter((room) => desk.rooms[room]?.status === 'capturing');
  const startable = rooms.filter((room) => !desk.rooms[room] && patchedSource(room));
  const captionedAnywhere = rooms.filter((room) => captioning.some((r) => sameRoom(r, room)) || !!elsewhere(room));
  const missing = uncaptioned(live, [...captioning, ...captionedAnywhere]);
  const streamed = rooms.filter((room) => elsewhere(room) === 'ingest');
  const onAir = (room: string) => live.find((s) => sameRoom(s.room, room));
  const liveRunning = running.filter((room) => onAir(room));

  // Closing the tab mid-session silences every room: ask first.
  useEffect(() => {
    if (running.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running.length]);

  const startRoom = (room: string) => {
    const source = patchedSource(room);
    if (source) void desk.start(room, source, !!patch[room]?.diarise);
  };
  const confirmNow = () => {
    if (!confirm) return;
    if (confirm.kind === 'room') void desk.stop(confirm.room);
    else if (confirm.kind === 'all') running.forEach((room) => void desk.stop(room));
    else void desk.disconnect();
    setConfirm(null);
  };

  if (!desk.inputs) {
    return <DeskSetup permission={desk.permission} connecting={desk.connecting} error={desk.error} streamed={streamed} onConnect={() => void desk.connect()} />;
  }
  const inputs = desk.inputs;
  const channelCount = channels.length;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Summary
          label="Live without captions"
          value={String(missing.length)}
          hint={missing.length ? missing.map((s) => s.room).join(', ') : live.length ? 'Every live room is captioned' : 'Nothing live right now'}
          tone={missing.length ? 'danger' : live.length ? 'success' : undefined}
        />
        <Summary
          label="Rooms captioned"
          value={`${captionedAnywhere.length} of ${rooms.length}`}
          hint={[
            captioning.length ? `${captioning.length} from this desk` : '',
            streamed.length ? `${streamed.length} from venue streams` : '',
            running.length > captioning.length ? `${running.length - captioning.length} standing by or reconnecting` : '',
          ]
            .filter(Boolean)
            .join(' · ') || undefined}
        />
        <Summary label="Channels" value={String(channelCount)} hint={inputs.map((i) => i.label).join(', ')} />
        <div className="flex flex-col justify-between rounded-lg border border-border bg-surface px-5 py-4">
          <p className="text-sm text-[#525252]">Caption service</p>
          <ConnectionDot />
          <button
            type="button"
            onClick={() => (running.length ? setConfirm({ kind: 'disconnect' }) : void desk.disconnect())}
            className="self-start text-xs text-[#7c7c7c] underline-offset-2 hover:text-ink hover:underline"
          >
            Disconnect interface
          </button>
        </div>
      </div>

      <section aria-label="Patch" className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-medium text-ink">Patch</h2>
            <p className="text-xs text-[#7c7c7c]">Click where a room meets its channel. Captions go to whichever session is live in the room.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {running.length > 0 && (
              <button type="button" onClick={() => setConfirm({ kind: 'all' })} className={buttonClass({ style: 'outline', color: 'danger' })}>
                <StopCircleIcon className="size-4" />
                Stop all
              </button>
            )}
            {startable.length > 0 && (
              <button type="button" onClick={() => startable.forEach(startRoom)} className={buttonClass()}>
                <PlayCircleIcon className="size-4" />
                {startable.length === 1 ? `Start ${startable[0]}` : `Start ${startable.length} rooms`}
              </button>
            )}
          </div>
        </header>

        {rooms.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#7c7c7c]">
            No rooms yet.{' '}
            <Link href="/venue" className="text-primary hover:underline">
              Add the venue&apos;s rooms
            </Link>{' '}
            and they appear here.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th rowSpan={2} scope="col" className="sticky left-0 z-10 min-w-36 border-b border-border bg-surface px-3 md:min-w-56 md:px-5 py-2 text-left align-bottom text-xs font-normal text-[#7c7c7c]">
                    Room
                  </th>
                  {inputs.map((input) => (
                    <th key={input.deviceId} colSpan={input.channels} scope="colgroup" className="border-b border-l border-border px-2 pt-2 pb-1 text-left text-xs font-normal text-[#525252]">
                      <span className="block max-w-[14rem] truncate" title={input.label}>
                        {input.label}
                      </span>
                    </th>
                  ))}
                  <th rowSpan={2} scope="col" className="min-w-64 md:sticky md:right-0 md:z-10 border-b border-l border-border bg-surface px-4 py-2 text-left align-bottom text-xs font-normal text-[#7c7c7c]">
                    Captions
                  </th>
                </tr>
                <tr>
                  {inputs.flatMap((input) =>
                    Array.from({ length: input.channels }, (_, channel) => {
                      const key = sourceKey(input.deviceId, channel);
                      return (
                        <th key={key} scope="col" className={cn('w-11 border-b border-border px-1 pt-1 pb-2 text-center font-normal', channel === 0 && 'border-l')}>
                          <ChannelMeter level={desk.levels[key]} label={`${input.label} channel ${channel + 1}`} />
                          <span className="mt-1 block text-[11px] tabular-nums text-[#7c7c7c]">{channel + 1}</span>
                        </th>
                      );
                    }),
                  )}
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => {
                  const state = desk.rooms[room];
                  const busy = !!state && state.status !== 'error';
                  const session = onAir(room);
                  const source = patchedSource(room);
                  const alarm = !!session && !captionedAnywhere.some((r) => sameRoom(r, room));
                  return (
                    <tr key={room} className="group">
                      <th scope="row" className={cn('sticky left-0 z-10 max-w-36 border-b border-border bg-surface px-3 py-2.5 md:max-w-none md:px-5 text-left font-normal group-hover:bg-[#fafafa]', alarm && 'shadow-[inset_3px_0_0_var(--color-danger)]')}>
                        <p className="truncate text-sm font-medium text-ink">{room}</p>
                        <p className={cn('max-w-56 truncate text-xs', session ? 'text-success' : 'text-[#7c7c7c]')} title={session?.title}>
                          {session ? `Live · ${session.title}` : 'Nothing on air'}
                        </p>
                      </th>
                      {channels.map((c, i) => {
                        const patched = source === c.value;
                        const firstOfInput = parseSourceKey(c.value)?.channel === 0;
                        return (
                          <td key={c.value} className={cn('border-b border-border p-0 text-center group-hover:bg-[#fafafa]', firstOfInput && i > 0 && 'border-l', firstOfInput && i === 0 && 'border-l')}>
                            <button
                              type="button"
                              aria-pressed={patched}
                              aria-label={`${patched ? 'Unpatch' : 'Patch'} ${room} ${patched ? 'from' : 'to'} ${c.label}`}
                              title={busy ? 'Stop this room to change its channel' : c.label}
                              disabled={busy}
                              onClick={() => updatePatch(room, { source: patched ? '' : c.value })}
                              className="flex h-12 w-full items-center justify-center disabled:cursor-not-allowed"
                            >
                              <span
                                className={cn(
                                  'size-3.5 rounded-full border transition-colors',
                                  patched ? (busy ? 'border-danger bg-danger' : 'border-primary bg-primary') : 'border-[#dcdcdc] group-hover:border-[#bdbdbd]',
                                  !busy && !patched && 'hover:!border-primary hover:bg-primary-soft',
                                )}
                              />
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b md:sticky md:right-0 md:z-10 border-l border-border bg-surface px-4 py-2 group-hover:bg-[#fafafa]">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <RoomStatusTag state={state} patched={!!source} elsewhere={elsewhere(room)} />
                            {state?.message && (
                              <p className={cn('mt-0.5 max-w-44 truncate text-xs', state.status === 'error' ? 'text-danger' : 'text-[#7a5d00]')} title={state.message}>
                                {state.message}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-[#7c7c7c]" aria-hidden title="Label who is speaking, for panels. Adds a little delay.">
                              Speakers
                            </span>
                            <Switch
                              checked={!!patch[room]?.diarise}
                              onChange={(diarise) => updatePatch(room, { diarise })}
                              disabled={busy}
                              label={`Label speakers in ${room} (for panels; adds a little delay)`}
                            />
                            {busy ? (
                              <button
                                type="button"
                                onClick={() => (session ? setConfirm({ kind: 'room', room }) : void desk.stop(room))}
                                className={buttonClass({ style: 'outline', color: 'danger', className: 'h-8 w-16' })}
                              >
                                Stop
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!source}
                                onClick={() => (state ? void desk.stop(room).then(() => startRoom(room)) : startRoom(room))}
                                className={buttonClass({ style: 'soft', className: 'h-8 w-16' })}
                              >
                                {state ? 'Retry' : elsewhere(room) === 'ingest' ? 'Stand by' : 'Start'}
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border bg-[#f6f6f6] px-5 py-3 text-xs text-[#7c7c7c]">
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-success" /> below −12 dBFS</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-gold" /> −12 to −3, good for speech</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-danger" /> above −3, turn the send down</span>
          </p>
          <Link href="/venue" className="text-primary hover:underline">
            Room missing? Add it in Venue &amp; rooms
          </Link>
        </footer>
      </section>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.kind === 'room' ? `Stop captions in ${confirm.room}?` : confirm?.kind === 'all' ? 'Stop captions in every room?' : 'Disconnect the interface?'}
        confirmLabel={confirm?.kind === 'disconnect' ? 'Disconnect' : 'Stop captions'}
        tone="danger"
        onCancel={() => setConfirm(null)}
        onConfirm={confirmNow}
      >
        {confirm?.kind === 'room'
          ? `“${onAir(confirm.room)?.title ?? 'A session'}” is live there; its captions stop until the room is started again.`
          : liveRunning.length > 0
            ? `${liveRunning.length === 1 ? `${liveRunning[0]} has a live session` : `${liveRunning.length} rooms have live sessions`}; their captions stop until started again.`
            : 'Every room this desk is captioning stops.'}
      </ConfirmDialog>
    </div>
  );
}

export default function CaptionsPage() {
  const live = useLiveSessions();
  const [tab, setTab] = useState<Tab>('monitor');
  const sessions = useMemo(() => [...(live.data ?? [])].sort((a, b) => a.room.localeCompare(b.room)), [live.data]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <h1 className="sr-only">Captions</h1>
      <Tabs tab={tab} onChange={setTab} />

      {live.isPending ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : live.isError && !live.data ? (
        <div role="alert" className="rounded-2xl border border-border bg-surface p-10 text-center">
          <p className="font-medium text-ink">Live sessions could not load.</p>
          <p className="mt-1 text-sm text-muted">{live.error.message}</p>
          <button type="button" onClick={() => void live.refetch()} className={buttonClass({ className: 'mt-4' })}>
            Try again
          </button>
        </div>
      ) : (
        <>
          {/* Both stay mounted so a running desk keeps capturing while the operator checks the monitor. */}
          <div id="captions-panel-monitor" role="tabpanel" aria-labelledby="captions-tab-monitor" hidden={tab !== 'monitor'}>
            <Monitor sessions={sessions} />
          </div>
          <div id="captions-panel-desk" role="tabpanel" aria-labelledby="captions-tab-desk" hidden={tab !== 'desk'}>
            <SoundDesk live={sessions} />
          </div>
        </>
      )}
                <div id="captions-panel-mics" role="tabpanel" aria-labelledby="captions-tab-mics" hidden={tab !== 'mics'}>
            {tab === 'mics' && <MicsPanel />}
          </div>

    </div>
    
  );
}
