import { describe, expect, it } from 'vitest';

import {
  buildRows,
  findTable,
  gridFromSheet,
  gridFromText,
  guessMapping,
  parseSpeakers,
  parseTimeRange,
  planSpeakers,
  readDate,
  readDayNumber,
  reportCsv,
  sessionTypeOf,
  speakerKey,
  splitTitle,
  templateCsv,
  toSessionBody,
  type BuildContext,
} from '@/lib/programme/import';
import type { Session } from '@/lib/programme/programme';

const EDITION_START = '2026-10-21T08:00:00+01:00';
const CTX: BuildContext = {
  editionStartsAt: EDITION_START,
  tracks: [
    { value: 'governance', label: 'Governance & Ethics' },
    { value: 'general', label: 'General Programme' },
  ],
  fallbackDay: 1,
  fallbackRoom: '',
  existing: [],
};

/** The Build 2026 agenda's columns, as it reads once pasted into Excel. */
const AGENDA = [
  ['Draft Agenda V10'],
  ['Day One — Wednesday, October 21, 2026'],
  ['TIME', 'SESSION / TITLE', 'RESPONSIBLE PARTY', 'VENUE'],
  ['MORNING — REGISTRATION & PRE-OPENING BREAKOUTS', '', '', ''],
  ['8:00 – 9:00 am', 'Participants Registration & Tag Pickup', 'Nigeria AI Collective', 'Pre-Function Area'],
  ['10`:00 – 10:05 am', 'The National Anthem', 'Media Team', 'Main Hall'],
  ['10:50 – 11:10 am', 'Keynote Speech\nAfrica in the Global AI Order: Towards Equitable Ownership and Shared Prosperity', 'Melanie Hui\nChief Executive Officer, Luminate', 'Main Hall'],
  [
    '11:10 – 11:30 am',
    'High-Level Fireside Chat\nPositioning Africa in the Global AI Order: Capital, Talent, and Trust',
    'John Palfrey,\nPresident, MacArthur Foundation\n\nModerator:  Professor Olayinka David-West\nDean at Lagos Business School, Pan-Atlantic University',
    'Main Hall',
  ],
  ['TIME', 'SESSION / TITLE', 'RESPONSIBLE PARTY', 'VENUE'],
  ['11:55 - 12:15 pm', 'Lecture\nDefining the Compute Ecosystem in Africa', 'Prof. Bamidele Adebisi\nProfessor of Intelligent Infrastructure Systems, Manchester Metropolitan University, United Kingdom', 'Main Hall'],
  ['', 'Design Workshop\nTech Justice & Algorithmic Accountability', 'Chioma Agwuegbo,\nExecutive Director, TechHer', 'Acacia A&B'],
  ['', '', 'Joshua Olufemi\nFounder, Dataphyte Foundation', ''],
  ['1:00 – 1:30 pm', 'Tea break/Networking/Exhibition and Research Presentation Tour', '', ''],
  ['4:00 pm', 'Lunch/Networking', '', ''],
  ['2:30 – 3:30', 'Workshop\nTech Justice in Practice', 'Lead Facilitator: Prof. Demola Lewis\nProfessor of Linguistics, University of Ibadan', 'Acacia A and B'],
  ['Day Two — Thursday, October 22nd, 2026', '', '', ''],
  ['9:40 – 10:20 am', 'Panel\nBuilding Africa’s AI Human Capital', 'Dr. Olubayo Adekanmbi\nFounder of Data Science Nigeria (DSN)', 'Main Hall'],
];

describe('programme import: reading the sheet', () => {
  it('finds the heading row under a title and a day heading, and drops headings repeated per page', () => {
    const t = findTable(AGENDA);
    expect(t.headers).toEqual(['TIME', 'SESSION / TITLE', 'RESPONSIBLE PARTY', 'VENUE']);
    expect(t.preamble).toEqual(['Draft Agenda V10', 'Day One — Wednesday, October 21, 2026']);
    expect(t.rows.some((r) => r[0] === 'TIME')).toBe(false);
  });

  it('guesses agenda and hand-made headings', () => {
    const m = guessMapping(['TIME', 'SESSION / TITLE', 'RESPONSIBLE PARTY', 'VENUE']);
    expect(m).toMatchObject({ time: 0, title: 1, speakers: 2, room: 3, start: -1, day: -1 });
    const own = guessMapping(['Day', 'Start time', 'End time', 'Title', 'Type', 'Track', 'Room', 'Speakers', 'Moderator', 'Description']);
    expect(own).toMatchObject({ day: 0, start: 1, end: 2, title: 3, type: 4, track: 5, room: 6, speakers: 7, moderators: 8, description: 9, time: -1 });
  });

  it('reads Excel time and date cells, keeping line breaks inside a cell', () => {
    const grid = gridFromSheet([[new Date('1899-12-30T09:30:00Z'), 0.5625, new Date('2026-10-21T00:00:00Z'), 'Ada\nFounder, X', 3]]);
    expect(grid).toEqual([['09:30', '13:30', '2026-10-21', 'Ada\nFounder, X', '3']]);
  });

  it('reads pasted cells under a heading line that has no tabs', () => {
    expect(gridFromText('Day One — Wednesday\nTime\tTitle\n9:00\tOpening')).toEqual([['Day One — Wednesday'], ['Time', 'Title'], ['9:00', 'Opening']]);
  });

  it('reads pasted cells with quoted line breaks', () => {
    expect(gridFromText('Time\tTitle\n9:00\t"Panel\nThe title"')).toEqual([
      ['Time', 'Title'],
      ['9:00', 'Panel\nThe title'],
    ]);
  });
});

describe('programme import: days and times', () => {
  it('reads days written as numbers, words and headings', () => {
    expect(readDayNumber('2')).toBe(2);
    expect(readDayNumber('Day 1')).toBe(1);
    expect(readDayNumber('Day Two — Thursday')).toBe(2);
    expect(readDayNumber('MID-MORNING — OPENING CEREMONY (DAY 1 PLENARY)')).toBe(1);
    expect(readDayNumber('AFTERNOON SESSION')).toBeNull();
  });

  it('reads dates written the usual ways', () => {
    expect(readDate('Wednesday, October 21, 2026', 2026)).toBe('2026-10-21');
    expect(readDate('Thursday, October 22nd, 2026', 2026)).toBe('2026-10-22');
    expect(readDate('22/10/2026', 2026)).toBe('2026-10-22');
    expect(readDate('21 Oct', 2026)).toBe('2026-10-21');
    expect(readDate('2026-10-21', 2000)).toBe('2026-10-21');
    expect(readDate('MORNING — REGISTRATION', 2026)).toBeNull();
  });

  it('reads time ranges as agendas write them', () => {
    expect(parseTimeRange('8:00 – 9:00 am')).toEqual({ start: '08:00', end: '09:00' });
    expect(parseTimeRange('9:20am – 10:00am')).toEqual({ start: '09:20', end: '10:00' });
    expect(parseTimeRange('10`:00 – 10:05 am')).toEqual({ start: '10:00', end: '10:05' });
    expect(parseTimeRange('11:55 - 12:15 pm')).toEqual({ start: '11:55', end: '12:15' });
    expect(parseTimeRange('1: 30 – 2:20 pm')).toEqual({ start: '13:30', end: '14:20' });
    expect(parseTimeRange('2:30 – 3:30')).toEqual({ start: '14:30', end: '15:30' });
    expect(parseTimeRange('13:30 to 14:15')).toEqual({ start: '13:30', end: '14:15' });
    expect(parseTimeRange('9:00:00 AM - 10:30:00 AM')).toEqual({ start: '09:00', end: '10:30' });
    expect(parseTimeRange('09:00 - 10:30')).toEqual({ start: '09:00', end: '10:30' });
    expect(parseTimeRange('4:00 pm')).toEqual({ start: '16:00', end: null });
    expect(parseTimeRange('9:00 and later')).toEqual({ start: '09:00', end: null });
    expect(parseTimeRange('TBC')).toBeNull();
  });
});

describe('programme import: titles and types', () => {
  it('takes the type from a short first line of the title cell', () => {
    expect(splitTitle('Keynote Speech\nAfrica in the Global AI Order')).toEqual({ title: 'Africa in the Global AI Order', type: 'keynote' });
    expect(splitTitle('High-Level Fireside Chat\nPositioning Africa')).toEqual({ title: 'Positioning Africa', type: 'fireside' });
    expect(splitTitle('AI Ethics & Governance Fellowship Showcase\nA Continental View')).toEqual({ title: 'AI Ethics & Governance Fellowship Showcase: A Continental View', type: null });
    expect(splitTitle('Lecture\nDefining the Compute Ecosystem')).toEqual({ title: 'Lecture: Defining the Compute Ecosystem', type: null });
    expect(splitTitle('Policy Roundtable Who Controls Africa’s AI Future')).toEqual({ title: 'Policy Roundtable Who Controls Africa’s AI Future', type: 'roundtable' });
  });

  it('places the agenda words the API places, and a few more', () => {
    expect(sessionTypeOf('Tea break/Networking')).toBe('networking');
    expect(sessionTypeOf('The National Anthem')).toBe('ceremony');
    expect(sessionTypeOf('Innovation Master Class')).toBe('workshop');
    expect(sessionTypeOf('Research Presentation')).toBeNull();
  });
});

describe('programme import: speakers', () => {
  it('reads Name | Role | Organisation, one per line or by semicolons', () => {
    expect(parseSpeakers('Ada Okafor | Director | PIC; Tunde Bello | Dean')).toEqual([
      { name: 'Ada Okafor', role: 'Director', organisation: 'PIC' },
      { name: 'Tunde Bello', role: 'Dean', organisation: '' },
    ]);
  });

  it('reads the agenda layout: name, title under it, blank line between people, labels dropped', () => {
    expect(parseSpeakers('John Palfrey,\nPresident, MacArthur Foundation\n\nModerator:  Professor Olayinka David-West\nDean at Lagos Business School, Pan-Atlantic University')).toEqual([
      { name: 'John Palfrey', role: 'President', organisation: 'MacArthur Foundation' },
      { name: 'Professor Olayinka David-West', role: 'Dean at Lagos Business School', organisation: 'Pan-Atlantic University' },
    ]);
  });

  it('tells names from titles when there are no blank lines', () => {
    expect(parseSpeakers('Chioma Agwuegbo,\nExecutive Director, TechHer')).toEqual([{ name: 'Chioma Agwuegbo', role: 'Executive Director', organisation: 'TechHer' }]);
    expect(parseSpeakers('Melanie Hui\nChief Executive Officer, Luminate')).toEqual([{ name: 'Melanie Hui', role: 'Chief Executive Officer', organisation: 'Luminate' }]);
    expect(parseSpeakers('Ada Okafor\nTunde Bello')).toEqual([
      { name: 'Ada Okafor', role: '', organisation: '' },
      { name: 'Tunde Bello', role: '', organisation: '' },
    ]);
    expect(parseSpeakers('Judges;\nProf. Bamidele Adebisi')).toEqual([{ name: 'Prof. Bamidele Adebisi', role: '', organisation: '' }]);
    expect(parseSpeakers('Dr. Kunle Kakanfo (Nigeria)')[0]!.name).toBe('Dr. Kunle Kakanfo');
  });

  it('matches names ignoring titles, accents, hyphens and case', () => {
    expect(speakerKey('Dr. Olubayo Adekanmbi')).toBe(speakerKey('olubayo adekanmbi'));
    expect(speakerKey('Professor Olayinka David-West')).toBe(speakerKey('Prof. Olayinka DavidWest'));
    expect(speakerKey('Dr. Engr. Chinemelu Ezeh')).toBe('chinemeluezeh');
    expect(speakerKey('Lanciné Touré')).toBe('lancinetoure');
  });
});

describe('programme import: rows', () => {
  const t = findTable(AGENDA);
  const rows = buildRows(t, guessMapping(t.headers), CTX);
  const byTitle = (s: string) => rows.find((r) => r.title.startsWith(s))!;

  it('reads each session, skipping headings', () => {
    expect(rows.map((r) => r.title)).toEqual([
      'Participants Registration & Tag Pickup',
      'The National Anthem',
      'Africa in the Global AI Order: Towards Equitable Ownership and Shared Prosperity',
      'Positioning Africa in the Global AI Order: Capital, Talent, and Trust',
      'Lecture: Defining the Compute Ecosystem in Africa',
      'Tech Justice & Algorithmic Accountability',
      'Tea break/Networking/Exhibition and Research Presentation Tour',
      'Lunch/Networking',
      'Tech Justice in Practice',
      'Building Africa’s AI Human Capital',
    ]);
    expect(byTitle('Africa in the Global')).toMatchObject({ type: 'keynote', day: 1, start: '10:50', end: '11:10', room: 'Main Hall', track: 'general', problem: null });
  });

  it('takes a blank time from the row above, and a speakers-only row onto the session above', () => {
    const design = byTitle('Tech Justice & Algorithmic');
    expect(design).toMatchObject({ start: '11:55', end: '12:15', timeFromAbove: true, type: 'workshop' });
    expect(design.speakers.map((s) => s.name)).toEqual(['Chioma Agwuegbo', 'Joshua Olufemi']);
  });

  it('sets the day from a heading row', () => {
    expect(byTitle('Building Africa').day).toBe(2);
    expect(byTitle('Tech Justice in Practice')).toMatchObject({ day: 1, start: '14:30', end: '15:30' });
  });

  it('says what stops a row', () => {
    expect(byTitle('Tea break').problem).toBe('no_room');
    expect(byTitle('Lunch').problem).toBe('no_end');
    const withRoom = buildRows(t, guessMapping(t.headers), { ...CTX, fallbackRoom: 'Foyer' });
    expect(withRoom.find((r) => r.title.startsWith('Tea break'))).toMatchObject({ room: 'Foyer', problem: null, type: 'networking' });
  });

  it('checks tracks, rooms, days and repeats', () => {
    const table = findTable([
      ['Day', 'Start', 'End', 'Title', 'Room', 'Track'],
      ['1', '09:00', '10:00', 'A', 'Hall', 'Governance & Ethics'],
      ['1', '09:00', '10:00', 'A', 'Hall', ''],
      ['1', '10:00', '11:00', 'B', 'TBC', ''],
      ['3', '10:00', '11:00', 'C', 'Hall', ''],
      ['22/10/2026', '10:00', '11:00', 'D', 'Hall', 'Space'],
      ['2026-11-01', '10:00', '11:00', 'E', 'Hall', ''],
      ['1', '11:30', '11:45pm', 'F', 'Hall', ''],
    ]);
    const mapping = { ...guessMapping(table.headers), date: 0 };
    const out = buildRows(table, mapping, CTX);
    expect(out.map((r) => [r.title, r.day, r.track, r.problem])).toEqual([
      ['A', 1, 'governance', null],
      ['A', 1, 'general', 'duplicate'],
      ['B', 1, 'general', 'placeholder_room'],
      ['C', null, 'general', 'outside_days'],
      ['D', 2, 'Space', 'unknown_track'],
      ['E', null, 'general', 'outside_days'],
      ['F', 1, 'general', 'long_session'],
    ]);
  });

  it('skips what the programme already has', () => {
    const existing = [{ title: 'The National Anthem', day: 1, startsAt: new Date('2026-10-21T10:00').toISOString() } as Session];
    const again = buildRows(t, guessMapping(t.headers), { ...CTX, existing });
    expect(again.find((r) => r.title === 'The National Anthem')!.problem).toBe('exists');
  });
});

describe('programme import: sending', () => {
  const t = findTable(AGENDA);
  const rows = buildRows(t, guessMapping(t.headers), CTX);

  it('plans each person once, linking those already on file', () => {
    const plan = planSpeakers(rows, [{ id: 'sp-1', name: 'Olubayo Adekanmbi', role: 'Founder', organisation: 'DSN', avatarUrl: null }]);
    const names = plan.map((p) => p.name);
    expect(names).toContain('Melanie Hui');
    expect(names.filter((n) => n.includes('Adekanmbi'))).toHaveLength(1);
    expect(plan.find((p) => p.name.includes('Adekanmbi'))!.existing?.id).toBe('sp-1');
    expect(plan.find((p) => p.name === 'Melanie Hui')).toMatchObject({ existing: null, role: 'Chief Executive Officer', organisation: 'Luminate', sessions: 1 });
  });

  it('builds the bulk body with the event day’s date and speaker ids', () => {
    const keynote = rows.find((r) => r.type === 'keynote')!;
    const body = toSessionBody(keynote, EDITION_START, 'ed-1', new Map([['melaniehui', 'sp-9']]));
    expect(body).toMatchObject({ day: 1, type: 'keynote', track: 'general', room: 'Main Hall', editionId: 'ed-1', speakerIds: ['sp-9'] });
    expect(body.startsAt).toBe(new Date('2026-10-21T10:50').toISOString());
    expect(toSessionBody(rows[0]!, EDITION_START, 'ed-1', new Map())).not.toHaveProperty('speakerIds');
  });

  it('writes a template that reads back cleanly, and a report', () => {
    const table = findTable(gridFromText(templateCsv()));
    const back = buildRows(table, guessMapping(table.headers), { ...CTX, tracks: [{ value: 'general', label: 'General Programme' }] });
    expect(back.map((r) => r.problem)).toEqual([null, null]);
    expect(back[1]!.speakers.map((s) => s.name)).toEqual(['Prof. Tunde Bello', 'Grace Obi', 'Kwame Mensah']);
    const report = reportCsv(back, new Set([back[0]!.line]), true).split('\n');
    expect(report[1]).toContain('Added');
    expect(report[2]).toContain('the import stopped');
  });
});
