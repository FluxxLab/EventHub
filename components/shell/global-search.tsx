'use client';

import {
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  MagnifyingGlassIcon,
  MicrophoneIcon,
  Squares2X2Icon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from 'react';

import { runsEvents, type StaffUser } from '@/lib/auth/session';
import { dateRange } from '@/lib/events/events';
import { useEditions } from '@/lib/events/use-editions';
import type { HeroIcon } from '@/lib/nav';
import { navFor } from '@/lib/nav';
import { apiResults, groupResults, matchEvents, matchPages, MIN_QUERY, shortcutLabel, type ResultKind, type SearchResult } from '@/lib/search/search';
import { useSearch } from '@/lib/search/use-search';
import { cn } from '@/lib/utils';

const ICON: Record<ResultKind, HeroIcon> = {
  page: Squares2X2Icon,
  event: CalendarDaysIcon,
  session: ClipboardDocumentListIcon,
  speaker: MicrophoneIcon,
  delegate: UserIcon,
};

const noSubscribe = () => () => {};

/**
 * Search everything from anywhere: pages, events, sessions, speakers and delegates, opened from
 * the top bar or with Ctrl/⌘ K. Arrow keys move, Enter opens, Escape closes. Each result opens the
 * page that shows it, already filtered to it. What is offered follows the person's role.
 */
export function GlobalSearch({ user }: { user: StaffUser }) {
  const router = useRouter();
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const shortcut = useSyncExternalStore(noSubscribe, () => shortcutLabel(navigator.platform), () => 'Ctrl K');

  const events = runsEvents(user.tier);
  const editions = useEditions();
  const api = useSearch(query, open && events);
  const q = query.trim();

  const { groups, flat } = useMemo(() => {
    const found = api.data && q.length >= MIN_QUERY ? apiResults(api.data, { delegates: user.tier === 'admin' }) : null;
    return groupResults({
      page: matchPages(navFor(user.tier), q),
      ...(events
        ? {
            event: matchEvents(editions.data ?? [], q, (e) => `${e.shortName} · ${dateRange(e.startsAt, e.endsAt)}`),
            ...(found ?? {}),
          }
        : {}),
    });
  }, [api.data, q, user.tier, events, editions.data]);

  // Ctrl/⌘ K from anywhere; "/" too, unless someone is typing
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const typing = event.target instanceof HTMLElement && (event.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName));
      if ((event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) {
        event.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
    setActive(0);
  };
  const go = (result: SearchResult | undefined) => {
    if (!result) return;
    close();
    router.push(result.href);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = flat.length ? (active + step + flat.length) % flat.length : 0;
      setActive(next);
      document.getElementById(`${id}-opt-${next}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault();
      go(flat[active]);
    }
  };

  const searching = events && q.length >= MIN_QUERY && api.isFetching;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Search (${shortcut})`}
        className="mr-1.5 hidden h-10 w-56 items-center gap-2 rounded-lg border border-[#bdbdbd] bg-surface pl-3 pr-2 text-left text-sm text-placeholder shadow-xs transition-shadow hover:shadow-[0_1px_2px_rgba(36,36,36,0.05),0_0_0_4px_#f1f1f1] lg:flex"
      >
        <MagnifyingGlassIcon className="size-5 shrink-0 text-muted" />
        <span className="flex-1 truncate">Search</span>
        <kbd className="rounded border border-border bg-surface-soft px-1.5 py-0.5 font-sans text-[11px] text-muted">{shortcut}</kbd>
      </button>
      <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="flex size-9 items-center justify-center rounded text-ink hover:bg-surface-soft lg:hidden">
        <MagnifyingGlassIcon className="size-5" />
      </button>

      <dialog
        ref={dialog}
        aria-label="Search"
        onCancel={(event) => {
          event.preventDefault();
          close();
        }}
        onClick={(event) => event.target === event.currentTarget && close()}
        className="mx-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-[#dcdcdc] bg-[#fdfdfd] p-0 text-ink shadow-xxl backdrop:bg-ink/40"
      >
        <div className="flex items-center gap-3 border-b border-border px-4">
          <MagnifyingGlassIcon className="size-5 shrink-0 text-muted" />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${id}-list`}
            aria-activedescendant={flat.length ? `${id}-opt-${active}` : undefined}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={events ? 'Search pages, events, sessions, speakers…' : 'Jump to a page…'}
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-placeholder"
          />
          {searching && <span className="text-xs text-muted">Searching…</span>}
          <kbd className="rounded border border-border bg-surface-soft px-1.5 py-0.5 font-sans text-[11px] text-muted">Esc</kbd>
        </div>

        <div id={`${id}-list`} role="listbox" aria-label="Results" className="max-h-[min(60vh,28rem)] overflow-y-auto p-2 scrollbar-thin">
          {groups.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-[#7c7c7c]">
              {q.length < MIN_QUERY ? 'Type at least two letters.' : api.isFetching ? 'Searching…' : `Nothing matches “${q}”.`}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.kind} role="group" aria-label={group.label} className="pb-1">
                <p className="px-3 pb-1 pt-2 text-xs text-[#7c7c7c]">{group.label}</p>
                {group.results.map((r) => {
                  const i = flat.indexOf(r);
                  const Icon = r.icon ?? ICON[r.kind];
                  return (
                    <div
                      key={r.key}
                      id={`${id}-opt-${i}`}
                      role="option"
                      aria-selected={i === active}
                      onPointerMove={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2', i === active && 'bg-primary-soft')}
                    >
                      <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', i === active ? 'bg-surface text-primary' : 'bg-surface-soft text-muted')}>
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', i === active ? 'text-primary' : 'text-ink')}>{r.title}</span>
                        {r.detail && <span className="block truncate text-xs text-[#7c7c7c]">{r.detail}</span>}
                      </span>
                      {i === active && <span className="shrink-0 text-xs text-primary">Open ↵</span>}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <p className="flex items-center gap-4 border-t border-border bg-surface-soft/60 px-4 py-2 text-xs text-[#7c7c7c]">
          <span>↑ ↓ to move</span>
          <span>↵ to open</span>
          <span className="ml-auto">
            {shortcut} or / to search from anywhere
          </span>
        </p>
      </dialog>
    </>
  );
}
