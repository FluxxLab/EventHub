'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, ApiError } from '@/lib/api/client';
import { DEMO_MODE } from '@/lib/demo';
import type { CounterView, Meal, MealCounter, MealsBoard, ServeResult } from '@/lib/meals/meals';

const key = (editionId: string) => ['admin', 'meals', editionId] as const;

/* ------------------------------------------------------------------ demo data */

const today = (h: number, m = 0) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
let demoBoard: MealsBoard = {
  meals: [
    { id: 'm1', editionId: 'demo-gs27', name: 'Breakfast, Day 1', startsAt: today(7, 30), endsAt: today(9), served: 212 },
    { id: 'm2', editionId: 'demo-gs27', name: 'Lunch, Day 1', startsAt: today(12), endsAt: today(14), served: 486 },
    { id: 'm3', editionId: 'demo-gs27', name: 'Dinner, Day 1', startsAt: today(18, 30), endsAt: today(21), served: 0 },
  ],
  counters: [
    { id: 'c1', name: 'Main Hall counter', linkOn: true, served: 431 },
    { id: 'c2', name: 'Garden terrace', linkOn: true, served: 267 },
  ],
  people: 1200,
};
const demoServed = new Map<string, number>();

/* ------------------------------------------------------------------ organisers */

/** The event's meals with plates served, its counters, and how many people hold tickets. */
export function useMeals(editionId: string) {
  return useQuery({
    queryKey: key(editionId),
    queryFn: ({ signal }) => (DEMO_MODE ? Promise.resolve(demoBoard) : api.get<MealsBoard>(`/editions/${editionId}/meals`, undefined, signal)),
    // plates go out all through a meal
    refetchInterval: 20_000,
  });
}

export function useMealActions(editionId: string) {
  const client = useQueryClient();
  const refresh = () => void client.invalidateQueries({ queryKey: key(editionId) });

  const save = useMutation({
    mutationFn: ({ id, body }: { id?: string; body: { name: string; startsAt: string; endsAt: string } }) => {
      if (DEMO_MODE) {
        const meal: Meal = { id: id ?? `m-${Date.now()}`, editionId, served: demoBoard.meals.find((m) => m.id === id)?.served ?? 0, ...body };
        demoBoard = { ...demoBoard, meals: [...demoBoard.meals.filter((m) => m.id !== id), meal].sort((a, b) => a.startsAt.localeCompare(b.startsAt)) };
        return Promise.resolve(meal);
      }
      return id ? api.patch<Meal>(`/meals/${id}`, body) : api.post<Meal>('/meals', { editionId, ...body });
    },
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!DEMO_MODE) return api.delete<void>(`/meals/${id}`);
      const meal = demoBoard.meals.find((m) => m.id === id);
      if (meal?.served) return Promise.reject(new ApiError(409, `${meal.served} people have already collected "${meal.name}", so it stays as the record. Change its times instead.`));
      demoBoard = { ...demoBoard, meals: demoBoard.meals.filter((m) => m.id !== id) };
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  /** Adds a counter; resolves with its link key, which is shown once. */
  const addCounter = useMutation({
    mutationFn: async (name: string): Promise<{ counter: MealCounter; key: string }> => {
      if (!DEMO_MODE) return api.post<{ counter: MealCounter; key: string }>('/meal-counters', { editionId, name });
      const counter = { id: `c-${Date.now()}`, name, linkOn: true, served: 0 };
      demoBoard = { ...demoBoard, counters: [...demoBoard.counters, counter] };
      return { counter, key: 'demo' };
    },
    onSuccess: refresh,
  });

  /** A new link for a counter; the old one stops working. */
  const newLink = useMutation({
    mutationFn: (id: string) => (DEMO_MODE ? Promise.resolve({ key: 'demo' }) : api.post<{ key: string }>(`/meal-counters/${id}/link`)),
    onSuccess: refresh,
  });

  const unlink = useMutation({
    mutationFn: (id: string) => {
      if (!DEMO_MODE) return api.delete<void>(`/meal-counters/${id}/link`);
      demoBoard = { ...demoBoard, counters: demoBoard.counters.map((c) => (c.id === id ? { ...c, linkOn: false } : c)) };
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  const removeCounter = useMutation({
    mutationFn: (id: string) => {
      if (!DEMO_MODE) return api.delete<void>(`/meal-counters/${id}`);
      demoBoard = { ...demoBoard, counters: demoBoard.counters.filter((c) => c.id !== id) };
      return Promise.resolve();
    },
    onSuccess: refresh,
  });

  return { save, remove, addCounter, newLink, unlink, removeCounter };
}

/* ------------------------------------------------------------------ the counter's scanner */

/** What a counter's link opens: the counter, its event and meals. Refreshed so the served counts move. */
export function useCounter(counterKey: string) {
  return useQuery({
    queryKey: ['counter', counterKey] as const,
    queryFn: () =>
      DEMO_MODE
        ? Promise.resolve<CounterView>({
            counter: { id: 'c1', name: 'Main Hall counter' },
            edition: { name: 'GS-27 Gender and Inclusion Summit', shortName: 'GS-27' },
            meals: demoBoard.meals.map((m) => ({ id: m.id, name: m.name, startsAt: m.startsAt, endsAt: m.endsAt, open: Date.parse(m.startsAt) <= Date.now() && Date.now() < Date.parse(m.endsAt), served: m.served + (demoServed.get(m.id) ?? 0) })),
          })
        : api.counter<CounterView>(counterKey, '/counter'),
    refetchInterval: 30_000,
    retry: (count, error) => !(error instanceof ApiError && error.status === 401) && count < 2,
  });
}

/** Serves one plate on a scanned QR or a typed ticket code. A second collection comes back as a 409 with who and when. */
export function useServe(counterKey: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ mealId, qr, code }: { mealId: string; qr?: string; code?: string }): Promise<ServeResult> => {
      if (!DEMO_MODE) return api.counter<ServeResult>(counterKey, '/counter/serve', 'POST', { mealId, ...(qr ? { qr } : { code }) });
      const id = qr ?? code ?? '';
      const tag = `${mealId}:${id}`;
      if (demoServed.has(tag)) return Promise.reject(new ApiError(409, 'Hauwa Bello already collected this meal a few minutes ago (Main Hall counter).'));
      demoServed.set(tag, 1);
      demoServed.set(mealId, (demoServed.get(mealId) ?? 0) + 1);
      return Promise.resolve({ holder: 'Hauwa Bello', tier: 'Delegate', seat: 1, of: 1, meal: demoBoard.meals.find((m) => m.id === mealId)?.name ?? 'Meal' });
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ['counter', counterKey] }),
  });
}
