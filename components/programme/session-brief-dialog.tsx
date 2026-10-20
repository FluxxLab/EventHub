'use client';

import { DocumentArrowUpIcon, DocumentTextIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useId, useState, type DragEvent, type FormEvent } from 'react';

import { Skeleton } from '@/components/ui/card';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toaster';
import { clock, count } from '@/lib/format';
import { MAX_BRIEF_LENGTH, readBriefFile } from '@/lib/programme/briefs';
import type { Session } from '@/lib/programme/programme';
import { useSessionBrief, useSetSessionBrief } from '@/lib/programme/use-briefs';
import { cn } from '@/lib/utils';

/**
 * A session's brief: upload the Word or PDF brief (its text is read in and shown to check), or
 * type it. The calls-to-action analysis and the rapporteur report read it as what the session was
 * asked to address. Organisers only: delegates never see it.
 */
export function SessionBriefDialog({ session, editionId, onClose }: { session: Session | null; editionId: string | undefined; onClose: () => void }) {
  const toast = useToast();
  const baseId = useId();
  const current = useSessionBrief(session?.id);
  const save = useSetSessionBrief(editionId);
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // start from the saved brief each time the dialog opens for a session, once it has loaded
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (session && current.data && loadedFor !== session.id) {
    setLoadedFor(session.id);
    setText(current.data.text ?? '');
    setFileName(current.data.fileName);
    setProblem(null);
  }

  const saved = current.data?.text ?? '';
  const dirty = session !== null && loadedFor === session.id && (text.trim() !== saved.trim() || (fileName ?? null) !== (current.data?.fileName ?? null));
  const tooLong = text.length > MAX_BRIEF_LENGTH;

  const close = () => {
    setLoadedFor(null);
    save.reset();
    onClose();
  };
  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    setReading(true);
    try {
      setText(await readBriefFile(file));
      setFileName(file.name);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setReading(false);
    }
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    void readFile(e.dataTransfer.files[0]);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!session || tooLong) return;
    const removing = !text.trim();
    save.mutate(
      { sessionId: session.id, text, fileName },
      {
        onSuccess: () => {
          toast.push({
            title: removing ? 'Brief removed' : 'Brief saved',
            body: removing ? `“${session.title}” has no brief now.` : `The analysis and rapporteur report for “${session.title}” will read it.`,
            leading: { kind: 'icon', icon: removing ? TrashIcon : DocumentTextIcon, tone: removing ? undefined : 'success' },
          });
          close();
        },
      },
    );
  };

  return (
    <FormDialog
      open={session !== null}
      icon={DocumentTextIcon}
      title="Session brief"
      subtitle={session ? `${session.title} · Day ${session.day}, ${clock(session.startsAt)}–${clock(session.endsAt)} · ${session.room}` : ''}
      pending={save.isPending}
      submitLabel={!text.trim() && saved ? 'Remove brief' : 'Save brief'}
      error={save.error?.message ?? (tooLong ? `Keep the brief under ${count(MAX_BRIEF_LENGTH)} characters.` : null)}
      onClose={close}
      onSubmit={submit}
      dirty={dirty}
    >
      <p className="text-sm text-ink-soft">
        What the session is for and what it should address. The calls-to-action analysis and the rapporteur report read it as context; delegates never see it.
      </p>
      {current.isPending ? (
        <Skeleton className="h-64" />
      ) : current.isError ? (
        <p role="alert" className="text-sm text-danger">
          {current.error.message}
        </p>
      ) : (
        <>
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition-colors',
              dragging ? 'border-primary bg-primary-soft/40' : 'border-border hover:border-border-strong',
            )}
          >
            <DocumentArrowUpIcon className="size-8 shrink-0 text-hint" strokeWidth={1.25} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-ink">{reading ? 'Reading the brief…' : text ? 'Replace with another file' : 'Drop the brief here, or click to choose it'}</span>
              <span className="block truncate text-xs text-hint">{fileName ? `From ${fileName}` : 'Word (.docx) or PDF. Its text is read in below for you to check.'}</span>
            </span>
            <input type="file" accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" onChange={(e) => void readFile(e.target.files?.[0])} />
          </label>
          {problem && (
            <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
              {problem}
            </p>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={`${baseId}-text`} className="flex items-baseline justify-between text-sm text-ink">
              The brief
              <span className={cn('text-xs tabular-nums', tooLong ? 'text-danger' : 'text-hint')}>{count(text.length)} characters</span>
            </label>
            <textarea
              id={`${baseId}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={14}
              placeholder="Upload the brief above, or type or paste it here."
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm leading-6 text-ink outline-none placeholder:text-placeholder focus:border-primary"
            />
          </div>
          {text && (
            <button
              type="button"
              onClick={() => {
                setText('');
                setFileName(null);
              }}
              className="inline-flex items-center gap-1.5 self-start text-sm text-danger hover:underline"
            >
              <TrashIcon className="size-4" />
              Clear the brief
            </button>
          )}
        </>
      )}
    </FormDialog>
  );
}
