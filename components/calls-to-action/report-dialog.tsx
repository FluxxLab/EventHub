'use client';

import { CheckIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import type { RapporteurReport } from '@/lib/calls-to-action/report-docx';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition } from '@/lib/events/events';
import { timeRange, type Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

type ReportResponse = { report: RapporteurReport; event: string; session: { title: string; startsAt: string; endsAt: string; room: string | null }; read: number };

/** What the wait is spent on, and roughly when each starts (seconds): one request, so paced, not reported. */
const STEPS = [
  { at: 0, label: 'Reading the transcript' },
  { at: 8, label: 'Finding the key insights and perspectives' },
  { at: 22, label: 'Weighing opportunities and challenges' },
  { at: 38, label: 'Matching recommendations and commitments' },
  { at: 52, label: 'Filling in the report' },
] as const;

const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const slug = (t: string) =>
  t
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/** A sample answer for demo mode, which has no server to write one. */
const DEMO_REPORT: RapporteurReport = {
  purpose: 'To agree what is needed for public data to serve inclusion.',
  attendees: 'The programmed speakers and moderator.',
  insights: [
    {
      insight: 'Open data is under-used.',
      whyItMatters: 'Startups and researchers cannot build on it.',
      evidence: 'Speakers cited closed datasets.',
      implications: 'An open data policy with safeguards.',
    },
  ],
  perspectives: ['Openness against privacy: speakers agreed on the goal, not the pace.'],
  opportunities: [],
  challenges: [],
  recommendations: [],
  commitments: [],
  synthesis: 'A demo report: in the live console this is written from the session’s transcript.',
};

/** The steps beneath the wait, ticking off in turn (as the deck's do). */
function ReportProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = STEPS.reduce((at, step, i) => (seconds >= step.at ? i : at), 0);
  return (
    <div className="flex flex-col gap-4">
      <ol aria-live="polite" className="flex flex-col">
        {STEPS.map((step, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={step.label} className="deck-step relative flex gap-3 pb-3 text-sm last:pb-0" style={{ animationDelay: `${i * 60}ms` }}>
              {i < STEPS.length - 1 && (
                <span className="absolute top-[22px] bottom-0.5 left-2.5 w-px -translate-x-1/2 bg-border" aria-hidden>
                  <span className={cn('block h-full origin-top bg-primary transition-transform duration-[var(--motion-slow)]', done ? 'scale-y-100' : 'scale-y-0')} />
                </span>
              )}
              <span
                key={done ? 'done' : now ? 'now' : 'waiting'}
                className={cn('pop-in flex size-5 shrink-0 items-center justify-center rounded-full', done ? 'bg-primary text-on-primary' : now ? 'border-2 border-primary' : 'border border-border')}
              >
                {done ? <CheckIcon className="check-pop size-3" /> : now ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : null}
              </span>
              <span className={cn('pt-px', done ? 'text-ink-soft' : now ? 'font-medium text-ink' : 'text-placeholder')}>
                {step.label}
                {now && <span className="sr-only"> (in progress)</span>}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-hint">This takes about a minute. The Word file downloads when it is ready.</p>
    </div>
  );
}

/**
 * The rapporteur's report for one session, as a Word file: the AI reads the session's transcript
 * and its approved calls to action, and the answer is filled into the Rapporteur Session Guide
 * (key insights, perspectives, opportunities, challenges, recommendations, commitments, closing
 * synthesis). A draft for the rapporteur to check before it is shared.
 */
export function ReportDialog({ open, edition, sessions, initialSessionId, onClose }: { open: boolean; edition: Edition; sessions: Session[]; initialSessionId: string | null; onClose: () => void }) {
  const id = useId();
  const toast = useToast();
  const auth = useSession();
  const [sessionId, setSessionId] = useState(initialSessionId && sessions.some((s) => s.id === initialSessionId) ? initialSessionId : (sessions.at(-1)?.id ?? ''));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return setError('Choose a session.');
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const answer: ReportResponse = DEMO_MODE
          ? { report: DEMO_REPORT, event: edition.name, session: { title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, room: session.room }, read: 0 }
          : await api.postSlow<ReportResponse>(`/sessions/${session.id}/rapporteur-report`);
        const { reportDocx, saveFile } = await import('@/lib/calls-to-action/report-docx');
        const blob = await reportDocx(
          {
            event: answer.event,
            date: `${longDate(answer.session.startsAt)}, ${timeRange(answer.session.startsAt, answer.session.endsAt)}${answer.session.room ? `, ${answer.session.room}` : ''}`,
            title: answer.session.title,
            completedBy: auth.status === 'signed-in' ? `${auth.user.name} (drafted with AI from the session transcript)` : 'Drafted with AI from the session transcript',
            completedOn: longDate(new Date().toISOString()),
          },
          answer.report,
        );
        saveFile(blob, `${edition.shortName}-${slug(session.title)}-rapporteur-report.docx`);
        toast.push({
          title: 'Rapporteur report downloaded',
          body: 'A draft from the transcript: check the insights and commitments before sharing it.',
          leading: { kind: 'icon', icon: DocumentTextIcon, tone: 'success' },
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The report could not be written. Try again.');
      } finally {
        setPending(false);
      }
    })();
  };

  return (
    <FormDialog
      open={open}
      icon={DocumentTextIcon}
      title="Rapporteur report"
      subtitle="Written from the session’s transcript and its approved calls, in the Rapporteur Session Guide (Word)."
      pending={pending}
      pendingLabel="Writing… about a minute"
      submitLabel="Download report"
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {pending ? (
        <ReportProgress />
      ) : (
        <Field id={`${id}-session`} label="Session" hint="Analyse the session first so its recommendations and commitments are approved; the report keeps the two apart.">
          <Select
            id={`${id}-session`}
            value={sessionId}
            options={sessions.length ? sessions.map((s) => ({ value: s.id, label: `Day ${s.day} · ${timeRange(s.startsAt, s.endsAt)} · ${s.title}` })) : [{ value: '', label: 'No sessions yet' }]}
            onChange={setSessionId}
          />
        </Field>
      )}
    </FormDialog>
  );
}
