// WebSocket client: reconnect + session resume, clock sync, typed events
export class Net {
  constructor() {
    this.handlers = new Map();
    this.queue = [];
    this.offset = 0; // serverTime - localTime
    this.rttBest = Infinity;
    this.samples = [];
    this.myId = null;
    this.session = null;
    this.status = 'idle';
    this.retries = 0;
  }
  url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }
  on(type, fn) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type).add(fn);
    // flush messages that arrived before anyone listened (e.g. WebRTC offers before voice init)
    const bl = this.backlog?.[type];
    if (bl) { delete this.backlog[type]; for (const m of bl) { try { fn(m); } catch (e) { console.error(e); } } }
    return () => this.handlers.get(type)?.delete(fn);
  }
  emit(type, m) {
    const hs = this.handlers.get(type);
    if ((!hs || !hs.size) && type === 'rtc') { ((this.backlog ||= {})[type] ||= []).push(m); return; }
    for (const fn of hs || []) { try { fn(m); } catch (e) { console.error(e); } }
  }

  connect(first) {
    return new Promise((resolve, reject) => {
      this.status = 'connecting';
      this.emit('status', this.status);
      const ws = new WebSocket(this.url());
      this.ws = ws;
      let settled = false;
      ws.onopen = () => {
        ws.send(JSON.stringify(first));
        this.pingTimer = setInterval(() => this.ping(), 2000);
        this.ping();
      };
      ws.onmessage = (e) => {
        let m;
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === 'welcome') {
          this.myId = m.id;
          this.session = { code: m.code, token: m.token };
          try { sessionStorage.setItem('bb_session', JSON.stringify(this.session)); localStorage.setItem('bb_session', JSON.stringify({ ...this.session, at: Date.now() })); } catch {}
          this.offset = m.serverTime - Date.now();
          this.status = 'online'; this.retries = 0;
          this.emit('status', this.status);
          for (const q of this.queue.splice(0)) this.send(q);
          if (!settled) { settled = true; resolve(m); }
        }
        if (m.t === 'error' && !settled) { settled = true; reject(m); return; }
        if (m.t === 'pong') return this.onPong(m);
        this.emit(m.t, m);
      };
      ws.onclose = (ev) => {
        clearInterval(this.pingTimer);
        if (!settled) { settled = true; reject({ code: 'conn', text: 'אין חיבור לשרת' }); }
        if (ev.code === 4001 || this.closedByUser) { this.status = 'closed'; this.emit('status', this.status); return; }
        if (this.session) this.scheduleReconnect();
        else { this.status = 'closed'; this.emit('status', this.status); }
      };
      ws.onerror = () => {};
    });
  }

  scheduleReconnect() {
    this.status = 'reconnecting';
    this.emit('status', this.status);
    const delay = Math.min(8000, 500 * Math.pow(1.6, this.retries++));
    setTimeout(() => {
      this.connect({ t: 'resume', code: this.session.code, token: this.session.token }).then((m) => this.emit('resumed', m)).catch((e) => {
        if (e?.code === 'noresume') { this.session = null; try { sessionStorage.removeItem('bb_session'); localStorage.removeItem('bb_session'); } catch {} this.emit('lost', e); }
      });
    }, delay);
  }

  ping() { this.sendRaw({ t: 'ping', c: performance.now() }); }
  onPong(m) {
    const now = performance.now();
    const rtt = now - m.c;
    const off = m.s + rtt / 2 - Date.now();
    this.samples.push({ rtt, off });
    if (this.samples.length > 12) this.samples.shift();
    const best = this.samples.slice().sort((a, b) => a.rtt - b.rtt).slice(0, 4);
    this.offset = best.reduce((s, x) => s + x.off, 0) / best.length;
    this.rtt = rtt;
    this.emit('rtt', rtt);
  }
  serverNow() { return Date.now() + this.offset; }

  sendRaw(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  send(m) {
    if (this.ws?.readyState === 1 && this.status === 'online') this.ws.send(JSON.stringify(m));
    else if (m.t !== 'move' && m.t !== 'speak' && this.queue.length < 50) this.queue.push(m);
  }
  request(m, replyType, timeout = 8000) {
    return new Promise((res, rej) => {
      const off = this.on(replyType, (r) => { off(); clearTimeout(to); res(r); });
      const to = setTimeout(() => { off(); rej(new Error('timeout')); }, timeout);
      this.send(m);
    });
  }
  close() { this.closedByUser = true; try { this.ws?.close(); } catch {} }

  static savedSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem('bb_session') || 'null');
      if (s) return s;
      const l = JSON.parse(localStorage.getItem('bb_session') || 'null');
      if (l && Date.now() - l.at < 3 * 60 * 1000) return l;
    } catch {}
    return null;
  }
  static clearSession() { try { sessionStorage.removeItem('bb_session'); localStorage.removeItem('bb_session'); } catch {} }
}
