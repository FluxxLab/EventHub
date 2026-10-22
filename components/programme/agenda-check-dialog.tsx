'use client';

import { ArrowRightCircleIcon, CheckCircleIcon, ClipboardDocumentCheckIcon, ExclamationTriangleIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { cancelClass, ModalActions, ModalHeader, modalClass } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { AgendaArt, WorkCard } from '@/components/ui/work-art';
import { applyAgendaFix, checkRoomAgainstAgenda, type AgendaCheckResult, type AgendaFix } from '@/lib/captions/agenda-check';
import { recheckNames } from '@/lib/captions/speaker-names';
import { clock } from '@/lib/format';
import type { Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

const ALL = '__all__';
const FIT_LABEL = { matches: 'Matches its topic', partly: 'Partly matches', does_not_match: 'Does not match' } as const;

type RoomRun = { room: string; state: 'waiting' | 'running' | 'done' | 'failed'; result?: AgendaCheckResult; error?: string };

/**
 * Before analysing a day or making its deck: AI reads each room's captions against the agenda
 * (names called, subject) and lists stretches filed under the wrong session, each moved with one
 * click once an organiser agrees. Then the day's speaker names are rechecked.
 */
export function AgendaCheckDialog({ open, day, editionId, sessions, onClose }: { open: boolean; day: number; editionId: string; sessions: Session[]; onClose: () => void }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const baseId = useId();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  const today = sessions.filter((s) => s.day === day);
  const rooms = [...new Map(today.filter((s) => s.status !== 'scheduled').map((s) => [s.room.trim().toLowerCase(), s.room.trim()])).values()].sort();
  const [room, setRoom] = useState(ALL);
  const [runs, setRuns] = useState<RoomRun[]>([]);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [moving, setMoving] = useState<string | null>(null);
  const [naming, setNaming] = useState<{ at: number; of: number } | null>(null);
  const titleOf = (id: string | null) => (id ? (today.find((s) => s.id === id)?.title ?? 'another session') : 'no session');
  const running = runs.some((r) => r.state === 'running' || r.state === 'waiting');

  const check = async () => {
    const chosen = room === ALL ? rooms : [room];
    setRuns(chosen.map((r) => ({ room: r, state: 'waiting' })));
    setDone(new Set());
    // one room at a time: each is a long AI read, and the first results show while the rest run
    for (const r of chosen) {
      setRuns((all) => all.map((x) => (x.room === r ? { ...x, state: 'running' } : x)));
      try {
        const result = await checkRoomAgainstAgenda(editionId, day, r);
        setRuns((all) => all.map((x) => (x.room === r ? { ...x, state: 'done', result } : x)));
      } catch (e) {
        setRuns((all) => all.map((x) => (x.room === r ? { ...x, state: 'failed', error: (e as Error).message } : x)));
      }
    }
  };

  const keyOf = (f: AgendaFix) => `${f.fromSessionId}:${f.since}`;
  const move = (f: AgendaFix) => {
    setMoving(keyOf(f));
    applyAgendaFix(f)
      .then(({ moved, calls }) => {
        setDone((d) => new Set(d).add(keyOf(f)));
        void queryClient.invalidateQueries();
        toast.push({ title: 'Moved', body: `${moved} line(s)${calls ? ` and ${calls} call(s) to action` : ''} now under “${titleOf(f.toSessionId)}”.`, leading: { kind: 'icon', icon: ArrowRightCircleIcon, tone: 'success' } });
      })
      .catch((e: Error) => toast.push({ title: 'Not moved', body: e.message }))
      .finally(() => setMoving(null));
  };

  const recheckDay = async () => {
    const finished = today.filter((s) => s.status === 'completed');
    let added = 0;
    let failed = 0;
    for (let i = 0; i < finished.length; i++) {
      setNaming({ at: i + 1, of: finished.length });
      try {
        added += (await recheckNames(finished[i]!.id)).added;
      } catch {
        failed++;
      }
    }
    setNaming(null);
    toast.push({ title: 'Speaker names rechecked', body: `Day ${day}: ${added} name(s) added across ${finished.length} session(s)${failed ? `; ${failed} could not be read` : ''}.`, leading: { kind: 'icon', icon: UserGroupIcon, tone: 'success' } });
  };

  const busy = running || naming !== null;
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className={modalClass('lg')}
    >
      <div className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
        <div className="shrink-0 px-6 pb-3 pt-6">
          <ModalHeader icon={ClipboardDocumentCheckIcon} title="Check the day against the agenda" titleId={titleId} subtitle={`Day ${day} · names called and topics, room by room`} />
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-3 scrollbar-thin">
        <p className="text-sm text-ink-soft">
          AI reads each room’s captions beside the agenda, using the names called and what was discussed, and lists any stretch filed under the wrong session. Nothing moves until you click Move. Do this before analysing the day or making its deck.
        </p>
        <WorkCard progress={runs.length ? Math.round((runs.filter((r) => r.state === 'done' || r.state === 'failed').length / runs.length) * 100) : undefined} label="Checking the rooms">
          <AgendaArt current={!runs.length ? 0 : running ? 0 : 4} />
        </WorkCard>
        <div className="flex flex-wrap items-end gap-3">
          <Field id={`${baseId}-room`} label="Room" className="min-w-56">
            <Select id={`${baseId}-room`} value={room} onChange={setRoom} options={[{ value: ALL, label: `All rooms (${rooms.length})` }, ...rooms.map((r) => ({ value: r, label: r }))]} />
          </Field>
          <button type="button" onClick={() => void check()} disabled={running || !rooms.length} className={buttonClass()}>
            <ClipboardDocumentCheckIcon className="size-4" />
            {running ? 'Checking… a minute or two a room' : 'Check'}
          </button>
        </div>

        {runs.map((run) => (
          <section key={run.room} className="rounded-xl border border-border p-4">
            <h3 className="font-medium text-ink">{run.room}</h3>
            {run.state === 'waiting' && <p className="text-sm text-hint">Waiting…</p>}
            {run.state === 'running' && <p className="text-sm text-hint">Reading the captions against the agenda…</p>}
            {run.state === 'failed' && <p className="text-sm text-danger">{run.error}</p>}
            {run.result && (
              <div className="mt-2 flex flex-col gap-3">
                {run.result.fixes.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-ink">
                    <CheckCircleIcon className="size-5 text-success" /> Everything is filed under the right session.
                  </p>
                ) : (
                  run.result.fixes.map((f) => {
                    const key = keyOf(f);
                    const isDone = done.has(key);
                    return (
                      <div key={key} className={cn('rounded-lg border p-3', isDone ? 'border-border opacity-60' : 'border-warning/50 bg-warning-soft/30')}>
                        <p className="flex items-start gap-2 text-sm text-ink">
                          <ExclamationTriangleIcon className="mt-0.5 size-4 shrink-0 text-warning" />
                          <span>
                            {clock(f.since)}–{clock(f.until)} ({f.lines} lines) is filed under <strong>“{titleOf(f.fromSessionId)}”</strong> but belongs to{' '}
                            <strong>{f.toSessionId ? `“${titleOf(f.toSessionId)}”` : 'no session (a break or housekeeping)'}</strong>.
                          </span>
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">{f.reason}</p>
                        {f.namesHeard.length > 0 && <p className="mt-1 text-xs text-hint">Names heard: {f.namesHeard.join(', ')}</p>}
                        <blockquote className="mt-1 border-l-2 border-border pl-2 text-xs italic text-ink-soft">“{f.evidence}”</blockquote>
                        <div className="mt-2 flex items-center gap-3">
                          {f.toSessionId && (
                            <button type="button" disabled={isDone || moving !== null} onClick={() => move(f)} className={buttonClass({ className: 'h-8' })}>
                              <ArrowRightCircleIcon className="size-4" />
                              {isDone ? 'Moved' : moving === key ? 'Moving…' : 'Move'}
                            </button>
                          )}
                          <span className="text-xs text-hint">{Math.round(f.confidence * 100)}% sure</span>
                        </div>
                      </div>
                    );
                  })
                )}
                {run.result.fits.length > 0 && (
                  <ul className="flex flex-col gap-1 text-sm">
                    {run.result.fits.map((fit) => (
                      <li key={fit.sessionId} className="text-ink-soft">
                        <span className={cn('font-medium', fit.fit === 'matches' ? 'text-success' : fit.fit === 'partly' ? 'text-warning' : 'text-danger')}>{FIT_LABEL[fit.fit]}</span> · {titleOf(fit.sessionId)}
                        {fit.note ? ` · ${fit.note}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </section>
        ))}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
          <div className="min-w-0 flex-1 text-sm text-ink-soft">
            <strong className="text-ink">Then name the speakers.</strong> Links each voice to the name said in the captions (“my name is…”, “please welcome…”) in every finished session of day {day}, so transcripts and the deck show who spoke.
          </div>
          <button type="button" disabled={naming !== null || running} onClick={() => void recheckDay()} className={buttonClass({ style: 'soft', color: 'gray' })}>
            <UserGroupIcon className="size-4" />
            {naming ? `Naming… ${naming.at} of ${naming.of}` : 'Recheck names for the day'}
          </button>
        </div>
        </div>
        <ModalActions className="shrink-0 px-6 pb-6 pt-4">
          <button type="button" onClick={onClose} disabled={busy} className={cancelClass}>
            {busy ? 'Working…' : 'Close'}
          </button>
        </ModalActions>
      </div>
    </dialog>
  );
}
