import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Processor = { port: { postMessage: (data: ArrayBuffer) => void }; process: (inputs: Float32Array[][]) => boolean };
type ProcessorClass = new (options: { processorOptions: Record<string, unknown> }) => Processor;

/** Loads the worklet as the browser would, with stand-ins for the AudioWorklet globals. */
function loadWorklet(rate = 16_000) {
  const source = readFileSync(resolve(process.cwd(), 'public/pcm16-worklet.js'), 'utf8');
  let registered: ProcessorClass | null = null;
  class Base {
    port = { postMessage: (data: ArrayBuffer) => void data };
  }
  const run = new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', `${source}\nreturn mulaw;`);
  const mulaw = run(Base, (_: string, cls: ProcessorClass) => (registered = cls), rate) as (sample: number) => number;
  return { mulaw, Pcm16: registered! as ProcessorClass };
}

describe('μ-law encoder (G.711)', () => {
  const { mulaw } = loadWorklet();

  it('encodes the known values', () => {
    expect(mulaw(0)).toBe(0xff);
    expect(mulaw(32767)).toBe(0x80);
    expect(mulaw(-32768)).toBe(0x00);
    expect(mulaw(-1)).toBe(0x7f);
    // the classic table: 1000 is segment 3
    expect(mulaw(1000)).toBe(0xce);
  });

  it('is symmetric: a negative sample differs only in the sign bit', () => {
    for (const s of [1, 50, 255, 1000, 4096, 12345, 32000]) expect(mulaw(-s)).toBe(mulaw(s) ^ 0x80);
  });

  it('grows with the sample and clips the loudest', () => {
    let last = 0x100;
    for (let s = 0; s <= 32767; s += 97) {
      const v = mulaw(s);
      expect(v).toBeLessThanOrEqual(last); // inverted: louder is a smaller byte
      last = v;
    }
    expect(mulaw(32635)).toBe(mulaw(32767));
  });
});

describe('pcm16 worklet', () => {
  const tone = (frames: number, value: number) => Array.from({ length: frames }, () => value);

  const chunks = (encoding: string | undefined, channels: number) => {
    const { Pcm16 } = loadWorklet();
    const node = new Pcm16({ processorOptions: { channels, ...(encoding ? { encoding } : {}) } });
    const out: ArrayBuffer[] = [];
    node.port.postMessage = (data) => void out.push(data);
    // 250 ms at 16 kHz, in 128-frame blocks
    for (let i = 0; i < 32; i++) node.process([Array.from({ length: channels }, () => new Float32Array(tone(128, 0.5)))]);
    return out;
  };

  it('posts 8-bit μ-law, one byte a sample, when asked', () => {
    const [first] = chunks('mulaw', 2);
    expect(first!.byteLength).toBe(4000 * 2); // 250 ms × 16 kHz × 2 mics × 1 byte
    const { mulaw } = loadWorklet();
    expect(new Uint8Array(first!)[0]).toBe(mulaw((0.5 * 0x7fff) | 0));
  });

  it('keeps 16-bit PCM by default', () => {
    const [first] = chunks(undefined, 2);
    expect(first!.byteLength).toBe(4000 * 2 * 2);
    expect(new Int16Array(first!)[0]).toBe((0.5 * 0x7fff) | 0);
  });
});
