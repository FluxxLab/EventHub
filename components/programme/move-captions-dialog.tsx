'use client';

import { ArrowRightCircleIcon } from '@heroicons/react/24/outline';
import { useId, useState, type FormEvent } from 'react';

import { Field, TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import { clock } from '@/lib/format';
import type { Session } from '@/lib/programme/programme';

/** Event times are Abuja (WAT, UTC+1, no daylight saving). */
const WAT_OFFSET_MS = 60 * 60 * 1000;

/** "12:25" on the day of `startsAt`, as an instant (Abuja time). */
export function abujaTime(startsAt: string, hhmm: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const day = new Date(new Date(startsAt).getTime() + WAT_OFFSET_MS).toISOString().slice(0, 10);
  return new Date(`${day}T${m[1].padStart(2, '0')}:${m[2]}:00+01:00`).toISOString();
}

/**
 * For when the wrong session was left live: moves the lines said from a time onward to the session
 * they belong to. The backend refuses while the source is live or still being re-transcribed.
 */
export function MoveCaptionsDialog({ session, sessions, onClose }: { session: Session | null; sessions: Session[]; onClose: () => void }) {
  const toast = useToast();
  const baseId = useId();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [from, setFrom] = useState('');
  const [all, setAll] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // same day, same room first: the session that should have been live is almost always the next one there
  const choices = session
    ? sessions
        .filter((s) => s.id !== session.id && s.day === session.day)
        .sort((a, b) => Number(b.room === session.room) - Number(a.room === session.room) || a.startsAt.localeCompare(b.startsAt))
    : [];

  if (session && openFor !== session.id) {
    setOpenFor(session.id);
    const next = choices.find((s) => s.room === session.room && s.startsAt >= session.startsAt) ?? choices[0];
    setTarget(next?.id ?? '');
    setFrom(next ? clock(next.startsAt) : '');
    setAll(false);
    setError(null);
  }

  const close = () => {
    setOpenFor(null);
    onClose();
  };
  const to = choices.find((s) => s.id === target);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!session || !to) return;
    const since = all ? null : abujaTime(session.startsAt, from);
    if (!all && !since) {
      setError('Enter the time as HH:MM, for example 12:25.');
      return;
    }
    setPending(true);
    setError(null);
    const request = DEMO_MODE
      ? Promise.resolve({ moved: 42, calls: 2 })
      : api.post<{ moved: number; calls?: number }>(`/captions/${session.id}/captions/move`, { toSessionId: to.id, ...(since ? { since } : {}) });
    request
      .then(({ moved, calls = 0 }) => {
        const callsLine = calls ? ` ${calls} call${calls === 1 ? '' : 's'} to action went with them.` : '';
        toast.push({
          title: moved || calls ? 'Captions moved' : 'Nothing to move',
          body: moved || calls ? `${moved} line(s) moved to “${to.title}”.${callsLine} Analyse it for anything not yet found.` : `“${session.title}” has no lines${all ? '' : ` from ${from}`} on.`,
          leading: { kind: 'icon', icon: ArrowRightCircleIcon, tone: moved || calls ? 'success' : undefined },
        });
        close();
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setPending(false));
  };

  return (
    <FormDialog
      open={session !== null}
      icon={ArrowRightCircleIcon}
      title="Move captions"
      subtitle={session ? `From “${session.title}” · ${session.room}` : ''}
      pending={pending}
      submitLabel="Move captions"
      error={error}
      onClose={close}
      onSubmit={submit}
    >
      <p className="text-sm text-ink-soft">
        For when the wrong session was left live. The calls to action found in those lines move with them. End this session first, and give it a few minutes to be re-transcribed before moving.
      </p>
      <Field id={`${baseId}-to`} label="Move to">
        <Select
          id={`${baseId}-to`}
          value={target}
          onChange={setTarget}
          options={choices.map((s) => ({ value: s.id, label: `${clock(s.startsAt)} · ${s.room} · ${s.title}` }))}
        />
      </Field>
      <Field id={`${baseId}-from`} label="Lines said from (Abuja time)" hint="Usually when the right session actually started.">
        <TextInput id={`${baseId}-from`} value={from} disabled={all} onChange={(e) => setFrom(e.target.value)} placeholder="12:25" inputMode="numeric" />
      </Field>
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
        Move every line instead
      </label>
    </FormDialog>
  );
}
