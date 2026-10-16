'use client';

import { ArrowDownTrayIcon, CalendarDaysIcon, ChatBubbleBottomCenterTextIcon, ExclamationTriangleIcon, StarIcon as StarOutline } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { FigureCard } from '@/components/dashboard/stat-card';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Panel } from '@/components/ui/panel';
import { Reveal } from '@/components/ui/reveal';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { runsEvents, useSession } from '@/lib/auth/session';
import { toCsv } from '@/lib/discussions/discussions';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { FEW_RATINGS, formatAverage, overall, rankSessions, SORT_LABEL, STARS, type FeedbackRow, type SortMode, type Stars } from '@/lib/feedback/feedback';
import { useFeedbackSummary, useSessionFeedback } from '@/lib/feedback/use-feedback';
import { ago, count } from '@/lib/format';
import { shares } from '@/lib/polls/polls';
import type { Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { useNow } from '@/lib/use-now';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Five stars filled to the rating, for reading at a glance (the number beside it is the precise value). */
function StarRow({ value, size = 'sm' }: { value: number; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'size-5' : 'size-3.5';
  return (
    <span className="inline-flex" aria-hidden>
      {[1, 2, 3, 4, 5].map((i) => (i <= Math.round(value) ? <StarIcon key={i} className={cn(cls, 'text-gold')} /> : <StarOutline key={i} className={cn(cls, 'text-placeholder')} />))}
    </span>
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
        className={cn('flex w-full items-center gap-3 px-4 py-3 text-left transition-colors', selected ? 'bg-primary-soft' : 'hover:bg-surface-soft')}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-ink">{row.title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-hint">
            {row.average !== null ? <StarRow value={row.average} /> : null}
            {row.count ? `${count(row.count)} ${row.count === 1 ? 'rating' : 'ratings'}` : 'Not rated'}
            {few && <span className="text-warning">· few</span>}
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
    <Panel
      title={row.title}
      description={
        session && (
          <>
            Day {session.day} · {hm(session.startsAt)}–{hm(session.endsAt)} · {session.room}
          </>
        )
      }
      className="flex flex-col"
    >
      {detail.isPending ? (
        <LoadingRows rows={3} />
      ) : detail.isError && !d ? (
        <ErrorState title="This session’s feedback could not load" error={detail.error} onRetry={() => void detail.refetch()} />
      ) : !d || d.count === 0 ? (
        <EmptyState icon={StarOutline} title="No ratings yet" body="Delegates are asked to rate the session when it ends." />
      ) : (
        <>
          <div className="grid gap-6 border-b border-border px-6 py-5 sm:grid-cols-[10rem_minmax(0,1fr)]">
            <div>
              <p className="text-4xl font-medium tabular-nums text-ink">{formatAverage(d.average)}</p>
              <StarRow value={d.average} size="md" />
              <p className="mt-1 text-xs text-hint">
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
                    <span className="w-6 shrink-0 text-right tabular-nums text-ink-soft">{s}★</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-soft">
                      <span className="block h-full rounded-full bg-gold" style={{ width: `${pct[i]}%` }} />
                    </span>
                    <span className="w-16 shrink-0 text-right tabular-nums text-hint">
                      {pct[i]}% · {count(counts[i]!)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between px-6 pt-4">
            <p className="text-sm text-ink">Comments {stars !== 'all' && <span className="text-hint">· {stars} stars</span>}</p>
            {stars !== 'all' && (
              <button type="button" onClick={() => setStars('all')} className="text-xs text-primary hover:underline">
                Show all
              </button>
            )}
          </div>
          {comments.length === 0 ? (
            <p className="px-6 pt-2 pb-6 text-sm text-hint">{stars === 'all' ? 'Ratings only, no written comments.' : `No written comments with ${stars} stars.`}</p>
          ) : (
            <ul className="divide-y divide-border">
              {comments.map((c, i) => (
                <li key={`${c.createdAt}-${i}`} className="px-6 py-3.5">
                  <p className="flex items-center gap-2 text-xs text-hint">
                    <StarRow value={c.rating} /> {ago(c.createdAt, now).toLowerCase()}
                  </p>
                  <p className="mt-1 text-[0.9375rem] leading-6 text-ink">{c.comment}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
}

export default function FeedbackPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const working = useWorkingEdition();
  const editions = working.editions;
  const edition = working.edition;
  const summary = useFeedbackSummary(edition?.id, isAdmin);
  const sessions = useSessions(edition?.id);
  const [mode, setMode] = useUrlParam<SortMode>('order', 'best', Object.keys(SORT_LABEL) as SortMode[]);
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
    return <EmptyState framed icon={StarOutline} title="Session feedback is for organisers" />;
  }
  if (editions.isPending || summary.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (summary.isError && !summary.data) {
    return <ErrorState framed title="Feedback could not load" error={summary.error} onRetry={() => void summary.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-5">
      {promptOff && (
        <p role="alert" className="flex flex-wrap items-center gap-2 rounded-lg bg-warning-soft px-4 py-3 text-sm text-warning">
          <ExclamationTriangleIcon className="size-4 shrink-0" />
          The “How was it?” push is switched off, so delegates are not being asked to rate sessions.
          <Link href="/notifications" className="font-medium underline">
            Turn it on in Notifications
          </Link>
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-3">
        <FigureCard label="Average rating" icon={StarOutline} value={formatAverage(totals.average)} note="Across every rating" />
        <FigureCard label="Ratings" icon={ChatBubbleBottomCenterTextIcon} value={count(totals.ratings)} />
        <FigureCard label="Sessions rated" icon={CalendarDaysIcon} value={`${totals.rated} of ${totals.sessions}`} />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          framed
          icon={CalendarDaysIcon}
          title="No sessions in this event yet"
          body="Ratings appear here once the programme has sessions."
          action={
            <Link href="/programme" className={buttonClass()}>
              Go to Programme
            </Link>
          }
        />
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
          <Panel
            title="Sessions"
            count={rows.length}
            actions={
              <button type="button" onClick={exportCsv} title="Every session's average and number of ratings as a spreadsheet" className={buttonClass({ style: 'outline', color: 'gray' })}>
                <ArrowDownTrayIcon className="size-4" />
                Download CSV
              </button>
            }
            toolbar={<Select label="Order" value={mode} options={(Object.keys(SORT_LABEL) as SortMode[]).map((m) => ({ value: m, label: SORT_LABEL[m] }))} onChange={setMode} />}
            footer={
              unrated.length > 0 && (
                <button type="button" onClick={() => setShowUnrated((v) => !v)} className="text-xs text-ink-soft hover:text-ink">
                  {showUnrated ? 'Hide' : 'Show'} {unrated.length} not rated
                </button>
              )
            }
          >
            <div className="max-h-[calc(100dvh-22rem)] overflow-y-auto scrollbar-thin">
              <ul className="divide-y divide-border">
                {rated.map((r) => (
                  <SessionItem key={r.sessionId} row={r} selected={r.sessionId === selected?.sessionId} onSelect={() => setPicked(r.sessionId)} />
                ))}
                {rated.length === 0 && !showUnrated && <li className="px-4 py-6 text-center text-sm text-hint">No ratings yet.</li>}
              </ul>
              {/* sessions not rated ease open under the rest */}
              <Reveal open={showUnrated}>
                <ul className={cn('divide-y divide-border', rated.length > 0 && 'border-t border-border')}>
                  {unrated.map((r) => (
                    <SessionItem key={r.sessionId} row={r} selected={r.sessionId === selected?.sessionId} onSelect={() => setPicked(r.sessionId)} />
                  ))}
                </ul>
              </Reveal>
            </div>
          </Panel>

          {selected && <Detail key={selected.sessionId} row={selected} session={sessions.data?.find((s) => s.id === selected.sessionId)} />}
        </div>
      )}
    </div>
  );
}
