'use client';

import { ClipboardDocumentIcon, FilmIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { contentTypeOf, durationOf, recaption, startInstant, ytDlpCommand, type RecaptionResult } from '@/lib/captions/recaption';
import type { Session } from '@/lib/programme/programme';

type Stage = { kind: 'uploading'; percent: number } | { kind: 'transcribing' } | null;

/**
 * Re-caption a room from its YouTube recording: one clean pass over the whole stream, voices told
 * apart, put in place of the live captions over its hours. The audio comes from a laptop (where
 * YouTube allows it) with one command, which also prints when the stream started.
 */
export function RecaptionDialog({ open, day, sessions, onClose }: { open: boolean; day: number; sessions: Session[]; onClose: () => void }) {
  const toast = useToast();
  const id = useId();
  const rooms = [...new Set(sessions.filter((s) => s.day === day).map((s) => s.room.trim()))].sort();
  const [room, setRoom] = useState(rooms.includes('Main Hall') ? 'Main Hall' : (rooms[0] ?? ''));
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [started, setStarted] = useState('');
  const [zone, setZone] = useState<'utc' | 'abuja'>('utc');
  const [stage, setStage] = useState<Stage>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecaptionResult | null>(null);
  const pending = stage !== null;
  const command = ytDlpCommand(link);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (result) return onClose();
    setError(null);
    if (!file) return setError('Choose the audio file.');
    const type = contentTypeOf(file);
    if (!type) return setError('That file type is not taken. Use the .m4a the command saves (or .mp3, .mp4, .wav).');
    const startedAt = startInstant(started, zone);
    if (!startedAt) return setError('Enter when the stream started: the number after “Started” the command printed, or a date and time such as 2026-10-21 08:47:12.');
    setStage({ kind: 'uploading', percent: 0 });
    void (async () => {
      try {
        const durationMs = (await durationOf(file)) ?? 12 * 3600_000;
        const r = await recaption({ room, file, contentType: type, startedAt, durationMs }, setStage);
        setResult(r);
        toast.push({ title: `${room} re-captioned`, body: `${r.inserted} lines across ${r.sessions.length} session(s). Run Tidy day ${day} now to file any mix-ups.` });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'It could not be re-captioned.');
      } finally {
        setStage(null);
      }
    })();
  };

  return (
    <FormDialog
      open={open}
      icon={FilmIcon}
      title="Re-caption from YouTube"
      subtitle={`Day ${day}: one clean pass over a room's stream, in place of its live captions`}
      pending={pending}
      pendingLabel={stage?.kind === 'uploading' ? `Uploading… ${stage.percent}%` : 'Transcribing… a few minutes'}
      submitLabel={result ? 'Done' : 'Re-caption'}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {result ? (
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-ink">
            <strong>{result.inserted}</strong> lines now in place of the live captions{result.skipped ? `; ${result.skipped} fell outside any session (breaks)` : ''}:
          </p>
          <ul className="list-disc pl-5 text-ink-soft">
            {result.sessions.map((s) => (
              <li key={s.id}>
                {s.title}: {s.inserted} lines
              </li>
            ))}
          </ul>
          <p className="text-ink-soft">Next: on Programme, Tidy day {day} now. It moves any stretch filed under the wrong session, names the speakers and analyses the sessions again.</p>
        </div>
      ) : (
        <>
          <Field id={`${id}-room`} label="Room">
            <Select id={`${id}-room`} value={room} options={rooms.map((r) => ({ value: r, label: r }))} onChange={setRoom} />
          </Field>

          <div className="flex flex-col gap-2 rounded-xl border border-border p-4 text-sm">
            <p className="font-medium text-ink">1. Get the audio on your laptop</p>
            <p className="text-ink-soft">
              Once: install yt-dlp (in PowerShell: <code>winget install yt-dlp.yt-dlp</code>). Then paste the room&apos;s YouTube link and run the command below. It saves the audio and prints when the stream started.
            </p>
            <TextInput aria-label="YouTube link" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
            <div className="flex items-start gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-surface-soft p-2 text-xs text-ink">{command}</code>
              <button
                type="button"
                aria-label="Copy the command"
                onClick={() => void navigator.clipboard?.writeText(command).then(() => toast.push({ title: 'Command copied' }))}
                className="rounded-lg border border-border p-2 hover:bg-surface-soft"
              >
                <ClipboardDocumentIcon className="size-4" />
              </button>
            </div>
          </div>

          <p className="text-sm font-medium text-ink">2. Upload it</p>
          <Field id={`${id}-file`} label="Audio file" hint={file ? `${file.name} · ${(file.size / 1e6).toFixed(0)} MB` : 'The .m4a the command saved (a whole day is a few hundred MB).'}>
            <input id={`${id}-file`} type="file" accept=".m4a,.mp4,.mp3,.aac,.wav,.webm,.ogg,.opus,audio/*,video/mp4" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
          </Field>
          <div className="flex flex-wrap items-end gap-3">
            <Field id={`${id}-start`} label="Stream started at" hint="The number after “Started” the command printed (e.g. 1792572432), or a date and time." className="min-w-56 flex-1">
              <TextInput id={`${id}-start`} value={started} onChange={(e) => setStarted(e.target.value.replace(/^Started\s+/i, '').replace(/\s*\|.*$/, ''))} placeholder="1792572432" />
            </Field>
            <Field id={`${id}-zone`} label="Time is in" className="w-44">
              <Select
                id={`${id}-zone`}
                value={zone}
                options={[
                  { value: 'utc', label: 'UTC (as printed)' },
                  { value: 'abuja', label: 'Abuja time' },
                ]}
                onChange={setZone}
              />
            </Field>
          </div>
          <p className="text-xs text-hint">The room&apos;s live captions over the recording&apos;s hours are replaced; anything typed by a person stays.</p>
        </>
      )}
    </FormDialog>
  );
}
