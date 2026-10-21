// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { parseCsv, speakerOf, transcriptLines } from '@/lib/calls-to-action/who-said-it';

const csv = [
  'createdAt,room,speaker,mic,name,source,text',
  '2026-10-21T11:00:00.000Z,Main Hall,1,,"Dr. Bosun Tijani",ai,"We will roll out 90,000 kilometres of fibre"',
  '2026-10-21T11:00:05.000Z,Main Hall,1,,"Dr. Bosun Tijani",ai,"to connect every ward in every local government."',
  '2026-10-21T11:02:00.000Z,Main Hall,2,,"",ai,"Thank you, ""Minister"", for that."',
  '2026-10-21T11:03:00.000Z,Main Hall,3,,"Speaker 3",ai,"We should share the talent code with another country."',
].join('\n');

describe('who said it, from the transcript', () => {
  it('reads the export, quotes and commas included, and drops placeholder names', () => {
    expect(parseCsv('a,"b, c","d ""e"""')[0]).toEqual(['a', 'b, c', 'd "e"']);
    const lines = transcriptLines(csv);
    expect(lines).toHaveLength(4);
    expect(lines[2]!.text).toBe('Thank you, "Minister", for that.');
    expect(lines[2]!.name).toBeNull();
    expect(lines[3]!.name).toBeNull(); // "Speaker 3" is not a name
  });

  it('finds the speaker from the quote, even across two lines', () => {
    const lines = transcriptLines(csv);
    expect(speakerOf({ quote: 'roll out 90,000 kilometres of fibre to connect every ward', saidAt: null }, lines)).toBe('Dr. Bosun Tijani');
  });

  it('falls back to the named line nearest the time it was said', () => {
    const lines = transcriptLines(csv);
    expect(speakerOf({ quote: null, saidAt: '2026-10-21T11:00:40.000Z' }, lines)).toBe('Dr. Bosun Tijani');
  });

  it('says nothing rather than guess', () => {
    const lines = transcriptLines(csv);
    expect(speakerOf({ quote: 'We should share the talent code with another country', saidAt: null }, lines)).toBeNull();
    expect(speakerOf({ quote: null, saidAt: '2026-10-21T12:00:00.000Z' }, lines)).toBeNull();
  });
});
