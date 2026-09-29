'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import { MIN_QUERY, score, type SearchResponse } from '@/lib/search/search';

const DEMO: SearchResponse = {
  sessions: [
    { id: 'd1', title: 'Opening plenary: inclusion that scales', room: 'Main Hall', day: 1, startsAt: '2027-09-07T09:00:00+01:00', editionId: 'demo-gs27', editionName: 'GS-27' },
    { id: 'd2', title: 'Digital IDs and the last mile', room: 'Hall A', day: 1, startsAt: '2027-09-07T10:30:00+01:00', editionId: 'demo-gs27', editionName: 'GS-27' },
    { id: 'd4', title: 'Women in trade finance', room: 'Hall B', day: 1, startsAt: '2027-09-07T13:00:00+01:00', editionId: 'demo-gs27', editionName: 'GS-27' },
    { id: 'd5', title: 'Safe transport after dark', room: 'Hall A', day: 2, startsAt: '2027-09-08T09:30:00+01:00', editionId: 'demo-gs27', editionName: 'GS-27' },
  ],
  speakers: [
    { id: 's1', name: 'Amina Yusuf', role: 'Director', organisation: 'Policy Innovation Centre' },
    { id: 's2', name: 'Tunde Bakare', role: 'CTO', organisation: 'Paystack' },
    { id: 's3', name: 'Grace Obi', role: 'Researcher', organisation: 'NBS' },
    { id: 's4', name: 'Kwame Mensah', role: 'Economist', organisation: 'AfDB' },
  ],
  delegates: [
    { id: 'dl1', name: 'Ngozi Eze', title: 'Programme Officer', organisation: 'UN Women' },
    { id: 'dl2', name: 'Kemi Adeyemi', title: 'Founder', organisation: 'TechHer' },
    { id: 'dl3', name: 'Ibrahim Musa', title: 'Student', organisation: 'LSE' },
  ],
};

function demoSearch(query: string): SearchResponse {
  const hit = (...texts: (string | null)[]) => texts.some((t) => t && score(t, query) > 0);
  return {
    sessions: DEMO.sessions.filter((s) => hit(s.title, s.room)),
    speakers: DEMO.speakers.filter((s) => hit(s.name, s.organisation)),
    delegates: DEMO.delegates.filter((d) => hit(d.name, d.organisation)),
  };
}

/** A value that settles `ms` after it stops changing: one request per pause in typing, not per key. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/** Sessions, speakers and delegates matching the query (the API's search), five of each. */
export function useSearch(query: string, enabled: boolean) {
  const q = useSettled(query.trim(), 200);
  return useQuery({
    queryKey: ['admin', 'search', q],
    enabled: enabled && q.length >= MIN_QUERY,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoSearch(q)) : api.get<SearchResponse>('/search', { q, limit: 5 }, signal)),
  });
}
