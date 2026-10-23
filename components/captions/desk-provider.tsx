'use client';

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { useToast } from '@/components/ui/toaster';
import { deskRooms, readPatch, sameRoom, sourceOptions, uncaptioned, type DeskPatch } from '@/lib/captions/captions';
import { deskAlerts } from '@/lib/captions/desk-alerts';
import { thisDeskId, useDeskReporting, useWakeLock } from '@/lib/captions/desk-remote';
import { isTabSource, useLiveSessions, useSoundDesk } from '@/lib/captions/use-captions';
import { useWorkingEdition } from '@/lib/events/working-edition';
import type { CaptureSource } from '@/lib/ingest/ingest';
import { useIngestRooms } from '@/lib/ingest/use-ingest';
import { currentDay, roomStates } from '@/lib/live/live';
import { useBoard } from '@/lib/live/use-live';
import type { Session } from '@/lib/programme/programme';
import { useNow } from '@/lib/use-now';
import { useRooms } from '@/lib/venue/use-venue';

export const PATCH_KEY = 'pic.admin.sound-desk-patch';
const RESUME_KEY = 'pic.admin.desk-resume';
export type ResumeRoom = { room: string; tab: string | null };

/** The rooms on air when the desk last ran (from the last twelve hours), with the tab each took its sound from. */
function readResume(): ResumeRoom[] {
  try {
    const saved = JSON.parse(localStorage.getItem(RESUME_KEY) ?? 'null') as { at: number; rooms: ResumeRoom[] } | null;
    return saved && Date.now() - saved.at < 12 * 3600_000 ? saved.rooms : [];
  } catch {
    return [];
  }
}
function writeResume(rooms: ResumeRoom[]) {
  try {
    localStorage.setItem(RESUME_KEY, JSON.stringify({ at: Date.now(), rooms }));
  } catch {
    // not remembered; a reload then starts afresh
  }
}

function useDeskControl() {
  const desk = useSoundDesk();
  const toast = useToast();
  const liveQuery = useLiveSessions();
  const live = useMemo(() => [...(liveQuery.data ?? [])].sort((a, b) => a.room.localeCompare(b.room)), [liveQuery.data]);
  const board = useBoard();
  const working = useWorkingEdition();
  const venueRooms = useRooms(working.edition);
  // What the server sees: which rooms a venue stream or another desk is captioning.
  const server = useIngestRooms();
  const elsewhere = (room: string): CaptureSource | null => (server.disabled ? null : (server.data?.find((r) => sameRoom(r.room, room))?.captioning ?? null));

  // Remembered on this computer, so the desk is ready the next morning.
  const [patch, setPatch] = useState<DeskPatch>(() => {
    try {
      return readPatch(localStorage.getItem(PATCH_KEY));
    } catch {
      return {};
    }
  });
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
  const rooms = deskRooms(
    (venueRooms.data ?? []).map((r) => r.name),
    programmeRooms,
    live.map((s) => s.room),
  );
  const channels = useMemo(() => sourceOptions(desk.inputs ?? []), [desk.inputs]);
  const patchedSource = (room: string) => {
    const source = patch[room]?.source;
    return source && channels.some((c) => c.value === source) ? source : null;
  };
  const running = Object.keys(desk.rooms).filter((room) => desk.rooms[room]?.status !== 'error');
  const captioning = running.filter((room) => desk.rooms[room]?.status === 'capturing');
  /** A multi-mic room's channels in matrix order (Mic 1 first), those still on the interface. */
  const patchedMics = (room: string) => channels.filter((c) => patch[room]?.mics?.includes(c.value)).map((c) => c.value);
  const isMulti = (room: string) => !!patch[room]?.multi;
  const ready = (room: string) => (isMulti(room) ? patchedMics(room).length >= 2 : !!patchedSource(room));
  const startable = rooms.filter((room) => !desk.rooms[room] && ready(room));
  const captionedAnywhere = rooms.filter((room) => captioning.some((r) => sameRoom(r, room)) || !!elsewhere(room));
  const missing = uncaptioned(live, [...captioning, ...captionedAnywhere]);
  const streamed = rooms.filter((room) => elsewhere(room) === 'ingest');
  const onAir = (room: string): Session | undefined => live.find((s) => sameRoom(s.room, room));
  const liveRunning = running.filter((room) => onAir(room));

  // Closing the tab mid-session silences every room: ask first.
  useEffect(() => {
    if (running.length === 0) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running.length]);

  // Rooms someone stopped on purpose stay stopped; everything else patched is kept on air.
  const held = useRef(new Set<string>());
  const stopRoom = (room: string) => {
    held.current.add(room);
    return desk.stop(room);
  };
  const startRoom = (room: string) => {
    held.current.delete(room);
    if (isMulti(room)) {
      const mics = patchedMics(room);
      if (mics.length >= 2) void desk.startMulti(room, mics);
      return;
    }
    const source = patchedSource(room);
    if (source) void desk.start(room, source, !!patch[room]?.diarise);
  };

  // Run from another computer: report this desk, and carry out what is asked of it, on any page
  useDeskReporting({
    connected: !!desk.inputs,
    name: `${desk.inputs?.[0]?.label ?? 'Sound desk'} · ${thisDeskId().slice(0, 4)}`,
    channels,
    rooms,
    sourceOf: (room) => (isMulti(room) ? null : patchedSource(room)),
    states: desk.rooms,
    onCommand: (c) => {
      const onAirHere = !!desk.rooms[c.room] && desk.rooms[c.room]?.status !== 'error';
      if (c.action === 'patch' && !onAirHere && !isMulti(c.room)) updatePatch(c.room, { source: c.source ?? '' });
      else if (c.action === 'start' && !desk.rooms[c.room]) startRoom(c.room);
      else if (c.action === 'stop') void stopRoom(c.room);
      else return;
      toast.push({ title: `${c.room}: ${c.action === 'patch' ? (c.source ? 'patched' : 'unpatched') : c.action === 'start' ? 'started' : 'stopped'} from another computer` });
    },
  });
  // Hands-off: with the interface connected, every patched room goes on air by itself, and one
  // that stopped with an error is tried again every 20 s, until someone stops it on purpose.
  const keepOn = useRef({ rooms, ready, startRoom, states: desk.rooms, connected: !!desk.inputs, stop: desk.stop });
  useEffect(() => {
    keepOn.current = { rooms, ready, startRoom, states: desk.rooms, connected: !!desk.inputs, stop: desk.stop };
  });
  useEffect(() => {
    const lastTry = new Map<string, number>();
    const timer = setInterval(() => {
      const k = keepOn.current;
      if (!k.connected) return;
      const t = Date.now();
      for (const room of k.rooms) {
        if (held.current.has(room) || !k.ready(room)) continue;
        const state = k.states[room];
        if (!state) k.startRoom(room);
        else if (state.status === 'error' && t - (lastTry.get(room) ?? 0) > 20_000) {
          lastTry.set(room, t);
          void k.stop(room).then(() => k.startRoom(room));
        }
      }
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  // the problems any page can show: no captions, stopped, run over (silence needs the room's feed, on the desk)
  const states = useMemo(() => {
    const sessions = board.data ?? [];
    return roomStates(sessions, [], currentDay(sessions).day);
  }, [board.data]);
  const alertNow = useNow(30_000).getTime();
  const alerts = deskAlerts(
    rooms.map((room) => {
      const l = onAir(room);
      const s = states.find((x) => sameRoom(x.room, room));
      const state = desk.rooms[room];
      return {
        room,
        live: l ? { id: l.id, title: l.title, endsAt: s?.live?.endsAt ?? '' } : null,
        next: s?.next ? { id: s.next.id, title: s.next.title, startsAt: s.next.startsAt } : null,
        desk: state ? { status: state.status, message: state.message } : null,
        elsewhere: !!elsewhere(room),
        ready: ready(room),
        silence: { level: 'ok' as const, seconds: 0 },
      };
    }),
    alertNow,
  );

  // a desk on air must not sleep: that silences every room on it
  useWakeLock(running.length > 0);

  // What was on air, kept on this computer, so a reload can put it back
  const [saved] = useState(readResume);
  const tabOf = (room: string) => {
    const source = patchedSource(room);
    return source && isTabSource(source) ? (desk.inputs?.find((i) => source.startsWith(`${i.deviceId}#`))?.label ?? null) : null;
  };
  // a reload starts with nothing connected: what was saved is kept until the desk is back
  const onAirNow = desk.inputs ? JSON.stringify(Object.keys(desk.rooms).filter((room) => desk.rooms[room]?.status !== 'error').map((room) => ({ room, tab: tabOf(room) }))) : null;
  useEffect(() => {
    if (onAirNow !== null) writeResume(JSON.parse(onAirNow) as ResumeRoom[]);
  }, [onAirNow]);
  const latest = useRef({ startRoom, ready, rooms: desk.rooms, inputs: desk.inputs });
  useEffect(() => {
    latest.current = { startRoom, ready, rooms: desk.rooms, inputs: desk.inputs };
  });
  const [resumeState, setResumeState] = useState<'offer' | 'working' | 'done'>('offer');
  const resumable = saved.filter((r) => !desk.rooms[r.room]);

  /**
   * Puts back what was on air. `auto` is the reload's own try, with no click: it reconnects the
   * interface and starts its rooms, and leaves rooms on a shared tab for the banner, since a
   * browser shares a tab only from a click.
   */
  const resume = async (auto = false) => {
    setResumeState('working');
    const needsInterface = saved.some((r) => !r.tab);
    if (needsInterface && !latest.current.inputs?.some((i) => !isTabSource(i.deviceId))) await desk.connect();
    if (!auto) {
      for (const label of [...new Set(saved.map((r) => r.tab).filter((t): t is string => !!t))]) {
        if (latest.current.inputs?.some((i) => i.label === label)) continue;
        const tabRooms = saved.filter((r) => r.tab === label).map((r) => r.room).join(', ');
        toast.push({ title: `Share the tab for ${tabRooms}`, body: `Pick “${label.replace(/^Browser tab · /, '')}” and turn on “Also share tab audio”.`, duration: 15000 });
        await desk.shareTab();
      }
    }
    // the inputs are in; start each room once the desk has caught up with them
    await new Promise((r) => setTimeout(r, 400));
    const { startRoom: go, ready: isReady, rooms: onAirRooms } = latest.current;
    const started: string[] = [];
    const left: string[] = [];
    for (const r of saved) {
      if (onAirRooms[r.room]) continue;
      if (isReady(r.room)) {
        go(r.room);
        started.push(r.room);
      } else left.push(r.room);
    }
    const tabsLeft = auto && saved.some((r) => r.tab && left.includes(r.room));
    setResumeState(tabsLeft ? 'offer' : 'done');
    if (auto && !started.length) return;
    toast.push({
      title: left.length ? (started.length ? `Captioning back on in ${started.length} room(s)` : 'Some rooms could not resume') : 'Captioning resumed',
      body: left.length
        ? `${left.join(', ')}: ${tabsLeft ? 'share its tab again with Resume on the Sound desk' : 'their channel or tab is not here. Patch them and press Start'}.`
        : `${started.join(', ')} back on air${auto ? ' after the reload' : ''}.`,
    });
  };
  const dismissResume = () => setResumeState('done');

  // After a reload: put the desk back on its own when the browser already allows the interface
  const autoTried = useRef(false);
  useEffect(() => {
    if (autoTried.current || desk.permission !== 'granted' || desk.inputs) return;
    if (!saved.some((r) => !r.tab)) return;
    // once the page has settled, not during its render
    const timer = setTimeout(() => {
      if (autoTried.current) return;
      autoTried.current = true;
      void resume(true);
    }, 0);
    return () => clearTimeout(timer);
  });

  const stopDesk = () => {
    held.current.clear();
    writeResume([]); // put away on purpose: nothing to resume
    void desk.disconnect();
  };

  return {
    desk,
    live,
    liveReady: !liveQuery.isPending,
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
    stopRoom,
    alerts,
    resumable,
    resumeState,
    resume: () => void resume(false),
    dismissResume,
    stopDesk,
  };
}

export type DeskControl = ReturnType<typeof useDeskControl>;

const DeskContext = createContext<DeskControl | null>(null);

/**
 * The sound desk for the whole console: the interface, the rooms on air, remote control and the
 * wake lock live here, so captioning carries on while the operator uses other pages. A reload
 * puts the rooms back on its own where the browser allows it.
 */
export function DeskProvider({ children }: { children: ReactNode }) {
  const control = useDeskControl();
  return <DeskContext.Provider value={control}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskControl {
  const control = useContext(DeskContext);
  if (!control) throw new Error('useDesk must be used inside <DeskProvider>.');
  return control;
}
