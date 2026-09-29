'use client';

import { Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useState, type KeyboardEvent } from 'react';

import { CategoryTiles } from '@/components/settings/category-tiles';
import { TopicLibrary } from '@/components/settings/topic-library';
import { useSession } from '@/lib/auth/session';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'tracks', label: 'Tracks' },
  { key: 'interests', label: 'Interests' },
  { key: 'categories', label: 'Event categories' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

/**
 * Catalog & settings: the shared lists every event draws on. A button group across the top (the
 * design's settings panel), one list under it.
 */
export default function SettingsPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && auth.user.tier === 'admin';
  const [tab, setTab] = useState<TabKey>('tracks');

  // arrow keys move along the tabs, as a tablist should
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const i = TABS.findIndex((t) => t.key === tab);
    const next = TABS[(i + (event.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!;
    setTab(next.key);
    document.getElementById(`settings-tab-${next.key}`)?.focus();
  };

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-lg rounded-lg border border-[#dcdcdc] bg-[#fdfdfd] p-10 text-center">
        <Cog6ToothIcon className="mx-auto size-8 text-[#7c7c7c]" />
        <p className="mt-2 text-ink">Catalog and settings are for organisers</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <h1 className="sr-only">Catalog and settings</h1>
      <div role="tablist" aria-label="Settings" onKeyDown={onKey} className="grid grid-cols-3 overflow-hidden rounded-lg border border-[#dcdcdc] bg-[#fdfdfd]">
        {TABS.map((t) => (
          <button
            key={t.key}
            id={`settings-tab-${t.key}`}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            aria-controls="settings-panel"
            tabIndex={tab === t.key ? 0 : -1}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-9 truncate border-r border-[#dcdcdc] px-3 text-sm last:border-r-0',
              tab === t.key ? 'bg-primary-soft text-primary' : 'text-ink hover:bg-[#f6f6f6]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div id="settings-panel" role="tabpanel" aria-labelledby={`settings-tab-${tab}`}>
        {tab === 'tracks' ? <TopicLibrary key="track" kind="track" /> : tab === 'interests' ? <TopicLibrary key="interest" kind="interest" /> : <CategoryTiles />}
      </div>
    </div>
  );
}
