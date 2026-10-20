import { describe, expect, it } from 'vitest';

import { matchBrief, matchBriefs } from '@/lib/programme/brief-match';
import type { Session } from '@/lib/programme/programme';

const START = '2026-10-21T08:00:00+01:00';
const sp = (name: string) => ({ id: name, name, role: null, organisation: null, avatarUrl: null });
const s = (id: string, day: number, title: string, speakers: string[] = []): Session => ({
  id,
  day,
  title,
  description: '',
  startsAt: '',
  endsAt: '',
  track: 'general',
  type: 'panel',
  status: 'scheduled',
  room: 'Main Hall',
  editionId: 'e',
  speakers: speakers.map(sp),
});

const PROGRAMME = [
  s('anthem1', 1, 'The National Anthem'),
  s('anthem2', 2, 'The National Anthem'),
  s('lose', 2, 'What Africa Stands to Lose: The Unseen Costs of Limited Compute Capacity', ['Prof. Victor Odumuyiwa']),
  s('potential', 2, 'From Potential to Progress: Reflections on Nigeria’s National AI Strategy', ['Dr. Olubunmi Ajala', 'Dr. Osasuyi Dirisu', 'Dr. Chinasa Okolo', 'Dr. Olubayo Adekanmbi']),
  s('compute', 1, 'Defining the Compute Ecosystem in Africa: Evidence, Infrastructure, and Policy Priorities', ['Prof. Bamidele Adebisi']),
  s('palfrey', 1, 'Positioning Africa in the Global AI Order: Capital, Talent, and Trust', ['John Palfrey', 'Professor Olayinka David-West']),
];

const ODUMUYIWA = `Build 2026
Session Brief: Academic Presentation
What Africa Stands to Lose: The Unseen Costs of Limited Compute Capacity
Prof. Victor Odumuyiwa, Professor of Artificial Intelligence and Natural Language Processing, University of Lagos
DATE AND TIME	Day Two, Thursday 22 October 2026, 10:20am – 10:40am
Purpose of the Presentation
Discussion of Africa’s compute gap usually concentrates on what the continent lacks.`;

describe('matching briefs to sessions', () => {
  it('matches a brief by its title, speaker and day', () => {
    expect(matchBrief({ fileName: 'Brief.docx', text: ODUMUYIWA }, PROGRAMME, START)).toEqual({
      sessionId: 'lose',
      confidence: 'sure',
      reason: 'Matched on title, 1 speaker, Day 2',
    });
  });

  it('matches on speakers and the file name when the title is worded differently', () => {
    const m = matchBrief(
      { fileName: 'Fireside - Palfrey.pdf', text: 'Session Brief: High-Level Fireside Chat\nCapital, talent and trust for Africa\nJohn Palfrey, President, MacArthur Foundation\nModerated by Professor Olayinka David-West' },
      PROGRAMME,
      START,
    );
    expect(m.sessionId).toBe('palfrey');
  });

  it('tells sessions with the same title apart by day', () => {
    expect(matchBrief({ fileName: 'anthem.docx', text: 'The National Anthem\nDay One, Wednesday 21 October 2026' }, PROGRAMME, START).sessionId).toBe('anthem1');
    expect(matchBrief({ fileName: 'anthem.docx', text: 'The National Anthem\nThursday 22 October 2026' }, PROGRAMME, START).sessionId).toBe('anthem2');
  });

  it('is unsure without a day to tell same-titled sessions apart', () => {
    expect(matchBrief({ fileName: 'anthem.docx', text: 'The National Anthem' }, PROGRAMME, START).confidence).toBe('check');
  });

  it('finds nothing for a brief about something else', () => {
    expect(matchBrief({ fileName: 'notes.docx', text: 'Catering order for the gala dinner' }, PROGRAMME, START)).toMatchObject({ sessionId: null, confidence: 'none' });
  });

  it('keeps one brief per session, setting the weaker match aside', () => {
    const out = matchBriefs(
      [
        { fileName: 'vague.docx', text: 'Notes on compute in Africa\nProf. Victor Odumuyiwa' },
        { fileName: 'Odumuyiwa.docx', text: ODUMUYIWA },
      ],
      PROGRAMME,
      START,
    );
    expect(out[1]).toMatchObject({ sessionId: 'lose', confidence: 'sure' });
    expect(out[0]).toMatchObject({ sessionId: null, reason: 'Another file matched the same session' });
  });
});
