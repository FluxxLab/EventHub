'use client';

import { CheckIcon, MicrophoneIcon, PlusIcon, TrashIcon, XCircleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toaster';
import { AUDIENCE, MAX_MICS, nextMic, useSetSessionMics, type SessionMic } from '@/lib/captions/mics';
import { useWorkingEdition } from '@/lib/events/working-edition';
import { timeRange, type Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

/** How a mic row is held while editing: a speaker, the audience, or a name typed in. */
type Row = { mic: number; who: string; other: string };
const OTHER = '__other';
const NOBODY = '';

const toRows = (mics: SessionMic[] = []): Row[] =>
  mics.map((m) => ({ mic: m.mic, who: m.speakerId ?? (m.label === AUDIENCE ? AUDIENCE : m.label ? OTHER : NOBODY), other: m.speakerId || m.label === AUDIENCE ? '' : (m.label ?? '') }));

const toMics = (rows: Row[]): SessionMic[] =>
  rows.map((r) =>
    r.who === AUDIENCE
      ? { mic: r.mic, speakerId: null, label: AUDIENCE }
      : r.who === OTHER
        ? { mic: r.mic, speakerId: null, label: r.other.trim() || null }
        : { mic: r.mic, speakerId: r.who || null, label: null },
  );

/**
 * Mics: for each session of the working event (picked in the top bar), who is on which of the
 * room's microphones, picked from the speakers the session has in Programme (or the audience, or a
 * name typed in).
 */
export function MicsPanel() {
  const working = useWorkingEdition();
  const editions = working.editions;
  const editionId = working.edition?.id;
  const sessions = useSessions(editionId);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions.data]);
  const open = list.find((s) => s.id === openId) ?? list.find((s) => s.status === 'live') ?? list[0] ?? null;

  if (editions.isPending || (editionId && sessions.isPending)) return <Skeleton className="h-96 rounded-xl" />;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <Panel title="Sessions" count={list.length} description="Pick one to name its mics.">
        {list.length === 0 ? (
          <EmptyState
            icon={MicrophoneIcon}
            title="No sessions yet"
            action={
              <Link href="/programme" className={buttonClass()}>
                Add sessions
              </Link>
            }
          />
        ) : (
          <ul className="max-h-[36rem] divide-y divide-border overflow-y-auto">
            {list.map((s) => {
              const named = s.mics?.length ?? 0;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-current={open?.id === s.id ? 'true' : undefined}
                    onClick={() => setOpenId(s.id)}
                    className={cn('flex w-full flex-col gap-0.5 px-5 py-3 text-left', open?.id === s.id ? 'bg-primary-soft' : 'hover:bg-surface-soft')}
                  >
                    <span className="w-full truncate text-sm text-ink">{s.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-hint">
                      Day {s.day} · {timeRange(s.startsAt, s.endsAt)} · {s.room}
                      {s.status === 'live' && <span className="font-medium text-danger">Live</span>}
                      <span className={named ? 'text-primary' : ''}>{named ? `${named} ${named === 1 ? 'mic' : 'mics'} named` : 'Mics not named'}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {open ? <MicsEditor key={`${open.id}:${JSON.stringify(open.mics ?? [])}`} session={open} editionId={editionId} /> : <div />}
    </div>
  );
}

function MicsEditor({ session, editionId }: { session: Session; editionId: string | undefined }) {
  const toast = useToast();
  const save = useSetSessionMics(editionId);
  const [rows, setRows] = useState<Row[]>(() => (session.mics?.length ? toRows(session.mics) : [{ mic: 1, who: NOBODY, other: '' }]));
  const dirty = JSON.stringify(toMics(rows)) !== JSON.stringify(toMics(toRows(session.mics)));

  const who = [
    { value: NOBODY, label: 'Nobody yet' },
    ...session.speakers.map((s) => ({ value: s.id, label: s.organisation ? `${s.name} · ${s.organisation}` : s.name })),
    { value: AUDIENCE, label: 'Audience' },
    { value: OTHER, label: 'Someone else (type the name)' },
  ];
  const usedMics = new Set(rows.map((r) => r.mic));
  const set = (i: number, next: Partial<Row>) => setRows((all) => all.map((r, j) => (j === i ? { ...r, ...next } : r)));
  const add = () => {
    const mic = nextMic(rows);
    if (mic) setRows((all) => [...all, { mic, who: NOBODY, other: '' }]);
  };

  const submit = () =>
    save.mutate(
      { sessionId: session.id, mics: toMics(rows) },
      {
        onSuccess: (mics) =>
          toast.push({ title: 'Mics saved', body: `${mics.length} ${mics.length === 1 ? 'mic' : 'mics'} named for “${session.title}”.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } }),
        onError: (e) => toast.push({ title: 'Mics not saved', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
      },
    );

  return (
    <Panel
      title={<span className="truncate">{session.title}</span>}
      description={`Day ${session.day} · ${timeRange(session.startsAt, session.endsAt)} · ${session.room}`}
      actions={
        <button type="button" disabled={!dirty || save.isPending} onClick={submit} className={buttonClass()}>
          <CheckIcon className="size-4" />
          {save.isPending ? 'Saving…' : 'Save mics'}
        </button>
      }
    >
      <div className="flex flex-col gap-4 px-6 py-5">
        {session.speakers.length === 0 && <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">No speakers in Programme yet: add them there to pick them here.</p>}
        <p className="text-xs text-hint">Mic numbers are the sound desk’s channels for {session.room}; each name labels that mic’s captions.</p>

        <ul className="flex flex-col gap-3">
          {rows.map((r, i) => (
            <li key={i} className="grid items-center gap-2 sm:grid-cols-[7rem_minmax(0,1fr)_auto]">
              <Select
                label={`Mic number, row ${i + 1}`}
                value={String(r.mic)}
                options={Array.from({ length: MAX_MICS }, (_, n) => n + 1)
                  .filter((n) => n === r.mic || !usedMics.has(n))
                  .map((n) => ({ value: String(n), label: `Mic ${n}` }))}
                onChange={(v) => set(i, { mic: Number(v) })}
              />
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
                <Select label={`Who is on mic ${r.mic}`} value={r.who} options={who} onChange={(v) => set(i, { who: v })} className="min-w-0 flex-1" />
                {r.who === OTHER && (
                  <TextInput
                    value={r.other}
                    maxLength={60}
                    onChange={(e) => set(i, { other: e.target.value })}
                    placeholder="Name and organisation"
                    aria-label={`Name on mic ${r.mic}`}
                    className="sm:w-64"
                  />
                )}
              </div>
              <button
                type="button"
                onClick={() => setRows((all) => all.filter((_, j) => j !== i))}
                aria-label={`Remove mic ${r.mic}`}
                className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'hover:text-danger' })}
              >
                <TrashIcon className="size-4" />
              </button>
            </li>
          ))}
        </ul>

        <div>
          <button type="button" onClick={add} disabled={rows.length >= MAX_MICS} className={buttonClass({ style: 'outline', color: 'gray' })}>
            <PlusIcon className="size-4" />
            Add a mic
          </button>
        </div>
        {rows.length === 0 && (
          <p className="flex items-center gap-2 text-sm text-hint">
            <MicrophoneIcon className="size-4" /> No mics named: captions for this session stay unlabelled.
          </p>
        )}
      </div>
    </Panel>
  );
}
