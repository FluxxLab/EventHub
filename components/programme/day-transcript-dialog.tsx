'use client';

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { PagesArt, WorkCard } from '@/components/ui/work-art';
import { daySessions, downloadDayTranscript } from '@/lib/captions/day-transcript';
import type { Session } from '@/lib/programme/programme';

const ALL = '__all__';

/** One file with a day's transcripts: every room, or one, each session under its own heading. */
export function DayTranscriptDialog({ open, day, sessions, eventName, onClose }: { open: boolean; day: number; sessions: Session[]; eventName: string; onClose: () => void }) {
  const toast = useToast();
  const baseId = useId();
  const [room, setRoom] = useState(ALL);
  const [format, setFormat] = useState<'txt' | 'csv'>('txt');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = sessions.filter((s) => s.day === day);
  const rooms = [...new Map(today.map((s) => [s.room.trim().toLowerCase(), s.room.trim()])).values()].sort();
  const count = daySessions(today, room === ALL ? null : room).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    downloadDayTranscript(today, { day, room: room === ALL ? null : room, format, eventName })
      .then((n) => {
        toast.push({ title: 'Transcript downloaded', body: `Day ${day}, ${room === ALL ? 'all rooms' : room}: ${n} session${n === 1 ? '' : 's'} in one file.` });
        onClose();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setPending(false));
  };

  return (
    <FormDialog
      open={open}
      icon={ArrowDownTrayIcon}
      title="Day transcript"
      subtitle={`Day ${day} · one file`}
      pending={pending}
      pendingLabel="Gathering transcripts…"
      submitLabel="Download"
      error={error}
      onClose={onClose}
      onSubmit={submit}
    >
      <WorkCard>
        <PagesArt moving={pending} />
      </WorkCard>
      <p className="text-sm text-ink-soft">
        Every session that has started, each under its own heading with the time and who spoke. {count ? `${count} session${count === 1 ? '' : 's'} so far.` : 'Nothing has run yet.'}
      </p>
      <Field id={`${baseId}-room`} label="Room">
        <Select id={`${baseId}-room`} value={room} onChange={setRoom} options={[{ value: ALL, label: 'All rooms' }, ...rooms.map((r) => ({ value: r, label: r }))]} />
      </Field>
      <Field id={`${baseId}-format`} label="Format">
        <Select
          id={`${baseId}-format`}
          value={format}
          onChange={setFormat}
          options={[
            { value: 'txt', label: 'Text (.txt), to read' },
            { value: 'csv', label: 'Spreadsheet (.csv), for Excel' },
          ]}
        />
      </Field>
    </FormDialog>
  );
}
