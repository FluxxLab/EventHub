import { describe, expect, it } from 'vitest';

import { ApiError } from '@/lib/api/client';
import { runQueue } from '@/lib/calls-to-action/analyse-queue';

const noWait = () => Promise.resolve();

describe('analysing several sessions', () => {
  it('runs two at a time, and every session finishes', async () => {
    let now = 0;
    let most = 0;
    const done: string[] = [];
    await runQueue(
      ['a', 'b', 'c', 'd', 'e'],
      async (id) => {
        most = Math.max(most, ++now);
        await new Promise((r) => setTimeout(r, 5));
        now--;
        return id;
      },
      (id, state) => state.status === 'done' && done.push(id),
      { wait: noWait },
    );
    expect(most).toBe(2);
    expect(done.sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('waits and tries once more when the AI is busy', async () => {
    const tries: Record<string, number> = {};
    const states: string[] = [];
    let waited = 0;
    await runQueue(
      ['a'],
      async (id) => {
        tries[id] = (tries[id] ?? 0) + 1;
        if (tries[id] === 1) throw new ApiError(503, 'The AI is busy right now. Try again in a minute.');
        return 'ok';
      },
      (_id, state) => states.push(state.status === 'reading' && state.retry ? 'retry' : state.status),
      {
        wait: () => {
          waited++;
          return Promise.resolve();
        },
      },
    );
    expect(tries.a).toBe(2);
    expect(waited).toBe(1);
    expect(states).toEqual(['reading', 'retry', 'done']);
  });

  it('reports a failure and carries on with the rest', async () => {
    const outcome: Record<string, string> = {};
    await runQueue(
      ['a', 'b', 'c'],
      async (id) => {
        if (id === 'b') throw new ApiError(400, 'This session has no captions yet.');
        return id;
      },
      (id, state) => {
        if (state.status !== 'reading') outcome[id] = state.status;
      },
      { wait: noWait },
    );
    expect(outcome).toEqual({ a: 'done', b: 'failed', c: 'done' });
  });
});
