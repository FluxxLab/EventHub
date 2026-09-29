import Link from 'next/link';
import { ExclamationTriangleIcon, InformationCircleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';

import { Avatar } from '@/components/shell/avatar';
import { Card } from '@/components/ui/card';
import type { DashboardView } from '@/lib/dashboard/types';
import { ago } from '@/lib/format';

/** Severity as icon + tint + a spoken name, so it never rests on colour alone. */
export const SEVERITY = {
  info: { icon: InformationCircleIcon, tint: 'bg-primary-soft text-primary', label: 'Info' },
  warning: { icon: ExclamationTriangleIcon, tint: 'bg-secondary-soft text-gold', label: 'Warning' },
  critical: { icon: ShieldExclamationIcon, tint: 'bg-danger-soft text-danger', label: 'Critical' },
} as const;

const moreLink = 'text-sm text-ink/40 hover:text-primary';

/** The newest account and security events. */
export function ActivityCard({ activity }: { activity: DashboardView['activity'] }) {
  return (
    <Card title="Notifications" action={<Link href="/security" className={moreLink}>Security log</Link>}>
      {activity.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="-mx-2">
          {activity.slice(0, 5).map((event, i) => {
            const severity = SEVERITY[event.severity];
            return (
              <li key={`${event.at}-${i}`} className="flex gap-2 rounded-xl p-2">
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${severity.tint}`}>
                  <severity.icon className="size-4" title={severity.label} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink" title={event.description}>
                    {event.description}
                  </p>
                  <p className="text-xs text-ink/40">{ago(event.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** The people who most recently got their first ticket to this event (not every sign-up). */
export function NewDelegatesCard({ people }: { people: DashboardView['recentDelegates'] }) {
  return (
    <Card title="New ticket holders" action={<Link href="/delegates" className={moreLink}>All delegates</Link>}>
      {people.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No ticket holders yet. Accounts without a ticket are on the Delegates page.</p>
      ) : (
        <ul className="-mx-2">
          {people.slice(0, 6).map((person) => (
            <li key={person.id} className="flex items-center gap-2 rounded-xl p-2">
              <Avatar name={person.name} src={person.avatarUrl} size={24} />
              <span className="truncate text-sm text-ink">{person.name}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
