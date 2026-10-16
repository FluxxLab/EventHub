'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from '@/lib/api/client';
import type { AnalyseResult } from '@/lib/calls-to-action/calls-to-action';
import { boardKey } from '@/lib/calls-to-action/use-calls-to-action';
import { DEMO_MODE } from '@/lib/demo';

/**
 * Analysing several sessions in one go. Two run at a time: a long session's transcript is a large
 * request, and the AI's per-minute allowance is shared, so more at once only gets "busy" answers.
 * A session the AI is too busy for waits and tries once more; one that fails leaves the rest
 * running.
 */

export const AT_ONCE = 2;
/** How long a session the AI was too busy for waits before its second try. */
export const BUSY_WAIT_MS = 30_000;

export type RunState = { status: 'waiting' } | { status: 'reading'; retry?: boolean } | { status: 'done'; added: number; message: string } | { status: 'failed'; message: string };

/** The AI was too busy (its rate limit), so trying again shortly can work. */
export const isBusy = (error: unknown) => error instanceof ApiError && error.status === 503 && /busy/i.test(error.message);

/**
 * Runs `work` for each id, `atOnce` at a time, reporting each one's state as it changes. A busy
 * answer waits `busyWaitMs` and tries once more; any other failure is reported and the queue goes
 * on. Resolves when every id has finished.
 */
export async function runQueue<T>(
  ids: string[],
  work: (id: string) => Promise<T>,
  report: (id: string, state: { status: 'reading'; retry?: boolean } | { status: 'done'; value: T } | { status: 'failed'; error: unknown }) => void,
  { atOnce = AT_ONCE, busyWaitMs = BUSY_WAIT_MS, wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)) } = {},
): Promise<void> {
  const queue = [...ids];
  const lane = async () => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      report(id, { status: 'reading' });
      try {
        report(id, { status: 'done', value: await work(id) });
      } catch (error) {
        if (!isBusy(error)) {
          report(id, { status: 'failed', error });
          continue;
        }
        await wait(busyWaitMs);
        report(id, { status: 'reading', retry: true });
        try {
          report(id, { status: 'done', value: await work(id) });
        } catch (again) {
          report(id, { status: 'failed', error: again });
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(atOnce, ids.length) }, lane));
}

/**
 * The page's queue: what each chosen session is doing, and `start`. The list of calls refreshes as
 * each session finishes, so its suggestions appear while the others are still being read. Leaving
 * the page while it runs asks first.
 */
export function useAnalyseQueue(editionId: string) {
  const client = useQueryClient();
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [running, setRunning] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const start = useCallback(
    async (sessionIds: string[], fromStart: boolean) => {
      if (!sessionIds.length) return;
      setRuns(Object.fromEntries(sessionIds.map((id) => [id, { status: 'waiting' } as RunState])));
      setRunning(true);
      const set = (id: string, state: RunState) => live.current && setRuns((was) => ({ ...was, [id]: state }));
      await runQueue<AnalyseResult>(
        sessionIds,
        (id) =>
          DEMO_MODE
            ? new Promise((r) => setTimeout(() => r({ added: [], read: 0, message: 'Analysis needs the server.' }), 1500))
            : api.postSlow<AnalyseResult>(`/sessions/${id}/analyse${fromStart ? '?fromStart=true' : ''}`),
        (id, state) => {
          if (state.status === 'reading') set(id, state);
          else if (state.status === 'done') {
            set(id, { status: 'done', added: state.value.added.length, message: state.value.message });
            void client.invalidateQueries({ queryKey: boardKey(editionId) });
          } else set(id, { status: 'failed', message: state.error instanceof Error ? state.error.message : 'Not analysed.' });
        },
      );
      if (live.current) setRunning(false);
    },
    [client, editionId],
  );

  const clear = useCallback(() => setRuns({}), []);
  return { runs, running, start, clear };
}
