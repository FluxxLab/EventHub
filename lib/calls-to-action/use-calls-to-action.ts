'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import type { AnalyseResult, CallToAction, CallsToActionBoard, StakeholderLink, StakeholderMap, toBody } from '@/lib/calls-to-action/calls-to-action';
import { DEMO_MODE } from '@/lib/demo';

export const boardKey = (editionId: string) => ['admin', 'calls-to-action', editionId] as const;

const demoCall = (id: string, type: CallToAction['type'], directedAt: string, shortText: string, proposedBy: string, proposedByOrganisation: string | null): CallToAction => ({
  id,
  editionId: 'demo-gs27',
  sessionId: 'd2',
  type,
  action: shortText,
  shortText,
  directedAt,
  proposedBy,
  proposedByOrganisation,
  alsoProposedBy: [],
  deadline: null,
  amount: null,
  theme: null,
  quote: null,
  saidAt: null,
  needsDetail: false,
  status: 'suggested',
  mergedInto: null,
  source: 'manual',
  createdAt: '2027-09-07T10:40:00Z',
  updatedAt: '2027-09-07T10:40:00Z',
});

const DEMO: CallsToActionBoard = {
  aiReady: false,
  items: [
    demoCall('c1', 'recommendation', 'NITDA', 'Publish a shared compute access framework for universities by 2027', 'Grace Obi', 'NBS'),
    demoCall('c2', 'recommendation', 'NITDA', 'Open government datasets in machine-readable form', 'Tunde Bakare', null),
    demoCall('c3', 'pledge', 'World Bank', 'Fund a regional AI compute feasibility study', 'Mathew Verghis', 'World Bank'),
    demoCall('c4', 'recommendation', 'Federal Government', 'Make disaggregated data mandatory for all ministries', 'Grace Obi', 'NBS'),
  ],
  analyses: [],
};

const DEMO_STAKEHOLDERS: StakeholderMap = {
  stakeholders: [
    {
      name: 'National Information Technology Development Agency (NITDA)',
      spellings: ['National Information Technology Development Agency (NITDA)', 'NITDA'],
      delegates: [
        { id: 'd1', name: 'Amina Sambo-Magaji', title: 'Director IT', email: 'amina@nitda.gov.ng', admitted: true },
        { id: 'd2', name: 'Maryam Abdullahi', title: null, email: 'maryam@nitda.gov.ng', admitted: false },
      ],
      speakers: [{ id: 'sp1', name: 'Barr. Emmanuel Edet', role: 'Ag. Director Regulation and Compliance' }],
      asks: ['c1', 'c2'],
      commitments: [],
    },
    { name: 'World Bank', spellings: ['World Bank'], delegates: [{ id: 'd3', name: 'Mathew Verghis', title: 'Country Director', email: 'mverghis@worldbank.org', admitted: true }], speakers: [], asks: [], commitments: ['c3'] },
  ],
  byCall: { c1: ['National Information Technology Development Agency (NITDA)'], c2: ['National Information Technology Development Agency (NITDA)'], c3: ['World Bank'], c4: [] },
  unmatched: [{ target: 'Federal Government', calls: 1 }],
  links: [],
};

/**
 * The board's one fetch: every query on `boardKey` uses it (this page and the sidebar's count), as
 * a shared cache entry refetches with whichever observer's function it holds.
 */
export const fetchBoard = (editionId: string, signal?: AbortSignal) => (DEMO_MODE ? Promise.resolve(DEMO) : api.get<CallsToActionBoard>(`/editions/${editionId}/calls-to-action`, undefined, signal));

/** The event's calls to action, where each session's analysis has got to, and whether Analyse is on. */
export function useCallsToAction(editionId: string) {
  return useQuery({
    queryKey: boardKey(editionId),
    queryFn: ({ signal }) => fetchBoard(editionId, signal),
  });
}

/** Who a call may be directed at: the usual groups and the event's own organisations. */
export function useCallTargets(editionId: string) {
  return useQuery({
    queryKey: ['admin', 'calls-to-action-targets', editionId],
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(['Federal Government', 'Private sector']) : api.get<string[]>(`/editions/${editionId}/calls-to-action/targets`, undefined, signal)),
    staleTime: 60_000,
  });
}

type Body = ReturnType<typeof toBody>;

/** Under the board's key, so whatever refreshes the board refreshes this too. */
export const stakeholdersKey = (editionId: string) => [...boardKey(editionId), 'stakeholders'] as const;

/** An API that predates speakers as stakeholders sends no `speakers`: read that as none. */
const withSpeakers = <M extends StakeholderMap>(map: M): M => ({ ...map, stakeholders: map.stakeholders.map((s) => ({ ...s, speakers: s.speakers ?? [] })) });

/**
 * The event's organisations matched to the calls (`GET /editions/:id/calls-to-action/stakeholders`):
 * each one's delegates and speakers, the recommendations aimed at it and its commitments.
 */
export function useStakeholders(editionId: string) {
  return useQuery({
    queryKey: stakeholdersKey(editionId),
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve(DEMO_STAKEHOLDERS) : api.get<StakeholderMap>(`/editions/${editionId}/calls-to-action/stakeholders`, undefined, signal).then(withSpeakers),
  });
}

/** Demo only: what confirming or rejecting a link does to the sample map. */
function demoSetLink(map: StakeholderMap, id: string, status: 'confirmed' | 'rejected'): StakeholderMap {
  if (!map.links.some((l) => l.id === id)) return map;
  const links = status === 'rejected' ? map.links.filter((l) => l.id !== id) : map.links.map((l) => (l.id === id ? { ...l, status } : l));
  // redrawn from the sample map with the confirmed links laid over it, as the API redraws it
  const confirmed = links.filter((l) => l.status === 'confirmed');
  const byCall = { ...DEMO_STAKEHOLDERS.byCall };
  for (const l of confirmed) for (const c of DEMO.items.filter((c) => c.directedAt === l.target)) byCall[c.id] = [...new Set([...(byCall[c.id] ?? []), l.organisation])];
  return {
    links,
    byCall,
    stakeholders: DEMO_STAKEHOLDERS.stakeholders.map((s) => ({ ...s, asks: [...new Set([...s.asks, ...Object.keys(byCall).filter((c) => byCall[c]!.includes(s.name) && DEMO.items.find((i) => i.id === c)?.type === 'recommendation')])] })),
    unmatched: DEMO_STAKEHOLDERS.unmatched.filter((u) => !confirmed.some((l) => l.target === u.target)),
  };
}

/**
 * Broad targets tied to the event's organisations: the AI's suggestions, confirmed or rejected
 * here, or a link added by hand. Each answers with the redrawn map.
 */
export function useStakeholderLinks(editionId: string) {
  const client = useQueryClient();
  const put = (map: StakeholderMap) => client.setQueryData(stakeholdersKey(editionId), withSpeakers(map));
  const current = () => client.getQueryData<StakeholderMap>(stakeholdersKey(editionId)) ?? DEMO_STAKEHOLDERS;

  const suggest = useMutation({
    mutationFn: (): Promise<StakeholderMap & { added: number; message: string }> => {
      if (!DEMO_MODE) return api.postSlow(`/editions/${editionId}/calls-to-action/stakeholders/suggest`);
      const map = current();
      const fresh: StakeholderLink[] = map.unmatched.some((u) => u.target === 'Federal Government') && !map.links.length
        ? [{ id: 'l1', target: 'Federal Government', organisation: 'National Information Technology Development Agency (NITDA)', status: 'suggested', reason: 'Federal agency under the Ministry of Communications' }]
        : [];
      return Promise.resolve({ ...map, links: [...map.links, ...fresh], added: fresh.length, message: fresh.length ? '1 suggested link to review.' : 'Every broad target already has links or suggestions to review.' });
    },
    onSuccess: put,
  });
  const set = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'confirmed' | 'rejected' }) =>
      DEMO_MODE ? Promise.resolve(demoSetLink(current(), id, status)) : api.patch<StakeholderMap>(`/editions/${editionId}/calls-to-action/stakeholder-links/${id}`, { status }),
    onSuccess: put,
  });
  const add = useMutation({
    mutationFn: ({ target, organisation }: { target: string; organisation: string }) => {
      if (!DEMO_MODE) return api.post<StakeholderMap>(`/editions/${editionId}/calls-to-action/stakeholder-links`, { target, organisation });
      const id = `l-${Date.now()}`;
      const map = current();
      return Promise.resolve(demoSetLink({ ...map, links: [...map.links, { id, target, organisation, status: 'suggested', reason: null }] }, id, 'confirmed'));
    },
    onSuccess: put,
  });
  return { suggest, set, add };
}

export function useCallActions(editionId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: boardKey(editionId) });

  /** Reads what the session said since its last analysis; a minute or two for a long session. */
  const analyse = useMutation({
    /** `fromStart` reads the whole session again, not only what was said since the last analysis. */
    mutationFn: ({ sessionId, fromStart = false }: { sessionId: string; fromStart?: boolean }) =>
      DEMO_MODE
        ? Promise.resolve<AnalyseResult>({ added: [], read: 0, message: 'Analysis needs the server.' })
        : api.postSlow<AnalyseResult>(`/sessions/${sessionId}/analyse${fromStart ? '?fromStart=true' : ''}`),
    onSuccess: refresh,
  });
  const create = useMutation({
    mutationFn: (body: Body & { sessionId: string | null }) => api.post<CallToAction>(`/editions/${editionId}/calls-to-action`, body),
    onSuccess: refresh,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<Body> & { status?: 'suggested' | 'approved' | 'rejected' } }) => api.patch<CallToAction>(`/calls-to-action/${id}`, body),
    onSuccess: (saved) => {
      client.setQueryData<CallsToActionBoard>(boardKey(editionId), (was) => (was ? { ...was, items: was.items.map((c) => (c.id === saved.id ? saved : c)) } : was));
      // a new target, type or status moves the call between organisations
      void client.invalidateQueries({ queryKey: stakeholdersKey(editionId) });
    },
  });
  const merge = useMutation({
    mutationFn: ({ into, ids }: { into: string; ids: string[] }) => api.post<CallToAction>('/calls-to-action/merge', { into, ids }),
    onSuccess: refresh,
  });
  /** Deletes calls (and any merged into them), e.g. before analysing a session again. */
  const remove = useMutation({
    mutationFn: (ids: string[]) =>
      DEMO_MODE ? Promise.resolve({ deleted: ids.length }) : api.post<{ deleted: number }>(`/editions/${editionId}/calls-to-action/delete`, { ids }),
    onSuccess: () => {
      refresh();
      void client.invalidateQueries({ queryKey: stakeholdersKey(editionId) });
    },
  });
  return { analyse, create, update, merge, remove };
}
