// =====================================================================
//  In-game HUD, overlays, modals, Big Brother control panel, ghost UI
// =====================================================================
import { el, esc, $, $$, on, fmtTime } from './dom.js';
import { eyeCanvas } from './screens.js';
import { PHASE_LABELS, EMOTES, REACTIONS, POWERS, SHOP, MUSIC_MOODS, MUSIC_LABELS, LIMITS } from '../../../shared/constants.js';
import { TASKS } from '../../../shared/tasks.js';
import { ROOMS, ROOM_BY_ID, DOORS } from '../../../shared/layout.js';
import { audio } from '../audio/Audio.js';
import { safeSet } from '../engine.js';
import { openTablet, openFridge, openStove, openCloset, openDecision, romanceInvite, renderViewer, removeViewer } from './life.js';
import { SEASONS } from '../../../shared/constants.js';

const TWISTS = [
  ['longNight', '🌑', 'הלילה הארוך'], ['swap', '🔀', 'החלפת מקומות'], ['surprise', '🚪', 'פינוי פתע'], ['secretPlayer', '🕵️', 'דייר סודי / חדר סודי'],
  ['lockDoors', '🔒', 'נעילת דלתות'], ['doubleEviction', '✌️', 'פינוי כפול'], ['blackoutVote', '🕯️', 'הצבעה בחושך'],
];
const EVENTS = [['yardParty', '🎆', 'מסיבת לילה בחצר'], ['pajama', '🛌', 'מסיבת פיג׳מות'], ['bbq', '🍖', 'מנגל מהשמיים'], ['power', '⚡', 'הפסקת חשמל'], ['dog', '🐶', 'כלב בבית'], ['letter', '✉️', 'מכתב מהבית'], ['party', '🪩', 'מסיבת ערב'], ['package', '📦', 'חבילה מסתורית'], ['scandal', '📰', 'שערורייה'], ['heatwave', '🥵', 'גל חום']];
const CAT_LABEL = { coop: '🤝 שיתופית', competitive: '🏆 תחרותית', social: '🗣️ חברתית', funny: '🤡 מצחיקה', dilemma: '⚖️ דילמה', punishment: '⚠️ עונש', secret: '🤫 חשאית' };

export class HUD {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.modals = new Map();
    this.chatLog = [];
    this.build();
  }

  get s() { return this.app.state; }
  get me() { return this.app.state?.you; }
  send(m) { this.app.net.send(m); }
  name(id) { return this.s?.players.find((p) => p.id === id)?.name || '?'; }

  build() {
    this.hud = el(`<div class="hud">
      <div class="hud-top"><div class="phase-pill"><span class="eyeslot"></span><div><div class="name"></div><div class="day"></div></div><div class="timer"></div></div></div>
      <div class="hud-right"><div class="row" style="justify-content:flex-end"><div class="chip prize">🏆 <span class="pz"></span></div><div class="chip hunger" title="רעב">🍽️ <span class="hg"></span></div><div class="chip coins pe">🪙 <span>0</span></div></div><div class="powers"></div><div class="cards-r col"></div></div>
      <div class="hud-left"><div class="cards-l col"></div></div>
      <div class="crosshair"></div>
      <div class="hint hidden"></div>
      <div class="held"></div>
      <div class="stamina"><i></i></div>
      <div class="mic panel pe"><span class="ico">🎙️</span><div class="meter lv"><i></i></div><span class="mtxt" style="font-size:12px"></span></div>
      <div class="toasts"></div>
      <div class="chat"><div class="log"></div><input class="pe hidden" maxlength="${LIMITS.CHAT_MAX}" placeholder="כתוב הודעה... (Enter לשליחה)"></div>
      <div class="fx"></div>
    </div>`);
    this.root.appendChild(this.hud);
    $('.eyeslot', this.hud).appendChild(eyeCanvas(34, 20));
    this.el = {
      phase: $('.phase-pill .name', this.hud), day: $('.phase-pill .day', this.hud), timer: $('.timer', this.hud),
      coins: $('.coins span', this.hud), powers: $('.powers', this.hud), cardsR: $('.cards-r', this.hud), cardsL: $('.cards-l', this.hud),
      hint: $('.hint', this.hud), cross: $('.crosshair', this.hud), mic: $('.mic', this.hud), micLv: $('.mic .lv i', this.hud), micTxt: $('.mic .mtxt', this.hud),
      toasts: $('.toasts', this.hud), chatLog: $('.chat .log', this.hud), chatIn: $('.chat input', this.hud), stamina: $('.stamina', this.hud), staminaI: $('.stamina i', this.hud),
      held: $('.held', this.hud), fx: $('.fx', this.hud), prize: $('.pz', this.hud), hunger: $('.hg', this.hud), hungerChip: $('.chip.hunger', this.hud),
    };
    this.el.mic.addEventListener('click', () => this.app.toggleMute());
    on(this.el.powers, '[data-p]', 'click', (e, b) => this.usePower(b.dataset.p));
    this.el.chatIn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = this.el.chatIn.value.trim();
        if (v) this.send({ t: 'chat', text: v });
        this.el.chatIn.value = '';
        this.closeChat();
      }
      e.stopPropagation();
    });
    this.overlay = el('<div class="overlay"></div>');
    this.root.appendChild(this.overlay);
  }

  // ------------------------------------------------------------------ basic feedback
  toast(text, kind = 'info') {
    const t = el(`<div class="toast ${kind}">${esc(text)}</div>`);
    this.el.toasts.prepend(t);
    while (this.el.toasts.children.length > 5) this.el.toasts.lastChild.remove();
    setTimeout(() => { t.style.transition = 'opacity .5s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 500); }, 4200);
  }
  announce(text, from = 'sys') {
    $('.announce', this.overlay)?.remove();
    const a = el(`<div class="announce"><div class="box"><div class="eyeslot"></div><div class="from">${from === 'bb' ? 'האח הגדול מכריז' : 'הודעה מהאח הגדול'}</div><div class="txt">${esc(text)}</div></div></div>`);
    $('.eyeslot', a).appendChild(eyeCanvas(120, 66));
    this.overlay.appendChild(a);
    clearTimeout(this.annT);
    const dur = Math.min(8000, 2600 + text.length * 60);
    this.annT = setTimeout(() => { a.style.transition = 'opacity .5s'; a.style.opacity = '0'; setTimeout(() => a.remove(), 500); }, dur);
  }
  subtitle(text, dur = 2.5) {
    $('.subtitle', this.overlay)?.remove();
    const s = el(`<div class="subtitle">${esc(text)}</div>`);
    this.overlay.appendChild(s);
    clearTimeout(this.subT);
    this.subT = setTimeout(() => s.remove(), dur * 1000);
  }
  addChat(m) {
    const cls = m.sys ? 'sys' : m.ch === 'ghost' ? 'ghost' : '';
    const d = el(`<div class="msg ${cls}">${m.sys ? '' : `<b>${esc(m.name)}${m.ch === 'ghost' ? ' 👻' : ''}:</b>`}${esc(m.text)}</div>`);
    this.el.chatLog.appendChild(d);
    while (this.el.chatLog.children.length > 8) this.el.chatLog.firstChild.remove();
    setTimeout(() => { d.style.transition = 'opacity 1s'; d.style.opacity = '0.0'; }, 14000);
  }
  openChat() { this.el.chatIn.classList.remove('hidden'); this.el.chatIn.focus(); $$('.msg', this.el.chatLog).forEach((m) => (m.style.opacity = '1')); this.app.input.exitLock(); }
  closeChat() { this.el.chatIn.classList.add('hidden'); this.el.chatIn.blur(); }
  setHint(h) {
    if (!h) { this.el.hint.classList.add('hidden'); this.el.cross.classList.remove('hot'); this.hintKey = ''; return; }
    this.el.cross.classList.add('hot');
    if (this.hintKey === h) return;
    this.hintKey = h;
    this.el.hint.innerHTML = `<kbd>${this.app.input.mobile ? 'E' : 'E'}</kbd>${esc(h)}`;
    this.el.hint.classList.remove('hidden');
  }
  setHeld(kind, name) { this.el.held.innerHTML = kind ? `<div class="held-chip">✋ ${esc(name)} • <b>G</b> לזרוק • <b>Q</b> להניח</div>` : ''; }
  fxFlash(cls, ms = 1800) { const d = el(`<div class="${cls}"></div>`); this.el.fx.appendChild(d); setTimeout(() => d.remove(), ms); }
  setFx(key, on, html = '') {
    let d = $(`[data-fx="${key}"]`, this.el.fx);
    if (on && !d) { d = el(`<div data-fx="${key}" class="${key}">${html}</div>`); this.el.fx.appendChild(d); }
    if (on && d && html && d.dataset.h !== html) { d.innerHTML = html; d.dataset.h = html; }
    if (!on && d) d.remove();
  }
  showHud(v) { this.hud.style.display = v ? '' : 'none'; }
  showConn(text) {
    let c = $('.conn', this.root);
    if (!text) { c?.remove(); return; }
    if (!c) { c = el('<div class="conn"></div>'); this.root.appendChild(c); }
    c.textContent = text;
  }
  clickToPlay(v) {
    let c = $('.click-to-play', this.hud);
    if (v && !c) this.hud.appendChild(el('<div class="click-to-play">🖱️ לחצו על המסך כדי לשלוט במצלמה (Esc לשחרור)</div>'));
    if (!v && c) c.remove();
  }

  // ------------------------------------------------------------------ intro overlays
  fade(to, dur) {
    let f = $('.fade', this.overlay);
    if (!f) { f = el('<div class="fade"></div>'); this.overlay.appendChild(f); }
    f.style.transition = `opacity ${dur}s`;
    f.style.opacity = to;
  }
  eyeOpen(dur) {
    const d = el('<div class="eye-open"></div>');
    const start = performance.now();
    d.appendChild(eyeCanvas(700, 380, { open: () => Math.min(1, Math.max(0.02, ((performance.now() - start) / 1000 / dur) * 1.4 - 0.15)) }));
    this.overlay.appendChild(d);
    setTimeout(() => { d.style.transition = 'opacity .4s'; d.style.opacity = '0'; setTimeout(() => d.remove(), 400); }, dur * 1000);
  }
  lowerThird(n, name, emoji, dur) {
    $('.lower3', this.overlay)?.remove();
    if (n === null || n === undefined) return;
    const d = el(`<div class="lower3"><div class="num">${n}</div><div class="info"><div class="lbl">דייר/ת מספר ${n} • האח הגדול</div><div class="nm">${esc(name)} ${esc(emoji || '')}</div></div></div>`);
    this.overlay.appendChild(d);
    setTimeout(() => d.remove(), dur * 1000);
  }
  titleCard(v) {
    $('.title-card', this.overlay)?.remove();
    if (v) this.overlay.appendChild(el('<div class="title-card"><img src="/logo.png" alt="האח הגדול"></div>'));
  }
  introWaiting(v) {
    const w = $('.intro-wait', this.overlay);
    if (v && !w) { const d = el('<div class="intro-wait"><div class="eyeslot"></div>האח הגדול מתכונן...<div class="muted" style="font-family:Rubik;font-size:16px">ממתינים שכל הדיירים יסיימו לטעון</div></div>'); $('.eyeslot', d).appendChild(eyeCanvas(200, 110)); this.overlay.appendChild(d); }
    if (!v && w) w.remove();
  }
  showSkip(v) {
    let b = $('.skip', this.overlay);
    if (v && !b) { b = el('<button class="btn ghost sm skip pe">דלג על הפתיח ⏭</button>'); b.onclick = () => this.send({ t: 'skipIntro' }); this.overlay.appendChild(b); }
    if (!v && b) b.remove();
  }
  clearIntro() { for (const c of ['.fade', '.eye-open', '.lower3', '.title-card', '.intro-wait', '.skip', '.subtitle']) $$(c, this.overlay).forEach((x) => x.remove()); }

  // ------------------------------------------------------------------ modals
  modal(id, html, opts = {}) {
    this.closeModal(id);
    const bg = el(`<div class="modal-bg" data-modal="${id}"><div class="modal panel ${opts.wide ? 'wide' : ''}">${opts.noClose ? '' : '<button class="close" aria-label="סגור">✕</button>'}${html}</div></div>`);
    if (opts.transparent) bg.style.background = 'transparent';
    this.root.appendChild(bg);
    this.modals.set(id, bg);
    if (!opts.noClose) bg.addEventListener('click', (e) => { if ((e.target === bg && !opts.sticky) || e.target.closest('.close')) this.closeModal(id); });
    this.app.input.exitLock();
    this.app.input.enabled = !!opts.keepInput;
    return bg;
  }
  closeModal(id) {
    const m = this.modals.get(id);
    if (m) { m.remove(); this.modals.delete(id); }
    if (!this.modals.size) this.app.input.enabled = true;
  }
  hasModal(id) { return this.modals.has(id); }
  closeAll() { for (const id of [...this.modals.keys()]) this.closeModal(id); }

  playerPicker(cands, { multi = 1, selected = [], disabled = [] } = {}) {
    return `<div class="plist">${cands.map((p) => `<button class="pcard ${selected.includes(p.id) ? 'on' : ''} ${disabled.includes(p.id) ? 'dis' : ''}" data-pid="${p.id}"><span class="dot" style="background:${esc(p.look.color)}"></span>${esc(p.look.emoji || '')} ${esc(p.name)}</button>`).join('')}</div>`;
  }

  openDiary(canNominate) {
    const s = this.s, me = this.me;
    const others = s.players.filter((p) => p.role === 'hg' && p.id !== me.id && !p.waiting);
    const picks = [];
    const m = this.modal('diary', `
      <h2>🎙️ חדר הוידוי</h2>
      <p class="muted">האח הגדול מקשיב. דבר בקול – או כתוב. מה שנאמר כאן נשאר כאן (כמעט).</p>
      ${canNominate ? `<h3>הגש שני מועמדים לפינוי</h3>${this.playerPicker(others)}
      <div class="row" style="margin-top:8px"><input class="grow r1 field" style="padding:10px;border-radius:10px;border:1px solid var(--line);background:rgba(0,0,0,.3);color:#fff" maxlength="80" placeholder="סיבה למועמד/ת הראשון/ה"><input class="grow r2" style="padding:10px;border-radius:10px;border:1px solid var(--line);background:rgba(0,0,0,.3);color:#fff" maxlength="80" placeholder="סיבה למועמד/ת השני/ה"></div>
      <button class="btn pink" data-a="nom" style="margin-top:10px;width:100%" disabled>הגש מועמדויות</button>` : `<p>${me.nominated ? '✅ כבר הגשת מועמדויות היום.' : 'מועמדויות מוגשות רק בזמן "חדר הוידוי".'}</p>`}
      <h3 style="margin-top:16px">וידוי (אופציונלי)</h3>
      <textarea class="conf" maxlength="200" rows="2" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:rgba(0,0,0,.3);color:#fff" placeholder="מה באמת עובר עליך?"></textarea>
      <label class="row muted" style="font-size:14px"><input type="checkbox" class="share"> אפשר לשתף אנונימית ביומן הדרמה</label>
      <div class="row"><button class="btn ghost sm" data-a="conf">שלח וידוי</button>
      ${!me.accused ? '<button class="btn ghost sm" data-a="accuse">🕵️ אני יודע מי המרגל</button>' : ''}
      <button class="btn sm" data-a="leave">צא מהחדר</button></div>`, { wide: true, sticky: true });
    on(m, '[data-pid]', 'click', (e, b) => {
      const id = b.dataset.pid;
      const i = picks.indexOf(id);
      if (i >= 0) picks.splice(i, 1); else { picks.push(id); if (picks.length > 2) picks.shift(); }
      $$('[data-pid]', m).forEach((x) => x.classList.toggle('on', picks.includes(x.dataset.pid)));
      const btn = $('[data-a=nom]', m); if (btn) btn.disabled = picks.length !== 2;
      audio.sfx('click');
    });
    on(m, '[data-a]', 'click', (e, b) => {
      const a = b.dataset.a;
      if (a === 'nom' && picks.length === 2) { this.send({ t: 'nominate', a: picks[0], b: picks[1], ra: $('.r1', m)?.value || '', rb: $('.r2', m)?.value || '' }); audio.sfx('sting'); this.openDiary(false); }
      if (a === 'conf') { const v = $('.conf', m).value.trim(); if (v) this.send({ t: 'confess', text: v, share: $('.share', m).checked }); $('.conf', m).value = ''; }
      if (a === 'accuse') this.openAccuse();
      if (a === 'leave') { this.closeModal('diary'); this.app.controller.standUp(); }
    });
  }
  openAccuse() {
    const others = this.s.players.filter((p) => p.role === 'hg' && p.id !== this.me.id);
    const m = this.modal('accuse', `<h2>🕵️ מי המרגל?</h2><p class="muted">פעם אחת במשחק. צדקת – חסינות ו-50 מטבעות. טעית – קנס של 40.</p>${this.playerPicker(others)}`);
    on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'accuse', id: b.dataset.pid }); this.closeModal('accuse'); });
  }
  openNominateRemote() {
    if (this.hasModal('nomR') || this.me.nominated) return;
    const others = this.s.players.filter((p) => p.role === 'hg' && p.id !== this.me.id && !p.waiting);
    const picks = [];
    const m = this.modal('nomR', `<h2>⚠️ מועמדויות</h2><p class="muted">בחר שני דיירים לפינוי (אנונימי).</p>${this.playerPicker(others)}<button class="btn pink" data-a="nom" style="margin-top:12px;width:100%" disabled>הגש</button>`, { sticky: true });
    on(m, '[data-pid]', 'click', (e, b) => {
      const id = b.dataset.pid; const i = picks.indexOf(id);
      if (i >= 0) picks.splice(i, 1); else { picks.push(id); if (picks.length > 2) picks.shift(); }
      $$('[data-pid]', m).forEach((x) => x.classList.toggle('on', picks.includes(x.dataset.pid)));
      $('[data-a=nom]', m).disabled = picks.length !== 2;
    });
    on(m, '[data-a=nom]', 'click', () => { this.send({ t: 'nominate', a: picks[0], b: picks[1] }); this.closeModal('nomR'); });
  }
  openTablet() { openTablet(this); }
  openFridge() { openFridge(this); }
  openStove() { openStove(this); }
  openCloset() { openCloset(this); }
  romanceInvite(from, name) { romanceInvite(this, from, name); }

  openShop() {
    const m = this.modal('shop', `<h2>🛒 חנות הבית</h2><p class="muted">יש לך <b style="color:var(--gold)">🪙 ${this.me.coins}</b></p><div class="shop">${SHOP.map((i) => `<button class="item" data-id="${i.id}" ${this.me.coins < i.price ? 'disabled style="opacity:.5"' : ''}><div class="ic">${i.icon}</div><b>${esc(i.label)}</b><div class="muted" style="font-size:12px">${esc(i.desc)}</div><div class="pr">🪙 ${i.price}</div></button>`).join('')}</div>`, { wide: true });
    on(m, '[data-id]', 'click', (e, b) => { this.send({ t: 'buy', id: b.dataset.id }); this.closeModal('shop'); });
  }
  openKeypad() {
    let code = '';
    const m = this.modal('keypad', `<h2>🔐 לוח הקוד</h2><div class="keypad-disp">_</div><div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '⌫', 0, '✔'].map((k) => `<button data-k="${k}">${k}</button>`).join('')}</div>`);
    const disp = $('.keypad-disp', m);
    on(m, '[data-k]', 'click', (e, b) => {
      const k = b.dataset.k;
      audio.sfx('tick');
      if (k === '⌫') code = code.slice(0, -1);
      else if (k === '✔') { this.send({ t: 'taskInput', d: { code } }); this.closeModal('keypad'); return; }
      else if (code.length < 8) code += k;
      disp.textContent = code || '_';
    });
  }
  openMusicPicker() {
    const m = this.modal('music', `<h2>🎵 בחר מוזיקה לבית</h2><div class="row">${MUSIC_MOODS.map((x) => `<button class="btn ghost" data-m="${x}">${MUSIC_LABELS[x]}</button>`).join('')}</div>`);
    on(m, '[data-m]', 'click', (e, b) => { this.send({ t: 'setMusic', mood: b.dataset.m }); this.closeModal('music'); });
  }
  openLetter(text) { this.modal('letter', `<h2>✉️ מכתב מהבית</h2><div class="letter">${esc(text)}</div>`); audio.sfx('chime'); }
  allyInvite(from, name) {
    const m = this.modal('ally', `<h2>🤝 הצעת ברית</h2><p><b>${esc(name)}</b> מציע/ה לך ברית סודית. בני ברית רואים 🤝 אחד מעל השני.</p><div class="row"><button class="btn" data-y="1">קבל</button><button class="btn ghost" data-y="0">דחה</button></div>`, { keepInput: true });
    on(m, '[data-y]', 'click', (e, b) => { this.send({ t: 'allyAccept', from, yes: b.dataset.y === '1' }); this.closeModal('ally'); });
  }
  playerMenu(p) {
    const me = this.me;
    const ally = me.alliance?.members.includes(p.id);
    const m = this.modal('pmenu', `<h2>${esc(p.look.emoji || '')} ${esc(p.name)}</h2>
      <div class="col">
        ${ally ? '<div class="chip">🤝 בן/בת ברית</div><button class="btn ghost" data-a="leave">💔 עזוב את הברית</button>' : '<button class="btn" data-a="ally">🤝 הצע ברית סודית</button>'}
        ${['bedroom', 'secret'].includes(this.app.myRoom()) ? '<button class="btn pink" data-a="romance">💕 הזמנה מתחת לשמיכה</button>' : ''}
        <div class="row"><button class="btn ghost" data-a="gift" data-n="10">🎁 תן 10 מטבעות</button><button class="btn ghost" data-a="gift" data-n="25">🎁 תן 25</button></div>
      </div>`);
    on(m, '[data-a]', 'click', (e, b) => {
      const a = b.dataset.a;
      if (a === 'ally') this.send({ t: 'allyInvite', id: p.id });
      if (a === 'leave') this.send({ t: 'allyLeave' });
      if (a === 'romance') this.send({ t: 'romance', id: p.id });
      if (a === 'gift') this.send({ t: 'gift', to: p.id, n: Number(b.dataset.n) });
      this.closeModal('pmenu');
    });
  }
  emoteWheel() {
    const m = this.modal('emotes', `<h2>😀 אימוטים</h2><div class="emote-wheel">${EMOTES.map((e, i) => `<button data-e="${e.id}"><span>${e.icon}</span>${esc(e.label)} <small class="muted">${(i + 1) % 10}</small></button>`).join('')}</div>`, { keepInput: true });
    on(m, '[data-e]', 'click', (e, b) => { this.app.doEmote(b.dataset.e); this.closeModal('emotes'); });
  }
  powersMenu() {
    const pw = Object.entries(this.me.powers || {}).filter(([, n]) => n > 0);
    if (!pw.length) return this.toast('אין לך כוחות מיוחדים. נצח במשימות או קנה בחנות.');
    const m = this.modal('powers', `<h2>⚡ כוחות מיוחדים</h2><div class="col">${pw.map(([id, n]) => `<button class="btn ghost" data-p="${id}">${POWERS[id].icon} ${POWERS[id].label} ×${n}<div class="muted" style="font-size:12px;font-weight:400">${esc(POWERS[id].desc)}</div></button>`).join('')}</div>`);
    on(m, '[data-p]', 'click', (e, b) => { this.closeModal('powers'); this.usePower(b.dataset.p); });
  }
  usePower(id) {
    const s = this.s;
    if (id === 'peek') {
      const c = s.players.filter((p) => p.role === 'hg' && p.id !== this.me.id);
      const m = this.modal('pw', `<h2>👁️ הצצה – בחר דייר</h2>${this.playerPicker(c)}`);
      on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'usePower', id, target: b.dataset.pid }); this.closeModal('pw'); });
    } else if (id === 'veto') {
      const c = s.players.filter((p) => s.nominees.includes(p.id));
      const m = this.modal('pw', `<h2>✋ וטו – איזה מועמד להציל?</h2>${this.playerPicker(c)}`);
      on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'usePower', id, target: b.dataset.pid }); this.closeModal('pw'); });
    } else if (id === 'swap') {
      const noms = s.players.filter((p) => s.nominees.includes(p.id));
      let target = null;
      const m = this.modal('pw', `<h2>🔄 החלפה</h2><p>מי יוצא מהרשימה?</p>${this.playerPicker(noms)}<p>ומי נכנס במקומו?</p><div class="second">${this.playerPicker(s.players.filter((p) => p.role === 'hg' && !s.nominees.includes(p.id) && p.id !== this.me.id))}</div>`);
      on(m, '[data-pid]', 'click', (e, b) => {
        if (!b.closest('.second')) { target = b.dataset.pid; $$('[data-pid]', m).forEach((x) => !x.closest('.second') && x.classList.toggle('on', x === b)); return; }
        if (target) { this.send({ t: 'usePower', id, target, with: b.dataset.pid }); this.closeModal('pw'); }
      });
    } else this.send({ t: 'usePower', id });
  }

  playerList(show) {
    if (!show) return this.closeModal('plist');
    const s = this.s;
    const isHost = s.hostId === this.me.id;
    const role = (p) => (p.role === 'bb' ? '👁️ האח הגדול' : p.role === 'ghost' ? '👻 פונה' : p.waiting ? '🕵️ בחדר הסודי' : '🏠 דייר');
    const m = this.modal('plist', `<h2>👥 הדיירים</h2><div class="col">${s.players.map((p) => `<div class="pl row" style="padding:6px 10px;border-radius:10px;background:rgba(255,255,255,.04)">
      <span class="dot" style="width:14px;height:14px;border-radius:50%;background:${esc(p.look.color)}"></span>
      <b class="grow">${esc(p.look.emoji || '')} ${esc(p.name)}</b><span class="muted">${role(p)}</span>
      ${p.host ? '<span class="tag host">מארח</span>' : ''}${!p.connected ? '<span class="tag off">מנותק</span>' : ''}${p.immune ? '🛡️' : ''}
      <span style="color:var(--gold)">🪙${p.coins}</span>
      ${isHost && p.id !== this.me.id ? `<button class="btn red sm" data-kick="${p.id}">הוצא</button>` : ''}
      ${isHost && s.phase.id !== 'lobby' && !s.bb.connected && p.role === 'ghost' ? `<button class="btn sm" data-bb="${p.id}">הפוך לאח הגדול</button>` : ''}
    </div>`).join('')}</div>`, { keepInput: true });
    on(m, '[data-kick]', 'click', (e, b) => { if (confirm('להוציא את השחקן מהבית?')) this.send({ t: 'kick', id: b.dataset.kick }); this.closeModal('plist'); });
    on(m, '[data-bb]', 'click', (e, b) => { this.send({ t: 'assignBB', id: b.dataset.bb }); this.closeModal('plist'); });
  }

  settings() {
    const a = this.app;
    const vol = audio.vol;
    const m = this.modal('settings', `<h2>⚙️ הגדרות</h2>
      <div class="col">
        <div class="field"><label>עוצמה כללית</label><input type="range" min="0" max="1" step="0.05" value="${vol.master}" data-v="master"></div>
        <div class="field"><label>מוזיקה</label><input type="range" min="0" max="1" step="0.05" value="${vol.music}" data-v="music"></div>
        <div class="field"><label>אפקטים</label><input type="range" min="0" max="1" step="0.05" value="${vol.sfx}" data-v="sfx"></div>
        <div class="field"><label>קולות שחקנים</label><input type="range" min="0" max="2" step="0.05" value="${vol.voice}" data-v="voice"></div>
        <div class="field"><label>רגישות עכבר/מגע</label><input type="range" min="0.3" max="2.5" step="0.05" value="${a.input.sens}" data-sens></div>
        <label class="row"><input type="checkbox" data-ptt ${a.voice?.ptt ? 'checked' : ''}> Push-to-talk (להחזיק V כדי לדבר)</label>
        <label class="row"><input type="checkbox" data-tts ${audio.ttsOff ? '' : 'checked'}> קריינות קולית (Web Speech)</label>
        <div class="field"><label>איכות גרפיקה (דורש רענון)</label><select data-q><option value="low">נמוכה (טלפון)</option><option value="medium">בינונית</option><option value="high">גבוהה</option></select></div>
        <div class="row"><button class="btn ghost" data-a="help">❓ מקשים</button><button class="btn red" data-a="leave">🚪 צא מהמשחק</button></div>
      </div>`, { keepInput: false });
    $('[data-q]', m).value = a.engine.quality;
    on(m, '[data-v]', 'input', (e, i) => audio.setVolume(i.dataset.v, Number(i.value)));
    $('[data-sens]', m).addEventListener('input', (e) => { a.input.sens = Number(e.target.value); safeSet('bb_sens', e.target.value); });
    $('[data-ptt]', m).addEventListener('change', (e) => { if (a.voice) a.voice.ptt = e.target.checked; safeSet('bb_ptt', e.target.checked ? '1' : ''); });
    $('[data-tts]', m).addEventListener('change', (e) => { audio.ttsOff = !e.target.checked; });
    $('[data-q]', m).addEventListener('change', (e) => { safeSet('bb_quality', e.target.value); this.toast('האיכות תשתנה אחרי רענון'); });
    on(m, '[data-a]', 'click', (e, b) => {
      if (b.dataset.a === 'help') { this.closeModal('settings'); import('./screens.js').then((s) => s.showHowTo()); }
      if (b.dataset.a === 'leave' && confirm('לצאת מהמשחק?')) a.leave();
    });
  }

  // ------------------------------------------------------------------ state rendering
  render(s) {
    const me = s.you;
    const ph = s.phase;
    this.el.phase.textContent = PHASE_LABELS[ph.id] || '';
    const left = (s.nextEvictionDay ?? 0) - ph.day;
    this.el.day.textContent = ph.id === 'lobby' ? `קוד הבית: ${s.code}` : ph.id === 'gameOver' ? 'העונה הסתיימה' : `יום ${ph.day} • ${left <= 0 ? '🔴 ליל פינוי' : left === 1 ? 'פינוי מחר' : `פינוי בעוד ${left} ימים`}`;
    this.el.prize.textContent = '₪' + (s.prize ?? 0).toLocaleString('en-US');
    this.el.hunger.textContent = me.hunger ?? '';
    this.el.hungerChip.style.display = me.role === 'hg' && ph.id !== 'lobby' ? '' : 'none';
    this.el.hungerChip.classList.toggle('low', (me.hunger ?? 100) < 25);
    if (this.hasModal('tablet')) this.tabletRedraw?.();
    this.el.coins.textContent = me.coins;
    // powers
    const pw = Object.entries(me.powers || {}).filter(([, n]) => n > 0);
    const pkey = JSON.stringify(pw) + me.immune;
    if (pkey !== this.pkey) {
      this.pkey = pkey;
      this.el.powers.innerHTML = (me.immune ? '<div class="power" title="חסינות להיום">🛡️</div>' : '') + pw.map(([id, n]) => `<button class="power" data-p="${id}" title="${esc(POWERS[id].label)}">${POWERS[id].icon}${n > 1 ? `<b>${n}</b>` : ''}</button>`).join('');
    }
    this.renderCards(s);
    this.renderPhaseUI(s);
    if (me.role === 'bb') this.renderBB(s);
    if (me.role === 'ghost') this.renderGhost(s); else this.removeGhost();
    if (me.role === 'ghost' || me.role === 'fake') renderViewer(this, s); else removeViewer(this);
    if (ph.id === 'lobby') this.renderLobby(s); else $('.lobby', this.hud)?.remove();
    if (me.invite && !this.hasModal('ally') && this.lastInvite !== me.invite.at) { this.lastInvite = me.invite.at; this.allyInvite(me.invite.from, me.invite.name); }
  }

  renderCards(s) {
    const me = s.you;
    const L = [], R = [];
    const t = s.task;
    if (t && me.role !== 'bb') {
      let prog = '';
      const pub = t.pub || {};
      switch (t.kind) {
        case 'gather': prog = `בפנים: ${pub.inside}/${pub.total} • ${pub.hold}/${pub.need} ש׳<div class="progress"><i style="width:${(pub.hold / pub.need) * 100}%"></i></div>`; break;
        case 'relay': prog = `עבר ב-${pub.touched?.length || 0}/${pub.total} ידיים`; break;
        case 'deliver': prog = `הובאו ${pub.delivered}/${pub.count}<div class="progress"><i style="width:${(pub.delivered / pub.count) * 100}%"></i></div>`; break;
        case 'quiet': prog = `שקט: ${pub.silent}/${pub.need} ש׳<div class="progress"><i style="width:${(pub.silent / pub.need) * 100}%"></i></div>`; break;
        case 'collect': prog = `אספת: ${pub.scores?.[me.id] || 0} • נשארו ${pub.left}`; break;
        case 'race': prog = `טבעת ${Math.min((pub.idx?.[me.id] || 0) + 1, pub.cps?.length || 0)}/${pub.cps?.length}`; break;
        case 'hideseek': prog = pub.seeker === me.id ? '🔎 אתה המחפש! הסתכל על דייר קרוב ולחץ F/קליק' : `המחפש: ${esc(this.name(pub.seeker))} • נמצאו ${pub.found?.length || 0}`; break;
        case 'lava': prog = `❤️ חיים: ${pub.lives?.[me.id] ?? '-'} • סבב ${pub.round}/${pub.rounds}`; break;
        case 'koth': prog = `👑 ${pub.holder ? esc(this.name(pub.holder)) : 'אף אחד'} • הזמן שלך: ${pub.time?.[me.id] || 0} ש׳`; break;
        case 'pillow': prog = `❤️ חיים: ${pub.lives?.[me.id] ?? '-'}`; break;
        case 'statues': prog = pub.out?.includes(me.id) ? '🗿 נפסלת' : pub.red ? '🔴 קפאו!' : '🟢 זוזו!'; break;
        case 'cook': prog = `המנה שלך: ${esc(pub.dishes?.[me.id] || '0/3')}`; break;
        case 'dance': prog = `זמן ריקוד על הבמה: ${pub.dance?.[me.id] || 0} ש׳`; break;
        case 'judged': prog = 'האח הגדול שופט 👁️'; break;
      }
      if (t.priv?.digits) prog += `<div style="margin-top:6px;font-size:18px">🔢 הספרות שלך: ${t.priv.digits.map((d) => `<b style="color:var(--gold)">#${d.pos}=${d.d}</b>`).join(' ')}</div>`;
      if (t.priv?.role === 'killer') prog += `<div style="margin-top:6px;color:var(--pink)"><b>🔪 ${esc(t.priv.text)}</b></div>`;
      L.push(`<div class="card panel"><h4>📋 ${esc(t.title)}</h4>${esc(t.desc)}${prog ? `<div style="margin-top:6px">${prog}</div>` : ''}</div>`);
    }
    if (me.role === 'hg' && me.mission && s.phase.id !== 'lobby') {
      const mm = me.mission;
      L.push(`<div class="card panel mission"><h4>🤫 משימה חשאית ${mm.done ? '✅' : ''}</h4>${esc(mm.text)}${mm.auto && !mm.done ? `<div class="progress"><i style="width:${Math.min(100, (mm.progress / mm.n) * 100)}%"></i></div>` : ''}</div>`);
    }
    if (me.spy) R.push(`<div class="card panel spy"><h4>🕵️ אתה המרגל</h4>המטרה: לגרום לפינוי של <b>${esc(me.spyTarget || '?')}</b>. ${me.sabUsed ? 'החבלה היומית נוצלה.' : '<button class="btn pink sm pe" data-sab>🔧 חבל (פעם ביום)</button>'}</div>`);
    if (me.alliance) R.push(`<div class="card panel"><h4>🤝 הברית שלך</h4>${me.alliance.members.filter((x) => x !== me.id).map((id) => esc(this.name(id))).join(', ')}</div>`);
    if (me.secretWaiting) L.push('<div class="card panel spy"><h4>🕵️ דייר סודי</h4>אתה מחכה בחדר הסודי. כשהאח הגדול ישחרר אותך – תיכנס לבית בהפתעה!</div>');
    if (me.isolatedUntil > this.app.net.serverNow()) L.push(`<div class="card panel spy"><h4>🚨 בידוד</h4>יציאה בעוד ${Math.ceil((me.isolatedUntil - this.app.net.serverNow()) / 1000)} שניות</div>`);
    const key = L.join('') + '|' + R.join('');
    if (key !== this.cardKey) {
      this.cardKey = key;
      this.el.cardsL.innerHTML = L.join('');
      this.el.cardsR.innerHTML = R.join('');
      $('[data-sab]', this.el.cardsR)?.addEventListener('click', () => this.send({ t: 'sabotage' }));
    }
  }

  renderPhaseUI(s) {
    const me = s.you, ph = s.phase, d = ph.data || {};
    const key = ph.id + ':' + ph.day;
    const changed = key !== this.phaseKey;
    this.phaseKey = key;
    if (changed) { for (const id of ['nomR', 'vote', 'reveal', 'summary', 'diary', 'final', 'taskVote', 'dilemma', 'sacrifice', 'tie']) this.closeModal(id); $('.reveal', this.overlay)?.remove(); $('.trivia', this.overlay)?.remove(); }
    // remote nomination
    if (ph.id === 'nomination' && me.role === 'hg' && !me.nominated && !me.secretWaiting) this.openNominateRemote();
    if (ph.id !== 'nomination') this.closeModal('nomR');
    // reveal sequence
    if (ph.id === 'reveal' && changed) this.showReveal(s);
    if (ph.id === 'reveal') this.updateRevealPowers(s);
    if (ph.id === 'bbDecision') { if (me.role === 'bb') openDecision(this); else this.setFx('ghost-banner', true, '👁️ הדיירים הצביעו... האח הגדול מכריע.'); }
    else this.closeModal('decide');
    if (ph.id === 'budget' && me.role === 'hg' && changed) this.toast('📱 ישיבת תקציב! גשו לטאבלט על שולחן הסלון (E)', 'gold');
    // eviction vote
    if (ph.id === 'evictionVote') {
      const eligible = me.role === 'hg' && d.voters?.includes(me.id);
      const ghost = me.role === 'ghost';
      if ((eligible || ghost) && !d.myVote && !d.tiebreak && !this.hasModal('vote')) this.openVote(s, ghost);
      if (d.myVote) this.closeModal('vote');
    } else this.closeModal('tie');
    if (ph.id === 'finalVote' && (me.role === 'ghost' || me.role === 'bb') && !d.myVote && !this.hasModal('final')) this.openFinalVote(s);
    if (ph.id === 'finalVote' && d.myVote) this.closeModal('final');
    if (ph.id === 'summary' && changed) this.showSummary(d.journal);
    if (ph.id === 'gameOver' && changed) this.showGameOver(s);
    // eviction banner
    if (ph.id === 'bbDecision') { /* banner set above */ } else if (ph.id === 'eviction') {
      const ev = d.evicted || [];
      this.setFx('ghost-banner', true, ev.includes(me.id) ? '🎤 נאום הפרידה שלך – כל הבית שומע אותך עכשיו' : `🚪 ${esc(ev.map((id) => this.name(id)).join(', '))} עוזב/ת את הבית`);
    } else this.setFx('ghost-banner', false);
    // task-specific UIs
    this.renderTaskUI(s);
  }

  showReveal(s) {
    const d = s.phase.data;
    const order = d.order || [];
    const ov = el(`<div class="reveal"><h1 style="font-size:clamp(28px,5vw,52px)">⚠️ המועמדים לפינוי</h1><div class="cards"></div><div class="row pw"></div></div>`);
    const cards = $('.cards', ov);
    const shown = order.length ? order : (d.nominees || []).map((id) => ({ id, c: 0 }));
    shown.forEach((o) => {
      const p = s.players.find((x) => x.id === o.id);
      if (!p) return;
      cards.appendChild(el(`<div class="rcard ${d.nominees.includes(o.id) ? 'nom' : ''}" data-id="${o.id}"><div class="in"><div class="f"><div style="font-size:42px">${esc(p.look.emoji || '👤')}</div><div class="nm">${esc(p.name)}</div></div><div class="b"><div class="cnt">${o.c}</div><div class="nm">${esc(p.name)}</div><div class="muted">${d.nominees.includes(o.id) ? 'מועמד/ת!' : 'ניצל/ה'}</div></div></div></div>`));
    });
    this.overlay.appendChild(ov);
    const els = $$('.rcard', cards);
    els.forEach((c, i) => setTimeout(() => { c.classList.add('flip'); audio.sfx(c.classList.contains('nom') ? 'sting' : 'tick'); }, 1400 + i * Math.min(1300, 9000 / els.length)));
    setTimeout(() => ov.remove(), Math.max(6000, (s.phase.endsAt - this.app.net.serverNow()) - 500));
    ov.addEventListener('click', () => ov.remove());
  }
  updateRevealPowers(s) {
    const pw = $('.reveal .pw', this.overlay);
    if (!pw) return;
    const me = s.you;
    const html = [me.powers?.veto > 0 ? '<button class="btn gold" data-p="veto">✋ השתמש בוטו</button>' : '', me.powers?.swap > 0 ? '<button class="btn gold" data-p="swap">🔄 השתמש בהחלפה</button>' : ''].join('');
    if (pw.dataset.h !== html) { pw.dataset.h = html; pw.innerHTML = html; on(pw, '[data-p]', 'click', (e, b) => { e.stopPropagation(); this.usePower(b.dataset.p); }); }
  }
  openVote(s, ghost) {
    const noms = s.players.filter((p) => s.nominees.includes(p.id));
    const m = this.modal('vote', `<h2>${ghost ? '🍿 הצבעת הקהל' : '🔴 את מי לפנות?'}</h2><p class="muted">${ghost ? 'הרוב בקהל מוסיף קול אחד.' : 'ההצבעה חסויה. האח הגדול רואה.'}</p><div class="vote-big">${noms.map((p) => `<button class="pcard" data-pid="${p.id}"><span style="font-size:34px">${esc(p.look.emoji || '👤')}</span>${esc(p.name)}</button>`).join('')}</div>`, { noClose: !ghost, transparent: false, wide: true });
    on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'vote', id: b.dataset.pid }); audio.sfx('ding'); this.closeModal('vote'); this.toast('ההצבעה נקלטה 🗳️'); });
  }
  openTiebreak(ids) {
    if (this.hasModal('tie')) return;
    const c = this.s.players.filter((p) => ids.includes(p.id));
    const m = this.modal('tie', `<h2>⚖️ תיקו – האח הגדול מכריע</h2><p class="muted">בחר מי מפונה</p>${this.playerPicker(c)}`, { noClose: true });
    on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'bb', c: 'tiebreak', id: b.dataset.pid }); this.closeModal('tie'); });
  }
  openFinalVote(s) {
    const f = s.players.filter((p) => s.phase.data.finalists.includes(p.id));
    const m = this.modal('final', `<h2>🏆 מי צריך לנצח?</h2>${s.phase.data.taskWinner ? `<p class="muted">${esc(this.name(s.phase.data.taskWinner))} ניצח במשימת הגמר ומקבל קול בונוס</p>` : ''}<div class="vote-big">${f.map((p) => `<button class="pcard" data-pid="${p.id}"><span style="font-size:34px">${esc(p.look.emoji || '👤')}</span>${esc(p.name)}</button>`).join('')}</div>`, { wide: true });
    on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'vote', id: b.dataset.pid }); this.closeModal('final'); });
  }
  showSummary(j) {
    if (!j) return;
    this.modal('summary', `<h2>📔 יומן הדרמה – יום ${j.day}</h2><ul class="journal" style="padding:0">${j.lines.map((l, i) => `<li style="animation-delay:${i * 0.5}s">${esc(l)}</li>`).join('')}</ul>`, { wide: true, keepInput: true });
    audio.sfx('chime');
  }
  showGameOver(s) {
    const d = s.phase.data;
    const w = s.players.find((p) => p.id === d.winner);
    const aw = s.awards || d.awards || [];
    const m = this.modal('gameover', `<div class="center"><div style="font-size:64px">🏆</div><h1 style="font-size:clamp(30px,6vw,56px);color:var(--gold)">${w ? esc(w.name) : '—'}</h1><div class="tagline">המנצח/ת של העונה!</div></div>
      <h3>🎖️ פרסי העונה</h3><div class="awards">${aw.map((a, i) => `<div class="award" style="animation-delay:${0.3 + i * 0.25}s"><div class="ic">${a.icon}</div><div class="t">${esc(a.title)}</div><div class="n">${esc(a.name)}</div><div class="w">${esc(a.why)}</div></div>`).join('')}</div>
      <div class="row" style="margin-top:16px;justify-content:center">${s.hostId === s.you.id ? '<button class="btn" data-a="again">🔁 משחק חוזר</button>' : '<span class="muted">המארח יכול להתחיל משחק חוזר</span>'}<button class="btn ghost" data-a="close">צפה בבית</button></div>`, { wide: true, noClose: true });
    on(m, '[data-a]', 'click', (e, b) => { if (b.dataset.a === 'again') this.send({ t: 'lobbyAgain' }); this.closeModal('gameover'); });
    audio.sfx('win');
  }

  renderTaskUI(s) {
    const t = s.task, me = s.you;
    const tr = $('.trivia', this.overlay);
    if (t?.kind === 'trivia' && me.role === 'hg' && t.pub && !t.pub.done) {
      const p = t.pub;
      const mine = p.answered?.includes(me.id);
      const key = p.qi + ':' + p.reveal + ':' + mine;
      if (!tr || tr.dataset.k !== key) {
        tr?.remove();
        const d = el(`<div class="trivia panel pe" data-k="${key}"><div class="muted center">שאלה ${p.qi + 1}/${p.n}</div><div class="q">${esc(p.q)}</div><div class="ans">${p.a.map((a, i) => `<button data-i="${i}" class="${p.reveal ? (i === p.c ? 'ok' : this.myAns === i ? 'bad' : '') : this.myAns === i && mine ? 'mine' : ''}" ${mine || p.reveal ? 'disabled' : ''}>${esc(a)}</button>`).join('')}</div></div>`);
        on(d, '[data-i]', 'click', (e, b) => { this.myAns = Number(b.dataset.i); this.send({ t: 'taskInput', d: { answer: this.myAns } }); audio.sfx('tick'); });
        this.overlay.appendChild(d);
        if (!mine && !p.reveal) this.myAns = null;
      }
    } else tr?.remove();
    // vote-based tasks
    const vt = t && ['vote', 'dance', 'cook'].includes(t.kind) && t.pub?.voting;
    if (vt && me.role === 'hg' && t.parts.includes(me.id) && !t.pub.voted?.includes(me.id) && !this.hasModal('taskVote')) {
      const c = s.players.filter((p) => t.pub.cands.includes(p.id) && p.id !== me.id);
      const dishes = t.pub.dishes || {};
      const m = this.modal('taskVote', `<h2>🗳️ ${esc(t.title)} – הצבעה</h2><div class="plist">${c.map((p) => `<button class="pcard" data-pid="${p.id}">${esc(p.look.emoji || '')} ${esc(p.name)}${dishes[p.id] ? `<br><small class="muted">${esc(dishes[p.id])}</small>` : ''}</button>`).join('')}</div>`, { keepInput: true });
      on(m, '[data-pid]', 'click', (e, b) => { this.send({ t: 'taskInput', d: { vote: b.dataset.pid } }); this.closeModal('taskVote'); });
    }
    if (!vt) this.closeModal('taskVote');
    // dilemma
    if (t?.kind === 'dilemma' && t.priv?.choose && !this.hasModal('dilemma')) {
      const other = t.pub.pair.find((x) => x !== me.id);
      const m = this.modal('dilemma', `<h2>⚖️ ${esc(t.title)}</h2><p>אתה ו<b>${esc(this.name(other))}</b>. שניכם משתפים פעולה – 40 לכל אחד. אחד בוגד – הבוגד לוקח 80. שניכם בוגדים – שניכם מפסידים.</p><div class="row"><button class="btn" data-c="coop">🤝 לשתף פעולה</button><button class="btn red" data-c="betray">🐍 לבגוד</button></div>`, { noClose: true, keepInput: true });
      on(m, '[data-c]', 'click', (e, b) => { this.send({ t: 'taskInput', d: { choice: b.dataset.c } }); this.closeModal('dilemma'); });
    }
    if (t?.kind === 'sacrifice' && me.role === 'hg' && !t.pub.hero && !this.hasModal('sacrifice') && !this.sacDone) {
      const m = this.modal('sacrifice', `<h2>❤️ ${esc(t.title)}</h2><p>${esc(t.desc)}</p><button class="btn pink" data-a="v">אני מוותר/ת על כל המטבעות שלי (${me.coins})</button>`, { keepInput: true });
      on(m, '[data-a]', 'click', () => { this.send({ t: 'taskInput', d: { volunteer: true } }); this.closeModal('sacrifice'); this.sacDone = true; });
    }
    if (t?.kind !== 'sacrifice') { this.closeModal('sacrifice'); this.sacDone = false; }
    // hide&seek blindness for seeker, statues red light
    const now = this.app.net.serverNow();
    const blind = t?.kind === 'hideseek' && t.pub.seeker === me.id && now < t.pub.blindUntil;
    this.setFx('blind', blind, blind ? `🙈 סופר... ${Math.ceil((t.pub.blindUntil - now) / 1000)}` : '');
    this.setFx('red-light', t?.kind === 'statues' && t.pub.red && me.role === 'hg');
  }

  // ------------------------------------------------------------------ lobby
  renderLobby(s) {
    let L = $('.lobby', this.hud);
    const me = s.you;
    const isHost = s.hostId === me.id;
    const conn = s.players.filter((p) => p.connected).length;
    const key = JSON.stringify([s.players.map((p) => [p.id, p.name, p.connected, p.bbVotes, p.volunteer, p.host]), me.bbVote, me.volunteer, s.settings, isHost, this.lobbyMin]);
    if (L && L.dataset.k === key) return;
    if (!L) { L = el('<div class="lobby panel pe"></div>'); this.hud.appendChild(L); }
    L.dataset.k = key;
    if (this.lobbyMin) { L.className = 'lobby panel pe mini'; L.innerHTML = `<button class="btn ghost sm" data-a="max">🏠 ${esc(s.code)} • ${conn} דיירים</button>`; on(L, '[data-a=max]', 'click', () => { this.lobbyMin = false; this.renderLobby(this.s); }); return; }
    L.className = 'lobby panel pe';
    L.innerHTML = `<div class="row"><b class="grow">קוד הבית</b><button class="btn ghost sm" data-a="min">—</button></div>
      <div class="code">${esc(s.code)}</div>
      <div class="row" style="justify-content:center"><button class="btn ghost sm" data-a="copy">📋 העתק קישור הזמנה</button></div>
      ${isHost ? `<button class="btn" data-a="start" style="width:100%;margin-top:10px" ${conn < s.minPlayers ? 'disabled' : ''}>▶ התחל משחק ${conn < s.minPlayers ? `(צריך ${s.minPlayers})` : ''}</button>` : ''}
      <h3 style="margin-top:10px">דיירים (${conn}/16)</h3>
      <div class="muted" style="font-size:13px;margin-bottom:6px">לחצו על דייר כדי להצביע שהוא יהיה <b>האח הגדול</b> 👁️</div>
      ${s.players.map((p) => `<div class="pl pe" data-vote="${p.id}" style="cursor:pointer;${me.bbVote === p.id ? 'outline:2px solid var(--cyan)' : ''}"><span class="dot" style="width:12px;height:12px;border-radius:50%;background:${esc(p.look.color)}"></span><span class="nm">${esc(p.look.emoji || '')} ${esc(p.name)}</span>${p.host ? '<span class="tag host">מארח</span>' : ''}${p.volunteer ? '<span class="tag vol">מתנדב</span>' : ''}${!p.connected ? '<span class="tag off">מנותק</span>' : ''}<span class="v">${p.bbVotes ? '👁️×' + p.bbVotes : ''}</span>${isHost && p.id !== me.id ? `<button class="btn red sm" data-kick="${p.id}" title="הוצא">✕</button>` : ''}</div>`).join('')}
      <label class="row" style="margin:8px 0"><input type="checkbox" data-vol ${me.volunteer ? 'checked' : ''}> 🙋 אני מתנדב/ת להיות האח הגדול</label>
      ${isHost ? `<div class="sec col" style="gap:6px;padding:8px;border-radius:12px;background:rgba(255,255,255,.04)">
        <b>הגדרות המארח</b>
        <label class="row">אורך שלבים <select data-set="preset"><option value="short">קצר</option><option value="normal">רגיל</option><option value="long">ארוך</option></select></label>
        <label class="row">אורך עונה <select data-set="season">${Object.entries(SEASONS).map(([k, v]) => `<option value="${k}">${v.label} (פינוי כל ${v.every} ימים)</option>`).join('')}</select></label>
        <label class="row">פתיח <select data-set="intro"><option value="full">מלא</option><option value="short">מקוצר</option><option value="off">ללא</option></select></label>
        <label class="row"><input type="checkbox" data-set="events" ${s.settings.events ? 'checked' : ''}> אירועים אקראיים</label>
        <label class="row"><input type="checkbox" data-set="spy" ${s.settings.spy ? 'checked' : ''}> מרגל סודי (4+ דיירים)</label>
      </div>
      <button class="btn" data-a="start" style="width:100%;margin-top:10px" ${conn < s.minPlayers ? 'disabled' : ''}>▶ התחל משחק ${conn < s.minPlayers ? `(צריך ${s.minPlayers})` : ''}</button>` : '<div class="muted center" style="margin-top:8px">ממתינים שהמארח יתחיל... בינתיים תכירו 🗣️</div>'}`;
    if (isHost) { $('[data-set=preset]', L).value = s.settings.preset; $('[data-set=intro]', L).value = s.settings.intro; $('[data-set=season]', L).value = s.settings.season || 'normal'; }
    on(L, '[data-vote]', 'click', (e, b) => { if (e.target.closest('[data-kick]')) return; this.send({ t: 'bbVote', id: b.dataset.vote === me.bbVote ? null : b.dataset.vote }); audio.sfx('click'); });
    on(L, '[data-kick]', 'click', (e, b) => { if (confirm('להוציא?')) this.send({ t: 'kick', id: b.dataset.kick }); });
    $('[data-vol]', L).addEventListener('change', (e) => this.send({ t: 'volunteer', on: e.target.checked }));
    on(L, '[data-set]', 'change', (e, i) => this.send({ t: 'settings', s: { [i.dataset.set]: i.type === 'checkbox' ? i.checked : i.value } }));
    on(L, '[data-a]', 'click', (e, b) => {
      const a = b.dataset.a;
      if (a === 'start') this.send({ t: 'start' });
      if (a === 'min') { this.lobbyMin = true; this.renderLobby(this.s); }
      if (a === 'copy') { const url = `${location.origin}/?join=${s.code}`; navigator.clipboard?.writeText(url).then(() => this.toast('הקישור הועתק! 📋')).catch(() => this.toast(url)); }
    });
  }

  // ------------------------------------------------------------------ ghost
  renderGhost(s) {
    if (!$('.reactions', this.hud)) {
      const r = el(`<div class="reactions panel pe">${REACTIONS.map((e) => `<button data-r="${e}">${e}</button>`).join('')}</div>`);
      on(r, '[data-r]', 'click', (e, b) => this.send({ t: 'react', e: b.dataset.r }));
      this.hud.appendChild(r);
    }

  }
  removeGhost() { $('.reactions', this.hud)?.remove(); }
  flyReaction(e) {
    const d = el(`<div class="react-fly">${esc(e)}</div>`);
    d.style.left = 10 + Math.random() * 80 + '%';
    this.overlay.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  // ------------------------------------------------------------------ Big Brother control panel
  renderBB(s) {
    if (!this.bbPanel) this.buildBB();
    this.updateBB(s);
  }
  buildBB() {
    const p = el(`<div class="bb-panel panel pe">
      <div class="bb-head"><span class="eyeslot"></span><div class="grow"><h3 style="margin:0">חדר הבקרה</h3><div class="muted" style="font-size:12px">אתה האח הגדול. כולם יודעים. אף אחד לא רואה אותך.</div></div></div>
      <div style="padding:10px 12px 0" class="col">
        <button class="btn talk-btn" data-talk="house">🎙️ החזק כדי לדבר לכל הבית</button>
        <div class="row"><button class="btn ghost sm grow" data-talk="diary">🎙️ דבר לחדר הוידוי</button></div>
      </div>
      <div class="tabs">${[['cams', '📹 מצלמות'], ['say', '📢 כריזה'], ['tasks', '📋 משימות'], ['twists', '🌀 טוויסטים'], ['env', '💡 סביבה'], ['people', '👥 דיירים'], ['stats', '📊 דרמה']].map(([id, l]) => `<button data-tab="${id}">${l}</button>`).join('')}</div>
      <div class="body"></div>
    </div>`);
    $('.eyeslot', p).appendChild(eyeCanvas(60, 34));
    this.root.appendChild(p);
    this.bbPanel = p;
    this.bbTab = 'cams';
    on(p, '[data-tab]', 'click', (e, b) => { this.bbTab = b.dataset.tab; this.bbKey = ''; this.updateBB(this.s); });
    const talk = (mode, down) => { this.send({ t: 'bb', c: 'talk', mode: down ? mode : 'none' }); this.app.bbTalking = down ? mode : null; $$('[data-talk]', p).forEach((x) => x.classList.toggle('live', down && x.dataset.talk === mode)); };
    for (const b of $$('[data-talk]', p)) {
      const mode = b.dataset.talk;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); talk(mode, true); });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (this.app.bbTalking === mode) talk(mode, false); });
    }
    this.feed = [];
    this.app.input.on('pttDown', () => { if (this.me?.role === 'bb') talk('house', true); });
    this.app.input.on('pttUp', () => { if (this.me?.role === 'bb' && this.app.bbTalking) talk('house', false); });
  }
  bbFeed(text) {
    this.feed.unshift(text);
    this.feed = this.feed.slice(0, 30);
    if (this.bbTab === 'stats' || this.bbTab === 'people') this.bbKey = '';
  }
  updateBB(s) {
    const tab = this.bbTab;
    $$('[data-tab]', this.bbPanel).forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const body = $('.body', this.bbPanel);
    const st = this.app.bbStats || {};
    const hgs = s.players.filter((p) => p.role === 'hg');
    const key = tab + JSON.stringify([s.phase.id, s.phase.day, s.task?.id, s.task?.pub?.marked, s.bbData?.taskChoice, s.lights, s.doors, s.music, hgs.map((p) => [p.id, p.connected, p.iso, p.immune]), tab === 'stats' ? [st, this.feed.length] : 0, s.bbData?.twistCooldowns, this.app.control?.mode, this.app.control?.sel, s.bbData?.nominations && Object.keys(s.bbData.nominations).length, s.bbData?.fakes]);
    if (key === this.bbKey) return;
    this.bbKey = key;
    const cr = this.app.control;
    let h = '';
    switch (tab) {
      case 'cams':
        h = `<div class="sec"><h4>תצוגה</h4><div class="row"><button class="btn sm ${cr?.mode === 'grid' ? '' : 'ghost'}" data-cm="grid">▦ קיר מצלמות</button><button class="btn sm ${cr?.mode === 'single' ? '' : 'ghost'}" data-cm="single">▣ מצלמה אחת</button><button class="btn sm ${cr?.mode === 'free' ? '' : 'ghost'}" data-cm="free">🕊️ מצלמה חופשית</button></div>
          <div class="muted" style="font-size:12px;margin-top:6px">קליק על מסך = בחירה + האזנה לחדר. במצלמה חופשית: WASD + עכבר, Space/C למעלה/למטה. Esc לחזרה.</div></div>
          <div class="sec"><h4>🔊 האזנה</h4><div class="row">${[...new Set(cr?.cams.map((c) => c.room))].map((r) => `<button class="btn sm ${cr?.listenRoom() === r ? '' : 'ghost'}" data-listen="${r}">${esc(ROOM_BY_ID[r]?.name || r)}</button>`).join('')}</div></div>`;
        break;
      case 'say':
        h = `<div class="sec"><h4>📢 הודעה דרמטית על המסך של כולם</h4><textarea class="ann" maxlength="${LIMITS.ANNOUNCE_MAX}" rows="3" style="width:100%;padding:10px;border-radius:10px;border:1px solid var(--line);background:rgba(0,0,0,.3);color:#fff" placeholder="דיירים, גשו לסלון. עכשיו."></textarea><button class="btn sm" data-a="announce" style="margin-top:6px">שלח הכרזה (עם קריינות)</button></div>
          <div class="sec"><h4>הכרזות מהירות</h4><div class="col">${['דיירים, כולם לסלון.', 'ערב טוב דיירים. האח הגדול רוצה לדבר איתכם.', 'אסור לדבר על המועמדויות!', 'מי שמשקר – האח הגדול יודע.', 'הגיע הזמן לישון. כבו את האורות.', 'דייר, גש לחדר הוידוי.'].map((t) => `<button class="task-item" data-quick="${esc(t)}">${esc(t)}</button>`).join('')}</div></div>`;
        break;
      case 'tasks': {
        const morning = s.phase.id === 'morning';
        const chosen = s.bbData?.taskChoice;
        h = `${s.task ? `<div class="sec"><h4>משימה פעילה: ${esc(s.task.title)}</h4>${s.task.kind === 'judged' ? `<div class="muted" style="font-size:12px">סמן מי הצליח:</div><div class="plist">${hgs.map((p) => `<button class="pcard ${(s.task.pub.marked || []).includes(p.id) ? 'on' : ''}" data-mark="${p.id}">${esc(p.name)}</button>`).join('')}</div>${s.task.bb?.killer ? `<div class="muted">🔪 הרוצח: ${esc(this.name(s.task.bb.killer))}</div>` : ''}` : ''}${s.task.sabotaged ? '<div style="color:var(--pink)">🕵️ המרגל חיבל במשימה!</div>' : ''}</div>` : ''}
          <div class="sec"><h4>${morning ? '☀️ בחר את משימת היום' : 'המשימה נבחרת בבוקר'}${chosen ? ` • נבחרה ✔` : ''}</h4>
          ${morning ? '<button class="btn sm" data-a="startTask">▶ התחל משימה עכשיו</button>' : ''}
          <div class="task-list">${TASKS.filter((t) => t.cat !== 'punishment').map((t) => `<button class="task-item ${chosen === t.id ? 'on' : ''}" data-task="${t.id}" ${morning ? '' : 'disabled'}><b>${esc(t.title)} <span class="muted">${CAT_LABEL[t.cat] || ''}</span></b>${esc(t.desc)}</button>`).join('')}</div>
          ${morning ? `<h4 style="margin-top:8px">✍️ משימה מותאמת (את/ה שופט/ת)</h4><input class="ct" maxlength="40" placeholder="כותרת" style="width:100%;padding:8px;border-radius:8px;border:1px solid var(--line);background:rgba(0,0,0,.3);color:#fff"><textarea class="cd" maxlength="200" rows="2" placeholder="תיאור" style="width:100%;margin-top:4px;padding:8px;border-radius:8px;border:1px solid var(--line);background:rgba(0,0,0,.3);color:#fff"></textarea><button class="btn sm" data-a="custom">קבע משימה מותאמת</button>` : ''}</div>
          <div class="sec"><h4>⚠️ עונשים מיידיים</h4><div class="col">${TASKS.filter((t) => t.cat === 'punishment').map((t) => `<button class="task-item" data-punish="${t.id}"><b>${esc(t.title)}</b>${esc(t.desc)}</button>`).join('')}</div></div>`;
        break;
      }
      case 'twists': {
        const cd = s.bbData?.twistCooldowns || {};
        const now = this.app.net.serverNow();
        h = `<div class="sec"><h4>🌀 טוויסטים</h4><div class="col">${TWISTS.map(([id, ic, l]) => `<button class="task-item" data-twist="${id}" ${cd[id] > now ? 'disabled style="opacity:.5"' : ''}><b>${ic} ${l}</b>${cd[id] > now ? `קירור: ${Math.ceil((cd[id] - now) / 1000)} ש׳` : ''}</button>`).join('')}</div></div>
          <div class="sec"><h4>🎲 אירועים</h4><div class="row">${EVENTS.map(([id, ic, l]) => `<button class="btn ghost sm" data-event="${id}">${ic} ${l}</button>`).join('')}</div></div>
          <div class="sec"><h4>⏱️ שלב המשחק</h4><div class="row"><button class="btn sm" data-a="advance">⏭ לשלב הבא</button><button class="btn ghost sm" data-a="extend">+30 שניות</button></div></div>`;
        break;
      }
      case 'env':
        h = `<div class="sec"><h4>💡 אורות</h4><div class="row" style="margin-bottom:6px"><button class="btn ghost sm" data-light="all" data-lv="0.05">🌑 כבה הכול</button><button class="btn ghost sm" data-light="all" data-lv="1">☀️ הדלק הכול</button></div>
          ${ROOMS.map((r) => `<div class="row" style="font-size:13px"><span class="grow">${esc(r.name)}</span><button class="btn sm ${s.lights[r.id] > 0.5 ? '' : 'ghost'}" data-light="${r.id}" data-lv="${s.lights[r.id] > 0.5 ? 0.05 : 1}">${s.lights[r.id] > 0.5 ? 'דלוק' : 'כבוי'}</button></div>`).join('')}</div>
          <div class="sec"><h4>🎵 מוזיקה</h4><div class="row">${MUSIC_MOODS.map((m) => `<button class="btn sm ${s.music === m ? '' : 'ghost'}" data-music="${m}">${MUSIC_LABELS[m]}</button>`).join('')}</div></div>
          <div class="sec"><h4>🚪 דלתות</h4>${DOORS.filter((d) => d.id !== 'd_exit').map((d) => `<div class="row" style="font-size:13px"><span class="grow">${esc(d.rooms.map((r) => ROOM_BY_ID[r].name).join(' ↔ '))}</span><button class="btn sm ${s.doors[d.id]?.locked ? 'red' : 'ghost'}" data-door="${d.id}" data-lock="${!s.doors[d.id]?.locked}">${s.doors[d.id]?.locked ? '🔒 נעול' : '🔓 פתוח'}</button></div>`).join('')}
          <button class="btn gold sm" data-a="secret" style="margin-top:6px">🗝️ ${s.doors.d_secret?.locked ? 'פתח' : 'סגור'} את החדר הסודי</button></div>`;
        break;
      case 'people':
        h = (s.bbData?.fakes || []).map((id) => `<div class="sec"><h4>🎭 ${esc(this.name(id))} בהדחה מזויפת</h4><button class="btn gold sm" data-retfake="${id}">↩️ החזר לבית עכשיו</button></div>`).join('') + hgs.map((p) => `<div class="sec"><h4>${esc(p.look.emoji || '')} ${esc(p.name)} ${p.spy ? '🕵️' : ''} ${p.immune ? '🛡️' : ''} <span class="muted">• מוניטין ${p.rep ?? '?'} • 🪙${p.coins}</span></h4>
          <div class="muted" style="font-size:12px">🤫 ${esc(s.bbData?.missions?.[p.id]?.text || '')} ${s.bbData?.missions?.[p.id]?.done ? '✅' : ''}</div>
          <div class="row" style="margin-top:6px"><button class="btn red sm" data-iso="${p.id}">🚨 בידוד 30ש׳</button><button class="btn ghost sm" data-warn="${p.id}">⚠️ אזהרה</button><button class="btn ghost sm" data-rew="${p.id}" data-n="20">+20🪙</button><button class="btn ghost sm" data-rew="${p.id}" data-n="-20">-20🪙</button><button class="btn ghost sm" data-imm="${p.id}">🛡️ חסינות</button>${s.bbData?.missions?.[p.id] && !s.bbData.missions[p.id].done ? `<button class="btn ghost sm" data-mis="${p.id}">✅ משימה חשאית</button>` : ''}</div></div>`).join('') + `<div class="sec"><h4>🗳️ מועמדויות היום (רק אתה רואה)</h4><div class="feed">${Object.entries(s.bbData?.nominations || {}).map(([v, n]) => `<div>${esc(this.name(v))} ← ${esc(this.name(n.a))} (${esc(n.ra || '-')}), ${esc(this.name(n.b))} (${esc(n.rb || '-')})</div>`).join('') || '<div class="muted">עדיין אין</div>'}</div></div>`;
        break;
      case 'stats': {
        const heat = st.heat || {};
        const max = Math.max(1, ...Object.values(heat));
        h = `<div class="sec"><h4>🔥 מד הדרמה: ${st.drama ?? 0}</h4><div class="drama"><i style="left:${st.drama ?? 0}%"></i></div></div>
          <div class="sec"><h4>🌡️ איפה הבית חם</h4><div class="heat">${Object.entries(heat).sort((a, b) => b[1] - a[1]).map(([r, v]) => `<span>${esc(ROOM_BY_ID[r]?.name || r)}</span><div class="b" style="width:${(v / max) * 100}%"></div><span>${(st.rooms?.[r] || []).length}👤</span>`).join('')}</div></div>
          <div class="sec"><h4>🗣️ מי מדבר עם מי</h4><div class="feed">${(st.pairs || []).map(([a, b, sec]) => `<div>${esc(this.name(a))} ↔ ${esc(this.name(b))} • ${sec} ש׳</div>`).join('') || '<div class="muted">שקט...</div>'}</div></div>
          <div class="sec"><h4>🥊 קטטות אחרונות</h4><div class="feed">${(st.fights || []).slice().reverse().map((f) => `<div>${esc(f.an)} → ${esc(f.bn)} (${esc(ROOM_BY_ID[f.room]?.name || '')})</div>`).join('') || '<div class="muted">אין. עדיין.</div>'}</div></div>
          <div class="sec"><h4>📡 פיד אירועים</h4><div class="feed">${this.feed.map((f) => `<div>${esc(f)}</div>`).join('')}</div></div>`;
        break;
      }
    }
    body.innerHTML = h;
    // handlers
    const bb = (m) => this.send({ t: 'bb', ...m });
    on(body, '[data-cm]', 'click', (e, b) => { this.app.control.setMode(b.dataset.cm); this.bbKey = ''; this.updateBB(this.s); });
    on(body, '[data-listen]', 'click', (e, b) => { const i = cr.cams.findIndex((c) => c.room === b.dataset.listen); if (i >= 0) { cr.setMode(cr.mode === 'free' ? 'single' : cr.mode, i); } this.bbKey = ''; this.updateBB(this.s); });
    on(body, '[data-a]', 'click', (e, b) => {
      const a = b.dataset.a;
      if (a === 'announce') { const v = $('.ann', body).value.trim(); if (v) bb({ c: 'announce', text: v }); $('.ann', body).value = ''; }
      if (a === 'startTask') bb({ c: 'startTaskNow' });
      if (a === 'custom') { const title = $('.ct', body).value.trim(); if (title) bb({ c: 'task', custom: { title, desc: $('.cd', body).value.trim() } }); }
      if (a === 'advance') bb({ c: 'advance' });
      if (a === 'extend') bb({ c: 'extend' });
      if (a === 'secret') bb({ c: 'secretRoom', open: !!this.s.doors.d_secret?.locked });
    });
    on(body, '[data-quick]', 'click', (e, b) => bb({ c: 'announce', text: b.dataset.quick }));
    on(body, '[data-task]', 'click', (e, b) => bb({ c: 'task', id: b.dataset.task }));
    on(body, '[data-punish]', 'click', (e, b) => bb({ c: 'punish', id: b.dataset.punish }));
    on(body, '[data-mark]', 'click', (e, b) => this.send({ t: 'taskInput', d: { mark: b.dataset.mark } }));
    on(body, '[data-twist]', 'click', (e, b) => { if (b.dataset.twist === 'surprise' && !confirm('פינוי פתע עכשיו?')) return; bb({ c: 'twist', id: b.dataset.twist }); });
    on(body, '[data-event]', 'click', (e, b) => bb({ c: 'event', id: b.dataset.event }));
    on(body, '[data-light]', 'click', (e, b) => bb({ c: 'lights', room: b.dataset.light, level: Number(b.dataset.lv) }));
    on(body, '[data-music]', 'click', (e, b) => bb({ c: 'music', mood: b.dataset.music }));
    on(body, '[data-door]', 'click', (e, b) => bb({ c: 'door', id: b.dataset.door, locked: b.dataset.lock === 'true', open: b.dataset.lock === 'true' ? false : undefined }));
    on(body, '[data-iso]', 'click', (e, b) => bb({ c: 'isolate', id: b.dataset.iso, seconds: 30 }));
    on(body, '[data-warn]', 'click', (e, b) => bb({ c: 'warn', id: b.dataset.warn }));
    on(body, '[data-rew]', 'click', (e, b) => bb({ c: 'reward', id: b.dataset.rew, n: Number(b.dataset.n) }));
    on(body, '[data-imm]', 'click', (e, b) => bb({ c: 'immunity', id: b.dataset.imm }));
    on(body, '[data-mis]', 'click', (e, b) => bb({ c: 'mission', id: b.dataset.mis }));
    on(body, '[data-retfake]', 'click', (e, b) => bb({ c: 'returnFake', id: b.dataset.retfake }));
  }

  // camera labels overlay for the control room
  layoutTiles(cr) {
    let L = $('.cam-labels', this.root);
    if (!L) { L = el('<div class="cam-labels"></div>'); this.root.insertBefore(L, this.root.firstChild); }
    this.camLabels = L;
    L.innerHTML = '';
    if (cr.mode === 'free') { L.innerHTML = '<div class="cam-label" style="top:12px;left:12px"><span class="rec">● FREE CAM</span></div>'; return; }
    const tiles = cr.mode === 'grid' ? cr.tiles : [{ ...cr.bigRect, i: cr.sel }];
    for (const t of tiles) {
      const c = cr.cams[t.i];
      const d = el(`<div class="cam-label" style="left:${t.x}px;top:${t.y}px;width:${t.w}px"><span>CAM ${t.i + 1} • ${esc(c.name)} ${cr.sel === t.i ? '<span class="lis">🔊</span>' : ''}</span><span class="rec">● REC</span></div>`);
      L.appendChild(d);
      const tm = el(`<div class="cam-label cam-time" style="left:${t.x}px;top:${t.y + t.h - 22}px;width:${t.w}px"><span></span><span class="clk"></span></div>`);
      L.appendChild(tm);
    }
  }
  tickCamClock() {
    if (!this.camLabels) return;
    const d = new Date(this.app.net.serverNow());
    const s = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
    for (const c of $$('.clk', this.camLabels)) c.textContent = s;
  }
  removeBB() { this.bbPanel?.remove(); this.bbPanel = null; this.camLabels?.remove(); this.camLabels = null; }

  // ------------------------------------------------------------------ per frame
  frame(dt) {
    const s = this.s;
    if (!s) return;
    const now = this.app.net.serverNow();
    const left = s.phase.endsAt ? s.phase.endsAt - now : 0;
    const txt = s.phase.endsAt ? fmtTime(left) : '';
    if (this.el.timer.textContent !== txt) this.el.timer.textContent = txt;
    this.el.timer.classList.toggle('low', left > 0 && left < 10000);
    const v = this.app.voice;
    if (v) {
      const lvl = v.micLevel || 0;
      this.el.micLv.style.width = Math.round((v.speaking ? lvl : lvl * 0.3) * 100) + '%';
      this.el.mic.classList.toggle('off', v.muted || !v.allowed);
      this.el.mic.classList.toggle('talk', v.speaking);
      const t = s.you.role === 'bb' && !v.allowed ? 'החזק V לדבר' : !v.allowed ? 'מושתק' : v.muted ? 'השתקה (M)' : v.ptt ? (v.pttDown ? 'משדר' : 'החזק V') : v.speaking ? 'מדבר' : '';
      if (this.el.micTxt.textContent !== t) this.el.micTxt.textContent = t;
    }
    const c = this.app.controller;
    if (c) { const st = c.stamina / 100; this.el.staminaI.style.width = st * 100 + '%'; this.el.stamina.style.opacity = st < 0.98 && s.you.role === 'hg' ? 1 : 0; }
    this.tickAcc = (this.tickAcc || 0) + dt;
    if (this.tickAcc > 0.5) { this.tickAcc = 0; this.tickCamClock(); if (s.task) this.renderTaskUI(s); if (s.you.isolatedUntil > now) this.renderCards(s); }
  }
}
