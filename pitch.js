// Real-time granular pitch shifter (two crossfaded read heads over a delay line).
// ratio < 1 = deeper voice (Big Brother), ratio > 1 = chipmunk.
class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'ratio', defaultValue: 1, minValue: 0.4, maxValue: 2.2, automationRate: 'k-rate' }];
  }
  constructor() {
    super();
    this.size = 8192;
    this.buf = new Float32Array(this.size);
    this.w = 0;
    this.phase = 0;
    this.win = Math.round(sampleRate * 0.045);
  }
  read(d) {
    let p = this.w - d;
    while (p < 0) p += this.size;
    const i = Math.floor(p), f = p - i;
    const a = this.buf[i % this.size], b = this.buf[(i + 1) % this.size];
    return a + (b - a) * f;
  }
  process(inputs, outputs, params) {
    const inp = inputs[0] && inputs[0][0];
    const outs = outputs[0];
    if (!inp) return true;
    const ratio = params.ratio[0];
    const out = outs[0];
    if (Math.abs(ratio - 1) < 0.01) {
      out.set(inp);
      for (let i = 0; i < inp.length; i++) { this.buf[this.w] = inp[i]; this.w = (this.w + 1) % this.size; }
    } else {
      const win = this.win, step = (1 - ratio) / win;
      for (let i = 0; i < inp.length; i++) {
        this.buf[this.w] = inp[i];
        this.phase += step;
        if (this.phase >= 1) this.phase -= 1; else if (this.phase < 0) this.phase += 1;
        const p2 = (this.phase + 0.5) % 1;
        const s1 = this.read(this.phase * win + 2), s2 = this.read(p2 * win + 2);
        const g1 = 1 - Math.abs(2 * this.phase - 1), g2 = 1 - Math.abs(2 * p2 - 1);
        out[i] = s1 * g1 + s2 * g2;
        this.w = (this.w + 1) % this.size;
      }
    }
    for (let c = 1; c < outs.length; c++) outs[c].set(out);
    return true;
  }
}
registerProcessor('pitch-shifter', PitchShifter);
