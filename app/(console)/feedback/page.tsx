'use client';

import { ArrowDownTrayIcon, ExclamationTriangleIcon, StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { runsEvents, useSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/discussions/discussions';
import { useEditions } from '@/lib/events/use-editions';
import { FEW_RATINGS, formatAverage, overall, rankSessions, SORT_LABEL, STARS, type FeedbackRow, type SortMode, type Stars } from '@/lib/feedback/feedback';
import { useFeedbackSummary, useSessionFeedback } from '@/lib/feedback/use-feedback';
import { ago, count } from '@/lib/format';
import { shares } from '@/lib/polls/polls';
import type { Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Five stars filled to the rating, for reading at a glance (the number beside it is the precise value). */
function StarRow({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'size-5' : 'size-3.5';
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (i <= Math.round(value) ? <StarIcon key={i} className={cn(cls, 'text-gold')} /> : <StarOutline key={i} className={cn(cls, 'text-[#bdbdbd]')} />))}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-sm text-[#525252]">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-[#7c7c7c]">{hint}</p>}
    </div>
  );
}

function SessionItem({ row, selected, onSelect }: { row: FeedbackRow; selected: boolean; onSelect: () => void }) {
  const few = row.count > 0 && row.count < FEW_RATINGS;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn('flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-colors', selected ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-[#f6f6f6]')}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{row.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-[#7c7c7c]">
            {row.average !== null ? <StarRow value={row.average} /> : null}
            {row.count ? `${count(row.count)} ${row.count === 1 ? 'rating' : 'ratings'}` : 'Not rated'}
            {few && <span className="text-[#7a5d00]">· few</span>}
          </span>
        </span>
        <span className="shrink-0 text-lg tabular-nums text-ink">{formatAverage(row.average)}</span>
      </button>
    </li>
  );
}

function Detail({ row, session }: { row: FeedbackRow; session?: Session }) {
  const detail = useSessionFeedback(row.sessionId);
  const now = useNow(60_000).getTime();
  const [stars, setStars] = useState<Stars | 'all'>('all');
  const d = detail.data;
  const counts = STARS.map((s) => d?.distribution[String(s) as '1'] ?? 0);
  const pct = shares(counts);
  const comments = (d?.comments ?? []).filter((c) => stars === 'all' || c.rating === stars);

  return (
    <section aria-labelledby="fb-title" className={cn(cardClass, 'flex flex-col')}>
      <header className="border-b border-border px-6 py-4">
        <h2 id="fb-title" className="text-lg text-ink">
          {row.title}
        </h2>
        {session && (
          <p className="text-sm text-[#7c7c7c]">
            Day {session.day} · {hm(session.startsAt)}–{hm(session.endsAt)} · {session.room}
          </p>
        )}
      </header>

      {detail.isPending ? (
        <div className="p-6">
          <Skeleton className="h-40" />
        </div>
      ) : detail.isError && !d ? (
        <p role="alert" className="p-6 text-sm text-danger">
          {detail.error.message}
        </p>
      ) : !d || d.count === 0 ? (
        <p className="px-6 py-12 text-center text-sm text-[#7c7c7c]">Nobody has rated this session yet. Delegates are asked when it ends.</p>
      ) : (
        <>
          <div className="grid gap-6 border-b border-border px-6 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              <p className="text-4xl font-medium tabular-nums text-ink">{formatAverage(d.average)}</p>
              <StarRow value={d.average} size="md" />
              <p className="mt-1 text-xs text-[#7c7c7c]">
                {count(d.count)} {d.count === 1 ? 'rating' : 'ratings'}
                {d.count < FEW_RATINGS && ' · too few to lean on'}
              </p>
            </div>
            <ul className="flex flex-col gap-1.5">
              {STARS.map((s, i) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => setStars(stars === s ? 'all' : s)}
                    aria-pressed={stars === s}
                    title={`Show ${s}-star comments`}
                    className={cn('flex w-full items-center gap-3 rounded px-1 text-sm', stars === s && 'bg-primary-soft/50')}
                  >
                    <span className="w-6 shrink-0 text-right tabular-nums text-[#525252]">{s}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#f1f1f1]">
                      <span className="block h-full rounded-full bg-gold" style={{ width: `${pct[i]}%` }} />
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-[#7c7c7c]">
                      {pct[i]}% · {count(counts[i]!)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between px-6 pt-4">
            <p className="text-sm text-ink">
              Comments {stars !== 'all' && <span className="text-[#7c7c7c]">· {stars} stars</span>}
            </p>
            {stars !== 'all' && (
              <button type="button" onClick={() => setStars('all')} className="text-xs text-primary hover:underline">
                Show all
              </button>
            )}
          </div>
          {comments.length === 0 ? (
            <p className="px-6 pt-2 pb-6 text-sm text-[#7c7c7c]">{stars === 'all' ? 'Ratings only, no written comments.' : `No written comments with ${stars} stars.`}</p>
          ) : (
            <ul className="divide-y divide-border">
              {comments.map((c, i) => (
                <li key={`${c.createdAt}-${i}`} className="px-6 py-3.5">
                  <p className="flex items-center gap-2 text-xs text-[#7c7c7c]">
                    <StarRow value={c.rating} /> {ago(c.createdAt, now).toLowerCase()}
                  </p>
                  <p className="mt-1 text-[15px] leading-6 text-ink">{c.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

export default function FeedbackPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const summary = useFeedbackSummary(edition?.id, isAdmin);
  const sessions = useSessions(edition?.id);
  const [mode, setMode] = useState<SortMode>('best');
  const [picked, setPicked] = useState<string | null>(null);
  const [showUnrated, setShowUnrated] = useState(false);

  const rows = useMemo(() => summary.data ?? [], [summary.data]);
  const { rated, unrated } = useMemo(() => rankSessions(rows, mode), [rows, mode]);
  const totals = overall(rows);
  const selected = rows.find((r) => r.sessionId === picked) ?? rated[0] ?? unrated[0] ?? null;
  const promptOff = edition?.mutedNotifications?.includes('session-feedback') ?? false;

  const exportCsv = () => {
    const csv = toCsv(rows.map((r) => ({ session: r.title, ratings: r.count, average: r.average ?? '' })));
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(edition?.shortName ?? 'event').replace(/[^\w-]+/g, '-')}-session-feedback.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!isAdmin) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <StarOutline className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">Session feedback is for organisers</p>
      </div>
    );
  }
  if (editions.isPending || summary.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (summary.isError && !summary.data) {
    return (
      <div role="alert" className="mx-auto max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">Feedback could not load.</p>
        <p className="mt-1 text-sm text-muted">{summary.error.message}</p>
        <button type="button" onClick={() => void summary.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      {promptOff && (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-[#fdf6e0] px-4 py-3 text-sm text-[#7a5d00]">
          <ExclamationTriangleIcon className="size-4 shrink-0" />
          The “How was it?” push is switched off, so delegates are not being asked to rate sessions.
          <Link href="/notifications" className="font-medium underline">
            Turn it on in Notifications
          </Link>
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Average rating" value={formatAverage(totals.average)} hint="Across every rating" />
        <Stat label="Ratings" value={count(totals.ratings)} />
        <Stat label="Sessions rated" value={`${totals.rated} of ${totals.sessions}`} />
        <div className="flex flex-col justify-between rounded-lg border border-border bg-surface px-5 py-4">
          <p className="text-sm text-[#525252]">All sessions</p>
          <button type="button" onClick={exportCsv} disabled={!rows.length} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9 self-start' })}>
            <ArrowDownTrayIcon className="size-4" />
            Download CSV
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className={cn(cardClass, 'p-10 text-center text-sm text-[#7c7c7c]')}>No sessions in this event yet.</div>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <section aria-label="Sessions by rating" className={cardClass}>
            <div className="border-b border-border p-3">
              <Select label="Order" value={mode} options={(Object.keys(SORT_LABEL) as SortMode[]).map((m) => ({ value: m, label: SORT_LABEL[m] }))} onChange={setMode} />
            </div>
            <ul className="max-h-[calc(100dvh-22rem)] divide-y divide-border overflow-y-auto scrollbar-thin">
              {rated.map((r) => (
                <SessionItem key={r.sessionId} row={r} selected={r.sessionId === selected?.sessionId} onSelect={() => setPicked(r.sessionId)} />
              ))}
              {showUnrated && unrated.map((r) => <SessionItem key={r.sessionId} row={r} selected={r.sessionId === selected?.sessionId} onSelect={() => setPicked(r.sessionId)} />)}
              {rated.length === 0 && !showUnrated && <li className="px-4 py-6 text-center text-sm text-[#7c7c7c]">No ratings yet.</li>}
            </ul>
            {unrated.length > 0 && (
              <div className="border-t border-border px-4 py-2">
                <button type="button" onClick={() => setShowUnrated((v) => !v)} className="text-xs text-[#525252] hover:text-ink">
                  {showUnrated ? 'Hide' : 'Show'} {unrated.length} not rated
                </button>
              </div>
            )}
          </section>

          {selected && <Detail key={selected.sessionId} row={selected} session={sessions.data?.find((s) => s.id === selected.sessionId)} />}
        </div>
      )}
    </div>
  );
}
