'use client';

import {
  ArrowPathIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  MicrophoneIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  SignalIcon,
  SignalSlashIcon,
  StopCircleIcon,
} from '@heroicons/react/24/outline';
import { useId, useMemo, useState, type ReactNode } from 'react';

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

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const slot = (s: Pick<BoardSession, 'startsAt' | 'endsAt'>) => `${hm(s.startsAt)} – ${hm(s.endsAt)}`;

type Pending = { kind: 'start'; room: string; start: BoardSession; end: BoardSession | null } | { kind: 'end'; room: string; end: BoardSession };

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-sm text-[#525252]">{label}</p>
      <p className={cn('mt-1 text-2xl font-medium tabular-nums', tone === 'danger' ? 'text-danger' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[#7c7c7c]">{hint}</p>}
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

  return (
    <section
      aria-label={state.room}
      className={cn(
        'flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-lg',
        live ? (onBreak ? 'border-gold/60' : 'border-success/50') : 'border-border',
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
        <h2 className="truncate text-base font-medium text-ink">{state.room}</h2>
        {live ? (
          onBreak ? (
            <Tag tone="gold" dot>
              On break
            </Tag>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 text-xs leading-5 text-on-primary">
              <span className="size-1.5 animate-pulse rounded-full bg-on-primary" aria-hidden />
              Live
            </span>
          )
        ) : (
          <Tag>Idle</Tag>
        )}
      </header>

      <div className="flex flex-1 flex-col gap-4 p-5">
        {state.conflict && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <ExclamationTriangleIcon className="size-4 shrink-0" />
            Two sessions are live in this room; captions go to only one. End the one that is over.
          </p>
        )}

        {late > 0 && state.next && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-[#fdf6e0] px-3 py-2 text-xs text-[#7a5d00]">
            <ClockIcon className="size-4 shrink-0" />
            “{state.next.title}” was due at {hm(state.next.startsAt)} and is not live. Captions start once it is.
          </p>
        )}

        {overrun > 0 && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-[#fdf6e0] px-3 py-2 text-xs text-[#7a5d00]">
            <ClockIcon className="size-4 shrink-0" />
            Still live {overrun} min past its {hm(live!.endsAt)} end. End it if it is over: captions keep running until it is.
          </p>
        )}

        {streamProblem && (
          <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
            <SignalSlashIcon className="size-4 shrink-0" />
            {streamProblem}
          </p>
        )}

        {live ? (
          <div>
            <p className="text-xs text-[#7c7c7c]">On air · {slot(live)}</p>
            <p className="mt-0.5 line-clamp-2 text-sm font-medium text-ink">{live.title}</p>
            {m && (
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-[#f6f6f6] px-2 py-2">
                  <dt className="flex items-center justify-center gap-1 text-[11px] text-[#7c7c7c]">
                    <EyeIcon className="size-3.5" /> Watching
                  </dt>
                  <dd className="text-base font-medium tabular-nums text-ink">{count(m.viewers)}</dd>
                </div>
                <div className="rounded-lg bg-[#f6f6f6] px-2 py-2">
                  <dt className="flex items-center justify-center gap-1 text-[11px] text-[#7c7c7c]">
                    <MicrophoneIcon className="size-3.5" /> Captions
                  </dt>
                  <dd className="text-base font-medium tabular-nums text-ink">{count(m.captionListeners)}</dd>
                </div>
                <div className={cn('rounded-lg px-2 py-2', feedDown ? 'bg-danger-soft' : 'bg-success-soft')}>
                  <dt className="flex items-center justify-center gap-1 text-[11px] text-[#7c7c7c]">
                    {feedDown ? <SignalSlashIcon className="size-3.5 text-danger" /> : <SignalIcon className="size-3.5 text-success" />} Audio
                  </dt>
                  <dd className={cn('text-sm font-medium', feedDown ? 'text-danger' : 'text-success')}>{feedDown ? 'No feed' : source ? SOURCE_LABEL[source] : 'Receiving'}</dd>
                </div>
              </dl>
            )}
            {feedDown && !streamProblem && <p className="mt-2 text-xs text-danger">No audio has reached captions from this room in the last 30 seconds. Check the capture desk.</p>}
          </div>
        ) : (
          <p className="text-sm text-[#7c7c7c]">Nothing on air.</p>
        )}

        {live && m && canControl && (
          <div className="divide-y divide-border border-y border-border">
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

        <div className="mt-auto">
          {state.next ? (
            <div className="rounded-lg border border-dashed border-border px-3 py-2.5">
              <p className="text-xs text-[#7c7c7c]">Next · {slot(state.next)}</p>
              <p className="truncate text-sm text-[#525252]" title={state.next.title}>
                {state.next.title}
              </p>
            </div>
          ) : (
            !live && <p className="text-xs text-[#7c7c7c]">No more sessions here today.</p>
          )}
        </div>
      </div>

      {canControl && (live || state.next) && (
        <footer className="flex flex-wrap justify-end gap-2 border-t border-border bg-[#f6f6f6] px-5 py-3">
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
        </footer>
      )}
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
        className={cn(
          'size-2 rounded-full',
          connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder',
        )}
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
            ? { title: 'Now live', leading: { kind: 'icon', icon: PlayCircleIcon, tone: 'success' }, body: `${pending.start.title} is live in ${pending.room}. Delegates were notified.` }
            : { title: 'Session ended', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: `${pending.end.title} has ended. Delegates get the feedback prompt.` },
        );
        setPending(null);
      },
    });
  };

  if (board.isPending) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-80 rounded-2xl" />
        ))}
      </div>
    );
  }
  if (board.isError && !board.data) {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-surface p-10 text-center">
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Live rooms" value={`${sum.liveRooms} of ${sum.rooms}`} hint={sum.onBreak ? `${sum.onBreak} on break` : undefined} />
          <Stat label="Watching now" value={count(sum.viewers)} hint="Open in the app, across live rooms" />
          <Stat label="Caption listeners" value={count(sum.listeners)} />
          <Stat
            label="Audio feeds"
            value={`${sum.capturing} of ${sum.liveRooms}`}
            hint={sum.capturing < sum.liveRooms ? 'A live room has no audio' : 'All live rooms receiving'}
            tone={sum.capturing < sum.liveRooms ? 'danger' : undefined}
          />
        </div>
      )}

      {rooms.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-10 text-center text-sm text-muted">
          <PauseCircleIcon className="mx-auto mb-2 size-8 text-[#7c7c7c]" />
          No sessions on Day {day}. Add them on the Programme page.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
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
