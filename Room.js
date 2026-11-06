// =====================================================================
//  Room ("בית") – server authoritative game state & phase state machine
// =====================================================================
import { PHASES, PHASE_DURATIONS, PRESETS, LIMITS, MOVE, FLAG, EMOTES, REACTIONS, POWERS, SHOP, MUSIC_MOODS, PRIZE_START, SAVE_COST, SEASONS } from '../../shared/constants.js';
import { Life } from './life.js';
import {
  DOORS, buildColliders, INTERACTABLE_BY_ID, SPAWNS_LOBBY, SPAWNS_GAME, seatPositions, roomAt, ROOMS,
  ISOLATION_SPOT, EXIT_PATH, SECRET_SPOT, FURNITURE, inRect, ROOM_BY_ID,
} from '../../shared/layout.js';
import { moveHorizontal, groundAt, clampBounds, lineOfSight, inWater } from '../../shared/physics.js';
import { TASKS, TASK_BY_ID, FINALE_TASKS, SECRET_MISSIONS } from '../../shared/tasks.js';
import { introTiming } from '../../shared/intro.js';
import { sanitizeLook } from '../../shared/customization.js';
import { createTask } from './tasks.js';
import { Items, ITEM_KINDS } from './items.js';
import { Events, TWIST_DEFS, EVENT_DEFS } from './events.js';
import { dayJournal, awards } from './diary.js';
import { now, pick, shuffle, clamp, cleanText, isNum, makeId, makeToken, Bucket, rand } from '../util.js';

const P = PHASES;
const STAT_KEYS = ['talk', 'hitsGiven', 'hitsTaken', 'fightsStarted', 'fridge', 'poolTime', 'bedTime', 'sleep', 'nomsReceived', 'votesReceived',
  'taskWins', 'throws', 'wet', 'piano', 'shower', 'dances', 'cries', 'chats', 'coinsEarned', 'betrayals', 'sacrifices', 'switches', 'sabotage',
  'emotes', 'secretDone', 'romance', 'cooked', 'meals', 'outfits', 'saves', 'tanTime', 'shopping', 'unloads', 'dog', 'distance', 'diaryVisits', 'gifts', 'reactions', 'allyTime', 'packages', 'letters', 'easterEggs', 'seatsN'];
const blankStats = () => Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));

export class Room {
  constructor(manager, code, opts = {}) {
    this.manager = manager;
    this.code = code;
    this.players = new Map();
    this.hostId = null;
    this.createdAt = now();
    this.minPlayers = opts.minPlayers ?? LIMITS.MIN_PLAYERS;
    this.timeScale = opts.timeScale ?? Number(process.env.BB_TIME_SCALE || 1);
    this.settings = { preset: 'normal', intro: 'full', events: true, spy: true, season: 'normal' };
    this.voice = opts.voice || { mode: 'mesh' };
    this.kicked = new Set();
    this.resetGame();
    this.dirty = true;
    this.lastStateSent = 0;
    this.snapAcc = 0;
    this.bbStatsAcc = 0;
    this.tickHandle = setInterval(() => this.safeTick(), 50);
  }

  resetGame() {
    this.phase = { id: P.LOBBY, endsAt: 0, day: 0, data: {} };
    this.doors = Object.fromEntries(DOORS.map((d) => [d.id, { open: false, locked: d.locked }]));
    this.doors.d_bed.open = true;
    this.doors.d_yard.open = true;
    this.colliders = buildColliders(this.doors);
    this.lights = Object.fromEntries(ROOMS.map((r) => [r.id, 1]));
    this.music = 'calm';
    this.musicUntil = 0;
    this.effects = {};
    this.items = new Items(this);
    this.events = new Events(this);
    this.task = null;
    this.taskResult = null;
    this.taskChoice = null;
    this.nominations = {};
    this.nominees = [];
    this.votes = {};
    this.audienceVotes = {};
    this.evictedOrder = [];
    this.alliances = new Map();
    this.invites = new Map();
    this.pairTalk = new Map();
    this.pairTalkDay = new Map();
    this.bbId = null;
    this.bbTalk = 'none';
    this.tv = 0;
    this.drama = 10;
    this.heat = {};
    this.fights = [];
    this.flags = {};
    this.stats = {};
    this.winnerId = null;
    this.awards = null;
    this.journal = null;
    this.diaryOccupant = null;
    this.cooldowns = {};
    this.dayLog = { events: [], taskWinners: [], confessions: [], evicted: [] };
    this.life = new Life(this);
    this.prize = PRIZE_START;
    this.nextEvictionDay = 2;
    this.spawnDecor();
    for (const p of this.players.values()) this.resetPlayerForLobby(p);
  }

  spawnDecor() {
    // pillows on sofas/beds, cups/tomatoes in kitchen, a rubber duck in the pool
    const pillowSpots = [[0.0, 0.62, 2.8], [1.6, 0.62, 2.8], [-3.2, 0.62, -0.8], [4.6, 0.62, 0.4], [-16.9, 0.7, -3.9], [-12.4, 0.7, 1.8], [13, 0.75, -9.3]];
    for (const [x, y, z] of pillowSpots) this.items.spawn('pillow', x, y, z);
    for (const [x, z] of [[11.6, -2.3], [12.2, -2.0], [12.8, -2.3]]) this.items.spawn('cup', x, 1.0, z);
    for (const [x, z] of [[11.4, 2.6], [12.6, 3.0]]) this.items.spawn('tomato', x, 0.8, z);
    this.items.spawn('duck', 2, -0.12, 15);
    for (const it of this.items.map.values()) it.flying = false;
  }

  resetPlayerForLobby(p) {
    p.role = 'hg';
    p.coins = 50;
    p.powers = {};
    p.immune = false;
    p.rep = 50;
    p.rel = {};
    p.stats = blankStats();
    p.day = blankStats();
    p.held = null;
    p.spy = false;
    p.spyTarget = null;
    p.mission = null;
    p.alliance = null;
    p.isolatedUntil = 0;
    p.frozenUntil = 0;
    p.knockUntil = 0;
    p.megaUntil = 0;
    p.xrayUntil = 0;
    p.farewellUntil = 0;
    p.secretWaiting = false;
    p.evictedDay = 0;
    p.ready = false;
    p.accused = false;
    p.sabDay = -1;
    p.musicTokens = 0;
    p.funnyHatUntil = 0;
    p.seatsUsed = new Set();
    p.switchesUsed = new Set();
    p.dancesRooms = new Set();
    p.bbVote = null;
    p.volunteer = false;
    p.wetUntil = 0;
    p.peekTarget = null;
    p.emote = null;
    p.emoteUntil = 0;
    p.hunger = 80;
    p.tan = 0;
    p.burned = false;
    p.tanSpot = null;
    p.fakeDay = 0;
    const s = SPAWNS_LOBBY[[...this.players.keys()].indexOf(p.id) % SPAWNS_LOBBY.length] || SPAWNS_LOBBY[0];
    p.pos = { x: s.x, y: 0, z: s.z };
    p.yaw = Math.PI;
    p.tp = (p.tp || 0) + 1;
  }

  destroy() { clearInterval(this.tickHandle); }

  // =====================================================================
  //  Connections
  // =====================================================================
  connectedCount() { let n = 0; for (const p of this.players.values()) if (p.connected) n++; return n; }

  addPlayer(ws, { name, look }) {
    if (this.players.size >= LIMITS.MAX_PLAYERS) return { error: 'הבית מלא (16 דיירים)' };
    const p = {
      id: makeId(), token: makeToken(), name, look: sanitizeLook(look), ws, connected: true, lastSeen: now(),
      pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0, flags: 0, tp: 0, lastMoveAt: now(), speaking: false, lvl: 0,
      bucket: new Bucket(90, 200), chatBucket: new Bucket(1.2, 4), actBucket: new Bucket(8, 12), joinedAt: now(),
    };
    this.players.set(p.id, p);
    this.resetPlayerForLobby(p);
    if (!this.hostId) this.hostId = p.id;
    if (this.phase.id !== P.LOBBY) {
      // late joiner: waits in the secret room until Big Brother releases them
      p.secretWaiting = true;
      p.coins = 40;
      this.teleport(p, SECRET_SPOT.x + rand(-1, 1), SECRET_SPOT.z + rand(-0.8, 0.8));
      this.doors.d_secret.open = false; this.doors.d_secret.locked = true; this.updateColliders();
      this.toastRole('bb', `🕵️ ${p.name} מחכה בחדר הסודי. שחרר אותו בטוויסט "דייר סודי".`);
    }
    this.toast(null, `${p.name} הצטרף לבית`);
    this.markState();
    return { player: p };
  }

  resume(ws, token) {
    for (const p of this.players.values()) {
      if (p.token === token) {
        if (p.ws && p.ws !== ws) { try { p.ws.close(4000, 'replaced'); } catch {} }
        p.ws = ws; p.connected = true; p.lastSeen = now(); p.discAt = 0;
        p.tp++;
        this.markState();
        if (p.role === 'bb') this.toast(null, 'האח הגדול חזר לשליטה 👁️');
        return p;
      }
    }
    return null;
  }

  onDisconnect(p) {
    p.connected = false;
    p.discAt = now();
    p.speaking = false;
    if (p.held) this.items.drop(p);
    if (this.diaryOccupant === p.id) this.leaveDiary();
    if (p.role === 'bb' && this.phase.id !== P.LOBBY) this.toast(null, 'האח הגדול התנתק – הבית עובר לטייס אוטומטי 🤖');
    this.markState();
  }

  removePlayer(p, reason = 'left') {
    if (!this.players.has(p.id)) return;
    if (p.held) this.items.drop(p);
    const wasHG = p.role === 'hg';
    this.players.delete(p.id);
    for (const a of this.alliances.values()) a.members = a.members.filter((m) => m !== p.id);
    if (p.alliance) this.cleanAlliances();
    if (this.hostId === p.id) {
      const next = [...this.players.values()].find((q) => q.connected) || [...this.players.values()][0];
      this.hostId = next ? next.id : null;
      if (next) this.toast(null, `${next.name} הוא המארח החדש`);
    }
    if (this.bbId === p.id) { this.bbId = null; this.bbTalk = 'none'; }
    if (this.phase.id !== P.LOBBY && wasHG) {
      this.toast(null, reason === 'kicked' ? `${p.name} הוצא מהבית` : `${p.name} עזב את הבית 🚪`);
      this.nominees = this.nominees.filter((id) => id !== p.id);
      delete this.nominations[p.id];
      delete this.votes[p.id];
      this.checkEndConditions();
    }
    this.markState();
  }

  kick(host, id) {
    const p = this.players.get(id);
    if (!p || p.id === host.id) return;
    this.kicked.add(p.token);
    this.send(p, { t: 'kicked', reason: 'המארח הוציא אותך מהבית' });
    try { p.ws?.close(4001, 'kicked'); } catch {}
    this.removePlayer(p, 'kicked');
  }

  // =====================================================================
  //  Messaging helpers
  // =====================================================================
  send(p, msg) {
    if (!p.connected || !p.ws || p.ws.readyState !== 1) return;
    try { p.ws.send(JSON.stringify(msg)); } catch {}
  }
  broadcast(msg, filter) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (!p.connected || !p.ws || p.ws.readyState !== 1) continue;
      if (filter && !filter(p)) continue;
      try { p.ws.send(s); } catch {}
    }
  }
  toast(target, text, kind = 'info') {
    const m = { t: 'ev', k: 'toast', text, kind };
    if (target) this.send(target, m); else this.broadcast(m);
  }
  toastRole(role, text) { this.broadcast({ t: 'ev', k: 'toast', text, kind: 'bb' }, (p) => p.role === role); }
  announce(text, opts = {}) { this.broadcast({ t: 'ev', k: 'announce', text, from: opts.from || 'sys', sound: opts.sound || 'chime', voice: opts.voice !== false }); }
  speak(text) { this.broadcast({ t: 'ev', k: 'tts', text }); }
  sfx(s, pos, only) {
    const m = { t: 'ev', k: 'sfx', s, pos: pos ? [pos.x, pos.y ?? 1, pos.z] : null };
    if (only) this.send(only, m); else this.broadcast(m);
  }
  markState() { this.dirty = true; }
  markTask() { this.dirty = true; }
  names(ids) { return ids.map((id) => this.players.get(id)?.name).filter(Boolean).join(', '); }

  // =====================================================================
  //  Queries
  // =====================================================================
  alive() { return [...this.players.values()].filter((p) => p.role === 'hg'); }
  participants() { return this.alive().filter((p) => !p.secretWaiting); }
  ghosts() { return [...this.players.values()].filter((p) => p.role === 'ghost'); }
  bb() { return this.bbId ? this.players.get(this.bbId) : null; }
  bbActive() { const b = this.bb(); return !!(b && b.connected); }
  isIsolated(p) { return p.isolatedUntil > now(); }
  interPos(id) { const i = INTERACTABLE_BY_ID[id]; return i ? { x: i.x, y: i.y, z: i.z } : null; }
  near(p, interId, r) {
    const i = INTERACTABLE_BY_ID[interId];
    if (!i) return false;
    return Math.hypot(p.pos.x - i.x, p.pos.z - i.z) <= r;
  }
  roomOf(p) { return roomAt(p.pos.x, p.pos.z); }
  updateColliders() { this.colliders = buildColliders(this.doors); this.markState(); }

  // =====================================================================
  //  Stats / relations / economy
  // =====================================================================
  stat(p, key, n = 1) {
    if (!p || !p.stats) return;
    p.stats[key] = (p.stats[key] || 0) + n;
    p.day[key] = (p.day[key] || 0) + n;
  }
  rep(p, n) { if (p) p.rep = clamp(p.rep + n, 0, 100); }
  relation(a, b, n) {
    if (!a || !b || a === b) return;
    a.rel[b.id] = clamp((a.rel[b.id] || 0) + n, -100, 100);
  }
  giveCoins(p, n) {
    if (!p) return;
    p.coins = Math.max(0, Math.min(9999, p.coins + n));
    if (n > 0) this.stat(p, 'coinsEarned', n);
    this.markState();
  }
  givePower(p, id) {
    if (!p || !POWERS[id]) return;
    p.powers[id] = (p.powers[id] || 0) + 1;
    this.send(p, { t: 'ev', k: 'toast', text: `קיבלת כוח: ${POWERS[id].icon} ${POWERS[id].label}`, kind: 'gold' });
    this.markState();
  }
  addDrama(n) { this.drama = clamp(this.drama + n, 0, 100); }
  pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
  topPairs(n = 5, day = false) {
    const m = day ? this.pairTalkDay : this.pairTalk;
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => [...k.split('|'), Math.round(v)]);
  }
  distinctPartners(id) {
    let n = 0;
    for (const [k, v] of this.pairTalk) if (v > 10 && k.split('|').includes(id)) n++;
    return n;
  }
  allies(p) {
    const a = p.alliance && this.alliances.get(p.alliance);
    return a ? a.members.filter((m) => m !== p.id) : [];
  }
  cleanAlliances() {
    for (const [id, a] of this.alliances) {
      a.members = a.members.filter((m) => this.players.get(m)?.role === 'hg');
      if (a.members.length < 2) {
        for (const m of a.members) { const pp = this.players.get(m); if (pp) pp.alliance = null; }
        this.alliances.delete(id);
      }
    }
  }

  // =====================================================================
  //  Effects
  // =====================================================================
  applyEffect(kind, value, seconds) {
    this.effects[kind] = { v: value, until: now() + seconds * 1000 };
    if (kind === 'lockDoors') this.updateColliders();
    this.markState();
  }
  effect(kind) { const e = this.effects[kind]; return e && e.until > now() ? e.v : null; }
  setMusic(mood, seconds = 0) {
    if (!MUSIC_MOODS.includes(mood)) return;
    this.music = mood;
    this.musicUntil = seconds ? now() + seconds * 1000 : 0;
    this.markState();
  }
  baseMusic() {
    const id = this.phase.id;
    if (id === P.EVICTION_VOTE || id === P.REVEAL || id === P.FINAL_VOTE) return 'tense';
    if (id === P.EVICTION) return 'dramatic';
    if (id === P.TASK || id === P.FINALE_TASK) return 'happy';
    if (id === P.SUMMARY || id === P.GAME_OVER) return 'calm';
    return 'calm';
  }

  teleport(p, x, z, y = null, yaw = null) {
    p.pos = { x, y: y ?? groundAt(x, z, 3, this.colliders), z };
    if (yaw !== null) p.yaw = yaw;
    p.tp++;
    p.lastMoveAt = now();
    this.send(p, { t: 'tp', p: [p.pos.x, p.pos.y, p.pos.z], tp: p.tp, yaw: yaw ?? p.yaw });
  }
  freeze(p, until) { p.frozenUntil = until; p.frozenPos = { ...p.pos }; }
  isolate(p, seconds, reason) {
    if (p.role !== 'hg') return;
    p.isolatedUntil = now() + seconds * 1000;
    if (p.held) this.items.drop(p);
    this.teleport(p, ISOLATION_SPOT.x + rand(-0.5, 0.5), ISOLATION_SPOT.z);
    this.doors.d_iso.open = false; this.doors.d_iso.locked = true; this.updateColliders();
    this.announce(`🚨 ${p.name} נשלח לחדר הבידוד ל-${seconds} שניות${reason ? ' – ' + reason : ''}.`, { sound: 'alarm' });
    this.rep(p, -3);
  }

  // =====================================================================
  //  Phase machine
  // =====================================================================
  dur(id) { return PHASE_DURATIONS[id] * PRESETS[this.settings.preset] * this.timeScale; }

  evictionInterval() {
    const n = this.participants().length;
    let e = (SEASONS[this.settings.season] || SEASONS.normal).every;
    if (n <= 5) e += 1;
    if (n <= 3) e = 1;
    return Math.max(1, e);
  }
  isEvictionDay() { return this.phase.day >= this.nextEvictionDay; }
  isBudgetDay() { return this.phase.day === 1 || (this.phase.day - 1) % 3 === 0; }

  setPhase(id, seconds, data = {}) {
    this.phase = { id, day: this.phase.day, endsAt: seconds > 0 ? now() + seconds * 1000 : 0, startedAt: now(), data };
    this.markState();
    this.broadcast({ t: 'ev', k: 'phase', id, day: this.phase.day });
  }

  startGame(host) {
    if (this.phase.id !== P.LOBBY) return;
    if (host.id !== this.hostId) return;
    const ps = [...this.players.values()].filter((p) => p.connected);
    if (ps.length < this.minPlayers) return this.toast(host, `צריך לפחות ${this.minPlayers} שחקנים`);
    // choose Big Brother: votes, volunteers break ties
    const votes = {};
    for (const p of ps) if (p.bbVote && this.players.get(p.bbVote)?.connected) votes[p.bbVote] = (votes[p.bbVote] || 0) + 1;
    let bb = null;
    const cand = ps.map((p) => ({ p, v: votes[p.id] || 0, vol: p.volunteer ? 1 : 0, r: Math.random() }));
    cand.sort((a, b) => b.v - a.v || b.vol - a.vol || a.r - b.r);
    bb = cand[0].p;
    // keep stats of existing players but reset game state
    const players = [...this.players.values()];
    this.resetGame();
    this.players = new Map(players.map((p) => [p.id, p]));
    for (const p of this.players.values()) this.resetPlayerForLobby(p);
    for (const p of [...this.players.values()]) if (!p.connected) this.players.delete(p.id);
    bb.role = 'bb';
    this.bbId = bb.id;
    const hgs = this.alive();
    if (this.settings.spy && hgs.length >= 4) {
      const spy = pick(hgs);
      spy.spy = true;
      spy.spyTarget = pick(hgs.filter((p) => p !== spy)).id;
    }
    this.phase.day = 1;
    this.nextEvictionDay = this.evictionInterval();
    const order = shuffle(hgs.map((p) => p.id));
    this.setPhase(P.INTRO, 0, { order, mode: this.settings.intro, waiting: true, waitStart: now(), timing: introTiming(order.length, this.settings.intro) });
    this.announceRoles();
    if (this.settings.intro === 'off') this.endIntro();
  }

  announceRoles() {
    for (const p of this.players.values()) {
      if (p.role === 'bb') this.send(p, { t: 'ev', k: 'role', role: 'bb' });
      else this.send(p, { t: 'ev', k: 'role', role: 'hg', spy: p.spy, spyTarget: p.spyTarget && this.players.get(p.spyTarget)?.name });
    }
  }

  onReady(p) {
    p.ready = true;
    this.markState();
  }

  checkIntroStart() {
    const d = this.phase.data;
    if (!d.waiting) return;
    const conn = [...this.players.values()].filter((p) => p.connected);
    const allReady = conn.every((p) => p.ready);
    if (allReady || now() - d.waitStart > 20000) {
      d.waiting = false;
      d.startAt = now() + 1500;
      this.phase.endsAt = d.startAt + d.timing.total * 1000 * this.timeScale + 400;
      this.markState();
    }
  }

  skipIntro(p) {
    if (this.phase.id !== P.INTRO || p.id !== this.hostId) return;
    this.broadcast({ t: 'ev', k: 'introSkip' });
    this.phase.endsAt = now() + 2600;
    this.phase.data.waiting = false;
    this.phase.data.skipped = true;
    this.markState();
  }

  endIntro() {
    // place houseguests at distinct spawn points
    const hgs = this.alive();
    const spawns = shuffle(SPAWNS_GAME);
    hgs.forEach((p, i) => { const s = spawns[i % spawns.length]; this.teleport(p, s.x, s.z, null, rand(-Math.PI, Math.PI)); });
    this.startMorning();
  }

  startMorning() {
    this.dayLog = { events: [], taskWinners: [], confessions: [], evicted: [] };
    this.pairTalkDay = new Map();
    for (const p of this.players.values()) { p.day = blankStats(); p.immune = false; }
    for (const p of this.alive()) if (p.secretWaiting && this.phase.day > 1) p.secretWaiting = false;
    this.taskChoice = null;
    this.nominations = {};
    this.nominees = [];
    this.votes = {};
    this.audienceVotes = {};
    this.lights = Object.fromEntries(ROOMS.map((r) => [r.id, 1]));
    this.setMusic('happy', 25);
    this.setPhase(P.MORNING, this.dur('morning'));
    const left = this.nextEvictionDay - this.phase.day;
    this.announce(`☀️ בוקר טוב דיירים! יום ${this.phase.day} בבית האח הגדול.${left <= 0 ? ' הלילה... ליל פינוי.' : left === 1 ? ' מחר ליל פינוי.' : ''}`, { sound: 'morning' });
    for (const p of this.alive()) { p.burned = false; p.tan = 0; }
    this.life.onMorning(this.phase.day);
    for (const p of [...this.players.values()]) if (p.role === 'fake' && this.phase.day >= p.fakeDay + 2) this.returnFake(p);
    // secret missions
    const missions = shuffle(SECRET_MISSIONS);
    this.participants().forEach((p, i) => {
      const m = missions[i % missions.length];
      p.mission = { id: m.id, text: m.text, auto: m.auto, n: m.n || 1, judged: !!m.judged, done: false, progress: 0 };
      this.send(p, { t: 'ev', k: 'mission', text: m.text });
    });
    if (this.settings.events && Math.random() < 0.45 && this.phase.day > 1) setTimeout(() => { if (this.phase.id === P.MORNING) this.events.randomDaily(); }, 6000);
  }

  chooseTask(id, custom) {
    if (custom) {
      this.taskChoice = { id: 'custom', kind: 'judged', cat: 'social', dur: 90, title: custom.title, desc: custom.desc, params: {}, reward: { coins: 40 } };
      return true;
    }
    const def = TASK_BY_ID[id];
    if (!def) return false;
    this.taskChoice = def;
    return true;
  }

  autoTask() {
    const n = this.participants().length;
    let pool = TASKS.filter((t) => t.cat !== 'punishment' && t.kind !== 'dilemma' && t.kind !== 'judged');
    if (n < 3) pool = pool.filter((t) => !['vote', 'dance', 'hideseek', 'cook'].includes(t.kind));
    const used = this.usedTasks || (this.usedTasks = new Set());
    const fresh = pool.filter((t) => !used.has(t.id));
    return pick(fresh.length ? fresh : pool);
  }

  startTask(def, finale = false) {
    (this.usedTasks ||= new Set()).add(def.id);
    this.task = createTask(this, def);
    this.task.start();
    this.taskResult = null;
    const d = Math.max(1, Math.round(def.dur * (this.settings.preset === 'short' ? 0.8 : 1) * this.timeScale));
    this.setPhase(finale ? P.FINALE_TASK : P.TASK, d, { taskId: def.id, finale });
    this.announce(`📋 משימה: ${def.title}`, { sound: 'task' });
    this.speak(def.title + '. ' + def.desc);
    this.setMusic(def.cat === 'punishment' ? 'tense' : 'happy', d);
  }

  endTask() {
    const t = this.task;
    if (!t) return;
    const res = t.finish();
    t.cleanup();
    const def = t.def;
    res.title = def.title;
    if (t.sabotaged && res.coop && res.success) { res.success = false; res.winners = []; res.text += ' ...אבל מישהו חיבל במשימה! 🕵️'; }
    const winners = res.winners.map((id) => this.players.get(id)).filter(Boolean);
    const r = def.reward || {};
    if (res.coop) {
      if (res.success) for (const p of winners) { this.giveCoins(p, r.coins || 30); this.rep(p, 1); }
    } else {
      for (const p of t.part()) this.giveCoins(p, 10);
      for (const p of winners) {
        this.giveCoins(p, r.coins || 30);
        this.stat(p, 'taskWins');
        if (r.immunity) { p.immune = true; this.toast(null, `🛡️ ${p.name} זכה בחסינות להיום!`, 'gold'); }
        if (r.power) this.givePower(p, r.power);
      }
      this.dayLog.taskWinners.push(...res.winners);
    }
    res.names = Object.fromEntries(t.part().map((p) => [p.id, p.name]));
    this.taskResult = res;
    this.task = null;
    this.broadcast({ t: 'ev', k: 'taskResult', res });
    this.addDrama(5);
    return res;
  }

  startFree() {
    this.setPhase(P.FREE, this.dur('free'));
    this.announce('🕶️ שעת חופש. תסתובבו, תרכלו, תתכננו. האח הגדול רואה הכול.', { sound: 'chime' });
    this.setMusic('calm');
    if (this.settings.events && Math.random() < 0.55) {
      const at = rand(20, 60) * 1000;
      setTimeout(() => { if (this.phase.id === P.FREE && (!this.bbActive() || Math.random() < 0.5)) this.events.randomDaily(); }, at);
    }
  }

  startConfession() {
    this.setPhase(P.CONFESSION, this.dur('confession'));
    this.announce('🎙️ חדר הוידוי פתוח. כל דייר נכנס, מתיישב בכיסא ומגיש שני מועמדים לפינוי.', { sound: 'chime' });
    this.doors.d_diary.locked = false; this.updateColliders();
    this.setMusic('tense');
  }

  startNomination() {
    const missing = this.participants().filter((p) => !this.nominations[p.id] && p.connected);
    if (!missing.length) return this.startReveal();
    this.setPhase(P.NOMINATION, this.dur('nomination'), { remote: true });
    for (const p of missing) this.send(p, { t: 'ev', k: 'nominateNow' });
  }

  computeNominees() {
    const cands = this.participants().filter((p) => !p.immune);
    const counts = {};
    for (const [voter, n] of Object.entries(this.nominations)) {
      if (this.players.get(voter)?.role !== 'hg') continue;
      for (const id of [n.a, n.b]) if (this.players.get(id)?.role === 'hg') counts[id] = (counts[id] || 0) + 1;
    }
    const immuneUsed = [];
    let sorted = cands.map((p) => ({ id: p.id, c: counts[p.id] || 0, r: Math.random() })).sort((a, b) => b.c - a.c || a.r - b.r);
    // immunity power auto-use
    const want = this.flags.doubleEviction ? 3 : 2;
    let picks = sorted.filter((x) => x.c > 0).slice(0, want + 2);
    const out = [];
    for (const x of picks) {
      if (out.length >= want) {
        // ties with the last place join
        if (out.length < 3 && x.c === out[out.length - 1].c) out.push(x);
        continue;
      }
      const p = this.players.get(x.id);
      if (p.powers.immunity > 0) { p.powers.immunity--; immuneUsed.push(p.id); continue; }
      out.push(x);
    }
    if (out.length < 2) {
      const rest = sorted.filter((x) => !out.includes(x) && !immuneUsed.includes(x.id));
      while (out.length < Math.min(2, cands.length) && rest.length) out.push(rest.shift());
    }
    for (const x of out) this.stat(this.players.get(x.id), 'nomsReceived', x.c);
    return { nominees: out.map((x) => x.id), counts, immuneUsed };
  }

  startReveal() {
    const { nominees, counts, immuneUsed } = this.computeNominees();
    this.nominees = nominees;
    for (const id of immuneUsed) this.toast(null, `🛡️ ${this.players.get(id)?.name} השתמש בחסינות!`, 'gold');
    const order = Object.entries(counts).filter(([id]) => this.players.get(id)?.role === 'hg').map(([id, c]) => ({ id, c })).sort((a, b) => a.c - b.c);
    this.setPhase(P.REVEAL, this.dur('reveal'), { order, nominees, immuneUsed });
    this.announce(`המועמדים לפינוי הם... ${this.names(nominees)}`, { sound: 'sting', voice: false });
    this.addDrama(15);
    // betrayals: nominated an ally
    for (const [voter, n] of Object.entries(this.nominations)) {
      const v = this.players.get(voter);
      if (!v) continue;
      for (const id of [n.a, n.b]) if (this.allies(v).includes(id)) { this.stat(v, 'betrayals'); this.rep(v, -2); }
    }
  }

  startEvictionVote() {
    const alive = this.participants();
    const voters = alive.filter((p) => !this.nominees.includes(p.id));
    this.votes = {};
    this.audienceVotes = {};
    // gather everyone in the living room on the sofas
    const seats = shuffle(seatPositions());
    const nomSeats = seats.filter((s) => Math.abs(s.z - 2.6) < 0.2);
    let si = 0;
    for (const p of alive) {
      if (this.isIsolated(p)) p.isolatedUntil = 0;
      const s = this.nominees.includes(p.id) && nomSeats.length ? nomSeats.shift() : seats.filter((x) => !nomSeats.includes(x))[si++] || { x: rand(-5, 5), z: 4.8, y: 0, yaw: 0 };
      this.teleport(p, s.x, s.z, s.y, s.yaw);
      this.send(p, { t: 'ev', k: 'sit', x: s.x, z: s.z, y: s.y, yaw: s.yaw });
    }
    this.setPhase(P.EVICTION_VOTE, this.dur('evictionVote'), { nominees: this.nominees, voters: voters.map((p) => p.id), dark: !!this.flags.blackoutVote });
    this.flags.blackoutVote = false;
    this.setMusic('tense');
    this.announce('🔴 ליל הפינוי. הדיירים שאינם מועמדים – הצביעו את מי לפנות.', { sound: 'sting' });
  }

  tallyEviction() {
    const counts = {};
    for (const id of this.nominees) counts[id] = 0;
    for (const v of Object.values(this.votes)) if (counts[v] !== undefined) counts[v]++;
    // audience (ghosts) collectively adds 1 vote to their plurality
    const aud = {};
    for (const v of Object.values(this.audienceVotes)) if (counts[v] !== undefined) aud[v] = (aud[v] || 0) + 1;
    const audTop = Object.entries(aud).sort((a, b) => b[1] - a[1]);
    if (audTop.length && (audTop.length === 1 || audTop[0][1] > audTop[1][1])) counts[audTop[0][0]] += 1;
    return counts;
  }

  finishEvictionVote() {
    const counts = this.tallyEviction();
    if (!Object.keys(counts).length) return this.startSummary();
    const n = this.flags.doubleEviction && this.alive().length >= 5 ? 2 : 1;
    this.flags.doubleEviction = false;
    this.pendingN = n;
    if (this.bbActive()) {
      this.setPhase(P.BB_DECISION, this.dur('bbDecision'), { nominees: this.nominees, n, counts, canFake: !this.flags.fakeUsed && this.participants().length > 3 });
      this.announce('🗳️ הדיירים הצביעו... אבל ההחלטה הסופית – של האח הגדול.', { sound: 'sting' });
      return;
    }
    this.startEviction(this.byVotes(counts, n), counts);
  }

  byVotes(counts, n) {
    return Object.entries(counts).map(([id, c]) => ({ id, c, r: Math.random() })).sort((a, b) => b.c - a.c || a.r - b.r).slice(0, n).map((x) => x.id);
  }

  startEviction(ids, counts) {
    const evicted = ids.map((id) => this.players.get(id)).filter(Boolean);
    for (const p of evicted) this.dayLog.evicted.push({ id: p.id, votes: counts?.[p.id] || 0 });
    for (const [vid, v] of Object.entries(this.votes)) {
      const voter = this.players.get(vid);
      if (voter && this.allies(voter).includes(v)) { this.stat(voter, 'betrayals'); this.rep(voter, -2); }
      const target = this.players.get(v);
      if (target) { this.stat(target, 'votesReceived'); this.relation(target, voter, -10); }
    }
    this.doors.d_exit.open = true; this.doors.d_exit.locked = false; this.updateColliders();
    evicted.forEach((p, i) => {
      if (p.held) this.items.drop(p);
      this.teleport(p, EXIT_PATH[0].x + i * 0.8 - (evicted.length - 1) * 0.4, EXIT_PATH[0].z, 0, 0);
      p.farewellUntil = now() + this.dur('eviction') * 1000;
    });
    this.setPhase(P.EVICTION, this.dur('eviction'), { evicted: ids, saveAvailable: !this.flags.saveUsed });
    this.announce(`🚪 ${this.names(ids)}... ${ids.length > 1 ? 'אתם מפונים' : 'את/ה מפונה'} מבית האח הגדול. יש לך זמן לנאום פרידה.`, { sound: 'evict' });
    this.addDrama(25);
    this.setMusic('dramatic');
  }

  finishEviction() {
    const ids = (this.phase.data.evicted || []).filter((id) => this.players.get(id));
    if (!ids.length) {
      this.doors.d_exit.open = false; this.doors.d_exit.locked = true; this.updateColliders();
      return this.startSummary();
    }
    for (const id of ids) {
      const p = this.players.get(id);
      const fake = this.flags.fakePending === id;
      p.role = fake ? 'fake' : 'ghost';
      p.evictedDay = this.phase.day;
      p.farewellUntil = 0;
      if (p.held) this.items.drop(p);
      this.evictedOrder.push(id);
      this.teleport(p, 0.7, -3.5, 1.2);
      if (fake) {
        this.flags.fakeUsed = true; this.flags.fakePending = null; p.fakeDay = this.phase.day;
        this.send(p, { t: 'ev', k: 'role', role: 'fake' });
        this.toastRole('bb', `🎭 ${p.name} בהדחה מזויפת. החזר אותו מלשונית הדיירים (או אוטומטית בעוד יומיים).`);
        continue;
      }
      this.send(p, { t: 'ev', k: 'role', role: 'ghost' });
      if (p.spy) { this.flags.spyExposed = true; this.announce(`🕵️ ${p.name} היה המרגל!`, { sound: 'sting' }); }
      for (const s of this.alive()) {
        if (s.spy && s.spyTarget === id) {
          this.giveCoins(s, 100);
          s.immune = true;
          this.send(s, { t: 'ev', k: 'toast', text: '🕵️ המטרה שלך פונתה! +100 מטבעות וחסינות. מטרה חדשה בדרך...', kind: 'gold' });
          const nt = pick(this.alive().filter((x) => x !== s));
          s.spyTarget = nt ? nt.id : null;
          this.send(s, { t: 'ev', k: 'role', role: 'hg', spy: true, spyTarget: nt?.name });
        }
      }
    }
    this.cleanAlliances();
    this.doors.d_exit.open = false; this.doors.d_exit.locked = true; this.updateColliders();
    this.setPhase(P.EXIT_SCENE, (4 + 8.5 * ids.length) * this.timeScale, { ids, startAt: now() + 400 });
    this.setMusic('dramatic');
  }

  romanceOk(a, b) {
    if (!a || !b || a === b || a.role !== 'hg' || b.role !== 'hg') return 'לא אפשרי';
    if ([P.INTRO, P.EVICTION, P.EVICTION_VOTE, P.BB_DECISION, P.EXIT_SCENE, P.REVEAL, P.LOBBY].includes(this.phase.id)) return 'לא עכשיו...';
    const room = this.roomOf(a);
    if (!['bedroom', 'secret'].includes(room) || this.roomOf(b) !== room) return 'זה קורה רק בחדר השינה (או בחדר הסודי) 🛏️';
    if ((this.lights[room] ?? 1) > 0.5 && !this.effect('dark')) return 'קודם מכבים את האור 💡';
    if (Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) > 3) return 'צריך להיות קרובים';
    if (a.romanceUntil > now() || b.romanceUntil > now()) return 'כבר עסוקים 🙈';
    return null;
  }
  onRomance(p, m) {
    const t = this.players.get(m.id);
    const why = this.romanceOk(p, t);
    if (why) return this.toast(p, why);
    (this.romanceInv ||= new Map()).set(t.id, { from: p.id, at: now() });
    this.send(t, { t: 'ev', k: 'romanceInvite', from: p.id, name: p.name });
    this.toast(p, `💌 הזמנת את ${t.name} מתחת לשמיכה... מחכים לתשובה`);
  }
  onRomanceAccept(p, m) {
    const inv = this.romanceInv?.get(p.id);
    if (!inv || inv.from !== m.from || now() - inv.at > 30000) return;
    this.romanceInv.delete(p.id);
    const a = this.players.get(inv.from);
    if (!m.yes) return a && this.toast(a, `${p.name} אמר/ה "לא הערב" 🙅`);
    const why = this.romanceOk(a, p);
    if (why) return this.toast(p, why);
    let bed = null, bd = Infinity;
    for (const f of FURNITURE) {
      if (f.type !== 'bed' && f.type !== 'roundBed') continue;
      const d = Math.hypot(f.x - a.pos.x, f.z - a.pos.z);
      if (d < bd) { bd = d; bed = f; }
    }
    if (!bed) return;
    const until = now() + 20000;
    for (const q of [a, p]) {
      q.romanceUntil = until; q.romanceWith = q === a ? p.id : a.id;
      if (q.held) this.items.drop(q);
      this.teleport(q, bed.x, bed.z, 0.55);
    }
    this.broadcast({ t: 'ev', k: 'romance', a: a.id, b: p.id, x: bed.x, z: bed.z, until });
    this.toastRole('bb', `🙈 משהו קורה מתחת לשמיכה (${a.name} ו${p.name}). המצלמות... מתעלמות.`);
    this.stat(a, 'romance'); this.stat(p, 'romance');
    this.relation(a, p, 25); this.relation(p, a, 25);
    this.addDrama(12);
    this.dayLog.romance = [...(this.dayLog.romance || []), [a.name, p.name]];
  }

  onSave(p) {
    if (this.phase.id !== P.EVICTION) return this.toast(p, '🆘 כפתור ה-SAVE עובד רק בזמן פינוי, לפני שהמודח עוזב את הבית');
    if (this.flags.saveUsed) return this.toast(p, '🆘 כפתור ה-SAVE כבר נוצל העונה');
    const ids = this.phase.data.evicted || [];
    if (!ids.length || ids.includes(p.id)) return this.toast(p, 'אי אפשר להציל את עצמך 🙂');
    const saved = this.players.get(ids[0]);
    if (!saved) return;
    this.flags.saveUsed = true;
    this.prize = Math.max(0, this.prize - SAVE_COST);
    this.phase.data.evicted = ids.slice(1);
    this.phase.data.saveAvailable = false;
    if (this.flags.fakePending === saved.id) this.flags.fakePending = null;
    saved.farewellUntil = 0;
    this.dayLog.evicted = this.dayLog.evicted.filter((e) => e.id !== saved.id);
    this.teleport(saved, 0.7, -1.5, null, Math.PI);
    this.stat(p, 'saves');
    this.rep(p, 8);
    this.relation(saved, p, 40);
    this.addDrama(40);
    this.broadcast({ t: 'ev', k: 'saved', by: p.id, id: saved.id });
    this.announce(`🆘 ${p.name} לחץ/ה על SAVE! ${saved.name} חוזר/ת לבית! הפרס ירד ל-₪${this.prize.toLocaleString('en-US')}`, { sound: 'sting' });
    if (!this.phase.data.evicted.length) this.phase.endsAt = now() + 4000;
    this.markState();
  }

  returnFake(p) {
    if (!p || p.role !== 'fake') return;
    p.role = 'hg';
    this.evictedOrder = this.evictedOrder.filter((id) => id !== p.id);
    this.doors.d_exit.open = true; this.doors.d_exit.locked = false; this.updateColliders();
    this.flags.exitCloseAt = now() + 15000;
    this.teleport(p, 0.7, -11.5, 1.2, 0);
    this.send(p, { t: 'ev', k: 'role', role: 'hg', returned: true });
    this.announce(`😱 הפתעה!!! ${p.name} לא באמת הודח/ה... ${p.name} חוזר/ת לבית! (וראה/תה הכול)`, { sound: 'sting' });
    this.addDrama(35);
    this.markState();
  }

  startSummary() {
    if (['exitScene', 'eviction', 'evictionVote', 'bbDecision', 'reveal', 'nomination'].includes(this.phase.id)) this.nextEvictionDay = this.phase.day + this.evictionInterval();
    this.life.delivery?.arrived && this.life.unload(null);
    this.journal = { day: this.phase.day, lines: dayJournal(this) };
    this.setPhase(P.SUMMARY, this.dur('summary'), { journal: this.journal });
    this.setMusic('calm');
  }

  afterSummary() {
    const alive = this.alive();
    if (alive.length <= 1) return this.gameOver(alive[0]?.id);
    if (alive.length === 2) return this.startFinale();
    this.phase.day++;
    this.startMorning();
  }

  startFinale() {
    this.phase.day++;
    const id = pick(FINALE_TASKS);
    this.announce('🏁 הגמר! משימת הגמר תכריע מי מקבל קול בונוס.', { sound: 'sting' });
    this.startTask(TASK_BY_ID[id], true);
  }

  startFinalVote(taskWinner) {
    const finalists = this.alive().map((p) => p.id);
    this.flags.finaleWinner = taskWinner || null;
    this.votes = {};
    this.setPhase(P.FINAL_VOTE, this.dur('finalVote'), { finalists, taskWinner: taskWinner || null });
    this.announce('🗳️ הצבעת הגמר: הקהל (הדיירים שפונו) והאח הגדול בוחרים את המנצח!', { sound: 'sting' });
    this.setMusic('tense');
    if (!this.ghosts().length && !this.bbActive()) this.phase.endsAt = now() + 3000;
  }

  finishFinalVote() {
    const f = this.phase.data.finalists;
    const counts = Object.fromEntries(f.map((id) => [id, 0]));
    for (const v of Object.values(this.votes)) if (counts[v] !== undefined) counts[v]++;
    if (this.flags.finaleWinner && counts[this.flags.finaleWinner] !== undefined) counts[this.flags.finaleWinner] += 1;
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    let winner = sorted[0]?.[0];
    if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) winner = this.flags.finaleWinner || pick(f);
    this.gameOver(winner, counts);
  }

  gameOver(winnerId, counts) {
    this.winnerId = winnerId || null;
    this.awards = awards(this);
    const w = this.players.get(winnerId);
    this.setPhase(P.GAME_OVER, 0, { winner: winnerId, counts, awards: this.awards });
    this.announce(w ? `🏆 ${w.name} הוא/היא המנצח/ת של העונה!` : 'העונה הסתיימה.', { sound: 'win' });
    this.setMusic('party');
    this.applyEffect('party', true, 600);
  }

  backToLobby(p) {
    if (p.id !== this.hostId || this.phase.id !== P.GAME_OVER) return;
    const players = [...this.players.values()];
    this.resetGame();
    for (const q of players) this.resetPlayerForLobby(q);
    this.markState();
  }

  surpriseEviction() {
    this.nextEvictionDay = Math.min(this.nextEvictionDay, this.phase.day);
    if (![P.FREE, P.MORNING, P.TASK].includes(this.phase.id) || this.alive().length < 3) return false;
    if (this.task) this.endTask();
    this.announce('🚪 פינוי פתע! כל דייר מגיש עכשיו שני מועמדים – מכל מקום בבית.', { sound: 'alarm' });
    this.nominations = {};
    this.setPhase(P.NOMINATION, 25, { remote: true, surprise: true });
    for (const p of this.participants()) this.send(p, { t: 'ev', k: 'nominateNow' });
    return true;
  }

  checkEndConditions() {
    if ([P.LOBBY, P.GAME_OVER].includes(this.phase.id)) return;
    const alive = this.alive();
    if (alive.length <= 1 && this.phase.id !== P.EVICTION) this.gameOver(alive[0]?.id);
  }

  onPhaseEnd() {
    switch (this.phase.id) {
      case P.INTRO: return this.endIntro();
      case P.MORNING: {
        let def = this.taskChoice || this.autoTask();
        return this.startTask(def);
      }
      case P.TASK: this.endTask(); if (this.isBudgetDay()) { this.setPhase(P.BUDGET, this.dur('budget')); this.life.startMeeting(); this.setMusic('happy'); return; } return this.startFree();
      case P.BUDGET: this.life.endMeeting(); return this.startFree();
      case P.FINALE_TASK: { const r = this.endTask(); return this.startFinalVote(r?.winners?.[0]); }
      case P.FREE: return this.participants().length <= 2 ? this.startFinale() : this.isEvictionDay() ? this.startConfession() : this.startSummary();
      case P.CONFESSION: if (this.diaryOccupant) this.leaveDiary(); return this.startNomination();
      case P.NOMINATION: return this.startReveal();
      case P.REVEAL: return this.startEvictionVote();
      case P.EVICTION_VOTE: return this.finishEvictionVote();
      case P.BB_DECISION: return this.startEviction(this.byVotes(this.phase.data.counts, this.phase.data.n), this.phase.data.counts);
      case P.EVICTION: return this.finishEviction();
      case P.EXIT_SCENE: return this.startSummary();
      case P.SUMMARY: return this.afterSummary();
      case P.FINAL_VOTE: return this.finishFinalVote();
    }
  }

  // =====================================================================
  //  Tick
  // =====================================================================
  safeTick() {
    try { this.tick(0.05); } catch (e) { console.error('[room tick]', this.code, e); }
  }

  tick(dt) {
    const t = now();
    // phase timing
    if (this.phase.id === P.INTRO) this.checkIntroStart();
    if (this.phase.endsAt && t >= this.phase.endsAt) this.onPhaseEnd();
    if (this.task) {
      this.task.t += dt;
      this.task.tick(dt);
      if (this.task?.done && (this.phase.id === P.TASK || this.phase.id === P.FINALE_TASK)) {
        if (!this.task.doneAt) { this.task.doneAt = t; this.phase.endsAt = Math.min(this.phase.endsAt, t + 1200); this.markState(); }
      }
    }
    this.items.tick(dt);
    this.events.tick(dt);
    this.life.tick(dt);
    if (this.flags.exitCloseAt && t > this.flags.exitCloseAt) { this.flags.exitCloseAt = 0; this.doors.d_exit.open = false; this.doors.d_exit.locked = true; this.updateColliders(); }

    // effects expiry
    for (const [k, e] of Object.entries(this.effects)) {
      if (e.until <= t) { delete this.effects[k]; if (k === 'lockDoors') this.updateColliders(); this.markState(); }
    }
    if (this.musicUntil && t > this.musicUntil) { this.musicUntil = 0; this.music = this.baseMusic(); this.markState(); }

    // per-player upkeep and stats
    const alive = this.alive();
    for (const p of this.players.values()) {
      if (p.role === 'hg') {
        if (p.isolatedUntil && p.isolatedUntil <= t) {
          p.isolatedUntil = 0;
          this.teleport(p, 5.7, -4.6);
          this.toast(p, 'יצאת מהבידוד. תתנהג יפה.');
          this.markState();
        }
        const room = this.roomOf(p);
        if (inWater(p.pos.x, p.pos.z) && p.pos.y < 0) {
          this.stat(p, 'poolTime', dt);
          if (this.effect('heat') && this.events.heatPaid && !this.events.heatPaid.has(p.id)) { this.events.heatPaid.add(p.id); this.giveCoins(p, 15); this.toast(p, '🥵 +15 מטבעות על הצינון!'); }
        }
        if (room === 'bedroom') this.stat(p, 'bedTime', dt);
        if (p.flags & FLAG.SLEEP) this.stat(p, 'sleep', dt);
        if (p.speaking) this.stat(p, 'talk', dt);
        if (p.alliance) this.stat(p, 'allyTime', dt);
        // diary occupancy: leaving the chair unlocks the door
        if (this.diaryOccupant === p.id && Math.hypot(p.pos.x + 5, p.pos.z + 10.4) > 1.3) this.leaveDiary();
        this.checkMission(p);
      }
      // stale disconnected players
      if (!p.connected && p.discAt) {
        const limit = this.phase.id === P.LOBBY ? 25000 : 180000;
        if (t - p.discAt > limit) this.removePlayer(p, 'timeout');
      }
    }
    // pair talk matrix (speaker near listener)
    for (const a of alive) {
      if (!a.speaking) continue;
      for (const b of alive) {
        if (a === b) continue;
        if ((a.pos.x - b.pos.x) ** 2 + (a.pos.z - b.pos.z) ** 2 < 16) {
          const k = this.pairKey(a.id, b.id);
          this.pairTalk.set(k, (this.pairTalk.get(k) || 0) + dt);
          this.pairTalkDay.set(k, (this.pairTalkDay.get(k) || 0) + dt);
          this.relation(a, b, dt * 0.15);
        }
      }
    }
    // drama & heat
    this.drama = Math.max(0, this.drama - dt * 0.25);
    this.heat = {};
    for (const p of alive) {
      const r = this.roomOf(p);
      if (!r) continue;
      this.heat[r] = (this.heat[r] || 0) + (p.speaking ? 1 : 0.15);
    }
    const loud = Object.values(this.heat).some((h) => h >= 3);
    if (loud) this.addDrama(dt * 0.6);

    // farewell-walk: auto-move the evictee into the corridor near the end
    if (this.phase.id === P.EVICTION && this.phase.endsAt - t < 3500) {
      for (const id of this.phase.data.evicted || []) {
        const p = this.players.get(id);
        if (p && !p.walked) { p.walked = true; this.send(p, { t: 'ev', k: 'exitWalk' }); }
      }
    }

    // network
    this.snapAcc += dt;
    if (this.snapAcc >= 1 / MOVE.SNAP_HZ - 0.001) { this.snapAcc = 0; this.sendSnapshots(); }
    if (this.dirty && t - this.lastStateSent > 90) { this.dirty = false; this.lastStateSent = t; this.sendStates(); }
    this.bbStatsAcc += dt;
    if (this.bbStatsAcc > 1.5) { this.bbStatsAcc = 0; this.sendBBStats(); }
  }

  checkMission(p) {
    const m = p.mission;
    if (!m || m.done || !m.auto) return;
    const val = {
      fridge: p.day.fridge, poolTime: p.day.poolTime, switches: p.switchesUsed.size, seats: p.seatsUsed.size, hits: p.day.hitsGiven,
      piano: p.day.piano, shower: p.day.shower, dog: p.day.dog, dances: p.dancesRooms.size,
    }[m.auto] || 0;
    m.progress = Math.floor(val);
    if (val >= m.n) this.completeMission(p);
  }
  completeMission(p) {
    const m = p.mission;
    if (!m || m.done) return;
    m.done = true;
    this.giveCoins(p, 35);
    this.stat(p, 'secretDone');
    this.send(p, { t: 'ev', k: 'toast', text: '🤫 המשימה החשאית הושלמה! +35 מטבעות', kind: 'gold' });
    this.toastRole('bb', `🤫 ${p.name} השלים משימה חשאית`);
    this.markState();
  }

  // =====================================================================
  //  Network serialization
  // =====================================================================
  sendSnapshots() {
    const ts = now();
    const hg = [], gh = [];
    for (const p of this.players.values()) {
      if (p.role === 'bb') continue;
      let f = p.flags & ~(FLAG.SPEAK | FLAG.OFFLINE | FLAG.ISOLATED | FLAG.KNOCKED);
      if (p.speaking) f |= FLAG.SPEAK;
      if (!p.connected) f |= FLAG.OFFLINE;
      if (this.isIsolated(p)) f |= FLAG.ISOLATED;
      if (p.knockUntil > ts) f |= FLAG.KNOCKED;
      const row = [p.id, r2(p.pos.x), r2(p.pos.y), r2(p.pos.z), r2(p.yaw), r2(p.pitch), f, p.speaking ? Math.round(p.lvl * 100) : 0];
      (p.role === 'hg' ? hg : gh).push(row);
    }
    const items = this.items.flyingSnap();
    const dog = this.events.dogSnap();
    const base = { t: 's', ts, items, dog };
    const sHG = JSON.stringify({ ...base, p: hg });
    const sAll = JSON.stringify({ ...base, p: hg.concat(gh) });
    for (const p of this.players.values()) {
      if (!p.connected || !p.ws || p.ws.readyState !== 1) continue;
      if (p.ws.bufferedAmount > 256 * 1024) continue; // slow client – skip this frame
      try { p.ws.send(p.role === 'hg' ? sHG : sAll); } catch {}
    }
  }

  publicPlayer(p, viewer) {
    const o = {
      id: p.id, name: p.name, look: p.look, role: p.role === 'fake' && viewer.role !== 'bb' ? 'ghost' : p.role, burned: p.burned, hungry: p.role === 'hg' && p.hunger < 25,
      connected: p.connected, host: p.id === this.hostId, coins: p.coins, immune: p.immune || (p.powers?.immunity > 0 && viewer.id === p.id),
      held: p.held ? this.items.get(p.held)?.kind : null, iso: this.isIsolated(p), wet: p.wetUntil > now(),
      mega: p.megaUntil > now() || p.farewellUntil > now(), hat: p.funnyHatUntil > now() ? 'giant' : null, waiting: p.secretWaiting,
      ready: p.ready, evictedDay: p.evictedDay || 0,
    };
    if (this.phase.id === P.LOBBY) { o.volunteer = p.volunteer; o.bbVotes = [...this.players.values()].filter((q) => q.bbVote === p.id).length; }
    if (viewer.role === 'bb' || viewer.role === 'ghost') { o.rep = Math.round(p.rep); o.spy = viewer.role === 'bb' ? p.spy : undefined; o.alliance = p.alliance; o.powers = p.powers; }
    return o;
  }

  stateFor(v) {
    const t = now();
    const ph = this.phase;
    let data = { ...ph.data };
    if (ph.id === P.NOMINATION || ph.id === P.CONFESSION) data.done = Object.keys(this.nominations);
    if (ph.id === P.BB_DECISION && v.role !== 'bb') { data = { ...data }; delete data.counts; delete data.canFake; }
    if (ph.id === P.EVICTION_VOTE) { data.voted = Object.keys(this.votes); data.myVote = this.votes[v.id] || this.audienceVotes[v.id] || null; if (data.counts && v.role !== 'bb') delete data.counts; }
    if (ph.id === P.FINAL_VOTE) { data.voted = Object.keys(this.votes); data.myVote = this.votes[v.id] || null; }
    const task = this.task ? {
      id: this.task.def.id, kind: this.task.def.kind, title: this.task.def.title, desc: this.task.def.desc, cat: this.task.def.cat,
      pub: this.task.pub(), priv: v.role === 'hg' ? this.task.priv(v) : null, bb: v.role === 'bb' && this.task.bbPriv ? this.task.bbPriv() : null,
      parts: this.task.parts, sabotaged: v.role === 'bb' ? this.task.sabotaged : undefined,
    } : null;
    const s = {
      t: 'state', serverTime: t, code: this.code, hostId: this.hostId, minPlayers: this.minPlayers, settings: this.settings,
      phase: { id: ph.id, day: ph.day, endsAt: ph.endsAt, data }, players: [...this.players.values()].map((p) => this.publicPlayer(p, v)),
      doors: this.doors, lights: this.lights, music: this.music, tv: this.tv, effects: this.publicEffects(v),
      items: this.items.list(), task, taskResult: this.phase.id === P.FREE && this.phase.endsAt - t > this.dur('free') * 1000 - 9000 ? this.taskResult : null,
      nominees: this.nominees, bb: { id: this.bbId, connected: this.bbActive(), talk: this.bbTalk }, evicted: this.evictedOrder,
      diaryOccupant: this.diaryOccupant, prize: this.prize, saveUsed: !!this.flags.saveUsed, nextEvictionDay: this.nextEvictionDay, life: this.life.publicState(),
      you: this.youState(v),
    };
    if (v.role === 'bb') {
      s.bbData = {
        nominations: this.nominations, votes: this.votes, audienceVotes: this.audienceVotes, taskChoice: this.taskChoice?.id || null,
        twistCooldowns: this.events.cooldowns, alliances: [...this.alliances.values()],
        missions: Object.fromEntries(this.alive().map((p) => [p.id, p.mission])),
        spy: this.alive().find((p) => p.spy)?.id || null,
        fakes: [...this.players.values()].filter((p) => p.role === 'fake').map((p) => p.id), fakeUsed: !!this.flags.fakeUsed,
      };
    }
    if (v.role === 'ghost') s.ghostData = { audienceVotes: Object.keys(this.audienceVotes) };
    if (ph.id === P.GAME_OVER) s.awards = this.awards;
    return s;
  }

  publicEffects(v) {
    const o = {};
    for (const [k, e] of Object.entries(this.effects)) {
      if (e.until <= now()) continue;
      if (k === 'voicePersonal') { o.voicePersonal = e.v; o.voicePersonalUntil = e.until; continue; }
      o[k] = { v: e.v, until: e.until };
    }
    return o;
  }

  youState(p) {
    const ally = p.alliance && this.alliances.get(p.alliance);
    return {
      id: p.id, role: p.role, coins: p.coins, powers: p.powers, immune: p.immune, tp: p.tp, pos: [r2(p.pos.x), r2(p.pos.y), r2(p.pos.z)], yaw: r2(p.yaw), spy: p.spy,
      spyTarget: p.spy ? this.players.get(p.spyTarget)?.name : null, sabUsed: p.sabDay === this.phase.day,
      mission: p.mission ? { text: p.mission.text, done: p.mission.done, progress: p.mission.progress, n: p.mission.n, auto: !!p.mission.auto } : null,
      alliance: ally ? { id: ally.id, members: ally.members } : null, invite: this.invites.get(p.id) || null,
      nominated: !!this.nominations[p.id], isolatedUntil: p.isolatedUntil, megaUntil: Math.max(p.megaUntil, p.farewellUntil), xrayUntil: p.xrayUntil,
      musicTokens: p.musicTokens, accused: p.accused, bbVote: p.bbVote, volunteer: p.volunteer, secretWaiting: p.secretWaiting,
      inDiary: this.diaryOccupant === p.id, hunger: Math.round(p.hunger), burned: p.burned, tan: Math.round(p.tan), peek: p.peekResult || null, held: p.held ? this.items.get(p.held)?.kind : null,
    };
  }

  sendStates() {
    for (const p of this.players.values()) if (p.connected) this.send(p, this.stateFor(p));
  }

  sendBBStats() {
    const bb = this.bb();
    if (!bb || !bb.connected) return;
    const rooms = {};
    for (const p of this.alive()) { const r = this.roomOf(p) || '?'; (rooms[r] ||= []).push(p.id); }
    this.send(bb, {
      t: 'bbStats', drama: Math.round(this.drama), heat: this.heat, rooms, pairs: this.topPairs(6),
      fights: this.fights.slice(-6), talk: Object.fromEntries(this.alive().map((p) => [p.id, Math.round(p.stats.talk)])),
    });
  }

  // =====================================================================
  //  Message handling
  // =====================================================================
  onMessage(p, m) {
    if (!p.bucket.take()) return;
    const t = m.t;
    const ph = this.phase.id;
    const isHG = p.role === 'hg';
    switch (t) {
      case 'ping': return this.send(p, { t: 'pong', c: m.c, s: now() });
      case 'move': return this.onMove(p, m);
      case 'speak': {
        const muted = this.effect('muted');
        const allowed = p.role !== 'fake' && !(Array.isArray(muted) && muted.includes(p.id)) && !(ph === P.INTRO && p.role !== 'bb');
        p.speaking = !!m.on && allowed;
        p.lvl = isNum(m.lvl) ? clamp(m.lvl, 0, 1) : 0;
        return;
      }
      case 'chat': return this.onChat(p, m);
      case 'emote': return this.onEmote(p, m);
      case 'react': {
        if (p.role !== 'ghost' || !REACTIONS.includes(m.e) || !p.chatBucket.take(0.5)) return;
        this.stat(p, 'reactions');
        return this.broadcast({ t: 'ev', k: 'react', e: m.e, room: this.roomOf(p) || 'living', from: p.name });
      }
      case 'ready': return this.onReady(p);
      case 'interact': return isHG && this.onInteract(p, m);
      case 'stand': if (this.diaryOccupant === p.id) this.leaveDiary(); return;
      case 'pickup': if (isHG && !this.isIsolated(p) && typeof m.id === 'string') { this.items.pickup(p, m.id); } return;
      case 'drop': if (isHG) this.items.drop(p); return;
      case 'throw': if (isHG && p.actBucket.take()) this.items.throw(p, m.dir); return;
      case 'attack': return isHG && this.onAttack(p, m);
      case 'taskInput': {
        if (!this.task || !p.actBucket.take()) return;
        if (p.role === 'bb' || isHG) this.task.onInput(p, m.d || {});
        this.markTask();
        return;
      }
      // ---- lobby ----
      case 'bbVote': if (ph === P.LOBBY && (m.id === null || this.players.has(m.id))) { p.bbVote = m.id; this.markState(); } return;
      case 'volunteer': if (ph === P.LOBBY) { p.volunteer = !!m.on; this.markState(); } return;
      case 'start': return this.startGame(p);
      case 'settings': return this.onSettings(p, m);
      case 'kick': if (p.id === this.hostId) this.kick(p, m.id); return;
      case 'skipIntro': return this.skipIntro(p);
      case 'lobbyAgain': return this.backToLobby(p);
      case 'look':
        if (ph === P.LOBBY || (isHG && (this.near(p, 'closet', 3) || this.near(p, 'closet2', 3)))) {
          const old = p.look; p.look = sanitizeLook(m.look);
          if (ph !== P.LOBBY && JSON.stringify(old) !== JSON.stringify(p.look)) { this.stat(p, 'outfits'); this.broadcast({ t: 'ev', k: 'outfit', pid: p.id }); }
          this.markState();
        }
        return;
      case 'romance': return isHG && this.onRomance(p, m);
      case 'romanceAccept': return isHG && this.onRomanceAccept(p, m);
      case 'cart': if (isHG) this.life.cartChange(p, m.id, m.d); return;
      case 'fridgeTake': if (isHG) this.life.take(p, m.id, m.mode === 'hold' ? 'hold' : 'eat'); return;
      case 'eat': if (isHG) this.life.eatHeld(p); return;
      case 'cook': if (isHG) this.life.cook(p, m.id); return;
      // ---- game ----
      case 'nominate': return this.onNominate(p, m);
      case 'confess': return this.onConfess(p, m);
      case 'vote': return this.onVote(p, m);
      case 'buy': return isHG && this.onBuy(p, m);
      case 'setMusic': if (isHG && p.musicTokens > 0 && MUSIC_MOODS.includes(m.mood)) { p.musicTokens--; this.setMusic(m.mood, 120); this.toast(null, `🎵 ${p.name} שינה את המוזיקה`); } return;
      case 'usePower': return isHG && this.onUsePower(p, m);
      case 'gift': return isHG && this.onGift(p, m);
      case 'allyInvite': return isHG && this.onAllyInvite(p, m);
      case 'allyAccept': return isHG && this.onAllyAccept(p, m);
      case 'allyLeave': return isHG && this.onAllyLeave(p);
      case 'sabotage': return isHG && this.onSabotage(p);
      case 'accuse': return isHG && this.onAccuse(p, m);
      case 'bb': return p.role === 'bb' && this.onBB(p, m);
      case 'assignBB': return this.onAssignBB(p, m);
      case 'rtc': {
        // P2P voice signaling relay (mesh fallback)
        const to = this.players.get(m.to);
        if (!to || typeof m.d !== 'object') return;
        return this.send(to, { t: 'rtc', from: p.id, d: m.d });
      }
      case 'leave': return this.removePlayer(p, 'left');
    }
  }

  onSettings(p, m) {
    if (p.id !== this.hostId || this.phase.id !== P.LOBBY) return;
    const s = m.s || {};
    if (PRESETS[s.preset]) this.settings.preset = s.preset;
    if (['full', 'short', 'off'].includes(s.intro)) this.settings.intro = s.intro;
    if (typeof s.events === 'boolean') this.settings.events = s.events;
    if (typeof s.spy === 'boolean') this.settings.spy = s.spy;
    if (SEASONS[s.season]) this.settings.season = s.season;
    this.markState();
  }

  onMove(p, m) {
    if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(isNum)) return;
    if (m.tp !== p.tp) return; // stale – before a teleport
    const t = now();
    const dt = clamp((t - p.lastMoveAt) / 1000, 0.016, 0.75);
    p.lastMoveAt = t;
    if (isNum(m.yaw)) p.yaw = m.yaw;
    if (isNum(m.pitch)) p.pitch = clamp(m.pitch, -1.6, 1.6);
    p.flags = Number.isInteger(m.f) ? m.f & (FLAG.CROUCH | FLAG.RUN | FLAG.SIT | FLAG.SWIM | FLAG.SLEEP | FLAG.AIR) : 0;
    let [nx, ny, nz] = m.p;
    if (p.role === 'bb') return;
    if (p.role === 'ghost') {
      const q = { x: nx, z: nz };
      clampBounds(q);
      p.pos = { x: q.x, y: clamp(ny, -1, 9), z: q.z };
      return;
    }
    if (this.phase.id === P.INTRO) return;
    if (p.frozenUntil > t) {
      if (Math.hypot(nx - p.frozenPos.x, nz - p.frozenPos.z) > 0.3) this.correct(p, p.frozenPos);
      return;
    }
    const slow = this.effect('slow') ? 0.55 : 1;
    const maxSp = (p.knockUntil > t ? 13 : MOVE.RUN * 1.3 * slow);
    let dx = nx - p.pos.x, dz = nz - p.pos.z;
    const d = Math.hypot(dx, dz);
    const allowed = maxSp * dt + 0.45;
    let corrected = false;
    if (d > allowed) { dx *= allowed / d; dz *= allowed / d; corrected = true; }
    const q = { x: p.pos.x, z: p.pos.z };
    moveHorizontal(q, dx, dz, Math.max(p.pos.y, ny), this.colliders);
    clampBounds(q);
    if (Math.hypot(q.x - nx, q.z - nz) > 0.35) corrected = true;
    const g = groundAt(q.x, q.z, Math.max(ny, p.pos.y) + 0.1, this.colliders);
    if (ny > g + 2.7) { ny = g; corrected = true; }
    if (ny < g - 0.6) ny = g;
    // isolation / secret room / eviction confinement
    const room = roomAt(q.x, q.z);
    if (this.isIsolated(p) && room !== 'isolation') { this.teleport(p, ISOLATION_SPOT.x, ISOLATION_SPOT.z); return; }
    const walked = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
    if (walked < 3) this.stat(p, 'distance', walked);
    p.pos = { x: q.x, y: ny, z: q.z };
    if (corrected) this.correct(p, p.pos);
  }

  correct(p, pos) {
    const t = now();
    if (t - (p.lastCorrect || 0) < 120) return;
    p.lastCorrect = t;
    this.send(p, { t: 'correct', p: [pos.x, pos.y, pos.z], tp: p.tp });
  }

  onChat(p, m) {
    const text = cleanText(m.text, LIMITS.CHAT_MAX);
    if (!text || !p.chatBucket.take()) return;
    this.stat(p, 'chats');
    if (p.role === 'fake') return this.broadcast({ t: 'ev', k: 'chat', from: p.id, name: p.name + ' (מזויף)', text, ch: 'ghost', role: 'fake' }, (q) => q.role === 'bb' || q === p);
    const ch = p.role === 'ghost' ? 'ghost' : 'house';
    const msg = { t: 'ev', k: 'chat', from: p.id, name: p.name, text, ch, role: p.role };
    if (ch === 'ghost') this.broadcast(msg, (q) => q.role !== 'hg' || this.phase.id === P.LOBBY || this.phase.id === P.GAME_OVER);
    else this.broadcast(msg);
    // easter egg
    if (/^האח הגדול\??$/.test(text)) setTimeout(() => this.announce('כן? 👁️', { sound: 'chime' }), 900);
  }

  onEmote(p, m) {
    const e = EMOTES.find((x) => x.id === m.id);
    if (!e || !p.actBucket.take()) return;
    p.emote = e.id;
    p.emoteUntil = now() + (e.id === 'dance' ? 6000 : 3000);
    this.stat(p, 'emotes');
    if (e.id === 'dance') { this.stat(p, 'dances'); p.dancesRooms.add(this.roomOf(p)); }
    if (e.id === 'cry') this.stat(p, 'cries');
    this.broadcast({ t: 'ev', k: 'emote', pid: p.id, id: e.id });
  }

  onInteract(p, m) {
    const inter = INTERACTABLE_BY_ID[m.id];
    if (!inter || !p.actBucket.take()) return;
    if (Math.hypot(p.pos.x - inter.x, p.pos.z - inter.z) > inter.r + 0.9) return;
    if (this.isIsolated(p) && inter.type !== 'switch') return;
    if (this.task && this.task.onInteract(p, inter)) return;
    switch (inter.type) {
      case 'door': {
        const d = this.doors[inter.id];
        if (!d) return;
        if (d.locked || this.effect('lockDoors')) { this.sfx('locked', inter, p); return this.toast(p, '🔒 הדלת נעולה'); }
        d.open = !d.open;
        this.updateColliders();
        this.sfx(d.open ? 'doorOpen' : 'doorClose', inter);
        return;
      }
      case 'fridge':
        this.sfx('fridge', inter);
        this.broadcast({ t: 'ev', k: 'fridge' });
        return this.send(p, { t: 'ev', k: 'openFridge' });
      case 'tablet': return this.send(p, { t: 'ev', k: 'openTablet' });
      case 'closet': return this.send(p, { t: 'ev', k: 'openCloset' });
      case 'delivery': return this.life.unload(p);
      case 'save': return this.onSave(p);
      case 'grill': return this.life.grillCook(p);
      case 'lounger': p.tanSpot = { x: inter.x, z: inter.z }; this.stat(p, 'seatsN'); return;
      case 'tv': this.tv = (this.tv + 1) % 5; this.markState(); return this.sfx('click', inter);
      case 'switch': {
        const r = inter.room;
        if (this.effect('dark')) return this.toast(p, 'אין חשמל! ⚡');
        if (this.flags.lightsLocked?.[r]) return this.toast(p, 'האח הגדול נעל את האור כאן 👁️');
        this.lights[r] = this.lights[r] > 0.5 ? 0.12 : 1;
        p.switchesUsed.add(r);
        this.stat(p, 'switches');
        this.markState();
        return this.sfx('click', inter);
      }
      case 'diaryChair': return this.enterDiary(p);
      case 'piano': this.stat(p, 'piano'); return this.broadcast({ t: 'ev', k: 'piano', n: Math.floor(Math.random() * 12), pos: [inter.x, inter.y, inter.z] });
      case 'shower': this.stat(p, 'shower'); return this.broadcast({ t: 'ev', k: 'shower', id: inter.id });
      case 'dog': {
        const dog = this.events.dog;
        this.stat(p, 'dog');
        if (dog && Math.hypot(dog.x - p.pos.x, dog.z - p.pos.z) < 3) { this.broadcast({ t: 'ev', k: 'dogWag' }); this.toast(p, '🐶 הכלב שמח!'); }
        else this.toast(p, 'בית הכלב ריק... בינתיים.');
        return;
      }
      case 'speaker':
        if (p.musicTokens > 0) return this.send(p, { t: 'ev', k: 'musicPicker' });
        return this.toast(p, '🎵 קנה "בחירת מוזיקה" בחנות כדי לבחור שיר');
      case 'easter': return this.events.goldenEye(p);
      case 'easter2': this.broadcast({ t: 'ev', k: 'eyeBlink' }); this.toastRole('bb', `👁️ ${p.name} נגע בפוסטר העין במקלחות`); return;
      case 'bike': this.toast(p, '🚴 רכבת קצת. +1 כושר.'); this.stat(p, 'distance', 20); return;
      case 'seat': case 'bed':
        p.seatsUsed.add(inter.id);
        this.stat(p, 'seatsN');
        return;
      case 'mailbox': {
        const letter = [...this.items.map.values()].find((it) => it.kind === 'letter');
        if (letter) return this.events.readLetter(p, letter);
        return this.toast(p, 'התיבה ריקה. אולי מחר.');
      }
      case 'shop': return this.send(p, { t: 'ev', k: 'openShop' });
      case 'keypad': return this.send(p, { t: 'ev', k: 'openKeypad' });
      case 'pot': return this.send(p, { t: 'ev', k: 'openStove' });
    }
  }

  enterDiary(p) {
    if (this.diaryOccupant && this.diaryOccupant !== p.id) return this.toast(p, 'מישהו כבר בכיסא');
    this.diaryOccupant = p.id;
    this.doors.d_diary.open = false; this.doors.d_diary.locked = true; this.updateColliders();
    this.stat(p, 'diaryVisits');
    this.send(p, { t: 'ev', k: 'diaryOpen', canNominate: [P.CONFESSION, P.NOMINATION].includes(this.phase.id) && !this.nominations[p.id] });
    this.toastRole('bb', `🎙️ ${p.name} נכנס לחדר הוידוי`);
    this.markState();
  }
  leaveDiary() {
    this.diaryOccupant = null;
    this.doors.d_diary.locked = false; this.doors.d_diary.open = true; this.updateColliders();
  }

  onNominate(p, m) {
    if (p.role !== 'hg' || p.secretWaiting) return;
    const ph = this.phase.id;
    const inDiary = this.diaryOccupant === p.id;
    if (!(ph === P.NOMINATION || (ph === P.CONFESSION && inDiary))) return this.toast(p, 'אפשר להגיש מועמדים רק מכיסא הוידוי');
    if (this.nominations[p.id]) return;
    const a = this.players.get(m.a), b = this.players.get(m.b);
    if (!a || !b || a === b || a === p || b === p || a.role !== 'hg' || b.role !== 'hg') return this.toast(p, 'בחירה לא חוקית');
    this.nominations[p.id] = { a: a.id, b: b.id, ra: cleanText(m.ra, LIMITS.REASON_MAX), rb: cleanText(m.rb, LIMITS.REASON_MAX) };
    this.relation(a, p, -8); this.relation(b, p, -8);
    this.toast(p, '✅ המועמדויות נקלטו. האח הגדול מודה לך.');
    this.toastRole('bb', `🗳️ ${p.name} העמיד את ${a.name} ו${b.name}`);
    this.markState();
    const need = this.participants().filter((q) => q.connected);
    if (need.every((q) => this.nominations[q.id])) this.phase.endsAt = Math.min(this.phase.endsAt, now() + 2500);
  }

  onConfess(p, m) {
    const text = cleanText(m.text, 200);
    if (!text || this.diaryOccupant !== p.id) return;
    if (m.share) this.dayLog.confessions.push(text);
    this.broadcast({ t: 'ev', k: 'confession', from: p.id, name: p.name, text }, (q) => q.role === 'bb');
    this.toast(p, '🤫 הוידוי נשמר. האח הגדול שמע.');
  }

  onVote(p, m) {
    const ph = this.phase.id;
    if (ph === P.EVICTION_VOTE) {
      const d = this.phase.data;
      if (d.tiebreak) return;
      if (!this.nominees.includes(m.id)) return;
      if (p.role === 'ghost') { this.audienceVotes[p.id] = m.id; this.markState(); return; }
      if (p.role !== 'hg' || this.nominees.includes(p.id) || this.votes[p.id]) return;
      this.votes[p.id] = m.id;
      for (const q of this.alive()) if (q.peekTarget === p.id) { q.peekResult = { who: p.name, vote: this.players.get(m.id)?.name }; this.send(q, { t: 'ev', k: 'toast', text: `👁️ ${p.name} הצביע נגד ${this.players.get(m.id)?.name}`, kind: 'gold' }); }
      this.markState();
      const voters = d.voters.map((id) => this.players.get(id)).filter((q) => q && q.connected && q.role === 'hg');
      if (voters.every((q) => this.votes[q.id])) this.phase.endsAt = Math.min(this.phase.endsAt, now() + 2500);
    } else if (ph === P.FINAL_VOTE) {
      if (!(p.role === 'ghost' || p.role === 'bb')) return;
      if (!this.phase.data.finalists.includes(m.id) || this.votes[p.id]) return;
      this.votes[p.id] = m.id;
      this.markState();
      const voters = [...this.players.values()].filter((q) => (q.role === 'ghost' || q.role === 'bb') && q.connected);
      if (voters.every((q) => this.votes[q.id])) this.phase.endsAt = Math.min(this.phase.endsAt, now() + 2000);
    }
  }

  onAttack(p, m) {
    const t = now();
    if ((p.atkCd || 0) > t || this.isIsolated(p) || p.secretWaiting) return;
    if ([P.INTRO, P.EVICTION_VOTE, P.REVEAL, P.BB_DECISION, P.EXIT_SCENE].includes(this.phase.id)) return;
    p.atkCd = t + 650;
    const heldKind = p.held && this.items.get(p.held)?.kind;
    const kind = heldKind === 'pillow' ? 'pillow' : m.kind === 'punch' ? 'punch' : 'push';
    // hide & seek tagging uses the attack button for the seeker
    if (this.task?.def.kind === 'hideseek' && this.task.seeker === p.id) {
      const tgt = this.findTarget(p, 2.8);
      if (tgt) this.task.onInput(p, { tag: tgt.id });
      return;
    }
    const tgt = this.findTarget(p, kind === 'pillow' ? 2.3 : 1.9);
    this.broadcast({ t: 'ev', k: 'swing', pid: p.id, kind });
    if (!tgt) return;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const power = kind === 'punch' ? 7 : kind === 'pillow' ? 6 : 5;
    const fall = kind === 'punch' ? Math.random() < 0.7 : kind === 'pillow' ? Math.random() < 0.35 : Math.random() < 0.15;
    tgt.knockUntil = t + 1300;
    this.send(tgt, { t: 'knock', vx: fx * power, vz: fz * power, fall, from: p.id });
    this.broadcast({ t: 'ev', k: 'hit', a: p.id, b: tgt.id, kind, fall });
    if (tgt.held && (fall || kind !== 'push')) this.items.drop(tgt, true);
    this.registerFight(p, tgt, kind);
    this.task?.onHit(p, tgt, kind);
  }

  findTarget(p, range) {
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bd = Infinity;
    for (const q of this.alive()) {
      if (q === p || this.isIsolated(q) || q.secretWaiting) continue;
      const dx = q.pos.x - p.pos.x, dz = q.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) continue;
      if ((dx * fx + dz * fz) / d < 0.45) continue;
      if (Math.abs(q.pos.y - p.pos.y) > 1.5) continue;
      if (!lineOfSight(p.pos.x, p.pos.z, q.pos.x, q.pos.z, this.colliders)) continue;
      if (d < bd) { bd = d; best = q; }
    }
    return best;
  }

  registerFight(a, b, kind) {
    const t = now();
    this.stat(a, 'hitsGiven'); this.stat(b, 'hitsTaken');
    this.relation(b, a, -4);
    const key = this.pairKey(a.id, b.id);
    const f = (this.fightMap ||= new Map()).get(key);
    const taskFight = this.task && ['pillow', 'koth'].includes(this.task.def.kind);
    if (!f || t - f.last > 20000) {
      if (!taskFight) {
        this.stat(a, 'fightsStarted');
        this.rep(a, -3);
        this.addDrama(8);
        this.fights.push({ a: a.id, b: b.id, an: a.name, bn: b.name, room: this.roomOf(a), at: t, kind });
        if (this.fights.length > 30) this.fights.shift();
        this.toastRole('bb', `🥊 ${a.name} התחיל קטטה עם ${b.name} (${ROOM_BY_ID[this.roomOf(a)]?.name || ''})`);
        this.broadcast({ t: 'ev', k: 'fightAlert', a: a.id, b: b.id, room: this.roomOf(a) }, (q) => q.role === 'bb');
      }
      this.fightMap.set(key, { first: a.id, last: t });
    } else f.last = t;
    this.addDrama(1);
  }

  onItemHit(it, target) {
    const thrower = this.players.get(it.thrower);
    const k = it.kind;
    if (k === 'baton' || k === 'crown' || k === 'puzzle' || k === 'sock') {
      if (!target.held) { this.items.give(target, it); if (this.task) this.task.onPickup(target, it); this.sfx('catch', target.pos); return; }
    }
    this.broadcast({ t: 'ev', k: 'hit', a: thrower?.id, b: target.id, kind: 'throw', item: k, fall: k === 'pillow' && Math.random() < 0.3 });
    if (k === 'cup') { target.wetUntil = now() + 8000; this.stat(target, 'wet'); this.items.remove(it.id); this.broadcast({ t: 'ev', k: 'splash', pid: target.id }); }
    else if (['tomato', 'snack', 'ingredient', 'egg'].includes(k)) { this.items.remove(it.id); this.broadcast({ t: 'ev', k: 'splat', pid: target.id, item: k }); }
    else if (k === 'pillow') {
      const vx = it.vx * 0.4, vz = it.vz * 0.4;
      target.knockUntil = now() + 1000;
      this.send(target, { t: 'knock', vx, vz, fall: false, from: thrower?.id });
      if (thrower && this.task) this.task.onHit(thrower, target, 'pillow');
    }
    if (thrower) this.registerFight(thrower, target, 'throw');
    this.markState();
  }

  onBuy(p, m) {
    const item = SHOP.find((s) => s.id === m.id);
    if (!item) return;
    if (!this.near(p, 'shop', 3)) return this.toast(p, 'צריך לעמוד ליד מכונת החנות');
    if (p.coins < item.price) return this.toast(p, 'אין מספיק מטבעות 🪙');
    p.coins -= item.price;
    switch (item.id) {
      case 'snack': this.broadcast({ t: 'ev', k: 'emote', pid: p.id, id: 'love' }); this.sfx('crunch', p.pos); this.rep(p, 1); break;
      case 'hat_funny': p.funnyHatUntil = now() + 180000; break;
      case 'music': p.musicTokens++; this.send(p, { t: 'ev', k: 'musicPicker' }); break;
      case 'megaphone': case 'xray': case 'peek': case 'veto': this.givePower(p, item.id); break;
      case 'party': this.events.trigger('party'); this.toast(null, `🪩 ${p.name} קנה מסיבה לכל הבית!`); break;
    }
    this.sfx('coin', p.pos, p);
    this.toast(p, `קנית: ${item.icon} ${item.label}`);
    this.markState();
  }

  onUsePower(p, m) {
    const id = m.id;
    if (!(p.powers[id] > 0)) return;
    const ph = this.phase.id;
    const use = () => { p.powers[id]--; this.markState(); };
    switch (id) {
      case 'xray': use(); p.xrayUntil = now() + 10000; this.toast(p, '🩻 ראיית רנטגן פעילה!'); return;
      case 'megaphone': use(); p.megaUntil = now() + 12000; this.toast(null, `📣 ${p.name} תפס את המגפון!`); return;
      case 'peek': {
        if (ph !== P.EVICTION_VOTE) return this.toast(p, 'אפשר להשתמש בהצצה רק בליל הפינוי');
        const t = this.players.get(m.target);
        if (!t || t.role !== 'hg' || t === p) return;
        use(); p.peekTarget = t.id;
        if (this.votes[t.id]) { p.peekResult = { who: t.name, vote: this.players.get(this.votes[t.id])?.name }; this.toast(p, `👁️ ${t.name} הצביע נגד ${p.peekResult.vote}`, 'gold'); }
        else this.toast(p, `👁️ תראה למי ${t.name} מצביע ברגע שיצביע`);
        return;
      }
      case 'veto': case 'swap': {
        if (ph !== P.REVEAL) return this.toast(p, 'אפשר להשתמש רק בזמן חשיפת המועמדים');
        const t = this.players.get(m.target);
        if (!t || !this.nominees.includes(t.id)) return this.toast(p, 'בחר מועמד');
        let repl = null;
        if (id === 'swap') {
          repl = this.players.get(m.with);
          if (!repl || repl.role !== 'hg' || this.nominees.includes(repl.id) || repl.immune || repl === p) return this.toast(p, 'בחר מחליף חוקי');
        } else {
          const { counts } = this.computeNominees();
          const cands = this.participants().filter((q) => !this.nominees.includes(q.id) && !q.immune && q !== t && q !== p);
          cands.sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0) || Math.random() - 0.5);
          repl = cands[0] || null;
        }
        use();
        this.nominees = this.nominees.filter((x) => x !== t.id);
        if (repl) this.nominees.push(repl.id);
        this.phase.data.nominees = this.nominees;
        this.announce(`${POWERS[id].icon} ${p.name} השתמש ב${POWERS[id].label}! ${t.name} ניצל${repl ? ` ו${repl.name} נכנס במקומו` : ''}!`, { sound: 'sting' });
        this.addDrama(18);
        this.markState();
        return;
      }
      case 'immunity': return this.toast(p, '🛡️ החסינות תופעל אוטומטית אם יעמידו אותך');
    }
  }

  onGift(p, m) {
    const to = this.players.get(m.to);
    const n = Math.floor(m.n);
    if (!to || to === p || to.role !== 'hg' || !(n > 0) || n > p.coins) return;
    if (Math.hypot(to.pos.x - p.pos.x, to.pos.z - p.pos.z) > 3.5) return this.toast(p, 'צריך לעמוד קרוב');
    p.coins -= n; this.giveCoins(to, n);
    this.stat(p, 'gifts'); this.relation(to, p, 10); this.rep(p, 2);
    this.toast(to, `🎁 ${p.name} נתן לך ${n} מטבעות`);
    this.toast(p, `🎁 נתת ${n} מטבעות ל${to.name}`);
    this.markState();
  }

  onAllyInvite(p, m) {
    const to = this.players.get(m.id);
    if (!to || to === p || to.role !== 'hg') return;
    if (Math.hypot(to.pos.x - p.pos.x, to.pos.z - p.pos.z) > 4.5) return this.toast(p, 'צריך לעמוד קרוב כדי להציע ברית');
    if (p.alliance && p.alliance === to.alliance) return;
    this.invites.set(to.id, { from: p.id, name: p.name, at: now() });
    this.send(to, { t: 'ev', k: 'allyInvite', from: p.id, name: p.name });
    this.toast(p, `🤝 הצעת ברית נשלחה ל${to.name}`);
    this.markState();
  }
  onAllyAccept(p, m) {
    const inv = this.invites.get(p.id);
    if (!inv || inv.from !== m.from || now() - inv.at > 40000) return;
    this.invites.delete(p.id);
    const from = this.players.get(inv.from);
    if (!from || from.role !== 'hg') return;
    if (!m.yes) { this.toast(from, `${p.name} דחה את הברית`); this.markState(); return; }
    if (p.alliance) this.onAllyLeave(p, true);
    let a = from.alliance && this.alliances.get(from.alliance);
    if (!a) { a = { id: makeId(), members: [from.id], since: now() }; this.alliances.set(a.id, a); from.alliance = a.id; }
    if (a.members.length >= 4) return this.toast(p, 'הברית מלאה (4)');
    a.members.push(p.id);
    p.alliance = a.id;
    this.relation(p, from, 15); this.relation(from, p, 15);
    for (const id of a.members) { const q = this.players.get(id); if (q) this.toast(q, `🤝 ${p.name} הצטרף לברית!`, 'gold'); }
    this.toastRole('bb', `🤝 ברית חדשה: ${this.names(a.members)}`);
    this.addDrama(6);
    this.markState();
  }
  onAllyLeave(p, silent) {
    const a = p.alliance && this.alliances.get(p.alliance);
    p.alliance = null;
    if (!a) return;
    a.members = a.members.filter((x) => x !== p.id);
    if (!silent) for (const id of a.members) { const q = this.players.get(id); if (q) this.toast(q, `💔 ${p.name} עזב את הברית`); }
    this.cleanAlliances();
    this.markState();
  }

  onSabotage(p) {
    if (!p.spy || p.sabDay === this.phase.day) return;
    if (this.task && this.task.def.cat === 'coop') {
      this.task.sabotaged = true;
    } else if (this.phase.id === P.FREE) {
      this.applyEffect('dark', true, 20);
      this.announce('⚡ הפסקת חשמל פתאומית...', { sound: 'powerdown' });
    } else return this.toast(p, 'אפשר לחבל רק במשימה שיתופית או בשעת חופש');
    p.sabDay = this.phase.day;
    this.stat(p, 'sabotage');
    this.toast(p, '🕵️ החבלה בוצעה.');
    this.toastRole('bb', `🕵️ המרגל (${p.name}) חיבל!`);
    this.addDrama(10);
    this.markState();
  }

  onAccuse(p, m) {
    if (this.diaryOccupant !== p.id || p.accused) return this.toast(p, 'אפשר להאשים רק מכיסא הוידוי, פעם אחת במשחק');
    const t = this.players.get(m.id);
    if (!t || t.role !== 'hg' || t === p) return;
    p.accused = true;
    if (t.spy) {
      this.flags.spyExposed = true;
      t.spy = false;
      t.powers = {};
      p.immune = true;
      this.giveCoins(p, 50);
      this.announce(`🕵️ ${p.name} חשף את המרגל: ${t.name}! ${p.name} זוכה בחסינות.`, { sound: 'sting' });
      this.addDrama(25);
    } else {
      this.giveCoins(p, -40);
      this.rep(p, -3);
      this.toast(p, '❌ טעית. זה לא המרגל. -40 מטבעות.');
    }
    this.markState();
  }

  onAssignBB(p, m) {
    if (p.id !== this.hostId || this.phase.id === P.LOBBY) return;
    if (this.bbActive()) return this.toast(p, 'האח הגדול מחובר');
    const t = this.players.get(m.id);
    if (!t || t.role !== 'ghost') return this.toast(p, 'אפשר להעביר את התפקיד רק לדייר שפונה');
    const old = this.bb();
    if (old) old.role = 'ghost';
    t.role = 'bb';
    this.bbId = t.id;
    this.send(t, { t: 'ev', k: 'role', role: 'bb' });
    this.announce(`👁️ ${t.name} הוא האח הגדול החדש.`, { sound: 'sting' });
    this.markState();
  }

  // ---------------- Big Brother commands ----------------
  bbCd(key, sec) {
    const t = now();
    if ((this.cooldowns[key] || 0) > t) return false;
    this.cooldowns[key] = t + sec * 1000;
    return true;
  }

  onBB(bb, m) {
    const c = m.c;
    switch (c) {
      case 'announce': {
        const text = cleanText(m.text, LIMITS.ANNOUNCE_MAX);
        if (!text || !this.bbCd('announce', 3)) return;
        return this.announce(text, { from: 'bb', sound: 'bbVoice' });
      }
      case 'talk':
        if (['none', 'house', 'diary'].includes(m.mode)) { this.bbTalk = m.mode; this.markState(); }
        return;
      case 'task':
        if (this.phase.id !== P.MORNING) return this.toast(bb, 'בוחרים משימה בבוקר');
        if (m.custom) {
          const title = cleanText(m.custom.title, 40), desc = cleanText(m.custom.desc, LIMITS.CUSTOM_TASK_MAX);
          if (!title) return;
          this.chooseTask(null, { title, desc });
        } else if (!this.chooseTask(m.id)) return;
        this.toast(bb, `✔ משימת היום: ${this.taskChoice.title}`);
        this.markState();
        return;
      case 'startTaskNow':
        if (this.phase.id === P.MORNING) { this.phase.endsAt = now() + 500; this.markState(); }
        return;
      case 'punish': {
        const def = TASK_BY_ID[m.id];
        if (!def || def.kind !== 'punish' || !this.bbCd('punish', 60)) return this.toast(bb, 'עונש בקירור');
        const e = def.params.effect;
        this.applyEffect(['whisper', 'chipmunk', 'deep'].includes(e) ? 'voice' : e, e, def.dur);
        return this.announce(`⚠️ ${def.title}! ${def.desc}`, { from: 'bb', sound: 'alarm' });
      }
      case 'twist': return this.events.twist(m.id, bb);
      case 'event': if (EVENT_DEFS[m.id] && this.bbCd('event', 20)) this.events.trigger(m.id); return;
      case 'lights': {
        const level = clamp(Number(m.level) || 0, 0, 1);
        const rooms = m.room === 'all' ? ROOMS.map((r) => r.id) : [m.room];
        for (const r of rooms) if (this.lights[r] !== undefined) { this.lights[r] = level; (this.flags.lightsLocked ||= {})[r] = level < 0.5; }
        return this.markState();
      }
      case 'music': return this.setMusic(m.mood, 0);
      case 'door': {
        const d = this.doors[m.id];
        if (!d) return;
        if (typeof m.locked === 'boolean') d.locked = m.locked;
        if (typeof m.open === 'boolean') d.open = m.open;
        return this.updateColliders();
      }
      case 'secretRoom':
        this.doors.d_secret.locked = !m.open; this.doors.d_secret.open = !!m.open;
        if (m.open) this.announce('🗝️ החדר הסודי נפתח...', { sound: 'sting' });
        return this.updateColliders();
      case 'advance':
        if (this.phase.id !== P.LOBBY && this.phase.id !== P.GAME_OVER && this.phase.id !== P.INTRO) { this.phase.endsAt = now() + 300; this.markState(); }
        return;
      case 'extend':
        if (this.phase.endsAt) { this.phase.endsAt += 30000; this.markState(); }
        return;
      case 'isolate': {
        const t = this.players.get(m.id);
        if (!t || !this.bbCd('iso_' + m.id, 15)) return;
        return this.isolate(t, clamp(Math.floor(m.seconds) || 30, 10, 90), cleanText(m.reason || '', 40));
      }
      case 'warn': {
        const t = this.players.get(m.id);
        if (!t) return;
        this.rep(t, -2);
        return this.announce(`⚠️ ${t.name}, זו אזהרה רשמית מהאח הגדול.`, { from: 'bb', sound: 'alarm' });
      }
      case 'reward': {
        const t = this.players.get(m.id);
        if (!t || !this.bbCd('reward', 5)) return;
        const n = clamp(Math.floor(m.n) || 20, -100, 100);
        this.giveCoins(t, n);
        return this.toast(null, n >= 0 ? `👁️ האח הגדול העניק ל${t.name} ${n} מטבעות` : `👁️ האח הגדול קנס את ${t.name} ב-${-n} מטבעות`);
      }
      case 'mission': {
        const t = this.players.get(m.id);
        if (t?.mission && !t.mission.done) this.completeMission(t);
        return;
      }
      case 'decide': {
        const d = this.phase.data;
        if (this.phase.id !== P.BB_DECISION || !Array.isArray(m.ids)) return;
        const ids = [...new Set(m.ids)].filter((id) => d.nominees.includes(id)).slice(0, d.n);
        if (ids.length !== d.n) return this.toast(bb, `בחר ${d.n} מועמדים`);
        if (m.fake && d.canFake && ids.length === 1) this.flags.fakePending = ids[0];
        return this.startEviction(ids, d.counts);
      }
      case 'returnFake': return this.returnFake(this.players.get(m.id));
      case 'immunity': {
        const t = this.players.get(m.id);
        if (!t || t.role !== 'hg' || !this.bbCd('immunity', 120)) return;
        t.immune = true;
        return this.announce(`🛡️ האח הגדול העניק חסינות ל${t.name}!`, { from: 'bb', sound: 'sting' });
      }
    }
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
export { r2 };
