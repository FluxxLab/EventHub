'use client';

import { BuildingOffice2Icon, CheckCircleIcon, CheckIcon, ChevronDownIcon, SparklesIcon, UserGroupIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState, ErrorState, LoadingRows } from '@/components/ui/states';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { openAsks, STATUS_LABEL, type CallToAction, type Stakeholder, type StakeholderMap } from '@/lib/calls-to-action/calls-to-action';
import { useStakeholderLinks, useStakeholders } from '@/lib/calls-to-action/use-calls-to-action';
import { count } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The event's organisations, from its delegates, each with the recommendations aimed at it (what
 * it is asked to commit to), the commitments it has made, and the people from it who are here.
 * An organisation asked to act that has committed to nothing yet is the one to follow up.
 */
export function StakeholdersPanel({ editionId, items, aiReady }: { editionId: string; items: CallToAction[]; aiReady: boolean }) {
  const map = useStakeholders(editionId);
  const [open, setOpen] = useState<string | null>(null);
  const [onlyAsked, setOnlyAsked] = useState(true);
  const byId = new Map(items.map((c) => [c.id, c]));

  const all = map.data?.stakeholders ?? [];
  const asked = all.filter((s) => s.asks.length || s.commitments.length);
  const shown = onlyAsked ? asked : all;
  const toFollowUp = all.filter((s) => openAsks(s) > 0).length;

  return (
    <Panel
      title="Stakeholders"
      count={map.data ? asked.length : undefined}
      description={
        map.data
          ? `Organisations at the event that calls are aimed at, from their delegates’ details.${toFollowUp ? ` ${toFollowUp} ${toFollowUp === 1 ? 'is' : 'are'} asked to act and ${toFollowUp === 1 ? 'has' : 'have'} committed to nothing yet.` : ''}`
          : 'Organisations at the event that calls are aimed at.'
      }
      actions={
        all.length > asked.length && (
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={!onlyAsked} onChange={(e) => setOnlyAsked(!e.target.checked)} className="size-4 accent-primary" />
            Show all {count(all.length)} organisations
          </label>
        )
      }
    >
      {map.isError && !map.data ? (
        <ErrorState title="Stakeholders could not load" error={map.error} onRetry={() => void map.refetch()} />
      ) : map.isPending ? (
        <LoadingRows rows={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={BuildingOffice2Icon}
          title={all.length ? 'No call names an organisation that is here yet' : 'No delegate has an organisation on file'}
          body={all.length ? 'As calls are found and approved, the organisations they are aimed at appear here with their delegates.' : 'Delegates’ organisations come from registration or the attendee import.'}
        />
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((s) => (
            <StakeholderRow key={s.name} stakeholder={s} byId={byId} expanded={open === s.name} onToggle={() => setOpen(open === s.name ? null : s.name)} />
          ))}
        </ul>
      )}
      {map.data && (map.data.unmatched.length > 0 || map.data.links.length > 0) && <BroadTargets editionId={editionId} map={map.data} items={items} aiReady={aiReady} />}
    </Panel>
  );
}

function StakeholderRow({ stakeholder: s, byId, expanded, onToggle }: { stakeholder: Stakeholder; byId: Map<string, CallToAction>; expanded: boolean; onToggle: () => void }) {
  const here = s.delegates.filter((d) => d.admitted).length;
  const gap = openAsks(s);
  const calls = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is CallToAction => !!c);
  return (
    <li>
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="flex w-full items-center gap-4 px-6 py-3 text-left hover:bg-surface-soft">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink" title={s.spellings.join(' · ')}>
            {s.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-hint">
            <UserGroupIcon className="size-3.5" />
            {count(s.delegates.length)} {s.delegates.length === 1 ? 'delegate' : 'delegates'}
            {here > 0 && `, ${count(here)} checked in`}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {s.asks.length > 0 && <Tag tone="primary">{s.asks.length} asked</Tag>}
          {s.commitments.length > 0 && <Tag tone="green">{s.commitments.length} committed</Tag>}
          {gap > 0 && <Tag tone="gold">Follow up</Tag>}
        </span>
        <ChevronDownIcon className={cn('size-4 shrink-0 text-hint transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="grid gap-5 border-t border-border bg-surface-soft/50 px-6 py-4 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <CallList title="Asked to commit to" empty="Nothing aimed at it yet." calls={calls(s.asks)} />
            <CallList title="Committed to" empty="No commitment yet." calls={calls(s.commitments)} />
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-hint">Their delegates</p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {s.delegates.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="flex items-center gap-1.5 text-ink">
                    {d.name}
                    {d.admitted && <CheckCircleIcon className="size-4 text-success" aria-label="Checked in" />}
                  </span>
                  <span className="block truncate text-xs text-hint">{[d.title, d.email].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </li>
  );
}

function CallList({ title, empty, calls }: { title: string; empty: string; calls: CallToAction[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-hint">{title}</p>
      {calls.length === 0 ? (
        <p className="mt-1 text-sm text-hint">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {calls.map((c) => (
            <li key={c.id} className="text-sm text-ink">
              {c.shortText}
              <span className="ml-1.5 text-xs text-hint">· {STATUS_LABEL[c.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const key = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Targets that name no single organisation ("Federal Government"): the AI suggests which of the
 * event's organisations fall under each, an organiser confirms or rejects every suggestion, and can
 * link one by hand. Only confirmed links put a call on an organisation's list.
 */
function BroadTargets({ editionId, map, items, aiReady }: { editionId: string; map: StakeholderMap; items: CallToAction[]; aiReady: boolean }) {
  const links = useStakeholderLinks(editionId);
  const toast = useToast();
  const busy = links.set.isPending || links.add.isPending;
  const callsTo = (target: string) => items.filter((c) => c.type === 'recommendation' && c.status !== 'rejected' && c.status !== 'merged' && key(c.directedAt) === key(target)).length;
  // every broad target: those still matching nobody, and those with links
  const targets = [...new Map([...map.unmatched.map((u) => u.target), ...map.links.map((l) => l.target)].map((t) => [key(t), t])).values()];
  const waiting = map.links.filter((l) => l.status === 'suggested').length;
  const failed = (title: string) => (e: Error) => toast.push({ title, body: e.message });

  return (
    <section className="border-t border-border px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">Broad targets</h3>
          <p className="mt-0.5 max-w-2xl text-xs text-hint">
            Calls aimed at a group rather than one organisation. Link each to the organisations here that belong to it; only confirmed links count
            {waiting ? `. ${waiting} suggestion${waiting === 1 ? '' : 's'} to review.` : '.'}
          </p>
        </div>
        <button
          type="button"
          disabled={!aiReady || links.suggest.isPending || map.unmatched.length === 0}
          title={!aiReady ? 'AI analysis is not set up on the server' : map.unmatched.length === 0 ? 'Every broad target has links' : undefined}
          onClick={() =>
            links.suggest.mutate(undefined, {
              onSuccess: (r) => toast.push({ title: r.added ? 'Links suggested' : 'Nothing new to suggest', body: r.message, leading: { kind: 'icon', icon: SparklesIcon, tone: 'success' } }),
              onError: failed('Not suggested'),
            })
          }
          className={buttonClass({ style: 'outline', color: 'gray' })}
        >
          <SparklesIcon className="size-4" />
          {links.suggest.isPending ? 'Suggesting…' : 'Suggest with AI'}
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {targets.map((target) => {
          const mine = map.links.filter((l) => key(l.target) === key(target));
          const linked = new Set(mine.map((l) => key(l.organisation)));
          const addable = map.stakeholders.filter((s) => !linked.has(key(s.name)));
          const n = callsTo(target);
          return (
            <li key={key(target)} className="rounded-lg border border-border p-3">
              <p className="text-sm text-ink">
                {target} <span className="text-xs text-hint">· {n} {n === 1 ? 'call' : 'calls'}</span>
              </p>
              {mine.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {mine.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <Tag tone={l.status === 'confirmed' ? 'green' : 'gold'}>{l.status === 'confirmed' ? 'Linked' : 'Suggested'}</Tag>
                      <span className="text-ink-soft">{l.organisation}</span>
                      {l.reason && <span className="text-xs text-hint">· {l.reason}</span>}
                      <span className="ml-auto flex gap-1">
                        {l.status === 'suggested' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => links.set.mutate({ id: l.id, status: 'confirmed' }, { onError: failed('Not confirmed') })}
                            className={buttonClass({ style: 'soft', color: 'green' })}
                          >
                            <CheckIcon className="size-4" />
                            Confirm
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => links.set.mutate({ id: l.id, status: 'rejected' }, { onError: failed('Not changed') })}
                          className={buttonClass({ style: 'borderless', color: 'gray', className: 'hover:text-danger' })}
                        >
                          <XMarkIcon className="size-4" />
                          {l.status === 'suggested' ? 'Reject' : 'Unlink'}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {addable.length > 0 && (
                <div className="mt-2 w-full sm:w-80">
                  <Select
                    label={`Link an organisation to ${target}`}
                    value=""
                    options={[{ value: '', label: 'Link an organisation…' }, ...addable.map((s) => ({ value: s.name, label: s.name }))]}
                    onChange={(organisation) => {
                      if (organisation) links.add.mutate({ target, organisation }, { onError: failed('Not linked') });
                    }}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
