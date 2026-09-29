import { describe, expect, it } from 'vitest';

import { activeValues, moveOption, newTopicProblem, pickable, sessionTrackOptions, toggleValue, topicsSummary, trackLabel, usageCounts, type TrackOption } from '@/lib/catalog/topics';

const track = (value: string, label: string, sortOrder: number, isActive = true): TrackOption => ({ id: value, value, label, hint: '', sortOrder, isActive });
const LIBRARY = [track('health', 'Health & Nutrition', 3), track('digital', 'Inclusive Digital Transformation', 0), track('youth', 'Youth', 5, false)];

describe('tracks and interests', () => {
  it('offers active options in library order, and retired ones only where the event still has them', () => {
    expect(pickable(LIBRARY, []).map((t) => t.value)).toEqual(['digital', 'health']);
    expect(pickable(LIBRARY, ['youth']).map((t) => t.value)).toEqual(['digital', 'health', 'youth']);
    expect(activeValues(LIBRARY)).toEqual(['digital', 'health']);
  });

  it('toggles a value on and off', () => {
    expect(toggleValue(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleValue(['a', 'b'], 'a')).toEqual(['b']);
  });

  it("gives a session the event's tracks, then General Programme", () => {
    expect(sessionTrackOptions(LIBRARY, ['health', 'youth'])).toEqual([
      { value: 'health', label: 'Health & Nutrition' },
      { value: 'youth', label: 'Youth' },
      { value: 'general', label: 'General Programme' },
    ]);
    // an event saved before tracks were per event: every active one
    expect(sessionTrackOptions(LIBRARY, undefined).map((o) => o.value)).toEqual(['digital', 'health', 'general']);
  });

  it('labels a track, falling back to its value', () => {
    expect(trackLabel('general', LIBRARY)).toBe('General Programme');
    expect(trackLabel('health', LIBRARY)).toBe('Health & Nutrition');
    expect(trackLabel('gone', LIBRARY)).toBe('gone');
  });

  it('says why a new one cannot be added', () => {
    expect(newTopicProblem('  ', LIBRARY, 'track')).toBe("Type the track's name.");
    expect(newTopicProblem('health & nutrition', LIBRARY, 'track')).toContain('already in the list');
    expect(newTopicProblem('youth', LIBRARY, 'track')).toContain('retired');
    expect(newTopicProblem('General programme', LIBRARY, 'track')).toContain('Every event already has');
    expect(newTopicProblem('Climate', LIBRARY, 'track')).toBeNull();
    expect(topicsSummary(1, 12)).toBe('1 track · 12 interests');
  });
});

describe('ordering and usage', () => {
  it('swaps an option with its neighbour, renumbering where orders were equal', () => {
    const list = [track('a', 'A', 0), track('b', 'B', 1), track('c', 'C', 2)];
    expect(moveOption(list, 'b', -1)).toEqual([
      { id: 'b', sortOrder: 0 },
      { id: 'a', sortOrder: 1 },
    ]);
    expect(moveOption(list, 'a', -1)).toEqual([]);
    expect(moveOption(list, 'c', 1)).toEqual([]);
    // three options all at 0 (as the API creates interests without an order)
    const flat = [track('x', 'X', 0), track('y', 'Y', 0), track('z', 'Z', 0)];
    expect(moveOption(flat, 'z', -1)).toEqual([
      { id: 'z', sortOrder: 1 },
      { id: 'y', sortOrder: 2 },
    ]);
    expect(
      usageCounts(
        [
          { trackValues: ['a', 'b'], interestValues: ['Policy'] },
          { trackValues: ['a'] },
        ],
        'track',
      ),
    ).toEqual(
      new Map([
        ['a', 2],
        ['b', 1],
      ]),
    );
  });
});
