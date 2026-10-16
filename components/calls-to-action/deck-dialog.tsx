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
import type { BuildLayout } from '@/lib/calls-to-action/build-deck';

/** How the deck is made: designed by the AI for the event, or the commitment template's cards or table. */
export type DeckStyle = 'designed' | BuildLayout;
import type { DeckDesignResponse } from '@/lib/calls-to-action/deck';
import { dateRange, type Edition } from '@/lib/events/events';
import { dayDate, timeRange, type Session } from '@/lib/programme/programme';
import { cn } from '@/lib/utils';

type Kind = 'session' | 'day';

/** "Tue 8 Sept 2026" for a day of the event. */
const dayLabel = (edition: Edition, day: number) =>
  new Date(`${dayDate(edition.startsAt, day)}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace('Sep ', 'Sept ');

/** File names from titles: letters, digits and dashes. */
const slug = (t: string) =>
  t
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);

/**
 * Makes a calls-to-action deck: one session's slide (actor, commitment, timeline) when the session
 * ends, or the end-of-day deck for a whole day. Only approved calls go in. An event set to the Build
 * template (Branding) gets Build's commitment slides, as cards or a table, drawn straight away;
 * any other is designed for the event by Claude, on the server.
 */
export function DeckDialog({
  open,
  edition,
  items,
  sessions,
  initialSessionId,
  initialStyle = 'designed',
  onClose,
}: {
  open: boolean;
  edition: Edition;
  items: CallToAction[];
  sessions: Session[];
  /** The session to offer first: the one being filtered on, if any. */
  initialSessionId: string | null;
  /** What was picked from the Make a deck menu. */
  initialStyle?: DeckStyle;
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
  const [style, setStyle] = useState<DeckStyle>(initialStyle);
  // cards or a table: the commitment template, in Build's look for a Build event, else the event's own
  const build = style !== 'designed';
  const buildLook = edition.deckTemplate === 'build';

  const count = (kind === 'session' ? approved.filter((c) => c.sessionId === sessionId) : approved.filter((c) => withCalls.some((s) => s.id === c.sessionId && String(s.day) === day))).length;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const session = withCalls.find((s) => s.id === sessionId);
    if (kind === 'session' ? !session : !day) return setError(kind === 'session' ? 'Choose a session with approved calls.' : 'Choose a day with approved calls.');
    setError(null);
    setPending(true);
    if (build) return void makeBuildDeck(session);
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

  /** The Build template: the session's (or the day's) commitments as cards or a table, no design step. */
  const makeBuildDeck = async (session: Session | undefined) => {
    try {
      const { downloadBuildDeck } = await import('@/lib/calls-to-action/build-deck');
      const lineOf = (s: Session) => [dayLabel(edition, s.day), timeRange(s.startsAt, s.endsAt), s.room].filter(Boolean).join(' | ');
      const chosen = kind === 'session' ? [session!] : withCalls.filter((s) => String(s.day) === day).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const where = edition.venue ?? edition.city;
      await downloadBuildDeck(
        {
          sessions: chosen.map((s) => ({ title: s.title, when: lineOf(s), calls: approved.filter((c) => c.sessionId === s.id) })),
          layout: style as BuildLayout,
          event: { name: edition.name, shortName: edition.shortName, brandColor: edition.brandColor ?? null, logoUrl: edition.logoUrl ?? null, build: buildLook },
          ...(kind === 'day' ? { day: { subtitle: [`Day ${day}`, dayLabel(edition, Number(day)), where].filter(Boolean).join(' · ') } } : {}),
        },
        kind === 'session' ? `${edition.shortName}-${slug(session!.title)}.pptx` : `${edition.shortName}-day-${day}-commitments.pptx`,
      );
      toast.push({
        title: kind === 'session' ? 'Session slide downloaded' : 'End-of-day deck downloaded',
        body: `${buildLook ? 'Build commitment template' : `In ${edition.shortName}'s colours`}, ${style === 'cards' ? 'as cards' : 'as a table'}.`,
        leading: { kind: 'icon', icon: PresentationChartBarIcon, tone: 'success' },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The deck could not be made. Try again.');
    } finally {
      setPending(false);
    }
  };

  /** One option of a radio group drawn as a choice card. */
  const choice = <T extends string>(current: T, set: (v: T) => void, value: T, label: string, hint: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={current === value}
      onClick={() => set(value)}
      className={cn('flex flex-1 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left', current === value ? 'border-primary bg-primary-soft/50' : 'border-border hover:border-border-strong')}
    >
      <span className={cn('text-sm', current === value ? 'font-medium text-primary' : 'text-ink')}>{label}</span>
      <span className="text-xs text-hint">{hint}</span>
    </button>
  );

  return (
    <FormDialog
      open={open}
      icon={PresentationChartBarIcon}
      title="Make a deck"
      subtitle={
        build
          ? `As ${style === 'cards' ? 'cards' : 'a table'}${buildLook ? ' in the Build commitment template' : ` in ${edition.shortName}'s colours`}. Only approved calls go in.`
          : `Designed for ${edition.shortName} from its colours, logo and cover. Only approved calls go in.`
      }
      pending={pending}
      pendingLabel={build ? 'Making the deck…' : 'Designing… about a minute'}
      submitLabel={`Download${count ? ` (${count} ${count === 1 ? 'call' : 'calls'})` : ''}`}
      error={error}
      onSubmit={submit}
      onClose={onClose}
    >
      {pending && !build ? (
        <DeckProgress colour={edition.brandColor ?? '#002D74'} kind={kind} />
      ) : (
        <>
          <div role="radiogroup" aria-label="What the deck covers" className="flex flex-col gap-2 sm:flex-row">
            {choice(kind, setKind, 'session', 'One session', build ? "The session's commitments and recommendations" : 'A single slide: actor, commitment, timeline')}
            {choice(kind, setKind, 'day', 'End of day', build ? 'A cover, each session, a closing slide' : "The full deck for the day's sessions")}
          </div>
          {build && (
            <div role="radiogroup" aria-label="Layout" className="flex flex-col gap-2 sm:flex-row">
              {choice(style, setStyle, 'cards', 'Cards', 'Template #1: eight to a slide')}
              {choice(style, setStyle, 'table', 'Table', 'Template #2: up to twelve rows to a slide')}
            </div>
          )}
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
