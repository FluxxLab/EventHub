import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';

/** How well what was said in a session matches its agenda topic. */
export type AgendaFit = { sessionId: string; fit: 'matches' | 'partly' | 'does_not_match'; note: string };

/** A stretch filed under the wrong session, and where it belongs (null: no session, e.g. a break). */
export type AgendaFix = {
  fromSessionId: string;
  toSessionId: string | null;
  since: string;
  until: string;
  lines: number;
  confidence: number;
  namesHeard: string[];
  evidence: string;
  reason: string;
};

export type AgendaCheckResult = {
  room: string;
  day: number;
  sessions: { id: string; title: string; startsAt: string; lines: number }[];
  fits: AgendaFit[];
  fixes: AgendaFix[];
};

type Job = { status: 'running' } | { status: 'done'; result: AgendaCheckResult } | { status: 'failed'; error: string };

const POLL_MS = 4000;
const MAX_POLLS = 150; // ten minutes

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads one room's day of captions against its agenda (a minute or two) and returns what it found. */
export async function checkRoomAgainstAgenda(editionId: string, day: number, room: string): Promise<AgendaCheckResult> {
  if (DEMO_MODE) {
    await wait(800);
    return { room, day, sessions: [], fits: [], fixes: [] };
  }
  const { jobId } = await api.post<{ jobId: string }>(`/captions/agenda-check/${editionId}`, { day, room });
  for (let i = 0; i < MAX_POLLS; i++) {
    await wait(POLL_MS);
    const job = await api.get<Job>(`/captions/agenda-check/${editionId}/${jobId}`);
    if (job.status === 'done') return job.result;
    if (job.status === 'failed') throw new Error(job.error);
  }
  throw new Error('The check is taking too long. Try this room again.');
}

/** Moves one finding's stretch (and the calls to action found in it) to the session it belongs to. */
export async function applyAgendaFix(fix: AgendaFix): Promise<{ moved: number; calls: number }> {
  if (!fix.toSessionId) throw new Error('This stretch belongs to no session; nothing to move it to.');
  if (DEMO_MODE) return { moved: fix.lines, calls: 0 };
  const r = await api.post<{ moved: number; calls?: number }>(`/captions/${fix.fromSessionId}/captions/move`, { toSessionId: fix.toSessionId, since: fix.since, until: fix.until });
  return { moved: r.moved, calls: r.calls ?? 0 };
}
