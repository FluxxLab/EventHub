'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { RegistrationEntry, toEntryBody } from '@/lib/registration/registration';

const LIST = ['admin', 'registration-list'] as const;
type EntryBody = ReturnType<typeof toEntryBody>;

const code = () => Math.random().toString(16).slice(2, 10).toUpperCase();
let demoEntries: RegistrationEntry[] = [
  { id: 'r1', email: 'kwame@afdb.org', inviteCode: 'A3F09C21', name: 'Kwame Mensah', organisation: 'AfDB', title: 'Economist', assignedTier: 'vvip', claimedAt: '2027-08-03T09:12:00Z', claimedByDelegateId: 'demo-d3', createdAt: '2027-07-20T09:00:00Z' },
  { id: 'r2', email: 'sarah@unwomen.org', inviteCode: '7B21E0D4', name: 'Sarah Kimani', organisation: 'UN Women', title: null, assignedTier: 'press', claimedAt: null, claimedByDelegateId: null, createdAt: '2027-07-22T09:00:00Z' },
  { id: 'r3', email: null, inviteCode: 'MINISTER1', name: 'Hon. Minister (guest)', organisation: 'Federal Ministry of Women Affairs', title: null, assignedTier: 'vvip', claimedAt: null, claimedByDelegateId: null, createdAt: '2027-07-25T09:00:00Z' },
  { id: 'r4', email: 'amina@pic.org.ng', inviteCode: 'C0FFEE12', name: 'Amina Yusuf', organisation: 'Policy Innovation Centre', title: 'Director', assignedTier: 'vip', claimedAt: '2027-08-01T10:00:00Z', claimedByDelegateId: 'demo-d0', createdAt: '2027-07-18T09:00:00Z' },
];

export function useRegistrationList() {
  return useQuery({
    queryKey: LIST,
    queryFn: ({ signal }) =>
      DEMO_MODE ? Promise.resolve(demoEntries) : api.get<RegistrationEntry[]>('/delegates/registration-list', undefined, signal),
  });
}

/** Create, edit and delete entries; each refreshes the list (the API audits every change). */
export function useRegistrationActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: LIST });

  const createOne = (body: EntryBody): Promise<RegistrationEntry> => {
    if (!DEMO_MODE) return api.post<RegistrationEntry>('/delegates/registration-list', body);
    const created: RegistrationEntry = {
      id: `demo-${Date.now()}-${Math.random()}`,
      email: body.email ?? null,
      inviteCode: body.inviteCode ?? code(),
      name: body.name ?? null,
      organisation: body.organisation || null,
      title: body.title || null,
      assignedTier: body.assignedTier,
      claimedAt: null,
      claimedByDelegateId: null,
      createdAt: new Date().toISOString(),
    };
    demoEntries = [created, ...demoEntries];
    return Promise.resolve(created);
  };

  const create = useMutation({ mutationFn: createOne, onSuccess: refresh });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: EntryBody }) => {
      if (!DEMO_MODE) return api.patch<RegistrationEntry>(`/delegates/registration-list/${id}`, body);
      demoEntries = demoEntries.map((e) => (e.id === id ? { ...e, ...body, organisation: body.organisation || null, title: body.title || null } : e));
      return Promise.resolve(demoEntries.find((e) => e.id === id)!);
    },
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!DEMO_MODE) return api.delete<void>(`/delegates/registration-list/${id}`);
      demoEntries = demoEntries.filter((e) => e.id !== id);
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  /**
   * Adds many entries one after another (the API has no bulk route), reporting progress, and
   * returns which rows failed and why. One refresh at the end.
   */
  const importMany = useMutation({
    mutationFn: async ({ rows, onProgress }: { rows: { line: number; body: EntryBody }[]; onProgress: (done: number) => void }) => {
      const failed: { line: number; reason: string }[] = [];
      for (const [i, row] of rows.entries()) {
        try {
          await createOne(row.body);
        } catch (error) {
          failed.push({ line: row.line, reason: error instanceof Error ? error.message : 'Could not be added.' });
        }
        onProgress(i + 1);
      }
      return { added: rows.length - failed.length, failed };
    },
    onSettled: refresh,
  });

  return { create, update, remove, importMany };
}
