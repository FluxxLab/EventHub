'use client';

import {
  AdjustmentsVerticalIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  BookOpenIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  CloudIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  MicrophoneIcon,
  NoSymbolIcon,
  PauseIcon,
  PlayCircleIcon,
  PlayIcon,
  SignalIcon,
  SignalSlashIcon,
  StopCircleIcon,
  TagIcon,
  TrashIcon,
  TvIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { FigureCard } from '@/components/dashboard/stat-card';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { RowActions } from '@/components/ui/row-actions';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { SegmentedTabs, tabId, tabPanelId, UnderlineTabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { canControlLive, useSession } from '@/lib/auth/session';
import { FLOOR_DB, meterFraction, meterZone, parseSourceKey, sameRoom, sourceKey } from '@/lib/captions/captions';
import { micLabelsOf, namedParagraphs, useSpeakerNames } from '@/lib/captions/speaker-names';
import { SOURCE_LABEL } from '@/lib/ingest/ingest';
import { useIngestRooms } from '@/lib/ingest/use-ingest';
import { useCaptionActions, useCaptionFeed, useLiveSessions, type ChannelLevel, type MicPermission } from '@/lib/captions/use-captions';
import { useDesk } from '@/components/captions/desk-provider';
import { ChannelNamesDialog, RoomBoard, RoomStatusTag } from '@/components/captions/room-board';
import { channelLabel, useChannelNames } from '@/lib/captions/channel-names';
import { RemoteDesks } from '@/components/captions/remote-desks';
import { useLiveOverview } from '@/lib/live/use-live';
import type { Session } from '@/lib/programme/programme';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';
import { BackupPanel } from '@/components/captions/backup-panel';
import { MicsPanel } from '@/components/captions/mics-panel';
import { HeardTag, RecheckNamesButton, SuggestionsStrip } from '@/components/captions/speaker-names';
import { VocabularyPanel } from '@/components/captions/vocabulary-panel';
import { ScrollHints } from '@/components/ui/scroll-hints';
import { tableScroll, tableScrollFocus } from '@/components/ui/table-scroll';

const TABS = [
  { key: 'monitor', label: 'Monitor', icon: TvIcon },
  { key: 'desk', label: 'Sound desk', icon: AdjustmentsVerticalIcon },
  { key: 'mics', label: 'Mics', icon: MicrophoneIcon },
  { key: 'vocabulary', label: 'Vocabulary', icon: BookOpenIcon },
] as const;

const hms = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

type Tab = (typeof TABS)[number]['key'];
const TAB_KEYS = TABS.map((t) => t.key);

function ConnectionDot() {
  const connection = useRealtimeStatus();
  const label = { live: 'Connected', connecting: 'Connecting…', offline: 'Not connected', demo: 'Demo data' }[connection];
  return (
    <p className="flex items-center gap-2 text-xs text-hint" aria-live="polite">
      <span
        className={cn('size-2 rounded-full', connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder')}
        aria-hidden
      />
      {label}
    </p>
  );
}

/* ----------------------------------------------------------------- monitor */

/** Caption text sizes for the monitor, remembered on this computer: it is watched for hours. */
const SIZE_KEY = 'pic.admin.caption-size';
const SIZES = [
  { value: 'normal', label: 'Normal text', className: 'text-lg leading-8' },
  { value: 'large', label: 'Large text', className: 'text-[1.3125rem] leading-9' },
  { value: 'xl', label: 'Extra large text', className: 'text-2xl leading-10' },
] as const;
type Size = (typeof SIZES)[number]['value'];
const isSize = (v: string | null): v is Size => SIZES.some((s) => s.value === v);
const sizeListeners = new Set<() => void>();
// used when storage is blocked: the size still changes for this visit
let sizeInMemory: Size = 'normal';

function readSize(): Size {
  try {
    const saved = localStorage.getItem(SIZE_KEY);
    return isSize(saved) ? saved : sizeInMemory;
  } catch {
    return sizeInMemory;
  }
}

function setCaptionSize(size: Size) {
  sizeInMemory = size;
  try {
    localStorage.setItem(SIZE_KEY, size);
  } catch {
    // not remembered, but used for this visit
  }
  sizeListeners.forEach((l) => l());
}

function subscribeSize(listener: () => void) {
  sizeListeners.add(listener);
  return () => void sizeListeners.delete(listener);
}

/** The running caption stream for one session, as paragraphs, following the newest line. */
/** One live session's captions: its room's state under the title, the room switcher (`toolbar`) above the stream. */
function CaptionStream({ session, toolbar }: { session: Session; toolbar?: ReactNode }) {
  const feed = useCaptionFeed(session.id);
  const names = useSpeakerNames(session.id);
  const { clear, exportTranscript } = useCaptionActions(session.id);
  const toast = useToast();
  const [confirmClear, setConfirmClear] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  // the operator can stop the stream moving while they read (WCAG 2.2.2), then go back to live
  const [paused, setPaused] = useState(false);
  const size = useSyncExternalStore(subscribeSize, readSize, () => 'normal' as Size);
  const sizeClass = SIZES.find((s) => s.value === size)!.className;
  // voices named as they are heard: a name arriving mid-session relabels every earlier line by that voice
  const micLabels = useMemo(() => micLabelsOf(session), [session]);
  const blocks = useMemo(() => namedParagraphs(feed.finals, names.bindings, micLabels), [feed.finals, names.bindings, micLabels]);

  // Stay pinned to the newest line unless the operator has scrolled up to read.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && following && !paused) el.scrollTop = el.scrollHeight;
  }, [feed, following, paused]);
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
    <Panel
      className="flex flex-col"
      title={<span className="truncate">{session.title}</span>}
      description={<RoomContext session={session} />}
      toolbar={toolbar}
      actions={
        <>
          <button type="button" onClick={() => download('csv')} disabled={exportTranscript.isPending} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" />
            CSV
          </button>
          <button type="button" onClick={() => download('txt')} disabled={exportTranscript.isPending} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <ArrowDownTrayIcon className="size-4" />
            TXT
          </button>
          {/* Clearing empties every delegate's screen: kept apart from the downloads, in the menu. */}
          <RowActions name={session.title} actions={[{ label: 'Clear captions…', icon: TrashIcon, onSelect: () => setConfirmClear(true) }]} />
        </>
      }
      footer={
        <>
          <Select label="Caption text size" value={size} options={SIZES.map((s) => ({ value: s.value, label: s.label }))} onChange={setCaptionSize} className="w-44" />
          <span className="hidden text-xs text-hint lg:inline">Watching here counts as one caption listener on Live ops.</span>
          {session.status === 'completed' && <RecheckNamesButton sessionId={session.id} className="h-8" />}
          {following && !paused ? (
            <button type="button" onClick={() => setPaused(true)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'ml-auto h-8' })}>
              <PauseIcon className="size-4" />
              Pause scrolling
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPaused(false);
                setFollowing(true);
              }}
              className={buttonClass({ style: 'borderless', className: 'ml-auto h-8' })}
            >
              <PlayIcon className="size-4" />
              Back to live
            </button>
          )}
        </>
      }
    >
      {/* someone introduced themselves and is not on the programme: name them, or not */}
      <SuggestionsStrip sessions={[session]} className="px-5 pt-4" />
      {/*
       * Sized to the window, less the navbar, tabs, panel header, room switcher, panel footer and the
       * page footer, so the text-size and pause controls stay in view and a big screen shows more.
       */}
      <div
        ref={scroller}
        onScroll={onScroll}
        role="log"
        aria-label={`Live captions: ${session.title}`}
        aria-live="off"
        className={cn('relative min-h-[16rem] overflow-y-auto px-5 py-4', toolbar ? 'h-[calc(100dvh-32rem)]' : 'h-[calc(100dvh-28rem)]')}
      >
        {blocks.length === 0 && !feed.interim ? (
          <EmptyState className="h-full justify-center" icon={MicrophoneIcon} title="Waiting for the first words" body="Captions appear here as soon as the capture desk sends audio." />
        ) : (
          <div className="flex flex-col gap-4">
            {blocks.map((p) => (
              <div key={p.lines[0]!.seq} className="flex gap-4">
                <p className="w-16 shrink-0 pt-1.5 text-xs tabular-nums text-hint">{hms(p.at)}</p>
                <div className="min-w-0">
                  {p.voice.label && (
                    <p className="mb-0.5 flex flex-wrap items-center gap-x-1.5 text-xs font-medium text-primary">
                      <span>
                        {p.voice.label}
                        {p.voice.named?.organisation && <span className="font-normal text-hint"> · {p.voice.named.organisation}</span>}
                      </span>
                      {p.voice.binding && <HeardTag binding={p.voice.binding} />}
                    </p>
                  )}
                  <p className={cn('max-w-[70ch] text-ink', sizeClass)}>{p.lines.map((l) => l.text).join(' ')}</p>
                </div>
              </div>
            ))}
            {feed.interim && (
              <div className="flex gap-4">
                <p className="w-16 shrink-0 pt-1.5 text-xs text-hint">now</p>
                <p className={cn('max-w-[70ch] text-ink-soft', sizeClass)}>{feed.interim.text}</p>
              </div>
            )}
          </div>
        )}
      </div>

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
    </Panel>
  );
}

/**
 * The room's state in one calm line: room, live or on break, and whether audio is reaching
 * captions, from the same figures Live ops shows (the live overview and the venue streams).
 */
function RoomContext({ session }: { session: Session }) {
  const auth = useSession();
  const overview = useLiveOverview(auth.status === 'signed-in' && canControlLive(auth.user.tier));
  const streams = useIngestRooms();
  // the live session by id, or by room when the two lists name it differently
  const metrics = overview.data?.find((m) => m.id === session.id) ?? overview.data?.find((m) => sameRoom(m.room, session.room));
  const room = streams.disabled ? undefined : streams.data?.find((r) => sameRoom(r.room, session.room));
  const source = room?.captioning ?? null;
  // as Live ops: no audio captured, or a venue stream that is not sending with nothing else captioning
  const streamDown = !!room?.stream && room.stream.state !== 'publishing' && !source;
  const noFeed = (!!metrics && !metrics.capturing) || streamDown;
  const audio = noFeed ? 'No audio feed' : source ? `Audio from the ${SOURCE_LABEL[source].toLowerCase()}` : metrics ? 'Receiving audio' : null;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-ink">{session.room}</span>
      <span aria-hidden>·</span>
      <span>{metrics?.flags.cutToBreak ? 'On break' : 'Live'}</span>
      {audio && (
        <>
          <span aria-hidden>·</span>
          <span className={cn('inline-flex items-center gap-1.5', noFeed && 'text-danger')}>
            {noFeed ? <SignalSlashIcon className="size-4" aria-hidden /> : <SignalIcon className="size-4 text-hint" aria-hidden />}
            {audio}
          </span>
        </>
      )}
    </span>
  );
}

/** Up to this many live rooms switch with tabs; more fall back to a list. */
const ROOM_TABS_MAX = 5;

function Monitor({ sessions }: { sessions: Session[] }) {
  const [picked, setPicked] = useState<string | null>(null);
  const session = sessions.find((s) => s.id === picked) ?? sessions[0];

  if (!session) {
    return (
      <EmptyState
        framed
        icon={SignalIcon}
        title="No session is live right now"
        body="Start one from Live ops and its captions appear here."
        action={
          <Link href="/live" className={buttonClass()}>
            Open Live ops
          </Link>
        }
      />
    );
  }
  // which live room to watch: tabs named by room while there are a few, a list beyond that
  const sameRoomTwice = new Set(sessions.map((s) => s.room)).size < sessions.length;
  const switcher =
    sessions.length < 2 ? undefined : sessions.length <= ROOM_TABS_MAX ? (
      <SegmentedTabs label="Live room" value={session.id} options={sessions.map((s) => ({ value: s.id, label: sameRoomTwice ? `${s.room} · ${s.title}` : s.room }))} onChange={setPicked} />
    ) : (
      <Select label="Live session" value={session.id} options={sessions.map((s) => ({ value: s.id, label: `${s.room} · ${s.title}` }))} onChange={setPicked} className="w-full sm:w-auto sm:max-w-md" />
    );
  // keyed so switching sessions starts a fresh feed
  return <CaptionStream key={session.id} session={session} toolbar={switcher} />;
}

/* -------------------------------------------------------------- sound desk */

const ZONE_BG = { ok: 'bg-success', hot: 'bg-gold', clip: 'bg-danger' } as const;

/** A vertical peak meter on the broadcast scale (-60 to 0 dBFS), with a peak-hold line. */
function ChannelMeter({ level, label }: { level: ChannelLevel | undefined; label: string }) {
  const db = level?.db ?? FLOOR_DB;
  const hold = level?.hold ?? FLOOR_DB;
  return (
    <div
      className="relative mx-auto h-16 w-2 overflow-hidden rounded-sm bg-surface-sunken"
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

const SETUP_STEPS = [
  { title: 'At the mixer', body: 'Send each room to its own output: an aux, matrix or direct out, speech only.' },
  { title: 'Into this computer', body: 'Cable those outputs into a USB audio interface, one input per room.' },
  { title: 'Here', body: 'Connect the interface, check each channel moves, and patch it to its room.' },
];

/** After a reload: the rooms that were on air, put back with one click. */
function ResumeBanner({ rooms, working, onResume, onDismiss }: { rooms: string[]; working: boolean; onResume: () => void; onDismiss: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-warning/50 bg-warning-soft px-5 py-4">
      <ExclamationTriangleIcon className="size-5 shrink-0 text-warning" />
      <p className="min-w-0 flex-1 text-sm text-ink">
        <strong>Captioning stopped when the page reloaded:</strong> {rooms.join(', ')}. Resume puts them back on air; for a room on a YouTube tab, pick the tab again when asked.
      </p>
      <button type="button" onClick={onResume} disabled={working} className={buttonClass()}>
        <ArrowPathIcon className="size-4" />
        {working ? 'Resuming…' : 'Resume'}
      </button>
      <button type="button" onClick={onDismiss} disabled={working} className={buttonClass({ style: 'borderless', color: 'gray' })}>
        Not now
      </button>
    </div>
  );
}

/** Before any audio: what the desk needs, and the browser permission, explained before it is asked. */
function DeskSetup({
  permission,
  connecting,
  error,
  streamed,
  onConnect,
  onShareTab,
}: {
  permission: MicPermission;
  connecting: boolean;
  error: string | null;
  /** Rooms captioned from venue streams right now; the desk is then their backup. */
  streamed: string[];
  onConnect: () => void;
  /** Caption from another tab's sound instead, such as the room's YouTube stream. */
  onShareTab: () => void;
}) {
  return (
    <section aria-labelledby="desk-setup" className="card-art rounded-xl border border-border bg-surface p-6 md:p-8">
      {streamed.length > 0 && (
        <p className="mb-6 flex items-start gap-2 rounded-lg bg-surface-soft px-4 py-3 text-sm text-ink">
          <SignalIcon className="mt-0.5 size-4 shrink-0 text-hint" />
          {streamed.length === 1 ? `${streamed[0]} is` : `${streamed.length} rooms are`} captioned from the venue stream. Set this desk up as a backup: a room on stand-by takes over if its stream
          stops.
        </p>
      )}
      <h2 id="desk-setup" className="text-lg font-medium text-ink">
        Caption every room from the sound desk
      </h2>
      <p className="mt-1 max-w-2xl text-sm text-hint">One computer beside the venue mixer takes each room&apos;s audio on its own channel.</p>

      <ol className="mt-6 grid gap-3 md:grid-cols-3">
        {SETUP_STEPS.map((step, i) => (
          <li key={step.title} className="rounded-xl border border-border p-4">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-xs font-medium text-primary">{i + 1}</span>
            <p className="mt-3 text-sm font-medium text-ink">{step.title}</p>
            <p className="mt-0.5 text-sm text-ink-soft">{step.body}</p>
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
          <button type="button" onClick={onShareTab} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <ComputerDesktopIcon className="size-4" />
            Use a browser tab’s sound (YouTube)
          </button>
          {permission !== 'granted' && <p className="max-w-md text-xs text-hint">Choose Allow when the browser asks for the microphone; audio goes only to the caption service.</p>}
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

type Confirm = { kind: 'room'; room: string } | { kind: 'all' } | { kind: 'disconnect' };

/**
 * The sound desk: one computer beside the venue mixer captions every room. Rooms (from Venue &
 * rooms and the programme) run down the side, the interface's channels across the top with their
 * meters, and a room is patched to a channel by clicking where they cross, as in a routing matrix.
 */
function SoundDesk() {
  const {
    desk,
    live,
    rooms,
    channels,
    patch,
    updatePatch,
    patchedSource,
    patchedMics,
    isMulti,
    ready,
    startable,
    running,
    captioning,
    captionedAnywhere,
    missing,
    streamed,
    elsewhere,
    onAir,
    liveRunning,
    startRoom,
    resumable,
    resumeState,
    resume,
    dismissResume,
    stopDesk,
  } = useDesk();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // the day's view (each room at a glance) or the morning's patching
  const [view, setView] = useUrlParam<'rooms' | 'patch'>('view', 'rooms', ['rooms', 'patch']);
  const [naming, setNaming] = useState(false);
  const names = useChannelNames();

  const confirmNow = () => {
    if (!confirm) return;
    if (confirm.kind === 'room') void desk.stop(confirm.room);
    else if (confirm.kind === 'all') running.forEach((room) => void desk.stop(room));
    else stopDesk();
    setConfirm(null);
  };

  if (!desk.inputs) {
    return (
      <div className="flex flex-col gap-5">
        <SuggestionsStrip sessions={live} />
        {resumeState !== 'done' && resumable.length > 0 && <ResumeBanner rooms={resumable.map((r) => r.room)} working={resumeState === 'working'} onResume={resume} onDismiss={dismissResume} />}
        <RemoteDesks />
        <DeskSetup permission={desk.permission} connecting={desk.connecting} error={desk.error} streamed={streamed} onConnect={() => void desk.connect()} onShareTab={() => void desk.shareTab()} />
        {/* recordings kept from earlier, still uploading or to download */}
        <BackupPanel hideWhenEmpty />
      </div>
    );
  }
  const inputs = desk.inputs;
  const channelCount = channels.length;

  return (
    <div className="flex flex-col gap-5">
      {resumeState !== 'done' && resumable.length > 0 && <ResumeBanner rooms={resumable.map((r) => r.room)} working={resumeState === 'working'} onResume={resume} onDismiss={dismissResume} />}
      <RemoteDesks />
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <FigureCard
          label="Live without captions"
          icon={SignalSlashIcon}
          value={String(missing.length)}
          note={missing.length ? missing.map((s) => s.room).join(', ') : live.length ? 'Every live room is captioned' : 'Nothing live right now'}
          tone={missing.length ? 'danger' : live.length ? 'success' : undefined}
        />
        <FigureCard
          label="Rooms captioned"
          icon={BuildingOffice2Icon}
          value={`${captionedAnywhere.length} of ${rooms.length}`}
          note={
            [
              captioning.length ? `${captioning.length} from this desk` : '',
              streamed.length ? `${streamed.length} from venue streams` : '',
              running.length > captioning.length ? `${running.length - captioning.length} standing by or reconnecting` : '',
            ]
              .filter(Boolean)
              .join(' · ') || undefined
          }
        />
        <FigureCard label="Channels" icon={AdjustmentsVerticalIcon} value={String(channelCount)} note={inputs.map((i) => i.label).join(', ')} />
        <FigureCard label="Caption service" icon={CloudIcon} hint="The link from this desk to the caption service">
          <div className="flex flex-col gap-2">
            <ConnectionDot />
            <button
              type="button"
              onClick={() => (running.length ? setConfirm({ kind: 'disconnect' }) : void desk.disconnect())}
              className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9 self-start' })}
            >
              Disconnect interface
            </button>
            <button
              type="button"
              onClick={() => void desk.shareTab()}
              title="Caption a room from another tab's sound, such as its YouTube stream. Choose the tab and turn on “Also share tab audio”."
              className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9 self-start' })}
            >
              <ComputerDesktopIcon className="size-4" />
              Add a browser tab
            </button>
            {desk.error && <p className="max-w-56 text-xs text-danger">{desk.error}</p>}
          </div>
        </FigureCard>
      </div>

      {/* voices heard introducing themselves in a live room, for the desk to name or not */}
      <SuggestionsStrip sessions={live} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedTabs
          label="Sound desk view"
          value={view}
          onChange={setView}
          options={[
            { value: 'rooms', label: 'Rooms' },
            { value: 'patch', label: 'Patch' },
          ]}
        />
        <button type="button" onClick={() => setNaming(true)} className={buttonClass({ style: 'outline', color: 'gray' })}>
          <TagIcon className="size-4" />
          Name channels
        </button>
      </div>
      {naming && <ChannelNamesDialog open onClose={() => setNaming(false)} />}

      {view === 'rooms' ? (
        <RoomBoard onPatch={() => setView('patch')} />
      ) : (
      <Panel
        title="Patch"
        description="Click where a room meets its channel; captions go to the session live in that room."
        actions={
          (running.length > 0 || startable.length > 0) && (
            <>
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
            </>
          )
        }
        footer={
          <>
            <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-success" /> below −12 dBFS
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-gold" /> −12 to −3, good for speech
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-danger" /> above −3, turn the send down
              </span>
            </p>
            <Link href="/venue" className="text-xs text-primary hover:underline">
              Room missing? Add it in Venue &amp; rooms
            </Link>
          </>
        }
      >
        {rooms.length === 0 ? (
          <EmptyState
            icon={BuildingOffice2Icon}
            title="No rooms yet"
            body="Add the venue's rooms and they appear here."
            action={
              <Link href="/venue" className={buttonClass()}>
                Add rooms
              </Link>
            }
          />
        ) : (
          <div {...tableScroll} className={`relative overflow-x-auto ${tableScrollFocus}`}>
            <ScrollHints />
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    rowSpan={2}
                    scope="col"
                    className="sticky left-0 z-10 min-w-36 border-b border-border bg-surface px-3 md:min-w-56 md:px-5 py-2 text-left align-bottom text-xs font-normal text-hint"
                  >
                    Room
                  </th>
                  {inputs.map((input) => (
                    <th key={input.deviceId} colSpan={input.channels} scope="colgroup" className="border-b border-l border-border px-2 pt-2 pb-1 text-left text-xs font-normal text-ink-soft">
                      <span className="block max-w-[14rem] truncate" title={input.label}>
                        {input.label}
                      </span>
                    </th>
                  ))}
                  <th
                    rowSpan={2}
                    scope="col"
                    className="min-w-64 md:sticky md:right-0 md:z-10 border-b border-l border-border bg-surface px-4 py-2 text-left align-bottom text-xs font-normal text-hint"
                  >
                    Captions
                  </th>
                </tr>
                <tr>
                  {inputs.flatMap((input) =>
                    Array.from({ length: input.channels }, (_, channel) => {
                      const key = sourceKey(input.deviceId, channel);
                      return (
                        <th key={key} scope="col" title={names[key] ?? undefined} className={cn('w-11 border-b border-border px-1 pt-1 pb-2 text-center font-normal', channel === 0 && 'border-l')}>
                          <ChannelMeter level={desk.levels[key]} label={`${input.label} channel ${channel + 1}`} />
                          <span className="mt-1 block text-[0.6875rem] tabular-nums text-hint">{channel + 1}</span>
                          {names[key] && <span className="mx-auto block max-w-11 truncate text-[0.625rem] leading-tight text-ink-soft">{names[key]}</span>}
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
                      <th
                        scope="row"
                        className={cn(
                          'sticky left-0 z-10 max-w-36 border-b border-border bg-surface px-3 py-2.5 md:max-w-none md:px-5 text-left font-normal group-hover:bg-surface-soft',
                          alarm && 'shadow-[inset_3px_0_0_var(--color-danger)]',
                        )}
                      >
                        <p className="truncate text-sm font-medium text-ink">{room}</p>
                        <p className={cn('max-w-56 truncate text-xs', session ? 'text-success' : 'text-hint')} title={session?.title}>
                          {session ? `Live · ${session.title}` : 'Nothing on air'}
                        </p>
                      </th>
                      {channels.map((c, i) => {
                        const micNo = isMulti(room) ? patchedMics(room).indexOf(c.value) + 1 : 0;
                        const patched = isMulti(room) ? micNo > 0 : source === c.value;
                        const firstOfInput = parseSourceKey(c.value)?.channel === 0;
                        return (
                          <td
                            key={c.value}
                            className={cn('border-b border-border p-0 text-center group-hover:bg-surface-soft', firstOfInput && i > 0 && 'border-l', firstOfInput && i === 0 && 'border-l')}
                          >
                            <button
                              type="button"
                              aria-pressed={patched}
                              aria-label={`${patched ? 'Unpatch' : 'Patch'} ${room} ${patched ? 'from' : 'to'} ${channelLabel(c.value, c.label, names)}`}
                              title={busy ? 'Stop this room to change its channel' : channelLabel(c.value, c.label, names)}
                              disabled={busy}
                              onClick={() =>
                                isMulti(room)
                                  ? updatePatch(room, {
                                      mics: patched ? (patch[room]?.mics ?? []).filter((m) => m !== c.value) : [...(patch[room]?.mics ?? []), c.value],
                                    })
                                  : updatePatch(room, { source: patched ? '' : c.value })
                              }
                              className="flex h-12 w-full items-center justify-center disabled:cursor-not-allowed"
                            >
                              <span
                                className={cn(
                                  'flex items-center justify-center rounded-full border text-[0.625rem] font-medium text-on-primary transition-colors',
                                  micNo ? 'size-5' : 'size-3.5',
                                  patched ? (busy ? 'border-danger bg-danger' : 'border-primary bg-primary') : 'border-border group-hover:border-border-strong',
                                  !busy && !patched && 'hover:!border-primary hover:bg-primary-soft',
                                )}
                              >
                                {micNo || null}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                      <td className="border-b md:sticky md:right-0 md:z-10 border-l border-border bg-surface px-4 py-2 group-hover:bg-surface-soft">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <RoomStatusTag state={state} patched={ready(room)} elsewhere={elsewhere(room)} />
                            {state?.message && (
                              <p className={cn('mt-0.5 max-w-44 truncate text-xs', state.status === 'error' ? 'text-danger' : 'text-warning')} title={state.message}>
                                {state.message}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-hint" aria-hidden title="One mic per channel: each mic captioned on its own, named in Captions › Mics.">
                              Mics
                            </span>
                            <Switch
                              checked={isMulti(room)}
                              onChange={(multi) => updatePatch(room, { multi, mics: multi ? (patch[room]?.mics?.length ? patch[room]?.mics : source ? [source] : []) : [] })}
                              disabled={busy}
                              label={`One mic per channel in ${room}`}
                            />
                            {!isMulti(room) && (
                              <>
                                <span className="text-xs text-hint" aria-hidden title="Label who is speaking, for panels. Adds a little delay.">
                                  Speakers
                                </span>
                                <Switch
                                  checked={!!patch[room]?.diarise}
                                  onChange={(diarise) => updatePatch(room, { diarise })}
                                  disabled={busy}
                                  label={`Label speakers in ${room} (for panels; adds a little delay)`}
                                />
                              </>
                            )}
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
                                disabled={!ready(room)}
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
      </Panel>
      )}

      <BackupPanel />

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
  const [tab, setTab] = useUrlParam<Tab>('tab', 'monitor', TAB_KEYS);
  const sessions = useMemo(() => [...(live.data ?? [])].sort((a, b) => a.room.localeCompare(b.room)), [live.data]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Captions</h1>
      <UnderlineTabs label="Captions sections" idBase="captions" options={TABS.map((t) => ({ value: t.key, label: t.label, icon: t.icon }))} value={tab} onChange={setTab} />

      {live.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : live.isError && !live.data ? (
        <ErrorState framed title="Live sessions could not load" error={live.error} onRetry={() => void live.refetch()} />
      ) : (
        <>
          {/* Both stay mounted so a running desk keeps capturing while the operator checks the monitor. */}
          <div id={tabPanelId('captions', 'monitor')} role="tabpanel" aria-labelledby={tabId('captions', 'monitor')} hidden={tab !== 'monitor'}>
            <Monitor sessions={sessions} />
          </div>
          <div id={tabPanelId('captions', 'desk')} role="tabpanel" aria-labelledby={tabId('captions', 'desk')} hidden={tab !== 'desk'}>
            <SoundDesk />
          </div>
        </>
      )}
      <div id={tabPanelId('captions', 'mics')} role="tabpanel" aria-labelledby={tabId('captions', 'mics')} hidden={tab !== 'mics'}>
        {tab === 'mics' && <MicsPanel />}
      </div>
      <div id={tabPanelId('captions', 'vocabulary')} role="tabpanel" aria-labelledby={tabId('captions', 'vocabulary')} hidden={tab !== 'vocabulary'}>
        {tab === 'vocabulary' && <VocabularyPanel />}
      </div>
    </div>
  );
}
