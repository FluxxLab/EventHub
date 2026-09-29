'use client';

import { ChevronRightIcon, HomeIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { crumbsFor } from '@/lib/nav';
import { cn } from '@/lib/utils';

/** A view inside a page (a campaign open in the editor, a tab): one more step, and how to go back. */
type SubPage = { label: string; back: () => void };

const SubPageContext = createContext<{ sub: SubPage | null; setSub: (sub: SubPage | null) => void }>({ sub: null, setSub: () => undefined });

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [sub, setSub] = useState<SubPage | null>(null);
  return <SubPageContext.Provider value={{ sub, setSub }}>{children}</SubPageContext.Provider>;
}

/**
 * Adds a step after the page's own crumb while a view inside the page is open; the page's crumb then
 * goes back to it with `onBack`. Pass `null` when the page is at its top level.
 */
export function useSubPage(label: string | null, onBack: () => void) {
  const { setSub } = useContext(SubPageContext);
  const back = useRef(onBack);
  useEffect(() => {
    back.current = onBack;
  }, [onBack]);
  useEffect(() => {
    if (label === null) return;
    setSub({ label, back: () => back.current() });
    return () => setSub(null);
  }, [label, setSub]);
}

const crumbClass = 'truncate rounded text-[#7c7c7c] transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/** Where this page sits: Dashboard › section › page, and a step inside the page when one is open. */
export function Breadcrumbs({ pathname, className }: { pathname: string; className?: string }) {
  const { sub } = useContext(SubPageContext);
  const crumbs = crumbsFor(pathname);
  if (crumbs.length < 2 && !sub) return null;
  const last = crumbs.length - 1;

  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1 text-xs leading-4">
        {crumbs.map((c, i) => {
          const current = i === last && !sub;
          return (
            <li key={`${c.label}-${i}`} className={cn('flex min-w-0 items-center gap-1', c.section && 'hidden sm:flex')}>
              {i > 0 && <ChevronRightIcon className="size-3 shrink-0 text-[#bdbdbd]" aria-hidden />}
              {current ? (
                <span aria-current="page" className="truncate text-ink">
                  {c.label}
                </span>
              ) : i === last && sub ? (
                <button type="button" onClick={sub.back} className={crumbClass}>
                  {c.label}
                </button>
              ) : c.href ? (
                <Link href={c.href} className={cn(crumbClass, 'flex items-center gap-1')}>
                  {i === 0 && <HomeIcon className="size-3.5 shrink-0" aria-hidden />}
                  {c.label}
                </Link>
              ) : (
                <span className="truncate text-[#7c7c7c]">{c.label}</span>
              )}
            </li>
          );
        })}
        {sub && (
          <li className="flex min-w-0 items-center gap-1">
            <ChevronRightIcon className="size-3 shrink-0 text-[#bdbdbd]" aria-hidden />
            <span aria-current="page" className="max-w-[40ch] truncate text-ink">
              {sub.label}
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}
