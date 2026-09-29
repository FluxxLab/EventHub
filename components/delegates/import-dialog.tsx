'use client';

import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, DocumentArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  buildRows,
  FIELD_LABEL,
  guessMapping,
  matchTier,
  MAX_ROWS,
  parseTable,
  PROBLEM_LABEL,
  reportCsv,
  sheetHasRows,
  tableFromSheet,
  tierValues,
  type ImportField,
  type Mapping,
  type SheetCell,
  type Table,
} from '@/lib/delegates/import';
import { useImportAttendees } from '@/lib/delegates/use-import';
import type { Edition } from '@/lib/events/events';
import { count } from '@/lib/format';
import { useTicketTypes } from '@/lib/ticketing/use-ticketing';
import { cn } from '@/lib/utils';

type Step = 'source' | 'columns' | 'review';
const NONE = '-1';
const COLUMN_FIELDS: ImportField[] = ['email', 'name', 'firstName', 'lastName', 'organisation', 'title', 'country', 'tier'];

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Import attendees into one event from a CSV (EventX, Eventbrite, a form, a hand-made sheet) or
 * cells pasted from Excel: match the columns, check every row, then issue their tickets.
 */
export function ImportDialog({ open, editions, initialEditionId, onClose }: { open: boolean; editions: Edition[]; initialEditionId: string | undefined; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const [editionId, setEditionId] = useState(initialEditionId ?? editions.find((e) => e.isCurrent)?.id ?? editions[0]?.id ?? '');
  const edition = editions.find((e) => e.id === editionId);
  const tiers = useTicketTypes(editionId || undefined);
  const tierList = useMemo(() => (tiers.data?.tiers ?? []).map((t) => ({ id: t.id, name: t.name })), [tiers.data]);
  const importer = useImportAttendees(editionId);

  const [step, setStep] = useState<Step>('source');
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState(false);
  const [workbook, setWorkbook] = useState<{ file: string; sheets: { name: string; data: SheetCell[][] }[]; picked: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<Table | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [tierChoice, setTierChoice] = useState<Record<string, string>>({});
  const [defaultTier, setDefaultTier] = useState<string>('');
  const [notify, setNotify] = useState(false);
  const [dragging, setDragging] = useState(false);

  const running = importer.progress.state === 'running';
  const finished = importer.progress.state === 'finished' || importer.progress.state === 'stopped';

  const reset = () => {
    setStep('source');
    setPasted('');
    setWorkbook(null);
    setFileName(null);
    setTable(null);
    setProblem(null);
    setMapping(null);
    setTierChoice({});
    setNotify(false);
    importer.reset();
  };
  const close = () => {
    if (running) return;
    reset();
    onClose();
  };

  const load = (text: string | Table, name: string | null) => {
    const t = typeof text === 'string' ? parseTable(text) : text;
    if (t.headers.length === 0 || t.rows.length === 0) return setProblem('That has no rows under a heading row. The first row should name the columns: Name, Email and so on.');
    if (t.rows.length > MAX_ROWS) return setProblem(`That has ${count(t.rows.length)} rows; import at most ${count(MAX_ROWS)} at a time.`);
    const m = guessMapping(t.headers);
    setProblem(null);
    setTable(t);
    setFileName(name);
    setMapping(m);
    setTierChoice(Object.fromEntries(tierValues(t, m).flatMap(({ value }) => (matchTier(value, tierList) ? [[value, matchTier(value, tierList)!]] : []))));
    setStep('columns');
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setProblem('That file is over 20 MB. Split it, or export only the columns needed.');
    if (/\.xls$/i.test(file.name)) return setProblem('That is an old-style Excel file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then choose it here.');
    if (/\.xlsx$/i.test(file.name)) return readWorkbook(file);
    load(await file.text(), file.name);
  };
  /** An Excel workbook: its only sheet with rows, or a choice when there are several. */
  const readWorkbook = async (file: File) => {
    setProblem(null);
    setReading(true);
    try {
      // loaded only when a workbook is chosen, so the Delegates page stays light
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const withRows = (await readXlsxFile(file))
        .map(({ sheet, data }) => ({ name: sheet, data: data as SheetCell[][] }))
        .filter((s) => sheetHasRows(s.data));
      if (withRows.length === 0) return setProblem('That workbook has no sheet with rows under a heading row.');
      if (withRows.length === 1) return load(tableFromSheet(withRows[0]!.data), `${file.name} · ${withRows[0]!.name}`);
      setWorkbook({ file: file.name, sheets: withRows, picked: withRows[0]!.name });
    } catch {
      setProblem('That workbook could not be read. If it is password-protected, remove the password; or save it as CSV.');
    } finally {
      setReading(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  };

  const effectiveDefault = defaultTier || tierList[0]?.id || '';
  const rows = useMemo(() => (table && mapping ? buildRows(table, mapping, tierChoice, effectiveDefault || null) : []), [table, mapping, tierChoice, effectiveDefault]);
  const ready = rows.filter((r) => !r.problem);
  const faulty = rows.filter((r) => r.problem);
  const values = useMemo(() => (table && mapping ? tierValues(table, mapping) : []), [table, mapping]);
  const nameMissing = mapping ? mapping.name < 0 && mapping.firstName < 0 : true;
  const emailMissing = mapping ? mapping.email < 0 : true;
  const unassigned = mapping && mapping.tier >= 0 ? values.filter((v) => !tierChoice[v.value]).length : 0;

  const setColumn = (field: ImportField, value: string) => {
    if (!mapping || !table) return;
    const next = { ...mapping, [field]: Number(value) };
    setMapping(next);
    if (field === 'tier') setTierChoice(Object.fromEntries(tierValues(table, next).flatMap(({ value: v }) => (matchTier(v, tierList) ? [[v, matchTier(v, tierList)!]] : []))));
  };
  const columnOptions = [{ value: NONE, label: 'Not in the file' }, ...(table?.headers ?? []).map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
  const sample = (field: ImportField) => (mapping && table && mapping[field] >= 0 ? table.rows.find((r) => r[mapping[field]]?.trim())?.[mapping[field]] : undefined);
  const tierOptions = tierList.map((t) => ({ value: t.id, label: t.name }));

  const subtitle = edition ? `Everyone on the list gets a ticket to ${edition.name}, with an account waiting for them if they have none. People who already hold a ticket are skipped.` : 'Choose the event first.';

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      className={modalClass('lg')}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader icon={ArrowUpTrayIcon} title="Import attendees" titleId={titleId} subtitle={subtitle} />
          {!finished && !running && (
            <ol className="mt-4 flex gap-2 text-xs" aria-label="Steps">
              {(['source', 'columns', 'review'] as const).map((s, i) => (
                <li key={s} aria-current={step === s ? 'step' : undefined} className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1', step === s ? 'bg-primary-soft text-primary' : 'text-[#7c7c7c]')}>
                  <span className={cn('flex size-4 items-center justify-center rounded-full text-[10px]', step === s ? 'bg-primary text-white' : 'bg-[#e5e5e5]')}>{i + 1}</span>
                  {['The list', 'Columns', 'Check and import'][i]}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          {/* ------------------------------------------------ result */}
          {(running || finished) && <Progress progress={importer.progress} rows={rows} faulty={faulty.length} notify={notify} edition={edition} />}

          {/* ------------------------------------------------ 1: the list */}
          {!running && !finished && step === 'source' && (
            <>
              {editions.length > 1 && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-ink">Event</span>
                  <Select label="Event" value={editionId} options={editions.map((e) => ({ value: e.id, label: `${e.shortName} · ${e.name}` }))} onChange={setEditionId} />
                </div>
              )}
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors', dragging ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-[#bdbdbd]')}
              >
                <DocumentArrowUpIcon className="size-10 text-[#7c7c7c]" strokeWidth={1.25} />
                <span className="text-sm text-ink">{reading ? 'Reading the workbook…' : 'Drop an Excel or CSV file here, or click to choose one'}</span>
                <span className="text-xs text-[#7c7c7c]">Excel workbooks (.xlsx) and CSV exports from EventX, Eventbrite or Google Forms work as they are. The first row must name the columns.</span>
                <input type="file" accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
              </label>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${titleId}-paste`} className="text-sm text-ink">
                  Or paste from Excel or Google Sheets
                </label>
                <textarea
                  id={`${titleId}-paste`}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={5}
                  placeholder={'Select the cells, heading row included, copy, and paste here.\nName\tEmail\tOrganisation\tTicket type'}
                  className="rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-placeholder focus:border-primary"
                />
              </div>
              {workbook && (
                <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-4">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{workbook.file}</span> has {workbook.sheets.length} sheets with rows. Which one is the attendee list?
                  </p>
                  <div role="radiogroup" aria-label="Sheet" className="flex flex-wrap gap-2">
                    {workbook.sheets.map((sh) => (
                      <button
                        key={sh.name}
                        type="button"
                        role="radio"
                        aria-checked={workbook.picked === sh.name}
                        onClick={() => setWorkbook({ ...workbook, picked: sh.name })}
                        className={cn('rounded-lg border px-3 py-1.5 text-sm', workbook.picked === sh.name ? 'border-primary bg-primary text-white' : 'border-border bg-white text-[#525252]')}
                      >
                        {sh.name} <span className="opacity-70">· {count(tableFromSheet(sh.data).rows.length)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {problem && (
                <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                  {problem}
                </p>
              )}
            </>
          )}

          {/* ------------------------------------------------ 2: columns */}
          {!running && !finished && step === 'columns' && table && mapping && (
            <>
              <p className="text-sm text-[#525252]">
                {fileName ? <span className="text-ink">{fileName}</span> : 'The pasted cells'}: {count(table.rows.length)} {table.rows.length === 1 ? 'row' : 'rows'}. Check which column holds what; we guessed from the headings.
              </p>
              <ul className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                {COLUMN_FIELDS.map((field) => (
                  <li key={field} className="flex flex-col gap-1">
                    <span className="text-sm text-ink">
                      {FIELD_LABEL[field]}
                      {field === 'email' && <span className="text-danger"> *</span>}
                      {field === 'name' && <span className="text-[#7c7c7c]"> (or first and last)</span>}
                    </span>
                    <Select label={FIELD_LABEL[field]} value={String(mapping[field])} options={columnOptions} onChange={(v) => setColumn(field, v)} invalid={(field === 'email' && emailMissing) || (field === 'name' && nameMissing)} />
                    <span className="truncate text-xs text-[#7c7c7c]">{sample(field) ? `e.g. ${sample(field)}` : ' '}</span>
                  </li>
                ))}
              </ul>

              {mapping.tier >= 0 ? (
                <div className="flex flex-col gap-2 rounded-xl border border-border p-4">
                  <p className="text-sm font-medium text-ink">Ticket tiers</p>
                  <p className={cn('-mt-1 text-xs', unassigned ? 'text-danger' : 'text-[#7c7c7c]')}>
                    {unassigned ? `Choose a tier for ${unassigned === 1 ? 'the value' : `all ${unassigned} values`} marked in red to continue.` : `What each value in the file becomes at ${edition?.shortName}.`}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {values.map(({ value, rows: n }) => (
                      <li key={value} className="grid grid-cols-[minmax(0,1fr)_12rem] items-center gap-3">
                        <span className="truncate text-sm text-[#525252]">
                          {value || <em className="text-[#7c7c7c]">blank</em>} <span className="text-xs text-[#7c7c7c]">· {count(n)}</span>
                        </span>
                        <Select
                          label={`Tier for ${value || 'blank'}`}
                          value={tierChoice[value] ?? ''}
                          options={[{ value: '', label: 'Choose a tier' }, ...tierOptions]}
                          onChange={(v) => setTierChoice((c) => ({ ...c, [value]: v }))}
                          invalid={!tierChoice[value]}
                        />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-ink">Ticket tier for everyone</span>
                  {tierOptions.length ? (
                    <Select label="Ticket tier for everyone" value={effectiveDefault} options={tierOptions} onChange={setDefaultTier} />
                  ) : (
                    <p className="text-sm text-danger">{tiers.isPending ? 'Loading tiers…' : `${edition?.shortName ?? 'This event'} has no ticket tiers yet. Add one on the Ticketing page first.`}</p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ------------------------------------------------ 3: review */}
          {!running && !finished && step === 'review' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-success/5 p-4 ring-1 ring-success/20">
                  <p className="text-3xl font-medium tabular-nums text-ink">{count(ready.length)}</p>
                  <p className="text-sm text-[#525252]">ready to import</p>
                </div>
                <div className={cn('rounded-xl p-4 ring-1', faulty.length ? 'bg-gold/10 ring-gold/30' : 'bg-[#f6f6f6] ring-border')}>
                  <p className="text-3xl font-medium tabular-nums text-ink">{count(faulty.length)}</p>
                  <p className="text-sm text-[#525252]">{faulty.length ? 'will be left out' : 'problems'}</p>
                </div>
              </div>
              {faulty.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-sm text-ink">Left out: fix these in the file and import it again. Those already imported are skipped then.</p>
                  <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm scrollbar-thin">
                    {faulty.slice(0, 200).map((r) => (
                      <li key={r.line} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-14 shrink-0 text-xs tabular-nums text-[#7c7c7c]">Line {r.line}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{r.name || r.email || '—'}</span>
                        <span className="shrink-0 text-xs text-[#8a6d00]">{PROBLEM_LABEL[r.problem!]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-4">
                <div>
                  <p id={`${titleId}-notify`} className="text-sm text-ink">
                    Email each person their ticket
                  </p>
                  <p className="text-xs text-[#7c7c7c]">Leave off when moving past records across; turn on for people who should hear about it now.</p>
                </div>
                <Switch checked={notify} onChange={setNotify} labelledBy={`${titleId}-notify`} />
              </div>
            </>
          )}
        </div>

        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          {finished ? (
            <>
              <button type="button" onClick={() => importer.progress.state !== 'idle' && importer.progress.state !== 'running' && download(`${edition?.shortName ?? 'import'}-import-report.csv`, reportCsv(rows, importer.progress.results, importer.progress.state === 'stopped' ? importer.progress.done : null))} className={cancelClass}>
                <ArrowDownTrayIcon className="size-4" />
                Download report
              </button>
              <button type="button" onClick={close} className={buttonClass()}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={step === 'source' ? close : () => setStep(step === 'review' ? 'columns' : 'source')} disabled={running} className={cancelClass}>
                {step === 'source' ? 'Cancel' : 'Back'}
              </button>
              {step === 'source' && (
                <button
                  type="button"
                  disabled={(!pasted.trim() && !workbook) || !editionId}
                  onClick={() => {
                    const sheet = workbook?.sheets.find((sh) => sh.name === workbook.picked);
                    if (workbook && sheet) load(tableFromSheet(sheet.data), `${workbook.file} · ${sheet.name}`);
                    else load(pasted, null);
                  }}
                  className={buttonClass()}
                >
                  Continue
                </button>
              )}
              {step === 'columns' && (
                <button type="button" disabled={nameMissing || emailMissing || !tierList.length || unassigned > 0} onClick={() => setStep('review')} className={buttonClass()}>
                  Check {count(rows.length)} rows
                </button>
              )}
              {step === 'review' && (
                <button type="button" disabled={running || ready.length === 0} onClick={() => void importer.run(rows, notify)} className={buttonClass()}>
                  {running ? 'Importing…' : `Import ${count(ready.length)} ${ready.length === 1 ? 'person' : 'people'}`}
                </button>
              )}
            </>
          )}
        </ModalActions>
      </div>
    </dialog>
  );
}

function Progress({ progress, rows, faulty, notify, edition }: { progress: ReturnType<typeof useImportAttendees>['progress']; rows: unknown[]; faulty: number; notify: boolean; edition: Edition | undefined }) {
  if (progress.state === 'running') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="flex flex-col gap-3 py-6" aria-live="polite">
        <p className="text-sm text-ink">
          Issuing tickets… {count(progress.done)} of {count(progress.total)}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-[#f1f1f1]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-[#7c7c7c]">Keep this window open until it finishes.</p>
      </div>
    );
  }
  if (progress.state === 'idle') return null;
  const { results } = progress;
  const newAccounts = results.issued.filter((i) => i.created).length;
  const had = results.skipped.filter((s) => s.reason === 'has_ticket').length;
  const stopped = progress.state === 'stopped';
  return (
    <div className="flex flex-col gap-4 py-2" aria-live="polite">
      <div className={cn('flex items-start gap-3 rounded-xl p-4 ring-1', stopped ? 'bg-gold/10 ring-gold/30' : 'bg-success/5 ring-success/20')}>
        {stopped ? <ExclamationTriangleIcon className="size-6 shrink-0 text-gold" /> : <CheckCircleIcon className="size-6 shrink-0 text-success" />}
        <div className="text-sm">
          <p className="font-medium text-ink">{stopped ? 'The import stopped part-way' : `${count(results.issued.length)} tickets issued for ${edition?.shortName ?? 'the event'}`}</p>
          {stopped ? (
            <p className="mt-1 text-[#525252]">
              {progress.message} {count(results.issued.length)} tickets were issued before it stopped. Fix the problem and import the same list again: people who already have their ticket are skipped.
            </p>
          ) : (
            <p className="mt-1 text-[#525252]">
              They appear on Delegates and Badges now, and can be checked in at the door.
              {notify ? ' Each is being emailed their ticket.' : ' Nobody was emailed.'}
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {[
          ['Issued', results.issued.length],
          ['New accounts', newAccounts],
          ['Already had one', had],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-lg bg-[#f6f6f6] px-3 py-3">
            <dd className="text-2xl font-medium tabular-nums text-ink">{count(n as number)}</dd>
            <dt className="text-xs text-[#7c7c7c]">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-xs text-[#7c7c7c]">
        {count(rows.length)} rows read{faulty ? `, ${count(faulty)} left out for problems` : ''}. The report lists what happened to each row, with ticket codes.
      </p>
    </div>
  );
}
