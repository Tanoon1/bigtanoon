// =====================================================================
//  Big Brother 3D – game server (HTTP static + WebSocket game protocol)
// =====================================================================
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room } from './game/Room.js';
import { makeCode, cleanText, Bucket, now } from './util.js';
import { LIMITS, PROTOCOL_VERSION } from '../shared/constants.js';
import { voiceConfig, livekitToken, iceServers } from './voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.resolve(__dirname, '../dist');
const MIN_PLAYERS = Number(process.env.BB_MIN_PLAYERS || LIMITS.MIN_PLAYERS);
const MAX_ROOMS = Number(process.env.BB_MAX_ROOMS || 200);

export class RoomManager {
  constructor(opts = {}) {
    this.rooms = new Map();
    this.minPlayers = opts.minPlayers ?? MIN_PLAYERS;
    this.gc = setInterval(() => this.collect(), 30000);
  }
  create() {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const code = makeCode(this.rooms);
    const room = new Room(this, code, { minPlayers: this.minPlayers, voice: voiceConfig() });
    this.rooms.set(code, room);
    return room;
  }
  get(code) { return this.rooms.get(String(code || '').toUpperCase()); }
  collect() {
    for (const [code, r] of this.rooms) {
      if (r.connectedCount() === 0) {
        r.emptySince ||= now();
        if (now() - r.emptySince > 5 * 60 * 1000 || r.players.size === 0) { r.destroy(); this.rooms.delete(code); }
      } else r.emptySince = 0;
    }
  }
  close() { clearInterval(this.gc); for (const r of this.rooms.values()) r.destroy(); }
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };

function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') p = '/index.html';
  const file = path.resolve(DIST, '.' + p);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    const target = !err && st.isFile() ? file : path.join(DIST, 'index.html');
    fs.readFile(target, (e2, buf) => {
      if (e2) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not built. Run: npm run build'); }
      const ext = path.extname(target);
      const headers = { 'content-type': MIME[ext] || 'application/octet-stream', 'x-content-type-options': 'nosniff' };
      if (target.includes(`${path.sep}assets${path.sep}`)) headers['cache-control'] = 'public, max-age=31536000, immutable';
      if (ext === '.html') {
        headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com data:; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss: https:; worker-src 'self' blob:";
        headers['referrer-policy'] = 'no-referrer';
      }
      res.writeHead(200, headers);
      res.end(buf);
    });
  });
}

export function startServer({ port = PORT, host = HOST, minPlayers } = {}) {
  const manager = new RoomManager({ minPlayers });
  const server = http.createServer((req, res) => {
    if (req.url === '/api/health') { res.writeHead(200, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ ok: true, rooms: manager.rooms.size })); }
    serveStatic(req, res);
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: LIMITS.MSG_MAX_BYTES });
  const ipBuckets = new Map();

  wss.on('connection', (ws, req) => {
    const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || '?').trim();
    let ib = ipBuckets.get(ip);
    if (!ib) { ib = new Bucket(0.5, 12); ipBuckets.set(ip, ib); }
    if (!ib.take()) { ws.close(4029, 'too many connections'); return; }
    let room = null, player = null;
    const pre = new Bucket(4, 10);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    const reply = (m) => { try { ws.send(JSON.stringify(m)); } catch {} };
    const welcome = () => {
      reply({ t: 'welcome', v: PROTOCOL_VERSION, id: player.id, token: player.token, code: room.code, serverTime: now(), voice: { ...room.voice, ice: iceServers(player.id) } });
      room.send(player, room.stateFor(player));
    };

    ws.on('message', (raw, isBinary) => {
      if (isBinary) return;
      let m;
      try { m = JSON.parse(raw.toString()); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      if (!player) {
        if (!pre.take()) return;
        if (m.t === 'ping') return reply({ t: 'pong', c: m.c, s: now() });
        if (m.t === 'create' || m.t === 'join') {
          const name = cleanText(m.name, LIMITS.NAME_MAX);
          if (!name) return reply({ t: 'error', code: 'name', text: 'צריך שם' });
          if (m.t === 'create') {
            room = manager.create();
            if (!room) return reply({ t: 'error', code: 'full', text: 'השרת מלא כרגע, נסו שוב בעוד רגע' });
          } else {
            room = manager.get(m.code);
            if (!room) return reply({ t: 'error', code: 'nocode', text: 'לא נמצא בית עם הקוד הזה' });
          }
          if ([...room.players.values()].some((p) => p.name === name)) return reply({ t: 'error', code: 'taken', text: 'השם הזה כבר תפוס בבית' });
          const r = room.addPlayer(ws, { name, look: m.look });
          if (r.error) return reply({ t: 'error', code: 'full', text: r.error });
          player = r.player;
          return welcome();
        }
        if (m.t === 'resume') {
          room = manager.get(m.code);
          if (!room || typeof m.token !== 'string' || room.kicked.has(m.token)) return reply({ t: 'error', code: 'noresume', text: 'החיבור הקודם פג' });
          player = room.resume(ws, m.token);
          if (!player) return reply({ t: 'error', code: 'noresume', text: 'החיבור הקודם פג' });
          return welcome();
        }
        return;
      }
      if (m.t === 'lkToken') {
        livekitToken(room, player).then((token) => reply({ t: 'lkToken', token, url: room.voice.url })).catch(() => reply({ t: 'lkToken', token: null }));
        return;
      }
      room.onMessage(player, m);
    });

    ws.on('close', () => {
      if (room && player && player.ws === ws) room.onDisconnect(player);
    });
    ws.on('error', () => {});
  });

  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
    if (ipBuckets.size > 5000) ipBuckets.clear();
  }, 15000);

  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const addr = server.address();
      resolve({ server, wss, manager, port: addr.port, close: () => { clearInterval(hb); manager.close(); wss.close(); server.close(); } });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().then(({ port }) => {
    const v = voiceConfig();
    console.log(`\n👁️  Big Brother server on http://localhost:${port}  (voice: ${v.mode}${v.mode === 'livekit' ? ' ' + v.url : ''}, min players: ${MIN_PLAYERS})\n`);
  });
}
