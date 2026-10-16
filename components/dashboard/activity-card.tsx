import Link from 'next/link';
import { ExclamationTriangleIcon, InformationCircleIcon, ShieldExclamationIcon } from '@heroicons/react/24/outline';

import { Avatar } from '@/components/shell/avatar';
import { Panel } from '@/components/ui/panel';
import { EmptyState } from '@/components/ui/states';
import type { DashboardView } from '@/lib/dashboard/types';
import { ago } from '@/lib/format';

/** Severity as icon + tint + a spoken name, so it never rests on colour alone. */
export const SEVERITY = {
  info: { icon: InformationCircleIcon, tint: 'bg-primary-soft text-primary', label: 'Info' },
  warning: { icon: ExclamationTriangleIcon, tint: 'bg-secondary-soft text-gold', label: 'Warning' },
  critical: { icon: ShieldExclamationIcon, tint: 'bg-danger-soft text-danger', label: 'Critical' },
} as const;

const moreLink = 'text-sm text-hint hover:text-primary';
const body = 'flex flex-1 flex-col px-6 py-5';

/** The newest account and security events. */
export function ActivityCard({ activity }: { activity: DashboardView['activity'] }) {
  return (
    <Panel
      title="Notifications"
      actions={
        <Link href="/security" className={moreLink}>
          Security log
        </Link>
      }
      className="flex flex-col"
      bodyClassName={body}
    >
      {activity.length === 0 ? (
        <EmptyState title="Nothing yet" body="Sign-ins and security events show here." className="py-8" />
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
                  <p className="text-xs text-hint">{ago(event.at)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}

/** The people who most recently got their first ticket to this event (not every sign-up). */
export function NewDelegatesCard({ people }: { people: DashboardView['recentDelegates'] }) {
  return (
    <Panel
      title="New ticket holders"
      actions={
        <Link href="/delegates" className={moreLink}>
          All delegates
        </Link>
      }
      className="flex flex-col"
      bodyClassName={body}
    >
      {people.length === 0 ? (
        <EmptyState title="No ticket holders yet" body="Accounts without a ticket are on the Delegates page." className="py-8" />
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
    </Panel>
  );
}
