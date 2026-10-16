'use client';

import {
  ArrowUturnLeftIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronUpIcon,
  HandThumbUpIcon,
  MagnifyingGlassIcon,
  NoSymbolIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { FigureCard } from '@/components/dashboard/stat-card';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Panel } from '@/components/ui/panel';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { useRealtimeStatus } from '@/lib/api/realtime';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { ago, count } from '@/lib/format';
import type { Session } from '@/lib/programme/programme';
import { useSessions, useSessionsRealtime } from '@/lib/programme/use-sessions';
import { isNew, matches, tally, type Question, type QuestionStatus } from '@/lib/questions/questions';
import { useQuestionActions, useQuestions } from '@/lib/questions/use-questions';
import { useNow } from '@/lib/use-now';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** The session a moderator most likely wants: the live one, else the next to start, else the first. */
function defaultSession(sessions: Session[], now: number): Session | undefined {
  return sessions.find((s) => s.status === 'live') ?? sessions.find((s) => s.status === 'scheduled' && Date.parse(s.endsAt) > now) ?? sessions[0];
}

function sessionLabel(s: Session): string {
  const when = s.status === 'live' ? 'Live now' : `Day ${s.day} · ${hm(s.startsAt)}`;
  return `${when} · ${s.room} · ${s.title}`;
}

function ConnectionDot() {
  const connection = useRealtimeStatus();
  const label = { live: 'Live: questions appear as they are asked', connecting: 'Connecting…', offline: 'Offline: reload for new questions', demo: 'Demo data' }[connection];
  return (
    <p className="flex items-center gap-2 text-xs text-hint" aria-live="polite">
      <span
        className={cn('size-2 rounded-full', connection === 'live' ? 'bg-success' : connection === 'connecting' ? 'animate-pulse bg-gold' : connection === 'offline' ? 'bg-danger' : 'bg-placeholder')}
        aria-hidden
      />
      {label}
    </p>
  );
}

function Votes({ value, large = false }: { value: number; large?: boolean }) {
  return (
    <div
      className={cn('flex shrink-0 flex-col items-center justify-center rounded-lg bg-surface-soft text-center', large ? 'h-20 w-18' : 'h-14 w-14')}
      aria-label={`${value} ${value === 1 ? 'upvote' : 'upvotes'}`}
    >
      <ChevronUpIcon className={cn('text-hint', large ? 'size-5' : 'size-4')} aria-hidden />
      <span className={cn('font-medium tabular-nums text-ink', large ? 'text-2xl' : 'text-base')}>{value}</span>
    </div>
  );
}

function Asker({ question, now }: { question: Question; now: number }) {
  return (
    <p className="text-xs text-hint">
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
    <section aria-labelledby="next-up" className="rounded-xl border border-primary/30 bg-primary-soft/40 p-5 md:p-6">
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
          <p className="text-[0.9375rem] leading-6 text-ink">
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
  { key: 'open', label: 'Open', empty: 'New ones appear here as delegates ask them in the app.' },
  { key: 'answered', label: 'Answered', empty: 'Questions you mark answered collect here.' },
  { key: 'dismissed', label: 'Dismissed', empty: 'Dismissed questions stay visible to the delegate who asked.' },
];
const STATUSES = TABS.map((t) => t.key);

function Queue({ session }: { session: Session }) {
  const questions = useQuestions(session.id);
  const { setStatus, remove } = useQuestionActions(session.id);
  const toast = useToast();
  const now = useNow(15_000).getTime();
  const [tab, setTab] = useUrlParam<QuestionStatus>('status', 'open', STATUSES);
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

  if (questions.isPending) return <Skeleton className="h-96 rounded-xl" />;
  if (questions.isError && !questions.data) return <ErrorState framed title="Questions could not load" error={questions.error} onRetry={() => void questions.refetch()} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
        <FigureCard label="Open" icon={QuestionMarkCircleIcon} value={count(totals.open)} note={totals.open ? 'Waiting for the panel' : undefined} />
        <FigureCard label="Answered" icon={CheckCircleIcon} value={count(totals.answered)} />
        <FigureCard label="Upvotes" icon={HandThumbUpIcon} value={count(totals.upvotes)} />
        <FigureCard label="People asking" icon={UserGroupIcon} value={count(totals.askers)} />
      </div>

      {featured && <NextUp question={featured} now={now} onStatus={onStatus} />}

      <Panel
        title="Questions"
        toolbar={
          <>
            <SegmentedTabs label="Question status" options={TABS.map((t) => ({ value: t.key, label: t.label, count: totals[t.key] }))} value={tab} onChange={setTab} />
            <TextInput
              icon={MagnifyingGlassIcon}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by words or asker"
              aria-label="Filter questions"
              className="w-full sm:w-72"
            />
          </>
        }
      >
        <div role="tabpanel" aria-label={`${TABS.find((t) => t.key === tab)!.label} questions`}>
          {list.length === 0 ? (
            search.trim() ? (
              <EmptyState
                icon={MagnifyingGlassIcon}
                title={`No ${tab} questions match “${search.trim()}”`}
                action={
                  <button type="button" onClick={() => setSearch('')} className={buttonClass({ style: 'outline', color: 'gray' })}>
                    Clear filter
                  </button>
                }
              />
            ) : featured ? (
              <EmptyState icon={ChatBubbleLeftRightIcon} title="Only the question above is open" />
            ) : (
              <EmptyState icon={ChatBubbleLeftRightIcon} title={`No ${tab} questions`} body={TABS.find((t) => t.key === tab)!.empty} />
            )
          ) : (
            <ul className="divide-y divide-border">
              {list.map((q) => (
                <QuestionRow key={q.id} question={q} now={now} onStatus={onStatus} onDelete={setDeleting} />
              ))}
            </ul>
          )}
        </div>
      </Panel>

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
        “{deleting?.text}” is removed for everyone, with its upvotes, including the delegate who asked. To take it off the queue but keep the record, dismiss it instead.
      </ConfirmDialog>
    </div>
  );
}

export default function QuestionsPage() {
  useSessionsRealtime();
  const working = useWorkingEdition();
  const editions = working.editions;
  const edition = working.edition;
  const sessions = useSessions(edition?.id);
  const now = useNow(60_000).getTime();
  const [picked, setPicked] = useState<string | null>(null);

  // Live sessions first, then the programme in order; breaks have no questions.
  const options = useMemo(
    () => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => Number(b.status === 'live') - Number(a.status === 'live') || Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [sessions.data],
  );
  const session = options.find((s) => s.id === picked) ?? defaultSession(options, now);

  if (editions.isPending || sessions.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-xl" />;
  if (!session) {
    return (
      <EmptyState
        framed
        className="mx-auto mt-10 w-full max-w-lg"
        icon={ChatBubbleLeftRightIcon}
        title="No sessions yet"
        body="Questions belong to a session."
        action={
          <Link href="/programme" className={buttonClass()}>
            Add sessions
          </Link>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <h1 className="sr-only">Questions</h1>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="w-full max-w-xl">
          <Select label="Session" value={session.id} options={options.map((s) => ({ value: s.id, label: sessionLabel(s) }))} onChange={setPicked} />
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-hint">
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
