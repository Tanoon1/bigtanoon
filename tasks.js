// Task engine: in-world tasks & mini-games, server authoritative
import { ITEM_SPOTS, ZONES, inRect, roomAt } from '../../shared/layout.js';
import { TRIVIA, INGREDIENTS, DISH_BASES, DISH_ADJ } from '../../shared/tasks.js';
import { lineOfSight } from '../../shared/physics.js';
import { shuffle, pick, now, rand } from '../util.js';

class BaseTask {
  constructor(room, def) {
    this.room = room;
    this.def = def;
    this.p = def.params || {};
    this.t = 0;
    this.done = false;
    this.items = [];
    this.parts = room.participants().map((p) => p.id);
    this.sabotaged = false;
  }
  part() { return this.parts.map((id) => this.room.players.get(id)).filter((p) => p && p.role === 'hg'); }
  active() { return this.part().filter((p) => p.connected && !this.room.isIsolated(p)); }
  start() {}
  tick() {}
  onInteract() {}
  onPickup() { return true; }
  onHit() {}
  onInput() {}
  onEmote() {}
  pub() { return {}; }
  priv() { return null; }
  spawn(kind, n, meta = {}) {
    const spots = shuffle(ITEM_SPOTS);
    for (let i = 0; i < n; i++) {
      const s = spots[i % spots.length];
      const it = this.room.items.spawn(kind, s.x + rand(-0.2, 0.2), s.y + 0.15, s.z + rand(-0.2, 0.2), { task: true, ...meta });
      this.items.push(it.id);
    }
  }
  cleanup() {
    for (const id of this.items) this.room.items.remove(id);
  }
  finish() { return { success: false, winners: [], text: '' }; }
  ranking(scores) {
    return Object.entries(scores).map(([id, s]) => ({ id, score: Math.round(s * 10) / 10 })).sort((a, b) => b.score - a.score);
  }
  topWinners(scores) {
    const r = this.ranking(scores);
    if (!r.length || r[0].score <= 0) return [];
    return r.filter((x) => x.score === r[0].score).map((x) => x.id);
  }
}

// ---------------------------------------------------------------------
class GatherTask extends BaseTask {
  start() { this.hold = 0; this.best = 0; }
  tick(dt) {
    const act = this.active();
    const zone = ZONES[this.p.zone];
    this.inside = act.filter((p) => inRect(zone, p.pos.x, p.pos.z)).length;
    if (act.length && this.inside === act.length) {
      this.hold += dt;
      if (this.hold >= this.p.seconds) this.done = true;
    } else this.hold = Math.max(0, this.hold - dt * 2);
    this.best = Math.max(this.best, this.hold);
  }
  pub() { return { inside: this.inside || 0, total: this.active().length, hold: Math.round(this.hold * 10) / 10, need: this.p.seconds }; }
  finish() {
    const ok = this.hold >= this.p.seconds;
    return { success: ok, coop: true, winners: ok ? this.parts : [], text: ok ? 'הבית עבד ביחד – הצלחה!' : 'לא הספקתם להתאסף בזמן.' };
  }
}

// ---------------------------------------------------------------------
class RelayTask extends BaseTask {
  start() {
    this.touched = new Set();
    const s = pick(ITEM_SPOTS.filter((sp) => roomAt(sp.x, sp.z) !== 'living'));
    const it = this.room.items.spawn('baton', s.x, s.y + 0.2, s.z, { task: true });
    this.items.push(it.id);
    this.baton = it.id;
  }
  onPickup(p, item) {
    if (item.id === this.baton) this.touched.add(p.id);
    return true;
  }
  tick() {
    const it = this.room.items.get(this.baton);
    if (!it) return;
    if (it.holder) this.touched.add(it.holder);
    const need = this.active().every((p) => this.touched.has(p.id));
    const inZone = inRect(ZONES[this.p.zone], it.x, it.z) || (it.holder && (() => { const h = this.room.players.get(it.holder); return h && inRect(ZONES[this.p.zone], h.pos.x, h.pos.z); })());
    if (need && inZone && !it.flying) this.done = true;
  }
  pub() { return { touched: [...this.touched], total: this.active().length }; }
  finish() {
    const ok = this.done && !this.sabotaged;
    return { success: ok, coop: true, winners: ok ? this.parts : [], text: ok ? 'המקל עבר בכל הידיים – כל הכבוד!' : this.sabotaged ? 'המקל נעלם בנסיבות מסתוריות... מישהו חיבל?' : 'המקל לא הגיע ליעד.' };
  }
}

// ---------------------------------------------------------------------
class CodeTask extends BaseTask {
  start() {
    const act = this.part();
    const len = Math.max(3, Math.min(6, act.length));
    this.code = Array.from({ length: len }, () => Math.floor(Math.random() * 10));
    this.assign = {};
    const order = shuffle(act.map((p) => p.id));
    for (let i = 0; i < len; i++) {
      const pid = order[i % order.length];
      (this.assign[pid] ||= []).push({ pos: i + 1, d: this.code[i] });
    }
    this.tries = 0;
    this.lastTry = {};
  }
  onInput(p, d) {
    if (typeof d.code !== 'string') return;
    if (!this.room.near(p, 'keypad', 2.4)) return this.room.toast(p, 'צריך לעמוד ליד לוח הקוד');
    const t = now();
    if (t - (this.lastTry[p.id] || 0) < 1500) return;
    this.lastTry[p.id] = t;
    this.tries++;
    if (d.code === this.code.join('') && !this.sabotaged) {
      this.done = true;
      this.room.sfx('success', this.room.interPos('keypad'));
    } else {
      this.room.sfx('error', this.room.interPos('keypad'));
      this.room.toast(null, `${p.name} הקיש קוד שגוי!`);
    }
  }
  pub() { return { len: this.code.length, tries: this.tries }; }
  priv(p) { return this.assign[p.id] ? { digits: this.assign[p.id] } : null; }
  finish() {
    const ok = this.done;
    return { success: ok, coop: true, winners: ok ? this.parts : [], text: ok ? `הכספת נפתחה! הקוד היה ${this.code.join('')}` : `הכספת נשארה נעולה. הקוד היה ${this.code.join('')}` };
  }
}

// ---------------------------------------------------------------------
class DeliverTask extends BaseTask {
  start() { this.spawn(this.p.itemKind, this.p.count); this.delivered = 0; this.by = {}; }
  tick() {
    const zone = ZONES[this.p.zone];
    for (const id of this.items.slice()) {
      const it = this.room.items.get(id);
      if (!it) continue;
      let inZone = !it.flying && !it.holder && inRect(zone, it.x, it.z);
      if (it.holder) {
        const h = this.room.players.get(it.holder);
        if (h && inRect(zone, h.pos.x, h.pos.z)) { inZone = true; this.by[h.id] = (this.by[h.id] || 0) + 1; }
      }
      if (inZone) {
        this.delivered++;
        this.room.items.remove(id);
        this.items = this.items.filter((x) => x !== id);
        this.room.sfx('ding', { x: it.x, y: it.y, z: it.z });
      }
    }
    if (this.delivered >= this.p.count) this.done = true;
  }
  pub() { return { delivered: this.delivered, count: this.p.count }; }
  finish() {
    const ok = this.delivered >= this.p.count && !this.sabotaged;
    return { success: ok, coop: true, winners: ok ? this.parts : [], text: ok ? 'כל החלקים הגיעו – משימה הושלמה!' : `הגיעו רק ${this.delivered} מתוך ${this.p.count}.` };
  }
}

// ---------------------------------------------------------------------
class QuietTask extends BaseTask {
  start() { this.silent = -3; this.breakers = {}; }
  tick(dt) {
    const talking = this.active().filter((p) => p.speaking);
    if (talking.length && this.silent > 0) {
      for (const p of talking) this.breakers[p.id] = (this.breakers[p.id] || 0) + 1;
      if (this.silent > 2) this.room.toast(null, `${talking[0].name} שבר את השקט! מתחילים מחדש`);
      this.silent = 0;
    } else this.silent += dt;
    if (this.silent >= this.p.seconds) this.done = true;
  }
  pub() { return { silent: Math.max(0, Math.round(this.silent)), need: this.p.seconds }; }
  finish() {
    const ok = this.silent >= this.p.seconds;
    return { success: ok, coop: true, winners: ok ? this.parts : [], text: ok ? 'שקט מופתי. האח הגדול מרוצה.' : 'מישהו לא הצליח לסתום. נכשלתם.' };
  }
}

// ---------------------------------------------------------------------
class CollectTask extends BaseTask {
  start() { this.spawn(this.p.itemKind, this.p.count); this.scores = {}; this.left = this.p.count; }
  onPickup(p, item) {
    if (!this.items.includes(item.id)) return true;
    this.scores[p.id] = (this.scores[p.id] || 0) + 1;
    this.room.items.remove(item.id);
    this.items = this.items.filter((x) => x !== item.id);
    this.left--;
    this.room.sfx('coin', { x: item.x, y: item.y, z: item.z });
    if (this.left <= 0) this.done = true;
    return false;
  }
  pub() { return { scores: this.scores, left: this.left }; }
  finish() {
    const w = this.topWinners(this.scores);
    return { winners: w, ranking: this.ranking(this.scores), text: w.length ? `${this.room.names(w)} אסף הכי הרבה!` : 'אף אחד לא אסף כלום. מביך.' };
  }
}

// ---------------------------------------------------------------------
class RaceTask extends BaseTask {
  start() { this.idx = {}; this.order = []; this.cps = this.p.checkpoints; }
  tick() {
    for (const p of this.active()) {
      const i = this.idx[p.id] || 0;
      if (i >= this.cps.length) continue;
      const [cx, cz] = this.cps[i];
      if ((p.pos.x - cx) ** 2 + (p.pos.z - cz) ** 2 < 1.8 * 1.8) {
        this.idx[p.id] = i + 1;
        this.room.sfx('ding', { x: cx, y: 1, z: cz }, p);
        if (i + 1 === this.cps.length) {
          this.order.push(p.id);
          this.room.toast(null, `${p.name} סיים במקום ${this.order.length}!`);
        }
      }
    }
    if (this.active().every((p) => (this.idx[p.id] || 0) >= this.cps.length)) this.done = true;
  }
  pub() { return { cps: this.cps, idx: this.idx, order: this.order }; }
  finish() {
    const w = this.order.slice(0, 1);
    const ranking = this.part().map((p) => ({ id: p.id, score: this.order.includes(p.id) ? 100 - this.order.indexOf(p.id) : this.idx[p.id] || 0 })).sort((a, b) => b.score - a.score);
    return { winners: w, ranking, text: w.length ? `${this.room.names(w)} ניצח במרוץ!` : 'אף אחד לא סיים את המרוץ.' };
  }
}

// ---------------------------------------------------------------------
class HideSeekTask extends BaseTask {
  start() {
    const act = this.active();
    this.seeker = act.length ? pick(act).id : null;
    this.found = new Set();
    this.blindUntil = now() + (this.p.blind || 15) * 1000;
    const s = this.room.players.get(this.seeker);
    if (s) { this.room.teleport(s, -5, -9.4); this.room.freeze(s, this.blindUntil); }
  }
  onInput(p, d) {
    if (p.id !== this.seeker || now() < this.blindUntil || typeof d.tag !== 'string') return;
    const t = this.room.players.get(d.tag);
    if (!t || t.role !== 'hg' || this.found.has(t.id) || t.id === p.id) return;
    const dd = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
    if (dd > 2.8 || !lineOfSight(p.pos.x, p.pos.z, t.pos.x, t.pos.z, this.room.colliders)) return;
    this.found.add(t.id);
    this.room.sfx('found', t.pos);
    this.room.toast(null, `${p.name} מצא את ${t.name}!`);
    if (this.active().filter((x) => x.id !== this.seeker).every((x) => this.found.has(x.id))) this.done = true;
  }
  pub() { return { seeker: this.seeker, found: [...this.found], blindUntil: this.blindUntil }; }
  finish() {
    const hiders = this.part().filter((p) => p.id !== this.seeker);
    const safe = hiders.filter((p) => !this.found.has(p.id)).map((p) => p.id);
    const w = safe.length ? safe : [this.seeker].filter(Boolean);
    return { winners: w, text: safe.length ? `${this.room.names(safe)} לא נמצאו – ניצחון למתחבאים!` : 'המחפש מצא את כולם!' };
  }
}

// ---------------------------------------------------------------------
class LavaTask extends BaseTask {
  start() {
    this.lives = {};
    for (const p of this.part()) this.lives[p.id] = 3;
    const gap = Math.max(7, (this.def.dur - 8) / this.p.rounds);
    this.nextAt = 6; this.gap = gap; this.warn = false; this.round = 0;
  }
  tick() {
    const t = this.t;
    if (!this.warn && t >= this.nextAt - 3.2) {
      this.warn = true;
      this.room.broadcast({ t: 'ev', k: 'lavaWarn', at: now() + 3200 });
    }
    if (t >= this.nextAt) {
      this.warn = false; this.round++;
      this.nextAt += this.gap * rand(0.8, 1.15);
      const burned = [];
      for (const p of this.active()) {
        if (this.lives[p.id] <= 0) continue;
        if (p.pos.y < 0.22) { this.lives[p.id]--; burned.push(p); }
      }
      this.room.broadcast({ t: 'ev', k: 'lava', burned: burned.map((p) => p.id) });
      if (burned.length) this.room.toast(null, `🔥 נשרפו: ${burned.map((p) => p.name).join(', ')}`);
      const alive = this.part().filter((p) => this.lives[p.id] > 0);
      if (this.round >= this.p.rounds || alive.length <= 1) this.done = true;
    }
  }
  pub() { return { lives: this.lives, nextAt: now() + (this.nextAt - this.t) * 1000, round: this.round, rounds: this.p.rounds }; }
  finish() {
    const w = this.topWinners(this.lives);
    return { winners: w, ranking: this.ranking(this.lives), text: w.length ? `${this.room.names(w)} שרדו את הלבה!` : 'כולם נשרפו. 🔥' };
  }
}

// ---------------------------------------------------------------------
class KothTask extends BaseTask {
  start() {
    const [x, z] = this.p.spawn || [0.7, 0.2];
    const it = this.room.items.spawn('crown', x, this.p.spawn ? -0.6 : 0.6, z, { task: true });
    this.items.push(it.id); this.crown = it.id; this.time = {};
  }
  tick(dt) {
    const it = this.room.items.get(this.crown);
    if (it?.holder) this.time[it.holder] = (this.time[it.holder] || 0) + dt;
  }
  onHit(a, b) {
    const it = this.room.items.get(this.crown);
    if (it && it.holder === b.id) { this.room.items.drop(b, true); this.room.toast(null, `${a.name} הפיל את הכתר מ${b.name}!`); }
  }
  pub() { const it = this.room.items.get(this.crown); return { holder: it?.holder || null, time: Object.fromEntries(Object.entries(this.time).map(([k, v]) => [k, Math.round(v)])) }; }
  finish() {
    const w = this.topWinners(this.time);
    return { winners: w, ranking: this.ranking(this.time), text: w.length ? `${this.room.names(w)} הוא מלך הבית! 👑` : 'הכתר נשאר יתום.' };
  }
}

// ---------------------------------------------------------------------
class PillowTask extends BaseTask {
  start() {
    this.lives = {};
    for (const p of this.part()) {
      this.lives[p.id] = this.p.lives || 3;
      if (p.held) this.room.items.drop(p);
      const it = this.room.items.spawn('pillow', p.pos.x, 1, p.pos.z, { task: true });
      this.items.push(it.id);
      this.room.items.give(p, it);
    }
    this.spawn('pillow', 4);
  }
  onHit(a, b, kind) {
    if (kind !== 'pillow' || !(this.lives[a.id] > 0) || !(this.lives[b.id] > 0)) return;
    this.lives[b.id]--;
    if (this.lives[b.id] === 0) this.room.toast(null, `${b.name} נפל מהקרב! 🪶`);
    const alive = this.part().filter((p) => this.lives[p.id] > 0);
    if (alive.length <= 1) this.done = true;
  }
  pub() { return { lives: this.lives }; }
  finish() {
    const w = this.topWinners(this.lives);
    return { winners: w, ranking: this.ranking(this.lives), text: w.length ? `${this.room.names(w)} – אלוף הכריות!` : 'כולם נפלו.' };
  }
}

// ---------------------------------------------------------------------
class TriviaTask extends BaseTask {
  start() {
    this.qs = shuffle(TRIVIA).slice(0, this.p.count);
    this.qi = -1; this.scores = {}; this.ans = {};
    this.next();
  }
  next() {
    this.qi++;
    this.ans = {};
    if (this.qi >= this.qs.length) { this.done = true; return; }
    this.qStart = this.t; this.reveal = false;
    this.room.markTask();
    this.room.speak(this.qs[this.qi].q);
  }
  tick() {
    if (this.done) return;
    const el = this.t - this.qStart;
    if (!this.reveal && (el > 10 || Object.keys(this.ans).length >= this.active().length)) { this.reveal = true; this.revealAt = this.t; this.room.markTask(); }
    if (this.reveal && this.t - this.revealAt > 2.5) this.next();
  }
  onInput(p, d) {
    if (this.reveal || !Number.isInteger(d.answer) || this.ans[p.id] !== undefined) return;
    this.ans[p.id] = d.answer;
    const q = this.qs[this.qi];
    if (d.answer === q.c) this.scores[p.id] = (this.scores[p.id] || 0) + Math.round(100 + Math.max(0, 10 - (this.t - this.qStart)) * 10);
    this.room.markTask();
  }
  pub() {
    const q = this.qs[this.qi];
    if (!q) return { done: true, scores: this.scores };
    return { qi: this.qi, n: this.qs.length, q: q.q, a: q.a, reveal: this.reveal, c: this.reveal ? q.c : undefined, answered: Object.keys(this.ans), scores: this.scores, endsAt: now() + Math.max(0, 10 - (this.t - this.qStart)) * 1000 };
  }
  finish() {
    const w = this.topWinners(this.scores);
    return { winners: w, ranking: this.ranking(this.scores), text: w.length ? `${this.room.names(w)} – מוח של האח הגדול!` : 'אף אחד לא ענה נכון...' };
  }
}

// ---------------------------------------------------------------------
class StatuesTask extends BaseTask {
  start() {
    const act = this.active();
    act.forEach((p, i) => this.room.teleport(p, -6 + (i % 8) * 1.7, -3.6 + Math.floor(i / 8) * 1.2));
    this.red = false; this.switchAt = 4; this.out = new Set(); this.anchor = {}; this.winner = null;
    this.room.speak('ירוק! זוזו!');
  }
  tick() {
    if (this.t >= this.switchAt) {
      this.red = !this.red;
      this.switchAt = this.t + (this.red ? rand(2, 3.5) : rand(2, 4.5));
      this.graceUntil = this.t + 0.55;
      if (this.red) for (const p of this.active()) this.anchor[p.id] = { x: p.pos.x, z: p.pos.z };
      this.room.broadcast({ t: 'ev', k: 'statues', red: this.red });
      this.room.speak(this.red ? 'קפאו!' : 'ירוק!');
      this.room.markTask();
    }
    const [gx, gz] = this.p.goal;
    for (const p of this.active()) {
      if (this.out.has(p.id)) continue;
      if (this.red && this.t > this.graceUntil) {
        if (this.t - this.graceUntil < 0.1) this.anchor[p.id] = { x: p.pos.x, z: p.pos.z };
        const a = this.anchor[p.id];
        if (a && Math.hypot(p.pos.x - a.x, p.pos.z - a.z) > 0.35) {
          this.out.add(p.id);
          this.room.toast(null, `${p.name} זז! נפסל 🗿`);
          this.room.sfx('buzz', p.pos);
          this.room.markTask();
        }
      }
      if (Math.hypot(p.pos.x - gx, p.pos.z - gz) < 1.7) { this.winner = p.id; this.done = true; }
    }
    if (this.active().every((p) => this.out.has(p.id))) this.done = true;
  }
  pub() { return { red: this.red, out: [...this.out], goal: this.p.goal }; }
  finish() {
    const w = this.winner ? [this.winner] : [];
    return { winners: w, text: w.length ? `${this.room.names(w)} הגיע ראשון!` : 'אף אחד לא הגיע ליעד.' };
  }
}

// ---------------------------------------------------------------------
class VoteTask extends BaseTask {
  // perform for (dur - voteDur) then vote
  start() { this.voteDur = 20; this.voting = false; this.votes = {}; this.cands = this.part().map((p) => p.id); }
  candidates() { return this.cands; }
  tick() {
    if (!this.voting && this.t >= this.def.dur - this.voteDur) {
      this.voting = true; this.voteEnds = now() + this.voteDur * 1000;
      this.cands = this.candidates();
      this.room.speak('זמן להצביע!');
      this.room.markTask();
    }
    if (this.voting && Object.keys(this.votes).length >= this.active().length) this.done = true;
  }
  onInput(p, d) {
    if (!this.voting || typeof d.vote !== 'string' || d.vote === p.id || !this.cands.includes(d.vote)) return;
    if (!this.parts.includes(p.id)) return;
    this.votes[p.id] = d.vote;
    this.room.markTask();
  }
  tally() {
    const s = {};
    for (const v of Object.values(this.votes)) s[v] = (s[v] || 0) + 1;
    return s;
  }
  pub() { return { voting: this.voting, voteEnds: this.voteEnds, cands: this.cands, voted: Object.keys(this.votes) }; }
  finish() {
    const s = this.tally();
    const w = this.topWinners(s);
    return { winners: w, ranking: this.ranking(s), text: w.length ? `הבית בחר: ${this.room.names(w)}!` : 'אף אחד לא הצביע...' };
  }
}

class DanceTask extends VoteTask {
  start() { super.start(); this.danceTime = {}; }
  tick(dt) {
    if (!this.voting) {
      for (const p of this.active()) if (p.emote === 'dance' && now() < p.emoteUntil && inRect(ZONES.stage, p.pos.x, p.pos.z)) this.danceTime[p.id] = (this.danceTime[p.id] || 0) + dt;
    }
    super.tick(dt);
  }
  candidates() {
    const d = Object.keys(this.danceTime).filter((id) => this.danceTime[id] > 2);
    return d.length >= 2 ? d : this.part().map((p) => p.id);
  }
  pub() { return { ...super.pub(), dance: Object.fromEntries(Object.entries(this.danceTime).map(([k, v]) => [k, Math.round(v)])) }; }
}

class CookTask extends VoteTask {
  start() {
    super.start();
    this.voteDur = 30;
    this.dishes = {};
    const n = Math.min(24, this.part().length * 3 + 4);
    const spots = [[11.5, -5.0], [12.5, -5.0], [14.5, -5.0], [12.2, -2.2], [11, -2.2], [13.3, -2.2], [12, 2.8], [10.9, 2.8], [13.1, 2.8], [15.2, 0], [9.5, -4], [10, 4.5]];
    for (let i = 0; i < n; i++) {
      const ing = INGREDIENTS[i % INGREDIENTS.length];
      const [x, z] = spots[i % spots.length];
      const y = Math.abs(z - 2.8) < 0.1 ? 0.95 : Math.abs(z + 2.2) < 0.1 || z === -5.0 ? 1.15 : 0.2;
      const it = this.room.items.spawn('ingredient', x + rand(-0.3, 0.3), y, z + rand(-0.2, 0.2), { task: true, ing: ing.id });
      this.items.push(it.id);
    }
  }
  onInteract(p, inter) {
    if (inter.type !== 'pot' || this.voting) return false;
    const it = p.held && this.room.items.get(p.held);
    if (!it || it.kind !== 'ingredient') { this.room.toast(p, 'קח מצרך מהמטבח קודם'); return true; }
    const d = (this.dishes[p.id] ||= { ings: [] });
    if (d.ings.length >= 3) { this.room.toast(p, 'כבר שמת 3 מצרכים'); return true; }
    d.ings.push(it.meta.ing);
    this.room.items.remove(it.id);
    this.items = this.items.filter((x) => x !== it.id);
    this.room.sfx('splash', this.room.interPos('pot'));
    if (d.ings.length === 3) {
      const names = d.ings.map((id) => INGREDIENTS.find((x) => x.id === id).name);
      d.name = `${pick(DISH_BASES)} ${names[0]} עם ${names[1]} ו${names[2]} ${pick(DISH_ADJ)}`;
      this.room.toast(null, `${p.name} הכין: ${d.name}`);
    } else this.room.toast(p, `נכנס לסיר! עוד ${3 - d.ings.length}`);
    this.room.markTask();
    return true;
  }
  candidates() {
    const c = Object.keys(this.dishes).filter((id) => this.dishes[id].name);
    return c.length ? c : this.part().map((p) => p.id);
  }
  pub() { return { ...super.pub(), dishes: Object.fromEntries(Object.entries(this.dishes).map(([k, v]) => [k, v.name || `${v.ings.length}/3`])) }; }
}

// ---------------------------------------------------------------------
class JudgedTask extends BaseTask {
  start() {
    this.marked = new Set();
    if (this.p.secretRole === 'killer') {
      const a = this.active();
      this.killer = a.length ? pick(a).id : null;
    }
  }
  onInput(p, d) {
    // only Big Brother judges (handled by room: p.role === 'bb')
    if (p.role !== 'bb' || typeof d.mark !== 'string') return;
    if (this.marked.has(d.mark)) this.marked.delete(d.mark); else this.marked.add(d.mark);
    this.room.markTask();
  }
  pub() { return { marked: [...this.marked], judged: true }; }
  priv(p) { return p.id === this.killer ? { role: 'killer', text: 'אתה הרוצח! לחש "מתת" באוזן של דיירים בלי שיתפסו אותך.' } : null; }
  bbPriv() { return this.killer ? { killer: this.killer } : null; }
  finish() {
    let w = [...this.marked];
    if (!this.room.bbActive() && !w.length) w = shuffle(this.part().map((p) => p.id)).slice(0, Math.max(1, Math.floor(this.parts.length / 3)));
    return { winners: w, text: w.length ? `האח הגדול החליט: ${this.room.names(w)} הצליחו!` : 'האח הגדול לא התרשם מאף אחד.' };
  }
}

// ---------------------------------------------------------------------
class DilemmaTask extends BaseTask {
  start() {
    const a = shuffle(this.active());
    this.pair = a.slice(0, 2).map((p) => p.id);
    this.choice = {};
    this.mult = this.p.stakes || 1;
    if (this.pair.length < 2) this.done = true;
    else this.room.announce(`${this.room.names(this.pair)} – גשו לטאבלט. לשתף פעולה או לבגוד?`);
  }
  onInput(p, d) {
    if (!this.pair.includes(p.id) || !['coop', 'betray'].includes(d.choice) || this.choice[p.id]) return;
    this.choice[p.id] = d.choice;
    if (this.pair.every((id) => this.choice[id])) this.done = true;
    this.room.markTask();
  }
  pub() { return { pair: this.pair, chosen: Object.keys(this.choice) }; }
  priv(p) { return this.pair.includes(p.id) ? { choose: !this.choice[p.id], mine: this.choice[p.id] || null } : null; }
  finish() {
    if (this.pair.length < 2) return { winners: [], text: 'אין מספיק דיירים לדילמה.' };
    const [a, b] = this.pair;
    const ca = this.choice[a] || 'coop', cb = this.choice[b] || 'coop';
    const pa = this.room.players.get(a), pb = this.room.players.get(b);
    const m = this.mult;
    let text;
    if (ca === 'coop' && cb === 'coop') { this.room.giveCoins(pa, 40 * m); this.room.giveCoins(pb, 40 * m); text = 'שניהם שיתפו פעולה! 40 מטבעות לכל אחד.'; }
    else if (ca === 'betray' && cb === 'betray') { this.room.giveCoins(pa, -20 * m); this.room.giveCoins(pb, -20 * m); text = 'שניהם בגדו! שניהם מפסידים.'; this.room.stat(pa, 'betrayals'); this.room.stat(pb, 'betrayals'); }
    else {
      const traitor = ca === 'betray' ? pa : pb, victim = ca === 'betray' ? pb : pa;
      this.room.giveCoins(traitor, 80 * m);
      this.room.stat(traitor, 'betrayals');
      this.room.relation(victim, traitor, -15);
      text = `${traitor?.name} בגד ב${victim?.name} ולקח הכול! 🐍`;
    }
    this.room.addDrama(20);
    return { winners: [], text, reveal: { [a]: ca, [b]: cb } };
  }
}

class SacrificeTask extends BaseTask {
  start() { this.hero = null; }
  onInput(p, d) {
    if (this.hero || !d.volunteer || !this.parts.includes(p.id)) return;
    this.hero = p.id;
    const lost = p.coins;
    p.coins = 0;
    for (const o of this.part()) if (o.id !== p.id) { this.room.giveCoins(o, 20); this.room.relation(o, p, 12); }
    this.room.stat(p, 'sacrifices');
    this.room.rep(p, 6);
    this.room.toast(null, `${p.name} ויתר על ${lost} מטבעות למען הבית! ❤️`);
    this.done = true;
  }
  pub() { return { hero: this.hero }; }
  finish() {
    if (this.hero) { this.room.events.trigger('party'); return { winners: [this.hero], text: `${this.room.names([this.hero])} הקריב את עצמו – מסיבה לכל הבית!` }; }
    this.room.applyEffect('voice', 'chipmunk', 45);
    return { winners: [], text: 'אף אחד לא מוכן לוותר? עונש: קול של סנאי ל-45 שניות!' };
  }
}

class PunishTask extends BaseTask {
  start() { this.room.applyEffect(this.p.effect === 'whisper' || this.p.effect === 'chipmunk' || this.p.effect === 'deep' ? 'voice' : this.p.effect, this.p.effect, this.def.dur); }
  finish() { return { winners: [], text: 'העונש נגמר. תתנהגו יפה.' }; }
}

const KINDS = {
  gather: GatherTask, relay: RelayTask, code: CodeTask, deliver: DeliverTask, quiet: QuietTask,
  collect: CollectTask, race: RaceTask, hideseek: HideSeekTask, lava: LavaTask, koth: KothTask,
  pillow: PillowTask, trivia: TriviaTask, statues: StatuesTask, vote: VoteTask, dance: DanceTask,
  cook: CookTask, judged: JudgedTask, dilemma: DilemmaTask, sacrifice: SacrificeTask, punish: PunishTask,
};

export function createTask(room, def) {
  const K = KINDS[def.kind];
  if (!K) throw new Error('unknown task kind ' + def.kind);
  return new K(room, def);
}
