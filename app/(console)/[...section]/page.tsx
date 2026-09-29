'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { notFound } from 'next/navigation';

import { buttonClass } from '@/components/ui/button';
import { pageFor } from '@/lib/nav';

/**
 * Stands in for every console page whose design has not been built yet, so the navigation works
 * end to end. A real page at the same path takes precedence over this catch-all.
 */
export default function PendingPage() {
  const pathname = usePathname();
  const match = pageFor(pathname);
  if (!match) notFound();

  const Icon = match.page.icon;
  return (
    <div className="mx-auto mt-10 max-w-lg rounded-lg border border-border bg-surface p-10 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <Icon className="size-6.5" />
      </span>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted">{match.group.label}</p>
      <h1 className="mt-1 text-2xl font-medium text-ink">{match.page.label}</h1>
      <p className="mt-2 text-sm text-muted">This page is next in the build. It will follow its design once it arrives.</p>
      <Link href="/" className={buttonClass({ className: 'mt-6' })}>
        Back to dashboard
      </Link>
    </div>
  );
}
