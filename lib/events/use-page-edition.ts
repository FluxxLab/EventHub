'use client';

import { useWorkingEdition } from '@/lib/events/working-edition';

/**
 * The event a page works on, with a picker: the console's working event (picked in the top bar
 * or on any page), else the app's current event, else the newest. The API lists an event
 * organiser only their events. Picking one here switches every page to it.
 */
export function usePageEdition() {
  const { editions, list, edition, setEditionId } = useWorkingEdition();
  const options = list.map((e) => ({ value: e.id, label: e.shortName }));
  return { editions, list, edition, options, setEditionId };
}
