'use client';

import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { FeedbackRow, SessionFeedback } from '@/lib/feedback/feedback';

const DEMO_ROWS: FeedbackRow[] = [
  { sessionId: 'd1', title: 'Opening plenary: inclusion that scales', count: 142, average: 4.41 },
  { sessionId: 'd2', title: 'Digital IDs and the last mile', count: 88, average: 4.12 },
  { sessionId: 'd4', title: 'Women in trade finance', count: 37, average: 3.46 },
  { sessionId: 'd5', title: 'Safe transport after dark', count: 3, average: 4.67 },
  { sessionId: 'd6', title: 'Closing ceremony', count: 0, average: null },
];
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const DEMO_DETAIL: Record<string, SessionFeedback> = {
  d1: {
    count: 142,
    average: 4.41,
    distribution: { '5': 81, '4': 41, '3': 14, '2': 4, '1': 2 },
    comments: [
      { rating: 5, comment: 'The Minister committing to budget lines on stage was the moment of the summit.', createdAt: ago(40) },
      { rating: 4, comment: 'Great energy. Would have liked more time for questions from the floor.', createdAt: ago(55) },
      { rating: 2, comment: 'Started 25 minutes late and the sound in the back rows was poor.', createdAt: ago(70) },
      { rating: 5, comment: 'Clear, practical, and the data was new to me.', createdAt: ago(95) },
    ],
  },
  d2: {
    count: 88,
    average: 4.12,
    distribution: { '5': 38, '4': 30, '3': 14, '2': 4, '1': 2 },
    comments: [{ rating: 4, comment: 'The rural enrolment numbers need to be in the communiqué.', createdAt: ago(20) }],
  },
  d4: { count: 37, average: 3.46, distribution: { '5': 8, '4': 11, '3': 10, '2': 6, '1': 2 }, comments: [{ rating: 3, comment: 'Too much jargon for a general audience.', createdAt: ago(200) }] },
  d5: { count: 3, average: 4.67, distribution: { '5': 2, '4': 1, '3': 0, '2': 0, '1': 0 }, comments: [] },
};

/** Every session of the edition with its rating count and average. */
export function useFeedbackSummary(editionId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['admin', 'feedback', 'summary', editionId ?? 'none'],
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(DEMO_ROWS) : api.get<FeedbackRow[]>('/feedback/summary', { editionId }, signal)),
    enabled: enabled && !!editionId,
    refetchInterval: 60_000,
  });
}

/** One session's star distribution and written comments. */
export function useSessionFeedback(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['admin', 'feedback', 'session', sessionId ?? 'none'],
    queryFn: ({ signal }) =>
      DEMO_MODE
        ? Promise.resolve(DEMO_DETAIL[sessionId!] ?? { count: 0, average: 0, distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, comments: [] })
        : api.get<SessionFeedback>(`/sessions/${sessionId}/feedback`, undefined, signal),
    enabled: !!sessionId,
  });
}
