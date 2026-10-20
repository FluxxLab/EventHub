'use client';

import { CheckCircleIcon, DocumentArrowUpIcon, DocumentDuplicateIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useMemo, useRef, useState, type DragEvent } from 'react';

import { buttonClass } from '@/components/ui/button';
import { useDiscardGuard } from '@/components/ui/discard-guard';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { Tag } from '@/components/ui/tag';
import type { Edition } from '@/lib/events/events';
import { clock, count } from '@/lib/format';
import { matchBriefs, type BriefMatch } from '@/lib/programme/brief-match';
import { MAX_BRIEF_LENGTH, readBriefFile } from '@/lib/programme/briefs';
import { useSessionBriefs, useSetSessionBrief } from '@/lib/programme/use-briefs';
import { useSessions } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

type Item = BriefMatch & { key: string; fileName: string; text: string; problem: string | null };
type Phase = 'pick' | 'reading' | 'review' | 'saving' | 'done';

const CONFIDENCE: Record<BriefMatch['confidence'], { label: string; tone: 'green' | 'gold' | 'gray' }> = {
  sure: { label: 'Matched', tone: 'green' },
  check: { label: 'Check', tone: 'gold' },
  none: { label: 'Choose a session', tone: 'gray' },
};

/**
 * Upload many session briefs at once: drop the folder's Word and PDF files, each is read and
 * matched to its session (by the title, speakers and day it names), the matches are checked and
 * corrected, then every brief is saved to its session.
 */
export function UploadBriefsDialog({ open, edition, onClose }: { open: boolean; edition: Edition; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const sessions = useSessions(edition.id);
  const briefs = useSessionBriefs(edition.id);
  const save = useSetSessionBrief(edition.id);
  const [phase, setPhase] = useState<Phase>('pick');
  const [items, setItems] = useState<Item[]>([]);
  const [readCount, setReadCount] = useState({ done: 0, total: 0 });
  const [results, setResults] = useState<Map<string, string | null>>(new Map());
  const [dragging, setDragging] = useState(false);

  const busy = phase === 'reading' || phase === 'saving';
  const close = () => {
    if (!busy) onClose();
  };
  const { requestClose, prompt } = useDiscardGuard({ open, dirty: phase === 'review' && items.length > 0, pending: busy, onClose: close });

  const ordered = useMemo(
    () => [...(sessions.data ?? [])].sort((a, b) => a.day - b.day || Date.parse(a.startsAt) - Date.parse(b.startsAt)),
    [sessions.data],
  );
  const sessionOptions = [
    { value: '', label: 'Don’t upload' },
    ...ordered.map((s) => ({ value: s.id, label: `Day ${s.day} · ${clock(s.startsAt)} · ${s.title}` })),
  ];

  const readFiles = async (files: File[]) => {
    if (!files.length || !sessions.data) return;
    setPhase('reading');
    setReadCount({ done: 0, total: files.length });
    const read: Omit<Item, keyof BriefMatch>[] = [];
    for (const [i, file] of files.entries()) {
      try {
        const text = await readBriefFile(file);
        read.push({
          key: `${file.name}-${file.size}-${i}-${Date.now()}`,
          fileName: file.name,
          text,
          problem: !text ? 'No text in this file' : text.length > MAX_BRIEF_LENGTH ? `Over ${count(MAX_BRIEF_LENGTH)} characters` : null,
        });
      } catch (e) {
        read.push({ key: `${file.name}-${i}-${Date.now()}`, fileName: file.name, text: '', problem: e instanceof Error ? e.message : 'Could not be read' });
      }
      setReadCount({ done: i + 1, total: files.length });
    }
    // matched together with those already in the list, so two files never land on one session
    const readable = [...items.filter((it) => !it.problem), ...read.filter((r) => !r.problem)];
    const kept = new Map(items.map((it) => [it.key, it]));
    const matched = matchBriefs(readable, sessions.data, edition.startsAt).map((m) => {
      const before = kept.get(m.key);
      // a choice already made by hand stands
      return before ? { ...m, sessionId: before.sessionId, confidence: before.confidence, reason: before.reason } : m;
    });
    const failed = [...items.filter((it) => it.problem), ...read.filter((r) => r.problem).map((r) => ({ ...r, sessionId: null, confidence: 'none' as const, reason: '' }))];
    setItems([...matched, ...failed]);
    setPhase('review');
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFiles([...e.dataTransfer.files]);
  };
  const choose = (key: string, sessionId: string) =>
    setItems((was) => was.map((it) => (it.key === key ? { ...it, sessionId: sessionId || null, confidence: sessionId ? 'sure' : 'none', reason: sessionId ? 'Chosen by hand' : '' } : it)));

  const chosenCount = new Map<string, number>();
  for (const it of items) if (it.sessionId && !it.problem) chosenCount.set(it.sessionId, (chosenCount.get(it.sessionId) ?? 0) + 1);
  const toSave = items.filter((it) => it.sessionId && !it.problem);
  const clashes = [...chosenCount.values()].some((n) => n > 1);
  const toCheck = toSave.filter((it) => it.confidence === 'check').length;

  const saveAll = async () => {
    setPhase('saving');
    const out = new Map<string, string | null>();
    for (const it of toSave) {
      try {
        await save.mutateAsync({ sessionId: it.sessionId!, text: it.text, fileName: it.fileName });
        out.set(it.key, null);
      } catch (e) {
        out.set(it.key, e instanceof Error ? e.message : 'Not saved');
      }
      setResults(new Map(out));
    }
    setPhase('done');
  };
  const saved = [...results.values()].filter((v) => v === null).length;
  const notSaved = [...results.values()].filter((v) => v !== null).length;
  const titleOf = (id: string | null) => ordered.find((s) => s.id === id)?.title ?? '';

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
            icon={DocumentDuplicateIcon}
            title="Upload briefs"
            titleId={titleId}
            subtitle="Drop all the session briefs at once. Each is matched to its session by the title, speakers and day it names; check the matches, then save. Delegates never see briefs."
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-3 scrollbar-thin">
          {(phase === 'pick' || phase === 'review') && (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={cn(
                'flex cursor-pointer items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors',
                phase === 'pick' ? 'flex-col px-6 py-10' : 'px-4 py-3',
                dragging ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong',
              )}
            >
              <DocumentArrowUpIcon className={cn('shrink-0 text-hint', phase === 'pick' ? 'size-10' : 'size-6')} strokeWidth={1.25} />
              <span className="text-sm text-ink">
                {!sessions.data ? 'Loading the programme…' : phase === 'pick' ? 'Drop the brief files here, or click to choose them' : 'Add more briefs'}
              </span>
              {phase === 'pick' && <span className="text-xs text-hint">Word (.docx) or PDF, as many as you have. Select them all in the folder with Ctrl+A.</span>}
              <input
                type="file"
                multiple
                disabled={!sessions.data}
                accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(e) => {
                  void readFiles([...(e.target.files ?? [])]);
                  e.target.value = '';
                }}
              />
            </label>
          )}

          {phase === 'reading' && (
            <div className="flex flex-col gap-3 py-6" aria-live="polite">
              <p className="text-sm text-ink">
                Reading the briefs… {readCount.done} of {readCount.total}
              </p>
              <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${readCount.total ? (readCount.done / readCount.total) * 100 : 0}%` }} />
              </div>
            </div>
          )}

          {(phase === 'review' || phase === 'saving' || phase === 'done') && items.length > 0 && (
            <>
              {phase === 'done' ? (
                <div className={cn('flex items-start gap-3 rounded-xl p-4 ring-1', notSaved ? 'bg-gold/10 ring-gold/30' : 'bg-success/5 ring-success/20')} aria-live="polite">
                  {notSaved ? <ExclamationTriangleIcon className="size-6 shrink-0 text-gold" /> : <CheckCircleIcon className="size-6 shrink-0 text-success" />}
                  <p className="text-sm text-ink">
                    {count(saved)} {saved === 1 ? 'brief' : 'briefs'} saved{notSaved ? `, ${count(notSaved)} not saved (see below)` : ''}. The analysis and rapporteur report read them from now on.
                  </p>
                </div>
              ) : phase === 'review' ? (
                <p className={cn('text-sm', clashes ? 'text-danger' : 'text-ink-soft')}>
                  {clashes
                    ? 'Two files are set to the same session. Choose another session for one, or “Don’t upload”.'
                    : `${count(toSave.length)} of ${count(items.length)} ready to save${toCheck ? `; ${toCheck} marked Check are best guesses, so look at those` : ''}.`}
                </p>
              ) : (
                <p className="text-sm text-ink" aria-live="polite">
                  Saving… {count(results.size)} of {count(toSave.length)}
                </p>
              )}
              <ul className="divide-y divide-border rounded-lg border border-border">
                {items.map((it) => {
                  const result = results.get(it.key);
                  const replaces = it.sessionId && briefs.data?.has(it.sessionId);
                  const clash = it.sessionId && (chosenCount.get(it.sessionId) ?? 0) > 1;
                  return (
                    <li key={it.key} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink" title={it.fileName}>
                          {it.fileName}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-hint">
                          {it.problem ? (
                            <span className="text-danger">{it.problem}</span>
                          ) : result !== undefined ? (
                            result === null ? (
                              <Tag tone="green">Saved</Tag>
                            ) : (
                              <span className="text-danger">{result}</span>
                            )
                          ) : (
                            <>
                              <Tag tone={CONFIDENCE[it.confidence].tone}>{CONFIDENCE[it.confidence].label}</Tag>
                              {it.reason && <span className="truncate">{it.reason}</span>}
                            </>
                          )}
                        </p>
                      </div>
                      {!it.problem &&
                        (phase === 'review' ? (
                          <div className="flex min-w-0 flex-col gap-1">
                            <Select label={`Session for ${it.fileName}`} value={it.sessionId ?? ''} options={sessionOptions} onChange={(v) => choose(it.key, v)} invalid={!!clash} />
                            {replaces && <span className="text-xs text-warning">Replaces this session’s current brief</span>}
                          </div>
                        ) : (
                          <p className="truncate text-sm text-ink-soft">{it.sessionId ? titleOf(it.sessionId) : 'Not uploaded'}</p>
                        ))}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>

        {prompt && <div className="mx-6">{prompt}</div>}
        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          {phase === 'done' ? (
            <button type="button" onClick={close} className={buttonClass()}>
              Done
            </button>
          ) : (
            <>
              <button type="button" onClick={requestClose} disabled={busy} className={cancelClass}>
                Cancel
              </button>
              {phase !== 'pick' && (
                <button type="button" disabled={phase !== 'review' || toSave.length === 0 || clashes} onClick={() => void saveAll()} className={buttonClass()}>
                  {phase === 'saving' ? 'Saving…' : `Save ${count(toSave.length)} ${toSave.length === 1 ? 'brief' : 'briefs'}`}
                </button>
              )}
            </>
          )}
        </ModalActions>
      </div>
    </dialog>
  );
}
