'use client';

import { ArrowDownTrayIcon, CheckIcon, ClipboardDocumentIcon, DevicePhoneMobileIcon, GiftIcon, PencilSquareIcon, PlusIcon, PrinterIcon, QrCodeIcon, TrashIcon } from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import { useId, useMemo, useState } from 'react';

import { BoothDialog } from '@/components/passport/booth-dialog';
import { LeadLinkDialog } from '@/components/passport/lead-link-dialog';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { runsEvents, useSession } from '@/lib/auth/session';
import { useEditions } from '@/lib/events/use-editions';
import { count } from '@/lib/format';
import { MAX_DRAW, passportTotals, signsHtml, stampLink, type Booth, type DrawEntry } from '@/lib/passport/passport';
import { useBoothActions, useBooths } from '@/lib/passport/use-passport';
import { downloadCsv, leadsCsv } from '@/lib/leads/leads';
import { useLeadLinkActions, useLeadSummary } from '@/lib/leads/use-leads';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';
const th = 'h-12 border-b border-border bg-[#f6f6f6] px-4 text-left text-sm font-normal text-[#525252]';
const td = 'border-b border-border px-4 py-3 text-sm align-middle';

/** Opens the print dialog with one A4 sign per stand (QR the app scans, and the code in large type). */
async function printSigns(booths: Booth[], event: string): Promise<boolean> {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) return false;
  const svgs = Object.fromEntries(
    await Promise.all(booths.map(async (b) => [b.id, await QRCode.toString(stampLink(b.code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#002d74' } })] as const)),
  );
  win.document.write(signsHtml(booths, svgs, event));
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
  return true;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-4">
      <p className="text-sm text-[#525252]">{label}</p>
      <p className="mt-1 truncate text-2xl font-medium tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 truncate text-xs text-[#7c7c7c]">{hint}</p>}
    </div>
  );
}

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <code className="rounded bg-[#f1f1f1] px-1.5 py-0.5 font-mono text-sm tracking-wider text-ink">{code}</code>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        aria-label={`Copy code ${code}`}
        className="rounded p-1 text-[#7c7c7c] hover:text-ink"
      >
        {copied ? <CheckIcon className="size-4 text-success" /> : <ClipboardDocumentIcon className="size-4" />}
      </button>
    </span>
  );
}

/** Random winners among delegates who stamped every active stand. */
function PrizeDraw({ activeStands, onDraw, drawing, winners, error }: { activeStands: number; onDraw: (n: number) => void; drawing: boolean; winners: DrawEntry[] | null; error: string | null }) {
  const id = useId();
  const [n, setN] = useState('3');
  const [copied, setCopied] = useState(false);
  const value = Math.min(MAX_DRAW, Math.max(1, Number.parseInt(n, 10) || 1));
  const copy = () =>
    winners &&
    void navigator.clipboard.writeText(winners.map((w) => [w.name, w.organisation ?? '', w.email].filter(Boolean).join(', ')).join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <section aria-labelledby={`${id}-t`} className={cardClass}>
      <header className="border-b border-border px-5 py-4">
        <h2 id={`${id}-t`} className="flex items-center gap-2 text-base font-medium text-ink">
          <GiftIcon className="size-5 text-primary" /> Prize draw
        </h2>
        <p className="text-xs text-[#7c7c7c]">Random delegates who stamped all {activeStands} active stands.</p>
      </header>
      <div className="flex items-end gap-2 px-5 py-4">
        <div className="w-24">
          <label htmlFor={`${id}-n`} className="mb-1 block text-sm text-ink">
            Winners
          </label>
          <TextInput id={`${id}-n`} type="number" min={1} max={MAX_DRAW} value={n} onChange={(e) => setN(e.target.value)} />
        </div>
        <button type="button" onClick={() => onDraw(value)} disabled={drawing || activeStands === 0} className={buttonClass({ className: 'flex-1' })}>
          {drawing ? 'Drawing…' : winners ? 'Draw again' : 'Draw'}
        </button>
      </div>
      {error && <p className="px-5 pb-4 text-sm text-danger">{error}</p>}
      {winners &&
        (winners.length === 0 ? (
          <p className="border-t border-border px-5 py-4 text-sm text-[#7c7c7c]">Nobody has a full passport yet.</p>
        ) : (
          <>
            <ol className="divide-y divide-border border-t border-border">
              {winners.map((w, i) => (
                <li key={w.id} className="flex gap-3 px-5 py-3">
                  <span className="w-4 shrink-0 text-right text-sm tabular-nums text-[#7c7c7c]">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{w.name}</p>
                    <p className="truncate text-xs text-[#7c7c7c]">{[w.organisation, w.email].filter(Boolean).join(' · ')}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-border px-5 py-2.5">
              <button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs text-[#525252] hover:text-ink">
                {copied ? <CheckIcon className="size-4 text-success" /> : <ClipboardDocumentIcon className="size-4" />}
                {copied ? 'Copied' : 'Copy the list'}
              </button>
            </div>
          </>
        ))}
    </section>
  );
}

export default function PassportPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const editions = useEditions();
  const edition = editions.data?.find((e) => e.isCurrent) ?? editions.data?.[0];
  const booths = useBooths(edition?.id, isAdmin);
  const { save, setActive, remove, draw } = useBoothActions(edition?.id);
  const toast = useToast();
  const [editing, setEditing] = useState<{ booth: Booth | null } | null>(null);
  const [deleting, setDeleting] = useState<Booth | null>(null);
  const [scanner, setScanner] = useState<Booth | null>(null);
  const leadSummary = useLeadSummary(edition?.id ?? '');
  const leadLinks = useLeadLinkActions(edition?.id ?? '');
  const leadsFor = (id: string) => leadSummary.data?.find((s) => s.boothId === id);
  const totalLeads = (leadSummary.data ?? []).reduce((n, s) => n + s.leads, 0);

  const all = useMemo(() => [...(booths.data ?? [])].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)), [booths.data]);
  const totals = passportTotals(all);
  const event = edition?.shortName ?? 'PIC Events';
  const exportLeads = () =>
    leadLinks.exportAll.mutate(undefined, {
      onSuccess: (leads) => downloadCsv(`${event}-exhibition-leads.csv`, leadsCsv(leads, (id) => all.find((b) => b.id === id)?.name ?? 'Removed stand')),
      onError: (e) => toast.push({ title: 'Leads not exported', body: e.message }),
    });
  const print = async (list: Booth[]) => {
    if (!(await printSigns(list, event))) toast.push({ title: 'Printing blocked', body: 'Allow pop-ups for the console, then try again.', leading: { kind: 'icon', icon: PrinterIcon, tone: 'danger' } });
  };

  if (!isAdmin) {
    return (
      <div className={cn(cardClass, 'mx-auto max-w-lg p-10 text-center')}>
        <QrCodeIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 font-medium text-ink">The passport is managed by organisers</p>
      </div>
    );
  }
  if (editions.isPending || booths.isPending) return <Skeleton className="mx-auto h-96 w-full max-w-6xl rounded-2xl" />;
  if (booths.isError && !booths.data) {
    return (
      <div role="alert" className="mx-auto max-w-6xl rounded-2xl border border-border bg-surface p-10 text-center">
        <p className="font-medium text-ink">Stands could not load.</p>
        <p className="mt-1 text-sm text-muted">{booths.error.message}</p>
        <button type="button" onClick={() => void booths.refetch()} className={buttonClass({ className: 'mt-4' })}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3">
        <Stat label="Active stands" value={`${totals.active} of ${totals.total}`} hint="A full passport means every active stand" />
        <Stat label="Stamps collected" value={count(totals.stamps)} />
        <Stat label="Busiest stand" value={totals.busiest?.name ?? '–'} hint={totals.busiest ? `${count(totals.busiest.stamps)} stamps` : undefined} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section aria-labelledby="stands-title" className={cardClass}>
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3">
            <h2 id="stands-title" className="text-base font-medium text-ink">
              Stands
            </h2>
            <div className="flex gap-2">
              {totalLeads > 0 && (
                <button type="button" onClick={exportLeads} disabled={leadLinks.exportAll.isPending} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9' })}>
                  <ArrowDownTrayIcon className="size-4" />
                  Export {count(totalLeads)} leads
                </button>
              )}
              {all.length > 0 && (
                <button type="button" onClick={() => void print(all.filter((b) => b.isActive))} className={buttonClass({ style: 'outline', color: 'gray', className: 'h-9' })}>
                  <PrinterIcon className="size-4" />
                  Print all signs
                </button>
              )}
              <button type="button" onClick={() => setEditing({ booth: null })} className={buttonClass({ className: 'h-9' })}>
                <PlusIcon className="size-4" />
                Add stand
              </button>
            </div>
          </header>

          {all.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <QrCodeIcon className="size-8 text-[#7c7c7c]" />
              <p className="max-w-sm text-sm text-[#7c7c7c]">Add each exhibition stand. Each gets a code; print its sign, and delegates scan it to stamp their passport.</p>
            </div>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[46rem] border-collapse">
                <thead>
                  <tr>
                    <th scope="col" className={th}>
                      Stand
                    </th>
                    <th scope="col" className={th}>
                      Code
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      Stamps
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      Leads
                    </th>
                    <th scope="col" className={th}>
                      Counts
                    </th>
                    <th scope="col" className={cn(th, 'w-32')}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((b) => (
                    <tr key={b.id} className={cn('even:bg-[#f6f6f6] last:[&>td]:border-b-0', !b.isActive && 'text-[#7c7c7c]')}>
                      <td className={td}>
                        <p className={b.isActive ? 'text-ink' : 'text-[#7c7c7c]'}>{b.name}</p>
                        {b.location && <p className="text-xs text-[#7c7c7c]">{b.location}</p>}
                      </td>
                      <td className={td}>
                        <CopyCode code={b.code} />
                      </td>
                      <td className={cn(td, 'text-right tabular-nums')}>{count(b.stamps)}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>
                        {count(leadsFor(b.id)?.leads ?? 0)}
                        {!leadsFor(b.id)?.linkCreatedAt && <span className="block text-[11px] text-[#7c7c7c]">no scanner</span>}
                      </td>
                      <td className={td}>
                        <Switch
                          checked={b.isActive}
                          label={`${b.name} counts towards a full passport`}
                          disabled={setActive.isPending}
                          onChange={(isActive) => setActive.mutate({ id: b.id, isActive }, { onError: (e) => toast.push({ title: 'Not changed', body: e.message }) })}
                        />
                      </td>
                      <td className={cn(td, 'text-right')}>
                        <div className="flex justify-end">
                          <button type="button" onClick={() => setScanner(b)} aria-label={`Lead scanner for ${b.name}`} title="Lead scanner" className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                            <DevicePhoneMobileIcon className="size-4" />
                          </button>
                          <button type="button" onClick={() => void print([b])} aria-label={`Print the sign for ${b.name}`} title="Print sign" className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                            <PrinterIcon className="size-4" />
                          </button>
                          <button type="button" onClick={() => setEditing({ booth: b })} aria-label={`Edit ${b.name}`} title="Edit" className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8' })}>
                            <PencilSquareIcon className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleting(b)}
                            aria-label={`Delete ${b.name}`}
                            title="Delete"
                            className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'size-8 hover:text-danger' })}
                          >
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {all.some((b) => !b.isActive) && (
            <p className="border-t border-border px-5 py-2.5 text-xs text-[#7c7c7c]">A stand switched off keeps its stamps but no longer counts towards a full passport.</p>
          )}
        </section>

        <PrizeDraw
          activeStands={totals.active}
          drawing={draw.isPending}
          winners={draw.data ?? null}
          error={draw.error?.message ?? null}
          onDraw={(n) => draw.mutate(n)}
        />
      </div>

      <LeadLinkDialog
        booth={scanner}
        summary={scanner ? leadsFor(scanner.id) : undefined}
        pending={leadLinks.issue.isPending || leadLinks.revoke.isPending}
        onIssue={async () => (await leadLinks.issue.mutateAsync(scanner!.id)).key}
        onRevoke={() =>
          scanner &&
          leadLinks.revoke.mutate(scanner.id, {
            onSuccess: () => {
              toast.push({ title: 'Scanner link stopped', body: `${scanner.name}’s staff can no longer scan or see leads with it. Their leads are kept.` });
              setScanner(null);
            },
          })
        }
        onClose={() => setScanner(null)}
      />

      <BoothDialog
        open={!!editing}
        booth={editing?.booth ?? null}
        pending={save.isPending}
        error={save.error?.message ?? null}
        onSave={(body) =>
          save.mutate(
            { id: editing?.booth?.id, body },
            {
              onSuccess: (saved) => {
                setEditing(null);
                save.reset();
                if (!editing?.booth) toast.push({ title: 'Stand added', body: `${saved.name} has the code ${saved.code}. Print its sign from the list.`, leading: { kind: 'icon', icon: QrCodeIcon, tone: 'success' } });
              },
            },
          )
        }
        onClose={() => {
          setEditing(null);
          save.reset();
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name ?? 'this stand'}?`}
        confirmLabel="Delete stand"
        pendingLabel="Deleting…"
        pending={remove.isPending}
        tone="danger"
        onCancel={() => setDeleting(null)}
        onConfirm={() =>
          deleting &&
          remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null), onError: (e) => toast.push({ title: 'Not deleted', body: e.message }) })
        }
      >
        {deleting?.stamps
          ? `Its ${count(deleting.stamps)} stamps are deleted too, and passports that counted it change. To stop it counting but keep the record, switch it off instead.`
          : 'Its printed sign stops working.'}
      </ConfirmDialog>
    </div>
  );
}
