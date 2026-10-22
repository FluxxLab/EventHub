import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
vi.mock('@/lib/api/client', () => ({ api: { get: (...a: unknown[]) => get(...a), post: vi.fn() } }));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ push: vi.fn() }) }));
vi.mock('@/lib/captions/agenda-check', () => ({ applyAgendaFix: vi.fn(() => Promise.resolve({ moved: 10, calls: 0 })) }));

import { NightlyTidyBanner } from '@/components/programme/nightly-tidy-banner';

afterEach(cleanup);

const fix = { fromSessionId: 'qa', toSessionId: 'panel', since: '2026-10-22T11:58:00Z', until: '2026-10-22T12:31:00Z', lines: 50, confidence: 0.8, namesHeard: [], evidence: 'Please welcome our panel', reason: 'Panel introduced.' };
const sessions = [
  { id: 'qa', title: 'Moderated Q&A' },
  { id: 'panel', title: 'Compute panel' },
] as never;

function show() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NightlyTidyBanner editionId="e1" day={1} sessions={sessions} isAdmin />
    </QueryClientProvider>,
  );
}

describe('overnight tidy summary', () => {
  it('says what the night did and lists what is left to decide', async () => {
    get.mockResolvedValue({ day: 1, startedAt: '2026-10-21T22:00:00Z', finishedAt: '2026-10-21T22:20:00Z', moved: [{ ...fix, confidence: 0.95, since: 'a', movedLines: 500 }], toReview: [{ ...fix, why: 'The AI is 80% sure; check before moving.' }], roomsChecked: 6, roomsFailed: [], namesAdded: 12, analysed: 20, newSuggestions: 7, speakersFilled: 30, failures: 0 });
    show();
    expect(await screen.findByText(/Day 1 tidied/)).toBeTruthy();
    expect(screen.getByText(/1 for you to decide/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText(/may belong to/).textContent).toContain('Compute panel');
    expect(screen.getByRole('button', { name: /Move/ })).toBeTruthy();
  });

  it('offers to tidy now when the night has not run', async () => {
    get.mockResolvedValue(null);
    show();
    expect(await screen.findByRole('button', { name: 'Tidy day 1 now' })).toBeTruthy();
  });
});
