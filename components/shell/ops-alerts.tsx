'use client';

import { ClockIcon, SignalSlashIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';

import { useToast } from '@/components/ui/toaster';
import { useLiveSessions } from '@/lib/captions/use-captions';
import { useIngestRooms } from '@/lib/ingest/use-ingest';
import { currentDay } from '@/lib/live/live';
import { opsProblems } from '@/lib/live/ops-alerts';
import { useBoard } from '@/lib/live/use-live';
import { useNow } from '@/lib/use-now';

/**
 * Tells whoever has the console open, on any page, about a problem worth acting on: a session
 * overdue to go live or left live past its end, or a room whose venue stream failed. Each
 * problem is announced once and stays on screen until dismissed. Renders nothing.
 */
export function OpsAlerts() {
  const live = useLiveSessions();
  const streams = useIngestRooms();
  const board = useBoard();
  const now = useNow(30_000);
  const toast = useToast();
  const router = useRouter();
  const announced = useRef(new Set<string>());

  const problems = useMemo(
    () => {
      if (!live.data) return [];
      const sessions = board.data ?? [];
      const { day, isToday } = currentDay(sessions, now);
      // Late starts only on a real event day, not while rehearsing on sample dates.
      const programme = isToday ? sessions.filter((s) => s.day === day) : [];
      return opsProblems(live.data, streams.disabled ? null : (streams.data ?? null), now, programme);
    },
    [live.data, streams.data, streams.disabled, board.data, now],
  );

  useEffect(() => {
    const current = new Set(problems.map((p) => p.key));
    for (const problem of problems) {
      if (announced.current.has(problem.key)) continue;
      announced.current.add(problem.key);
      toast.push({
        title: problem.title,
        body: problem.body,
        leading: { kind: 'icon', icon: problem.kind === 'overrun' || problem.kind === 'late-start' ? ClockIcon : SignalSlashIcon, tone: 'danger' },
        duration: 0,
        actions: [{ label: 'Open Live ops', primary: true, onClick: () => router.push('/live') }],
      });
    }
    // A problem that clears can alert again if it comes back.
    for (const key of announced.current) if (!current.has(key)) announced.current.delete(key);
  }, [problems, toast, router]);

  return null;
}
