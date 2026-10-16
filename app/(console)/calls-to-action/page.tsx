'use client';

import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  CheckIcon,
  DocumentTextIcon,
  MegaphoneIcon,
  PencilSquareIcon,
  PlusIcon,
  PresentationChartBarIcon,
  SparklesIcon,
  Squares2X2Icon,
  TableCellsIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { CallDialog } from '@/components/calls-to-action/call-dialog';
import { AnalyseManyDialog } from '@/components/calls-to-action/analyse-many-dialog';
import { DeckDialog, type DeckStyle } from '@/components/calls-to-action/deck-dialog';
import { ReportDialog } from '@/components/calls-to-action/report-dialog';
import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { MenuButton } from '@/components/ui/menu-button';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SegmentedTabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { callsCsv, countByStatus, filterCalls, STATUS_LABEL, STATUS_TABS, TYPE_LABEL, voices, type CallToAction, type StatusTab } from '@/lib/calls-to-action/calls-to-action';
import { useAnalyseQueue } from '@/lib/calls-to-action/analyse-queue';
import { useCallActions, useCallsToAction, useCallTargets } from '@/lib/calls-to-action/use-calls-to-action';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { timeRange } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { useListMotion } from '@/lib/use-list-motion';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

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
  const [tab, setTab] = useUrlParam<StatusTab>('status', 'suggested', STATUS_TABS);
  const [sessionFilter, setSessionFilter] = useUrlParam<string>('session', 'all');
  const [targetFilter, setTargetFilter] = useUrlParam<string>('to', 'all');
  const [editing, setEditing] = useState<{ call: CallToAction | null } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [keep, setKeep] = useState('');
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckStyle, setDeckStyle] = useState<DeckStyle>('designed');
  const openDeck = (style: DeckStyle) => {
    setDeckStyle(style);
    setDeckOpen(true);
  };
  const [reportOpen, setReportOpen] = useState(false);
  const [manyOpen, setManyOpen] = useState(false);
  const queue = useAnalyseQueue(edition.id);
  const queued = Object.values(queue.runs);
  const queueDone = queued.filter((r) => r.status === 'done' || r.status === 'failed').length;
  const [fromStart, setFromStart] = useState(false);
  const listRef = useListMotion<HTMLUListElement>();

  const sessionList = useMemo(() => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions.data]);
  const titleOf = (id: string | null) => sessionList.find((s) => s.id === id)?.title ?? (id ? 'A removed session' : 'No session');
  const runsOf = (id: string) => board.data?.analyses.find((a) => a.sessionId === id);
  const sessionOptions = sessionList.map((s) => {
    const runs = runsOf(s.id)?.runs ?? 0;
    return { value: s.id, label: `Day ${s.day} · ${timeRange(s.startsAt, s.endsAt)} · ${s.title}${s.status === 'live' ? ' · live' : ''}${runs ? ` · analysed ${runs}×` : ''}` };
  });

  if (board.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (board.isError) return <ErrorState framed title="Calls to action could not load" error={board.error} onRetry={() => void board.refetch()} />;
  const { items, aiReady } = board.data;
  const counts = countByStatus(items);
  const shown = filterCalls(items, tab, sessionFilter, targetFilter);
  const targetOptions = [...new Set(items.map((c) => c.directedAt))].sort();
  const chosen = selected.filter((id) => shown.some((c) => c.id === id && c.status !== 'merged'));
  const analysing = actions.analyse.isPending;

  const analyse = () => {
    const sessionId = sessionToAnalyse || sessionList.find((s) => s.status === 'live')?.id;
    if (!sessionId) return;
    actions.analyse.mutate(
      { sessionId, fromStart },
      {
        onSuccess: (result) => {
          toast.push({ title: result.added.length ? 'Calls to action found' : 'Analysis done', body: result.message, leading: { kind: 'icon', icon: SparklesIcon, tone: 'success' } });
          if (result.added.length) setTab('suggested');
          setFromStart(false);
        },
        onError: (e) => toast.push({ title: 'Not analysed', body: e.message }),
      },
    );
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
      <Panel title="Analyse a session" description="At a break or when it ends: reads what was said since the last analysis and suggests calls to action.">
        <div className="flex flex-col gap-4 px-6 py-5 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <div className="max-w-xl">
              <Select
                label="Session to analyse"
                value={sessionToAnalyse || sessionList.find((s) => s.status === 'live')?.id || ''}
                options={[{ value: '', label: 'Choose a session' }, ...sessionOptions]}
                onChange={setSessionToAnalyse}
              />
            </div>
            {runsOf(sessionToAnalyse || sessionList.find((s) => s.status === 'live')?.id || '') && (
              <label className="mt-3 flex w-fit items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={fromStart} onChange={(e) => setFromStart(e.target.checked)} className="size-4 accent-primary" />
                Read the whole session again
                <span className="text-hint">· calls already listed are not suggested twice</span>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setManyOpen(true)} disabled={!aiReady || sessionList.length === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
              Analyse several
            </button>
            <button type="button" onClick={analyse} disabled={!aiReady || analysing || !(sessionToAnalyse || sessionList.some((s) => s.status === 'live'))} className={buttonClass()}>
              <SparklesIcon className="size-4" />
              {analysing ? 'Analysing… a minute or two' : 'Analyse'}
            </button>
          </div>
        </div>
        {/* several sessions being read while their dialog is hidden */}
        {queued.length > 0 && !manyOpen && (
          <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-primary-soft px-6 py-2.5 text-sm text-primary">
            {queue.running ? `Analysing several sessions: ${queueDone} of ${queued.length} done.` : `Several sessions analysed: all ${queued.length} done.`}
            <button type="button" onClick={() => setManyOpen(true)} className="font-medium underline underline-offset-2">
              {queue.running ? 'Show progress' : 'Show results'}
            </button>
          </p>
        )}
        {!aiReady && (
          <p className="border-t border-border bg-warning-soft px-6 py-2.5 text-sm text-warning">
            AI analysis isn’t set up yet. Ask your administrator. You can still add, review and export calls to action.
          </p>
        )}
      </Panel>

      {/* 2. Review */}
      <Panel
        title="Calls to action"
        count={items.length}
        description="Only approved ones go into the deck."
        actions={
          <>
            <button type="button" onClick={exportCsv} disabled={counts.approved === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
              <ArrowDownTrayIcon className="size-4" />
              Export approved
            </button>
            {/* the AI's design for the event, or the commitment template as cards or a table */}
            <MenuButton
              label="Make a deck"
              icon={PresentationChartBarIcon}
              disabled={counts.approved === 0}
              choices={[
                { label: `Designed for ${edition.shortName}`, hint: 'The AI designs it from the event’s brand', icon: SparklesIcon, onSelect: () => openDeck('designed') },
                { label: 'Cards', hint: `Template #1, eight to a slide${edition.deckTemplate === 'build' ? ', in Build’s look' : ''}`, icon: Squares2X2Icon, onSelect: () => openDeck('cards') },
                {
                  label: 'Table',
                  hint: `Template #2, up to twelve rows to a slide${edition.deckTemplate === 'build' ? ', in Build’s look' : ''}`,
                  icon: TableCellsIcon,
                  onSelect: () => openDeck('table'),
                },
              ]}
            />
            <button type="button" onClick={() => setReportOpen(true)} disabled={sessionList.length === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
              <DocumentTextIcon className="size-4" />
              Rapporteur report
            </button>
            {/* with nothing listed, the empty state below offers it instead */}
            {items.length > 0 && (
              <button type="button" onClick={() => setEditing({ call: null })} className={buttonClass()}>
                <PlusIcon className="size-4" />
                Add by hand
              </button>
            )}
          </>
        }
        toolbar={
          <>
            <SegmentedTabs label="Review status" options={STATUS_TABS.map((t) => ({ value: t, label: TAB_LABEL[t], count: counts[t] }))} value={tab} onChange={setTab} />
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <div className="w-full sm:w-56">
                <Select
                  label="Session"
                  value={sessionFilter}
                  options={[{ value: 'all', label: 'Every session' }, ...sessionList.map((s) => ({ value: s.id, label: s.title }))]}
                  onChange={setSessionFilter}
                />
              </div>
              {targetOptions.length > 0 && (
                <div className="w-full sm:w-56">
                  <Select
                    label="Directed at"
                    value={targetFilter}
                    options={[{ value: 'all', label: 'Everyone called on' }, ...targetOptions.map((t) => ({ value: t, label: t }))]}
                    onChange={setTargetFilter}
                  />
                </div>
              )}
            </div>
          </>
        }
      >
        {chosen.length >= 2 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary-soft/40 px-6 py-3 text-sm">
            <Squares2X2Icon className="size-4 text-primary" />
            <span className="text-ink">Merge {chosen.length} duplicates, keeping</span>
            <div className="w-full sm:w-80">
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
          items.length === 0 ? (
            <EmptyState
              icon={MegaphoneIcon}
              title="No calls to action yet"
              body="Analyse a session, or add one by hand."
              action={
                <button type="button" onClick={() => setEditing({ call: null })} className={buttonClass()}>
                  <PlusIcon className="size-4" />
                  Add by hand
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={MegaphoneIcon}
              title={`Nothing ${TAB_LABEL[tab].toLowerCase()} here`}
              action={
                (tab !== 'all' || sessionFilter !== 'all' || targetFilter !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab('all');
                      setSessionFilter('all');
                      setTargetFilter('all');
                    }}
                    className={buttonClass({ style: 'outline', color: 'gray' })}
                  >
                    Show every call
                  </button>
                )
              }
            />
          )
        ) : (
          // keyed by tab, so switching tabs swaps the list rather than fading the old one out
          <ul key={tab} ref={listRef} className="divide-y divide-border">
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
                  <p className="flex flex-wrap items-center gap-2 text-xs text-hint">
                    <Tag tone="primary">To {c.directedAt}</Tag>
                    <Tag tone={c.type === 'pledge' ? 'green' : 'gray'}>{TYPE_LABEL[c.type]}</Tag>
                    {c.needsDetail && <Tag tone="gold">Needs detail</Tag>}
                    {c.status !== 'suggested' && <Tag tone={c.status === 'approved' ? 'green' : 'gray'}>{STATUS_LABEL[c.status]}</Tag>}
                    {c.source === 'manual' && <span>added by hand</span>}
                  </p>
                  <p className="mt-1.5 text-[0.9375rem] font-medium text-ink">{c.shortText}</p>
                  {c.action !== c.shortText && <p className="mt-0.5 text-sm text-ink-soft">{c.action}</p>}
                  <p className="mt-1 text-xs text-ink-soft">{[c.deadline && `By ${c.deadline.replace(/^by\s+/i, '')}`, c.amount, c.theme].filter(Boolean).join(' · ')}</p>
                  {c.quote && (
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm italic text-ink-soft">
                      “{c.quote}”<span className="not-italic text-xs text-hint"> {[voices(c), titleOf(c.sessionId), c.saidAt && hm(c.saidAt)].filter(Boolean).join(' · ')}</span>
                    </blockquote>
                  )}
                  {!c.quote && voices(c) && <p className="mt-1 text-xs text-hint">{voices(c)}</p>}
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
      </Panel>

      {(manyOpen || queued.length > 0) && (
        <AnalyseManyDialog open={manyOpen} sessions={sessionList} analysedTimes={(id) => runsOf(id)?.runs ?? 0} queue={queue} onReview={() => setTab('suggested')} onClose={() => setManyOpen(false)} />
      )}
      {reportOpen && <ReportDialog open edition={edition} sessions={sessionList} initialSessionId={sessionFilter === 'all' ? null : sessionFilter} onClose={() => setReportOpen(false)} />}
      {deckOpen && (
        <DeckDialog
          open
          edition={edition}
          items={items}
          sessions={sessionList}
          initialSessionId={sessionFilter === 'all' ? null : sessionFilter}
          initialStyle={deckStyle}
          onClose={() => setDeckOpen(false)}
        />
      )}

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
