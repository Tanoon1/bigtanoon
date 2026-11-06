// Keyboard / mouse (pointer lock) / touch (virtual joystick + look + action buttons)
import { isMobile } from '../engine.js';

export class Input {
  constructor(canvas, uiRoot) {
    this.canvas = canvas;
    this.keys = new Set();
    this.look = { dx: 0, dy: 0 };
    this.move = { x: 0, y: 0 }; // joystick
    this.sens = Number(localStorage.getItem('bb_sens') || 1);
    this.actions = new Map();
    this.enabled = true;
    this.locked = false;
    this.mobile = isMobile;
    this.touchRun = false;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.emit('pttUp'); });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; this.emit('lock', this.locked); });
    canvas.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.look.dx += e.movementX * 0.0022 * this.sens;
      this.look.dy += e.movementY * 0.0022 * this.sens;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.mobile && this.wantLock) { this.requestLock(); return; }
      if (!this.locked) return;
      if (e.button === 0) this.emit('primary');
      if (e.button === 2) this.emit('throw');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    if (this.mobile) this.buildTouch(uiRoot);
  }
  on(name, fn) { this.actions.set(name, [...(this.actions.get(name) || []), fn]); }
  emit(name, a) { for (const fn of this.actions.get(name) || []) fn(a); }
  requestLock() { try { this.canvas.requestPointerLock?.()?.catch?.(() => {}); } catch {} }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  typing() { const a = document.activeElement; return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); }

  onKey(e, down) {
    if (this.typing()) { if (e.key === 'Escape' && down) { document.activeElement.blur(); this.emit('chatClose'); } return; }
    const k = e.code;
    if (down) {
      if (this.keys.has(k)) { if (k === 'KeyV') e.preventDefault(); return; }
      this.keys.add(k);
      if (!this.enabled && !['Escape', 'Tab', 'KeyV', 'KeyM', 'Enter', 'KeyT'].includes(k)) return;
      switch (k) {
        case 'KeyE': this.emit('interact'); break;
        case 'KeyF': this.emit('push'); break;
        case 'KeyG': this.emit('throw'); break;
        case 'KeyQ': this.emit('drop'); break;
        case 'KeyR': this.emit('eat'); break;
        case 'KeyV': this.emit('pttDown'); break;
        case 'KeyM': this.emit('mute'); break;
        case 'KeyT': case 'Enter': e.preventDefault(); this.emit('chat'); break;
        case 'Tab': e.preventDefault(); this.emit('tab', true); break;
        case 'Escape': this.emit('menu'); break;
        case 'KeyB': this.emit('bbPanel'); break;
        case 'KeyX': this.emit('power'); break;
        case 'KeyH': this.emit('help'); break;
        default:
          if (/^Digit[0-9]$/.test(k)) this.emit('emote', (Number(k.slice(5)) + 9) % 10);
      }
      if (k === 'Space') e.preventDefault();
    } else {
      this.keys.delete(k);
      if (k === 'KeyV') this.emit('pttUp');
      if (k === 'Tab') this.emit('tab', false);
    }
  }

  axes() {
    if (!this.enabled) return { x: 0, y: 0, run: false, jump: false, crouch: false };
    const K = this.keys;
    let x = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0);
    let y = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0);
    let run = K.has('ShiftLeft') || K.has('ShiftRight');
    if (this.move.x || this.move.y) { x = this.move.x; y = this.move.y; run = Math.hypot(x, y) > 0.92; }
    return { x, y, run, jump: K.has('Space') || this.touchJump, crouch: K.has('ControlLeft') || K.has('KeyC') || this.touchCrouch, up: K.has('Space') || this.touchJump, down: K.has('ControlLeft') || K.has('KeyC') || this.touchCrouch };
  }
  consumeLook() { const l = { ...this.look }; this.look.dx = 0; this.look.dy = 0; return l; }

  // ----------------------------------------------------------- touch
  buildTouch(root) {
    const wrap = document.createElement('div');
    wrap.className = 'touch';
    wrap.innerHTML = `
      <div class="joy"><div class="joy-knob"></div></div>
      <div class="tbtns">
        <button data-a="jump" class="tb tb-jump">⤒</button>
        <button data-a="interact" class="tb tb-e">E</button>
        <button data-a="primary" class="tb tb-hit">👊</button>
        <button data-a="throw" class="tb tb-throw">🫳</button>
        <button data-a="crouch" class="tb tb-crouch">⤓</button>
      </div>
      <div class="tbtns-top">
        <button data-a="ptt" class="tb tb-talk">🎙️</button>
        <button data-a="emoteMenu" class="tb">😀</button>
        <button data-a="eat" class="tb">🍽️</button>
        <button data-a="chat" class="tb">💬</button>
        <button data-a="tab" class="tb">👥</button>
      </div>`;
    root.appendChild(wrap);
    this.touchEl = wrap;
    const joy = wrap.querySelector('.joy'), knob = wrap.querySelector('.joy-knob');
    let joyId = null, jc = { x: 0, y: 0 };
    let lookId = null, lp = { x: 0, y: 0 };
    const R = 56;
    wrap.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        const b = t.target.closest?.('[data-a]');
        if (b) {
          const a = b.dataset.a;
          b.classList.add('down');
          if (a === 'jump') this.touchJump = true;
          else if (a === 'crouch') this.touchCrouch = !this.touchCrouch;
          else if (a === 'ptt') this.emit('pttDown');
          else if (a === 'tab') this.emit('tab', true);
          else this.emit(a);
          continue;
        }
        if (t.clientX < innerWidth * 0.42 && joyId === null) {
          joyId = t.identifier; jc = { x: t.clientX, y: t.clientY };
          joy.style.left = jc.x - 70 + 'px'; joy.style.top = jc.y - 70 + 'px'; joy.classList.add('on');
        } else if (lookId === null) { lookId = t.identifier; lp = { x: t.clientX, y: t.clientY }; }
      }
      e.preventDefault();
    }, { passive: false });
    wrap.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          let dx = t.clientX - jc.x, dy = t.clientY - jc.y;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          knob.style.transform = `translate(${dx}px,${dy}px)`;
          this.move.x = dx / R; this.move.y = -dy / R;
        } else if (t.identifier === lookId) {
          this.look.dx += (t.clientX - lp.x) * 0.0055 * this.sens;
          this.look.dy += (t.clientY - lp.y) * 0.0055 * this.sens;
          lp = { x: t.clientX, y: t.clientY };
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        const b = t.target.closest?.('[data-a]');
        if (b) {
          b.classList.remove('down');
          if (b.dataset.a === 'jump') this.touchJump = false;
          if (b.dataset.a === 'ptt') this.emit('pttUp');
          if (b.dataset.a === 'tab') this.emit('tab', false);
        }
        if (t.identifier === joyId) { joyId = null; this.move.x = this.move.y = 0; knob.style.transform = ''; joy.classList.remove('on'); }
        if (t.identifier === lookId) lookId = null;
      }
    };
    wrap.addEventListener('touchend', end);
    wrap.addEventListener('touchcancel', end);
  }
  showTouch(v) { if (this.touchEl) this.touchEl.style.display = v ? '' : 'none'; }
}
