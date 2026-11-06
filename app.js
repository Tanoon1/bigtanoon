// =====================================================================
//  App orchestrator: screens → connect → world → game loop
// =====================================================================
import './style.css';
import * as THREE from 'three';
import { Engine, detectQuality, safeGet } from './engine.js';
import { Net } from './net/Net.js';
import { House } from './world/House.js';
import { Players } from './world/Players.js';
import { ItemView, FX, Dog, TaskMarkers, makeItemMesh } from './world/Items.js';
import { loadLogo } from './world/materials.js';
import { Controller } from './player/Controller.js';
import { Input } from './player/Input.js';
import { Voice } from './voice/Voice.js';
import { audio } from './audio/Audio.js';
import { HUD } from './ui/hud.js';
import { showMenu, showCreator, micGate, showLoading, hideLoading } from './ui/screens.js';
import { ControlRoom } from './bb/ControlRoom.js';
import { EMOTES, FLAG } from '../../shared/constants.js';
import { INTERACTABLES, FURNITURE, FURNITURE_TYPES, furnitureSize, STATIC_COLLIDERS, buildColliders, EXIT_PATH, roomAt } from '../../shared/layout.js';
import { groundAt } from '../../shared/physics.js';
import { lineOfSight } from '../../shared/physics.js';
import { ITEM_NAMES } from './itemNames.js';

const NIGHT = { lobby: 0.15, intro: 0, morning: 0, task: 0, budget: 0.05, free: 0.1, confession: 0.55, bbDecision: 1, exitScene: 1, nomination: 0.8, reveal: 1, evictionVote: 1, eviction: 1, summary: 1, finaleTask: 0.3, finalVote: 1, gameOver: 1 };

class App {
  constructor() {
    this.net = new Net();
    this.state = null;
    this.stream = null;
    this.intro = null;
    this.control = null;
    this.bbTalking = null;
    this.bbStats = null;
  }

  // ------------------------------------------------------------------ boot flow
  async boot() {
    await loadLogo();
    const params = new URLSearchParams(location.search);
    const saved = Net.savedSession();
    if (saved) {
      showLoading('מתחבר מחדש לבית ' + saved.code + '...', 0.3);
      try {
        this.stream = await this.ensureMic();
        await this.startWorld();
        const w = await this.net.connect({ t: 'resume', code: saved.code, token: saved.token });
        return this.onJoined(w);
      } catch (e) { Net.clearSession(); hideLoading(); this.teardown(); }
    }
    this.menuFlow(params.get('join'));
  }

  async ensureMic() {
    if (this.stream && this.stream.active) return this.stream;
    hideLoading();
    const s = await micGate();
    return s;
  }

  async menuFlow(prefillCode, error) {
    for (;;) {
      const choice = await showMenu(prefillCode);
      if (error) error = null;
      let profile;
      try { profile = await showCreator({ joining: choice.action === 'join', code: choice.code }); } catch { continue; }
      this.stream = await this.ensureMic();
      showLoading('בונים את הבית...', 0.2);
      try {
        await this.startWorld();
        showLoading('נכנסים לבית...', 0.85);
        const w = await this.net.connect(choice.action === 'create' ? { t: 'create', name: profile.name, look: profile.look } : { t: 'join', code: choice.code, name: profile.name, look: profile.look });
        return this.onJoined(w);
      } catch (e) {
        hideLoading();
        this.teardown();
        this.net = new Net();
        alertBox(e?.text || 'משהו השתבש בחיבור. נסו שוב.');
        prefillCode = choice.code;
      }
    }
  }

  // ------------------------------------------------------------------ world
  async startWorld() {
    if (this.engine) return;
    const quality = detectQuality();
    this.engine = new Engine(document.getElementById('stage'), quality);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 400);
    this.scene.add(this.camera);
    this.engine.onResize = (w, h) => { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.control?.layout(); };
    showLoading('בונים את הבית...', 0.4);
    await new Promise((r) => setTimeout(r, 30));
    this.house = new House(this.scene, quality);
    showLoading('מדליקים את המצלמות...', 0.65);
    await new Promise((r) => setTimeout(r, 30));
    this.players = new Players(this.scene, this.net);
    this.items = new ItemView(this.scene);
    this.fx = new FX(this.scene);
    this.players.emojiFx = (pos, icon) => this.fx.emoji(pos, icon);
    this.dog = new Dog(this.scene);
    this.markers = new TaskMarkers(this.scene);
    this.input = new Input(this.engine.canvas, document.getElementById('ui'));
    this.controller = new Controller(this.camera, this.net);
    this.hud = new HUD(this);
    this.hud.showHud(false);
    this.colliders = buildColliders({});
    this.bindInput();
    this.bindNet();
    // prime shader compilation
    this.engine.renderer.compile(this.scene, this.camera);
    this.clock = new THREE.Clock();
    this.t = 0;
    this.engine.renderer.setAnimationLoop(() => this.frame());
  }

  async onJoined(w) {
    hideLoading();
    this.hud.showHud(true);
    this.voice = new Voice(this.net);
    this.voice.ptt = safeGet('bb_ptt') === '1';
    try {
      await this.voice.start(this.stream, { ...w.voice });
    } catch (e) {
      console.warn('voice start failed', e);
      if (w.voice.mode === 'livekit') {
        this.hud.toast('⚠️ השרת הקולי לא זמין – עובר למצב P2P');
        this.voice = new Voice(this.net);
        await this.voice.start(this.stream, { mode: 'mesh', ice: w.voice.ice });
      }
    }
    this.hud.toast('🎙️ המיקרופון פעיל – מי שקרוב אליך שומע אותך');
    this.input.wantLock = !this.input.mobile;
    history.replaceState(null, '', location.pathname);
  }

  teardown() {
    try { this.net.close(); } catch {}
    this.voice?.stop();
  }

  leave() {
    this.net.send({ t: 'leave' });
    Net.clearSession();
    setTimeout(() => location.reload(), 150);
  }

  // ------------------------------------------------------------------ input
  bindInput() {
    const I = this.input;
    I.on('interact', () => this.interact());
    I.on('push', () => this.attack('push'));
    I.on('primary', () => { if (this.state?.you.role === 'bb') return; this.attack('punch'); });
    I.on('throw', () => {
      if (!this.state?.you.held) return;
      const f = this.controller.forward();
      this.net.send({ t: 'throw', dir: [f.x, f.y, f.z] });
      this.swingVM();
    });
    I.on('drop', () => this.net.send({ t: 'drop' }));
    I.on('eat', () => { if (this.state?.you.held) this.net.send({ t: 'eat' }); });
    I.on('mute', () => this.toggleMute());
    I.on('pttDown', () => { if (this.voice) this.voice.pttDown = true; });
    I.on('pttUp', () => { if (this.voice) this.voice.pttDown = false; });
    I.on('chat', () => this.hud.openChat());
    I.on('tab', (v) => this.state && this.hud.playerList(v));
    I.on('menu', () => {
      if (this.control?.mode === 'free') { this.control.setMode('grid'); this.input.exitLock(); this.hud.bbKey = ''; return; }
      if (this.hud.modals.size) return this.hud.closeAll();
      this.hud.settings();
    });
    I.on('emote', (i) => { const e = EMOTES[i]; if (e) this.doEmote(e.id); });
    I.on('emoteMenu', () => this.hud.emoteWheel());
    I.on('power', () => this.hud.powersMenu());
    I.on('help', () => import('./ui/screens.js').then((s) => s.showHowTo()));
    I.on('lock', (locked) => { if (!locked && this.control?.mode === 'free') { this.control.setMode('grid'); this.hud.bbKey = ''; } });
    // Big Brother: click a camera tile
    this.engine.canvas.addEventListener('click', (e) => {
      if (!this.control) return;
      const i = this.control.tileAt(e.clientX, e.clientY);
      if (i !== null && i !== undefined) { this.control.setMode('single', i); this.hud.bbKey = ''; }
    });
    this.engine.canvas.addEventListener('dblclick', () => { if (this.control?.mode === 'single') { this.control.setMode('grid'); this.hud.bbKey = ''; } });
  }

  toggleMute() {
    if (!this.voice) return;
    this.voice.muted = !this.voice.muted;
    this.hud.toast(this.voice.muted ? '🔇 המיקרופון מושתק (M)' : '🎙️ המיקרופון פעיל');
  }

  doEmote(id) {
    this.net.send({ t: 'emote', id });
    const e = EMOTES.find((x) => x.id === id);
    if (e) this.hud.toast(`${e.icon} ${e.label}`);
  }

  attack(kind) {
    const s = this.state;
    if (!s || s.you.role !== 'hg') return;
    const t = performance.now();
    if (t - (this.lastAtk || 0) < 600) return;
    this.lastAtk = t;
    this.net.send({ t: 'attack', kind });
    this.swingVM();
  }
  swingVM() { this.vmSwing = 1; }

  // ------------------------------------------------------------------ interaction targeting
  findTarget() {
    const s = this.state;
    if (!s || s.you.role !== 'hg' || this.intro) return null;
    const cam = this.camera.position;
    const f = this.controller.forward();
    const p = this.controller.s;
    let best = null, bestScore = -Infinity;
    for (const it of INTERACTABLES) {
      const dx = it.x - p.x, dz = it.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const v = new THREE.Vector3(it.x - cam.x, (it.y ?? 1) - cam.y, it.z - cam.z);
      const len = v.length();
      const dot = v.dot(f) / (len || 1);
      if (dot < (d < 1 ? 0.35 : 0.72)) continue;
      if (it.type !== 'door' && !lineOfSight(p.x, p.z, it.x, it.z, STATIC_COLLIDERS.filter((c) => c.wall))) continue;
      const score = dot * 2 - d * 0.4;
      if ((it.type === 'delivery' && !s.life?.delivery?.arrived) || (it.type === 'grill' && !s.life?.grill)) continue;
      if (score > bestScore) { bestScore = score; best = { kind: 'inter', it }; }
    }
    const item = this.items.nearest(cam, f, 2.4);
    if (item && !s.you.held) {
      const score = 2.2 - item.d * 0.4;
      if (score > bestScore) { bestScore = score; best = { kind: 'item', item }; }
    }
    for (const [id, e] of this.players.map) {
      if (id === s.you.id || e.info?.role !== 'hg' || !e.inSnap) continue;
      const v = new THREE.Vector3(e.pos.x - cam.x, e.pos.y + 1.2 - cam.y, e.pos.z - cam.z);
      const d = v.length();
      if (d > 2.8) continue;
      const dot = v.dot(f) / d;
      if (dot < 0.86) continue;
      const score = dot * 2.3 - d * 0.4;
      if (score > bestScore) { bestScore = score; best = { kind: 'player', id, info: e.info }; }
    }
    return best;
  }

  hintFor(t) {
    const s = this.state;
    if (!t) return null;
    if (t.kind === 'item') return `הרם ${ITEM_NAMES[t.item.kind] || 'חפץ'}`;
    if (s.you.held && ['food', 'dish', 'snack', 'tomato'].includes(s.you.held) && t.kind !== 'inter') return 'R – אכול';
    if (t.kind === 'player') return `${t.info.name} – ברית / מתנה`;
    const it = t.it;
    if (it.type === 'door') { const d = s.doors[it.id]; return d?.locked ? '🔒 נעול' : d?.open ? 'סגור דלת' : 'פתח דלת'; }
    if (it.type === 'switch') return (s.lights[it.room] ?? 1) > 0.5 ? 'כבה אור' : 'הדלק אור';
    if (it.type === 'seat' || it.type === 'bed' || it.type === 'diaryChair') return (this.controller.sit || this.controller.sleep) ? 'קום' : it.label;
    if (it.type === 'pot' && s.task?.kind === 'cook') return s.you.held === 'ingredient' ? 'זרוק לסיר' : 'קח מצרך קודם';
    if (it.type === 'keypad') return s.task?.kind === 'code' ? 'הקש קוד' : 'לוח קוד (נעול)';
    if (it.type === 'delivery') return s.life?.delivery?.arrived ? '📦 פרוק את המשלוח' : null;
    if (it.type === 'grill') return s.life?.grill ? '🔥 שים שיפודים על האש' : null;
    if (it.type === 'save') return s.phase.id === 'eviction' && !s.saveUsed ? '🆘 SAVE – הצל את המודח (−₪100,000)' : s.saveUsed ? 'SAVE נוצל העונה' : 'SAVE (רק בזמן פינוי)';
    if (it.type === 'lounger') return (this.controller.sleep ? 'קום' : '☀️ השתזף');
    return it.label;
  }

  interact() {
    const s = this.state;
    if (!s || s.you.role !== 'hg') return;
    if (this.controller.sit || this.controller.sleep) { this.controller.standUp(); return; }
    const t = this.target;
    if (!t) return;
    if (t.kind === 'item') { this.net.send({ t: 'pickup', id: t.item.id }); return; }
    if (t.kind === 'player') { this.hud.playerMenu(t.info); return; }
    const it = t.it;
    if (it.type === 'keypad' && s.task?.kind === 'code') { this.hud.openKeypad(); return; }
    if (it.type === 'seat' || it.type === 'diaryChair') {
      const f = FURNITURE.find((x) => x.id === it.furn) || FURNITURE.find((x) => x.type === 'diaryChair');
      const seat = seatOn(f, this.controller.s);
      this.controller.sitAt(seat, seat.yaw);
    }
    if (it.type === 'lounger') { this.controller.lieAt({ x: it.x, z: it.z }); this.controller.s.y = 0.38; }
    if (it.type === 'bed') {
      const f = FURNITURE.find((x) => x.id === it.furn);
      this.controller.lieAt({ x: f.x, z: f.z });
    }
    this.net.send({ t: 'interact', id: it.id });
  }

  // ------------------------------------------------------------------ network
  bindNet() {
    const N = this.net;
    N.on('state', (s) => this.onState(s));
    N.on('s', (snap) => { this.players.onSnapshot(snap); this.items.onFlying(snap.items); this.dogSnap = snap.dog; });
    N.on('tp', (m) => { this.controller.setPos(m.p, m.tp, m.yaw); this.controller.knock = { x: 0, z: 0 }; });
    N.on('correct', (m) => { if (m.tp === this.controller.tp) { this.controller.s.x = m.p[0]; this.controller.s.y = m.p[1]; this.controller.s.z = m.p[2]; } });
    N.on('knock', (m) => { this.controller.applyKnock(m.vx, m.vz, m.fall); audio.sfx(m.fall ? 'boing' : 'pow'); });
    N.on('ev', (m) => this.onEvent(m));
    N.on('bbStats', (m) => { this.bbStats = m; if (this.hud.bbTab === 'stats') this.hud.updateBB(this.state); });
    N.on('kicked', (m) => { Net.clearSession(); alertBox(m.reason || 'הוצאת מהבית'); setTimeout(() => location.reload(), 2500); });
    N.on('status', (st) => this.hud?.showConn(st === 'reconnecting' ? '📡 החיבור נפל – מתחבר מחדש...' : st === 'closed' && this.state ? 'החיבור נסגר' : ''));
    N.on('lost', () => { alertBox('החיבור לבית אבד. חוזרים לתפריט.'); setTimeout(() => location.reload(), 2500); });
  }

  onState(s) {
    const prev = this.state;
    this.state = s;
    const me = s.you;
    // controller / role
    if (!prev || prev.you.role !== me.role) this.onRole(me.role, prev?.you.role);
    if (!prev || prev.you.tp !== me.tp) {
      if (me.tp !== this.controller.tp || !prev) this.controller.setPos(me.pos, me.tp, me.yaw);
    }
    // world
    this.house.setDoors(s.doors);
    this.house.setTV(s.tv);
    if (JSON.stringify(s.doors) !== this.doorKey) { this.doorKey = JSON.stringify(s.doors); this.colliders = buildColliders(s.doors); this.voice?.setDoors(s.doors); this.players.segments = this.voice?.segments || []; }
    const allies = new Set(me.alliance?.members || []);
    this.players.sync(s.players, me.id, { allies, nominees: ['reveal', 'evictionVote', 'bbDecision'].includes(s.phase.id) ? s.nominees : [], pajama: !!s.effects?.pajama });
    this.house.setLife(s.life);
    this.items.sync(s.items, this.players, me.id);
    this.markers.set(s.task, me.id);
    // voice peers (mesh)
    this.voice?.transport?.syncPeers?.(s.players.filter((p) => p.connected).map((p) => p.id));
    // phase changes
    if (!prev || prev.phase.id !== s.phase.id || prev.phase.day !== s.phase.day) this.onPhase(s, prev);
    if (s.phase.id === 'intro') this.ensureIntro(s);
    else if (this.intro) this.endIntro();
    if (s.phase.id === 'exitScene') this.ensureExit(s);
    else if (this.exitScene) this.endExit();
    // held item view-model
    this.setViewModel(me.held);
    this.hud.setHeld(me.held, ITEM_NAMES[me.held]);
    this.hud.render(s);
    // effects
    const fx = s.effects || {};
    this.controller.speedMul = (fx.slow ? 0.55 : 1) * ((me.hunger ?? 100) < 25 ? 0.85 : 1);
    this.controller.frozen = false;
    if (me.role === 'hg' && me.secretWaiting === false && prev?.you.secretWaiting) this.hud.announce('🕵️ הדלת נפתחה! צאו לבית!');
  }

  onRole(role, prevRole) {
    if (this.control && (role === 'bb') !== this.control.opts.panel) { this.control.dispose(); this.control = null; this.hud.removeBB(); }
    if (role === 'ghost' || role === 'fake') {
      this.controller.mode = 'none';
      if (!this.control) this.control = new ControlRoom(this.engine, this.scene, this.input, this.hud, { panel: false });
      this.input.wantLock = false; this.input.exitLock(); this.input.showTouch(false);
      if (prevRole === 'hg') this.hud.announce(role === 'fake' ? '🎭 הדחה מזויפת! אף אחד לא יודע. אתה צופה בבית מהמצלמות – והאח הגדול יחזיר אותך.' : '👻 פונית מהבית. מעכשיו אתה צופה מהמצלמות, מגיב ומצביע כקהל.');
      return;
    }
    if (role === 'bb') {
      this.controller.mode = 'none';
      if (!this.control) this.control = new ControlRoom(this.engine, this.scene, this.input, this.hud);
      this.players.sync(this.state.players, this.state.you.id, {});
      this.input.wantLock = false;
      this.input.exitLock();
      this.input.showTouch(false);
      if (prevRole) this.hud.announce('👁️ אתה האח הגדול. מכאן אתה רואה ושומע הכול.', 'bb');
    } else {
      if (this.control) { this.control.dispose(); this.control = null; this.hud.removeBB(); }
      this.controller.mode = 'hg';
      if (prevRole === 'fake') this.hud.announce('😱 חזרת לבית! תעשה כניסה דרמטית במדרגות...');
      this.input.wantLock = !this.input.mobile;
      this.input.showTouch(true);
    }
  }

  onPhase(s, prev) {
    const id = s.phase.id;
    if (id === 'lobby' && prev && prev.phase.id === 'gameOver') { this.hud.closeAll(); this.hud.toast('🔁 חזרנו ללובי – משחק חדש!'); }
    if (id === 'evictionVote') audio.sfx('evict');
    if (id === 'reveal') audio.sfx('sting');
    if (id !== 'confession' && id !== 'nomination') this.hud.closeModal('diary');
  }

  ensureIntro(s) {
    const d = s.phase.data;
    if (!this.intro) {
      this.hud.showHud(false);
      this.hud.closeAll();
      this.introWaitingPlayer = true;
      this.intro = null;
      // build the cutscene (also acts as the "loading" step) then report ready
      import('./cutscene/Intro.js').then(({ IntroPlayer }) => {
        if (this.state.phase.id !== 'intro' || this.intro) return;
        const bb = s.players.find((p) => p.role === 'bb');
        this.intro = new IntroPlayer({ engine: this.engine, order: d.order, players: s.players, mode: d.mode, ui: this.hud, startAt: d.startAt || Infinity, net: this.net, bbName: bb?.name });
        this.net.send({ t: 'ready' });
        if (d.startAt && this.net.serverNow() - d.startAt > 1500) this.intro.skipToEnd();
        if (d.skipped) this.intro.skipToEnd();
        this.hud.showSkip(s.hostId === s.you.id);
      });
      return;
    }
    if (d.startAt && this.intro.startAt !== d.startAt) this.intro.startAt = d.startAt;
  }

  ensureExit(s) {
    if (this.exitScene || this.exitLoading) return;
    this.exitLoading = true;
    import('./cutscene/ExitScene.js').then(({ ExitScene }) => {
      this.exitLoading = false;
      if (this.state.phase.id !== 'exitScene') return;
      this.hud.showHud(false); this.hud.closeAll();
      this.exitScene = new ExitScene({ engine: this.engine, ids: s.phase.data.ids, players: this.state.players, ui: this.hud, startAt: s.phase.data.startAt, net: this.net });
    });
  }
  endExit() { this.exitScene?.dispose(); this.exitScene = null; this.hud.showHud(true); this.hud.fade(0, 0.3); }

  myRoom() { return roomAt(this.controller.s.x, this.controller.s.z); }

  endIntro() {
    this.intro?.dispose();
    this.intro = null;
    this.hud.clearIntro();
    this.hud.showHud(true);
    this.hud.fade(0, 0.3);
  }

  onEvent(m) {
    const s = this.state;
    const P = (id) => this.players.get(id);
    switch (m.k) {
      case 'toast': this.hud.toast(m.text, m.kind); if (s?.you.role === 'bb' && m.kind === 'bb') this.hud.bbFeed(m.text); break;
      case 'announce':
        this.hud.announce(m.text, m.from);
        audio.sfx(m.sound || 'chime');
        if (m.voice !== false) setTimeout(() => audio.speak(m.text.replace(/[\u{1F300}-\u{1FAFF}☀-➿]/gu, '')), 700);
        if (s?.you.role === 'bb') this.hud.bbFeed('📢 ' + m.text);
        break;
      case 'tts': audio.speak(m.text); this.hud.subtitle(m.text, 3); break;
      case 'sfx': audio.sfx(m.s, m.pos); break;
      case 'phase': break;
      case 'emote': { const e = P(m.pid); if (e) { e.avatar.emote(m.id); const em = EMOTES.find((x) => x.id === m.id); if (em) this.fx.emoji(e.pos, em.icon); } break; }
      case 'swing': { const e = P(m.pid); e?.avatar.doSwing(m.kind); break; }
      case 'hit': {
        const a = P(m.a), b = P(m.b);
        const pos = b?.pos || (m.b === s?.you.id ? new THREE.Vector3(this.controller.s.x, this.controller.s.y, this.controller.s.z) : null);
        if (pos) {
          audio.sfx(m.kind === 'pillow' || m.item === 'pillow' ? 'pillow' : m.kind === 'throw' ? 'splat' : 'pow', [pos.x, pos.y + 1.2, pos.z]);
          if (m.kind === 'pillow' || m.item === 'pillow') this.fx.burst(pos.x, pos.y + 1.4, pos.z, 'feathers', 26);
          else if (m.kind !== 'throw') { this.fx.text(pos, m.kind === 'punch' ? 'POW!' : 'בום!'); this.fx.burst(pos.x, pos.y + 1.3, pos.z, 'sparks', 14); }
        }
        if (b && m.fall) b.avatar.tumble(); else if (b) b.pendingFall = m.fall;
        if (a && m.kind !== 'throw') a.avatar.doSwing(m.kind);
        break;
      }
      case 'splash': {
        const e = P(m.pid);
        if (e) this.fx.burst(e.pos.x, e.pos.y + 1.6, e.pos.z, 'splash', 40);
        audio.sfx('splash', e ? [e.pos.x, 1.4, e.pos.z] : null);
        if (m.pid === s?.you.id) this.hud.fxFlash('splash-fx', 1600);
        break;
      }
      case 'splat': { const e = P(m.pid); if (e) this.fx.burst(e.pos.x, e.pos.y + 1.5, e.pos.z, 'splat', 24); if (m.pid === s?.you.id) this.hud.fxFlash('splat-fx', 2400); break; }
      case 'confetti': this.fx.burst(m.x, m.y, m.z, 'confetti', 80); audio.sfx('confetti', [m.x, m.y, m.z]); break;
      case 'piano': audio.sfx('piano', [...m.pos, m.n]); break;
      case 'shower': { const it = INTERACTABLES.find((x) => x.id === m.id); if (it) { for (let i = 0; i < 6; i++) setTimeout(() => this.fx.burst(it.x, 2.1, it.z - 0.3, 'water', 25), i * 400); audio.sfx('shower', [it.x, 1.5, it.z]); } break; }
      case 'dogWag': this.dog.wag = 2; audio.sfx('bark', [this.dog.g.position.x, 0.6, this.dog.g.position.z]); break;
      case 'fridge': break;
      case 'lavaWarn': this.lavaAt = m.at; audio.sfx('alarm'); this.hud.subtitle('🔥 לבה בעוד 3 שניות! עלו על רהיט!', 3); break;
      case 'lava': this.lavaFlashUntil = performance.now() + 1200; audio.sfx('lava'); if (m.burned.includes(s?.you.id)) this.hud.fxFlash('lava-fx', 1200); break;
      case 'statues': audio.sfx(m.red ? 'buzz' : 'ding'); break;
      case 'taskResult': this.hud.announce(`${m.res.title}: ${m.res.text}`); audio.sfx(m.res.success || m.res.winners?.includes(s?.you.id) ? 'success' : 'ding'); break;
      case 'role':
        if (m.role === 'hg' && m.spy) this.hud.announce(`🕵️ סוד: אתה המרגל! המטרה שלך – לגרום לפינוי של ${m.spyTarget}. חבל פעם ביום.`);
        break;
      case 'mission': break;
      case 'diaryOpen': this.hud.openDiary(m.canNominate); break;
      case 'nominateNow': this.hud.openNominateRemote(); break;
      case 'openShop': this.hud.openShop(); break;
      case 'openKeypad': this.hud.openKeypad(); break;
      case 'musicPicker': this.hud.openMusicPicker(); break;
      case 'letter': this.hud.openLetter(m.text); break;
      case 'allyInvite': break;
      case 'chat': this.hud.addChat(m); break;
      case 'react': {
        this.hud.flyReaction(m.e);
        const room = m.room;
        const r = INTERACTABLES.find((x) => x.room === room) || { x: 0.7, z: 0 };
        this.fx.emoji(new THREE.Vector3(r.x + (Math.random() - 0.5) * 3, 0.6, r.z + (Math.random() - 0.5) * 3), m.e, true);
        break;
      }
      case 'confession': this.hud.bbFeed(`🎙️ ${m.name}: "${m.text}"`); this.hud.toast(`🎙️ וידוי מ${m.name}`, 'bb'); break;
      case 'fightAlert': audio.sfx('alarm'); break;
      case 'introSkip': this.intro?.skipToEnd(); break;
      case 'sit': this.controller.sitAt({ x: m.x, z: m.z, y: m.y }, m.yaw); break;
      case 'exitWalk': this.exitWalk = { t: 0 }; break;
      case 'eyeBlink': audio.sfx('chime'); break;
      case 'openFridge': this.hud.openFridge(); break;
      case 'openTablet': this.hud.openTablet(); break;
      case 'openStove': this.hud.openStove(); break;
      case 'openCloset': this.hud.openCloset(); break;
      case 'cartAdd': this.hud.toast(`🛒 ${m.name} הוסיף ${m.icon}`); break;
      case 'eat': { const e = P(m.pid); if (e) this.fx.emoji(e.pos, m.icon); if (m.pid === s?.you.id) this.hud.toast(`${m.icon} ממממ`); break; }
      case 'cooking': audio.sfx('shower', [13.5, 1.1, -5.3]); break;
      case 'grilling': audio.sfx('shower', [-4.2, 1, 9.2]); this.fx.burst(-4.2, 1.2, 9.2, 'sparks', 30); break;
      case 'bbqDrop': audio.sfx('whoosh'); setTimeout(() => { audio.sfx('pow', [-4.2, 0.5, 9.2]); this.fx.burst(-4.2, 0.5, 9.2, 'confetti', 50); }, 3500); break;
      case 'fireworks': for (let i = 0; i < 12; i++) setTimeout(() => { const x = -14 + Math.random() * 28, z = 8 + Math.random() * 14, y = 8 + Math.random() * 6; this.fx.burst(x, y, z, 'confetti', 70); audio.sfx('pow', [x, y, z], 0.6); }, i * 600); break;
      case 'romanceInvite': this.hud.romanceInvite(m.from, m.name); break;
      case 'romance':
        this.house.setRomance({ x: m.x, z: m.z, until: m.until });
        for (const id of [m.a, m.b]) { const e = P(id); if (e) e.hiddenUntil = m.until; }
        if (m.a === s?.you.id || m.b === s?.you.id) { this.controller.lieAt({ x: m.x, z: m.z }); this.hud.setFx('dim-sleep', true); }
        for (let i = 0; i < 10; i++) setTimeout(() => this.fx.emoji(new THREE.Vector3(m.x, 0, m.z), i % 3 ? '❤️' : '🙈'), i * 1800);
        break;
      case 'saved': audio.sfx('win'); this.hud.fxFlash('splash-fx', 1200); { const e = P(m.id); if (e) this.fx.burst(e.pos.x, 2, e.pos.z, 'confetti', 90); } break;
      case 'outfit': { const e = P(m.pid); if (e) this.fx.burst(e.pos.x, 1.5, e.pos.z, 'confetti', 25); break; }
    }
  }

  // ------------------------------------------------------------------ first-person held item
  setViewModel(kind) {
    if (this.vmKind === kind) return;
    this.vmKind = kind;
    if (this.vm) { this.vm.removeFromParent(); this.vm = null; }
    if (!kind) return;
    this.vm = makeItemMesh(kind);
    this.vm.position.set(0.32, -0.32, -0.62);
    this.vm.traverse((o) => { if (o.isMesh) { o.renderOrder = 30; o.castShadow = false; } });
    this.camera.add(this.vm);
  }

  // ------------------------------------------------------------------ frame
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    const t = this.t;
    const s = this.state;
    const me = s?.you;
    // intro cutscene
    if (this.intro) {
      const done = this.intro.update(dt, t);
      this.intro.render();
      if (this.voice) {
        this.voice.allowed = me?.role === 'bb';
        this.voice.setPitch(me?.role === 'bb' ? 0.72 : 1);
        this.voice.update(dt, this.voiceCtx(s, { x: 0, z: 0 }));
      }
      if (done && s?.phase.id !== 'intro') this.endIntro();
      return;
    }
    if (!s) { this.engine.render(this.scene, this.camera); return; }
    if (this.exitScene) {
      this.exitScene.update(dt, t);
      this.exitScene.render();
      if (this.voice) { this.voice.allowed = me.role === 'bb' ? !!this.bbTalking : me.role !== 'fake'; this.voice.update(dt, this.voiceCtx(s, this.camera.position)); }
      this.hud.frame(dt);
      return;
    }
    // local player
    const viewer = me.role === 'bb' || me.role === 'ghost' || me.role === 'fake';
    if (!viewer) {
      if (this.exitWalk) this.updateExitWalk(dt);
      else this.controller.update(dt, this.input, this.colliders);
    }
    // targeting & hint
    this.target = this.findTarget();
    this.hud.setHint(this.hintFor(this.target));
    this.hud.clickToPlay(!this.input.mobile && this.input.wantLock && !this.input.locked && !this.hud.modals.size && me.role !== 'bb' && !document.activeElement?.matches('input,textarea'));
    // environment
    const fx = s.effects || {};
    const env = { night: NIGHT[s.phase.id] ?? 0, lights: s.lights, dark: !!fx.dark || (s.phase.id === 'evictionVote' && s.phase.data?.dark), party: !!fx.party, eviction: s.phase.id === 'evictionVote' || s.phase.id === 'reveal' || s.phase.id === 'bbDecision', now: this.net.serverNow() };
    this.house.update(dt, t, env);
    this.players.update(dt, t, this.camera, this.voice, { xray: me.xrayUntil > this.net.serverNow(), seeAll: me.role === 'bb', selfSpeaking: this.voice?.speaking, selfLevel: this.voice?.level });
    this.items.update(dt, t);
    this.fx.update(dt);
    this.dog.set(this.dogSnap, dt, t);
    this.markers.update(dt, t, this.lavaFlashUntil > performance.now());
    // music
    audio.setMood(s.music || 'calm');
    // voice rules
    if (this.voice) {
      const muted = Array.isArray(fx.muted?.v) && fx.muted.v.includes(me.id);
      this.voice.allowed = me.role === 'bb' ? !!this.bbTalking : me.role === 'fake' ? false : !muted;
      let pitch = 1;
      if (me.role === 'bb') pitch = 0.72;
      else if (fx.voice?.v === 'chipmunk') pitch = 1.6;
      else if (fx.voice?.v === 'deep') pitch = 0.66;
      if (fx.voicePersonal?.id === me.id) pitch = fx.voicePersonal.v === 'chipmunk' ? 1.6 : 0.66;
      this.voice.setPitch(pitch);
      const L = viewer && this.control ? this.control.listenerPos() : this.camera.position;
      this.voice.update(dt, this.voiceCtx(s, L));
    }
    // listener for 3D sfx
    const lc = viewer && this.control ? (this.control.mode === 'free' ? this.control.free : this.control.cams[this.control.sel].cam) : this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(lc.quaternion);
    audio.setListener(viewer && this.control ? this.control.listenerPos() : this.camera.position, fwd);
    // view-model sway / swing
    if (this.vm) {
      this.vmSwing = Math.max(0, (this.vmSwing || 0) - dt * 4);
      const k = Math.sin((1 - this.vmSwing) * Math.PI) * (this.vmSwing > 0 ? 1 : 0);
      this.vm.position.set(0.32 - k * 0.2, -0.32 + Math.sin(t * 6) * 0.01 * this.controller.moving + k * 0.15, -0.62 - k * 0.3);
      this.vm.rotation.set(-k * 1.2, 0, 0);
    }
    // sleep dim
    this.hud.setFx('dim-sleep', !!this.controller.sleep);
    // render
    if (viewer && this.control) this.control.update(dt, t);
    else this.engine.render(this.scene, this.camera);
    this.hud.frame(dt);
  }

  updateExitWalk(dt) {
    const w = this.exitWalk;
    w.t += dt;
    const target = EXIT_PATH[2];
    const c = this.controller;
    const dx = target.x - c.s.x, dz = target.z - c.s.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.3) { c.s.x += (dx / d) * Math.min(d, 2.2 * dt); c.s.z += (dz / d) * Math.min(d, 2.2 * dt); c.yaw = Math.atan2(-dx, -dz); c.moving = 1; c.s.y = groundAt(c.s.x, c.s.z, c.s.y + 0.3, this.colliders); }
    c.pitch *= 0.9;
    c.updateCamera(dt, 2.2);
    c.sendMove(dt);
    if (w.t > 3.5 || this.state.you.role === 'ghost') this.exitWalk = null;
  }

  voiceCtx(s, L) {
    const players = new Map();
    const mega = new Set();
    const now = this.net.serverNow();
    for (const p of s?.players || []) {
      const e = this.players.get(p.id);
      const pos = p.id === s.you.id ? this.controller.s : e?.pos || { x: 9999, y: 0, z: 9999 };
      players.set(p.id, { pos, role: p.role, connected: p.connected });
      if (p.mega) mega.add(p.id);
    }
    void now;
    return {
      me: s?.you, players, listener: L, phase: s?.phase.id, bbTalk: s?.bb?.talk, effects: s?.effects, mega,
      bbListen: this.control ? this.control.listenRoom() : null, viewer: ['bb', 'ghost', 'fake'].includes(s?.you.role), diaryOccupant: s?.diaryOccupant,
    };
  }
}

function seatOn(f, pos) {
  const t = FURNITURE_TYPES[f.type];
  const [w, d] = furnitureSize(f);
  const n = t.seats || 1;
  const yaw = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][f.rot % 4];
  let best = null;
  for (let i = 0; i < n; i++) {
    const tt = (i + 0.5) / n - 0.5;
    const x = f.x + (f.rot % 2 === 0 ? tt * w : 0), z = f.z + (f.rot % 2 === 0 ? 0 : tt * d);
    const dd = Math.hypot(x - pos.x, z - pos.z);
    if (!best || dd < best.dd) best = { x, z, y: t.size[2], yaw, dd };
  }
  return best;
}

function alertBox(text) {
  const d = document.createElement('div');
  d.className = 'modal-bg';
  d.style.zIndex = 60;
  d.innerHTML = `<div class="modal panel center"><h2>👁️</h2><p style="font-size:18px"></p><button class="btn">הבנתי</button></div>`;
  d.querySelector('p').textContent = text;
  d.querySelector('button').onclick = () => d.remove();
  document.getElementById('ui').appendChild(d);
}

export function boot() {
  const app = new App();
  window.__app = app;
  app.boot();
}
void roomAt; void FLAG;
