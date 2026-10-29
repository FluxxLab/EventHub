'use client';

import { CheckIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { useEffect, useId, useState, type FormEvent } from 'react';

import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api/client';
import { useSession } from '@/lib/auth/session';
import type { RapporteurReport, ReportHeader } from '@/lib/calls-to-action/report-docx';
import { DEMO_MODE } from '@/lib/demo';
import type { Edition } from '@/lib/events/events';
import { timeRange, type Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';
import { RELOADING, reloadIfStale } from '@/lib/stale-build';

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

/** The template's navy and gold. */
const NAVY = '#1F3864';
const GOLD = '#BF8F00';

/**
 * The report writing itself, in the same stages as the steps: the transcript's lines come in on
 * the left, then the page on the right fills, the header and insights, the perspectives, the
 * opportunities and challenges, the recommendations and commitments, and a tick as it is filled
 * in. Parts still to come are a faint outline, the current stage draws itself over and over,
 * finished parts hold still (the deck's motion, see .deck-art in globals.css).
 */
function ReportArt({ current }: { current: number }) {
  const part = (step: number, motion: 'deck-draw' | 'deck-grow' | 'deck-line') => (step === current ? motion : step > current ? 'deck-ghost' : undefined);
  // a table on the page: a navy head, then shaded and plain rows
  const table = (step: number, y: number, rows: number, cols: number[]) => (
    <g>
      <rect className={part(step, 'deck-line')} x={170} y={y} width={118} height={7} fill={NAVY} />
      {Array.from({ length: rows }, (_, i) => (
        <g key={i} className={part(step, 'deck-line')} style={{ animationDelay: `${0.25 + i * 0.25}s` }}>
          <rect x={170} y={y + 8 + i * 9} width={118} height={8} fill={i % 2 ? '#F2F2F2' : '#ffffff'} stroke="#D0D0D0" strokeWidth={0.4} />
          {cols.map((w, c) => (
            <rect key={c} x={174 + cols.slice(0, c).reduce((a, b) => a + b + 4, 0)} y={y + 11 + i * 9} width={w} height={2.4} rx={1.2} fill="#1a1a1a" fillOpacity={0.35} />
          ))}
        </g>
      ))}
    </g>
  );
  return (
    <svg viewBox="0 0 320 180" role="img" aria-label="The report being written" className="deck-art block h-auto w-full">
      <rect width="320" height="180" rx="6" fill="#ffffff" />
      {/* step 1, the transcript: speakers' lines arriving on the left */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i} className={part(0, 'deck-line')} style={{ animationDelay: `${i * 0.3}s` }}>
          <circle cx={26} cy={30 + i * 22} r={5} fill={i % 2 ? GOLD : NAVY} fillOpacity={0.8} />
          <rect x={36} y={26 + i * 22} width={78 - (i % 3) * 14} height={3} rx={1.5} fill="#1a1a1a" fillOpacity={0.45} />
          <rect x={36} y={32 + i * 22} width={56 - (i % 2) * 12} height={3} rx={1.5} fill="#1a1a1a" fillOpacity={0.25} />
        </g>
      ))}
      {/* the read flowing into the page */}
      <path className={part(0, 'deck-draw')} d="M124 90 C138 90 142 90 156 90" fill="none" stroke={GOLD} strokeWidth={2} strokeLinecap="round" pathLength="100" />
      {/* the page */}
      <rect x={162} y={8} width={134} height={164} rx={3} fill="#ffffff" stroke="#D0D0D0" />
      {/* step 2, the header and the insights */}
      <rect className={part(1, 'deck-line')} x={194} y={16} width={70} height={5} rx={1.5} fill={NAVY} />
      <rect className={part(1, 'deck-line')} style={{ animationDelay: '0.2s' }} x={208} y={24} width={42} height={3} rx={1.5} fill={GOLD} />
      <rect className={part(1, 'deck-line')} style={{ animationDelay: '0.3s' }} x={170} y={30} width={118} height={0.8} fill={GOLD} />
      {table(1, 36, 3, [6, 22, 22, 22, 18])}
      {/* step 3, the opportunities and challenges */}
      {table(2, 76, 2, [28, 36, 34])}
      {/* step 4, the recommendations and commitments */}
      {table(3, 104, 3, [28, 22, 28, 12])}
      {/* step 5, filled in: the closing lines and a tick */}
      <rect className={part(4, 'deck-line')} x={170} y={142} width={118} height={7} fill={NAVY} />
      <rect className={part(4, 'deck-line')} style={{ animationDelay: '0.2s' }} x={174} y={153} width={96} height={2.4} rx={1.2} fill="#1a1a1a" fillOpacity={0.35} />
      <g className={part(4, 'deck-grow')} style={{ transformOrigin: '284px 160px', animationDelay: '0.4s' }}>
        <circle cx={284} cy={160} r={9} fill={NAVY} />
        <path d="M279.5 160.5 L283 164 L289 157" fill="none" stroke="#ffffff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** The steps beneath the wait, ticking off in turn (as the deck's do). */
export function ReportProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  const current = STEPS.reduce((at, step, i) => (seconds >= step.at ? i : at), 0);
  // eases towards the end of about a minute, and waits there for the download
  const progress = Math.min(95, Math.round((1 - Math.exp(-seconds / 24)) * 100));
  return (
    <div className="flex flex-col gap-5">
      <div className="overflow-hidden rounded-xl border border-border bg-surface-soft">
        <div className="p-3">
          <ReportArt current={current} />
        </div>
        <div className="h-1 bg-border" role="progressbar" aria-label="Writing the report" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <div className="h-full origin-left bg-primary transition-transform duration-1000 ease-linear" style={{ transform: `scaleX(${progress / 100})` }} />
        </div>
      </div>
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
  const days = [...new Set(sessions.map((s) => s.day))].sort((a, b) => a - b);
  // the day the chosen session is on, else the latest day
  const [scope, setScope] = useState<string>('session');
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const completedBy = auth.status === 'signed-in' ? `${auth.user.name} (drafted with AI from the session transcript)` : 'Drafted with AI from the session transcript';

  const writeDay = async (day: number) => {
    const today = sessions.filter((s) => s.day === day && s.status === 'completed').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    if (!today.length) throw new Error(`No session on day ${day} has finished yet.`);
    setProgress({ done: 0, of: today.length });
    const parts: ({ header: ReportHeader; report: RapporteurReport; title: string } | null)[] = new Array(today.length).fill(null);
    let next = 0;
    let done = 0;
    // three at a time: each is a minute or so of AI reading
    const worker = async () => {
      while (next < today.length) {
        const i = next++;
        const session = today[i]!;
        try {
          const answer: ReportResponse = DEMO_MODE
            ? { report: DEMO_REPORT, event: edition.name, session: { title: session.title, startsAt: session.startsAt, endsAt: session.endsAt, room: session.room }, read: 0 }
            : await api.postSlow<ReportResponse>(`/sessions/${session.id}/rapporteur-report`);
          parts[i] = {
            title: `${timeRange(answer.session.startsAt, answer.session.endsAt)} · ${answer.session.room ?? session.room} · ${answer.session.title}`,
            header: {
              event: answer.event,
              date: `${longDate(answer.session.startsAt)}, ${timeRange(answer.session.startsAt, answer.session.endsAt)}${answer.session.room ? `, ${answer.session.room}` : ''}`,
              title: answer.session.title,
              completedBy,
              completedOn: longDate(new Date().toISOString()),
            },
            report: answer.report,
          };
        } catch {
          // a session with no transcript is left out; the toast says how many
        }
        setProgress({ done: ++done, of: today.length });
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    const written = parts.filter((p): p is NonNullable<typeof p> => p !== null);
    if (!written.length) throw new Error(`None of day ${day}'s sessions could be written up. Check they have captions.`);
    const { dayReportDocx, saveFile } = await import('@/lib/calls-to-action/report-docx');
    const blob = await dayReportDocx({ event: written[0]!.header.event, day: `Day ${day}, ${longDate(today[0]!.startsAt)}`, sessions: written.map((p) => p.title) }, written);
    saveFile(blob, `${edition.shortName}-day-${day}-rapporteur-report.docx`);
    toast.push({
      title: 'End of day report downloaded',
      body: `${written.length} session${written.length === 1 ? '' : 's'} in one file${written.length < today.length ? `; ${today.length - written.length} had nothing to write up` : ''}. A draft: check it before sharing.`,
      leading: { kind: 'icon', icon: DocumentTextIcon, tone: 'success' },
    });
    onClose();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (scope.startsWith('day:')) {
      setError(null);
      setPending(true);
      void writeDay(Number(scope.slice(4)))
        .catch((e: Error) => setError(e.message))
        .finally(() => {
          setPending(false);
          setProgress(null);
        });
      return;
    }
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
        if (reloadIfStale(e)) return setError(RELOADING);
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
      pendingLabel={progress ? `Writing… ${progress.done} of ${progress.of} sessions` : 'Writing… about a minute'}
      submitLabel="Download report"
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {pending ? (
        <>
          <ReportProgress />
          {progress && <p className="text-center text-sm text-ink-soft">{progress.done} of {progress.of} sessions written. A long day takes several minutes; keep this open.</p>}
        </>
      ) : (
        <>
          <Field id={`${id}-scope`} label="Report for">
            <Select
              id={`${id}-scope`}
              value={scope}
              options={[{ value: 'session', label: 'One session' }, ...days.map((d) => ({ value: `day:${d}`, label: `End of day ${d}: every finished session, in one file` }))]}
              onChange={setScope}
            />
          </Field>
          {scope === 'session' ? (
            <Field id={`${id}-session`} label="Session" hint="Analyse the session first so its recommendations and commitments are approved; the report keeps the two apart.">
              <Select
                id={`${id}-session`}
                value={sessionId}
                options={sessions.length ? sessions.map((s) => ({ value: s.id, label: `Day ${s.day} · ${timeRange(s.startsAt, s.endsAt)} · ${s.title}` })) : [{ value: '', label: 'No sessions yet' }]}
                onChange={setSessionId}
              />
            </Field>
          ) : (
            <p className="text-sm text-ink-soft">
              Writes the guide for each of the day’s {sessions.filter((s) => `day:${s.day}` === scope && s.status === 'completed').length} finished sessions, three at a time, and puts them in one Word file with a contents page. Do the agenda check and analysis first.
            </p>
          )}
        </>
      )}
    </FormDialog>
  );
}
