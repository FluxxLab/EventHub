'use client';

import { ArrowDownTrayIcon, ArrowUpTrayIcon, CheckCircleIcon, CheckIcon, DocumentArrowUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { useDiscardGuard } from '@/components/ui/discard-guard';
import { TextInput } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import { sessionTrackOptions } from '@/lib/catalog/topics';
import { useTrackLibrary } from '@/lib/catalog/use-topics';
import { sheetHasRows, type SheetCell } from '@/lib/delegates/import';
import type { Edition } from '@/lib/events/events';
import { count } from '@/lib/format';
import {
  buildRows,
  FIELD_LABEL,
  findTable,
  gridFromSheet,
  gridFromText,
  guessMapping,
  MAX_ROWS,
  planSpeakers,
  PROBLEM_LABEL,
  reportCsv,
  speakerKey,
  templateCsv,
  type Mapping,
  type ProgrammeTable,
  type SessionField,
} from '@/lib/programme/import';
import { dayDate, MAX_DAY, typeLabel } from '@/lib/programme/programme';
import { useImportProgramme, type ProgrammeImportProgress } from '@/lib/programme/use-import';
import { useSessions } from '@/lib/programme/use-sessions';
import { affiliation } from '@/lib/speakers/speakers';
import { useSpeakers } from '@/lib/speakers/use-speakers';
import { cn } from '@/lib/utils';

type Step = 'source' | 'columns' | 'review';
const NONE = '-1';
const COLUMN_FIELDS: SessionField[] = ['title', 'type', 'time', 'start', 'end', 'day', 'date', 'room', 'track', 'speakers', 'moderators', 'description'];
const FIELD_HINT: Partial<Record<SessionField, string>> = {
  title: 'A short first line such as “Panel” or “Keynote Speech” sets the type.',
  time: 'One column such as “9:00 – 10:30 am”, or use Start and End.',
  speakers: 'One person per line as Name | Role | Organisation, or name over title as an agenda prints them.',
};

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([`﻿${text}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Import a programme into the working event from an Excel or CSV sheet (or cells pasted from one):
 * match the columns, check every session and the people it names, then add them. Speakers already
 * on the Speakers page are linked by name; the rest are added, and any that are not people (a
 * "Media Team") can be left out.
 */
export function ImportSessionsDialog({ open, edition, day, onClose }: { open: boolean; edition: Edition; day: number; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const sessions = useSessions(edition.id);
  const speakers = useSpeakers();
  const library = useTrackLibrary().data;
  const trackOptions = useMemo(() => sessionTrackOptions(library ?? [], edition.trackValues), [library, edition.trackValues]);
  const importer = useImportProgramme(edition.id, edition.startsAt);

  const [step, setStep] = useState<Step>('source');
  const [pasted, setPasted] = useState('');
  const [reading, setReading] = useState(false);
  const [workbook, setWorkbook] = useState<{ file: string; sheets: { name: string; data: SheetCell[][] }[]; picked: string } | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [table, setTable] = useState<ProgrammeTable | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [fallbackDay, setFallbackDay] = useState(String(day));
  const [fallbackRoom, setFallbackRoom] = useState('');
  const [leftOut, setLeftOut] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);

  const running = importer.progress.state === 'running';
  const finished = importer.progress.state === 'finished' || importer.progress.state === 'stopped';

  const close = () => {
    if (running) return;
    onClose();
  };
  const dirty = !running && !finished && (!!pasted.trim() || !!workbook || !!table);
  const { requestClose, prompt } = useDiscardGuard({ open, dirty, pending: running, onClose: close });

  const load = (grid: string[][], name: string | null) => {
    const t = findTable(grid);
    if (t.headers.length === 0 || t.rows.length === 0) return setProblem('That has no rows under a heading row. The first row should name the columns: Time, Title, Room, Speakers and so on.');
    if (t.rows.length > MAX_ROWS) return setProblem(`That has ${count(t.rows.length)} rows; import at most ${count(MAX_ROWS)} at a time.`);
    setProblem(null);
    setTable(t);
    setFileName(name);
    setMapping(guessMapping(t.headers));
    setStep('columns');
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) return setProblem('That file is over 20 MB.');
    if (/\.xls$/i.test(file.name)) return setProblem('That is an old-style Excel file (.xls). In Excel choose File → Save As → Excel Workbook (.xlsx) or CSV, then choose it here.');
    if (/\.(docx?|pdf)$/i.test(file.name))
      return setProblem('Word and PDF agendas cannot be read directly. Copy the agenda table into Excel or Google Sheets, then save it as .xlsx or paste the cells below.');
    if (/\.xlsx$/i.test(file.name)) return readWorkbook(file);
    load(gridFromText(await file.text()), file.name);
  };
  const readWorkbook = async (file: File) => {
    setProblem(null);
    setReading(true);
    try {
      const { default: readXlsxFile } = await import('read-excel-file/browser');
      const withRows = (await readXlsxFile(file)).map(({ sheet, data }) => ({ name: sheet, data: data as SheetCell[][] })).filter((s) => sheetHasRows(s.data));
      if (withRows.length === 0) return setProblem('That workbook has no sheet with rows under a heading row.');
      if (withRows.length === 1) return load(gridFromSheet(withRows[0]!.data), `${file.name} · ${withRows[0]!.name}`);
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

  const rows = useMemo(
    () =>
      table && mapping && sessions.data
        ? buildRows(table, mapping, { editionStartsAt: edition.startsAt, tracks: trackOptions, fallbackDay: Number(fallbackDay), fallbackRoom, existing: sessions.data })
        : [],
    [table, mapping, sessions.data, edition.startsAt, trackOptions, fallbackDay, fallbackRoom],
  );
  const ready = rows.filter((r) => !r.problem);
  const already = rows.filter((r) => r.problem === 'exists');
  const faulty = rows.filter((r) => r.problem && r.problem !== 'exists');
  const people = useMemo(() => planSpeakers(rows, speakers.data ?? []), [rows, speakers.data]);
  const newPeople = people.filter((p) => !p.existing);
  const linked = people.filter((p) => p.existing);
  const included = people.filter((p) => !leftOut.has(p.key));
  const adding = included.filter((p) => !p.existing).length;

  const titleMissing = !mapping || mapping.title < 0;
  const timeMissing = !mapping || (mapping.time < 0 && mapping.start < 0);
  const columnOptions = [{ value: NONE, label: 'Not in the sheet' }, ...(table?.headers ?? []).map((h, i) => ({ value: String(i), label: h || `Column ${i + 1}` }))];
  const sample = (field: SessionField) => {
    if (!mapping || !table || mapping[field] < 0) return undefined;
    const v = table.rows.find((r) => r[mapping[field]]?.trim() && r.filter(Boolean).length > 1)?.[mapping[field]];
    return v?.replace(/\s*\n\s*/g, ' / ');
  };
  const dayOptions = Array.from({ length: MAX_DAY }, (_, i) => {
    const date = new Date(`${dayDate(edition.startsAt, i + 1)}T00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return { value: String(i + 1), label: `Day ${i + 1} · ${date}` };
  });
  const byDay = Array.from({ length: MAX_DAY }, (_, i) => ({ day: i + 1, rows: ready.filter((r) => r.day === i + 1).sort((a, b) => a.start!.localeCompare(b.start!)) })).filter((d) => d.rows.length);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
      className={modalClass('lg')}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader
            icon={ArrowUpTrayIcon}
            title="Import sessions"
            titleId={titleId}
            subtitle={`Sessions and their speakers go onto ${edition.name}'s programme. Speakers already on the Speakers page are linked, not added twice, and sessions already on the programme are skipped.`}
          />
          {!finished && !running && (
            <ol className="mt-4 flex gap-2 text-xs" aria-label="Steps">
              {(['source', 'columns', 'review'] as const).map((s, i) => (
                <li
                  key={s}
                  aria-current={step === s ? 'step' : undefined}
                  className={cn('flex items-center gap-1.5 rounded-full px-2.5 py-1', step === s ? 'bg-primary-soft text-primary' : 'text-hint')}
                >
                  <span className={cn('flex size-4 items-center justify-center rounded-full text-[0.625rem]', step === s ? 'bg-primary text-on-primary' : 'bg-surface-sunken')}>{i + 1}</span>
                  {['The sheet', 'Columns', 'Check and import'][i]}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-6 py-3 scrollbar-thin">
          {(running || finished) && <Progress progress={importer.progress} rows={rows.length} edition={edition} />}

          {/* ------------------------------------------------ 1: the sheet */}
          {!running && !finished && step === 'source' && (
            <>
              <label
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  'flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors',
                  dragging ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong',
                )}
              >
                <DocumentArrowUpIcon className="size-10 text-hint" strokeWidth={1.25} />
                <span className="text-sm text-ink">{reading ? 'Reading the workbook…' : 'Drop an Excel or CSV file here, or click to choose one'}</span>
                <span className="text-xs text-hint">One row per session. An agenda table copied from Word into Excel works as it is: times like “9:00 – 10:30 am”, day headings, speakers with their titles.</span>
                <input
                  type="file"
                  accept=".xlsx,.csv,.tsv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  onChange={(e) => void readFile(e.target.files?.[0])}
                />
              </label>
              <button type="button" onClick={() => download('programme-template.csv', templateCsv())} className="-mt-2 inline-flex items-center gap-1.5 self-start text-sm text-primary hover:underline">
                <ArrowDownTrayIcon className="size-4" />
                Download a template
              </button>
              <div className="flex flex-col gap-1">
                <label htmlFor={`${titleId}-paste`} className="text-sm text-ink">
                  Or paste from Excel or Google Sheets
                </label>
                <textarea
                  id={`${titleId}-paste`}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  rows={5}
                  placeholder={'Select the cells, heading row included, copy, and paste here.\nDay\tStart\tEnd\tTitle\tRoom\tSpeakers'}
                  className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-ink outline-none placeholder:font-sans placeholder:text-placeholder focus:border-primary"
                />
              </div>
              {workbook && (
                <div className="flex flex-col gap-2 rounded-xl border border-primary/30 bg-primary-soft/30 p-4">
                  <p className="text-sm text-ink">
                    <span className="font-medium">{workbook.file}</span> has {workbook.sheets.length} sheets with rows. Which one is the programme?
                  </p>
                  <div role="radiogroup" aria-label="Sheet" className="flex flex-wrap gap-2">
                    {workbook.sheets.map((sh) => (
                      <button
                        key={sh.name}
                        type="button"
                        role="radio"
                        aria-checked={workbook.picked === sh.name}
                        onClick={() => setWorkbook({ ...workbook, picked: sh.name })}
                        className={cn('rounded-lg border px-3 py-1.5 text-sm', workbook.picked === sh.name ? 'border-primary bg-primary text-on-primary' : 'border-border bg-surface text-ink-soft')}
                      >
                        {sh.name}
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
              <p className="text-sm text-ink-soft">
                {fileName ? <span className="text-ink">{fileName}</span> : 'The pasted cells'}: {count(table.rows.length)} {table.rows.length === 1 ? 'row' : 'rows'}. Check which column holds what; we
                guessed from the headings.
              </p>
              <ul className="grid gap-x-5 gap-y-3 sm:grid-cols-2">
                {COLUMN_FIELDS.map((field) => (
                  <li key={field} className="flex flex-col gap-1">
                    <span className="text-sm text-ink" title={FIELD_HINT[field]}>
                      {FIELD_LABEL[field]}
                      {field === 'title' && <span className="text-danger"> *</span>}
                      {field === 'time' && <span className="text-hint"> (or start and end)</span>}
                    </span>
                    <Select
                      label={FIELD_LABEL[field]}
                      value={String(mapping[field])}
                      options={columnOptions}
                      onChange={(v) => setMapping({ ...mapping, [field]: Number(v) })}
                      invalid={(field === 'title' && titleMissing) || ((field === 'time' || field === 'start') && timeMissing)}
                    />
                    <span className="truncate text-xs text-hint">{sample(field) ? `e.g. ${sample(field)}` : (FIELD_HINT[field] ?? ' ')}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-x-5 gap-y-3 rounded-xl border border-border p-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-sm text-ink">Day for rows the sheet does not date</span>
                  <Select label="Day for rows the sheet does not date" value={fallbackDay} options={dayOptions} onChange={setFallbackDay} />
                  <span className="text-xs text-hint">A heading row such as “Day Two — Thursday” changes the day for the rows under it.</span>
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={`${titleId}-room`} className="text-sm text-ink">
                    Room for rows without one
                  </label>
                  <TextInput id={`${titleId}-room`} value={fallbackRoom} onChange={(e) => setFallbackRoom(e.target.value)} placeholder="e.g. Foyer" />
                  <span className="text-xs text-hint">Breaks often have none. Leave blank to leave those rows out.</span>
                </div>
              </div>
            </>
          )}

          {/* ------------------------------------------------ 3: review */}
          {!running && !finished && step === 'review' && (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-success/5 p-4 ring-1 ring-success/20">
                  <p className="text-3xl font-medium tabular-nums text-ink">{count(ready.length)}</p>
                  <p className="text-sm text-ink-soft">sessions ready</p>
                </div>
                <div className="rounded-xl bg-surface-soft p-4 ring-1 ring-border">
                  <p className="text-3xl font-medium tabular-nums text-ink">{count(adding)}</p>
                  <p className="text-sm text-ink-soft">new speakers</p>
                </div>
                <div className={cn('rounded-xl p-4 ring-1', faulty.length ? 'bg-gold/10 ring-gold/30' : 'bg-surface-soft ring-border')}>
                  <p className="text-3xl font-medium tabular-nums text-ink">{count(faulty.length)}</p>
                  <p className="text-sm text-ink-soft">{faulty.length ? 'will be left out' : 'problems'}</p>
                </div>
              </div>

              {faulty.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm text-ink">Left out: fix these in the sheet and import it again. Sessions already added are skipped then.</h3>
                  <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-border text-sm scrollbar-thin">
                    {faulty.map((r) => (
                      <li key={r.line} className="flex items-center gap-3 px-3 py-2">
                        <span className="w-14 shrink-0 text-xs tabular-nums text-hint">Row {r.line}</span>
                        <span className="min-w-0 flex-1 truncate text-ink">{r.title || '—'}</span>
                        <span className="shrink-0 text-xs text-warning">{PROBLEM_LABEL[r.problem!]}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {byDay.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm text-ink">
                    Sessions to add{already.length ? <span className="text-hint"> · {count(already.length)} already on the programme, skipped</span> : null}
                  </h3>
                  <div className="max-h-80 overflow-y-auto rounded-lg border border-border scrollbar-thin">
                    {byDay.map(({ day: d, rows: list }) => (
                      <div key={d}>
                        <p className="sticky top-0 border-b border-border bg-surface-soft px-3 py-1.5 text-xs font-medium text-ink-soft">{dayOptions[d - 1]!.label}</p>
                        <ul className="divide-y divide-border text-sm">
                          {list.map((r) => (
                            <li key={r.line} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3 px-3 py-2">
                              <span className="tabular-nums text-ink-soft" title={r.timeFromAbove ? 'Same time as the row above in the sheet' : undefined}>
                                {r.start}–{r.end}
                                {r.timeFromAbove && <span className="text-hint"> ↑</span>}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-ink" title={r.title}>
                                  {r.title}
                                </span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-hint">
                                  <Tag>{typeLabel(r.type)}</Tag>
                                  <span>{r.room}</span>
                                  {(() => {
                                    const names = r.speakers.filter((s) => !leftOut.has(speakerKey(s.name))).map((s) => s.name);
                                    return names.length > 0 && <span className="truncate" title={names.join(', ')}>· {names.join(', ')}</span>;
                                  })()}
                                </span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {newPeople.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm text-ink">
                    New speakers <span className="text-hint">· untick any that are not people, such as “Media Team”; they are left off the sessions</span>
                  </h3>
                  <ul className="grid max-h-72 gap-0.5 overflow-y-auto rounded-lg border border-border p-1 scrollbar-thin">
                    {newPeople.map((p) => {
                      const on = !leftOut.has(p.key);
                      return (
                        <li key={p.key}>
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() =>
                              setLeftOut((was) => {
                                const next = new Set(was);
                                if (on) next.add(p.key);
                                else next.delete(p.key);
                                return next;
                              })
                            }
                            className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-soft"
                          >
                            <span className={cn('flex size-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-on-primary' : 'border-border-strong')} aria-hidden>
                              {on && <CheckIcon className="size-3.5" />}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={cn('block truncate text-sm', on ? 'text-ink' : 'text-hint line-through')}>{p.name}</span>
                              {affiliation(p) && <span className="block truncate text-xs text-hint">{affiliation(p)}</span>}
                            </span>
                            <span className="shrink-0 text-xs text-hint">
                              {p.sessions} {p.sessions === 1 ? 'session' : 'sessions'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {linked.length > 0 && (
                <p className="text-sm text-ink-soft">
                  {count(linked.length)} {linked.length === 1 ? 'speaker is' : 'speakers are'} already on the Speakers page and will be linked:{' '}
                  <span className="text-hint">{linked.map((p) => p.existing!.name).join(', ')}</span>
                </p>
              )}
            </>
          )}
        </div>

        {prompt && <div className="mx-6">{prompt}</div>}
        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          {finished ? (
            <>
              <button
                type="button"
                onClick={() =>
                  (importer.progress.state === 'finished' || importer.progress.state === 'stopped') &&
                  download(`${edition.shortName}-programme-import-report.csv`, reportCsv(rows, importer.progress.result.created, importer.progress.state === 'stopped'))
                }
                className={cancelClass}
              >
                <ArrowDownTrayIcon className="size-4" />
                Download report
              </button>
              <button type="button" onClick={close} className={buttonClass()}>
                Done
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={step === 'source' ? requestClose : () => setStep(step === 'review' ? 'columns' : 'source')} disabled={running} className={cancelClass}>
                {step === 'source' ? 'Cancel' : 'Back'}
              </button>
              {step === 'source' && (
                <button
                  type="button"
                  disabled={!pasted.trim() && !workbook}
                  onClick={() => {
                    const sheet = workbook?.sheets.find((sh) => sh.name === workbook.picked);
                    if (workbook && sheet) load(gridFromSheet(sheet.data), `${workbook.file} · ${sheet.name}`);
                    else load(gridFromText(pasted), null);
                  }}
                  className={buttonClass()}
                >
                  Continue
                </button>
              )}
              {step === 'columns' && (
                <button type="button" disabled={titleMissing || timeMissing || !sessions.data || !speakers.data} onClick={() => setStep('review')} className={buttonClass()}>
                  {!sessions.data || !speakers.data ? 'Loading the programme…' : 'Check the sessions'}
                </button>
              )}
              {step === 'review' && (
                <button type="button" disabled={running || ready.length === 0} onClick={() => void importer.run(rows, included)} className={buttonClass()}>
                  {`Import ${count(ready.length)} ${ready.length === 1 ? 'session' : 'sessions'}`}
                  {adding ? ` and ${count(adding)} ${adding === 1 ? 'speaker' : 'speakers'}` : ''}
                </button>
              )}
            </>
          )}
        </ModalActions>
      </div>
    </dialog>
  );
}

function Progress({ progress, rows, edition }: { progress: ProgrammeImportProgress; rows: number; edition: Edition }) {
  if (progress.state === 'idle') return null;
  if (progress.state === 'running') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="flex flex-col gap-3 py-6" aria-live="polite">
        <p className="text-sm text-ink">
          {progress.phase === 'speakers' ? 'Adding speakers' : 'Adding sessions'}… {count(progress.done)} of {count(progress.total)}
        </p>
        <div className="h-2 overflow-hidden rounded-full bg-surface-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-hint">Keep this window open until it finishes.</p>
      </div>
    );
  }
  const { result } = progress;
  const stopped = progress.state === 'stopped';
  return (
    <div className="flex flex-col gap-4 py-2" aria-live="polite">
      <div className={cn('flex items-start gap-3 rounded-xl p-4 ring-1', stopped ? 'bg-gold/10 ring-gold/30' : 'bg-success/5 ring-success/20')}>
        {stopped ? <ExclamationTriangleIcon className="size-6 shrink-0 text-gold" /> : <CheckCircleIcon className="size-6 shrink-0 text-success" />}
        <div className="text-sm">
          <p className="font-medium text-ink">{stopped ? 'The import stopped part-way' : `${count(result.created.size)} sessions added to ${edition.shortName}`}</p>
          <p className="mt-1 text-ink-soft">
            {stopped
              ? `${progress.message} What was added before it stopped stays. Fix the problem and import the same sheet again: sessions and speakers already added are skipped.`
              : 'They are on the programme and delegates’ agendas now, with one “Programme updated” notification per 50 sessions.'}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-center">
        {[
          ['Sessions added', result.created.size],
          ['Speakers added', result.speakersAdded],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-lg bg-surface-soft px-3 py-3">
            <dd className="text-2xl font-medium tabular-nums text-ink">{count(n as number)}</dd>
            <dt className="text-xs text-hint">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="text-xs text-hint">{count(rows)} sessions read. The report lists what happened to each row.</p>
    </div>
  );
}
