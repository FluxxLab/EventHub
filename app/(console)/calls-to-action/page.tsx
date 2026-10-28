'use client';

import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  BuildingOffice2Icon,
  CheckIcon,
  DocumentDuplicateIcon,
  DocumentTextIcon,
  MegaphoneIcon,
  PencilSquareIcon,
  PlusIcon,
  PresentationChartBarIcon,
  SparklesIcon,
  Squares2X2Icon,
  TableCellsIcon,
  TrashIcon,
  TrophyIcon,
  UserGroupIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { CallDialog } from '@/components/calls-to-action/call-dialog';
import { AnalyseManyDialog } from '@/components/calls-to-action/analyse-many-dialog';
import { DeckDialog, type DeckStyle } from '@/components/calls-to-action/deck-dialog';
import { NamesDialog } from '@/components/calls-to-action/names-dialog';
import { RepeatsDialog } from '@/components/calls-to-action/repeats-dialog';
import { ReportDialog } from '@/components/calls-to-action/report-dialog';
import { StakeholdersPanel } from '@/components/calls-to-action/stakeholders-panel';
import { TopBriefDialog } from '@/components/calls-to-action/top-brief-dialog';
import { EventBar } from '@/components/events/event-bar';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { MenuButton } from '@/components/ui/menu-button';
import { Panel } from '@/components/ui/panel';
import { DeleteDialog } from '@/components/ui/row-actions';
import { SidePager, usePaged } from '@/components/ui/side-pager';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { SegmentedTabs, tabId, tabPanelId, UnderlineTabs } from '@/components/ui/tabs';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { callsCsv, countByStatus, filterCalls, hereFor, STATUS_LABEL, STATUS_TABS, TYPE_LABEL, voices, type CallToAction, type StatusTab } from '@/lib/calls-to-action/calls-to-action';
import { useAnalyseQueue } from '@/lib/calls-to-action/analyse-queue';
import { peopleOf } from '@/lib/calls-to-action/names';
import { findRepeats, loadDismissed, saveDismissed } from '@/lib/calls-to-action/repeats';
import { useCallActions, useCallsToAction, useCallTargets, useStakeholders } from '@/lib/calls-to-action/use-calls-to-action';
import type { Edition } from '@/lib/events/events';
import { usePageEdition } from '@/lib/events/use-page-edition';
import { timeRange } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { useListMotion } from '@/lib/use-list-motion';
import { useUrlParam } from '@/lib/use-url-state';
import { cn } from '@/lib/utils';

const VIEWS = ['calls', 'stakeholders'] as const;
type View = (typeof VIEWS)[number];

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
  const stakeholders = useStakeholders(edition.id);

  const [sessionToAnalyse, setSessionToAnalyse] = useState('');
  const [tab, setTab] = useUrlParam<StatusTab>('status', 'suggested', STATUS_TABS);
  const [sessionFilter, setSessionFilter] = useUrlParam<string>('session', 'all');
  const [targetFilter, setTargetFilter] = useUrlParam<string>('to', 'all');
  const [view, setView] = useUrlParam<View>('view', 'calls', VIEWS);
  const [editing, setEditing] = useState<{ call: CallToAction | null } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [whoDone, setWhoDone] = useState(0);
  const [keep, setKeep] = useState('');
  const [deckOpen, setDeckOpen] = useState(false);
  const [deckStyle, setDeckStyle] = useState<DeckStyle>('designed');
  const openDeck = (style: DeckStyle) => {
    setDeckStyle(style);
    setDeckOpen(true);
  };
  const [reportOpen, setReportOpen] = useState(false);
  const [briefOpen, setBriefOpen] = useState(false);
  const [manyOpen, setManyOpen] = useState(false);
  const [namesOpen, setNamesOpen] = useState(false);
  const [repeatsOpen, setRepeatsOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => loadDismissed(edition.id));
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

  const people = useMemo(() => peopleOf(board.data?.items ?? []), [board.data]);
  const repeats = useMemo(() => findRepeats(board.data?.items ?? [], dismissed), [board.data, dismissed]);

  // five calls at a time; another tab or filter starts again at the first page
  const paged = usePaged(board.data ? filterCalls(board.data.items, tab, sessionFilter, targetFilter) : [], `${tab}|${sessionFilter}|${targetFilter}`, 'calls-to-action');

  if (board.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (board.isError) return <ErrorState framed title="Calls to action could not load" error={board.error} onRetry={() => void board.refetch()} />;
  const { items, aiReady } = board.data;
  const counts = countByStatus(items);
  const shown = filterCalls(items, tab, sessionFilter, targetFilter);
  const targetOptions = [...new Set(items.map((c) => c.directedAt))].sort();
  const chosen = selected.filter((id) => shown.some((c) => c.id === id && c.status !== 'merged'));
  const selectable = shown.filter((c) => c.status !== 'merged');
  // calls nobody is named for, and the sessions they are in
  const unnamed = items.filter((c) => c.sessionId && c.status !== 'merged' && c.status !== 'rejected' && !c.proposedBy?.trim());
  const unnamedCount = unnamed.length;
  const unnamedSessions = [...new Set(unnamed.map((c) => c.sessionId!))];
  const findWhoSaid = () => {
    setWhoDone(0);
    actions.whoSaid.mutate(
      { sessionIds: unnamedSessions, onProgress: setWhoDone },
      {
        onSuccess: ({ filled, missing, failed }) =>
          toast.push({
            title: filled ? 'Speakers found' : 'No more speakers found',
            body: `${filled} named from the transcripts.${missing ? ` ${missing} could not be told from what was said; name them by hand with Edit.` : ''}${failed ? ` ${failed} session(s) could not be read; try again.` : ''}`,
            leading: { kind: 'icon', icon: SparklesIcon, tone: filled ? 'success' : undefined },
          }),
      },
    );
  };
  const analysing = actions.analyse.isPending;
  // the chosen calls a status would change (those already at it are left alone)
  const chosenFor = (status: 'approved' | 'rejected') => chosen.filter((id) => items.find((c) => c.id === id)?.status !== status);
  const setStatusMany = (status: 'approved' | 'rejected') => {
    const ids = chosenFor(status);
    actions.setMany.mutate(
      { ids, status },
      {
        onSuccess: ({ changed, failed }) => {
          toast.push({
            title: status === 'approved' ? `${changed} approved` : `${changed} rejected`,
            body: failed ? `${failed} could not be saved; try those again.` : status === 'approved' ? 'They go into the deck, the report and the stakeholders view.' : 'They stay on record under Rejected.',
            leading: { kind: 'icon', icon: status === 'approved' ? CheckIcon : XMarkIcon, tone: status === 'approved' && !failed ? 'success' : undefined },
          });
          setSelected([]);
        },
      },
    );
  };
  const removeChosen = () =>
    actions.remove.mutate(chosen, {
      onSuccess: ({ deleted }) => {
        toast.push({ title: 'Deleted', body: `${deleted} call${deleted === 1 ? '' : 's'} to action removed. Analyse the session again to look afresh.`, leading: { kind: 'icon', icon: TrashIcon } });
        setSelected([]);
        setDeleting(false);
      },
    });

  const rename = (ids: string[], name: string, organisation: string | null) =>
    actions.patchMany.mutateAsync({ ids, body: { proposedBy: name, proposedByOrganisation: organisation } }).then(({ changed, failed }) => {
      toast.push({
        title: `${name} on ${changed} card${changed === 1 ? '' : 's'}`,
        body: failed ? `${failed} could not be saved; try again.` : 'Download the deck and report again to use the new spelling.',
        leading: { kind: 'icon', icon: CheckIcon, tone: failed ? undefined : 'success' },
      });
      if (failed) throw new Error(`${failed} card(s) not saved; try again.`);
    });
  const mergeRepeat = (keepCall: CallToAction, other: CallToAction) =>
    actions.merge.mutateAsync({ into: keepCall.id, ids: [other.id] }).then(() => {
      toast.push({ title: 'Merged', body: `Kept under “${titleOf(keepCall.sessionId)}”.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } });
    });
  const dismissRepeat = (pair: string) =>
    setDismissed((was) => {
      const next = new Set(was).add(pair);
      saveDismissed(edition.id, next);
      return next;
    });

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
                <span className="text-hint">· replaces its unreviewed AI suggestions; approved, rejected and edited ones stay</span>
              </label>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={findWhoSaid}
              disabled={!aiReady || actions.whoSaid.isPending || unnamedSessions.length === 0}
              title={unnamedSessions.length ? `${unnamedCount} call(s) with nobody named, in ${unnamedSessions.length} session(s)` : 'Every call has a name'}
              className={buttonClass({ style: 'outline', color: 'gray' })}
            >
              {actions.whoSaid.isPending ? `Finding who said it… ${whoDone} of ${unnamedSessions.length}` : `Find who said it${unnamedCount ? ` (${unnamedCount})` : ''}`}
            </button>
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

      {/* 2. The calls, and 3. who they are aimed at, a tab each */}
      <UnderlineTabs
        label="Calls to action sections"
        idBase="calls"
        value={view}
        onChange={setView}
        options={[
          { value: 'calls', label: 'Calls to action', icon: MegaphoneIcon, count: items.length },
          { value: 'stakeholders', label: 'Stakeholders', icon: BuildingOffice2Icon, count: stakeholders.data?.stakeholders.filter((s) => s.asks.length || s.commitments.length).length },
        ]}
      />
      <div id={tabPanelId('calls', view)} role="tabpanel" aria-labelledby={tabId('calls', view)}>
        {view === 'calls' ? (
        <Panel
          title="Calls to action"
          count={items.length}
          description="Only approved ones go into the deck."
          actions={
            <>
              <button type="button" onClick={() => setNamesOpen(true)} disabled={people.length === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
                <UserGroupIcon className="size-4" />
                Names
                {people.some((p) => p.spellings.length > 1) && <span className="rounded-full bg-warning-soft px-1.5 text-xs text-warning">{people.filter((p) => p.spellings.length > 1).length}</span>}
              </button>
              <button type="button" onClick={() => setRepeatsOpen(true)} className={buttonClass({ style: 'outline', color: 'gray' })}>
                <DocumentDuplicateIcon className="size-4" />
                Repeats
                {repeats.length > 0 && <span className="rounded-full bg-warning-soft px-1.5 text-xs text-warning">{repeats.length}</span>}
              </button>
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
              <button type="button" onClick={() => setBriefOpen(true)} disabled={counts.approved + counts.suggested === 0} className={buttonClass({ style: 'outline', color: 'gray' })}>
                <TrophyIcon className="size-4" />
                Top 5 brief
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
          {selectable.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-2.5 text-sm">
              <span className="text-ink-soft">{chosen.length ? `${chosen.length} selected` : 'Tick calls to approve, reject, merge or delete them'}</span>
              <button type="button" onClick={() => setSelected(selectable.map((c) => c.id))} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                Select all {selectable.length} shown
              </button>
              {chosen.length > 0 && (
                <>
                  {chosenFor('approved').length > 0 && (
                    <button type="button" disabled={actions.setMany.isPending} onClick={() => setStatusMany('approved')} className={buttonClass({ style: 'soft', color: 'green' })}>
                      <CheckIcon className="size-4" />
                      {actions.setMany.isPending ? 'Saving…' : `Approve ${chosenFor('approved').length}`}
                    </button>
                  )}
                  {chosenFor('rejected').length > 0 && (
                    <button type="button" disabled={actions.setMany.isPending} onClick={() => setStatusMany('rejected')} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                      <XMarkIcon className="size-4" />
                      Reject {chosenFor('rejected').length}
                    </button>
                  )}
                  <button type="button" onClick={() => setDeleting(true)} className={buttonClass({ style: 'soft', color: 'danger' })}>
                    <TrashIcon className="size-4" />
                    Delete {chosen.length}
                  </button>
                  <button type="button" onClick={() => setSelected([])} className={buttonClass({ style: 'borderless', color: 'gray' })}>
                    Clear
                  </button>
                </>
              )}
            </div>
          )}
          {chosen.length >= 2 && (
            <div className="flex flex-wrap items-center gap-3 border-b border-border bg-primary-soft/40 px-6 py-3 text-sm">
              <Squares2X2Icon className="size-4 text-primary" />
              <span className="text-ink">Or merge {chosen.length} duplicates, keeping</span>
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
            </div>
          )}
          <DeleteDialog
            open={deleting}
            title={`Delete ${chosen.length} call${chosen.length === 1 ? '' : 's'} to action?`}
            pending={actions.remove.isPending}
            refusal={actions.remove.error?.message ?? null}
            onConfirm={removeChosen}
            onCancel={() => {
              actions.remove.reset();
              setDeleting(false);
            }}
          >
            They are removed for good, approved ones included, along with any merged into them. To find them again, analyse the session with “Read the whole session again”.
          </DeleteDialog>

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
            <SidePager page={paged.page} pages={paged.pages} total={paged.total} size={paged.size} onPage={paged.setPage} onSize={paged.setSize} label="Calls to action">
            <ul key={tab} ref={listRef} className="divide-y divide-border">
              {paged.slice.map((c) => (
                <li key={c.id} className={cn('flex gap-4 px-6 py-4', c.status === 'merged' && 'opacity-60')}>
                  {c.status !== 'merged' && (
                    <input
                      type="checkbox"
                      aria-label={`Select “${c.shortText}”`}
                      checked={selected.includes(c.id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, c.id] : s.filter((id) => id !== c.id)))}
                      className="mt-1 size-4 shrink-0 accent-primary"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-xs text-hint">
                      <Tag tone="primary">To {c.directedAt}</Tag>
                      {(() => {
                        const here = hereFor(stakeholders.data, c.id);
                        return (
                          here && (
                            <span title={here.orgs.join(', ')}>
                              {here.people} here · {here.orgs.length === 1 ? here.orgs[0] : `${here.orgs.length} organisations`}
                            </span>
                          )
                        );
                      })()}
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
            </SidePager>
          )}
        </Panel>
        ) : (
          <StakeholdersPanel editionId={edition.id} items={items} aiReady={aiReady} />
        )}
      </div>

      {(manyOpen || queued.length > 0) && (
        <AnalyseManyDialog open={manyOpen} sessions={sessionList} analysedTimes={(id) => runsOf(id)?.runs ?? 0} queue={queue} onReview={() => setTab('suggested')} onClose={() => setManyOpen(false)} />
      )}
      {namesOpen && <NamesDialog open people={people} onRename={rename} onClose={() => setNamesOpen(false)} />}
      {repeatsOpen && <RepeatsDialog open repeats={repeats} titleOf={titleOf} onMerge={mergeRepeat} onDismiss={dismissRepeat} onClose={() => setRepeatsOpen(false)} />}
      {briefOpen && <TopBriefDialog open edition={edition} approved={counts.approved} pending={counts.suggested} onClose={() => setBriefOpen(false)} />}
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
