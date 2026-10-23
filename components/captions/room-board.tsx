'use client';

import { ArrowPathIcon, ArrowRightCircleIcon, CheckCircleIcon, ExclamationTriangleIcon, PlayCircleIcon, StopCircleIcon, TagIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';

import { useDesk } from '@/components/captions/desk-provider';
import { chime } from '@/components/live/switch-alerts';
import { buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { FLOOR_DB, meterFraction, meterZone, sameRoom } from '@/lib/captions/captions';
import { channelLabel, saveChannelNames, useChannelNames } from '@/lib/captions/channel-names';
import { ago, deskAlerts, silenceOf, type DeskAlert, type DeskRoom, type Silence } from '@/lib/captions/desk-alerts';
import type { RoomState } from '@/lib/captions/room-capture';
import { useCaptionFeed, type ChannelLevel } from '@/lib/captions/use-captions';
import type { CaptureSource } from '@/lib/ingest/ingest';
import { currentDay, roomStates } from '@/lib/live/live';
import { useBoard, useLiveActions } from '@/lib/live/use-live';
import { cn } from '@/lib/utils';

const ZONE_BG = { ok: 'bg-success', hot: 'bg-gold', clip: 'bg-danger' } as const;
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** A room's state on the desk, as a pill: on air, standing by, reconnecting, stopped, ready. */
export function RoomStatusTag({ state, patched, elsewhere }: { state: RoomState | undefined; patched: boolean; elsewhere: CaptureSource | null }) {
  if (!state && elsewhere) {
    return (
      <Tag tone="green" dot>
        {elsewhere === 'ingest' ? 'Venue stream' : 'Other desk'}
      </Tag>
    );
  }
  if (!state) return patched ? <Tag>Ready</Tag> : <span className="text-xs text-hint">Not patched</span>;
  if (state.status === 'capturing') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 text-xs leading-5 text-on-primary">
        <span className="size-1.5 animate-pulse rounded-full bg-on-primary motion-reduce:animate-none" aria-hidden />
        On air
      </span>
    );
  }
  if (state.status === 'error')
    return (
      <Tag tone="danger" dot>
        Stopped
      </Tag>
    );
  return (
    <Tag tone="gold" dot>
      {{ starting: 'Starting…', waiting: elsewhere === 'ingest' ? 'Standing by' : 'Waiting', reconnecting: 'Reconnecting' }[state.status]}
    </Tag>
  );
}

/** One level across, for a room card: the loudest of the room's channels. */
function LevelBar({ level, label }: { level: ChannelLevel | undefined; label: string }) {
  const db = level?.db ?? FLOOR_DB;
  const hold = level?.hold ?? FLOOR_DB;
  return (
    <div
      className="relative h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
      role="meter"
      aria-label={`${label} level`}
      aria-valuemin={FLOOR_DB}
      aria-valuemax={0}
      aria-valuenow={Math.round(db)}
      aria-valuetext={db <= FLOOR_DB ? 'silent' : `${Math.round(db)} dBFS`}
    >
      <span className={cn('absolute inset-y-0 left-0', ZONE_BG[meterZone(db)])} style={{ width: `${meterFraction(db) * 100}%` }} />
      {hold > FLOOR_DB && <span className={cn('absolute inset-y-0 w-0.5', ZONE_BG[meterZone(hold)])} style={{ left: `calc(${meterFraction(hold) * 100}% - 2px)` }} />}
    </div>
  );
}

/** The live session's latest words, and when they came: reported up so silence can be timed. */
function LastWords({ sessionId, room, silence, onHeard }: { sessionId: string; room: string; silence: Silence; onHeard: (room: string, at: number) => void }) {
  const feed = useCaptionFeed(sessionId);
  const last = feed.interim ?? feed.finals.at(-1) ?? null;
  const at = last ? Date.parse(last.at) : null;
  useEffect(() => {
    if (at) onHeard(room, at);
  }, [at, room, onHeard]);
  return (
    <div className="flex min-h-[3.75rem] flex-col gap-1">
      {last ? (
        <p className="line-clamp-2 text-sm italic text-ink-soft">“{last.text}”</p>
      ) : (
        <p className="text-sm text-hint">Waiting for the first words</p>
      )}
      {last && (
        <p className={cn('text-xs', silence.level === 'silent' ? 'font-medium text-danger' : silence.level === 'quiet' ? 'font-medium text-warning' : 'text-hint')}>
          {silence.level === 'ok' ? `Words ${ago(silence.seconds)} ago` : `No words for ${ago(silence.seconds)}`}
        </p>
      )}
    </div>
  );
}

const SEVERITY_ICON = { critical: ExclamationTriangleIcon, warning: ExclamationTriangleIcon } as const;

/** What needs attention, worst first, one line each with its fix; and what has just recovered. */
function AlertStrip({ alerts, recovered, onAct }: { alerts: DeskAlert[]; recovered: string[]; onAct: (alert: DeskAlert) => void }) {
  const [all, setAll] = useState(false);
  if (!alerts.length && !recovered.length) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft px-5 py-3 text-sm text-success">
        <CheckCircleIcon className="size-5" />
        Every live room is captioned and talking.
      </p>
    );
  }
  const shown = all ? alerts : alerts.slice(0, 4);
  const ACTION = { start: 'Start', retry: 'Retry', patch: 'Patch it', switch: 'Switch session' } as const;
  return (
    <section aria-label="Desk alerts" role="alert" className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
      {shown.map((a) => {
        const Icon = SEVERITY_ICON[a.severity];
        return (
          <div key={a.key} className={cn('flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm', a.severity === 'critical' ? 'bg-danger-soft text-ink' : 'bg-warning-soft/60 text-ink')}>
            <Icon className={cn('size-5 shrink-0', a.severity === 'critical' ? 'text-danger' : 'text-warning')} />
            <span className="min-w-0 flex-1">{a.text}</span>
            {a.action && (
              <button type="button" onClick={() => onAct(a)} className={a.severity === 'critical' ? buttonClass({ className: 'h-8' }) : buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
                {ACTION[a.action]}
              </button>
            )}
          </div>
        );
      })}
      {alerts.length > 4 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="px-5 py-2 text-left text-xs font-medium text-primary hover:underline">
          {all ? 'Show fewer' : `${alerts.length - 4} more`}
        </button>
      )}
      {recovered.map((room) => (
        <p key={room} className="pop-in flex items-center gap-3 bg-success-soft px-5 py-2.5 text-sm text-success">
          <CheckCircleIcon className="size-5 shrink-0" />
          {room}: captions back to normal
        </p>
      ))}
    </section>
  );
}

/** Name each channel for what it carries, once, so patching reads "Main Hall lectern", not "Ch 7". */
export function ChannelNamesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { channels, desk } = useDesk();
  const names = useChannelNames();
  const [draft, setDraft] = useState(names);
  const baseId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveChannelNames(draft);
    onClose();
  };
  return (
    <FormDialog open={open} icon={TagIcon} title="Name the channels" subtitle="What each channel carries, as on the mixer's routing sheet" pending={false} submitLabel="Save names" error={null} onClose={onClose} onSubmit={submit}>
      <p className="text-sm text-ink-soft">Talk into each mic and watch which level moves. Names stay on this computer.</p>
      <ul className="flex flex-col gap-2">
        {channels.map((c) => (
          <li key={c.value} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)] items-center gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <label htmlFor={`${baseId}-${c.value}`} className="truncate text-xs text-ink-soft" title={c.label}>
                {c.label}
              </label>
              <LevelBar level={desk.levels[c.value]} label={c.label} />
            </div>
            <TextInput id={`${baseId}-${c.value}`} value={draft[c.value] ?? ''} maxLength={40} placeholder="e.g. Main Hall lectern" onChange={(e) => setDraft((d) => ({ ...d, [c.value]: e.target.value }))} />
          </li>
        ))}
      </ul>
    </FormDialog>
  );
}

/**
 * The desk at a glance, as an operator watches it during the day: one card per room with what is
 * live, its level, its latest words and its one button, under a strip of what needs attention.
 * Patching stays in the Patch view, set up once in the morning.
 */
export function RoomBoard({ onPatch }: { onPatch: () => void }) {
  const control = useDesk();
  const { desk, rooms, channels, patchedSource, patchedMics, isMulti, ready, elsewhere, onAir, startRoom } = control;
  const names = useChannelNames();
  const toast = useToast();
  const board = useBoard();
  const liveActions = useLiveActions();

  // when each room's words last came, kept outside state: the clock below redraws every second
  const heard = useRef(new Map<string, number>());
  const since = useRef(new Map<string, number>());
  const onHeard = useMemo(() => (room: string, at: number) => void heard.current.set(room, at), []);
  // a snapshot each second of the clock and the times above, for drawing
  const [tick, setTick] = useState<{ now: number; heard: Record<string, number>; since: Record<string, number> }>(() => ({ now: Date.now(), heard: {}, since: {} }));
  const now = tick.now;
  const statuses = useRef(desk.rooms);
  useEffect(() => {
    statuses.current = desk.rooms;
  });
  useEffect(() => {
    const timer = setInterval(() => {
      const t = Date.now();
      // when this desk started each room, so a room that never speaks is still timed
      for (const [room, s] of Object.entries(statuses.current)) {
        if (s?.status === 'capturing' && !since.current.has(room)) since.current.set(room, t);
        if (s?.status !== 'capturing') since.current.delete(room);
      }
      for (const room of since.current.keys()) if (!statuses.current[room]) since.current.delete(room);
      setTick({ now: t, heard: Object.fromEntries(heard.current), since: Object.fromEntries(since.current) });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const states = useMemo(() => {
    const sessions = board.data ?? [];
    return roomStates(sessions, [], currentDay(sessions).day);
  }, [board.data]);
  const nextOf = (room: string) => states.find((s) => sameRoom(s.room, room))?.next ?? null;
  // the programme's end time for what is live (the live list may not carry one)
  const endOf = (room: string, fallback: string | undefined) => {
    const planned = states.find((s) => sameRoom(s.room, room))?.live?.endsAt ?? fallback;
    return planned && !Number.isNaN(Date.parse(planned)) ? planned : null;
  };

  const sourcesOf = (room: string) => (isMulti(room) ? patchedMics(room) : [patchedSource(room)].filter((s): s is string => !!s));
  const levelOf = (room: string): ChannelLevel | undefined => {
    const levels = sourcesOf(room)
      .map((s) => desk.levels[s])
      .filter((l): l is ChannelLevel => !!l);
    if (!levels.length) return undefined;
    return { db: Math.max(...levels.map((l) => l.db)), hold: Math.max(...levels.map((l) => l.hold)) };
  };
  const sourceText = (room: string) => {
    const sources = sourcesOf(room);
    if (!sources.length) return elsewhere(room) === 'ingest' ? 'Venue stream' : elsewhere(room) ? 'Another desk' : 'Not patched';
    if (sources.length > 1) return `${sources.length} mics`;
    return channelLabel(sources[0]!, channels.find((c) => c.value === sources[0])?.label ?? sources[0]!, names);
  };

  const deskRooms: DeskRoom[] = rooms.map((room) => {
    const live = onAir(room);
    const next = nextOf(room);
    const state = desk.rooms[room];
    return {
      room,
      live: live ? { id: live.id, title: live.title, endsAt: endOf(room, live.endsAt) ?? '' } : null,
      next: next ? { id: next.id, title: next.title, startsAt: next.startsAt } : null,
      desk: state ? { status: state.status, message: state.message } : null,
      elsewhere: !!elsewhere(room),
      ready: ready(room),
      silence: live ? silenceOf(tick.heard[room] ?? null, tick.since[room] ?? null, now) : { level: 'ok', seconds: 0 },
    };
  });
  const alerts = deskAlerts(deskRooms, now);

  // a new critical problem chimes once; one that clears shows as recovered for a few seconds
  const criticalKeys = alerts.filter((a) => a.severity === 'critical').map((a) => a.key).join('|');
  const lastCritical = useRef<string[]>([]);
  const [recovered, setRecovered] = useState<{ room: string; until: number }[]>([]);
  useEffect(() => {
    const nowKeys = criticalKeys ? criticalKeys.split('|') : [];
    const fresh = nowKeys.filter((k) => !lastCritical.current.includes(k));
    const cleared = lastCritical.current.filter((k) => !nowKeys.includes(k));
    lastCritical.current = nowKeys;
    if (fresh.length) chime();
    if (cleared.length) {
      const timer = setTimeout(() => {
        const t = Date.now();
        setRecovered((r) => [...r.filter((x) => x.until > t), ...cleared.map((k) => ({ room: k.split(':')[0]!, until: t + 10_000 }))]);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [criticalKeys]);
  const recentlyRecovered = [...new Set(recovered.filter((r) => r.until > now && !alerts.some((a) => a.room === r.room)).map((r) => r.room))];

  const [switching, setSwitching] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const switchRoom = switching ? deskRooms.find((r) => r.room === switching) : null;
  const act = (a: DeskAlert) => {
    if (a.action === 'start') startRoom(a.room);
    else if (a.action === 'retry') void desk.stop(a.room).then(() => startRoom(a.room));
    else if (a.action === 'patch') onPatch();
    else if (a.action === 'switch') setSwitching(a.room);
  };
  const doSwitch = () => {
    if (!switchRoom?.next) return;
    const { live, next, room } = switchRoom;
    liveActions.switchSession.mutate(
      { endId: live?.id, startId: next.id },
      {
        onSuccess: () => toast.push({ title: `${room}: now “${next.title}”`, body: 'Captions go to it from now on.', leading: { kind: 'icon', icon: ArrowRightCircleIcon, tone: 'success' } }),
        onError: (e) => toast.push({ title: 'Not switched', body: e.message }),
        onSettled: () => setSwitching(null),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <AlertStrip alerts={alerts} recovered={recentlyRecovered} onAct={act} />
      {rooms.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface px-5 py-6 text-sm text-hint">No rooms yet. Add the venue&apos;s rooms in Venue &amp; rooms.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {deskRooms.map((r) => {
            const state = desk.rooms[r.room];
            const busy = !!state && state.status !== 'error';
            const worst = alerts.find((a) => a.room === r.room)?.severity;
            const live = onAir(r.room);
            return (
              <li
                key={r.room}
                className={cn(
                  'flex min-w-0 flex-col gap-3 rounded-xl border bg-surface p-4',
                  worst === 'critical' ? 'border-danger shadow-[inset_0_3px_0_var(--color-danger)]' : worst === 'warning' ? 'border-warning/60' : 'border-border',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="min-w-0 truncate text-base font-medium text-ink">{r.room}</h3>
                  <RoomStatusTag state={state} patched={r.ready} elsewhere={elsewhere(r.room)} />
                </div>
                <div className="min-w-0 text-sm">
                  {r.live ? (
                    <p className="line-clamp-2 text-ink">
                      <span className="text-success">Live</span> · {r.live.title} {r.live.endsAt && <span className="text-hint">until {clock(r.live.endsAt)}</span>}
                    </p>
                  ) : (
                    <p className="text-hint">Nothing live</p>
                  )}
                  {r.next && <p className="mt-0.5 truncate text-xs text-hint">Next: {r.next.title} at {clock(r.next.startsAt)}</p>}
                </div>
                <div className="flex flex-col gap-1.5">
                  <p className="truncate text-xs text-ink-soft" title={sourceText(r.room)}>
                    {sourceText(r.room)}
                  </p>
                  <LevelBar level={levelOf(r.room)} label={r.room} />
                </div>
                {live ? <LastWords sessionId={live.id} room={r.room} silence={r.silence} onHeard={onHeard} /> : null}
                {state?.message && <p className={cn('text-xs', state.status === 'error' ? 'text-danger' : 'text-warning')}>{state.message}</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-1">
                  {busy ? (
                    <button type="button" onClick={() => (r.live ? setStopping(r.room) : void desk.stop(r.room))} className={buttonClass({ style: 'outline', color: 'danger', className: 'h-8' })}>
                      <StopCircleIcon className="size-4" />
                      Stop
                    </button>
                  ) : r.ready ? (
                    <button type="button" onClick={() => (state ? void desk.stop(r.room).then(() => startRoom(r.room)) : startRoom(r.room))} className={buttonClass({ className: 'h-8' })}>
                      {state ? <ArrowPathIcon className="size-4" /> : <PlayCircleIcon className="size-4" />}
                      {state ? 'Retry' : 'Start'}
                    </button>
                  ) : (
                    !elsewhere(r.room) && (
                      <button type="button" onClick={onPatch} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
                        Patch a channel
                      </button>
                    )
                  )}
                  {r.live && r.next && (
                    <button type="button" onClick={() => setSwitching(r.room)} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
                      <ArrowRightCircleIcon className="size-4" />
                      Switch to next
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmDialog
        open={!!switchRoom}
        title={switchRoom?.next ? `Switch ${switchRoom.room} to “${switchRoom.next.title}”?` : 'Switch session?'}
        confirmLabel="Switch"
        pending={liveActions.switchSession.isPending}
        onCancel={() => setSwitching(null)}
        onConfirm={doSwitch}
      >
        {switchRoom?.live ? `“${switchRoom.live.title}” ends and the next session goes live. Captions from this room go to it from now on.` : 'The next session goes live.'}
      </ConfirmDialog>
      <ConfirmDialog
        open={!!stopping}
        title={`Stop captions in ${stopping ?? 'this room'}?`}
        confirmLabel="Stop captions"
        tone="danger"
        onCancel={() => setStopping(null)}
        onConfirm={() => {
          if (stopping) void desk.stop(stopping);
          setStopping(null);
        }}
      >
        {`“${(stopping && onAir(stopping)?.title) ?? 'A session'}” is live there; its captions stop until the room is started again.`}
      </ConfirmDialog>
    </div>
  );
}
