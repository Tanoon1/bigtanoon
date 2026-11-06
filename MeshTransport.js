// P2P mesh voice transport (WebRTC, signaling relayed by the game server). Good for dev and small groups;
// use LiveKit (SFU) for 16 players in production.
export class MeshTransport {
  constructor(voice, net, cfg) {
    this.voice = voice; this.net = net; this.cfg = cfg;
    this.pcs = new Map();
    this.ice = cfg.ice || [{ urls: ['stun:stun.l.google.com:19302'] }];
  }
  async start(track) {
    this.track = track;
    this.off = this.net.on('rtc', (m) => this.onSignal(m.from, m.d));
  }
  myId() { return this.net.myId; }

  // called with the current list of connected peers
  syncPeers(ids) {
    if (!this.track) return;
    const want = new Set(ids.filter((id) => id !== this.myId()));
    for (const id of want) if (!this.pcs.has(id)) this.create(id);
    for (const id of [...this.pcs.keys()]) if (!want.has(id)) this.close(id);
    // watchdog: a connection stuck for >10s gets rebuilt by the impolite side
    const now = performance.now();
    for (const [id, st] of this.pcs) {
      const cs = st.pc.connectionState;
      if (cs === 'connected') { st.okAt = now; continue; }
      if (!st.polite && now - (st.okAt || st.created) > 10000) { this.close(id); this.create(id); }
    }
  }

  create(id) {
    const pc = new RTCPeerConnection({ iceServers: this.ice });
    const st = { pc, polite: this.myId() > id, making: false, ignore: false, id, created: performance.now() };
    this.pcs.set(id, st);
    const sender = pc.addTrack(this.track, new MediaStream([this.track]));
    // modest Opus bitrate for many peers
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'connected') {
        const p = sender.getParameters();
        p.encodings = p.encodings && p.encodings.length ? p.encodings : [{}];
        p.encodings[0].maxBitrate = 28000;
        sender.setParameters(p).catch(() => {});
      }
      if (pc.connectionState === 'failed') { pc.restartIce?.(); }
    });
    pc.onnegotiationneeded = async () => {
      try {
        st.making = true;
        await pc.setLocalDescription();
        this.net.send({ t: 'rtc', to: id, d: { sdp: pc.localDescription } });
      } catch (e) { console.warn(e); } finally { st.making = false; }
    };
    pc.onicecandidate = (e) => { if (e.candidate) this.net.send({ t: 'rtc', to: id, d: { cand: e.candidate } }); };
    pc.ontrack = (e) => this.voice.addRemote(id, e.track);
    return st;
  }

  async onSignal(from, d) {
    let st = this.pcs.get(from) || this.create(from);
    const pc = st.pc;
    try {
      if (d.sdp) {
        const collision = d.sdp.type === 'offer' && (st.making || pc.signalingState !== 'stable');
        st.ignore = !st.polite && collision;
        if (st.ignore) return;
        await pc.setRemoteDescription(d.sdp);
        if (d.sdp.type === 'offer') {
          await pc.setLocalDescription();
          this.net.send({ t: 'rtc', to: from, d: { sdp: pc.localDescription } });
        }
      } else if (d.cand) {
        try { await pc.addIceCandidate(d.cand); } catch (e) { if (!st.ignore) console.warn(e); }
      }
    } catch (e) { console.warn('rtc', e); }
  }

  close(id) {
    const st = this.pcs.get(id);
    if (!st) return;
    try { st.pc.close(); } catch {}
    this.pcs.delete(id);
    this.voice.removeRemote(id);
  }
  stop() { for (const id of [...this.pcs.keys()]) this.close(id); this.off?.(); }
}
