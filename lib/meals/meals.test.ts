import { describe, expect, it } from 'vitest';

import { counterKeyFromHash, counterLink, mealProblem, mealState, mealToForm, pickMeal, toMealBody, type CounterMeal } from '@/lib/meals/meals';

const meal = (id: string, open: boolean): CounterMeal => ({ id, name: id, startsAt: '', endsAt: '', open, served: 0 });

describe('meals', () => {
  it('knows whether a meal is being served', () => {
    const m = { startsAt: new Date(2027, 8, 7, 12, 0).toISOString(), endsAt: new Date(2027, 8, 7, 14, 0).toISOString() };
    expect(mealState(m, new Date(2027, 8, 7, 11, 59))).toBe('upcoming');
    expect(mealState(m, new Date(2027, 8, 7, 13, 0))).toBe('serving');
    expect(mealState(m, new Date(2027, 8, 7, 14, 0))).toBe('done');
  });

  it('serves the meal the counter picked, else the one on now', () => {
    const meals = [meal('breakfast', false), meal('lunch', true)];
    expect(pickMeal(meals, null)?.id).toBe('lunch');
    expect(pickMeal(meals, 'breakfast')?.id).toBe('breakfast');
    expect(pickMeal(meals, 'gone')?.id).toBe('lunch');
    expect(pickMeal([meal('dinner', false)], null)).toBeNull();
  });

  it('checks the Add meal form and turns it into the API body and back', () => {
    const form = { name: ' Lunch, Day 1 ', date: '2027-09-07', start: '12:00', end: '14:00' };
    expect(mealProblem(form)).toBeNull();
    expect(mealProblem({ ...form, end: '11:00' })).toMatch(/end after/);
    expect(mealProblem({ ...form, name: ' ' })).toMatch(/Name the meal/);
    const body = toMealBody(form);
    expect(body.name).toBe('Lunch, Day 1');
    expect(mealToForm(body)).toEqual({ name: 'Lunch, Day 1', date: '2027-09-07', start: '12:00', end: '14:00' });
  });

  it('reads a counter key from its link, and only a well-formed one', () => {
    const key = '11111111-1111-4111-8111-111111111111.abcdefghijklmnopqrstuvwx';
    expect(counterKeyFromHash(`#${key}`)).toBe(key);
    expect(counterKeyFromHash('#nonsense')).toBeNull();
    expect(counterLink('https://events.pic.org.ng', key)).toBe(`https://events.pic.org.ng/counter#${key}`);
  });
});
