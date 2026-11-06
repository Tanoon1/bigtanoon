// Holdable / throwable items – server simulated
import { groundAt, inWater } from '../../shared/physics.js';
import { MOVE } from '../../shared/constants.js';
import { clamp, isNum, rand } from '../util.js';

export const ITEM_KINDS = {
  pillow: { name: 'כרית', throwable: true },
  cup: { name: 'כוס מים', throwable: true, consume: true },
  tomato: { name: 'עגבנייה', throwable: true, consume: true },
  snack: { name: 'חטיף', throwable: true, consume: true },
  baton: { name: 'המקל', throwable: true },
  crown: { name: 'הכתר', throwable: true },
  star: { name: 'כוכב' },
  egg: { name: 'ביצה' },
  sock: { name: 'גרב', throwable: true },
  puzzle: { name: 'חלק פאזל', throwable: true },
  ingredient: { name: 'מצרך', throwable: true },
  duck: { name: 'ברווז גומי', throwable: true },
  package: { name: 'חבילה מסתורית' },
  letter: { name: 'מכתב' },
  food: { name: 'אוכל', throwable: true, consume: true },
  dish: { name: 'צלחת אוכל', throwable: true, consume: true },
};

export class Items {
  constructor(room) {
    this.room = room;
    this.map = new Map();
    this.seq = 0;
  }
  get(id) { return this.map.get(id); }
  spawn(kind, x, y, z, meta = {}) {
    if (this.map.size > 90) {
      // recycle oldest non-task resting item
      for (const it of this.map.values()) if (!it.meta.task && !it.holder && !it.meta.fixed) { this.remove(it.id); break; }
    }
    const it = { id: 'i' + (++this.seq).toString(36), kind, x, y, z, vx: 0, vy: 0, vz: 0, holder: null, flying: false, thrower: null, meta };
    this.map.set(it.id, it);
    this.room.markState();
    return it;
  }
  remove(id) {
    const it = this.map.get(id);
    if (!it) return;
    if (it.holder) { const h = this.room.players.get(it.holder); if (h && h.held === id) h.held = null; }
    this.map.delete(id);
    this.room.markState();
  }
  give(p, it) {
    if (p.held) return false;
    it.holder = p.id; it.flying = false; p.held = it.id;
    this.room.markState();
    return true;
  }
  pickup(p, id) {
    const it = this.map.get(id);
    if (!it || it.holder || p.held) return false;
    const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z);
    if (d > 2.4 || Math.abs(it.y - (p.pos.y + 0.8)) > 2.4) return false;
    if (it.kind === 'package') { this.room.events.openPackage(p, it); return true; }
    if (it.kind === 'letter') { this.room.events.readLetter(p, it); return true; }
    if (this.room.task && this.room.task.onPickup(p, it) === false) return true;
    it.flying = false;
    this.give(p, it);
    this.room.sfx('pickup', null, p);
    return true;
  }
  drop(p, scatter = false) {
    const it = p.held && this.map.get(p.held);
    p.held = null;
    if (!it) return;
    it.holder = null;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (scatter) {
      it.x = p.pos.x; it.y = p.pos.y + 1.2; it.z = p.pos.z;
      it.vx = rand(-3, 3); it.vy = 3; it.vz = rand(-3, 3); it.flying = true; it.thrower = null; it.flyT = 0;
    } else {
      it.x = p.pos.x + fx * 0.6; it.z = p.pos.z + fz * 0.6; it.y = p.pos.y + 0.9;
      it.vx = fx; it.vy = 0; it.vz = fz; it.flying = true; it.thrower = null; it.flyT = 0;
    }
    this.room.markState();
  }
  throw(p, dir) {
    const it = p.held && this.map.get(p.held);
    if (!it || !ITEM_KINDS[it.kind]?.throwable) return false;
    if (!Array.isArray(dir) || dir.length !== 3 || !dir.every(isNum)) return false;
    let [dx, dy, dz] = dir;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    dy = clamp(dy, -0.6, 0.9);
    p.held = null;
    it.holder = null;
    it.x = p.pos.x + dx * 0.45; it.z = p.pos.z + dz * 0.45; it.y = p.pos.y + MOVE.EYE - 0.2;
    const sp = 12;
    it.vx = dx * sp; it.vy = dy * sp + 2.2; it.vz = dz * sp;
    it.flying = true; it.thrower = p.id; it.flyT = 0;
    this.room.stat(p, 'throws');
    this.room.sfx('whoosh', p.pos);
    this.room.markState();
    return true;
  }
  tick(dt) {
    const colliders = this.room.colliders;
    for (const it of this.map.values()) {
      if (it.holder) {
        const h = this.room.players.get(it.holder);
        if (!h || h.role !== 'hg') { it.holder = null; it.flying = true; it.vx = it.vy = it.vz = 0; if (h) h.held = null; continue; }
        it.x = h.pos.x; it.y = h.pos.y + 1.1; it.z = h.pos.z;
        continue;
      }
      if (!it.flying) continue;
      const sub = 4;
      const sdt = dt / sub;
      for (let s = 0; s < sub && it.flying; s++) {
        it.flyT += sdt;
        const px = it.x, py = it.y, pz = it.z;
        it.vy -= 16 * sdt;
        it.x += it.vx * sdt; it.y += it.vy * sdt; it.z += it.vz * sdt;
        // wall / furniture collision
        for (const c of colliders) {
          if (it.x > c.x1 && it.x < c.x2 && it.z > c.z1 && it.z < c.z2 && it.y < c.y2 && it.y > c.y1) {
            if (py >= c.y2 - 0.05) { it.y = c.y2; it.vy = 0; it.vx *= 0.3; it.vz *= 0.3; }
            else { it.x = px; it.z = pz; it.vx = -it.vx * 0.2; it.vz = -it.vz * 0.2; }
            break;
          }
        }
        // hit players
        if (it.thrower && it.flyT > 0.04) {
          for (const p of this.room.players.values()) {
            if (p.role !== 'hg' || p.id === it.thrower) continue;
            const dx = it.x - p.pos.x, dz = it.z - p.pos.z;
            if (dx * dx + dz * dz < 0.5 * 0.5 && it.y > p.pos.y && it.y < p.pos.y + 1.9) {
              this.room.onItemHit(it, p);
              if (!this.map.has(it.id)) break;
              it.thrower = null; it.vx *= -0.2; it.vz *= -0.2;
              break;
            }
          }
          if (!this.map.has(it.id)) break;
        }
        const g = inWater(it.x, it.z) ? -0.12 : groundAt(it.x, it.z, it.y, colliders, 0.05);
        if (it.y <= g) {
          it.y = g;
          if (Math.abs(it.vy) > 3 && !inWater(it.x, it.z)) { it.vy = -it.vy * 0.25; it.vx *= 0.5; it.vz *= 0.5; }
          else {
            it.flying = false; it.vx = it.vy = it.vz = 0; it.thrower = null;
            if (ITEM_KINDS[it.kind]?.consume && it.flyT > 0.2 && it.kind !== 'snack') { this.room.sfx('splat', it); this.remove(it.id); }
            this.room.markState();
          }
        }
        if (it.y < -5 || Math.abs(it.x) > 40 || Math.abs(it.z) > 40) { this.remove(it.id); break; }
      }
    }
  }
  list() {
    const out = [];
    for (const it of this.map.values()) out.push({ id: it.id, k: it.kind, x: r2(it.x), y: r2(it.y), z: r2(it.z), h: it.holder, m: it.meta.ing || it.meta.color || undefined });
    return out;
  }
  flyingSnap() {
    const out = [];
    for (const it of this.map.values()) if (it.flying) out.push([it.id, r2(it.x), r2(it.y), r2(it.z)]);
    return out;
  }
}
const r2 = (v) => Math.round(v * 100) / 100;
