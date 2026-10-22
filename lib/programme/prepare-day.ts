import { api } from '@/lib/api/client';
import { applyAgendaFix, checkRoomAgainstAgenda, type AgendaFix } from '@/lib/captions/agenda-check';
import { recheckNames } from '@/lib/captions/speaker-names';
import { DEMO_MODE } from '@/lib/demo';
import type { Session } from '@/lib/programme/programme';

/** A stretch moved without asking only when the AI is this sure and names where it goes. */
export const AUTO_MOVE_CONFIDENCE = 0.9;

export type PrepStep = 'agenda' | 'names' | 'analyse' | 'who';
export type PrepProgress = { step: PrepStep; done: number; of: number };

export type PrepResult = {
  moved: { fix: AgendaFix; lines: number }[];
  /** Findings left for a person: not sure enough, no target, or the move refused. */
  toReview: (AgendaFix & { why: string })[];
  roomsFailed: string[];
  namesAdded: number;
  reanalysed: number;
  newSuggestions: number;
  speakersFilled: number;
  failures: number;
};

/** Runs `task` over `items`, `limit` at a time, reporting each one finished. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>, onDone: (done: number) => void) {
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await task(item);
      onDone(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/** Which fixes go ahead on their own: sure, with a target, one per stretch. */
export function splitFixes(fixes: AgendaFix[], min = AUTO_MOVE_CONFIDENCE): { auto: AgendaFix[]; review: (AgendaFix & { why: string })[] } {
  const auto: AgendaFix[] = [];
  const review: (AgendaFix & { why: string })[] = [];
  for (const f of fixes) {
    if (!f.toSessionId) review.push({ ...f, why: 'It belongs to no session (a break or housekeeping).' });
    else if (f.confidence < min) review.push({ ...f, why: `The AI is ${Math.round(f.confidence * 100)}% sure; check before moving.` });
    else auto.push(f);
  }
  return { auto, review };
}

/**
 * The day's wrap-up in one go, in the order each step needs the last: captions put under the right
 * sessions, voices named, the moved sessions analysed afresh, then each call's speaker found.
 */
export async function prepareDay(editionId: string, day: number, sessions: Session[], onProgress: (p: PrepProgress) => void): Promise<PrepResult> {
  const today = sessions.filter((s) => s.day === day);
  const rooms = [...new Map(today.filter((s) => s.status !== 'scheduled').map((s) => [s.room.trim().toLowerCase(), s.room.trim()])).values()].sort();
  const result: PrepResult = { moved: [], toReview: [], roomsFailed: [], namesAdded: 0, reanalysed: 0, newSuggestions: 0, speakersFilled: 0, failures: 0 };
  const touched = new Set<string>();

  // 1. the captions against the agenda, room by room; sure moves made at once
  await pool(
    rooms,
    2,
    async (room) => {
      try {
        const check = await checkRoomAgainstAgenda(editionId, day, room);
        const { auto, review } = splitFixes(check.fixes);
        result.toReview.push(...review);
        for (const fix of auto) {
          try {
            const r = await applyAgendaFix(fix);
            result.moved.push({ fix, lines: r.moved });
            touched.add(fix.fromSessionId);
            touched.add(fix.toSessionId!);
          } catch (e) {
            result.toReview.push({ ...fix, why: `Not moved: ${(e as Error).message}` });
          }
        }
      } catch {
        result.roomsFailed.push(room);
      }
    },
    (done) => onProgress({ step: 'agenda', done, of: rooms.length }),
  );

  // 2. names for the voices, in every finished session (moved lines now sit where they belong)
  const finished = today.filter((s) => s.status === 'completed');
  await pool(
    finished,
    3,
    async (s) => {
      try {
        result.namesAdded += (await recheckNames(s.id)).added;
      } catch {
        result.failures++;
      }
    },
    (done) => onProgress({ step: 'names', done, of: finished.length }),
  );

  // 3. the sessions whose captions moved, read again from the start
  const moved = [...touched].filter((id) => today.some((s) => s.id === id && s.status !== 'scheduled'));
  await pool(
    moved,
    2,
    async (id) => {
      try {
        const r = DEMO_MODE ? { added: [] } : await api.postSlow<{ added: unknown[] }>(`/sessions/${id}/analyse?fromStart=true`);
        result.reanalysed++;
        result.newSuggestions += r.added.length;
      } catch {
        result.failures++;
      }
    },
    (done) => onProgress({ step: 'analyse', done, of: moved.length }),
  );

  // 4. who said each call still without a name
  await pool(
    finished,
    3,
    async (s) => {
      try {
        const r = DEMO_MODE ? { filled: 0 } : await api.postSlow<{ filled: number }>(`/sessions/${s.id}/who-said-it`);
        result.speakersFilled += r.filled;
      } catch {
        result.failures++;
      }
    },
    (done) => onProgress({ step: 'who', done, of: finished.length }),
  );

  return result;
}
