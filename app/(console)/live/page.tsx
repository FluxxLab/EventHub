'use client';

import {
  ArrowPathIcon,
  BuildingOffice2Icon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LanguageIcon,
  MicrophoneIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SignalIcon,
  SignalSlashIcon,
  StopCircleIcon,
} from '@heroicons/react/24/outline';
import { useId, useMemo, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';

import { FigureCard } from '@/components/dashboard/stat-card';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { runsEvents, useSession } from '@/lib/auth/session';
import { count } from '@/lib/format';
import { currentDay, roomStates, totals, type BoardSession, type RoomState } from '@/lib/live/live';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { useBoard, useLiveActions, useLiveOverview, useLiveRealtime } from '@/lib/live/use-live';
import { SOURCE_LABEL, type IngestRoom } from '@/lib/ingest/ingest';
import { useIngestRooms } from '@/lib/ingest/use-ingest';
import { lateMinutes, overrunMinutes } from '@/lib/live/ops-alerts';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const hm = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
const slot = (s: Pick<BoardSession, 'startsAt' | 'endsAt'>) => `${hm(s.startsAt)} – ${hm(s.endsAt)}`;

/** How long a session has overrun, in units that read well: "25 min", "3 h 10 min", "36 days". */
const overrunLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${minutes % 60} min` : ''}`;
  const days = Math.floor(minutes / (24 * 60));
  return `${days} ${days === 1 ? 'day' : 'days'}`;
};

type Pending =
  | {
      kind: 'start';
      room: string;
      start: BoardSession;
      end: BoardSession | null;
    }
  | { kind: 'end'; room: string; end: BoardSession };

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

/** A room's warning: red when captions or the stream are at risk, gold when it is about timing. */
function Notice({ tone, icon: Icon, children }: { tone: 'danger' | 'gold'; icon: Icon; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        tone === 'danger' ? 'border-danger/30 bg-danger-soft text-danger' : 'border-gold/40 bg-secondary-soft text-[#7a5d00]',
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/** One of the live session's figures, inline: icon, figure, what it counts. */
function RoomFigure({ icon: Icon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="sr-only">{label}</dt>
      <Icon className="size-4 text-[#7c7c7c]" aria-hidden />
      <dd className="flex items-center gap-1.5 text-sm text-[#525252]">{children}</dd>
    </div>
  );
}

function ToggleRow({ label, hint, children }: { label: string; hint: string; children: (labelId: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div id={id} className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        <p className="text-xs text-[#7c7c7c]">{hint}</p>
      </div>
      {children(id)}
    </div>
  );
}

/** One room: what is on air, its audience and feed, the broadcast switches, and what is next. */
function RoomCard({
  state,
  canControl,
  stream,
  onStart,
  onEnd,
}: {
  state: RoomState;
  canControl: boolean;
  /** The room's venue stream and who is captioning it, when venue streams are enabled. */
  stream: IngestRoom | null;
  onStart: (s: BoardSession) => void;
  onEnd: (s: BoardSession) => void;
}) {
  const { setBreak, setOverlays } = useLiveActions();
  const toast = useToast();
  const live = state.live;
  const m = live?.metrics;
  const onBreak = !!m?.flags.cutToBreak;
  const feedDown = !!live && !!m && !m.capturing;
  const source = stream?.captioning ?? null;
  const now = useNow(30_000);
  const overrun = live ? overrunMinutes(live, now) : 0;
  const late = !live && state.next ? lateMinutes(state.next, now) : 0;
  const streamProblem =
    stream?.stream?.state === 'error'
      ? 'The venue stream reports an encoder error. Ask the AV team to restart it, or caption this room from the Sound desk.'
      : live && stream?.stream && stream.stream.state !== 'publishing' && !source
        ? 'The venue stream is not sending. Check the encoder, or start this room on the Sound desk.'
        : null;

  const status = live ? (
    onBreak ? (
      <Tag tone="gold" dot>
        On break
      </Tag>
    ) : (
      <Tag tone="danger" dot>
        Live
      </Tag>
    )
  ) : (
    <Tag>Idle</Tag>
  );

  const actions = canControl && (live || state.next) && (
    <div className="flex flex-wrap items-center gap-2">
      {live && (
        <button type="button" onClick={() => onEnd(live)} className={buttonClass({ style: 'outline', color: 'danger' })}>
          <StopCircleIcon className="size-4" />
          End
        </button>
      )}
      {state.next && (
        <button type="button" onClick={() => onStart(state.next!)} className={buttonClass()}>
          <PlayCircleIcon className="size-4" />
          {live ? 'Start next' : 'Go live'}
        </button>
      )}
    </div>
  );

  const next = state.next ? (
    <p className="truncate text-sm text-[#525252]" title={state.next.title}>
      <span className="text-[#7c7c7c]">Next · {slot(state.next)} · </span>
      {state.next.title}
    </p>
  ) : (
    <p className="text-sm text-[#7c7c7c]">No more sessions here today.</p>
  );

  return (
    <section aria-label={state.room} className={cn('rounded-lg border bg-surface', live ? (onBreak ? 'border-gold/60' : 'border-success/60') : 'border-border')}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <h2 className="truncate text-xl font-medium text-ink">{state.room}</h2>
          {status}
        </div>
        {actions}
      </header>

      <div className="flex flex-col gap-4 px-5 py-4">
        {(state.conflict || late > 0 || overrun > 0 || streamProblem) && (
          <div className="flex flex-col gap-2">
            {state.conflict && (
              <Notice tone="danger" icon={ExclamationTriangleIcon}>
                Two sessions are live in this room; captions go to only one. End the one that is over.
              </Notice>
            )}
            {late > 0 && state.next && (
              <Notice tone="gold" icon={ClockIcon}>
                “{state.next.title}” was due at {hm(state.next.startsAt)} and is not live. Captions start once it is.
              </Notice>
            )}
            {overrun > 0 && (
              <Notice tone="gold" icon={ClockIcon}>
                Still live {overrunLabel(overrun)} past its {hm(live!.endsAt)} end. End it if it is over: captions keep running until it is.
              </Notice>
            )}
            {streamProblem && (
              <Notice tone="danger" icon={SignalSlashIcon}>
                {streamProblem}
              </Notice>
            )}
          </div>
        )}

        {live ? (
          <div className={cn('grid gap-x-10 gap-y-4', m && canControl && 'lg:grid-cols-[minmax(0,1fr)_22rem]')}>
            <div className="flex min-w-0 flex-col gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-[#7c7c7c]">On air · {slot(live)}</p>
                <p className="mt-1 line-clamp-2 text-lg font-medium text-ink">{live.title}</p>
              </div>
              {m && (
                <dl className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <RoomFigure icon={EyeIcon} label="Watching in the app">
                    <span className="font-medium tabular-nums text-ink">{count(m.viewers)}</span> watching
                  </RoomFigure>
                  <RoomFigure icon={MicrophoneIcon} label="Following captions">
                    <span className="font-medium tabular-nums text-ink">{count(m.captionListeners)}</span> following captions
                  </RoomFigure>
                  <RoomFigure icon={feedDown ? SignalSlashIcon : SignalIcon} label="Audio">
                    Audio
                    <Tag tone={feedDown ? 'danger' : 'green'} dot>
                      {feedDown ? 'No feed' : source ? SOURCE_LABEL[source] : 'Receiving'}
                    </Tag>
                  </RoomFigure>
                </dl>
              )}
              {feedDown && !streamProblem && <p className="text-sm text-danger">No audio has reached captions from this room in the last 30 seconds. Check the Sound desk.</p>}
              <div className="mt-auto border-t border-border pt-3">{next}</div>
            </div>

            {m && canControl && (
              <div className="divide-y divide-border lg:border-l lg:border-border lg:pl-6">
                <ToggleRow label="Cut to break" hint={onBreak ? 'Delegates see the break screen.' : 'Show the break screen in the app.'}>
                  {(labelId) => (
                    <Switch
                      checked={onBreak}
                      tone="gold"
                      labelledBy={labelId}
                      disabled={setBreak.isPending}
                      onChange={(active) =>
                        setBreak.mutate(
                          { sessionId: live.id, active },
                          { onError: (e) => toast.push({ title: 'Break not changed', leading: { kind: 'icon', icon: ExclamationTriangleIcon, tone: 'danger' }, body: e.message }) },
                        )
                      }
                    />
                  )}
                </ToggleRow>
                <ToggleRow label="Captions overlay" hint="Captions over the stream.">
                  {(labelId) => (
                    <Switch checked={m.flags.captionsOverlay} labelledBy={labelId} disabled={setOverlays.isPending} onChange={(captions) => setOverlays.mutate({ sessionId: live.id, captions })} />
                  )}
                </ToggleRow>
                <ToggleRow label="Sign language" hint="The interpreter window.">
                  {(labelId) => (
                    <Switch
                      checked={m.flags.signLanguageOverlay}
                      labelledBy={labelId}
                      disabled={setOverlays.isPending}
                      onChange={(signLanguage) => setOverlays.mutate({ sessionId: live.id, signLanguage })}
                    />
                  )}
                </ToggleRow>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="flex items-center gap-2 text-sm text-ink">
              <PauseCircleIcon className="size-5 text-[#7c7c7c]" /> Nothing on air
            </p>
            <span className="text-[#bdbdbd]" aria-hidden>
              ·
            </span>
            {next}
          </div>
        )}
      </div>
    </section>
  );
}

/** Whether session changes are arriving instantly, and a spinner while counts refresh. */
function ConnectionIndicator({ refreshing }: { refreshing: boolean }) {
  const connection = useRealtimeStatus();
  const label = {
    live: 'Live: session changes appear instantly',
    connecting: 'Connecting…',
    offline: 'Offline: checking every 15 seconds',
    demo: 'Demo data',
  }[connection];
  return (
    <p className="flex items-center gap-2 text-xs text-[#7c7c7c]" aria-live="polite">
      <span
        className={cn('size-2 rounded-full', connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder')}
        aria-hidden
      />
      {label}
      <ArrowPathIcon className={cn('size-3.5', refreshing ? 'animate-spin' : 'opacity-0')} aria-hidden />
    </p>
  );
}

export default function LiveOpsPage() {
  useLiveRealtime();
  const state = useSession();
  const isAdmin = state.status === 'signed-in' && runsEvents(state.user.tier);
  const board = useBoard();
  const overview = useLiveOverview(isAdmin);
  const { switchSession } = useLiveActions();
  const streams = useIngestRooms();
  const streamOf = (room: string) => (streams.disabled ? null : (streams.data?.find((r) => r.room.trim().toLowerCase() === room.trim().toLowerCase()) ?? null));
  const toast = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [pickedDay, setPickedDay] = useState<number | null>(null);

  const sessions = useMemo(() => board.data ?? [], [board.data]);
  const auto = useMemo(() => currentDay(sessions), [sessions]);
  const day = pickedDay ?? auto.day;
  const days = useMemo(() => [...new Set(sessions.map((s) => s.day))].sort((a, b) => a - b), [sessions]);
  const rooms = useMemo(() => roomStates(sessions, overview.data ?? [], day), [sessions, overview.data, day]);
  const sum = totals(rooms);

  const confirm = () => {
    if (!pending) return;
    const body = pending.kind === 'start' ? { endId: pending.end?.id, startId: pending.start.id } : { endId: pending.end.id };
    switchSession.mutate(body, {
      onSuccess: () => {
        toast.push(
          pending.kind === 'start'
            ? {
                title: 'Now live',
                leading: {
                  kind: 'icon',
                  icon: PlayCircleIcon,
                  tone: 'success',
                },
                body: `${pending.start.title} is live in ${pending.room}. Delegates were notified.`,
              }
            : {
                title: 'Session ended',
                leading: {
                  kind: 'icon',
                  icon: CheckCircleIcon,
                  tone: 'success',
                },
                body: `${pending.end.title} has ended. Delegates get the feedback prompt.`,
              },
        );
        setPending(null);
      },
    });
  };

  if (board.isPending) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-56" />
        ))}
      </div>
    );
  }
  if (board.isError && !board.data) {
    return (
      <div role="alert" className="rounded-lg border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">The live board could not load.</p>
        <p className="mt-1 text-sm text-muted">{board.error.message}</p>
        <button type="button" onClick={() => void board.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="sr-only">Live operations</h1>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {days.length > 1 && (
            <div role="tablist" aria-label="Day" className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
              {days.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  aria-selected={day === d}
                  onClick={() => setPickedDay(d)}
                  className={cn('rounded-md px-3 py-1.5 text-sm', day === d ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink')}
                >
                  Day {d}
                  {auto.isToday && d === auto.day && <span className="ml-1.5 text-xs text-success">today</span>}
                </button>
              ))}
            </div>
          )}
          {!auto.isToday && <p className="text-xs text-[#7c7c7c]">No sessions are scheduled for today; showing Day {day} to rehearse.</p>}
        </div>
        <ConnectionIndicator refreshing={overview.isFetching || board.isFetching} />
      </div>

      {!isAdmin && (
        <p className="rounded-lg bg-primary-soft px-4 py-3 text-sm text-primary">
          You can follow the rooms here. Starting sessions and the broadcast switches are for organisers; run captions from the Captions page.
        </p>
      )}

      {isAdmin && (
        <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
          <FigureCard label="Live rooms" icon={BuildingOffice2Icon} value={`${sum.liveRooms} of ${sum.rooms}`} note={sum.onBreak ? `${sum.onBreak} on break` : undefined} />
          <FigureCard label="Watching now" icon={EyeIcon} value={count(sum.viewers)} hint="Delegates with a live session open in the app, across all rooms" />
          <FigureCard label="Caption listeners" icon={LanguageIcon} value={count(sum.listeners)} hint="Delegates following live captions in the app" />
          <FigureCard
            label="Audio feeds"
            icon={SignalIcon}
            value={`${sum.capturing} of ${sum.liveRooms}`}
            hint="Live rooms whose sound is reaching captions"
            note={sum.liveRooms === 0 ? 'No room is live' : sum.capturing < sum.liveRooms ? 'A live room has no audio' : 'All live rooms receiving'}
            tone={sum.capturing < sum.liveRooms ? 'danger' : undefined}
          />
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-10 text-center text-sm text-muted">
          <PauseCircleIcon className="mx-auto mb-2 size-8 text-[#7c7c7c]" />
          No sessions on Day {day}. Add them on the Programme page.
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {rooms.map((r) => (
            <RoomCard
              key={r.room}
              state={r}
              canControl={isAdmin}
              stream={streamOf(r.room)}
              onStart={(start) => setPending({ kind: 'start', room: r.room, start, end: r.live })}
              onEnd={(end) => setPending({ kind: 'end', room: r.room, end })}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!pending}
        title={pending?.kind === 'start' ? `Start “${pending.start.title}”?` : pending ? `End “${pending.end.title}”?` : ''}
        confirmLabel={pending?.kind === 'start' ? 'Go live' : 'End session'}
        pendingLabel={pending?.kind === 'start' ? 'Starting…' : 'Ending…'}
        pending={switchSession.isPending}
        tone={pending?.kind === 'end' ? 'danger' : 'default'}
        onConfirm={confirm}
        onCancel={() => setPending(null)}
      >
        {pending?.kind === 'start' ? (
          <>
            {pending.end && <>This first ends “{pending.end.title}”. </>}
            Every delegate gets a push notification that it is live in {pending.room}, and captions switch to it.
          </>
        ) : (
          'It leaves the live board, and delegates who attended get the feedback prompt.'
        )}
        {switchSession.error && <span className="mt-2 block text-xs text-danger">{switchSession.error.message}</span>}
      </ConfirmDialog>
    </div>
  );
}
