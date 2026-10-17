import { describe, expect, it } from 'vitest';

import type { Caption } from '@/lib/captions/captions';
import { applyNamed, bindingLabel, heardOnMic, labelOf, micLabelsOf, nameFor, namedParagraphs, voiceOf, type SpeakerName } from '@/lib/captions/speaker-names';

const T0 = '2027-09-07T09:00:00Z';
const at = (s: number) => new Date(Date.parse(T0) + s * 1000).toISOString();
const line = (seq: number, over: Partial<Caption> = {}): Caption => ({ text: `line ${seq}`, isFinal: true, at: at(seq), seq, ...over });
const binding = (over: Partial<SpeakerName> = {}): SpeakerName => ({
  id: 'b1',
  sessionId: 's',
  kind: 'speaker',
  key: 0,
  name: 'Amina Yusuf',
  organisation: 'PIC',
  speakerId: null,
  status: 'auto',
  source: 'introduction',
  evidence: 'I am Amina Yusuf from PIC.',
  fromAt: at(10),
  toAt: null,
  createdAt: at(10),
  ...over,
});

describe('nameFor', () => {
  it('takes the name the server sent first, with its organisation', () => {
    expect(nameFor(line(20, { name: 'Server Name', organisation: 'Org', speaker: 0 }), [binding()])).toEqual({ name: 'Server Name', organisation: 'Org' });
    expect(nameFor(line(20, { name: 'Server Name', mic: 2 }), [], { 2: { name: 'Label', organisation: null } })).toEqual({ name: 'Server Name', organisation: null });
  });

  it("then the operator's mic label, then the applied binding", () => {
    const onMic = binding({ kind: 'mic', key: 2, name: 'Heard Name' });
    expect(nameFor(line(20, { mic: 2 }), [onMic], { 2: { name: 'Label', organisation: 'Ministry' } })).toEqual({ name: 'Label', organisation: 'Ministry' });
    expect(nameFor(line(20, { mic: 2 }), [onMic], {})).toEqual({ name: 'Heard Name', organisation: 'PIC' });
    expect(nameFor(line(20, { mic: 3 }), [onMic], {})).toBeNull();
  });

  it('names only lines inside the window, by kind and key', () => {
    const b = binding({ fromAt: at(10), toAt: at(30) });
    expect(nameFor(line(9, { speaker: 0 }), [b])).toBeNull();
    expect(nameFor(line(10, { speaker: 0 }), [b])?.name).toBe('Amina Yusuf');
    expect(nameFor(line(29, { speaker: 0 }), [b])?.name).toBe('Amina Yusuf');
    expect(nameFor(line(30, { speaker: 0 }), [b])).toBeNull();
    expect(nameFor(line(20, { speaker: 1 }), [b])).toBeNull();
    expect(nameFor(line(20, { mic: 0 }), [b])).toBeNull();
  });

  it('ignores suggestions and rejections, and prefers the newer of two applied bindings', () => {
    expect(nameFor(line(20, { speaker: 0 }), [binding({ status: 'suggested' })])).toBeNull();
    expect(nameFor(line(20, { speaker: 0 }), [binding({ status: 'rejected' })])).toBeNull();
    const older = binding({ id: 'old', fromAt: at(0), name: 'First' });
    const newer = binding({ id: 'new', fromAt: at(15), name: 'Second', status: 'confirmed' });
    expect(nameFor(line(20, { speaker: 0 }), [older, newer])?.name).toBe('Second');
    expect(nameFor(line(12, { speaker: 0 }), [older, newer])?.name).toBe('First');
  });
});

describe('applyNamed', () => {
  it('adds, replaces and (rejected) removes', () => {
    let list = applyNamed([], binding());
    expect(list).toHaveLength(1);
    list = applyNamed(list, binding({ id: 'b2', key: 1, name: 'Chidi Okoro', status: 'suggested' }));
    expect(list.map((b) => b.id)).toEqual(['b1', 'b2']);
    list = applyNamed(list, binding({ id: 'b2', key: 1, name: 'Chidi Okoro', status: 'confirmed' }));
    expect(list.map((b) => b.status)).toEqual(['auto', 'confirmed']);
    list = applyNamed(list, binding({ id: 'b1', status: 'rejected' }));
    expect(list.map((b) => b.id)).toEqual(['b2']);
    expect(applyNamed(list, binding({ id: 'nope', status: 'rejected' }))).toEqual(list);
  });
});

describe('labels', () => {
  it('fall back to the mic or speaker number', () => {
    expect(labelOf({ mic: 2, speaker: 0 })).toBe('Mic 2');
    expect(labelOf({ speaker: 0 })).toBe('Speaker 1');
    expect(labelOf({})).toBeNull();
    expect(bindingLabel({ kind: 'mic', key: 2 })).toBe('Mic 2');
    expect(bindingLabel({ kind: 'speaker', key: 2 })).toBe('Speaker 3');
  });

  it('read the operator mic labels off a session', () => {
    const session = {
      speakers: [{ id: 's1', name: 'Grace Obi', role: null, organisation: 'Lab', avatarUrl: null }],
      mics: [
        { mic: 1, speakerId: 's1', label: null },
        { mic: 2, speakerId: null, label: 'Audience' },
        { mic: 3, speakerId: null, label: null },
      ],
    };
    expect(micLabelsOf(session)).toEqual({ 1: { name: 'Grace Obi', organisation: 'Lab' }, 2: { name: 'Audience', organisation: null } });
  });

  it('find the newest name heard on a mic', () => {
    const a = binding({ id: 'a', kind: 'mic', key: 2, fromAt: at(0), name: 'First' });
    const b = binding({ id: 'b', kind: 'mic', key: 2, fromAt: at(5), name: 'Second', source: 'review' });
    const typed = binding({ id: 'c', kind: 'mic', key: 2, fromAt: at(9), name: 'Typed', source: 'operator' });
    expect(heardOnMic([a, b, typed], 2)?.name).toBe('Second');
    expect(heardOnMic([a], 1)).toBeNull();
  });
});

describe('voiceOf', () => {
  it('credits the binding that named the line, not a mic label', () => {
    const b = binding();
    expect(voiceOf(line(20, { speaker: 0 }), [b]).binding).toBe(b);
    expect(voiceOf(line(20, { speaker: 0, name: 'Amina Yusuf' }), [b]).binding).toBe(b);
    expect(voiceOf(line(20, { speaker: 0, name: 'Someone Else' }), [b]).binding).toBeNull();
    const onMic = binding({ kind: 'mic', key: 1 });
    expect(voiceOf(line(20, { mic: 1 }), [onMic], { 1: { name: 'Label', organisation: null } })).toEqual({ label: 'Label', named: { name: 'Label', organisation: null }, binding: null });
  });
});

describe('namedParagraphs', () => {
  it('merges earlier lines by a voice once a binding names it', () => {
    const lines = [line(11, { speaker: 0 }), line(12, { mic: 2 }), line(13, { speaker: 0 }), line(14, { speaker: 1 })];
    const unnamed = namedParagraphs(lines, []);
    expect(unnamed.map((p) => p.voice.label)).toEqual(['Speaker 1', 'Mic 2', 'Speaker 1', 'Speaker 2']);
    // the same person on mic 2 and as diarised speaker 0: one paragraph once named
    const named = namedParagraphs(lines, [binding({ fromAt: at(0) }), binding({ id: 'm', kind: 'mic', key: 2, fromAt: at(0) })]);
    expect(named.map((p) => [p.voice.label, p.lines.length])).toEqual([
      ['Amina Yusuf', 3],
      ['Speaker 2', 1],
    ]);
    expect(named[0]!.voice.named).toEqual({ name: 'Amina Yusuf', organisation: 'PIC' });
    expect(named[0]!.voice.binding?.id).toBe('b1');
  });

  it('still breaks a paragraph after a long pause', () => {
    const lines = [line(11, { speaker: 0 }), line(30, { speaker: 0 })];
    expect(namedParagraphs(lines, [binding({ fromAt: at(0) })])).toHaveLength(2);
  });
});
