'use client';

import type { ReactNode } from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';

import { AppLinks, PublicShell } from '@/components/public-event/public-shell';
import {
  appEventLink,
  dateRange,
  eventIdFromPath,
  fetchPublicEvent,
  placeLine,
  STATUS_TEXT,
  ticketLine,
  type PublicEvent,
  type PublicEventResult,
} from '@/lib/public-event/public-event';
import { cn } from '@/lib/utils';

import EventNotFound from './event-not-found';

/**
 * The public page a shared event link opens (`<site>/e/<edition id>`, built by the delegate app's
 * share sheet). No sign-in: outside the `(console)` group and its guard. The console is static
 * files, so this one page is served for every `/e/<id>` by the Worker (worker/index.js), which also
 * writes the event into the page's link-preview tags; here the details load in the browser from
 * `GET /editions/:id/public`.
 */

const noSubscribe = () => () => undefined;

export default function PublicEventPage() {
  // null during the static build; the edition id once the browser has the link
  const id = useSyncExternalStore(noSubscribe, () => eventIdFromPath(window.location.pathname) ?? '', () => null);
  const [result, setResult] = useState<PublicEventResult | null>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    void fetchPublicEvent(id).then((r) => {
      if (!live) return;
      setResult(r);
      if (r.kind === 'ok') document.title = `${r.event.name} · PIC Events`;
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (id === '' || result?.kind === 'not-found') return <EventNotFound />;
  return (
    <PublicShell>
      {!result || !id ? (
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8" aria-busy="true">
          <div className="aspect-[16/9] w-full animate-pulse rounded-lg bg-surface-soft" />
          <div className="h-7 w-2/3 animate-pulse rounded bg-surface-soft" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-surface-soft" />
        </div>
      ) : result.kind === 'ok' ? (
        <EventDetails event={result.event} />
      ) : (
        <Unavailable id={id} />
      )}
    </PublicShell>
  );
}

function EventDetails({ event }: { event: PublicEvent }) {
  const when = dateRange(event.startsAt, event.endsAt);
  const where = placeLine(event);
  const tickets = ticketLine(event);
  const description = event.description?.trim();

  return (
    <article className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm" aria-labelledby="event-title">
      <Cover event={event} />
      <div className="flex flex-col gap-6 p-5 sm:p-8">
        <header className="flex flex-col gap-3">
          <p className="flex flex-wrap items-center gap-2 text-xs font-medium tracking-wide uppercase">
            <span
              className={cn(
                'rounded-full px-2.5 py-1',
                event.status === 'live' ? 'bg-danger-soft text-danger' : event.status === 'ended' ? 'bg-surface-soft text-muted' : 'bg-primary-soft text-primary',
              )}
            >
              {STATUS_TEXT[event.status]}
            </span>
            <span className="text-muted">{event.shortName}</span>
          </p>
          <h1 id="event-title" className="text-2xl leading-tight font-medium break-words text-primary sm:text-3xl">
            {event.name}
          </h1>
        </header>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {when ? (
            <Fact label="When">
              <time dateTime={event.startsAt}>{when}</time>
            </Fact>
          ) : null}
          {where || event.address ? (
            <Fact label="Where">
              {where ? <span className="block">{where}</span> : null}
              {event.address ? <span className="block text-muted">{event.address}</span> : null}
            </Fact>
          ) : null}
          {tickets ? <Fact label="Tickets">{tickets}</Fact> : null}
        </dl>

        {description ? (
          <section aria-labelledby="about-heading" className="flex flex-col gap-2">
            <h2 id="about-heading" className="text-base font-medium text-ink">
              About this event
            </h2>
            <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ink/85">{description}</p>
          </section>
        ) : null}

        <section aria-label="Get the app" className="border-t border-divider pt-6">
          <AppLinks appHref={appEventLink(event.id)} className="sm:max-w-sm" />
          <p className="mt-3 text-xs text-muted">Tickets, the programme, live captions and your QR pass are in the app.</p>
        </section>
      </div>
    </article>
  );
}

function Cover({ event }: { event: PublicEvent }) {
  if (event.coverUrl) {
    return (
      // A plain <img>: covers are signed S3 URLs (or the organiser's own host), so next/image has no
      // fixed remote host to allow, and the image is already sized by the upload.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={event.coverUrl} alt={`${event.name} cover`} className="aspect-[16/9] w-full bg-primary-soft object-cover" fetchPriority="high" />
    );
  }
  return (
    <div className="flex aspect-[16/9] w-full items-center justify-center bg-primary" aria-hidden="true">
      <div className="flex flex-col items-center gap-3">
        <Image src="/pic-logo.png" alt="" width={72} height={72} className="rounded-lg bg-on-primary p-1" />
        <div className="h-1 w-16 rounded-full bg-secondary" />
      </div>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium tracking-wide text-muted uppercase">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

/** The API did not answer: say so plainly, and still let an app user straight in. */
function Unavailable({ id }: { id: string }) {
  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8" aria-labelledby="unavailable-title">
      <h1 id="unavailable-title" className="text-xl font-medium text-primary">
        We can’t load this event right now
      </h1>
      <p className="text-sm text-muted">The event details are temporarily unavailable. Try again in a minute, or open the event in the app.</p>
      <AppLinks appHref={appEventLink(id)} className="sm:max-w-sm" />
    </section>
  );
}
