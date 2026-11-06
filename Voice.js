// =====================================================================
//  Proximity voice chat
//  Sender:  mic → high-pass → pitch worklet (BB / punishments) → gate (mute/PTT) → VAD → WebRTC track
//  Receiver per speaker: source → occlusion gain → low-pass (walls) → HRTF panner → voice bus
//                        + PA branch (Big Brother / megaphone / farewell) → reverb, non-spatial
//  Transport: LiveKit SFU (production) or P2P mesh over our WebSocket signaling (dev / small groups)
// =====================================================================
import { audio } from '../audio/Audio.js';
import { VOICE } from '../../../shared/constants.js';
import { occluderSegments, occlusionBetween, roomAt } from '../../../shared/layout.js';
import { isMobile } from '../engine.js';

export async function requestMic() {
  if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('nomedia'), { code: window.isSecureContext ? 'nomedia' : 'insecure' });
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
}

export async function micPermissionState() {
  try { const s = await navigator.permissions.query({ name: 'microphone' }); return s.state; } catch { return 'prompt'; }
}

export class Voice {
  constructor(net) {
    this.net = net;
    this.remotes = new Map();
    this.muted = false;
    this.ptt = false; // push-to-talk mode
    this.pttDown = false;
    this.allowed = true; // game rules (intro, long night ...)
    this.speaking = false;
    this.level = 0;
    this.lastSend = 0;
    this.noiseFloor = 0.008;
    this.hang = 0;
    this.pitch = 1;
    this.transport = null;
    this.segments = occluderSegments({});
    this.accum = 0;
  }

  async start(stream, cfg) {
    this.stream = stream;
    const ctx = audio.unlock();
    this.ctx = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 85;
    this.bbEq = ctx.createBiquadFilter(); this.bbEq.type = 'lowshelf'; this.bbEq.frequency.value = 220; this.bbEq.gain.value = 0;
    src.connect(hp);
    let last = hp;
    try {
      await ctx.audioWorklet.addModule('/worklets/pitch.js');
      this.pitchNode = new AudioWorkletNode(ctx, 'pitch-shifter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      hp.connect(this.pitchNode);
      last = this.pitchNode;
    } catch (e) { console.warn('pitch worklet unavailable', e); }
    last.connect(this.bbEq);
    this.gate = ctx.createGain(); this.gate.gain.value = 1;
    this.bbEq.connect(this.gate);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 512;
    this.preAnalyser = ctx.createAnalyser(); this.preAnalyser.fftSize = 512;
    hp.connect(this.preAnalyser);
    this.gate.connect(this.analyser);
    this.dest = ctx.createMediaStreamDestination();
    this.gate.connect(this.dest);
    this.outTrack = this.dest.stream.getAudioTracks()[0];
    this.buf = new Float32Array(512);
    // monitor for local echo-free self check (not routed to speakers)
    this.mode = cfg.mode;
    if (cfg.mode === 'livekit') {
      const { LiveKitTransport } = await import('./LiveKitTransport.js');
      this.transport = new LiveKitTransport(this, this.net, cfg);
    } else {
      const { MeshTransport } = await import('./MeshTransport.js');
      this.transport = new MeshTransport(this, this.net, cfg);
    }
    this.ready = true;
    await this.transport.start(this.outTrack);
  }

  setPitch(r) {
    if (r === this.pitch) return;
    this.pitch = r;
    const p = this.pitchNode?.parameters.get('ratio');
    if (p) p.setTargetAtTime(r, this.ctx.currentTime, 0.05);
    this.bbEq.gain.setTargetAtTime(r < 0.85 ? 7 : 0, this.ctx.currentTime, 0.05);
  }

  // ---------------------------------------------------------------- remote speakers
  addRemote(id, track) {
    if (!this.ready) { (this.pending ||= []).push([id, track]); return; }
    this.removeRemote(id);
    const ctx = this.ctx;
    const stream = new MediaStream([track]);
    // Chrome needs the remote stream attached to a media element for WebAudio to receive data
    const el = new Audio();
    el.muted = true; el.srcObject = stream; el.play().catch(() => {});
    const src = ctx.createMediaStreamSource(stream);
    const occ = ctx.createGain(); occ.gain.value = 0;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; lp.Q.value = 0.5;
    const pan = ctx.createPanner();
    pan.panningModel = isMobile ? 'equalpower' : 'HRTF';
    pan.distanceModel = 'inverse'; pan.refDistance = VOICE.REF_DISTANCE; pan.rolloffFactor = VOICE.ROLLOFF; pan.maxDistance = 40;
    const pa = ctx.createGain(); pa.gain.value = 0;
    const paRev = ctx.createGain(); paRev.gain.value = 0;
    const an = ctx.createAnalyser(); an.fftSize = 256;
    src.connect(an);
    src.connect(occ); occ.connect(lp); lp.connect(pan); pan.connect(audio.voiceBus);
    src.connect(pa); pa.connect(audio.voiceBus);
    pa.connect(paRev); paRev.connect(audio.reverb);
    this.remotes.set(id, { id, el, src, occ, lp, pan, pa, paRev, an, track, buf: new Float32Array(256), level: 0 });
  }
  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    try { r.src.disconnect(); r.pa.disconnect(); r.pan.disconnect(); r.el.srcObject = null; } catch {}
    this.remotes.delete(id);
  }
  remoteLevel(id) { return this.remotes.get(id)?.level || 0; }

  setDoors(doors) { this.segments = occluderSegments(doors); }

  // ---------------------------------------------------------------- per-frame
  // ctx: { me, players: Map(id -> {pos, role, connected}), listener {x,y,z}, phase, bbTalk, bbId, effects, mega:Set, bbListen, diaryOccupant }
  update(dt, g) {
    if (!this.ready) return;
    // ---- local VAD / gate
    const transmitting = this.allowed && !this.muted && (!this.ptt || this.pttDown);
    this.gate.gain.setTargetAtTime(transmitting ? 1 : 0, this.ctx.currentTime, 0.02);
    if (this.outTrack) this.outTrack.enabled = transmitting;
    this.preAnalyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(s / this.buf.length);
    if (rms < this.noiseFloor * 1.5) this.noiseFloor = this.noiseFloor * 0.995 + rms * 0.005;
    this.micLevel = Math.min(1, rms * 9);
    const voiced = rms > Math.max(0.012, this.noiseFloor * 3);
    if (voiced) this.hang = 0.35; else this.hang -= dt;
    const speaking = transmitting && this.hang > 0;
    this.level = speaking ? this.micLevel : 0;
    const now = performance.now();
    if (speaking !== this.speaking || (speaking && now - this.lastSend > 300)) {
      this.speaking = speaking;
      this.lastSend = now;
      this.net.send({ t: 'speak', on: speaking, lvl: Math.round(this.level * 100) / 100 });
    }
    // ---- remote levels (for nametag rings)
    for (const r of this.remotes.values()) {
      r.an.getFloatTimeDomainData(r.buf);
      let q = 0;
      for (let i = 0; i < r.buf.length; i += 2) q += r.buf[i] * r.buf[i];
      r.level = Math.min(1, Math.sqrt(q / (r.buf.length / 2)) * 9);
    }
    // ---- spatial mixing at ~15 Hz
    this.accum += dt;
    if (this.accum < 0.066) return;
    this.accum = 0;
    const t = this.ctx.currentTime;
    const L = g.listener;
    const meRole = g.me?.role;
    const lobbyish = g.phase === 'lobby' || g.phase === 'gameOver';
    const whisper = g.effects?.voice?.v === 'whisper';
    const radius = whisper ? VOICE.WHISPER_RADIUS : VOICE.HEAR_RADIUS;
    const muted = new Set(Array.isArray(g.effects?.muted?.v) ? g.effects.muted.v : []);
    const want = new Set();
    for (const [id, r] of this.remotes) {
      const p = g.players.get(id);
      let spatial = 0, paG = 0, lpf = 20000;
      if (p && p.connected !== false) {
        if (p.role === 'bb') {
          const talk = g.bbTalk;
          if (g.phase === 'intro' || talk === 'house') paG = 1;
          else if (talk === 'diary' && g.diaryOccupant === g.me?.id) paG = 1;
        } else if (g.viewer && !lobbyish) {
          // Big Brother & evicted viewers listen to the selected camera's room (or freecam spatial)
          const room = roomAt(p.pos.x, p.pos.z);
          if (p.role === 'ghost' && meRole === 'ghost') paG = 0.8; // the audience talks among itself
          if (p.role === 'hg') {
            if (g.bbListen === 'all') paG = 0.45;
            else if (g.bbListen === 'spatial') spatial = 1;
            else if (room === g.bbListen) paG = 1;
            if (g.diaryOccupant === id) paG = Math.max(paG, g.bbListen === 'diary' ? 1 : 0.6);
          }
        } else if (p.role === 'ghost' && meRole !== 'ghost' && !lobbyish) {
          // houseguests never hear the audience
        } else if (g.mega.has(id)) {
          paG = 1;
        } else if (g.phase === 'intro') {
          // houseguests are silent during the cutscene
        } else if (!muted.has(id)) {
          const dx = p.pos.x - L.x, dz = p.pos.z - L.z;
          const d = Math.hypot(dx, dz);
          if (d < radius + 2) want.add(id);
          if (d < radius) {
            const n = occlusionBetween(this.segments, L.x, L.z, p.pos.x, p.pos.z);
            const fade = d > radius * 0.75 ? 1 - (d - radius * 0.75) / (radius * 0.25) : 1;
            const occG = n === 0 ? 1 : n <= 0.5 ? 0.6 : n <= 1 ? 0.42 : n <= 2 ? 0.18 : 0;
            lpf = n === 0 ? 20000 : n <= 0.5 ? 2400 : n <= 1 ? 1100 : 520;
            spatial = occG * fade;
            if (whisper) spatial *= 0.7;
          }
        }
        if (paG > 0 || g.viewer) want.add(id);
      }
      r.occ.gain.setTargetAtTime(spatial, t, 0.08);
      r.lp.frequency.setTargetAtTime(lpf, t, 0.08);
      r.pa.gain.setTargetAtTime(paG * 0.9, t, 0.08);
      r.paRev.gain.setTargetAtTime(paG * (p?.role === 'bb' ? 0.55 : 0.25), t, 0.08);
      if (p) {
        const px = p.pos.x, py = (p.pos.y || 0) + 1.6, pz = p.pos.z;
        if (r.pan.positionX) { r.pan.positionX.setTargetAtTime(px, t, 0.05); r.pan.positionY.setTargetAtTime(py, t, 0.05); r.pan.positionZ.setTargetAtTime(pz, t, 0.05); }
        else r.pan.setPosition(px, py, pz);
      }
    }
    // let the transport know who is in hearing range (LiveKit: selective subscription saves bandwidth)
    for (const [id, p] of g.players) {
      if (id === g.me?.id) continue;
      if (p.role === 'bb' || g.mega.has(id) || g.viewer || lobbyish) { want.add(id); continue; }
      if (p.role === 'ghost' && meRole !== 'ghost') continue;
      if (Math.hypot(p.pos.x - L.x, p.pos.z - L.z) < radius + 3) want.add(id);
    }
    this.transport?.setWanted?.(want, g);
  }

  stop() {
    this.transport?.stop();
    for (const id of [...this.remotes.keys()]) this.removeRemote(id);
    this.stream?.getTracks().forEach((t) => t.stop());
  }
}
