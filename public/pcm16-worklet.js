/**
 * The sound desk's multi-mic capture: N channels of float audio in, 16 kHz audio out, the channels
 * interleaved (mic 1, mic 2, … per sample), posted in 250 ms chunks. Each output sample averages
 * the input samples since the last one, a simple low-pass that is plenty for speech.
 *
 * Samples go out as 8-bit G.711 μ-law (`encoding: 'mulaw'`, 128 kbps a mic, half the uplink) or as
 * 16-bit PCM (`encoding: 'linear16'`, 256 kbps a mic). μ-law keeps speech clear at half the size.
 *
 * An automixer gate keeps one voice on one mic: a mic passes sound only while it is within
 * `gateDb` (10 dB) of the loudest mic and above the noise floor, held open briefly so words are
 * not clipped. A speaker's voice reaching the mic beside them, more quietly, is silenced there,
 * so it is not transcribed twice; silent mics also cost nothing to transcribe.
 */
const FLOOR = 0.004; // about -48 dBFS: below this a mic is not carrying speech
const HOLD_S = 0.3; // stays open this long after its speaker pauses
const RELEASE_S = 0.15; // how fast a mic's level falls away
const FADE = 0.01; // per-sample step towards open or shut: a few ms, so gating never clicks

const BIAS = 0x84;
const CLIP = 32635;

/** One 16-bit sample as an 8-bit G.711 μ-law byte (the standard encoder: bias, segment, mantissa, inverted). */
function mulaw(sample) {
  const sign = (sample >> 8) & 0x80;
  let s = sign ? -sample : sample;
  if (s > CLIP) s = CLIP;
  s += BIAS;
  const exponent = 31 - Math.clz32(s >> 7); // the segment: s >> 7 is 1 to 255
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

class Pcm16 extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions;
    this.channels = opts.channels;
    this.packed = opts.encoding === 'mulaw'; // 8-bit μ-law rather than 16-bit PCM
    this.ratio = Math.pow(10, -(opts.gateDb ?? 10) / 20);
    this.step = sampleRate / 16000; // input samples per output sample
    this.pos = 0;
    this.sum = new Float64Array(this.channels);
    this.count = 0;
    // gate state, per mic, at the 16 kHz output rate
    this.level = new Float64Array(this.channels);
    this.hold = new Int32Array(this.channels);
    this.gain = new Float64Array(this.channels).fill(1);
    this.release = Math.exp(-1 / (RELEASE_S * 16000));
    this.holdSamples = Math.round(HOLD_S * 16000);
    this.chunk = 4000 * this.channels; // 250 ms at 16 kHz
    this.out = this.fresh();
    this.o = 0;
    this.sample = new Float64Array(this.channels);
  }

  fresh() {
    return this.packed ? new Uint8Array(this.chunk) : new Int16Array(this.chunk);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      for (let c = 0; c < this.channels; c++) this.sum[c] += input[c] ? input[c][i] : 0;
      this.count++;
      this.pos += 1;
      if (this.pos < this.step) continue;
      this.pos -= this.step;

      // this output sample per mic, and how loud each mic is now
      let loudest = 0;
      for (let c = 0; c < this.channels; c++) {
        const v = this.sum[c] / this.count;
        this.sample[c] = v;
        this.sum[c] = 0;
        this.level[c] = Math.max(Math.abs(v), this.level[c] * this.release);
        if (this.level[c] > loudest) loudest = this.level[c];
      }
      this.count = 0;

      for (let c = 0; c < this.channels; c++) {
        // open while carrying speech and near the loudest; then held open a moment
        if (this.level[c] > FLOOR && this.level[c] >= loudest * this.ratio) this.hold[c] = this.holdSamples;
        else if (this.hold[c] > 0) this.hold[c]--;
        const target = this.hold[c] > 0 ? 1 : 0;
        this.gain[c] += (target - this.gain[c]) * FADE;
        const v = Math.max(-1, Math.min(1, this.sample[c] * this.gain[c]));
        const pcm = (v < 0 ? v * 0x8000 : v * 0x7fff) | 0;
        this.out[this.o++] = this.packed ? mulaw(pcm) : pcm;
      }
      if (this.o === this.chunk) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = this.fresh();
        this.o = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm16', Pcm16);
