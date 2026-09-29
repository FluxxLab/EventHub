'use client';

import { ArrowDownTrayIcon, ChatBubbleLeftRightIcon, CheckIcon, EyeIcon, EyeSlashIcon, FlagIcon, HandThumbDownIcon, HandThumbUpIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { runsEvents, useSession } from '@/lib/auth/session';
import { commentState, sortThreads, threadMatches, type ModComment, type Thread } from '@/lib/discussions/discussions';
import { useComments, useDiscussionActions, useThreads, type CommentView } from '@/lib/discussions/use-discussions';
import { ago, count } from '@/lib/format';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const REVIEW = '__review__';

function ListButton({ selected, onSelect, children }: { selected: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect())}
      className={cn('flex cursor-pointer items-center gap-3 border-l-2 px-4 py-3 transition-colors', selected ? 'border-primary bg-primary-soft/50' : 'border-transparent hover:bg-[#f6f6f6]')}
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
          <p className="mt-0.5 truncate text-xs text-[#7c7c7c]">
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
            {comment.authorOrganisation && <span className="text-xs text-[#7c7c7c]">{comment.authorOrganisation}</span>}
            <span className="text-xs text-[#7c7c7c]">· {ago(comment.createdAt, now).toLowerCase()}</span>
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
          <p className={cn('mt-1.5 text-[15px] leading-6 whitespace-pre-line', state === 'hidden' ? 'text-[#7c7c7c] line-through decoration-[#bdbdbd]' : 'text-ink')}>{comment.body}</p>
          <p className="mt-2 flex items-center gap-4 text-xs tabular-nums text-[#7c7c7c]">
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

function Filters({ value, counts, onChange }: { value: CommentView['filter']; counts: Record<CommentView['filter'], number>; onChange: (v: CommentView['filter']) => void }) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const i = FILTERS.findIndex((f) => f.key === value);
    onChange(FILTERS[(i + (event.key === 'ArrowRight' ? 1 : FILTERS.length - 1)) % FILTERS.length]!.key);
  };
  return (
    <div role="tablist" aria-label="Show" onKeyDown={onKey} className="flex w-fit gap-1 rounded-lg bg-[#f1f1f1] p-1">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          role="tab"
          aria-selected={value === f.key}
          tabIndex={value === f.key ? 0 : -1}
          onClick={() => onChange(f.key)}
          className={cn('flex items-center gap-1.5 rounded-md px-3 py-1 text-sm', value === f.key ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink')}
        >
          {f.label}
          <span className="text-xs tabular-nums text-[#7c7c7c]">{counts[f.key]}</span>
        </button>
      ))}
    </div>
  );
}

/** A thread's comments, or the review queue (every reported comment still showing). */
function Comments({ thread, review, reviewCount, now }: { thread: Thread | null; review: boolean; reviewCount: number; now: number }) {
  const [filter, setFilter] = useState<CommentView['filter']>('all');
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
      : 'Nothing reported. Delegates can report a comment from the app.'
    : `${thread!.room} · ${count(thread!.comments)} ${thread!.comments === 1 ? 'comment' : 'comments'}`;

  return (
    <section aria-labelledby="thread-title" className={cn(cardClass, 'flex flex-col')}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 id="thread-title" className="text-lg text-ink">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-[#7c7c7c]">{subtitle}</p>
        </div>
        {!review && thread!.comments > 0 && (
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
        )}
      </header>

      {!review && thread!.comments > 0 && (
        <div className="border-b border-border px-6 py-3">
          <Filters value={filter} counts={{ all: thread!.comments, reported: thread!.flagged, hidden: thread!.hidden }} onChange={setFilter} />
        </div>
      )}

      {comments.isPending ? (
        <div className="flex flex-col gap-3 p-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : comments.isError && !comments.data ? (
        <div role="alert" className="p-10 text-center">
          <p className="font-medium text-ink">Comments could not load.</p>
          <p className="mt-1 text-sm text-muted">{comments.error.message}</p>
        </div>
      ) : list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-6 py-12 text-center text-sm text-[#7c7c7c]">
          <ChatBubbleLeftRightIcon className="size-8" />
          {review ? 'Nothing needs review.' : filter === 'all' ? 'No comments in this session yet.' : `No ${filter} comments here.`}
        </div>
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
    </section>
  );
}

export default function DiscussionsPage() {
  const session = useSession();
  const isAdmin = session.status === 'signed-in' && runsEvents(session.user.tier);
  const threads = useThreads(isAdmin);
  const now = useNow(30_000).getTime();
  const [picked, setPicked] = useState<string | null>(null);
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
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <ChatBubbleLeftRightIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">Discussions are moderated by organisers</p>
        <p className="mt-1 text-sm text-[#7c7c7c]">Ask an organiser if a comment needs attention.</p>
      </div>
    );
  }
  if (threads.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (threads.isError && !threads.data) {
    return (
      <div role="alert" className="mx-auto max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">Discussions could not load.</p>
        <p className="mt-1 text-sm text-muted">{threads.error.message}</p>
        <button type="button" onClick={() => void threads.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl items-start gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
      <section aria-label="Threads" className={cardClass}>
        <ul className="border-b border-border">
          <li>
            <ListButton selected={review} onSelect={() => setPicked(REVIEW)}>
              <FlagIcon className={cn('size-5 shrink-0', reviewCount ? 'text-danger' : 'text-[#7c7c7c]')} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Needs review</p>
                <p className="text-xs text-[#7c7c7c]">Reported comments, all sessions</p>
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
          {active.length === 0 && !showEmpty && <li className="px-4 py-6 text-center text-sm text-[#7c7c7c]">{search ? 'No session matches.' : 'No comments in any session yet.'}</li>}
        </ul>
        {silent.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <button type="button" onClick={() => setShowEmpty((v) => !v)} className="text-xs text-[#525252] hover:text-ink">
              {showEmpty ? 'Hide' : 'Show'} {silent.length} {silent.length === 1 ? 'session' : 'sessions'} without comments
            </button>
          </div>
        )}
      </section>

      {/* Keyed so each thread starts on its own filter and first page. */}
      <Comments key={selectedId} thread={thread} review={review} reviewCount={reviewCount} now={now} />
    </div>
  );
}
