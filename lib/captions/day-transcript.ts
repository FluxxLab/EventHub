import { api } from '@/lib/api/client';
import { transcriptLines, type NamedLine } from '@/lib/calls-to-action/who-said-it';
import { DEMO_MODE } from '@/lib/demo';
import { clock } from '@/lib/format';
import type { Session } from '@/lib/programme/programme';

type DaySession = Pick<Session, 'id' | 'title' | 'room' | 'startsAt' | 'endsAt' | 'status'>;
export type SessionTranscript = { session: DaySession; lines: NamedLine[] };

const sameRoom = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The sessions a day transcript covers: started ones, in one room or all, by room then time. */
export function daySessions<T extends DaySession>(sessions: T[], room: string | null): T[] {
  return sessions
    .filter((s) => s.status !== 'scheduled' && (!room || sameRoom(s.room, room)))
    .sort((a, b) => a.room.localeCompare(b.room) || a.startsAt.localeCompare(b.startsAt));
}

/** One text file: each session under its heading (room, time, title), its lines with when and who. */
export function dayText(heading: string, parts: SessionTranscript[]): string {
  const out = [heading, ''];
  for (const { session, lines } of parts) {
    out.push(`=== ${session.room} · ${clock(session.startsAt)}–${clock(session.endsAt)} · ${session.title} ===`);
    if (!lines.length) out.push('(no captions)');
    for (const l of lines) out.push(`[${Number.isNaN(l.at) ? '' : clock(new Date(l.at).toISOString())}]${l.name ? ` ${l.name}:` : ''} ${l.text}`);
    out.push('');
  }
  return out.join('\n');
}

/** One CSV file: a row per line, with its room and session. */
export function dayCsv(parts: SessionTranscript[]): string {
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = ['time,room,session,speaker,text'];
  for (const { session, lines } of parts)
    for (const l of lines) rows.push([Number.isNaN(l.at) ? '' : new Date(l.at).toISOString(), cell(session.room), cell(session.title), cell(l.name ?? ''), cell(l.text)].join(','));
  return rows.join('\n');
}

/** Downloads one file with the whole day's transcripts, one room's or every room's. */
export async function downloadDayTranscript(sessions: DaySession[], opts: { day: number; room: string | null; format: 'txt' | 'csv'; eventName: string }): Promise<number> {
  const chosen = daySessions(sessions, opts.room);
  if (!chosen.length) throw new Error(opts.room ? `Nothing has run in ${opts.room} yet on day ${opts.day}.` : `Nothing has run yet on day ${opts.day}.`);
  const parts: SessionTranscript[] = [];
  // a few at a time, in order, so a big day does not open dozens of requests at once
  for (let i = 0; i < chosen.length; i += 4) {
    const batch = await Promise.all(
      chosen.slice(i, i + 4).map(async (session) => ({
        session,
        lines: DEMO_MODE ? [] : transcriptLines(await api.getText(`/captions/${session.id}/transcript/export`, { format: 'csv' }).catch(() => '')),
      })),
    );
    parts.push(...batch);
  }
  const where = opts.room ?? 'All rooms';
  const text = opts.format === 'csv' ? dayCsv(parts) : dayText(`${opts.eventName} · Day ${opts.day} · ${where} · transcript`, parts);
  const url = URL.createObjectURL(new Blob([text], { type: opts.format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `${opts.eventName}-day-${opts.day}-${where}`.replace(/[^\w-]+/g, '-').slice(0, 80) + `-transcript.${opts.format}`;
  link.click();
  URL.revokeObjectURL(url);
  return chosen.length;
}
