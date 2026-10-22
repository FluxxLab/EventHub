'use client';

import {
  ArrowDownTrayIcon,
  BuildingStorefrontIcon,
  CheckBadgeIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  DevicePhoneMobileIcon,
  FireIcon,
  GiftIcon,
  PlusIcon,
  PrinterIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline';
import QRCode from 'qrcode';
import { useId, useMemo, useState } from 'react';

import { BoothDialog } from '@/components/passport/booth-dialog';
import { LeadLinkDialog } from '@/components/passport/lead-link-dialog';
import { FigureCard } from '@/components/dashboard/stat-card';
import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { RowActions } from '@/components/ui/row-actions';
import { EmptyState, ErrorState } from '@/components/ui/states';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/toaster';
import { ScrollHints } from '@/components/ui/scroll-hints';
import { tableScroll, tableScrollFocus } from '@/components/ui/table-scroll';
import { runsEvents, useSession } from '@/lib/auth/session';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { count } from '@/lib/format';
import { MAX_DRAW, passportTotals, signsHtml, stampLink, type Booth, type DrawEntry } from '@/lib/passport/passport';
import { useBoothActions, useBooths } from '@/lib/passport/use-passport';
import { downloadCsv, leadsCsv } from '@/lib/leads/leads';
import { useLeadLinkActions, useLeadSummary } from '@/lib/leads/use-leads';
import { cn } from '@/lib/utils';

const th = 'h-12 border-b border-border bg-surface-soft px-4 text-left text-sm font-normal text-ink-soft';
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

function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1">
      <code className="rounded bg-surface-soft px-1.5 py-0.5 font-mono text-sm tracking-wider text-ink">{code}</code>
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard.writeText(code).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        aria-label={`Copy code ${code}`}
        className="rounded p-1 text-hint hover:text-ink"
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
    <Panel
      title={
        <>
          <GiftIcon className="size-5 text-primary" /> Prize draw
        </>
      }
      description={`Random delegates who stamped all ${activeStands} active stands.`}
    >
      <div className="flex items-end gap-2 px-6 py-4">
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
      {error && (
        <p role="alert" className="px-6 pb-4 text-sm text-danger">
          {error}
        </p>
      )}
      {winners &&
        (winners.length === 0 ? (
          <p className="border-t border-border px-6 py-4 text-sm text-hint">Nobody has a full passport yet.</p>
        ) : (
          <>
            <ol className="divide-y divide-border border-t border-border">
              {winners.map((w, i) => (
                <li key={w.id} className="flex gap-3 px-6 py-3">
                  <span className="w-4 shrink-0 text-right text-sm tabular-nums text-hint">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{w.name}</p>
                    <p className="truncate text-xs text-hint">{[w.organisation, w.email].filter(Boolean).join(' · ')}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="border-t border-border px-6 py-3">
              <button type="button" onClick={copy} className="flex items-center gap-1.5 text-xs text-ink-soft hover:text-ink">
                {copied ? <CheckIcon className="size-4 text-success" /> : <ClipboardDocumentIcon className="size-4" />}
                {copied ? 'Copied' : 'Copy the list'}
              </button>
            </div>
          </>
        ))}
    </Panel>
  );
}

export default function PassportPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && runsEvents(auth.user.tier);
  const working = useWorkingEdition();
  const editions = working.editions;
  const edition = working.edition;
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
      onSuccess: (leads) =>
        downloadCsv(
          `${event}-exhibition-leads.csv`,
          leadsCsv(leads, (id) => all.find((b) => b.id === id)?.name ?? 'Removed stand'),
        ),
      onError: (e) => toast.push({ title: 'Leads not exported', body: e.message }),
    });
  const print = async (list: Booth[]) => {
    if (!(await printSigns(list, event)))
      toast.push({ title: 'Printing blocked', body: 'Allow pop-ups for the console, then try again.', leading: { kind: 'icon', icon: PrinterIcon, tone: 'danger' } });
  };

  const addStand = (
    <button type="button" onClick={() => setEditing({ booth: null })} className={buttonClass({ className: 'h-9' })}>
      <PlusIcon className="size-4" />
      Add stand
    </button>
  );

  if (!isAdmin) {
    return <EmptyState framed icon={QrCodeIcon} title="The passport is managed by organisers" />;
  }
  if (editions.isPending || booths.isPending) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (booths.isError && !booths.data) {
    return <ErrorState framed title="Stands could not load" error={booths.error} onRetry={() => void booths.refetch()} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
        <FigureCard label="Active stands" icon={BuildingStorefrontIcon} value={`${totals.active} of ${totals.total}`} note="A full passport means every active stand" />
        <FigureCard label="Stamps collected" icon={CheckBadgeIcon} value={count(totals.stamps)} />
        {/* a name, not a figure: set smaller so it fits, on the number's line so the cards stay level */}
        <FigureCard
          label="Busiest stand"
          icon={FireIcon}
          value={
            totals.busiest ? (
              <span className="text-lg" title={totals.busiest.name}>
                {totals.busiest.name}
              </span>
            ) : (
              '–'
            )
          }
          note={totals.busiest ? `${count(totals.busiest.stamps)} stamps` : undefined}
        />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel
          title="Stands"
          count={all.length}
          footer={all.some((b) => !b.isActive) && <p className="text-xs">A stand switched off keeps its stamps but no longer counts towards a full passport.</p>}
          actions={
            <>
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
              {addStand}
            </>
          }
        >
          {all.length === 0 ? (
            <EmptyState icon={QrCodeIcon} title="No stands yet" body="Each stand gets a code and a sign delegates scan to stamp their passport." action={addStand} />
          ) : (
            <div {...tableScroll} className={`relative overflow-x-auto ${tableScrollFocus}`}>
              <ScrollHints />
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
                    <th scope="col" className={cn(th, 'w-40')}>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((b) => (
                    <tr key={b.id} className={cn('even:bg-surface-soft last:[&>td]:border-b-0', !b.isActive && 'text-hint')}>
                      <td className={td}>
                        <p className={b.isActive ? 'text-ink' : 'text-hint'}>{b.name}</p>
                        {b.location && <p className="text-xs text-hint">{b.location}</p>}
                      </td>
                      <td className={td}>
                        <CopyCode code={b.code} />
                      </td>
                      <td className={cn(td, 'text-right tabular-nums')}>{count(b.stamps)}</td>
                      <td className={cn(td, 'text-right tabular-nums')}>
                        {count(leadsFor(b.id)?.leads ?? 0)}
                        {!leadsFor(b.id)?.linkCreatedAt && <span className="block text-[0.6875rem] text-hint">no scanner</span>}
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
                        {/* printing the sign is the job here; the rest wait in the menu */}
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => void print([b])}
                            aria-label={`Print the sign for ${b.name}`}
                            className={buttonClass({ style: 'borderless', color: 'gray', className: 'h-8' })}
                          >
                            <PrinterIcon className="size-4" />
                            Print sign
                          </button>
                          <RowActions
                            name={b.name}
                            actions={[{ label: 'Lead scanner', icon: DevicePhoneMobileIcon, onSelect: () => setScanner(b) }]}
                            onEdit={() => setEditing({ booth: b })}
                            onDelete={() => setDeleting(b)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <PrizeDraw activeStands={totals.active} drawing={draw.isPending} winners={draw.data ?? null} error={draw.error?.message ?? null} onDraw={(n) => draw.mutate(n)} />
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
                if (!editing?.booth)
                  toast.push({ title: 'Stand added', body: `${saved.name} has the code ${saved.code}. Print its sign from the list.`, leading: { kind: 'icon', icon: QrCodeIcon, tone: 'success' } });
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
        onConfirm={() => deleting && remove.mutate({ id: deleting.id }, { onSuccess: () => setDeleting(null), onError: (e) => toast.push({ title: 'Not deleted', body: e.message }) })}
      >
        {deleting?.stamps
          ? `Its ${count(deleting.stamps)} stamps are deleted too, and passports that counted it change. To stop it counting but keep the record, switch it off instead.`
          : 'Its printed sign stops working.'}
      </ConfirmDialog>
    </div>
  );
}
