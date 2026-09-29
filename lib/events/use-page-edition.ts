'use client';

import { useState } from 'react';

import { useEditions } from '@/lib/events/use-editions';

/**
 * The event a page works on, with a picker: the current event if the signed-in person runs it
 * (the API lists an event organiser only their events), otherwise the first of theirs.
 */
export function usePageEdition() {
  const editions = useEditions();
  const [picked, setPicked] = useState<string | null>(null);
  const list = editions.data ?? [];
  const edition = list.find((e) => e.id === picked) ?? list.find((e) => e.isCurrent) ?? list[0];
  const options = list.map((e) => ({ value: e.id, label: e.shortName }));
  return { editions, list, edition, options, setEditionId: setPicked };
}
