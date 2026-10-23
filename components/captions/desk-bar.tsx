'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useDesk } from '@/components/captions/desk-provider';

/**
 * The sound desk seen from any page: rooms still on air from this computer, a click needed to
 * restart the sound after a reload, or rooms waiting to be put back. Nothing when the desk is idle.
 */
export function DeskBar() {
  const { desk, running, resumable, resumeState } = useDesk();
  const pathname = usePathname();
  const onDeskPage = pathname.startsWith('/captions');

  if (desk.audioBlocked) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-ink sm:px-7">
        <ExclamationTriangleIcon className="size-4 shrink-0 text-warning" />
        <strong>Captioning is waiting for a click.</strong> After the reload the browser holds the sound until you click anywhere on this page.
      </p>
    );
  }
  const waiting = resumeState !== 'done' ? resumable.map((r) => r.room) : [];
  if (waiting.length && !onDeskPage) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-ink sm:px-7">
        <ExclamationTriangleIcon className="size-4 shrink-0 text-warning" />
        <span>
          <strong>Not captioning since the reload:</strong> {waiting.join(', ')}.
        </span>
        <Link href="/captions?tab=desk" className="font-medium text-primary underline underline-offset-2">
          Open the sound desk to resume
        </Link>
      </p>
    );
  }
  if (!running.length || onDeskPage) return null;
  return (
    <p role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-surface px-4 py-1.5 text-xs text-ink-soft sm:px-7">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-danger" />
      </span>
      <span>
        <strong className="font-medium text-ink">Sound desk on air from this computer:</strong> {running.join(', ')}. Keep this tab open.
      </span>
      <Link href="/captions?tab=desk" className="font-medium text-primary underline underline-offset-2">
        Open sound desk
      </Link>
    </p>
  );
}
