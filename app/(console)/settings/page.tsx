'use client';

import { Cog6ToothIcon } from '@heroicons/react/24/outline';

import { CategoryTiles } from '@/components/settings/category-tiles';
import { TopicLibrary } from '@/components/settings/topic-library';
import { EmptyState } from '@/components/ui/states';
import { tabId, tabPanelId, UnderlineTabs } from '@/components/ui/tabs';
import { useSession } from '@/lib/auth/session';
import { useUrlParam } from '@/lib/use-url-state';

const TABS = [
  { value: 'tracks', label: 'Tracks' },
  { value: 'interests', label: 'Interests' },
  { value: 'categories', label: 'Event categories' },
] as const;
type TabKey = (typeof TABS)[number]['value'];
const TAB_KEYS = TABS.map((t) => t.value);

/** Catalog & settings: the shared lists every event draws on, one section per tab. */
export default function SettingsPage() {
  const auth = useSession();
  const isAdmin = auth.status === 'signed-in' && auth.user.tier === 'admin';
  const [tab, setTab] = useUrlParam<TabKey>('tab', 'tracks', TAB_KEYS);

  if (!isAdmin) return <EmptyState framed icon={Cog6ToothIcon} title="Catalog and settings are for organisers" />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Catalog and settings</h1>
      <UnderlineTabs label="Settings" idBase="settings" options={[...TABS]} value={tab} onChange={setTab} />
      <div id={tabPanelId('settings', tab)} role="tabpanel" aria-labelledby={tabId('settings', tab)}>
        {tab === 'tracks' ? <TopicLibrary key="track" kind="track" /> : tab === 'interests' ? <TopicLibrary key="interest" kind="interest" /> : <CategoryTiles />}
      </div>
    </div>
  );
}
