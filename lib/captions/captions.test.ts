import { describe, expect, it } from 'vitest';

import {
  captureMimeType,
  deskRooms,
  EMPTY_FEED,
  FLOOR_DB,
  meterFraction,
  meterZone,
  peakDb,
  uncaptioned,
  mergeCaption,
  paragraphs,
  parseSourceKey,
  readPatch,
  sameRoom,
  seedFeed,
  sourceOptions,
  speakerLabel,
  whoSaid,
  type Caption,
} from '@/lib/captions/captions';

const line = (seq: number, over: Partial<Caption> = {}): Caption => ({ text: `line ${seq}`, isFinal: true, at: `2027-09-07T09:00:${String(seq).padStart(2, '0')}Z`, seq, ...over });

describe('mergeCaption', () => {
  it('shows an interim line, then replaces it with the final', () => {
    let feed = mergeCaption(EMPTY_FEED, line(1, { isFinal: false, text: 'hel' }));
    expect(feed.interim?.text).toBe('hel');
    feed = mergeCaption(feed, line(1, { text: 'hello' }));
    expect(feed).toEqual({ finals: [line(1, { text: 'hello' })], interim: null });
  });

  it('keeps finals in seq order and drops duplicates', () => {
    let feed = [3, 1, 2, 2].reduce((f, n) => mergeCaption(f, line(n)), EMPTY_FEED);
    expect(feed.finals.map((l) => l.seq)).toEqual([1, 2, 3]);
    feed = mergeCaption(feed, line(2, { text: 'again' }));
    expect(feed.finals).toHaveLength(3);
  });

  it('slots a backfilled line into place without clearing what is being said now', () => {
    let feed = mergeCaption(mergeCaption(EMPTY_FEED, line(1)), line(3));
    feed = mergeCaption(feed, line(4, { isFinal: false }));
    feed = mergeCaption(feed, line(2, { backfill: true }));
    expect(feed.finals.map((l) => l.seq)).toEqual([1, 2, 3]);
    expect(feed.interim?.seq).toBe(4);
  });

  it('keeps only the newest lines past the cap', () => {
    const feed = [1, 2, 3, 4].reduce((f, n) => mergeCaption(f, line(n), 2), EMPTY_FEED);
    expect(feed.finals.map((l) => l.seq)).toEqual([3, 4]);
  });
});

describe('seedFeed', () => {
  it('merges catch-up history with live lines that arrived first', () => {
    const live = mergeCaption(EMPTY_FEED, line(5));
    const feed = seedFeed(live, [1, 2].map((n) => ({ text: `line ${n}`, speaker: null, at: line(n).at, seq: n })));
    expect(feed.finals.map((l) => l.seq)).toEqual([1, 2, 5]);
  });
});

describe('paragraphs', () => {
  it('groups by speaker and splits on long pauses', () => {
    const lines = [
      line(1, { speaker: 0 }),
      line(2, { speaker: 0 }),
      line(3, { speaker: 1 }),
      line(4, { speaker: 1, at: '2027-09-07T09:01:30Z' }),
    ];
    expect(paragraphs(lines).map((p) => [p.who, p.lines.length])).toEqual([
      ['Speaker 1', 2],
      ['Speaker 2', 1],
      ['Speaker 2', 1],
    ]);
    expect(speakerLabel(0)).toBe('Speaker 1');
    expect(speakerLabel(null)).toBeNull();
  });

  it('names a line by its mic: the name on it, else the mic number', () => {
    expect(whoSaid({ mic: 2, name: 'Dr Amina Bello', speaker: null })).toBe('Dr Amina Bello');
    expect(whoSaid({ mic: 2, name: null })).toBe('Mic 2');
    expect(whoSaid({ speaker: 0 })).toBe('Speaker 1');
    expect(whoSaid({})).toBeNull();
    // a new paragraph when the mic changes hands
    const lines = [line(1, { mic: 1, name: 'Amina' }), line(2, { mic: 1, name: 'Amina' }), line(3, { mic: 2, name: 'Audience' })];
    expect(paragraphs(lines).map((p) => [p.who, p.lines.length])).toEqual([
      ['Amina', 2],
      ['Audience', 1],
    ]);
  });
});

describe('captureMimeType', () => {
  it('prefers WebM/Opus and falls back to plain WebM', () => {
    expect(captureMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(captureMimeType((t) => t === 'audio/webm')).toBe('audio/webm');
    expect(captureMimeType(() => false)).toBeNull();
  });
});

describe('sound desk', () => {
  it('turns each channel of each input into a source', () => {
    const options = sourceOptions([
      { deviceId: 'usb', label: 'Focusrite', channels: 2 },
      { deviceId: 'mic', label: 'Laptop mic', channels: 1 },
    ]);
    expect(options).toEqual([
      { value: 'usb#0', label: 'Focusrite · Ch 1' },
      { value: 'usb#1', label: 'Focusrite · Ch 2' },
      { value: 'mic#0', label: 'Laptop mic' },
    ]);
    expect(parseSourceKey('a#b#3')).toEqual({ deviceId: 'a#b', channel: 3 });
    expect(parseSourceKey('nochannel')).toBeNull();
    expect(parseSourceKey('#1')).toBeNull();
  });

  it("reads levels in dBFS on a -60 to 0 meter", () => {
    expect(peakDb(new Uint8Array(64).fill(128))).toBe(FLOOR_DB);
    expect(peakDb(Uint8Array.of(128, 0))).toBe(0);
    expect(peakDb(Uint8Array.of(128, 192))).toBeCloseTo(-6.02, 1);
    expect(meterFraction(-30)).toBe(0.5);
    expect(meterFraction(-90)).toBe(0);
    expect([meterZone(-20), meterZone(-6), meterZone(-1)]).toEqual(["ok", "hot", "clip"]);
  });

  it("finds live sessions this desk is not captioning", () => {
    const live = [{ room: "Hall A" }, { room: "Main Hall" }];
    expect(uncaptioned(live, [" hall a"])).toEqual([{ room: "Main Hall" }]);
  });

  it('lists rooms once each, however they are typed', () => {
    expect(deskRooms(['Main Hall', 'Hall A'], [' main hall ', 'Hall B', ''])).toEqual(['Hall A', 'Hall B', 'Main Hall']);
    expect(sameRoom('Hall A ', 'hall a')).toBe(true);
  });

  it('reads a saved patch, ignoring anything malformed', () => {
    expect(readPatch('{"Hall A":{"source":"usb#0","diarise":true},"Bad":{"source":3},"Null":null}')).toEqual({ 'Hall A': { source: 'usb#0', diarise: true, multi: false, mics: [] } });
    // a multi-mic room keeps its channels, and drops anything that is not one
    expect(readPatch('{"Hall B":{"source":"","diarise":false,"multi":true,"mics":["usb#2","usb#3",7]}}')).toEqual({ 'Hall B': { source: '', diarise: false, multi: true, mics: ['usb#2', 'usb#3'] } });
    expect(readPatch('not json')).toEqual({});
    expect(readPatch('[1]')).toEqual({});
    expect(readPatch(null)).toEqual({});
  });
});
