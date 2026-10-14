'use client';

import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { STATUS_LABEL, type Session, type SessionStatus } from '@/lib/programme/programme';
import { useSetSessionStatus } from '@/lib/programme/use-sessions';

export const STATUS_OPTIONS = (['scheduled', 'live', 'completed'] as const).map((s) => ({ value: s, label: STATUS_LABEL[s] }));

/** What a change tells people, said before it happens: going live and ending both reach phones. */
export function statusEffect(session: Pick<Session, 'room'>, status: SessionStatus): string {
  if (status === 'live') return `Captions start for ${session.room}, and every delegate gets a “Now live in ${session.room}” push (switch that off under Notifications › Automatic pushes).`;
  if (status === 'completed') return 'Captions stop, and attendees are asked for feedback.';
  return 'It goes back to the schedule, and its “starting soon” reminder is set again.';
}

/**
 * A session's status, changed at will: Scheduled, Live (captions start) or Completed. The change
 * is confirmed first, since going live or ending sends pushes to delegates.
 */
export function SessionStatusPicker({ session, editionId, className }: { session: Session; editionId: string | undefined; className?: string }) {
  const toast = useToast();
  const setStatus = useSetSessionStatus(editionId);
  const [next, setNext] = useState<SessionStatus | null>(null);

  const confirm = () => {
    if (!next) return;
    setStatus.mutate(
      { session, status: next },
      {
        onSuccess: () => {
          toast.push({ title: `${session.title} is ${STATUS_LABEL[next].toLowerCase()}`, leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' } });
          setNext(null);
        },
        onError: (e) => toast.push({ title: 'Status not changed', body: e.message, leading: { kind: 'icon', icon: XCircleIcon, tone: 'danger' } }),
      },
    );
  };

  return (
    <>
      <Select label={`Status of ${session.title}`} value={session.status} options={STATUS_OPTIONS} onChange={(v) => v !== session.status && setNext(v)} className={className} />
      <ConfirmDialog
        open={!!next}
        title={next ? `Make “${session.title}” ${STATUS_LABEL[next].toLowerCase()}?` : ''}
        confirmLabel={next ? `Make it ${STATUS_LABEL[next].toLowerCase()}` : 'Change'}
        pendingLabel="Changing…"
        pending={setStatus.isPending}
        onConfirm={confirm}
        onCancel={() => setNext(null)}
      >
        {next ? statusEffect(session, next) : ''}
      </ConfirmDialog>
    </>
  );
}
