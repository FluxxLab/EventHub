'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';

import { api } from '@/lib/api/client';
import { chunk, toIssueRow, type ImportRow, type IssueResponse } from '@/lib/delegates/import';
import { DEMO_MODE } from '@/lib/demo';

export type ImportProgress =
  | { state: 'idle' }
  | { state: 'running'; done: number; total: number }
  | { state: 'finished'; results: IssueResponse }
  /** A batch failed: the batches before it were issued; running the same file again skips them. */
  | { state: 'stopped'; results: IssueResponse; done: number; total: number; message: string };

function demoIssue(rows: ReturnType<typeof toIssueRow>[]): Promise<IssueResponse> {
  // one in twelve already has a ticket, as a list brought over from another platform usually does
  return new Promise((done) =>
    setTimeout(
      () =>
        done({
          issued: rows
            .filter((_, i) => i % 12 !== 5)
            .map((r, i) => ({ email: r.email, name: r.name, code: `PIC-GEN-${(0x1a2b + i).toString(16).toUpperCase()}`, ticketId: `demo-${r.email}`, created: i % 3 !== 0 })),
          skipped: rows.filter((_, i) => i % 12 === 5).map((r) => ({ email: r.email, reason: 'has_ticket' as const })),
        }),
      600,
    ),
  );
}

/**
 * Issues tickets for the ready rows, 500 at a time, so a big list shows progress and one bad batch
 * (a tier full, say) stops the import without losing what went before.
 */
export function useImportAttendees(editionId: string) {
  const client = useQueryClient();
  const [progress, setProgress] = useState<ImportProgress>({ state: 'idle' });

  const run = useCallback(
    async (rows: ImportRow[], notify: boolean) => {
      const ready = rows.filter((r) => !r.problem).map(toIssueRow);
      const batches = chunk(ready);
      const results: IssueResponse = { issued: [], skipped: [] };
      setProgress({ state: 'running', done: 0, total: ready.length });
      let done = 0;
      for (const batch of batches) {
        try {
          const answer = DEMO_MODE ? await demoIssue(batch) : await api.post<IssueResponse>(`/editions/${editionId}/tickets/issue`, { rows: batch, notify });
          results.issued.push(...answer.issued);
          results.skipped.push(...answer.skipped);
          done += batch.length;
          setProgress({ state: 'running', done, total: ready.length });
        } catch (e) {
          setProgress({ state: 'stopped', results, done, total: ready.length, message: e instanceof Error ? e.message : 'The import stopped.' });
          void client.invalidateQueries({ queryKey: ['admin'] });
          return;
        }
      }
      setProgress({ state: 'finished', results });
      // delegates, badges, the gate count and the dashboard all change
      void client.invalidateQueries({ queryKey: ['admin'] });
    },
    [client, editionId],
  );

  const reset = useCallback(() => setProgress({ state: 'idle' }), []);
  return { progress, run, reset };
}
