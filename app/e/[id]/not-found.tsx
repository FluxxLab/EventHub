import { PublicShell } from '@/components/public-event/public-shell';

/** A shared link to an event that does not exist (or is not announced yet). Answered with a 404. */
export default function EventNotFound() {
  return (
    <PublicShell>
      <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-5 shadow-sm sm:p-8" aria-labelledby="not-found-title">
        <h1 id="not-found-title" className="text-xl font-medium text-primary">
          We couldn’t find this event
        </h1>
        <p className="text-sm text-muted">
          The link may be incomplete, or the event may no longer be listed. Ask whoever shared it for a fresh link, or browse events in the PIC Events app.
        </p>
      </section>
    </PublicShell>
  );
}
