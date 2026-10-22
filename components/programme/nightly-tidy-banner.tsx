'use client';

import { ArrowRightCircleIcon, ExclamationTriangleIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api/client';
import { applyAgendaFix, type AgendaFix } from '@/lib/captions/agenda-check';
import { DEMO_MODE } from '@/lib/demo';
import { ago, clock } from '@/lib/format';
import type { Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

type NightlyResult = {
  day: number;
  startedAt: string;
  finishedAt: string | null;
  moved: (AgendaFix & { movedLines: number })[];
  toReview: (AgendaFix & { why: string })[];
  roomsChecked: number;
  roomsFailed: string[];
  namesAdded: number;
  analysed: number;
  newSuggestions: number;
  speakersFilled: number;
  failures: number;
};

/**
 * What the server's overnight tidy did to a day (or is doing): mix-ups moved, anything left for a
 * person with a Move button, names, analysis and speakers found. An admin can also run it now.
 */
export function NightlyTidyBanner({ editionId, day, sessions, isAdmin }: { editionId: string; day: number; sessions: Session[]; isAdmin: boolean }) {
  const toast = useToast();
  const client = useQueryClient();
  const key = ['nightly-tidy', editionId, day];
  const result = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(null) : api.get<NightlyResult | null>(`/editions/${editionId}/nightly-tidy`, { day }, signal)),
    refetchInterval: (q) => (q.state.data && !q.state.data.finishedAt ? 8000 : 120_000),
  });
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const titleOf = (id: string | null) => (id ? (sessions.find((s) => s.id === id)?.title ?? 'another session') : 'no session');
  const keyOf = (f: AgendaFix) => `${f.fromSessionId}:${f.since}`;

  const runNow = () =>
    api
      .post<{ started: boolean }>(`/editions/${editionId}/nightly-tidy?day=${day}`, {})
      .then((r) => {
        toast.push({ title: r.started ? `Tidying day ${day} on the server` : 'Already running', body: 'Ten to twenty minutes; you can leave this page. The summary appears here.' });
        setTimeout(() => void client.invalidateQueries({ queryKey: key }), 2000);
      })
      .catch((e: Error) => toast.push({ title: 'Not started', body: e.message }));

  const r = result.data;
  if (!r) {
    if (!isAdmin || result.isPending) return null;
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface px-5 py-3 text-sm text-ink-soft">
        <MoonIcon className="size-5 text-hint" />
        <span className="min-w-0 flex-1">Day {day} is tidied on the server at 11pm: captions put under the right sessions, speakers named, analysed. No need to keep a page open.</span>
        <button type="button" onClick={() => void runNow()} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
          Tidy day {day} now
        </button>
      </div>
    );
  }

  const running = !r.finishedAt;
  const left = r.toReview.filter((f) => !done.has(keyOf(f)));
  return (
    <section className={cn('rounded-xl border px-5 py-4', left.length ? 'border-warning/50 bg-warning-soft/40' : 'border-border bg-surface')}>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <MoonIcon className="size-5 text-primary" />
        <p className="min-w-0 flex-1 text-ink">
          {running ? (
            <>
              <strong>Tidying day {day}…</strong> {r.roomsChecked} room(s) checked so far, {r.moved.length} stretch(es) moved.
            </>
          ) : (
            <>
              <strong>Day {day} tidied</strong> {ago(r.finishedAt!).toLowerCase()}: {r.moved.length} stretch(es) moved to the right session, {r.namesAdded} speaker name(s) added, {r.newSuggestions} new suggestion(s) to review,{' '}
              {r.speakersFilled} call(s) given who said them.
              {left.length > 0 && <strong> {left.length} for you to decide.</strong>}
            </>
          )}
        </p>
        {!running && (
          <button type="button" onClick={() => setOpen((o) => !o)} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
            {open ? 'Hide' : 'Details'}
          </button>
        )}
        {!running && isAdmin && (
          <button type="button" onClick={() => void runNow()} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
            Run again
          </button>
        )}
      </div>
      {open && !running && (
        <div className="mt-3 flex flex-col gap-2 text-sm">
          {r.moved.map((f) => (
            <p key={keyOf(f)} className="text-ink-soft">
              Moved {clock(f.since)}–{clock(f.until)} from “{titleOf(f.fromSessionId)}” to “{titleOf(f.toSessionId)}” · {f.reason}
            </p>
          ))}
          {r.toReview.map((f) => {
            const isDone = done.has(keyOf(f));
            return (
              <div key={keyOf(f)} className={cn('rounded-lg border bg-surface p-3', isDone ? 'border-border opacity-60' : 'border-warning/50')}>
                <p className="flex items-start gap-2 text-ink">
                  <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                  <span>
                    {clock(f.since)}–{clock(f.until)} under <strong>“{titleOf(f.fromSessionId)}”</strong> may belong to <strong>{f.toSessionId ? `“${titleOf(f.toSessionId)}”` : 'no session'}</strong>. {f.why}
                  </span>
                </p>
                <blockquote className="mt-1 border-l-2 border-border pl-2 text-xs italic text-ink-soft">“{f.evidence}”</blockquote>
                {f.toSessionId && (
                  <button
                    type="button"
                    disabled={isDone}
                    onClick={() =>
                      void applyAgendaFix(f)
                        .then(() => {
                          setDone((d) => new Set(d).add(keyOf(f)));
                          toast.push({ title: 'Moved', body: `Now under “${titleOf(f.toSessionId)}”. Analyse it again with “Read the whole session again”.` });
                        })
                        .catch((e: Error) => toast.push({ title: 'Not moved', body: e.message }))
                    }
                    className={buttonClass({ className: 'mt-2 h-8' })}
                  >
                    <ArrowRightCircleIcon className="size-4" />
                    {isDone ? 'Moved' : 'Move'}
                  </button>
                )}
              </div>
            );
          })}
          {(r.roomsFailed.length > 0 || r.failures > 0) && (
            <p className="text-warning">
              {r.roomsFailed.length ? `Not checked: ${r.roomsFailed.join(', ')}. ` : ''}
              {r.failures ? `${r.failures} step(s) did not finish; Run again picks them up.` : ''}
            </p>
          )}
          <p className="text-ink-soft">
            Next: review the new suggestions, then download the report and deck on{' '}
            <Link href="/calls-to-action" className="font-medium text-primary underline underline-offset-2">
              Calls to action
            </Link>
            .
          </p>
        </div>
      )}
    </section>
  );
}
