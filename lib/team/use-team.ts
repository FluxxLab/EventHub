'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { StaffMember, StaffRole } from '@/lib/team/team';

const LIST = ['admin', 'staff'] as const;

let demoStaff: StaffMember[] = [
  { id: 'demo', name: 'Pascal Ahmadu', email: 'organiser@pic.org.ng', accessTier: 'admin', createdAt: '2026-11-02T09:00:00Z' },
  { id: 'demo-s1', name: 'Halima Bello', email: 'halima@pic.org.ng', accessTier: 'admin', createdAt: '2027-02-14T09:00:00Z' },
  { id: 'demo-s2', name: 'Emeka Nwosu', email: 'emeka@pic.org.ng', accessTier: 'session_admin', createdAt: '2027-06-01T09:00:00Z' },
  { id: 'demo-s3', name: 'Zainab Musa', email: 'zainab@pic.org.ng', accessTier: 'event_admin', managedEditionIds: ['demo-pw'], createdAt: '2027-06-20T09:00:00Z' },
];

/** Organisers and session operators. */
export function useStaff() {
  return useQuery({
    queryKey: LIST,
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoStaff) : api.get<StaffMember[]>('/delegates/admins', undefined, signal)),
  });
}

/** Add a staff account, change someone's role, or remove their access. All are audited server-side. */
export function useStaffActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: LIST });

  const add = useMutation({
    mutationFn: ({ editionIds, ...rest }: { name: string; email: string; password: string; role: StaffRole; editionIds: string[] }) => {
      // only an event organiser carries events; the API ignores them otherwise
      const body = rest.role === 'event_admin' ? { ...rest, editionIds } : rest;
      if (!DEMO_MODE) return api.post<StaffMember>('/delegates/staff', body);
      const member: StaffMember = { id: `demo-${Date.now()}`, name: rest.name, email: rest.email, accessTier: rest.role, managedEditionIds: rest.role === 'event_admin' ? editionIds : [], createdAt: new Date().toISOString() };
      demoStaff = [...demoStaff, member];
      return Promise.resolve(member);
    },
    onSuccess: refresh,
  });
  const setRole = useMutation({
    mutationFn: ({ id, role, editionIds = [] }: { id: string; role: StaffRole; editionIds?: string[] }) => {
      if (!DEMO_MODE) return api.patch(`/delegates/${id}/admin`, { admin: true, role, ...(role === 'event_admin' ? { editionIds } : {}) });
      demoStaff = demoStaff.map((m) => (m.id === id ? { ...m, accessTier: role, managedEditionIds: role === 'event_admin' ? editionIds : [] } : m));
      return Promise.resolve();
    },
    onSuccess: refresh,
  });
  // Removing access makes them an ordinary (standard) delegate again; their account stays.
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!DEMO_MODE) return api.patch(`/delegates/${id}/admin`, { admin: false });
      demoStaff = demoStaff.filter((m) => m.id !== id);
      return Promise.resolve();
    },
    onSuccess: refresh,
  });
  return { add, setRole, remove };
}
