'use client';

import { Select } from '@/components/ui/select';
import { useWorkingEdition } from '@/lib/events/working-edition';

/**
 * The event every page works on, picked once here. Marks the one delegates see in the app, which
 * is set separately in Events. Hidden until there are two events to choose between.
 */
export function EventSwitcher() {
  const { list, edition, setEditionId } = useWorkingEdition();
  if (list.length < 2 || !edition) return null;
  return (
    <div className="hidden w-56 lg:block">
      <Select
        label="Event to work on"
        value={edition.id}
        options={list.map((e) => ({ value: e.id, label: e.isCurrent ? `${e.shortName} · in the app` : e.shortName }))}
        onChange={setEditionId}
      />
    </div>
  );
}
