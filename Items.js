// Item meshes, first-person held item, particles/FX, the dog, task markers
import * as THREE from 'three';
import { lambert } from './materials.js';
import { INGREDIENTS } from '../../../shared/tasks.js';

const B = new THREE.BoxGeometry(1, 1, 1), S = new THREE.SphereGeometry(1, 12, 8), C = new THREE.CylinderGeometry(1, 1, 1, 12);
const mc = new Map();
const m = (c, o) => { const k = c + JSON.stringify(o || {}); if (!mc.has(k)) mc.set(k, lambert({ color: c, ...(o || {}) })); return mc.get(k); };
const glowM = (c) => new THREE.MeshBasicMaterial({ color: c, toneMapped: false });
function part(g, geo, mat, sx, sy, sz, x = 0, y = 0, z = 0) { const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; }

export function makeItemMesh(kind, meta) {
  const g = new THREE.Group();
  switch (kind) {
    case 'pillow': part(g, S, m('#ffffff'), 0.28, 0.1, 0.2); part(g, S, m('#22c7dc'), 0.2, 0.105, 0.14); break;
    case 'cup': part(g, C, new THREE.MeshPhongMaterial({ color: 0xbfefff, transparent: true, opacity: 0.6 }), 0.06, 0.14, 0.06, 0, 0.07); part(g, C, glowM(0x39c9f0), 0.055, 0.1, 0.055, 0, 0.06); break;
    case 'tomato': part(g, S, m('#e53935'), 0.08, 0.075, 0.08, 0, 0.07); part(g, S, m('#2e7d32'), 0.03, 0.015, 0.03, 0, 0.145); break;
    case 'snack': part(g, B, m('#7b3f1d'), 0.14, 0.04, 0.08, 0, 0.02); part(g, B, m('#ffca28'), 0.15, 0.042, 0.04, 0, 0.02); break;
    case 'baton': part(g, C, glowM(0x22e0ff), 0.035, 0.45, 0.035, 0, 0.22); part(g, S, glowM(0xffffff), 0.05, 0.05, 0.05, 0, 0.46); break;
    case 'crown': { const gold = m('#ffcf3a', { emissive: 0x553a00 }); part(g, C, gold, 0.16, 0.09, 0.16, 0, 0.05); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; part(g, new THREE.ConeGeometry(1, 1, 6), gold, 0.035, 0.1, 0.035, Math.cos(a) * 0.14, 0.14, Math.sin(a) * 0.14); } break; }
    case 'star': { const sh = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 0.07 : 0.17, a = (i / 10) * Math.PI * 2 - Math.PI / 2; i ? sh.lineTo(Math.cos(a) * r, Math.sin(a) * r) : sh.moveTo(Math.cos(a) * r, Math.sin(a) * r); } const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: false }); const o = new THREE.Mesh(geo, glowM(0xffd34d)); o.position.y = 0.2; g.add(o); g.userData.spin = true; break; }
    case 'egg': part(g, S, m(['#ff5c8a', '#26c6da', '#ffb627', '#7c4dff'][Math.floor(Math.random() * 4)], { emissive: 0x222222 }), 0.09, 0.12, 0.09, 0, 0.12); g.userData.spin = true; break;
    case 'sock': part(g, B, m('#f5f5f5'), 0.08, 0.22, 0.06, 0, 0.11); part(g, B, m('#f5f5f5'), 0.08, 0.06, 0.16, 0, 0.03, 0.05); part(g, B, m('#e53935'), 0.085, 0.04, 0.065, 0, 0.2); break;
    case 'puzzle': part(g, B, m('#7c4dff', { emissive: 0x220055 }), 0.22, 0.04, 0.22, 0, 0.02); part(g, C, m('#7c4dff', { emissive: 0x220055 }), 0.05, 0.04, 0.05, 0.13, 0.02); g.userData.spin = true; break;
    case 'ingredient': { const ing = INGREDIENTS.find((x) => x.id === meta) || INGREDIENTS[0]; part(g, S, m(ing.color), 0.09, 0.08, 0.09, 0, 0.08); break; }
    case 'duck': part(g, S, m('#ffd600'), 0.12, 0.09, 0.15, 0, 0.08); part(g, S, m('#ffd600'), 0.07, 0.07, 0.07, 0, 0.18, 0.08); part(g, B, m('#ff8f00'), 0.04, 0.02, 0.05, 0, 0.17, 0.16); break;
    case 'package': part(g, B, m('#a1887f'), 0.45, 0.35, 0.45, 0, 0.175); part(g, B, m('#e53935'), 0.47, 0.06, 0.08, 0, 0.36); part(g, B, m('#e53935'), 0.08, 0.06, 0.47, 0, 0.36); g.userData.spin = true; break;
    case 'letter': part(g, B, m('#fff8e1', { emissive: 0x333322 }), 0.24, 0.02, 0.16, 0, 0.02); part(g, B, m('#e53935'), 0.05, 0.022, 0.05, 0, 0.022); g.userData.spin = true; break;
    case 'dish': part(g, C, m('#ffffff'), 0.17, 0.02, 0.17, 0, 0.01); part(g, S, m(meta === 'kebab' ? '#8d4a1f' : meta === 'salad' ? '#43a047' : meta === 'cake' ? '#5a3216' : '#e8a33c'), 0.11, 0.05, 0.11, 0, 0.05); break;
    case 'food': part(g, B, m('#ffd54f', { emissive: 0x221100 }), 0.12, 0.1, 0.09, 0, 0.05); break;
    default: part(g, S, m('#999'), 0.1, 0.1, 0.1);
  }
  return g;
}

export class ItemView {
  constructor(scene) {
    this.scene = scene;
    this.map = new Map();
  }
  sync(items, players, myId, controllerHeld) {
    const seen = new Set();
    for (const it of items) {
      seen.add(it.id);
      let e = this.map.get(it.id);
      if (!e) { e = { mesh: makeItemMesh(it.k, it.m), kind: it.k }; this.scene.add(e.mesh); this.map.set(it.id, e); }
      e.holder = it.h;
      e.target = new THREE.Vector3(it.x, it.y, it.z);
      if (!e.init) { e.mesh.position.copy(e.target); e.init = true; }
      if (it.h) {
        const pe = players.get(it.h);
        if (it.h === myId) { e.mesh.visible = false; }
        else if (pe) { e.mesh.visible = true; pe.avatar.setHeld(e.mesh); }
      } else if (e.mesh.parent !== this.scene) {
        // detach from hand
        const wp = new THREE.Vector3(); e.mesh.getWorldPosition(wp);
        e.mesh.removeFromParent(); this.scene.add(e.mesh); e.mesh.position.copy(wp); e.mesh.rotation.set(0, 0, 0);
        e.mesh.visible = true;
      } else e.mesh.visible = true;
    }
    for (const [id, e] of this.map) if (!seen.has(id)) { e.mesh.removeFromParent(); this.map.delete(id); }
    for (const pe of players.map.values()) if (pe.avatar.heldMesh && ![...this.map.values()].some((e) => e.mesh === pe.avatar.heldMesh)) pe.avatar.setHeld(null);
  }
  onFlying(list) {
    for (const [id, x, y, z] of list || []) { const e = this.map.get(id); if (e && !e.holder) { e.target = new THREE.Vector3(x, y, z); e.flying = true; } }
  }
  update(dt, t) {
    for (const e of this.map.values()) {
      if (e.holder || !e.target) continue;
      e.mesh.position.lerp(e.target, Math.min(1, dt * 18));
      if (e.mesh.userData.spin) { e.mesh.rotation.y = t * 2; e.mesh.position.y = e.target.y + Math.sin(t * 3) * 0.05 + 0.05; }
    }
  }
  nearest(pos, fwd, maxD = 2.3) {
    let best = null, bs = -1;
    for (const [id, e] of this.map) {
      if (e.holder || !e.mesh.visible) continue;
      const p = e.mesh.position;
      const dx = p.x - pos.x, dy = p.y - pos.y, dz = p.z - pos.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > maxD) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / (d || 1);
      const score = dot - d * 0.15;
      if (dot > 0.75 && score > bs) { bs = score; best = { id, kind: e.kind, d }; }
    }
    return best;
  }
}

// ---------------------------------------------------------------- particles
export class FX {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    const n = 600;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, depthWrite: false, toneMapped: false }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.n = n;
    this.sprites = [];
  }
  burst(x, y, z, kind = 'confetti', count = 40) {
    const palettes = {
      confetti: [[1, 0.3, 0.6], [0.2, 0.9, 1], [1, 0.85, 0.2], [0.5, 0.4, 1]],
      splash: [[0.5, 0.85, 1], [0.8, 0.95, 1]],
      feathers: [[1, 1, 1], [0.9, 0.95, 1]],
      splat: [[0.9, 0.15, 0.1], [1, 0.4, 0.2]],
      sparks: [[1, 0.9, 0.4], [1, 0.6, 0.2]],
      water: [[0.6, 0.85, 1]],
    };
    const pal = palettes[kind] || palettes.confetti;
    for (let i = 0; i < count; i++) {
      if (this.parts.length >= this.n) this.parts.shift();
      const c = pal[i % pal.length];
      const sp = kind === 'feathers' ? 1.5 : kind === 'water' ? 0.4 : 3.5;
      this.parts.push({ x, y, z, vx: (Math.random() - 0.5) * sp, vy: Math.random() * sp * (kind === 'water' ? -1 : 1) + (kind === 'feathers' ? 0.5 : 1), vz: (Math.random() - 0.5) * sp, life: kind === 'feathers' ? 2.2 : 1.3, c, drag: kind === 'feathers' ? 2.5 : kind === 'confetti' ? 1.2 : 0.3, g: kind === 'feathers' ? 1 : 9 });
    }
  }
  emoji(pos, icon, big = false) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.font = '96px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(icon, 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.position.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 2.2, pos.z + (Math.random() - 0.5) * 0.4);
    s.scale.setScalar(big ? 0.9 : 0.5);
    this.scene.add(s);
    this.sprites.push({ s, life: 2.2, vy: 0.6 });
  }
  text(pos, txt, color = '#ffd34d') {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'); g.font = '900 80px "Secular One", Rubik, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = '#000'; g.strokeText(txt, 128, 64); g.fillStyle = color; g.fillText(txt, 128, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: false }));
    s.position.set(pos.x, pos.y + 1.7, pos.z); s.scale.set(0.9, 0.45, 1); s.renderOrder = 60;
    this.scene.add(s);
    this.sprites.push({ s, life: 0.9, vy: 0.8, pop: true });
  }
  update(dt) {
    let i = 0;
    for (const p of this.parts) {
      p.life -= dt;
      p.vy -= p.g * dt;
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k; if (p.drag > 1) p.vy *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02 && p.vy < 0) { p.y = 0.02; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const p of this.parts) {
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const a = Math.min(1, p.life * 2);
      this.col[i * 3] = p.c[0] * a; this.col[i * 3 + 1] = p.c[1] * a; this.col[i * 3 + 2] = p.c[2] * a;
      i++;
    }
    for (let j = i; j < Math.min(this.n, i + 50); j++) { this.pos[j * 3 + 1] = -100; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.setDrawRange(0, Math.max(1, i));
    for (const sp of this.sprites) {
      sp.life -= dt;
      sp.s.position.y += sp.vy * dt;
      sp.s.material.opacity = Math.min(1, sp.life * 1.5);
      if (sp.pop) sp.s.scale.multiplyScalar(1 + dt * 0.6);
      if (sp.life <= 0) { sp.s.removeFromParent(); sp.s.material.map.dispose(); sp.s.material.dispose(); }
    }
    this.sprites = this.sprites.filter((s) => s.life > 0);
  }
}

// ---------------------------------------------------------------- dog NPC
export class Dog {
  constructor(scene) {
    const g = new THREE.Group();
    const fur = m('#c58b4e'), dark = m('#6d4c2f');
    part(g, S, fur, 0.32, 0.2, 0.45, 0, 0.42, 0);
    this.head = new THREE.Group(); this.head.position.set(0, 0.62, 0.42); g.add(this.head);
    part(this.head, S, fur, 0.18, 0.17, 0.2);
    part(this.head, S, dark, 0.07, 0.06, 0.08, 0, -0.04, 0.17);
    for (const sx of [-1, 1]) { part(this.head, S, dark, 0.05, 0.12, 0.03, sx * 0.14, 0.08, -0.02); part(this.head, S, m('#111'), 0.025, 0.025, 0.02, sx * 0.07, 0.05, 0.16); }
    this.legs = [];
    for (const [x, z] of [[-0.16, 0.25], [0.16, 0.25], [-0.16, -0.25], [0.16, -0.25]]) { const l = new THREE.Group(); l.position.set(x, 0.35, z); part(l, C, fur, 0.05, 0.35, 0.05, 0, -0.17, 0); g.add(l); this.legs.push(l); }
    this.tail = new THREE.Group(); this.tail.position.set(0, 0.5, -0.42); part(this.tail, C, fur, 0.03, 0.3, 0.03, 0, 0.12, 0); this.tail.rotation.x = -0.6; g.add(this.tail);
    this.g = g; g.visible = false; scene.add(g);
    this.wag = 0;
  }
  set(snap, dt, t) {
    if (!snap) { this.g.visible = false; return; }
    const [x, z, yaw, moving] = snap;
    this.g.visible = true;
    const tp = new THREE.Vector3(x, 0, z);
    if (this.g.position.distanceTo(tp) > 5) this.g.position.copy(tp);
    this.g.position.lerp(tp, Math.min(1, dt * 8));
    this.g.rotation.y = yaw;
    const sw = moving ? Math.sin(t * 14) * 0.6 : 0;
    this.legs.forEach((l, i) => { l.rotation.x = i % 3 === 0 ? sw : -sw; });
    this.wag = Math.max(0, this.wag - dt);
    this.tail.rotation.z = Math.sin(t * (this.wag > 0 ? 30 : 8)) * (this.wag > 0 ? 0.9 : 0.3);
    this.head.rotation.x = Math.sin(t * 2) * 0.1;
  }
}

// ---------------------------------------------------------------- task markers (race rings, goals, lava)
export class TaskMarkers {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.key = '';
    this.lava = new THREE.Mesh(new THREE.PlaneGeometry(34, 12), new THREE.MeshBasicMaterial({ color: 0xff3300, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.lava.rotation.x = -Math.PI / 2; this.lava.position.set(-1, 0.03, 0);
    scene.add(this.lava);
    this.lavaWarnUntil = 0;
  }
  set(task, myId) {
    const pub = task?.pub || {};
    let key = task ? task.id : '';
    if (task?.kind === 'race') key += ':' + (pub.idx?.[myId] || 0);
    if (task?.kind === 'statues') key += ':' + pub.red;
    if (key === this.key) return;
    this.key = key;
    this.group.clear();
    if (!task) return;
    const ring = (x, z, color, r = 1.4) => {
      const o = new THREE.Mesh(new THREE.TorusGeometry(r, 0.08, 8, 40), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
      o.rotation.x = Math.PI / 2; o.position.set(x, 0.15, z); this.group.add(o);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 4, 24, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
      beam.position.set(x, 2, z); this.group.add(beam);
      return o;
    };
    if (task.kind === 'race' && pub.cps) {
      const idx = pub.idx?.[myId] || 0;
      pub.cps.forEach(([x, z], i) => { if (i >= idx) ring(x, z, i === idx ? 0x22e0ff : 0x335566, i === idx ? 1.6 : 0.8); });
    }
    if (task.kind === 'statues' && pub.goal) ring(pub.goal[0], pub.goal[1], pub.red ? 0xff3344 : 0x33ff88, 1.6);
    if (task.kind === 'gather' && task.zoneRect) { /* zone hint handled by HUD */ }
  }
  update(dt, t, lavaActive) {
    for (const o of this.group.children) if (o.geometry.type === 'TorusGeometry') o.rotation.z = t;
    const target = lavaActive ? 0.55 + Math.sin(t * 10) * 0.15 : 0;
    this.lava.material.opacity += (target - this.lava.material.opacity) * Math.min(1, dt * 8);
    this.lava.visible = this.lava.material.opacity > 0.01;
  }
}
