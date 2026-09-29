'use client';

import { CheckCircleIcon, TagIcon } from '@heroicons/react/24/outline';
import { useState, type FormEvent } from 'react';

import { TopicPicker } from '@/components/events/topic-picker';
import { FormDialog } from '@/components/ui/form-dialog';
import { useToast } from '@/components/ui/toaster';
import { useSession } from '@/lib/auth/session';
import { activeValues } from '@/lib/catalog/topics';
import { useCreateInterest, useCreateTrack, useInterestLibrary, useSaveEditionTopics, useTrackLibrary, type EditionTopics } from '@/lib/catalog/use-topics';
import type { Edition } from '@/lib/events/events';

/**
 * An event's tracks and interests, picked from the shared lists. `value` null means "not chosen
 * yet": the pickers show every active one ticked, which is what the event gets if left alone.
 */
export function EventTopicsFields({ id, value, onChange }: { id: string; value: EditionTopics | null; onChange: (value: EditionTopics) => void }) {
  const tracks = useTrackLibrary();
  const interests = useInterestLibrary();
  const createTrack = useCreateTrack();
  const createInterest = useCreateInterest();
  const current = value ?? defaultTopics(tracks.data, interests.data);
  const auth = useSession();
  const canAdd = auth.status === 'signed-in' && auth.user.tier === 'admin';

  return (
    <>
      <TopicPicker
        id={`${id}-tracks`}
        label="Tracks"
        noun="track"
        hint="The themes sessions are filed under and delegates follow. General Programme (plenaries, breaks) is always there."
        library={tracks.data}
        error={tracks.error?.message ?? null}
        selected={current.trackValues}
        onChange={(trackValues) => onChange({ ...current, trackValues })}
        onCreate={canAdd ? (label) => createTrack.mutateAsync(label) : undefined}
      />
      <TopicPicker
        id={`${id}-interests`}
        label="Interests"
        noun="interest"
        hint="What delegates choose from on their profile to meet people."
        library={interests.data}
        error={interests.error?.message ?? null}
        selected={current.interestValues}
        onChange={(interestValues) => onChange({ ...current, interestValues })}
        onCreate={canAdd ? (label) => createInterest.mutateAsync(label) : undefined}
      />
    </>
  );
}

/** What an event gets when nobody chooses: every active track and interest. */
export function defaultTopics(tracks: Parameters<typeof activeValues>[0] | undefined, interests: Parameters<typeof activeValues>[0] | undefined): EditionTopics {
  return { trackValues: activeValues(tracks ?? []), interestValues: activeValues(interests ?? []) };
}

/** Changes an existing event's tracks and interests. */
export function EventTopicsDialog({ edition, onClose }: { edition: Edition | null; onClose: () => void }) {
  const toast = useToast();
  const save = useSaveEditionTopics();
  const [draft, setDraft] = useState<EditionTopics | null>(null);
  const [openedFor, setOpenedFor] = useState<string | null>(null);
  if (edition && openedFor !== edition.id) {
    setOpenedFor(edition.id);
    // an event saved before tracks were per event has none stored: start from everything
    setDraft(edition.trackValues || edition.interestValues ? { trackValues: edition.trackValues ?? [], interestValues: edition.interestValues ?? [] } : null);
  }
  const tracks = useTrackLibrary();
  const interests = useInterestLibrary();

  const close = () => {
    setOpenedFor(null);
    save.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!edition || !tracks.data || !interests.data) return;
    const topics = draft ?? defaultTopics(tracks.data, interests.data);
    save.mutate(
      { editionId: edition.id, ...topics },
      {
        onSuccess: () => {
          toast.push({ title: 'Tracks and interests saved', body: `${edition.shortName}’s programme and delegate profiles use the new lists.`, leading: { kind: 'icon', icon: CheckCircleIcon, tone: 'success' } });
          close();
        },
      },
    );
  };

  return (
    <FormDialog
      open={edition !== null}
      icon={TagIcon}
      title={`Tracks and interests: ${edition?.shortName ?? ''}`}
      subtitle={edition?.name ?? ''}
      pending={save.isPending}
      submitLabel="Save"
      error={save.error?.message ?? null}
      onClose={close}
      onSubmit={submit}
    >
      <div className="grid gap-6">
        <EventTopicsFields id="edit-topics" value={draft} onChange={setDraft} />
      </div>
    </FormDialog>
  );
}
