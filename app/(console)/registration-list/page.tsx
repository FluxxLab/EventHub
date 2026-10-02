'use client';

import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckIcon, ClipboardDocumentIcon, MagnifyingGlassIcon, PencilSquareIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { EntryDialog } from '@/components/registration/entry-dialog';
import { ImportDialog } from '@/components/registration/import-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Tag, type TagTone } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { TIER_LABEL, type DelegateTier } from '@/lib/delegates/delegates';
import { entriesCsv, filterEntries, statusOf, type EntryStatus, type RegistrationEntry } from '@/lib/registration/registration';
import { useRegistrationActions, useRegistrationList } from '@/lib/registration/use-registration';
import { cn } from '@/lib/utils';

const cardClass =
  'overflow-hidden rounded-2xl border border-border bg-surface shadow-lg';
const th = 'h-15 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';
const TIER_TONE: Record<DelegateTier, TagTone> = { standard: 'gray', vip: 'gold', vvip: 'gold', press: 'primary' };
const TABS: { value: EntryStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'claimed', label: 'Claimed' },
];

/** The code with a copy button that confirms for a moment. */
function CodeCell({ code }: { code: string | null }) {
  const [copied, setCopied] = useState(false);
  if (!code) return <span className="text-placeholder">None</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked: the code is on screen to copy by hand
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <code className="rounded bg-[#f1f1f1] px-1.5 py-0.5 font-mono text-xs text-ink">{code}</code>
      <button type="button" onClick={() => void copy()} aria-label={`Copy code ${code}`} title="Copy" className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-7' })}>
        {copied ? <CheckIcon className="size-4 text-success" /> : <ClipboardDocumentIcon className="size-4" />}
      </button>
    </span>
  );
}

function downloadCsv(entries: RegistrationEntry[]) {
  const url = URL.createObjectURL(new Blob([entriesCsv(entries)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `pic-registration-list-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function RegistrationListPage() {
  const list = useRegistrationList();
  const { remove } = useRegistrationActions();
  const toast = useToast();
  const [status, setStatus] = useState<EntryStatus | 'all'>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ entry: RegistrationEntry | null } | null>(null);
  const [importing, setImporting] = useState(false);
  const [deleting, setDeleting] = useState<RegistrationEntry | null>(null);

  const all = useMemo(() => list.data ?? [], [list.data]);
  const rows = useMemo(() => filterEntries(all, { status, query }), [all, status, query]);
  const count = (s: EntryStatus | 'all') => (s === 'all' ? all.length : all.filter((e) => statusOf(e) === s).length);

  const confirmDelete = () =>
    deleting &&
    remove.mutate(deleting.id, {
      onSuccess: () => {
        toast.push({ title: 'Invite removed', leading: { kind: 'icon', icon: TrashIcon }, body: `${deleting.name ?? deleting.email ?? 'The invite'} no longer grants a tier at sign-up.` });
        setDeleting(null);
      },
    });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="sr-only">Registration list</h1>
      <section aria-labelledby="reg-title" className={cardClass}>
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border p-6">
          <div>
            <h2 id="reg-title" className="flex items-center gap-2 text-xl font-medium text-ink">
              Registration list
              {list.data && <Tag>{all.length}</Tag>}
            </h2>
            <p className="mt-0.5 text-sm text-[#7c7c7c]">Pre-approved invitees. Signing up with a listed email or code grants the tier, with no review.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => downloadCsv(rows)} disabled={rows.length === 0} className={buttonClass({ style: 'soft', color: 'gray' })}>
              <ArrowDownTrayIcon className="size-4" />
              Export
            </button>
            <button type="button" onClick={() => setImporting(true)} className={buttonClass({ style: 'outline', color: 'gray' })}>
              <ArrowUpTrayIcon className="size-4" />
              Import CSV
            </button>
            <button type="button" onClick={() => setEditing({ entry: null })} className={buttonClass()}>
              <PlusIcon className="size-4" />
              Add invite
            </button>
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-6 py-3">
          <div role="tablist" aria-label="Status" className="flex gap-1 rounded-lg bg-[#f1f1f1] p-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={status === t.value}
                onClick={() => setStatus(t.value)}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                  status === t.value ? 'bg-surface font-medium text-ink shadow-[0_1px_2px_rgba(16,24,40,0.08)]' : 'text-[#525252] hover:text-ink',
                )}
              >
                {t.label}
                <Tag tone={status === t.value ? 'primary' : 'gray'}>{count(t.value)}</Tag>
              </button>
            ))}
          </div>
          <TextInput icon={MagnifyingGlassIcon} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, organisation or code" aria-label="Search invites" className="w-72" />
        </div>

        {list.isError && !list.data ? (
          <div role="alert" className="p-10 text-center">
            <p className="font-medium text-ink">The registration list could not load.</p>
            <p className="mt-1 text-sm text-muted">{list.error.message}</p>
            <button type="button" onClick={() => void list.refetch()} className={buttonClass({ className: 'mt-4' })}>
              Try again
            </button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[60rem] border-collapse">
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    Invitee
                  </th>
                  <th scope="col" className={th}>
                    Organisation
                  </th>
                  <th scope="col" className={th}>
                    Tier
                  </th>
                  <th scope="col" className={th}>
                    Invite code
                  </th>
                  <th scope="col" className={th}>
                    Status
                  </th>
                  <th scope="col" className={cn(th, 'w-24')}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody aria-busy={list.isPending}>
                {list.isPending ? (
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i} className="even:bg-[#f6f6f6]">
                      <td colSpan={6} className={td}>
                        <Skeleton className="h-8" />
                      </td>
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-sm text-muted">
                      {all.length === 0 ? (
                        <>
                          No invites yet. Add VIPs, press and guests so they get the right tier when they sign up.{' '}
                          <button type="button" onClick={() => setEditing({ entry: null })} className="font-medium text-primary hover:underline">
                            Add the first one
                          </button>
                        </>
                      ) : (
                        'No invites match these filters.'
                      )}
                    </td>
                  </tr>
                ) : (
                  rows.map((e) => {
                    const claimed = statusOf(e) === 'claimed';
                    return (
                      <tr key={e.id} className="even:bg-[#f6f6f6] last:[&>td]:border-b-0">
                        <td className={td}>
                          <p className="text-[#525252]">{e.name ?? <span className="text-placeholder">No name</span>}</p>
                          <p className="text-xs text-placeholder">{e.email ?? 'Matched by code only'}</p>
                        </td>
                        <td className={cn(td, 'max-w-56')}>
                          {e.organisation ? (
                            <>
                              <p className="truncate text-[#525252]">{e.organisation}</p>
                              {e.title && <p className="truncate text-xs text-placeholder">{e.title}</p>}
                            </>
                          ) : (
                            <span className="text-placeholder">Not given</span>
                          )}
                        </td>
                        <td className={td}>
                          <Tag tone={TIER_TONE[e.assignedTier]}>{TIER_LABEL[e.assignedTier]}</Tag>
                        </td>
                        <td className={td}>
                          <CodeCell code={e.inviteCode} />
                        </td>
                        <td className={td}>
                          {claimed ? (
                            <Tag tone="green" dot>
                              Claimed {new Date(e.claimedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                            </Tag>
                          ) : (
                            <Tag tone="gray" dot>
                              Waiting
                            </Tag>
                          )}
                        </td>
                        <td className={cn(td, 'text-right')}>
                          <div className="flex justify-end gap-1">
                            <button type="button" onClick={() => setEditing({ entry: e })} aria-label={`Edit ${e.name ?? e.email ?? 'invite'}`} title="Edit" className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true })}>
                              <PencilSquareIcon className="size-4" />
                            </button>
                            <button type="button" onClick={() => setDeleting(e)} aria-label={`Remove ${e.name ?? e.email ?? 'invite'}`} title="Remove" className={buttonClass({ style: 'borderless', color: 'danger', iconOnly: true })}>
                              <TrashIcon className="size-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <EntryDialog open={!!editing} onClose={() => setEditing(null)} entry={editing?.entry ?? null} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      <ConfirmDialog
        open={!!deleting}
        title={`Remove ${deleting?.name ?? deleting?.email ?? 'this invite'}?`}
        confirmLabel="Remove invite"
        pendingLabel="Removing…"
        pending={remove.isPending}
        tone="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      >
        {deleting?.claimedAt
          ? 'They have already signed up, so their account and tier stay. The invite just leaves this list.'
          : 'Their email or code will no longer grant a tier. If they sign up, they are reviewed like anyone else.'}
      </ConfirmDialog>
    </div>
  );
}
