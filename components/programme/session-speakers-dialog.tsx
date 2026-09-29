'use client';

import { CheckIcon, MagnifyingGlassIcon, MicrophoneIcon, UserPlusIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';

import { Avatar } from '@/components/shell/avatar';
import { Skeleton } from '@/components/ui/card';
import { TextInput } from '@/components/ui/field';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toaster';
import { clock } from '@/lib/format';
import type { Session, Speaker } from '@/lib/programme/programme';
import { useSetSessionSpeakers } from '@/lib/programme/use-sessions';
import { affiliation, searchSpeakers } from '@/lib/speakers/speakers';
import { useSpeakers } from '@/lib/speakers/use-speakers';
import { cn } from '@/lib/utils';

/**
 * Who speaks in a session: tick them from the speaker list (shared across events). Someone not on
 * the list is added on the Speakers page first.
 */
export function SessionSpeakersDialog({ session, editionId, onClose }: { session: Session | null; editionId: string | undefined; onClose: () => void }) {
  const toast = useToast();
  const speakers = useSpeakers();
  const save = useSetSessionSpeakers(editionId);
  const [picked, setPicked] = useState<Speaker[]>([]);
  const [query, setQuery] = useState('');
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (session && openedFor !== session.id) {
    setOpenedFor(session.id);
    setPicked(session.speakers);
    setQuery('');
  }

  const chosen = new Set(picked.map((s) => s.id));
  const list = searchSpeakers(speakers.data ?? [], query);
  const toggle = (s: Speaker) => setPicked((was) => (chosen.has(s.id) ? was.filter((p) => p.id !== s.id) : [...was, s]));
  const close = () => {
    setOpenedFor(null);
    save.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    save.mutate(
      { session, speakers: picked },
      {
        onSuccess: () => {
          toast.push({
            title: 'Speakers saved',
            body: picked.length ? `${picked.map((p) => p.name).join(', ')} on “${session.title}”.` : `“${session.title}” has no speakers now.`,
            leading: { kind: 'icon', icon: MicrophoneIcon, tone: 'success' },
          });
          close();
        },
      },
    );
  };

  return (
    <FormDialog
      open={session !== null}
      icon={MicrophoneIcon}
      title="Speakers"
      subtitle={session ? `${session.title} · Day ${session.day}, ${clock(session.startsAt)}–${clock(session.endsAt)} · ${session.room}` : ''}
      pending={save.isPending}
      submitLabel={picked.length ? `Save ${picked.length} speaker${picked.length === 1 ? '' : 's'}` : 'Save'}
      error={save.error?.message ?? null}
      onClose={close}
      onSubmit={submit}
    >
      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Chosen speakers">
          {picked.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => toggle(s)} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary bg-primary-soft px-3 text-sm text-primary" aria-label={`Remove ${s.name}`}>
                {s.name} <span aria-hidden>×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <TextInput icon={MagnifyingGlassIcon} aria-label="Search speakers" placeholder="Search by name or organisation" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
      {speakers.isPending ? (
        <Skeleton className="h-48" />
      ) : speakers.isError ? (
        <p role="alert" className="text-sm text-danger">
          {speakers.error.message}
        </p>
      ) : list.length === 0 ? (
        <p className="py-6 text-center text-sm text-[#7c7c7c]">{query ? `No speaker matches “${query}”.` : 'No speakers yet.'}</p>
      ) : (
        <ul className="-mx-2 grid max-h-72 gap-0.5 overflow-y-auto">
          {list.map((s) => {
            const on = chosen.has(s.id);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => toggle(s)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#f6f6f6]', on && 'bg-primary-soft/50 hover:bg-primary-soft/70')}
                >
                  <Avatar name={s.name} src={s.avatarUrl} size={40} className="rounded-full" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{s.name}</span>
                    {affiliation(s) && <span className="block truncate text-xs text-[#7c7c7c]">{affiliation(s)}</span>}
                  </span>
                  <span className={cn('flex size-5 shrink-0 items-center justify-center rounded border', on ? 'border-primary bg-primary text-on-primary' : 'border-[#bdbdbd]')} aria-hidden>
                    {on && <CheckIcon className="size-3.5" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="flex items-center gap-1.5 text-sm text-[#7c7c7c]">
        <UserPlusIcon className="size-4 shrink-0" />
        Not on the list?
        <Link href="/speakers" className="text-primary hover:underline">
          Add them on the Speakers page
        </Link>
      </p>
    </FormDialog>
  );
}
