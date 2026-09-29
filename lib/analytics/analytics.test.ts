import { describe, expect, it } from 'vitest';

import {
  averageActive,
  defaultPeriod,
  featureLabel,
  groupScreens,
  peakDay,
  periodRange,
  platformShares,
  screenKey,
  screenLabel,
  summaryCsv,
  type AnalyticsSummary,
} from '@/lib/analytics/analytics';
import type { Edition } from '@/lib/events/events';

const edition = (over: Partial<Edition>): Edition => ({
  id: 'gs27',
  name: 'GS-27',
  shortName: 'GS-27',
  startsAt: '2027-09-07T08:00:00+01:00',
  endsAt: '2027-09-08T17:00:00+01:00',
  venue: null,
  city: null,
  category: 'summits',
  status: 'announced',
  registrationOpen: true,
  isCurrent: true,
  coverImage: null,
  createdAt: '2027-01-01T00:00:00Z',
  ...over,
});
const NOW = Date.parse('2027-09-20T12:00:00Z');

describe('analytics period', () => {
  it("covers an event's whole days at the venue and the day after", () => {
    // starts 00:30 at the venue, which is still the day before in UTC
    const e = edition({ startsAt: '2027-09-06T23:30:00Z', endsAt: '2027-09-08T16:00:00Z' });
    expect(periodRange({ kind: 'event', editionId: 'gs27' }, [e], NOW)).toEqual({ from: '2027-09-07T00:00:00+01:00', to: '2027-09-10T00:00:00+01:00' });
  });

  it('turns a custom range into whole venue days, and waits for both ends', () => {
    expect(periodRange({ kind: 'custom', start: '2027-09-01', end: '2027-09-03' }, [], NOW)).toEqual({ from: '2027-09-01T00:00:00+01:00', to: '2027-09-04T00:00:00+01:00' });
    expect(periodRange({ kind: 'custom', start: '2027-09-01', end: '' }, [], NOW)).toBeNull();
    expect(periodRange({ kind: 'last', days: 7 }, [], NOW)!.from).toBe('2027-09-13T12:00:00.000Z');
  });

  it('opens on the current event once it has started, else the latest one that has', () => {
    const past = edition({ id: 'gs26', isCurrent: false, startsAt: '2026-09-08T08:00:00+01:00', endsAt: '2026-09-09T17:00:00+01:00' });
    expect(defaultPeriod([edition({}), past], NOW)).toEqual({ kind: 'event', editionId: 'gs27' });
    const future = edition({ startsAt: '2028-01-01T08:00:00Z', endsAt: '2028-01-02T08:00:00Z' });
    expect(defaultPeriod([future, past], NOW)).toEqual({ kind: 'event', editionId: 'gs26' });
    expect(defaultPeriod([future], NOW)).toEqual({ kind: 'last', days: 7 });
  });
});

describe('analytics figures', () => {
  const days = [
    { day: '2027-09-06', count: 0 },
    { day: '2027-09-07', count: 410 },
    { day: '2027-09-08', count: 520 },
    { day: '2027-09-09', count: 90 },
  ];

  it('finds the busiest day and averages over the days in use', () => {
    expect(peakDay(days)).toEqual({ day: '2027-09-08', count: 520 });
    expect(peakDay([{ day: 'x', count: 0 }])).toBeNull();
    expect(averageActive(days)).toBe(340);
    expect(averageActive([])).toBe(0);
  });

  it('splits events by platform', () => {
    expect(platformShares({ ios: 25, android: 75, web: 0 }).map((p) => [p.label, p.share])).toEqual([
      ['Android', 0.75],
      ['iPhone', 0.25],
      ['Web', 0],
    ]);
    expect(platformShares({ ios: 0, android: 0, web: 0 })[0]!.share).toBe(0);
  });

  it('folds ids out of screen paths and names the screens', () => {
    expect(screenKey('/sessions/6f1c0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21?from=push')).toBe('/sessions/:id');
    expect(screenKey('/')).toBe('/');
    expect(screenLabel('/')).toBe('Home');
    expect(screenLabel('/my-pass')).toBe('My pass');
    expect(screenLabel('/sessions/:id')).toBe('Sessions › detail');
    expect(
      groupScreens([
        { path: '/sessions/6f1c0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21', views: 40 },
        { path: '/agenda', views: 70 },
        { path: '/sessions/77ab0f6e-2d1a-4a1e-9a0e-2c7f3f0f9b21', views: 35 },
      ]),
    ).toEqual([
      { key: '/sessions/:id', label: 'Sessions › detail', views: 75 },
      { key: '/agenda', label: 'Agenda', views: 70 },
    ]);
    expect(featureLabel('session_bookmark')).toBe('Session bookmark');
  });

  it('exports the page as one CSV', () => {
    const summary: AnalyticsSummary = {
      from: '',
      to: '',
      totalEvents: 12,
      activeDelegates: [{ day: '2027-09-07', count: 3 }],
      screens: [{ path: '/agenda', views: 9 }],
      features: [{ feature: 'poll_vote', uses: 2 }],
      platforms: { ios: 1, android: 2, web: 0 },
    };
    const csv = summaryCsv(summary, 'GS-27, app usage');
    expect(csv.startsWith('﻿"GS-27, app usage"\r\nRecorded app events,12')).toBe(true);
    expect(csv).toContain('2027-09-07,3');
    expect(csv).toContain('Agenda,9');
    expect(csv).toContain('Poll vote,2');
    expect(csv).toContain('iPhone,1');
  });
});
