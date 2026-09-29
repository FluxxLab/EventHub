import { describe, expect, it } from 'vitest';

import { buildRows, chunk, guessMapping, matchTier, parseTable, reportCsv, sheetHasRows, tableFromSheet, tierValues, toIssueRow } from '@/lib/delegates/import';

const TIERS = [
  { id: 'std', name: 'Standard' },
  { id: 'vip', name: 'VIP' },
  { id: 'stu', name: 'Student' },
];

describe('attendee import', () => {
  it('reads CSV with quotes, a byte-order mark and Windows line ends', () => {
    const t = parseTable('﻿Name,Email,Company\r\n"Eze, Ngozi",ngozi@x.org,"Women ""in"" Policy"\r\n\r\nKwame,kwame@x.org,\n');
    expect(t.headers).toEqual(['Name', 'Email', 'Company']);
    expect(t.rows).toEqual([
      ['Eze, Ngozi', 'ngozi@x.org', 'Women "in" Policy'],
      ['Kwame', 'kwame@x.org', ''],
    ]);
  });

  it('reads cells pasted from Excel (tabs) and semicolon CSV', () => {
    expect(parseTable('Name\tEmail\nAda\tada@x.org').rows).toEqual([['Ada', 'ada@x.org']]);
    expect(parseTable('Name;Email\nAda;ada@x.org').rows).toEqual([['Ada', 'ada@x.org']]);
  });

  it('reads an Excel sheet: dates, long numbers, blanks and a title row', () => {
    const t = tableFromSheet([
      ['GS-27 attendee list', null, null],
      ['Name', 'Email', 'Phone', 'Registered'],
      ['Ngozi Eze', 'ngozi@x.org', 2348012345678, new Date('2027-08-01T00:00:00Z')],
      [null, null, null, null],
      ['Kwame', 'kwame@x.org', null, true],
    ]);
    expect(t.headers).toEqual(['Name', 'Email', 'Phone', 'Registered']);
    expect(t.rows).toEqual([
      ['Ngozi Eze', 'ngozi@x.org', '2348012345678', '2027-08-01'],
      ['Kwame', 'kwame@x.org', '', 'Yes'],
    ]);
    expect(sheetHasRows([['Name', 'Email']])).toBe(false);
    expect(sheetHasRows([])).toBe(false);
  });

  it('guesses columns from the usual export headings', () => {
    const m = guessMapping(['First Name', 'Last Name', 'Email Address', 'Company', 'Job Title', 'Ticket Type', 'Order date']);
    expect(m).toMatchObject({ name: -1, firstName: 0, lastName: 1, email: 2, organisation: 3, title: 4, tier: 5, country: -1 });
    expect(guessMapping(['Attendee name', 'E-mail', 'Organization'])).toMatchObject({ name: 0, email: 1, organisation: 2 });
  });

  it('matches tier values by name, loosely', () => {
    expect(matchTier('vip', TIERS)).toBe('vip');
    expect(matchTier('VIP Pass', TIERS)).toBe('vip');
    expect(matchTier(' student ', TIERS)).toBe('stu');
    expect(matchTier('Gold', TIERS)).toBeNull();
    expect(matchTier('', TIERS)).toBeNull();
  });

  it('checks every row and names what is wrong', () => {
    const t = parseTable(['First,Last,Email,Ticket', 'Ngozi,Eze,Ngozi@X.org,VIP', ',,,VIP', 'Kwame,,kwame@x,VIP', 'Ada,,NGOZI@x.org,VIP', 'Tunde,,tunde@x.org,Gold'].join('\n'));
    const m = guessMapping(t.headers);
    expect(tierValues(t, m)).toEqual([
      { value: 'VIP', rows: 4 },
      { value: 'Gold', rows: 1 },
    ]);
    const rows = buildRows(t, m, { VIP: 'vip' }, 'std');
    expect(rows.map((r) => r.problem)).toEqual([null, 'no_name', 'bad_email', 'duplicate', 'no_tier']);
    expect(rows[0]).toMatchObject({ line: 2, name: 'Ngozi Eze', email: 'ngozi@x.org', ticketTypeId: 'vip' });
  });

  it('gives every row the default tier when the file has no tier column', () => {
    const t = parseTable('Name,Email\nAda,ada@x.org');
    expect(buildRows(t, guessMapping(t.headers), {}, 'std')[0]!.ticketTypeId).toBe('std');
    expect(buildRows(t, guessMapping(t.headers), {}, null)[0]!.problem).toBe('no_tier');
  });

  it('sends only filled details, within the lengths the API takes', () => {
    const t = parseTable(`Name,Email,Job title\nAda,ada@x.org,${'x'.repeat(150)}`);
    const [row] = buildRows(t, guessMapping(t.headers), {}, 'std');
    const body = toIssueRow(row!);
    expect(body).toEqual({ name: 'Ada', email: 'ada@x.org', ticketTypeId: 'std', title: 'x'.repeat(100) });
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('reports what happened to each row', () => {
    const t = parseTable('Name,Email\nAda,ada@x.org\nKwame,kwame@x.org\nNo Email,\nTunde,tunde@x.org');
    const rows = buildRows(t, guessMapping(t.headers), {}, 'std');
    const csv = reportCsv(rows, { issued: [{ email: 'ada@x.org', name: 'Ada', code: 'PIC-GEN-1A2B', ticketId: 't1', created: true }], skipped: [{ email: 'kwame@x.org', reason: 'has_ticket' }] }, 1);
    expect(csv.split('\n')).toEqual([
      'Line,Name,Email,Result,Ticket code',
      '2,Ada,ada@x.org,Ticket issued (new account),PIC-GEN-1A2B',
      '3,Kwame,kwame@x.org,Already had a ticket,',
      '4,No Email,,Not imported: No email,',
      '5,Tunde,tunde@x.org,Not imported: the import stopped,',
    ]);
  });
});
