// Procedural audio: SFX synthesis, adaptive music sequencer, PA reverb, Hebrew TTS narration.
import { safeGet } from '../engine.js';

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicMood = null;
    this.vol = { master: num(safeGet('bb_vol_master'), 0.9), music: num(safeGet('bb_vol_music'), 0.32), sfx: num(safeGet('bb_vol_sfx'), 0.8), voice: num(safeGet('bb_vol_voice'), 1) };
    this.listener = { x: 0, y: 1.6, z: 0 };
    this.step = 0;
    this.nextTime = 0;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      const c = this.ctx;
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master = c.createGain(); this.master.gain.value = this.vol.master;
      this.master.connect(this.comp); this.comp.connect(c.destination);
      this.sfxBus = c.createGain(); this.sfxBus.gain.value = this.vol.sfx; this.sfxBus.connect(this.master);
      this.musicBus = c.createGain(); this.musicBus.gain.value = this.vol.music; this.musicBus.connect(this.master);
      this.voiceBus = c.createGain(); this.voiceBus.gain.value = this.vol.voice; this.voiceBus.connect(this.master);
      this.reverb = c.createConvolver(); this.reverb.buffer = this.impulse(2.6, 2.2);
      this.reverbOut = c.createGain(); this.reverbOut.gain.value = 0.8;
      this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.master);
      this.noiseBuf = this.makeNoise();
      setInterval(() => this.schedule(), 60);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setVolume(k, v) {
    this.vol[k] = v;
    try { localStorage.setItem('bb_vol_' + k, v); } catch {}
    if (!this.ctx) return;
    const map = { master: this.master, music: this.musicBus, sfx: this.sfxBus, voice: this.voiceBus };
    map[k]?.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  impulse(sec, decay) {
    const c = this.ctx, len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  }
  makeNoise() {
    const c = this.ctx, len = c.sampleRate * 2;
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  setListener(pos, fwd, up = { x: 0, y: 1, z: 0 }) {
    this.listener = pos;
    if (!this.ctx) return;
    const L = this.ctx.listener, t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(pos.x, t); L.positionY.setValueAtTime(pos.y, t); L.positionZ.setValueAtTime(pos.z, t);
      L.forwardX.setValueAtTime(fwd.x, t); L.forwardY.setValueAtTime(fwd.y, t); L.forwardZ.setValueAtTime(fwd.z, t);
      L.upX.setValueAtTime(up.x, t); L.upY.setValueAtTime(up.y, t); L.upZ.setValueAtTime(up.z, t);
    } else { L.setPosition(pos.x, pos.y, pos.z); L.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z); }
  }

  // ------------------------------------------------------------------ synth helpers
  out(pos, gain = 1, reverb = 0) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = gain;
    if (pos) {
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.4; p.maxDistance = 40;
      p.positionX ? (p.positionX.value = pos[0], p.positionY.value = pos[1], p.positionZ.value = pos[2]) : p.setPosition(...pos);
      g.connect(p); p.connect(this.sfxBus);
    } else g.connect(this.sfxBus);
    if (reverb) { const r = c.createGain(); r.gain.value = reverb; g.connect(r); r.connect(this.reverb); }
    return g;
  }
  tone(dest, f, t0, dur, { type = 'sine', vol = 0.3, a = 0.005, r = 0.15, f2 = null, detune = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t0); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + a); g.gain.setValueAtTime(vol, t0 + Math.max(a, dur - r)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(dest, t0, dur, { f = 1000, q = 1, type = 'bandpass', vol = 0.3, a = 0.005, f2 = null } = {}) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(vol, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }

  sfx(name, pos = null, vol = 1) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime + 0.01;
    const N = (f) => 440 * Math.pow(2, (f - 69) / 12);
    const o = (g = 1, rv = 0) => this.out(pos, g * vol, rv);
    switch (name) {
      case 'chime': case 'bbVoice': { const d = o(0.8, 0.5); [76, 72, 79].forEach((n, i) => { this.tone(d, N(n), t + i * 0.22, 0.7, { type: 'sine', vol: 0.25, r: 0.5 }); this.tone(d, N(n + 12), t + i * 0.22, 0.4, { type: 'triangle', vol: 0.06, r: 0.3 }); }); if (name === 'bbVoice') this.noise(d, t, 0.8, { f: 300, f2: 80, vol: 0.2, type: 'lowpass' }); break; }
      case 'morning': { const d = o(0.7, 0.3); [60, 64, 67, 72, 76].forEach((n, i) => this.tone(d, N(n), t + i * 0.09, 0.5, { type: 'triangle', vol: 0.18 })); break; }
      case 'task': case 'success': case 'win': { const d = o(0.8, 0.3); const seq = name === 'win' ? [60, 64, 67, 72, 67, 72, 76, 79] : [67, 72, 76, 79]; seq.forEach((n, i) => { this.tone(d, N(n), t + i * 0.11, 0.35, { type: 'square', vol: 0.07 }); this.tone(d, N(n - 12), t + i * 0.11, 0.35, { type: 'triangle', vol: 0.12 }); }); break; }
      case 'sting': { const d = o(1, 0.6); this.tone(d, 55, t, 1.6, { type: 'sawtooth', vol: 0.25, r: 1.2, f2: 40 }); this.noise(d, t, 1.4, { f: 200, f2: 4000, vol: 0.12 }); this.tone(d, N(81), t + 0.05, 1.2, { type: 'sine', vol: 0.06, r: 1 }); break; }
      case 'evict': { const d = o(1, 0.7); this.tone(d, 45, t, 2.5, { type: 'sine', vol: 0.5, r: 2 }); this.tone(d, N(57), t, 2.4, { type: 'sawtooth', vol: 0.06, r: 2 }); this.tone(d, N(60), t, 2.4, { type: 'sawtooth', vol: 0.05, r: 2 }); break; }
      case 'alarm': { const d = o(0.6); for (let i = 0; i < 4; i++) this.tone(d, i % 2 ? 660 : 880, t + i * 0.25, 0.24, { type: 'square', vol: 0.08 }); break; }
      case 'heartbeat': { const d = o(1); for (const dt of [0, 0.22]) { this.tone(d, 60, t + dt, 0.18, { type: 'sine', vol: 0.8, f2: 35, r: 0.12 }); } break; }
      case 'doorOpen': { const d = o(0.6); this.noise(d, t, 0.35, { f: 800, f2: 300, vol: 0.15 }); this.tone(d, 120, t + 0.25, 0.12, { vol: 0.2 }); break; }
      case 'doorClose': { const d = o(0.7); this.noise(d, t, 0.2, { f: 600, vol: 0.12 }); this.tone(d, 90, t + 0.12, 0.15, { vol: 0.4, f2: 50 }); break; }
      case 'locked': { const d = o(0.5); this.tone(d, 300, t, 0.08, { type: 'square', vol: 0.08 }); this.tone(d, 200, t + 0.1, 0.12, { type: 'square', vol: 0.08 }); break; }
      case 'lock': { const d = o(0.8, 0.3); this.tone(d, 140, t, 0.2, { type: 'square', vol: 0.15, f2: 70 }); this.noise(d, t, 0.15, { f: 3000, vol: 0.1 }); break; }
      case 'fridge': { const d = o(0.5); this.tone(d, 110, t, 0.6, { type: 'sawtooth', vol: 0.03 }); this.noise(d, t, 0.1, { f: 2000, vol: 0.1 }); break; }
      case 'click': { const d = o(0.4); this.noise(d, t, 0.03, { f: 4000, vol: 0.3, type: 'highpass' }); break; }
      case 'pickup': case 'catch': { const d = o(0.5); this.tone(d, 600, t, 0.08, { type: 'triangle', vol: 0.2, f2: 900 }); break; }
      case 'whoosh': { const d = o(0.5); this.noise(d, t, 0.3, { f: 400, f2: 2500, q: 2, vol: 0.2 }); break; }
      case 'splash': { const d = o(0.8); this.noise(d, t, 0.6, { f: 1200, f2: 400, q: 0.7, vol: 0.4 }); this.noise(d, t + 0.05, 0.4, { f: 4000, vol: 0.15, type: 'highpass' }); break; }
      case 'splat': { const d = o(0.7); this.noise(d, t, 0.25, { f: 500, f2: 150, q: 3, vol: 0.4 }); this.tone(d, 200, t, 0.2, { f2: 60, vol: 0.2 }); break; }
      case 'pow': { const d = o(1); this.tone(d, 160, t, 0.2, { f2: 50, vol: 0.6 }); this.noise(d, t, 0.15, { f: 1500, vol: 0.35 }); this.tone(d, 900, t + 0.05, 0.3, { f2: 1800, type: 'triangle', vol: 0.08 }); break; }
      case 'boing': { const d = o(0.8); this.tone(d, 180, t, 0.5, { type: 'sine', vol: 0.3, f2: 600 }); this.tone(d, 600, t + 0.15, 0.35, { type: 'sine', vol: 0.15, f2: 200 }); break; }
      case 'pillow': { const d = o(0.8); this.noise(d, t, 0.25, { f: 400, vol: 0.5, type: 'lowpass' }); this.tone(d, 120, t, 0.15, { f2: 70, vol: 0.3 }); break; }
      case 'coin': case 'ding': { const d = o(0.6, 0.2); this.tone(d, name === 'coin' ? 1318 : 1047, t, 0.12, { type: 'square', vol: 0.06 }); this.tone(d, name === 'coin' ? 1760 : 1568, t + 0.08, 0.3, { type: 'square', vol: 0.06 }); break; }
      case 'error': case 'buzz': { const d = o(0.6); this.tone(d, 110, t, 0.35, { type: 'sawtooth', vol: 0.12 }); break; }
      case 'found': { const d = o(0.7); [72, 76, 79].forEach((n, i) => this.tone(d, N(n), t + i * 0.07, 0.2, { type: 'square', vol: 0.06 })); break; }
      case 'crunch': { const d = o(0.6); for (let i = 0; i < 4; i++) this.noise(d, t + i * 0.08, 0.06, { f: 2500, vol: 0.25 }); break; }
      case 'jingle': case 'party': { const d = o(0.7, 0.3); [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => this.tone(d, N(n), t + i * 0.08, 0.25, { type: 'triangle', vol: 0.12 })); break; }
      case 'bark': { const d = o(1); for (const dt of [0, 0.3]) { this.noise(d, t + dt, 0.15, { f: 700, q: 4, vol: 0.5, f2: 400 }); this.tone(d, 300, t + dt, 0.12, { type: 'sawtooth', vol: 0.08, f2: 200 }); } break; }
      case 'powerdown': { const d = o(0.9); this.tone(d, 400, t, 1.2, { type: 'sawtooth', vol: 0.12, f2: 30 }); break; }
      case 'footstep': { const d = o(0.25); this.noise(d, t, 0.06, { f: 300 + Math.random() * 200, q: 1, vol: 0.3, type: 'lowpass' }); break; }
      case 'cheer': this.cheer(3, vol); break;
      case 'piano': { const d = o(0.6, 0.3); const n = 60 + (pos?.[3] ?? Math.floor(Math.random() * 12)); this.tone(d, N(n), t, 1.2, { type: 'triangle', vol: 0.2, r: 1 }); this.tone(d, N(n + 12), t, 0.6, { type: 'sine', vol: 0.06, r: 0.5 }); break; }
      case 'shower': { const d = o(0.4); this.noise(d, t, 3, { f: 5000, vol: 0.12, type: 'highpass', a: 0.2 }); break; }
      case 'tick': { const d = o(0.4); this.tone(d, 1200, t, 0.03, { type: 'square', vol: 0.05 }); break; }
      case 'lava': { const d = o(0.8); this.tone(d, 80, t, 1.0, { type: 'sawtooth', vol: 0.15, f2: 160 }); this.noise(d, t, 1, { f: 300, vol: 0.2, type: 'lowpass' }); break; }
      case 'confetti': { const d = o(0.6); this.noise(d, t, 0.3, { f: 6000, vol: 0.2, type: 'highpass' }); [84, 88, 91].forEach((n, i) => this.tone(d, N(n), t + i * 0.05, 0.2, { type: 'triangle', vol: 0.05 })); break; }
      default: break;
    }
  }

  cheer(sec = 3, vol = 1) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const d = this.out(null, 0.7 * vol, 0.4);
    this.noise(d, t, sec, { f: 1400, q: 0.6, vol: 0.35, a: 0.4 });
    this.noise(d, t, sec * 0.9, { f: 3200, q: 0.8, vol: 0.12, a: 0.3 });
    for (let i = 0; i < sec * 25; i++) this.noise(d, t + Math.random() * sec, 0.04, { f: 2000 + Math.random() * 2000, q: 2, vol: 0.12 });
    for (let i = 0; i < 6; i++) this.tone(d, 700 + Math.random() * 500, t + Math.random() * sec * 0.6, 0.4, { type: 'sine', vol: 0.03, f2: 1200 });
  }

  // ------------------------------------------------------------------ music sequencer
  setMood(mood) {
    if (mood === this.musicMood) return;
    this.musicMood = mood;
    this.step = 0;
  }
  schedule() {
    const c = this.ctx;
    if (!c || c.state !== 'running' || !this.musicMood || this.musicMood === 'silence') return;
    const def = MOODS[this.musicMood];
    if (!def) return;
    const spb = 60 / def.bpm / 4; // 16th note
    if (this.nextTime < c.currentTime) this.nextTime = c.currentTime + 0.05;
    while (this.nextTime < c.currentTime + 0.25) {
      this.playStep(def, this.step, this.nextTime, spb);
      this.step++;
      this.nextTime += spb;
    }
  }
  playStep(def, s, t, spb) {
    const N = (f) => 440 * Math.pow(2, (f - 69) / 12);
    const bar = Math.floor(s / 16) % def.chords.length;
    const chord = def.chords[bar];
    const i = s % 16;
    const d = this.musicBus;
    if (def.pad && i === 0) chord.forEach((n) => { this.tone(d, N(n), t, spb * 16, { type: def.padType || 'sine', vol: def.pad, a: 0.6, r: 1.2 }); this.tone(d, N(n), t, spb * 16, { type: 'sine', vol: def.pad * 0.5, a: 0.6, r: 1.2, detune: 8 }); });
    if (def.bass && def.bassPat[i]) this.tone(d, N(chord[0] - 24 + (def.bassPat[i] - 1) * 0), t, spb * 1.8, { type: def.bassType || 'triangle', vol: def.bass, r: spb });
    if (def.arp && def.arpPat[i]) { const n = chord[(Math.floor(s / (def.arpDiv || 2))) % chord.length] + 12 + (def.arpOct || 0); this.tone(d, N(n), t, spb * 1.5, { type: def.arpType || 'triangle', vol: def.arp, r: spb }); }
    if (def.kick && def.kickPat[i]) this.tone(d, 120, t, 0.25, { f2: 40, vol: def.kick });
    if (def.hat && def.hatPat[i]) this.noise(d, t, 0.04, { f: 8000, type: 'highpass', vol: def.hat });
    if (def.snare && def.snarePat[i]) this.noise(d, t, 0.15, { f: 1800, q: 0.8, vol: def.snare });
    if (def.tick && i % 4 === 2) this.tone(d, 2400, t, 0.02, { type: 'square', vol: def.tick });
  }

  // ------------------------------------------------------------------ TTS
  speak(text, { pitch = 0.55, rate = 0.92, volume = 1 } = {}) {
    if (!('speechSynthesis' in window) || this.ttsOff) return false;
    try {
      const voices = speechSynthesis.getVoices();
      const v = voices.find((x) => /he|iw/i.test(x.lang));
      if (!v) return false;
      const u = new SpeechSynthesisUtterance(text);
      u.voice = v; u.lang = v.lang; u.pitch = pitch; u.rate = rate; u.volume = volume * this.vol.master;
      if (this.musicBus) { this.musicBus.gain.setTargetAtTime(this.vol.music * 0.35, this.ctx.currentTime, 0.1); u.onend = () => this.musicBus.gain.setTargetAtTime(this.vol.music, this.ctx.currentTime, 0.4); }
      speechSynthesis.speak(u);
      return true;
    } catch { return false; }
  }
  stopSpeech() { try { speechSynthesis.cancel(); } catch {} }
}

const P = (s) => s.split('').map((ch) => (ch === 'x' ? 1 : 0));
const MOODS = {
  calm: { bpm: 84, chords: [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]], pad: 0.035, arp: 0.035, arpPat: P('x...x...x...x.x.'), arpType: 'sine', bass: 0.08, bassPat: P('x.......x.......') },
  happy: { bpm: 112, chords: [[60, 64, 67], [65, 69, 72], [67, 71, 74], [65, 69, 72]], pad: 0.02, arp: 0.05, arpPat: P('x.x.x.x.x.x.x.x.'), arpType: 'square', arpDiv: 1, bass: 0.12, bassPat: P('x...x.x.x...x.x.'), kick: 0.35, kickPat: P('x...x...x...x...'), hat: 0.03, hatPat: P('..x...x...x...x.'), snare: 0.08, snarePat: P('....x.......x...') },
  tense: { bpm: 96, chords: [[57, 60, 64], [57, 60, 63], [56, 60, 63], [55, 58, 62]], pad: 0.04, padType: 'sawtooth', bass: 0.16, bassType: 'sawtooth', bassPat: P('x.x.x.x.x.x.x.x.'), tick: 0.03, kick: 0.25, kickPat: P('x.......x.......') },
  dramatic: { bpm: 70, chords: [[50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52]], pad: 0.06, padType: 'sawtooth', bass: 0.2, bassPat: P('x...............'), kick: 0.5, kickPat: P('x.......x.......'), arp: 0.025, arpPat: P('x.....x.....x...'), arpOct: 12 },
  party: { bpm: 124, chords: [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]], arp: 0.05, arpPat: P('x.xx.x.xx.x.x.xx'), arpType: 'sawtooth', arpDiv: 1, bass: 0.15, bassType: 'square', bassPat: P('..x...x...x...x.'), kick: 0.5, kickPat: P('x...x...x...x...'), hat: 0.05, hatPat: P('..x...x...x...x.'), snare: 0.1, snarePat: P('....x.......x...') },
  intro: { bpm: 100, chords: [[45, 52, 57, 60], [41, 48, 53, 57], [43, 50, 55, 59], [40, 47, 52, 56]], pad: 0.05, padType: 'sawtooth', arp: 0.05, arpPat: P('x.x.x.x.x.x.x.x.'), arpType: 'square', arpDiv: 1, arpOct: 0, bass: 0.2, bassType: 'sawtooth', bassPat: P('x..x..x.x..x..x.'), kick: 0.5, kickPat: P('x...x...x...x...'), snare: 0.12, snarePat: P('....x.......x...'), hat: 0.04, hatPat: P('xxxxxxxxxxxxxxxx') },
};

function num(v, d) { const n = parseFloat(v); return Number.isFinite(n) ? n : d; }

export const audio = new AudioEngine();
