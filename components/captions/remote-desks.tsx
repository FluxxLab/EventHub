'use client';

import { ComputerDesktopIcon, PlayIcon, StopIcon } from '@heroicons/react/24/outline';
import { useState } from 'react';

import { buttonClass } from '@/components/ui/button';
import { Panel } from '@/components/ui/panel';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import { useDeskCommand, useRemoteDesks, type RemoteDesk } from '@/lib/captions/desk-remote';
import { ago } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS: Record<string, { label: string; tone: string }> = {
  capturing: { label: 'Captioning', tone: 'text-success' },
  connecting: { label: 'Starting…', tone: 'text-warning' },
  reconnecting: { label: 'Reconnecting…', tone: 'text-warning' },
  error: { label: 'Error', tone: 'text-danger' },
};

/**
 * The sound desks at the venue, run from here: each desk's rooms with the channel they are patched
 * to, what is on air, and Start or Stop. Nothing to do with this computer's own audio.
 */
export function RemoteDesks() {
  const desks = useRemoteDesks();
  if (!desks.data?.length) return null;
  return (
    <Panel title="Remote desks" description="Sound desks at the venue, run from here. Changes happen on the desk as if clicked there; it reports back within seconds.">
      <div className="flex flex-col divide-y divide-border">
        {desks.data.map((d) => (
          <DeskCard key={d.deskId} desk={d} />
        ))}
      </div>
    </Panel>
  );
}

function DeskCard({ desk }: { desk: RemoteDesk }) {
  const toast = useToast();
  const command = useDeskCommand();
  const [confirmStop, setConfirmStop] = useState<string | null>(null);
  const send = (room: string, action: 'patch' | 'start' | 'stop', source?: string) =>
    command.mutate(
      { deskId: desk.deskId, room, action, source },
      {
        onSuccess: () => toast.push({ title: action === 'patch' ? (source ? `${room} patched` : `${room} unpatched`) : action === 'start' ? `Starting ${room}` : `Stopping ${room}`, body: `On ${desk.name}.` }),
        onError: (e) => toast.push({ title: 'The desk did not get it', body: e.message }),
      },
    );

  return (
    <section className="px-6 py-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ComputerDesktopIcon className="size-5 text-ink-soft" />
        <h3 className="font-medium text-ink">{desk.name}</h3>
        <span className="text-xs text-hint">· seen {ago(desk.reportedAt).toLowerCase()}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-hint">
              <th className="py-1.5 pr-3 font-normal">Room</th>
              <th className="py-1.5 pr-3 font-normal">Channel</th>
              <th className="py-1.5 pr-3 font-normal">Status</th>
              <th className="py-1.5 font-normal" />
            </tr>
          </thead>
          <tbody>
            {desk.rooms.map((r) => {
              const busy = !!r.status && r.status !== 'error';
              const waiting = command.pending === `${desk.deskId}|${r.room}`;
              const status = r.status ? (STATUS[r.status] ?? { label: r.status, tone: 'text-ink-soft' }) : null;
              return (
                <tr key={r.room} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium text-ink">{r.room}</td>
                  <td className="w-72 py-2 pr-3">
                    <Select
                      label={`Channel for ${r.room}`}
                      value={r.source ?? ''}
                      options={[{ value: '', label: 'Not patched' }, ...desk.channels.map((c) => ({ value: c.value, label: c.label }))]}
                      onChange={(v) => send(r.room, 'patch', v)}
                      className={cn(busy && 'pointer-events-none opacity-50')}
                    />
                  </td>
                  <td className={cn('py-2 pr-3', status?.tone ?? 'text-hint')}>
                    {waiting ? 'Sending…' : (status?.label ?? (r.source ? 'Ready' : 'Not patched'))}
                    {r.message && <span className="block max-w-56 truncate text-xs text-ink-soft" title={r.message}>{r.message}</span>}
                  </td>
                  <td className="py-2 text-right">
                    {busy ? (
                      <button
                        type="button"
                        disabled={waiting}
                        onClick={() => {
                          if (confirmStop !== r.room) {
                            setConfirmStop(r.room);
                            setTimeout(() => setConfirmStop((c) => (c === r.room ? null : c)), 4000);
                            return;
                          }
                          setConfirmStop(null);
                          send(r.room, 'stop');
                        }}
                        className={buttonClass({ style: confirmStop === r.room ? 'fill' : 'soft', color: 'danger', className: 'h-8' })}
                      >
                        <StopIcon className="size-4" />
                        {confirmStop === r.room ? 'Click again to stop' : 'Stop'}
                      </button>
                    ) : (
                      <button type="button" disabled={waiting || !r.source} onClick={() => send(r.room, 'start')} className={buttonClass({ className: 'h-8' })} title={r.source ? undefined : 'Choose its channel first'}>
                        <PlayIcon className="size-4" />
                        Start
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
