/**
 * Meals: an event's meals, each with the window it is served in, and the food counters that serve
 * them. Catering staff open a counter's private link on a phone and scan delegates' ticket QRs; each
 * person on a ticket collects each meal once.
 */

export type Meal = { id: string; editionId: string; name: string; startsAt: string; endsAt: string; served: number };
export type MealCounter = { id: string; name: string; linkOn: boolean; served: number };
/** `GET /editions/:id/meals`. `people` is everyone on the event's tickets: the most plates a meal can take. */
export type MealsBoard = { meals: Meal[]; counters: MealCounter[]; people: number };

/** `GET /counter`: what a counter's link opens. */
export type CounterMeal = { id: string; name: string; startsAt: string; endsAt: string; open: boolean; served: number };
export type CounterView = { counter: { id: string; name: string }; edition: { name: string; shortName: string }; meals: CounterMeal[] };
/** `POST /counter/serve`: whose plate it was, and which of the ticket's people (seat of of). */
export type ServeResult = { holder: string; tier: string; seat: number; of: number; meal: string };

export type MealState = 'upcoming' | 'serving' | 'done';

export function mealState(meal: Pick<Meal, 'startsAt' | 'endsAt'>, now: Date): MealState {
  const t = now.getTime();
  if (t < Date.parse(meal.startsAt)) return 'upcoming';
  return t < Date.parse(meal.endsAt) ? 'serving' : 'done';
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "Tue 7 Sep · 12:00–14:00". */
export function mealWindow(meal: Pick<Meal, 'startsAt' | 'endsAt'>): string {
  const day = new Date(meal.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${day} · ${hm(meal.startsAt)}–${hm(meal.endsAt)}`;
}

/** The meal a counter serves: the one picked, if it still exists, else the one being served now. */
export function pickMeal(meals: CounterMeal[], chosen: string | null): CounterMeal | null {
  return meals.find((m) => m.id === chosen) ?? meals.find((m) => m.open) ?? null;
}

/** The Add meal form: a name, a day and a serving window in local time. */
export type MealForm = { name: string; date: string; start: string; end: string };

export function mealProblem(form: MealForm): string | null {
  if (!form.name.trim()) return 'Name the meal, such as “Lunch, Day 1”.';
  if (!form.date) return 'Choose the day.';
  if (!(form.end > form.start)) return 'Serving has to end after it starts.';
  return null;
}

/** The form as the API body: the local day and times as instants. */
export const toMealBody = (form: MealForm) => ({
  name: form.name.trim(),
  startsAt: new Date(`${form.date}T${form.start}`).toISOString(),
  endsAt: new Date(`${form.date}T${form.end}`).toISOString(),
});

/** A meal back into the form, for editing it. */
export function mealToForm(meal: Pick<Meal, 'name' | 'startsAt' | 'endsAt'>): MealForm {
  const s = new Date(meal.startsAt);
  const two = (n: number) => String(n).padStart(2, '0');
  return { name: meal.name, date: `${s.getFullYear()}-${two(s.getMonth() + 1)}-${two(s.getDate())}`, start: hm(meal.startsAt), end: hm(meal.endsAt) };
}

/** A counter key is `<counter id>.<secret>`, carried after `#` in its link so it never reaches a server log. */
const KEY = /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{16,}$/;
export const DEMO_COUNTER_KEY = 'demo';

export function counterKeyFromHash(hash: string): string | null {
  const key = decodeURIComponent(hash.replace(/^#/, '')).trim();
  return KEY.test(key) || key === DEMO_COUNTER_KEY ? key : null;
}

export const counterLink = (origin: string, key: string) => `${origin}/counter#${key}`;
