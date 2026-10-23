/**
 * What needs the desk's attention, worst first, as broadcast monitoring does it: a problem shows
 * only once it has lasted (a pause between speakers is not silence), each has a severity, and
 * each says what to do. Only critical problems chime.
 */

/** No words for this long in a room on air: amber, then red. */
export const QUIET_AFTER_S = 60;
export const SILENT_AFTER_S = 180;
/** A live session this far past its end, with the next one due, has probably changed over. */
export const OVERRUN_AFTER_MS = 5 * 60_000;

export type Silence = { level: 'ok' | 'quiet' | 'silent'; seconds: number };

/**
 * How long a room on air has gone without words: from its last caption, or from when captioning
 * started if nothing has come yet. Unknown (no caption and no start) is never an alarm.
 */
export function silenceOf(lastAt: number | null, since: number | null, now: number): Silence {
  const from = Math.max(lastAt ?? 0, since ?? 0);
  if (!from) return { level: 'ok', seconds: 0 };
  const seconds = Math.max(0, Math.floor((now - from) / 1000));
  return { level: seconds >= SILENT_AFTER_S ? 'silent' : seconds >= QUIET_AFTER_S ? 'quiet' : 'ok', seconds };
}

export const ago = (seconds: number) => (seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`);

export type DeskRoom = {
  room: string;
  /** The session live there, with its planned end. */
  live: { id: string; title: string; endsAt: string } | null;
  /** The next scheduled session there, if any. */
  next: { id: string; title: string; startsAt: string } | null;
  /** This desk's state for the room, if it is running it. */
  desk: { status: 'starting' | 'capturing' | 'waiting' | 'reconnecting' | 'error'; message: string | null } | null;
  /** Captioned from a venue stream or another desk. */
  elsewhere: boolean;
  /** Patched here and ready to start. */
  ready: boolean;
  silence: Silence;
};

export type DeskAlert = {
  key: string;
  room: string;
  severity: 'critical' | 'warning';
  text: string;
  /** The one button that deals with it. */
  action: 'start' | 'retry' | 'patch' | 'switch' | null;
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function deskAlerts(rooms: DeskRoom[], now: number): DeskAlert[] {
  const out: DeskAlert[] = [];
  for (const r of rooms) {
    const onAirHere = r.desk && r.desk.status !== 'error';
    if (r.desk?.status === 'error') {
      out.push({ key: `${r.room}:error`, room: r.room, severity: 'critical', text: `${r.room} stopped: ${r.desk.message ?? 'the capture ended'}`, action: 'retry' });
    } else if (r.live && !onAirHere && !r.elsewhere) {
      out.push({
        key: `${r.room}:uncaptioned`,
        room: r.room,
        severity: 'critical',
        text: `${r.room} is live with no captions: “${r.live.title}”`,
        action: r.ready ? 'start' : 'patch',
      });
    }
    if (r.desk?.status === 'reconnecting') {
      out.push({ key: `${r.room}:reconnecting`, room: r.room, severity: 'warning', text: `${r.room}: ${r.desk.message ?? 'reconnecting'}`, action: null });
    }
    const captioned = r.live && (r.desk?.status === 'capturing' || r.elsewhere);
    if (captioned && r.silence.level !== 'ok') {
      out.push({
        key: `${r.room}:silence`,
        room: r.room,
        severity: r.silence.level === 'silent' ? 'critical' : 'warning',
        text: `${r.room}: no words for ${ago(r.silence.seconds)}. Check the mic is up and the right channel is patched.`,
        action: null,
      });
    }
    if (r.live?.endsAt && r.next && Date.parse(r.live.endsAt) + OVERRUN_AFTER_MS < now && Date.parse(r.next.startsAt) <= now) {
      out.push({
        key: `${r.room}:overrun`,
        room: r.room,
        severity: 'warning',
        text: `${r.room}: “${r.live.title}” was due to end at ${clock(r.live.endsAt)}; “${r.next.title}” may have started`,
        action: 'switch',
      });
    }
  }
  return out.sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical') || a.room.localeCompare(b.room));
}
