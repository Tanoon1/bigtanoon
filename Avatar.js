// Stylized low-poly avatar with procedural animation, emotes, comic "ragdoll" tumble and a nametag.
import * as THREE from 'three';
import { lambert } from './materials.js';
import { EMOTES } from '../../../shared/constants.js';

const CAP = new THREE.CapsuleGeometry(1, 1, 3, 8);
const SPH = new THREE.SphereGeometry(1, 12, 9);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 12);
const CONE = new THREE.ConeGeometry(1, 1, 12);
const matCache = new Map();
function mat(color, opts) {
  const k = color + (opts ? JSON.stringify(opts) : '');
  if (!matCache.has(k)) matCache.set(k, lambert({ color, ...(opts || {}) }));
  return matCache.get(k);
}
function shade(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }

function mesh(geo, m, sx, sy, sz, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.scale.set(sx, sy, sz); o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}
function capsule(m, r, len, x, y, z) {
  // capsule centered, along Y. CapsuleGeometry(1,1) => radius 1, length 1 (total 3)
  return mesh(CAP, m, r, len / 3, r, x, y, z);
}

export class Avatar {
  constructor(look, name, opts = {}) {
    this.look = { color: '#26c6da', skin: '#e8b48f', outfit: 'tee', hat: 'none', emoji: '', hair: 'short', hairColor: '#1b1b1b', ...look };
    this.name = name;
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // tumble pivot (at hips)
    this.group.add(this.body);
    this.phase = 0;
    this.emoteId = null;
    this.emoteT = 0;
    this.speaking = false;
    this.level = 0;
    this.fall = null;
    this.swing = 0;
    this.ghost = !!opts.ghost;
    this.noTag = !!opts.noTag;
    this.flags = {};
    this.build();
    if (!this.noTag) this.buildTag();
  }

  build() {
    const L = this.look;
    const outfit = mat(L.color);
    const dark = mat(shade(L.color, 0.55));
    const skin = mat(L.skin);
    const pants = mat(L.outfit === 'suit' ? '#1d2430' : L.outfit === 'robe' ? '#f5f5f5' : '#2b3a55');
    const b = this.body;
    b.position.y = 0;
    // hips pivot
    this.hips = new THREE.Group(); this.hips.position.y = 0.92; b.add(this.hips);
    // legs
    this.legL = new THREE.Group(); this.legL.position.set(-0.11, 0, 0); this.hips.add(this.legL);
    this.legR = new THREE.Group(); this.legR.position.set(0.11, 0, 0); this.hips.add(this.legR);
    for (const leg of [this.legL, this.legR]) {
      leg.add(capsule(pants, 0.085, 0.68, 0, -0.42, 0));
      leg.add(mesh(SPH, mat('#202428'), 0.1, 0.07, 0.15, 0, -0.86, 0.04));
    }
    // torso
    this.torso = new THREE.Group(); this.torso.position.y = -0.12; this.hips.add(this.torso);
    const t = this.torso;
    if (L.outfit === 'dress') {
      t.add(mesh(CONE, outfit, 0.33, 0.6, 0.33, 0, -0.12, 0));
      t.add(capsule(outfit, 0.2, 0.3, 0, 0.3, 0));
    } else if (L.outfit === 'robe') {
      t.add(mesh(CYL, mat('#f7f7f7'), 0.24, 0.9, 0.22, 0, 0.0, 0));
      t.add(capsule(mat('#f7f7f7'), 0.21, 0.3, 0, 0.3, 0));
      t.add(mesh(BOX, outfit, 0.44, 0.05, 0.42, 0, 0.12, 0));
    } else {
      t.add(capsule(L.outfit === 'suit' ? mat('#1d2430') : outfit, 0.21, 0.33, 0, 0.28, 0));
      t.add(mesh(SPH, L.outfit === 'suit' ? mat('#1d2430') : outfit, 0.2, 0.12, 0.17, 0, 0.06, 0));
      if (L.outfit === 'suit') {
        t.add(mesh(BOX, mat('#ffffff'), 0.12, 0.26, 0.02, 0, 0.36, 0.2));
        t.add(mesh(BOX, outfit, 0.05, 0.22, 0.03, 0, 0.33, 0.215));
      }
      if (L.outfit === 'hoodie') {
        t.add(mesh(SPH, dark, 0.17, 0.12, 0.1, 0, 0.5, -0.17));
        t.add(mesh(BOX, dark, 0.22, 0.1, 0.03, 0, 0.18, 0.2));
      }
      if (L.outfit === 'tank') t.add(mesh(BOX, skin, 0.16, 0.08, 0.02, 0, 0.5, 0.18));
    }
    // arms
    const sleeve = L.outfit === 'tank' ? skin : L.outfit === 'suit' ? mat('#1d2430') : L.outfit === 'robe' ? mat('#f7f7f7') : outfit;
    this.armL = new THREE.Group(); this.armL.position.set(-0.235, 0.41, 0); t.add(this.armL);
    this.armR = new THREE.Group(); this.armR.position.set(0.235, 0.41, 0); t.add(this.armR);
    for (const arm of [this.armL, this.armR]) {
      arm.add(mesh(SPH, sleeve === skin && L.outfit !== 'tank' ? outfit : sleeve, 0.085, 0.085, 0.085, 0, -0.02, 0));
      arm.add(capsule(L.outfit === 'tee' || L.outfit === 'dress' ? skin : sleeve, 0.065, 0.42, 0, -0.27, 0));
      if (L.outfit === 'tee' || L.outfit === 'dress') arm.add(capsule(outfit, 0.075, 0.12, 0, -0.08, 0));
      arm.add(mesh(SPH, skin, 0.07, 0.07, 0.07, 0, -0.55, 0));
    }
    this.handR = new THREE.Group(); this.handR.position.set(0, -0.58, 0.05); this.armR.add(this.handR);
    // head
    this.head = new THREE.Group(); this.head.position.y = 0.58; t.add(this.head);
    const h = this.head;
    h.add(mesh(CYL, skin, 0.07, 0.12, 0.07, 0, -0.08, 0));
    h.add(mesh(SPH, skin, 0.2, 0.22, 0.2, 0, 0.12, 0));
    const eyeW = mat('#ffffff'), eyeB = mat('#1a1a1a');
    for (const sx of [-1, 1]) {
      h.add(mesh(SPH, eyeW, 0.045, 0.05, 0.03, sx * 0.075, 0.15, 0.175));
      h.add(mesh(SPH, eyeB, 0.026, 0.032, 0.02, sx * 0.075, 0.15, 0.195));
    }
    this.mouth = mesh(BOX, mat('#7a2e2e'), 0.08, 0.018, 0.02, 0, 0.04, 0.19);
    h.add(this.mouth);
    for (const sx of [-1, 1]) h.add(mesh(SPH, mat(shade(L.skin, 0.85)), 0.04, 0.05, 0.03, sx * 0.2, 0.12, 0));
    this.buildHair(L);
    this.buildHat(L.hat);
    if (this.ghost) this.setGhost(true);
  }

  buildHair(L) {
    const hm = mat(L.hairColor);
    const h = this.head;
    switch (L.hair) {
      case 'short': h.add(mesh(SPH, hm, 0.21, 0.12, 0.21, 0, 0.24, -0.02)); h.add(mesh(SPH, hm, 0.205, 0.14, 0.14, 0, 0.17, -0.09)); break;
      case 'long': h.add(mesh(SPH, hm, 0.215, 0.14, 0.215, 0, 0.23, -0.01)); h.add(mesh(SPH, hm, 0.2, 0.3, 0.13, 0, 0.02, -0.1)); break;
      case 'bun': h.add(mesh(SPH, hm, 0.21, 0.12, 0.21, 0, 0.24, -0.02)); h.add(mesh(SPH, hm, 0.1, 0.1, 0.1, 0, 0.36, -0.1)); break;
      case 'curly': for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; h.add(mesh(SPH, hm, 0.09, 0.09, 0.09, Math.cos(a) * 0.15, 0.28 + Math.sin(i) * 0.03, Math.sin(a) * 0.15 - 0.03)); } break;
      case 'mohawk': h.add(mesh(BOX, hm, 0.05, 0.16, 0.34, 0, 0.36, -0.02)); break;
      default: break;
    }
  }

  buildHat(hat) {
    if (this.hat) { this.hat.removeFromParent(); this.hat = null; }
    const g = new THREE.Group();
    g.position.y = 0.3;
    const c = mat(this.look.color);
    switch (hat) {
      case 'cap': g.add(mesh(SPH, c, 0.215, 0.12, 0.215, 0, -0.02, 0)); g.add(mesh(BOX, c, 0.22, 0.02, 0.16, 0, -0.06, 0.2)); break;
      case 'beanie': g.add(mesh(SPH, mat('#e53935'), 0.22, 0.17, 0.22, 0, -0.02, 0)); g.add(mesh(SPH, mat('#ffffff'), 0.06, 0.06, 0.06, 0, 0.15, 0)); break;
      case 'cowboy': g.add(mesh(CYL, mat('#8d5a2b'), 0.38, 0.02, 0.38, 0, -0.05, 0)); g.add(mesh(CYL, mat('#8d5a2b'), 0.17, 0.2, 0.17, 0, 0.05, 0)); break;
      case 'crown': {
        const gold = mat('#ffcf3a', { emissive: 0x4a3200 });
        g.add(mesh(CYL, gold, 0.17, 0.1, 0.17, 0, 0.0, 0));
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; g.add(mesh(CONE, gold, 0.04, 0.1, 0.04, Math.cos(a) * 0.15, 0.09, Math.sin(a) * 0.15)); }
        break;
      }
      case 'party': g.add(mesh(CONE, mat('#ff4fd8'), 0.13, 0.32, 0.13, 0, 0.12, 0)); g.add(mesh(SPH, mat('#ffe066'), 0.04, 0.04, 0.04, 0, 0.3, 0)); break;
      case 'chef': g.add(mesh(CYL, mat('#ffffff'), 0.17, 0.14, 0.17, 0, 0.02, 0)); g.add(mesh(SPH, mat('#ffffff'), 0.2, 0.12, 0.2, 0, 0.14, 0)); break;
      case 'headphones': g.add(mesh(BOX, mat('#222'), 0.44, 0.03, 0.05, 0, -0.02, 0)); for (const sx of [-1, 1]) g.add(mesh(CYL, mat('#22e0ff'), 0.06, 0.05, 0.06, sx * 0.21, -0.18, 0)).rotation.z = Math.PI / 2; break;
      case 'bunny': for (const sx of [-1, 1]) g.add(mesh(CAP, mat('#ffffff'), 0.04, 0.08, 0.025, sx * 0.08, 0.12, -0.02)).rotation.z = -sx * 0.15; break;
      case 'giant': g.add(mesh(CYL, mat('#ff2d95'), 0.45, 0.03, 0.45, 0, -0.04, 0)); g.add(mesh(CYL, mat('#7c4dff'), 0.22, 0.55, 0.22, 0, 0.25, 0)); g.add(mesh(SPH, mat('#ffe066'), 0.08, 0.08, 0.08, 0, 0.6, 0)); break;
      default: return;
    }
    this.hat = g;
    this.head.add(g);
  }

  setGhost(on) {
    this.ghost = on;
    this.group.traverse((o) => {
      if (!o.isMesh || o === this.tag) return;
      if (on) {
        o.userData.origMat ||= o.material;
        o.material = GHOST_MAT;
        o.castShadow = false;
      } else if (o.userData.origMat) { o.material = o.userData.origMat; o.castShadow = true; }
    });
  }

  // --------------------------------------------------------------- nametag
  buildTag() {
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512; this.tagCanvas.height = 160;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tagTex.minFilter = THREE.LinearFilter;
    const m = new THREE.SpriteMaterial({ map: this.tagTex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false });
    this.tag = new THREE.Sprite(m);
    this.tag.center.set(0.5, 0);
    this.tag.renderOrder = 50;
    this.tag.scale.set(0.22, 0.069, 1);
    this.tag.position.y = 1.98;
    this.group.add(this.tag);
    this.tagState = '';
    this.drawTag();
  }
  drawTag() {
    if (!this.tag) return;
    const f = this.flags;
    const lvl = this.speaking ? Math.round(this.level * 6) : -1;
    const key = [this.name, this.look.emoji, lvl, f.ally, f.immune, f.mega, f.offline, f.iso, f.ghost, f.bb, f.nominee, f.wet, f.burned, f.hungry].join('|');
    if (key === this.tagState) return;
    this.tagState = key;
    const g = this.tagCanvas.getContext('2d');
    const W = 512, H = 160;
    g.clearRect(0, 0, W, H);
    g.font = '800 44px Rubik, "Arial Hebrew", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    const icons = [f.ally ? '🤝' : '', f.immune ? '🛡️' : '', f.mega ? '📣' : '', f.nominee ? '⚠️' : '', f.wet ? '💦' : '', f.burned ? '🦞' : '', f.hungry ? '🍽️' : ''].join('');
    const label = this.name;
    const tw = Math.min(400, g.measureText(label).width + 50);
    const x0 = (W - tw) / 2, y0 = 84, hh = 58;
    // pill
    g.fillStyle = f.offline ? 'rgba(60,60,60,0.75)' : f.ghost ? 'rgba(80,110,160,0.6)' : 'rgba(4,18,32,0.72)';
    roundRect(g, x0, y0, tw, hh, 29); g.fill();
    if (this.speaking) {
      g.lineWidth = 6; g.strokeStyle = '#22e0ff'; g.shadowColor = '#22e0ff'; g.shadowBlur = 16;
      roundRect(g, x0, y0, tw, hh, 29); g.stroke();
      g.shadowBlur = 0;
      // level meter
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i < lvl ? '#22e0ff' : 'rgba(34,224,255,0.2)';
        g.fillRect(W / 2 - 54 + i * 19, y0 + hh + 6, 14, 8);
      }
    }
    g.fillStyle = f.offline ? '#bbb' : '#ffffff';
    g.fillText(label, W / 2, y0 + hh / 2 + 2);
    // emoji / icons on top
    g.font = '46px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    const top = (this.look.emoji || '') + icons;
    if (top) g.fillText(top, W / 2, 44);
    if (f.offline) { g.font = '700 26px Rubik, sans-serif'; g.fillStyle = '#ffb4b4'; g.fillText('מנותק', W / 2, 18); }
    if (f.iso) { g.font = '700 26px Rubik, sans-serif'; g.fillStyle = '#ff6b6b'; g.fillText('בבידוד', W / 2, 18); }
    this.tagTex.needsUpdate = true;
  }

  // --------------------------------------------------------------- actions
  emote(id) {
    this.emoteId = id;
    this.emoteT = 0;
    this.emoteDur = id === 'dance' ? 6 : 2.8;
    const e = EMOTES.find((x) => x.id === id);
    if (e && this.onEmoteIcon) this.onEmoteIcon(e.icon);
  }
  tumble(dir = [0, 1]) {
    this.fall = { t: 0, dur: 1.7, dirx: dir[0], dirz: dir[1], seed: Math.random() * 10 };
  }
  doSwing(kind) { this.swing = 1; this.swingKind = kind; }

  setHeld(mesh) {
    if (this.heldMesh === mesh) return;
    if (this.heldMesh) this.heldMesh.removeFromParent();
    this.heldMesh = mesh;
    if (mesh) { mesh.position.set(0, -0.05, 0.08); mesh.rotation.set(0, 0, 0); this.handR.add(mesh); }
  }

  // state: {moving 0..1, speed, crouch, sit, sleep, swim, air}
  update(dt, t, camera, st = {}) {
    const mv = st.moving || 0;
    const run = Math.min(1, (st.speed || 0) / 6);
    this.phase += dt * (5 + run * 6) * (mv > 0.05 ? 1 : 0);
    const s = Math.sin(this.phase);
    const amp = mv * (0.55 + run * 0.4);
    let legL = s * amp, legR = -s * amp, armL = -s * amp * 0.8, armR = s * amp * 0.8;
    let armLz = 0.08, armRz = -0.08, hipsY = 0.92 + Math.abs(Math.cos(this.phase)) * 0.05 * mv, torsoX = run * mv * 0.18, headX = 0, headY = 0, bodyRotZ = 0, bodyRotX = 0;
    // idle breathing
    hipsY += Math.sin(t * 2) * 0.006;
    if (st.crouch) { hipsY -= 0.32; legL -= 0.9; legR -= 0.9; torsoX += 0.35; }
    if (st.sit) { hipsY = 0.45 + (st.seatY || 0) * 0; legL = legR = -1.45; armL = armR = -0.3; torsoX = -0.08; }
    if (st.swim) { hipsY = 0.55; torsoX = 0.9; armL = Math.sin(t * 5) * 2; armR = Math.sin(t * 5 + Math.PI) * 2; legL = Math.sin(t * 7) * 0.3; legR = -legL; }
    if (st.air) { legL = 0.5; legR = -0.3; armLz = 0.7; armRz = -0.7; }
    // emotes
    if (this.emoteId) {
      this.emoteT += dt;
      const e = this.emoteT;
      switch (this.emoteId) {
        case 'wave': armR = -2.8; armRz = -0.3 + Math.sin(e * 12) * 0.4; break;
        case 'hand': armR = -3.0; armRz = -0.1; break;
        case 'dance': hipsY += Math.abs(Math.sin(e * 6)) * 0.08; armL = -2.4 + Math.sin(e * 6) * 0.6; armR = -2.4 - Math.sin(e * 6) * 0.6; armLz = 0.4; armRz = -0.4; bodyRotZ = Math.sin(e * 3) * 0.15; legL = Math.sin(e * 6) * 0.3; legR = -legL; headY = Math.sin(e * 3) * 0.3; break;
        case 'clap': armL = armR = -1.3; armLz = 0.6 + Math.sin(e * 18) * 0.25; armRz = -armLz; break;
        case 'cry': armL = armR = -2.3; armLz = 0.9; armRz = -0.9; headX = 0.35 + Math.sin(e * 14) * 0.05; break;
        case 'laugh': torsoX = -0.25 + Math.sin(e * 20) * 0.05; armL = armR = -0.3; armLz = 0.5; armRz = -0.5; break;
        case 'angry': armL = armR = -0.6 + Math.sin(e * 16) * 0.3; armLz = 0.3; armRz = -0.3; torsoX = 0.15; break;
        case 'shock': armL = armR = -2.6; armLz = 0.8; armRz = -0.8; headX = -0.2; break;
        case 'think': armR = -2.0; armRz = 0.9; headX = 0.1; headY = 0.2; break;
        case 'love': armL = armR = -1.6; armLz = 0.9; armRz = -0.9; break;
      }
      if (this.emoteT > this.emoteDur) this.emoteId = null;
    }
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 4);
      const k = Math.sin((1 - this.swing) * Math.PI);
      if (this.swingKind === 'pillow') { armR = -2.6 + k * 2.2; armRz = -0.6 * k; torsoX += k * 0.2; }
      else { armR = -1.5 * k; armRz = 0; torsoX += k * 0.12; }
    }
    if (st.sleep) { this.body.rotation.set(0, 0, 0); hipsY = 0.28; legL = legR = 0; armL = armR = 0.1; bodyRotX = -Math.PI / 2; }
    // comic ragdoll tumble
    if (this.fall) {
      const f = this.fall;
      f.t += dt;
      const p = f.t / f.dur;
      const down = p < 0.25 ? easeOutBack(p / 0.25) : p > 0.8 ? 1 - easeInOut((p - 0.8) / 0.2) : 1;
      bodyRotX = -down * 1.45;
      bodyRotZ = Math.sin(f.seed) * down * 0.5;
      hipsY = THREE.MathUtils.lerp(hipsY, 0.22, down);
      const fl = down * (1 - p * 0.6);
      armL = Math.sin(t * 22 + f.seed) * 1.6 * fl - 1; armR = Math.cos(t * 19 + f.seed) * 1.6 * fl - 1;
      armLz = 0.9 * fl; armRz = -0.9 * fl;
      legL = Math.sin(t * 17) * 0.9 * fl; legR = Math.cos(t * 15) * 0.9 * fl;
      headY = Math.sin(t * 9) * 0.4 * fl;
      if (f.t > f.dur) this.fall = null;
    }
    const k = Math.min(1, dt * 14);
    const L = THREE.MathUtils.lerp;
    this.legL.rotation.x = L(this.legL.rotation.x, legL, k);
    this.legR.rotation.x = L(this.legR.rotation.x, legR, k);
    this.armL.rotation.x = L(this.armL.rotation.x, armL, k);
    this.armR.rotation.x = L(this.armR.rotation.x, armR, k);
    this.armL.rotation.z = L(this.armL.rotation.z, armLz, k);
    this.armR.rotation.z = L(this.armR.rotation.z, armRz, k);
    this.hips.position.y = L(this.hips.position.y, hipsY, k);
    this.torso.rotation.x = L(this.torso.rotation.x, torsoX, k);
    this.head.rotation.x = L(this.head.rotation.x, headX + (st.pitch || 0) * 0.4, k);
    this.head.rotation.y = L(this.head.rotation.y, headY, k);
    this.body.rotation.x = L(this.body.rotation.x, bodyRotX, k);
    this.body.rotation.z = L(this.body.rotation.z, bodyRotZ, k);
    // talking mouth
    const mouth = this.speaking ? 0.018 + this.level * 0.06 * (0.6 + 0.4 * Math.sin(t * 30)) : 0.018;
    this.mouth.scale.y = L(this.mouth.scale.y, mouth, 0.5);
    if (this.ghost) this.hips.position.y += Math.sin(t * 2.2) * 0.06 + 0.2;
    if (this.tag) this.drawTag();
  }
}

const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.35, depthWrite: false });

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
function easeInOut(x) { return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
