'use client';

import { CheckIcon, MicrophoneIcon, PlusIcon, TrashIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useMemo, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { AUDIENCE, MAX_MICS, nextMic, useSetSessionMics, type SessionMic } from '@/lib/captions/mics';
import { useEditions } from '@/lib/events/use-editions';
import { timeRange, type Session } from '@/lib/programme/programme';
import { useSessions } from '@/lib/programme/use-sessions';
import { cn } from '@/lib/utils';

const cardClass = 'overflow-hidden rounded-2xl border border-border bg-surface';

/** How a mic row is held while editing: a speaker, the audience, or a name typed in. */
type Row = { mic: number; who: string; other: string };
const OTHER = '__other';
const NOBODY = '';

const toRows = (mics: SessionMic[] = []): Row[] =>
  mics.map((m) => ({ mic: m.mic, who: m.speakerId ?? (m.label === AUDIENCE ? AUDIENCE : m.label ? OTHER : NOBODY), other: m.speakerId || m.label === AUDIENCE ? '' : (m.label ?? '') }));

const toMics = (rows: Row[]): SessionMic[] =>
  rows.map((r) =>
    r.who === AUDIENCE ? { mic: r.mic, speakerId: null, label: AUDIENCE } : r.who === OTHER ? { mic: r.mic, speakerId: null, label: r.other.trim() || null } : { mic: r.mic, speakerId: r.who || null, label: null },
  );

/**
 * Mics: for each session, who is on which of the room's microphones, picked from the speakers the
 * session has in Programme (or the audience, or a name typed in).
 */
export function MicsPanel() {
  const editions = useEditions();
  const [chosen, setChosen] = useState<string | null>(null);
  const editionId = chosen ?? editions.data?.find((e) => e.isCurrent)?.id ?? editions.data?.[0]?.id;
  const sessions = useSessions(editionId);
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useMemo(() => (sessions.data ?? []).filter((s) => s.type !== 'break').sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [sessions.data]);
  const open = list.find((s) => s.id === openId) ?? list.find((s) => s.status === 'live') ?? list[0] ?? null;

  if (editions.isPending || (editionId && sessions.isPending)) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <section aria-label="Sessions" className={cardClass}>
        <header className="flex flex-col gap-3 border-b border-border px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-ink">Sessions</h2>
            <p className="text-xs text-[#7c7c7c]">Pick one to name its mics.</p>
          </div>
          {(editions.data?.length ?? 0) > 1 && (
            <Select
              label="Event"
              value={editionId ?? ''}
              options={(editions.data ?? []).map((e) => ({ value: e.id, label: e.shortName }))}
              onChange={(v) => {
                setChosen(v);
                setOpenId(null);
              }}
            />
          )}
        </header>
        {list.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-[#7c7c7c]">No sessions yet. Add them in Programme.</p>
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
                    className={cn('flex w-full flex-col gap-0.5 px-5 py-3 text-left hover:bg-surface-soft', open?.id === s.id && 'bg-primary-soft/40')}
                  >
                    <span className="truncate text-sm text-ink">{s.title}</span>
                    <span className="flex flex-wrap items-center gap-x-2 text-xs text-[#7c7c7c]">
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
      </section>

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
        onSuccess: (mics) => toast.push({ title: 'Mics saved', body: `${mics.length} ${mics.length === 1 ? 'mic' : 'mics'} named for “${session.title}”.`, leading: { kind: 'icon', icon: CheckIcon, tone: 'success' } }),
        onError: (e) => toast.push({ title: 'Mics not saved', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
      },
    );

  return (
    <section aria-labelledby="mics-title" className={cardClass}>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-6 py-4">
        <div className="min-w-0">
          <h2 id="mics-title" className="truncate text-base font-medium text-ink">
            {session.title}
          </h2>
          <p className="text-sm text-[#7c7c7c]">
            Day {session.day} · {timeRange(session.startsAt, session.endsAt)} · {session.room}
          </p>
        </div>
        <button type="button" disabled={!dirty || save.isPending} onClick={submit} className={buttonClass()}>
          <CheckIcon className="size-4" />
          {save.isPending ? 'Saving…' : 'Save mics'}
        </button>
      </header>

      <div className="flex flex-col gap-4 px-6 py-5">
        {session.speakers.length === 0 && <p className="rounded-lg bg-gold-soft px-3 py-2 text-sm text-[#7a5d00]">This session has no speakers in Programme yet. Add them there to pick them here.</p>}
        <p className="text-xs text-[#7c7c7c]">Mic numbers are the sound desk’s channels for {session.room}. The name on each mic goes on that mic’s captions.</p>

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
                {r.who === OTHER && <TextInput value={r.other} maxLength={60} onChange={(e) => set(i, { other: e.target.value })} placeholder="Name and organisation" aria-label={`Name on mic ${r.mic}`} className="sm:w-64" />}
              </div>
              <button type="button" onClick={() => setRows((all) => all.filter((_, j) => j !== i))} aria-label={`Remove mic ${r.mic}`} className={buttonClass({ style: 'borderless', color: 'gray', iconOnly: true, className: 'hover:text-danger' })}>
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
          <p className="flex items-center gap-2 text-sm text-[#7c7c7c]">
            <MicrophoneIcon className="size-4" /> No mics named: captions for this session stay unlabelled.
          </p>
        )}
      </div>
    </section>
  );
}
