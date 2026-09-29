import { describe, expect, it } from 'vitest';

import { hourSeries, ordinal, peakHour, rankOf, reportDays, standReportHtml, totals, type LeadsReport } from '@/lib/leads/report';

const report: LeadsReport = {
  editionId: 'e1',
  ticketHolders: 2000,
  delegatesScanned: 150,
  stands: [
    {
      boothId: 'b1',
      name: 'Kora <Health>',
      location: 'Hall B',
      isActive: true,
      stamps: 140,
      leads: 40,
      hot: 10,
      warm: 20,
      cold: 5,
      withNotes: 12,
      byHour: [
        { day: '2027-09-07', hour: 10, leads: 15 },
        { day: '2027-09-07', hour: 13, leads: 25 },
      ],
    },
    { boothId: 'b2', name: 'UN Women', location: null, isActive: true, stamps: 90, leads: 40, hot: 0, warm: 0, cold: 0, withNotes: 0, byHour: [{ day: '2027-09-08', hour: 18, leads: 40 }] },
    { boothId: 'b3', name: 'Quiet', location: null, isActive: true, stamps: 2, leads: 0, hot: 0, warm: 0, cold: 0, withNotes: 0, byHour: [] },
  ],
};

describe('exhibition report', () => {
  it('lists the days, and each day from 9 to 17 or wider', () => {
    expect(reportDays(report)).toEqual(['2027-09-07', '2027-09-08']);
    const day = hourSeries(report.stands[0]!.byHour, '2027-09-07');
    expect(day[0]).toEqual({ hour: 9, leads: 0 });
    expect(day.at(-1)).toEqual({ hour: 17, leads: 0 });
    expect(day.find((h) => h.hour === 13)).toEqual({ hour: 13, leads: 25 });
    expect(hourSeries(report.stands[1]!.byHour, '2027-09-08').at(-1)).toEqual({ hour: 18, leads: 40 });
  });

  it('names the busiest hour, with the day when there are several', () => {
    expect(peakHour(report.stands[0]!.byHour, false)).toBe('13:00–14:00');
    expect(peakHour(report.stands[1]!.byHour, true)).toMatch(/^18:00–19:00 on Wed 8 Sept$/);
    expect(peakHour([], false)).toBeNull();
  });

  it('ranks by leads, ties sharing a place', () => {
    expect(rankOf(report, 'b2')).toEqual({ place: 1, of: 3 });
    expect(rankOf(report, 'b1')).toEqual({ place: 1, of: 3 });
    expect(rankOf(report, 'b3')).toEqual({ place: 3, of: 3 });
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '101st']);
    expect(totals(report)).toMatchObject({ stands: 3, leads: 80, stamps: 232, hot: 10 });
  });

  it('writes a sponsor report with counts only, escaped', () => {
    const html = standReportHtml(report, 'b1', { name: 'GS-27 Summit', logo: 'https://c/pic-logo.png' });
    expect(html).toContain('<h1>Kora &lt;Health&gt;</h1>');
    expect(html).toContain('2% of all delegates');
    expect(html).toContain('1st');
    expect(html).toContain('Hot 10');
    expect(html).toContain('13:00–14:00');
    // no email addresses: the report is counts only
    expect(html).not.toMatch(/[\w.-]+@[\w-]+\.[a-z]{2,}/i);
    expect(standReportHtml(report, 'b3', { name: 'GS-27', logo: 'x' })).toContain('No badges were scanned at this stand.');
  });
});
