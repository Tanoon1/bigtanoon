// LiveKit SFU transport – scalable to 16+ players, TURN handled by LiveKit.
// Tracks are mixed by our own Web Audio graph (spatial + occlusion), never by LiveKit's <audio> elements.
export class LiveKitTransport {
  constructor(voice, net, cfg) {
    this.voice = voice; this.net = net; this.cfg = cfg;
    this.pubs = new Map(); // identity -> RemoteTrackPublication
  }
  async start(track) {
    const LK = await import('livekit-client');
    this.LK = LK;
    const { token, url } = await this.net.request({ t: 'lkToken' }, 'lkToken');
    if (!token) throw new Error('LiveKit token unavailable');
    const room = new LK.Room({ adaptiveStream: false, dynacast: false, audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true } });
    this.room = room;
    room.on(LK.RoomEvent.TrackPublished, (pub, participant) => { this.pubs.set(participant.identity, pub); });
    room.on(LK.RoomEvent.TrackSubscribed, (t, pub, participant) => {
      if (t.kind === 'audio') this.voice.addRemote(participant.identity, t.mediaStreamTrack);
    });
    room.on(LK.RoomEvent.TrackUnsubscribed, (t, pub, participant) => this.voice.removeRemote(participant.identity));
    room.on(LK.RoomEvent.ParticipantDisconnected, (participant) => { this.pubs.delete(participant.identity); this.voice.removeRemote(participant.identity); });
    room.on(LK.RoomEvent.Disconnected, () => setTimeout(() => this.reconnect(), 2000));
    await room.connect(url || this.cfg.url, token, { autoSubscribe: false });
    for (const p of room.remoteParticipants.values()) for (const pub of p.trackPublications.values()) if (pub.kind === 'audio') this.pubs.set(p.identity, pub);
    this.local = new LK.LocalAudioTrack(track, undefined, false);
    await room.localParticipant.publishTrack(this.local, { source: LK.Track.Source.Microphone, dtx: true, red: true });
  }
  async reconnect() {
    if (this.stopped) return;
    try { this.room?.disconnect(); } catch {}
    try { await this.start(this.local.mediaStreamTrack); } catch (e) { console.warn('livekit reconnect failed', e); setTimeout(() => this.reconnect(), 5000); }
  }
  // selective subscription: only download audio of players within hearing range
  setWanted(want) {
    for (const [id, pub] of this.pubs) {
      const w = want.has(id);
      if (pub.isSubscribed !== w) { try { pub.setSubscribed(w); } catch {} }
    }
  }
  syncPeers() {}
  stop() { this.stopped = true; try { this.room?.disconnect(); } catch {} }
}
