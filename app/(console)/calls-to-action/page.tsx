'use client';

import { ArrowDownTrayIcon, ArrowUturnLeftIcon, CheckIcon, MegaphoneIcon, PencilSquareIcon, PlusIcon, SparklesIcon, Squares2X2Icon, XMarkIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { CallDialog } from '@/components/calls-to-action/call-dialog';
import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import {
  callsCsv,
  countByStatus,
  filterCalls,
  STATUS_LABEL,
  STATUS_TABS,
  TYPE_LABEL,
  voices,
  type CallToAction,
  type StatusTab,
} from '@/lib/calls-to-action/calls-to-action';
import { useCallActions, useCallsToAction, useCallTargets } from '@/lib/calls-to-action/use-calls-to-action';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { timeRange } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const TAB_LABEL: Record<StatusTab, string> = { suggested: 'To review', approved: 'Approved', rejected: 'Rejected', all: 'All' };
const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** Calls to action: Analyse a session at a break or at its end, then review what it found. */
export default function CallsToActionPage() {
  const page = usePageEdition();
  return (
    <EventBar page={page} note="Calls to action drawn from this event's sessions">
      {(editionId) => <Board edition={page.list.find((e) => e.id === editionId)!} />}
    </EventBar>
  );
}

function Board({ edition }: { edition: Edition }) {
  const toast = useToast();
  const board = useCallsToAction(edition.id);
  const targets = useCallTargets(edition.id);
  const sessions = useSessions(edition.id);
  const actions = useCallActions(edition.id);

  const [sessionToAnalyse, setSessionToAnalyse] = useState('');
  const [tab, setTab] = useState<StatusTab>('suggested');
  const [sessionFilter, setSessionFilter] = useState('all');
  const [targetFilter, setTargetFilter] = useState('all');
  const [editing, setEditing] = useState<{ call: CallToAction | null } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [keep, setKeep] = useState('');

  const sessionList = useMemo(() => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions.data]);
  const titleOf = (id: string | null) => sessionList.find((s) => s.id === id)?.title ?? (id ? 'A removed session' : 'No session');
  const runsOf = (id: string) => board.data?.analyses.find((a) => a.sessionId === id);
  const sessionOptions = sessionList.map((s) => {
    const runs = runsOf(s.id)?.runs ?? 0;
    return { value: s.id, label: `Day ${s.day} · ${timeRange(s.startsAt, s.endsAt)} · ${s.title}${s.status === 'live' ? ' · live' : ''}${runs ? ` · analysed ${runs}×` : ''}` };
  });

  if (board.isPending) return <Skeleton className="h-96 w-full rounded-2xl" />;
  if (board.isError) {
    return (
      <div role="alert" className={cn(cardClass, 'p-10 text-center')}>
        <p className="font-medium text-ink">Calls to action could not load.</p>
        <p className="mt-1 text-sm text-muted">{board.error.message}</p>
      </div>
    );
  }
  const { items, aiReady } = board.data;
  const counts = countByStatus(items);
  const shown = filterCalls(items, tab, sessionFilter, targetFilter);
  const targetOptions = [...new Set(items.map((c) => c.directedAt))].sort();
  const chosen = selected.filter((id) => shown.some((c) => c.id === id && c.status !== 'merged'));
  const analysing = actions.analyse.isPending;

  const analyse = () => {
    const sessionId = sessionToAnalyse || sessionList.find((s) => s.status === 'live')?.id;
    if (!sessionId) return;
    actions.analyse.mutate(sessionId, {
      onSuccess: (result) => {
        toast.push({ title: result.added.length ? 'Calls to action found' : 'Analysis done', body: result.message, leading: { kind: 'icon', icon: SparklesIcon, tone: 'success' } });
        if (result.added.length) setTab('suggested');
      },
      onError: (e) => toast.push({ title: 'Not analysed', body: e.message }),
    });
  };
  const setStatus = (c: CallToAction, status: 'suggested' | 'approved' | 'rejected') =>
    actions.update.mutate({ id: c.id, body: { status } }, { onError: (e) => toast.push({ title: 'Not changed', body: e.message }) });
  const exportCsv = () => {
    const approved = items.filter((c) => c.status === 'approved');
    const blob = new Blob([callsCsv(approved, titleOf)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${edition.shortName}-calls-to-action.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const merge = () => {
    const into = chosen.includes(keep) ? keep : chosen[0]!;
    actions.merge.mutate(
      { into, ids: chosen.filter((id) => id !== into) },
      {
        onSuccess: () => {
          toast.push({ title: 'Merged', body: `${chosen.length - 1} folded into one; their speakers are kept with it.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } });
          setSelected([]);
          setKeep('');
        },
        onError: (e) => toast.push({ title: 'Not merged', body: e.message }),
      },
    );
  };

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Analyse */}
      <section aria-labelledby="analyse-title" className={cardClass}>
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <h2 id="analyse-title" className="text-base font-medium text-ink">
              Analyse a session
            </h2>
            <p className="text-sm text-[#7c7c7c]">At a break or when it ends: reads what was said since the last analysis, with the names on the mics, and suggests its calls to action for you to review.</p>
            <div className="mt-3 max-w-xl">
              <Select label="Session to analyse" value={sessionToAnalyse || sessionList.find((s) => s.status === 'live')?.id || ''} options={[{ value: '', label: 'Choose a session' }, ...sessionOptions]} onChange={setSessionToAnalyse} />
            </div>
          </div>
          <button type="button" onClick={analyse} disabled={!aiReady || analysing || !(sessionToAnalyse || sessionList.some((s) => s.status === 'live'))} className={buttonClass()}>
            <SparklesIcon className="size-4" />
            {analysing ? 'Analysing… a minute or two' : 'Analyse'}
          </button>
        </div>
        {!aiReady && <p className="border-t border-border bg-gold-soft px-6 py-2.5 text-sm text-[#7a5d00]">Analyse is off until the AI is set up on the server (ANTHROPIC_API_KEY). You can still add, review and export calls to action.</p>}
      </section>

      {/* 2. Review */}
      <section aria-labelledby="review-title" className={cardClass}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h2 id="review-title" className="text-base font-medium text-ink">
              Calls to action
            </h2>
            <p className="text-sm text-[#7c7c7c]">Only approved ones go into the deck. Edit any of them to say exactly what was asked, and of whom.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} disabled={counts.approved === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
              <ArrowDownTrayIcon className="size-4" />
              Export approved
            </button>
            <button type="button" onClick={() => setEditing({ call: null })} className={buttonClass()}>
              <PlusIcon className="size-4" />
              Add by hand
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-3">
          <div role="tablist" aria-label="Review status" className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
            {STATUS_TABS.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', tab === t ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink')}
              >
                {TAB_LABEL[t]}
                <span className="text-xs tabular-nums text-[#7c7c7c]">{counts[t]}</span>
              </button>
            ))}
          </div>
          <div className="w-56">
            <Select label="Session" value={sessionFilter} options={[{ value: 'all', label: 'Every session' }, ...sessionList.map((s) => ({ value: s.id, label: s.title }))]} onChange={setSessionFilter} />
          </div>
          {targetOptions.length > 0 && (
            <div className="w-56">
              <Select label="Directed at" value={targetFilter} options={[{ value: 'all', label: 'Everyone called on' }, ...targetOptions.map((t) => ({ value: t, label: t }))]} onChange={setTargetFilter} />
            </div>
          )}
        </div>

        {chosen.length >= 2 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary-soft/40 px-6 py-3 text-sm">
            <Squares2X2Icon className="size-4 text-primary" />
            <span className="text-ink">Merge {chosen.length} duplicates, keeping</span>
            <div className="w-80">
              <Select
                label="The one to keep"
                value={chosen.includes(keep) ? keep : chosen[0]!}
                options={chosen.map((id) => ({ value: id, label: items.find((c) => c.id === id)?.shortText ?? id }))}
                onChange={setKeep}
              />
            </div>
            <button type="button" onClick={merge} disabled={actions.merge.isPending} className={buttonClass()}>
              Merge
            </button>
            <button type="button" onClick={() => setSelected([])} className={buttonClass({ style: 'borderless', color: 'gray' })}>
              Cancel
            </button>
          </div>
        )}

        {shown.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
            <MegaphoneIcon className="size-8 text-placeholder" />
            <p className="text-sm text-[#7c7c7c]">{items.length === 0 ? 'None yet. Analyse a session, or add one by hand.' : `Nothing ${TAB_LABEL[tab].toLowerCase()} here.`}</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((c) => (
              <li key={c.id} className={cn('flex gap-4 px-6 py-4', c.status === 'merged' && 'opacity-60')}>
                {c.status !== 'merged' && (
                  <input
                    type="checkbox"
                    aria-label={`Select “${c.shortText}” to merge`}
                    checked={selected.includes(c.id)}
                    onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)))}
                    className="mt-1 size-4 shrink-0 accent-primary"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-xs text-[#7c7c7c]">
                    <Tag tone="primary">To {c.directedAt}</Tag>
                    <Tag tone={c.type === 'pledge' ? 'green' : 'gray'}>{TYPE_LABEL[c.type]}</Tag>
                    {c.needsDetail && <Tag tone="gold">Needs detail</Tag>}
                    {c.status !== 'suggested' && <Tag tone={c.status === 'approved' ? 'green' : 'gray'}>{STATUS_LABEL[c.status]}</Tag>}
                    {c.source === 'manual' && <span>added by hand</span>}
                  </p>
                  <p className="mt-1.5 text-[15px] font-medium text-ink">{c.shortText}</p>
                  {c.action !== c.shortText && <p className="mt-0.5 text-sm text-[#525252]">{c.action}</p>}
                  <p className="mt-1 text-xs text-[#525252]">
                    {[c.deadline && `By ${c.deadline.replace(/^by\s+/i, '')}`, c.amount, c.theme].filter(Boolean).join(' · ')}
                  </p>
                  {c.quote && (
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic text-[#525252]">
                      “{c.quote}”
                      <span className="not-italic text-xs text-[#7c7c7c]">
                        {' '}
                        {[voices(c), titleOf(c.sessionId), c.saidAt && hm(c.saidAt)].filter(Boolean).join(' · ')}
                      </span>
                    </blockquote>
                  )}
                  {!c.quote && voices(c) && <p className="mt-1 text-xs text-[#7c7c7c]">{voices(c)}</p>}
                </div>
                {c.status !== 'merged' && (
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {c.status !== 'approved' && (
                      <button type="button" onClick={() => setStatus(c, 'approved')} className={buttonClass({ style: 'soft', color: 'green' })}>
                        <CheckIcon className="size-4" />
                        Approve
                      </button>
                    )}
                    {c.status === 'suggested' && (
                      <button type="button" onClick={() => setStatus(c, 'rejected')} className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}>
                        <XMarkIcon className="size-4" />
                        Reject
                      </button>
                    )}
                    {c.status !== 'suggested' && (
                      <button type="button" onClick={() => setStatus(c, 'suggested')} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                        <ArrowUturnLeftIcon className="size-4" />
                        Back to review
                      </button>
                    )}
                    <button type="button" onClick={() => setEditing({ call: c })} className={buttonClass({ style: 'outline', color: 'gray' })}>
                      <PencilSquareIcon className="size-4" />
                      Edit
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <CallDialog
          key={editing.call?.id ?? 'new'}
          open
          call={editing.call}
          sessions={sessionList.map((s) => ({ value: s.id, label: s.title }))}
          targets={targets.data ?? []}
          pending={actions.create.isPending || actions.update.isPending}
          error={(editing.call ? actions.update.error : actions.create.error)?.message ?? null}
          onClose={() => {
            actions.create.reset();
            actions.update.reset();
            setEditing(null);
          }}
          onSave={({ sessionId, ...body }) => {
            const done = () => {
              toast.push({ title: editing.call ? 'Saved' : 'Added', leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } });
              setEditing(null);
            };
            if (editing.call) actions.update.mutate({ id: editing.call.id, body }, { onSuccess: done });
            else actions.create.mutate({ ...body, sessionId }, { onSuccess: done });
          }}
        />
      )}
    </div>
  );
}
