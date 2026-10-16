'use client';

import { Avatar } from '@/components/shell/avatar';
import { Panel } from '@/components/ui/panel';
import { useSession, TIER_LABEL } from '@/lib/auth/session';

/** The signed-in user's own details, as the console knows them. Read-only for now. */
export default function ProfilePage() {
  const state = useSession();
  // The console layout only renders pages once signed in.
  if (state.status !== 'signed-in') return null;
  const { user } = state;

  const rows = [
    { label: 'Name', value: user.name },
    { label: 'Email', value: user.email },
    { label: 'Role', value: TIER_LABEL[user.tier] },
  ];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <h1 className="sr-only">Profile</h1>
      <Panel title="Your account" description="Your details as the console knows them." bodyClassName="p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user.name} src={user.avatarUrl} size={80} online />
          <div className="min-w-0">
            <p className="truncate text-lg font-medium text-ink">{user.name}</p>
            <p className="truncate text-sm text-muted">{user.email}</p>
          </div>
        </div>
        <dl className="mt-6 divide-y divide-border border-t border-border">
          {rows.map((row) => (
            <div key={row.label} className="grid grid-cols-[8rem_1fr] gap-4 py-3 text-sm">
              <dt className="text-muted">{row.label}</dt>
              <dd className="min-w-0 truncate text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
