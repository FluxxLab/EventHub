'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import { chunk, toSessionBody, toSpeakerBody, type PlannedSpeaker, type SessionRow } from '@/lib/programme/import';
import type { Session, Speaker } from '@/lib/programme/programme';

export type ProgrammeImportResult = {
  /** Sheet lines whose session was added. */
  created: Set<number>;
  speakersAdded: number;
};

export type ProgrammeImportProgress =
  | { state: 'idle' }
  | { state: 'running'; phase: 'speakers' | 'sessions'; done: number; total: number }
  | { state: 'finished'; result: ProgrammeImportResult }
  /** Something failed part-way: what went before stays, and importing the same sheet again skips it. */
  | { state: 'stopped'; result: ProgrammeImportResult; message: string };

/** New speakers added at once; the API has no bulk route for them. */
const SPEAKER_POOL = 4;

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));

/**
 * Adds the people the sheet names who are not on file yet (`POST /speakers`), then the sessions
 * with their speakers (`POST /sessions/bulk`, 50 at a time, one push to delegates per batch). The
 * first failure stops it; everything before stays, and the same sheet run again skips it.
 */
export function useImportProgramme(editionId: string, editionStartsAt: string) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<ProgrammeImportProgress>({ state: 'idle' });

  const run = useCallback(
    async (rows: SessionRow[], people: PlannedSpeaker[]) => {
      const result: ProgrammeImportResult = { created: new Set(), speakersAdded: 0 };
      const ids = new Map(people.flatMap((p) => (p.existing ? [[p.key, p.existing.id] as const] : [])));
      const toAdd = people.filter((p) => !p.existing);
      const ready = rows.filter((r) => !r.problem);
      const stop = (message: string) => {
        setProgress({ state: 'stopped', result, message });
        void client.invalidateQueries({ queryKey: ['admin', 'speakers'] });
        void client.invalidateQueries({ queryKey: ['admin', 'sessions'] });
      };

      setProgress({ state: 'running', phase: 'speakers', done: 0, total: toAdd.length });
      for (const group of chunk(toAdd, SPEAKER_POOL)) {
        const settled = await Promise.allSettled(
          group.map((p) =>
            DEMO_MODE ? pause(150).then(() => ({ id: `demo-sp-${p.key}` }) as Speaker) : api.post<Speaker>('/speakers', toSpeakerBody(p)),
          ),
        );
        settled.forEach((s, i) => {
          if (s.status === 'fulfilled') {
            ids.set(group[i]!.key, s.value.id);
            result.speakersAdded += 1;
          }
        });
        const failed = settled.findIndex((s) => s.status === 'rejected');
        if (failed !== -1) {
          const reason = (settled[failed] as PromiseRejectedResult).reason;
          return stop(`Adding ${group[failed]!.name} failed: ${reason instanceof Error ? reason.message : 'the server refused'}.`);
        }
        setProgress({ state: 'running', phase: 'speakers', done: result.speakersAdded, total: toAdd.length });
      }

      setProgress({ state: 'running', phase: 'sessions', done: 0, total: ready.length });
      for (const batch of chunk(ready)) {
        const body = batch.map((r) => toSessionBody(r, editionStartsAt, editionId, ids));
        try {
          if (DEMO_MODE) await pause(400);
          else await api.post<Session[]>('/sessions/bulk', body);
        } catch (e) {
          return stop(e instanceof Error ? e.message : 'The import stopped.');
        }
        for (const r of batch) result.created.add(r.line);
        setProgress({ state: 'running', phase: 'sessions', done: result.created.size, total: ready.length });
      }

      setProgress({ state: 'finished', result });
      void client.invalidateQueries({ queryKey: ['admin', 'speakers'] });
      void client.invalidateQueries({ queryKey: ['admin', 'sessions'] });
    },
    [client, editionId, editionStartsAt],
  );

  const reset = useCallback(() => setProgress({ state: 'idle' }), []);
  return { progress, run, reset };
}
