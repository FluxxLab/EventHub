import { describe, expect, it } from 'vitest';

import type { Session } from '@/lib/programme/programme';
import { affiliation, createSpeakerSchema, type Speaker, MAX_PHOTO_BYTES, photoProblem, searchSpeakers, sessionsBySpeaker, toSpeakerBody } from '@/lib/speakers/speakers';

const amina: Speaker = { id: 'a', name: 'Amina Yusuf', role: 'Director', organisation: 'PIC', avatarUrl: null };
const tunde: Speaker = { id: 't', name: 'Tunde Bakare', role: null, organisation: 'Paystack', avatarUrl: null };

describe('photoProblem', () => {
  it('accepts the types the API signs, within the size cap', () => {
    expect(photoProblem({ type: 'image/png', size: 1000 })).toBeNull();
  });
  it('explains a wrong type or an oversized file', () => {
    expect(photoProblem({ type: 'image/gif', size: 1000 })).toMatch(/JPG/);
    expect(photoProblem({ type: 'image/jpeg', size: MAX_PHOTO_BYTES + 1 })).toMatch(/5 MB/);
  });
});

describe('toSpeakerBody', () => {
  it('leaves blanks out and adds the photo when there is one', () => {
    const form = createSpeakerSchema.parse({ name: ' Amina Yusuf ', role: '', organisation: 'PIC' });
    expect(toSpeakerBody(form, null)).toEqual({ name: 'Amina Yusuf', organisation: 'PIC' });
    expect(toSpeakerBody(form, 'https://cdn/x.jpg')).toHaveProperty('avatarUrl', 'https://cdn/x.jpg');
  });
  it('requires a name', () => {
    expect(createSpeakerSchema.safeParse({ name: '  ', role: '', organisation: '' }).success).toBe(false);
  });
});

describe('affiliation / searchSpeakers', () => {
  it('joins what there is', () => {
    expect(affiliation(amina)).toBe('Director, PIC');
    expect(affiliation(tunde)).toBe('Paystack');
  });
  it('searches name, role and organisation', () => {
    expect(searchSpeakers([amina, tunde], 'paystack')).toEqual([tunde]);
    expect(searchSpeakers([amina, tunde], 'DIRECTOR')).toEqual([amina]);
    expect(searchSpeakers([amina, tunde], ' ')).toHaveLength(2);
  });
});

describe('sessionsBySpeaker', () => {
  it('lists each speaker’s sessions', () => {
    const s = (id: string, speakers: Speaker[]) => ({ id, speakers }) as unknown as Session;
    const map = sessionsBySpeaker([s('1', [amina, tunde]), s('2', [amina])]);
    expect(map.get('a')?.map((x) => x.id)).toEqual(['1', '2']);
    expect(map.get('t')).toHaveLength(1);
  });
});
