'use client';

import { ArrowUpTrayIcon, CheckCircleIcon, DocumentArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useRef, useState, type ChangeEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Tag } from '@/components/ui/tag';
import { useToast } from '@/components/ui/toaster';
import { TIER_LABEL } from '@/lib/delegates/delegates';
import { entrySchema, importRows, toEntryBody, type ImportRow } from '@/lib/registration/registration';
import { useRegistrationActions } from '@/lib/registration/use-registration';

type Stage = { kind: 'pick' } | { kind: 'preview'; file: string; rows: ImportRow[] } | { kind: 'running'; total: number; done: number } | { kind: 'done'; added: number; failed: { line: number; reason: string }[] };

const TEMPLATE = 'name,email,organisation,title,tier,code\nSarah Kimani,sarah@unwomen.org,UN Women,Programme Officer,press,\n';

/**
 * Bulk import from a CSV: pick a file, check every row before anything is sent, add the valid
 * ones one by one with progress, then report any the server refused (for example a duplicate email).
 */
export function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [problem, setProblem] = useState<string | null>(null);
  const { importMany } = useRegistrationActions();
  const toast = useToast();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => {
    if (stage.kind === 'running') return;
    setStage({ kind: 'pick' });
    setProblem(null);
    onClose();
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const { rows, missingHeader } = importRows(await file.text());
    if (missingHeader) return setProblem('The first row must name the columns, with at least “name” or “email”. Download the template to see the layout.');
    if (rows.length === 0) return setProblem('That file has a header but no rows.');
    setProblem(null);
    setStage({ kind: 'preview', file: file.name, rows });
  };

  const run = (rows: ImportRow[]) => {
    const valid = rows.filter((r) => !r.error).map((r) => ({ line: r.line, body: toEntryBody(entrySchema.parse(r.form), { update: false }) }));
    setStage({ kind: 'running', total: valid.length, done: 0 });
    importMany.mutate(
      { rows: valid, onProgress: (done) => setStage({ kind: 'running', total: valid.length, done }) },
      {
        onSuccess: (result) => {
          setStage({ kind: 'done', ...result });
          toast.push({ title: 'Import finished', leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' }, body: `${result.added} invites added${result.failed.length ? `, ${result.failed.length} refused` : ''}.` });
        },
      },
    );
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'registration-list-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const id = (name: string) => `${baseId}-${name}`;
  const valid = stage.kind === 'preview' ? stage.rows.filter((r) => !r.error).length : 0;
  const invalid = stage.kind === 'preview' ? stage.rows.length - valid : 0;

  return (
    <dialog
      ref={ref}
      aria-labelledby={id('title')}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className={modalClass('lg')}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={ArrowUpTrayIcon}
            title="Import invites from CSV"
            titleId={id('title')}
            subtitle="Columns: name, email, organisation, title, tier, code. Every row is checked before anything is added."
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3 scrollbar-thin">
          {stage.kind === 'pick' && (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-[#bdbdbd] px-6 py-10 text-center">
              <DocumentArrowUpIcon className="size-10 text-[#7c7c7c]" />
              <p className="text-sm text-ink">Choose a CSV file exported from a spreadsheet.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className={buttonClass()}>
                  <ArrowUpTrayIcon className="size-4" />
                  Choose file
                </button>
                <button type="button" onClick={downloadTemplate} className={buttonClass({ style: 'outline', color: 'gray' })}>
                  Download template
                </button>
              </div>
              {problem && (
                <p role="alert" className="text-sm text-danger">
                  {problem}
                </p>
              )}
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => void pick(e)} className="hidden" aria-hidden tabIndex={-1} />
            </div>
          )}

          {stage.kind === 'preview' && (
            <div className="flex flex-col gap-3">
              <p className="flex flex-wrap items-center gap-2 text-sm text-[#525252]">
                <span className="font-medium text-ink">{stage.file}</span>
                <Tag tone="green">{valid} ready</Tag>
                {invalid > 0 && <Tag tone="danger">{invalid} with problems</Tag>}
              </p>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-[#f6f6f6] text-left text-[#525252]">
                      <th className="px-3 py-2 font-normal">Row</th>
                      <th className="px-3 py-2 font-normal">Invitee</th>
                      <th className="px-3 py-2 font-normal">Tier</th>
                      <th className="px-3 py-2 font-normal">Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage.rows.slice(0, 200).map((r) => (
                      <tr key={r.line} className="border-t border-border">
                        <td className="px-3 py-2 tabular-nums text-[#7c7c7c]">{r.line}</td>
                        <td className="px-3 py-2">
                          <p className="text-[#525252]">{r.form.name || '—'}</p>
                          <p className="text-xs text-placeholder">{r.form.email || (r.form.inviteCode ? `Code ${r.form.inviteCode}` : 'Code generated')}</p>
                        </td>
                        <td className="px-3 py-2 text-[#525252]">{TIER_LABEL[r.form.assignedTier]}</td>
                        <td className="px-3 py-2">
                          {r.error ? (
                            <span className="flex items-start gap-1.5 text-xs text-danger">
                              <ExclamationTriangleIcon className="size-4 shrink-0" />
                              {r.error}
                            </span>
                          ) : (
                            <span className="text-xs text-success">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {stage.rows.length > 200 && <p className="text-xs text-[#7c7c7c]">Showing the first 200 of {stage.rows.length} rows; all are checked.</p>}
            </div>
          )}

          {stage.kind === 'running' && (
            <div className="flex flex-col gap-3 py-6" aria-live="polite">
              <p className="text-sm text-ink">
                Adding invites… {stage.done} of {stage.total}
              </p>
              <span className="block h-2 overflow-hidden rounded-full bg-[#ececec]">
                <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${stage.total ? (stage.done / stage.total) * 100 : 100}%` }} />
              </span>
              <p className="text-xs text-[#7c7c7c]">Keep this window open until it finishes.</p>
            </div>
          )}

          {stage.kind === 'done' && (
            <div className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm text-ink">
                <CheckCircleIcon className="size-5 text-success" />
                {stage.added} {stage.added === 1 ? 'invite' : 'invites'} added.
              </p>
              {stage.failed.length > 0 && (
                <div className="rounded-lg border border-danger/30 bg-danger-soft p-3">
                  <p className="text-sm text-danger">{stage.failed.length} refused by the server:</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-danger">
                    {stage.failed.map((f) => (
                      <li key={f.line}>
                        Row {f.line}: {f.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          {(stage.kind === 'pick' || stage.kind === 'preview') && (
            <button type="button" onClick={close} className={cancelClass}>
              Cancel
            </button>
          )}
          {stage.kind === 'preview' && (
            <>
              <button type="button" onClick={() => setStage({ kind: 'pick' })} className={buttonClass({ style: 'outline', color: 'gray' })}>
                Choose another file
              </button>
              <button type="button" onClick={() => run(stage.rows)} disabled={valid === 0} className={buttonClass()}>
                Add {valid} {valid === 1 ? 'invite' : 'invites'}
              </button>
            </>
          )}
          {stage.kind === 'done' && (
            <button type="button" onClick={close} className={buttonClass()}>
              Done
            </button>
          )}
        </ModalActions>
      </div>
    </dialog>
  );
}
