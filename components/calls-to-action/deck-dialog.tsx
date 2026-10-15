'use client';

import { PresentationChartBarIcon } from '@heroicons/react/24/outline';
import { useId, useMemo, useState, type FormEvent } from 'react';

import { DeckProgress } from '@/components/calls-to-action/deck-progress';
import { Field } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api/client';
import type { CallToAction } from '@/lib/calls-to-action/calls-to-action';
import type { DeckDesignResponse } from '@/lib/calls-to-action/deck';
import { dateRange, type Edition } from '@/lib/events/events';
import { dayDate, type Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

type Kind = 'session' | 'day';

/** "Tue 8 Sept 2026" for a day of the event. */
const dayLabel = (edition: Edition, day: number) =>
  new Date(`${dayDate(edition.startsAt, day)}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace('Sep ', 'Sept ');

/**
 * Makes a calls-to-action deck, designed for the event (by Claude, on the server): one session's slide (actor,
 * commitment, timeline) when the session ends, or the end-of-day deck for a whole day. Only
 * approved calls go in.
 */
export function DeckDialog({
  open,
  edition,
  items,
  sessions,
  initialSessionId,
  onClose,
}: {
  open: boolean;
  edition: Edition;
  items: CallToAction[];
  sessions: Session[];
  /** The session to offer first: the one being filtered on, if any. */
  initialSessionId: string | null;
  onClose: () => void;
}) {
  const id = useId();
  const toast = useToast();
  const approved = useMemo(() => items.filter((c) => c.status === 'approved'), [items]);
  const withCalls = useMemo(() => sessions.filter((s) => approved.some((c) => c.sessionId === s.id)), [sessions, approved]);
  const days = useMemo(() => [...new Set(withCalls.map((s) => s.day))].sort((a, b) => a - b), [withCalls]);

  const [kind, setKind] = useState<Kind>('session');
  const [sessionId, setSessionId] = useState(initialSessionId && withCalls.some((s) => s.id === initialSessionId) ? initialSessionId : (withCalls.at(-1)?.id ?? ''));
  const [day, setDay] = useState(String(days.at(-1) ?? ''));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const count = (kind === 'session' ? approved.filter((c) => c.sessionId === sessionId) : approved.filter((c) => withCalls.some((s) => s.id === c.sessionId && String(s.day) === day))).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const session = withCalls.find((s) => s.id === sessionId);
    if (kind === 'session' ? !session : !day) return setError(kind === 'session' ? 'Choose a session with approved calls.' : 'Choose a day with approved calls.');
    setError(null);
    setPending(true);
    void (async () => {
      try {
        const { downloadDeck, fallbackDesign, toDeckImage } = await import('@/lib/calls-to-action/deck');
        const scope = kind === 'session' ? { sessionId } : { day: Number(day) };
        const calls = kind === 'session' ? approved.filter((c) => c.sessionId === sessionId) : approved.filter((c) => withCalls.some((s) => s.id === c.sessionId && String(s.day) === day));
        // Claude designs it for this event; without it, it is drawn in the event's colours
        const answer = await api.postSlow<DeckDesignResponse>(`/editions/${edition.id}/calls-to-action/deck-design`, scope).catch((e: unknown) => {
          toast.push({ title: 'Designing without the AI', body: e instanceof Error ? e.message : 'The design service did not answer.' });
          return null;
        });
        const design = answer?.design ?? fallbackDesign(answer?.brandColor ?? edition.brandColor ?? null, calls);
        const titleOf = (sid: string | null) => sessions.find((s) => s.id === sid)?.title ?? (sid ? 'A removed session' : 'No session');
        const when = kind === 'session' ? `Day ${session!.day} · ${dayLabel(edition, session!.day)}` : `Day ${day} · ${dayLabel(edition, Number(day))}`;
        const slug = (t: string) =>
          t
            .replace(/[^\w-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60);
        await downloadDeck(
          {
            event: { name: edition.name, shortName: edition.shortName, when: kind === 'day' ? when : dateRange(edition.startsAt, edition.endsAt), where: edition.city ?? edition.venue },
            design,
            calls,
            sessionTitle: titleOf,
            logo: await toDeckImage(answer?.logo ?? null),
            logoDark: await toDeckImage(answer?.logoDark ?? null),
            cover: await toDeckImage(answer?.cover ?? null),
            ...(kind === 'session' ? { session: { title: session!.title, when } } : {}),
          },
          kind === 'session' ? `${edition.shortName}-${slug(session!.title)}.pptx` : `${edition.shortName}-day-${day}-calls-to-action.pptx`,
        );
        toast.push({
          title: kind === 'session' ? 'Session slide downloaded' : 'End-of-day deck downloaded',
          body: answer?.design
            ? `Designed for ${edition.shortName}${answer.guided ? ', following its brand guide' : ''}: ${design.rationale}`
            : `Drawn in ${edition.shortName}'s colours${answer?.reason ? ` (${answer.reason})` : ''}.`,
          leading: { kind: 'icon', icon: PresentationChartBarIcon, tone: 'success' },
        });
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'The deck could not be made. Try again.');
      } finally {
        setPending(false);
      }
    })();
  };

  const choice = (value: Kind, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={kind === value}
      onClick={() => setKind(value)}
      className={cn('flex flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left', kind === value ? 'border-primary bg-primary-soft/50' : 'border-border hover:border-[#bdbdbd]')}
    >
      <span className={cn('text-sm', kind === value ? 'font-medium text-primary' : 'text-ink')}>{label}</span>
      <span className="text-xs text-[#7c7c7c]">{hint}</span>
    </button>
  );

  return (
    <FormDialog
      open={open}
      icon={PresentationChartBarIcon}
      title="Make a deck"
      subtitle={`Designed for ${edition.shortName} from its colours, logo and cover. Only approved calls go in.`}
      pending={pending}
      pendingLabel="Designing… about a minute"
      submitLabel={`Download${count ? ` (${count} ${count === 1 ? 'call' : 'calls'})` : ''}`}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {pending ? (
        <DeckProgress colour={edition.brandColor ?? '#002D74'} kind={kind} />
      ) : (
        <>
          <div role="radiogroup" aria-label="What the deck covers" className="flex flex-col gap-2 sm:flex-row">
            {choice('session', 'One session', 'A single slide: actor, commitment, timeline')}
            {choice('day', 'End of day', "The full deck for the day's sessions")}
          </div>
          {kind === 'session' ? (
            <Field id={`${id}-session`} label="Session">
              <Select
                id={`${id}-session`}
                value={sessionId}
                options={
                  withCalls.length
                    ? withCalls.map((s) => ({ value: s.id, label: `Day ${s.day} · ${s.title} · ${approved.filter((c) => c.sessionId === s.id).length} approved` }))
                    : [{ value: '', label: 'No session has approved calls yet' }]
                }
                onChange={setSessionId}
              />
            </Field>
          ) : (
            <Field id={`${id}-day`} label="Day">
              <Select
                id={`${id}-day`}
                value={day}
                options={days.length ? days.map((d) => ({ value: String(d), label: `Day ${d} · ${dayLabel(edition, d)}` })) : [{ value: '', label: 'No day has approved calls yet' }]}
                onChange={setDay}
              />
            </Field>
          )}
        </>
      )}
    </FormDialog>
  );
}
