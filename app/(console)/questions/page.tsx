'use client';

import {
  ArrowUturnLeftIcon,
  ChatBubbleLeftRightIcon,
  CheckIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState, type KeyboardEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { useEditions } from '@/lib/events/use-editions';
import { ago, count } from '@/lib/format';
import type { Session } from '@/lib/programme/programme';
import { useSessions, useSessionsRealtime } from '@/lib/programme/use-sessions';
import { isNew, matches, tally, type Question, type QuestionStatus } from '@/lib/questions/questions';
import { useQuestionActions, useQuestions } from '@/lib/questions/use-questions';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The session a moderator most likely wants: the live one, else the next to start, else the first. */
function defaultSession(sessions: Session[], now: number): Session | undefined {
  return (
    sessions.find((s) => s.status === 'live') ??
    sessions.find((s) => s.status === 'scheduled' && Date.parse(s.endsAt) > now) ??
    sessions[0]
  );
}

function sessionLabel(s: Session): string {
  const when = s.status === 'live' ? 'Live now' : `Day ${s.day} · ${hm(s.startsAt)}`;
  return `${when} · ${s.room} · ${s.title}`;
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-sm text-[#525252]">{label}</p>
      <p className="mt-1 text-2xl font-medium tabular-nums text-ink">{count(value)}</p>
      {hint && <p className="mt-0.5 text-xs text-[#7c7c7c]">{hint}</p>}
    </div>
  );
}

function ConnectionDot() {
  const connection = useRealtimeStatus();
  const label = { live: 'Live: questions appear as they are asked', connecting: 'Connecting…', offline: 'Offline: reload for new questions', demo: 'Demo data' }[connection];
  return (
    <p className="flex items-center gap-2 text-xs text-[#7c7c7c]" aria-live="polite">
      <span
        className={cn(
          'size-2 rounded-full',
          connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder',
        )}
        aria-hidden
      />
      {label}
    </p>
  );
}

function Votes({ value, large = false }: { value: number; large?: boolean }) {
  return (
    <div
      className={cn('flex shrink-0 flex-col items-center justify-center rounded-lg bg-[#f6f6f6] text-center', large ? 'h-20 w-18' : 'h-14 w-14')}
      aria-label={`${value} ${value === 1 ? 'upvote' : 'upvotes'}`}
    >
      <ChevronUpIcon className={cn('text-[#7c7c7c]', large ? 'size-5' : 'size-4')} aria-hidden />
      <span className={cn('font-medium tabular-nums text-ink', large ? 'text-2xl' : 'text-base')}>{value}</span>
    </div>
  );
}

function Asker({ question, now }: { question: Question; now: number }) {
  return (
    <p className="text-xs text-[#7c7c7c]">
      {question.author.name}
      {question.author.organisation && <> · {question.author.organisation}</>} · {ago(question.createdAt, now)}
      {question.status === 'answered' && question.answeredAt && <> · answered {ago(question.answeredAt, now)}</>}
    </p>
  );
}

type Act = (question: Question, status: QuestionStatus) => void;

/** The top open question, large, for the moderator to read out. */
function NextUp({ question, now, onStatus }: { question: Question; now: number; onStatus: Act }) {
  return (
    <section aria-labelledby="next-up" className="rounded-2xl border border-primary/30 bg-primary-soft/40 p-5 md:p-6">
      <p id="next-up" className="text-xs font-medium tracking-wide text-primary uppercase">
        Next up
      </p>
      <div className="mt-3 flex gap-4">
        <Votes value={question.upvotes} large />
        <div className="min-w-0 flex-1">
          <p className="text-xl leading-8 text-ink">{question.text}</p>
          <div className="mt-1">
            <Asker question={question} now={now} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button type="button" onClick={() => onStatus(question, 'dismissed')} className={buttonClass({ style: 'outline', color: 'gray' })}>
          <NoSymbolIcon className="size-4" />
          Dismiss
        </button>
        <button type="button" onClick={() => onStatus(question, 'answered')} className={buttonClass({ color: 'green' })}>
          <CheckIcon className="size-4" />
          Answered
        </button>
      </div>
    </section>
  );
}

function QuestionRow({ question, now, onStatus, onDelete }: { question: Question; now: number; onStatus: Act; onDelete: (q: Question) => void }) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <Votes value={question.upvotes} />
      {/* Actions sit beside the question on wider screens, below it on a phone. */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-6 text-ink">
          {question.text}
          {isNew(question, now) && question.status === 'open' && (
            <Tag tone="primary" className="ml-2 align-middle">
              New
            </Tag>
          )}
        </p>
        <div className="mt-0.5">
          <Asker question={question} now={now} />
        </div>
      </div>
      <div className="flex shrink-0 items-start gap-1">
        {question.status === 'open' ? (
          <>
            <button type="button" onClick={() => onStatus(question, 'answered')} className={buttonClass({ style: 'soft', color: 'green', className: 'h-8' })}>
              <CheckIcon className="size-4" />
              Answered
            </button>
            <button type="button" onClick={() => onStatus(question, 'dismissed')} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
              Dismiss
            </button>
          </>
        ) : (
          <button type="button" onClick={() => onStatus(question, 'open')} className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}>
            <ArrowUturnLeftIcon className="size-4" />
            Reopen
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(question)}
          aria-label={`Delete “${question.text.slice(0, 40)}”`}
          title="Delete"
          className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
      </div>
    </li>
  );
}

const TABS: { key: QuestionStatus; label: string; empty: string }[] = [
  { key: 'open', label: 'Open', empty: 'No open questions. New ones appear here as delegates ask them in the app.' },
  { key: 'answered', label: 'Answered', empty: 'Nothing answered yet.' },
  { key: 'dismissed', label: 'Dismissed', empty: 'Nothing dismissed. Dismissed questions stay visible to the delegate who asked.' },
];

function Tabs({ tab, counts, onChange }: { tab: QuestionStatus; counts: Record<QuestionStatus, number>; onChange: (tab: QuestionStatus) => void }) {
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.key;
    onChange(next);
    document.getElementById(`questions-tab-${next}`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Question status" onKeyDown={onKey} className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
      {TABS.map((t) => {
        const selected = t.key === tab;
        return (
          <button
            key={t.key}
            id={`questions-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="questions-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', selected ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink')}
          >
            {t.label}
            <span className="text-xs tabular-nums text-[#7c7c7c]">{counts[t.key]}</span>
          </button>
        );
      })}
    </div>
  );
}

function Queue({ session }: { session: Session }) {
  const questions = useQuestions(session.id);
  const { setStatus, remove } = useQuestionActions(session.id);
  const toast = useToast();
  const now = useNow(15_000).getTime();
  const [tab, setTab] = useState<QuestionStatus>('open');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<Question | null>(null);

  const all = useMemo(() => questions.data ?? [], [questions.data]);
  const totals = tally(all);
  const shown = all.filter((q) => q.status === tab && matches(q, search));
  const [top, ...rest] = shown;
  const featured = tab === 'open' && !search.trim() && top ? top : null;
  const list = featured ? rest : shown;

  const onStatus: Act = (question, status) =>
    setStatus.mutate(
      { id: question.id, status },
      {
        onSuccess: () =>
          toast.push({
            title: status === 'answered' ? 'Marked answered' : status === 'dismissed' ? 'Dismissed' : 'Reopened',
            body: `“${question.text.length > 70 ? `${question.text.slice(0, 70)}…` : question.text}”`,
            leading: { kind: 'icon', icon: status === 'dismissed' ? NoSymbolIcon : status === 'answered' ? CheckIcon : ArrowUturnLeftIcon, tone: status === 'answered' ? 'success' : 'ink' },
            actions: status === 'open' ? undefined : [{ label: 'Undo', onClick: () => setStatus.mutate({ id: question.id, status: question.status }) }],
          }),
        onError: (e) => toast.push({ title: 'Not changed', body: e.message, leading: { kind: 'icon', icon: NoSymbolIcon, tone: 'danger' } }),
      },
    );

  if (questions.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  if (questions.isError && !questions.data) {
    return (
      <div role="alert" className="rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">Questions could not load.</p>
        <p className="mt-1 text-sm text-muted">{questions.error.message}</p>
        <button type="button" onClick={() => void questions.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label="Open" value={totals.open} hint={totals.open ? 'Waiting for the panel' : undefined} />
        <Stat label="Answered" value={totals.answered} />
        <Stat label="Upvotes" value={totals.upvotes} />
        <Stat label="People asking" value={totals.askers} />
      </div>

      {featured && <NextUp question={featured} now={now} onStatus={onStatus} />}

      <section aria-label="Questions" className="overflow-hidden rounded-2xl border border-border bg-surface">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
          <Tabs tab={tab} counts={totals} onChange={setTab} />
          <TextInput
            icon={MagnifyingGlassIcon}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by words or asker"
            aria-label="Filter questions"
            className="w-full sm:w-72"
          />
        </header>
        <div id="questions-panel" role="tabpanel" aria-labelledby={`questions-tab-${tab}`}>
          {list.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <ChatBubbleLeftRightIcon className="size-8 text-[#7c7c7c]" />
              <p className="max-w-sm text-sm text-[#7c7c7c]">
                {search.trim() ? `No ${tab} questions match “${search.trim()}”.` : featured ? 'Only the question above is open.' : TABS.find((t) => t.key === tab)!.empty}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((q) => (
                <QuestionRow key={q.id} question={q} now={now} onStatus={onStatus} onDelete={setDeleting} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this question?"
        confirmLabel="Delete question"
        pendingLabel="Deleting…"
        pending={remove.isPending}
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate(
            { id: deleting.id },
            {
              onSuccess: () => setDeleting(null),
              onError: (e) => toast.push({ title: 'Not deleted', body: e.message, leading: { kind: 'icon', icon: TrashIcon, tone: 'danger' } }),
            },
          )
        }
      >
        “{deleting?.text}” is removed for everyone, with its upvotes, including the delegate who asked. To take it off the queue but keep the
        record, dismiss it instead.
      </ConfirmDialog>
    </div>
  );
}

export default function QuestionsPage() {
  useSessionsRealtime();
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const sessions = useSessions(edition?.id);
  const now = useNow(60_000).getTime();
  const [picked, setPicked] = useState<string | null>(null);

  // Live sessions first, then the programme in order; breaks have no questions.
  const options = useMemo(
    () =>
      (sessions.data ?? [])
        .filter((s) => s.type !== 'break')
        .sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [sessions.data],
  );
  const session = options.find((s) => s.id === picked) ?? defaultSession(options, now);

  if (editions.isPending || sessions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (!session) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-2xl border border-border bg-surface p-10 text-center">
        <ChatBubbleLeftRightIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <h1 className="mt-2 text-lg font-medium text-ink">No sessions yet</h1>
        <p className="mt-1 text-sm text-muted">Questions belong to a session. Add sessions on the Programme page.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <h1 className="sr-only">Questions</h1>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-xl">
          <Select label="Session" value={session.id} options={options.map((s) => ({ value: s.id, label: sessionLabel(s) }))} onChange={setPicked} />
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[#7c7c7c]">
            {session.status === 'live' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-danger px-2 leading-5 text-on-primary">
                <span className="size-1.5 animate-pulse rounded-full bg-on-primary" aria-hidden />
                Live
              </span>
            ) : (
              <Tag>{session.status === 'completed' ? 'Ended' : 'Not started'}</Tag>
            )}
            {session.room} · {hm(session.startsAt)}–{hm(session.endsAt)}
          </p>
        </div>
        <ConnectionDot />
      </header>
      {/* Keyed so a new session starts from its own queue, search and tab. */}
      <Queue key={session.id} session={session} />
    </div>
  );
}
