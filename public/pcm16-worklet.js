/**
 * The sound desk's multi-mic capture: N channels of float audio in, 16 kHz 16-bit PCM out, the
 * channels interleaved (mic 1, mic 2, … per sample), posted in 250 ms chunks. Each output sample
 * averages the input samples since the last one, a simple low-pass that is plenty for speech.
 */
class Pcm16 extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.channels = options.processorOptions.channels;
    this.step = sampleRate / 16000; // input samples per output sample
    this.pos = 0;
    this.sum = new Float64Array(this.channels);
    this.count = 0;
    this.chunk = 4000 * this.channels; // 250 ms at 16 kHz
    this.out = new Int16Array(this.chunk);
    this.o = 0;
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
      for (let c = 0; c < this.channels; c++) {
        const v = Math.max(-1, Math.min(1, this.sum[c] / this.count));
        this.out[this.o++] = v < 0 ? v * 0x8000 : v * 0x7fff;
        this.sum[c] = 0;
      }
      this.count = 0;
      if (this.o === this.chunk) {
        this.port.postMessage(this.out.buffer, [this.out.buffer]);
        this.out = new Int16Array(this.chunk);
        this.o = 0;
      }
    }
    return true;
  }
}

registerProcessor('pcm16', Pcm16);
