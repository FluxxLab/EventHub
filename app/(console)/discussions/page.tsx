'use client';

import { ArrowDownTrayIcon, ChatBubbleLeftRightIcon, CheckIcon, EyeIcon, EyeSlashIcon, FlagIcon, HandThumbDownIcon, HandThumbUpIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { runsEvents, useSession } from '@/lib/auth/session';
import { commentState, sortThreads, threadMatches, type ModComment, type Thread } from '@/lib/discussions/discussions';
import { useComments, useDiscussionActions, useThreads, type CommentView } from '@/lib/discussions/use-discussions';
import { ago, count } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const REVIEW = '__review__';

function ListButton({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      className={cn('flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors', selected ? 'bg-primary-soft' : 'hover:bg-surface-soft')}
    >
      {children}
    </div>
  );
}

function ThreadItem({ thread, selected, now, onSelect }: { thread: Thread; selected: boolean; now: number; onSelect: () => void }) {
  return (
    <li>
      <ListButton selected={selected} onSelect={onSelect}>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-ink" title={thread.title}>
            {thread.title}
          </p>
          <p className="mt-0.5 truncate text-xs text-hint">
            {thread.comments ? `${count(thread.comments)} ${thread.comments === 1 ? 'comment' : 'comments'}` : 'No comments'}
            {thread.lastAt && ` · ${ago(thread.lastAt, now).toLowerCase()}`}
          </p>
        </div>
        {thread.flagged > 0 && (
          <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-xs tabular-nums text-on-primary" title={`${thread.flagged} reported`}>
            {thread.flagged}
          </span>
        )}
      </ListButton>
    </li>
  );
}

function CommentRow({
  comment,
  now,
  showSession,
  busy,
  onHide,
  onKeep,
  onUnhide,
}: {
  comment: ModComment;
  now: number;
  showSession: boolean;
  busy: boolean;
  onHide: () => void;
  onKeep: () => void;
  onUnhide: () => void;
}) {
  const state = commentState(comment);
  return (
    <li className={cn('px-6 py-4', state === 'reported' && 'bg-danger-soft/30')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="font-medium text-ink">{comment.authorName}</span>
            {comment.authorOrganisation && <span className="text-xs text-hint">{comment.authorOrganisation}</span>}
            <span className="text-xs text-hint">· {ago(comment.createdAt, now).toLowerCase()}</span>
            {state === 'reported' && (
              <Tag tone="danger">
                <FlagIcon className="size-3" /> Reported
              </Tag>
            )}
            {state === 'hidden' && (
              <Tag>
                <EyeSlashIcon className="size-3" /> Hidden {ago(comment.hiddenAt!, now).toLowerCase()}
              </Tag>
            )}
          </p>
          {showSession && <p className="mt-0.5 truncate text-xs text-primary">{comment.sessionTitle}</p>}
          <p className={cn('mt-1.5 text-[0.9375rem] leading-6 whitespace-pre-line', state === 'hidden' ? 'text-hint line-through decoration-border-strong' : 'text-ink')}>{comment.body}</p>
          <p className="mt-2 flex items-center gap-4 text-xs tabular-nums text-hint">
            <span className="flex items-center gap-1" aria-label={`${comment.likes} likes`}>
              <HandThumbUpIcon className="size-3.5" /> {count(comment.likes)}
            </span>
            <span className="flex items-center gap-1" aria-label={`${comment.dislikes} dislikes`}>
              <HandThumbDownIcon className="size-3.5" /> {count(comment.dislikes)}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {state === 'reported' && (
            <button type="button" onClick={onKeep} disabled={busy} title="The comment stays; the report is dismissed" className={buttonClass({ style: 'outline', color: 'gray', className: 'h-8' })}>
              <CheckIcon className="size-4" />
              Keep
            </button>
          )}
          {state === 'hidden' ? (
            <button type="button" onClick={onUnhide} disabled={busy} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
              <EyeIcon className="size-4" />
              Unhide
            </button>
          ) : (
            <button
              type="button"
              onClick={onHide}
              disabled={busy}
              className={buttonClass({ style: state === 'reported' ? 'outline' : 'borderless', color: state === 'reported' ? 'danger' : 'gray', className: 'h-8' })}
            >
              <EyeSlashIcon className="size-4" />
              Hide
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

const FILTERS: { key: CommentView['filter']; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'reported', label: 'Reported' },
  { key: 'hidden', label: 'Hidden' },
];
const FILTER_KEYS = FILTERS.map((f) => f.key);

/** A thread's comments, or the review queue (every reported comment still showing). */
function Comments({ thread, review, reviewCount, now }: { thread: Thread | null; review: boolean; reviewCount: number; now: number }) {
  const [filter, setFilter] = useUrlParam<CommentView['filter']>('show', 'all', FILTER_KEYS);
  const view: CommentView = review ? { sessionId: null, filter: 'reported' } : { sessionId: thread!.sessionId, filter };
  const comments = useComments(view, true);
  const { hide, unhide, keep, exportThread } = useDiscussionActions();
  const failed = (title: string) => (e: Error) => toast.push({ title, body: e.message, leading: { kind: 'icon', icon: FlagIcon, tone: 'danger' } });
  const toast = useToast();
  const [hiding, setHiding] = useState<ModComment | null>(null);
  const list = useMemo(() => comments.data?.pages.flat() ?? [], [comments.data]);

  const title = review ? 'Needs review' : thread!.title;
  const subtitle = review
    ? reviewCount
      ? `${reviewCount} reported ${reviewCount === 1 ? 'comment' : 'comments'} still showing, across all sessions.`
      : 'Delegates can report a comment from the app.'
    : `${thread!.room} · ${count(thread!.comments)} ${thread!.comments === 1 ? 'comment' : 'comments'}`;

  return (
    <Panel
      className="flex flex-col"
      title={title}
      description={subtitle}
      actions={
        !review && thread!.comments > 0 ? (
          <button
            type="button"
            disabled={exportThread.isPending}
            onClick={() =>
              exportThread.mutate(
                { sessionId: thread!.sessionId, title: thread!.title },
                { onError: (e) => toast.push({ title: 'Export failed', body: e.message, leading: { kind: 'icon', icon: ArrowDownTrayIcon, tone: 'danger' } }) },
              )
            }
            className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9' })}
          >
            <ArrowDownTrayIcon className="size-4" />
            {exportThread.isPending ? 'Exporting…' : 'Export CSV'}
          </button>
        ) : undefined
      }
      toolbar={
        !review && thread!.comments > 0 ? (
          <SegmentedTabs
            label="Show"
            options={FILTERS.map((f) => ({ value: f.key, label: f.label, count: { all: thread!.comments, reported: thread!.flagged, hidden: thread!.hidden }[f.key] }))}
            value={filter}
            onChange={setFilter}
          />
        ) : undefined
      }
    >
      {comments.isPending ? (
        <LoadingRows rows={3} />
      ) : comments.isError && !comments.data ? (
        <ErrorState title="Comments could not load" error={comments.error} onRetry={() => void comments.refetch()} />
      ) : list.length === 0 ? (
        review ? (
          <EmptyState icon={FlagIcon} title="Nothing needs review" />
        ) : filter === 'all' ? (
          <EmptyState icon={ChatBubbleLeftRightIcon} title="No comments in this session yet" />
        ) : (
          <EmptyState
            icon={ChatBubbleLeftRightIcon}
            title={`No ${filter} comments here`}
            action={
              <button type="button" onClick={() => setFilter('all')} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Show all comments
              </button>
            }
          />
        )
      ) : (
        <>
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <CommentRow
                key={c.id}
                comment={c}
                now={now}
                showSession={review}
                busy={hide.isPending || unhide.isPending || keep.isPending}
                onHide={() => setHiding(c)}
                onKeep={() =>
                  keep.mutate(
                    { id: c.id },
                    {
                      onSuccess: () => toast.push({ title: 'Kept', body: `${c.authorName}’s comment stays; the report is dismissed.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } }),
                      onError: failed('Report not dismissed'),
                    },
                  )
                }
                onUnhide={() => unhide.mutate({ id: c.id }, { onError: failed('Not shown again') })}
              />
            ))}
          </ul>
          {comments.hasNextPage && (
            <div className="border-t border-border px-6 py-3 text-center">
              <button type="button" onClick={() => void comments.fetchNextPage()} disabled={comments.isFetchingNextPage} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                {comments.isFetchingNextPage ? 'Loading…' : 'Load older comments'}
              </button>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!hiding}
        title={`Hide ${hiding?.authorName ?? 'this'}’s comment?`}
        confirmLabel="Hide comment"
        pendingLabel="Hiding…"
        pending={hide.isPending}
        tone="danger"
        onCancel={() => setHiding(null)}
        onConfirm={() =>
          hiding &&
          hide.mutate(
            { id: hiding.id },
            {
              onSuccess: () => setHiding(null),
              onError: (e) => toast.push({ title: 'Not hidden', body: e.message, leading: { kind: 'icon', icon: EyeSlashIcon, tone: 'danger' } }),
            },
          )
        }
      >
        It disappears from the app for everyone, straight away. It stays in the records and in exports, and you can unhide it here.
      </ConfirmDialog>
    </Panel>
  );
}

export default function DiscussionsPage() {
  const session = useSession();
  const isAdmin = session.status === 'signed-in' && runsEvents(session.user.tier);
  const threads = useThreads(isAdmin);
  const now = useNow(30_000).getTime();
  const [pickedParam, setPicked] = useUrlParam<string>('thread', '');
  const picked = pickedParam || null;
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);

  const all = useMemo(() => sortThreads(threads.data ?? []), [threads.data]);
  const reviewCount = all.reduce((n, t) => n + t.flagged, 0);
  const matching = all.filter((t) => threadMatches(t, search));
  const active = matching.filter((t) => t.comments > 0);
  const silent = matching.filter((t) => t.comments === 0);
  // Open on the review queue when something is reported, else the busiest thread.
  const selectedId = picked ?? (reviewCount > 0 ? REVIEW : (active[0]?.sessionId ?? REVIEW));
  const review = selectedId === REVIEW;
  const thread = review ? null : (all.find((t) => t.sessionId === selectedId) ?? null);

  if (!isAdmin) {
    return <EmptyState framed icon={ChatBubbleLeftRightIcon} title="Discussions are moderated by organisers" body="Ask an organiser if a comment needs attention." />;
  }
  if (threads.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (threads.isError && !threads.data) {
    return <ErrorState framed title="Discussions could not load" error={threads.error} onRetry={() => void threads.refetch()} />;
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <Panel title="Threads" count={all.length}>
        <ul className="border-b border-border">
          <li>
            <ListButton selected={review} onSelect={() => setPicked(REVIEW)}>
              <FlagIcon className={cn('size-5 shrink-0', reviewCount ? 'text-danger' : 'text-hint')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Needs review</p>
                <p className="text-xs text-hint">Reported comments, all sessions</p>
              </div>
              {reviewCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1.5 text-xs tabular-nums text-on-primary">{reviewCount}</span>}
            </ListButton>
          </li>
        </ul>
        <div className="border-b border-border p-3">
          <TextInput icon={MagnifyingGlassIcon} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a session" aria-label="Find a session" />
        </div>
        <ul className="max-h-[calc(100dvh-22rem)] divide-y divide-border overflow-y-auto scrollbar-thin">
          {active.map((t) => (
            <ThreadItem key={t.sessionId} thread={t} selected={t.sessionId === selectedId} now={now} onSelect={() => setPicked(t.sessionId)} />
          ))}
          {showEmpty && silent.map((t) => <ThreadItem key={t.sessionId} thread={t} selected={t.sessionId === selectedId} now={now} onSelect={() => setPicked(t.sessionId)} />)}
          {active.length === 0 && !showEmpty && (
            <li>
              {search ? (
                <EmptyState
                  className="py-8"
                  title="No session matches"
                  action={
                    <button type="button" onClick={() => setSearch('')} className={buttonClass({ style: 'outline', color: 'gray' })}>
                      Clear search
                    </button>
                  }
                />
              ) : (
                <EmptyState className="py-8" title="No comments in any session yet" />
              )}
            </li>
          )}
        </ul>
        {silent.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <button type="button" onClick={() => setShowEmpty((v) => !v)} className="text-xs text-ink-soft hover:text-ink">
              {showEmpty ? 'Hide' : 'Show'} {silent.length} {silent.length === 1 ? 'session' : 'sessions'} without comments
            </button>
          </div>
        )}
      </Panel>

      {/* Keyed so each thread starts on its own filter and first page. */}
      <Comments key={selectedId} thread={thread} review={review} reviewCount={reviewCount} now={now} />
    </div>
  );
}
