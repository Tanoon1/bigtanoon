// Shared character physics (client prediction + server validation)
import { MOVE } from './constants.js';
import { POOL, inRect } from './layout.js';

const R = MOVE.RADIUS;

function blocks(c, feetY, step) {
  return c.y2 > feetY + step && c.y1 < feetY + MOVE.HEIGHT;
}

function pushOut(p, c, r) {
  const cx = Math.max(c.x1, Math.min(p.x, c.x2));
  const cz = Math.max(c.z1, Math.min(p.z, c.z2));
  const dx = p.x - cx, dz = p.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const k = (r - d) / d;
    p.x += dx * k; p.z += dz * k;
  } else {
    // center inside box: push along smallest axis
    const l = p.x - c.x1, rr = c.x2 - p.x, t = p.z - c.z1, b = c.z2 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = c.x1 - r; else if (m === rr) p.x = c.x2 + r; else if (m === t) p.z = c.z1 - r; else p.z = c.z2 + r;
  }
  return true;
}

export function inWater(x, z) {
  return inRect(POOL.rect, x, z);
}

export function stepAllowance(feetY) {
  return feetY < -0.3 ? 1.25 : MOVE.STEP;
}

export function groundAt(x, z, feetY, colliders, r = R) {
  let g = inWater(x, z) ? POOL.floatFeet : 0;
  const step = stepAllowance(feetY);
  for (const c of colliders) {
    if (c.y2 > feetY + step + 0.001) continue;
    if (x + r * 0.6 < c.x1 || x - r * 0.6 > c.x2 || z + r * 0.6 < c.z1 || z - r * 0.6 > c.z2) continue;
    if (c.y2 > g) g = c.y2;
  }
  return g;
}

// Horizontal move with sliding. Mutates p {x,z}. feetY used for blocking test.
export function moveHorizontal(p, dx, dz, feetY, colliders, r = R) {
  const dist = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(dist / 0.2));
  const sx = dx / steps, sz = dz / steps;
  const step = stepAllowance(feetY);
  for (let i = 0; i < steps; i++) {
    p.x += sx;
    for (const c of colliders) if (blocks(c, feetY, step)) pushOut(p, c, r);
    p.z += sz;
    for (const c of colliders) if (blocks(c, feetY, step)) pushOut(p, c, r);
  }
  // final pass
  for (let k = 0; k < 2; k++) for (const c of colliders) if (blocks(c, feetY, step)) pushOut(p, c, r);
  return p;
}

// Full character step. s = {x,y,z,vy,onGround}
export function stepCharacter(s, dx, dz, jump, dt, colliders) {
  const p = { x: s.x, z: s.z };
  moveHorizontal(p, dx, dz, s.y, colliders);
  s.x = p.x; s.z = p.z;
  const water = inWater(s.x, s.z) && s.y < 0.2;
  if (jump && (s.onGround || water)) { s.vy = water ? 3.6 : MOVE.JUMP_V; s.onGround = false; }
  s.vy -= (water ? MOVE.GRAVITY * 0.35 : MOVE.GRAVITY) * dt;
  if (water && s.vy < -2) s.vy = -2;
  s.y += s.vy * dt;
  const g = groundAt(s.x, s.z, Math.max(s.y, -2), colliders);
  if (s.y <= g) {
    // smooth step-up
    s.y = g; s.vy = 0; s.onGround = true;
  } else s.onGround = s.y - g < 0.02;
  return s;
}

export function insideAnyBlocking(x, z, feetY, colliders, r = R * 0.8) {
  const step = stepAllowance(feetY);
  for (const c of colliders) {
    if (!blocks(c, feetY, step)) continue;
    const cx = Math.max(c.x1, Math.min(x, c.x2));
    const cz = Math.max(c.z1, Math.min(z, c.z2));
    if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return true;
  }
  return false;
}

export const WORLD_BOUNDS = { x1: -17.8, x2: 15.8, z1: -11.8, z2: 23.8 };
export function clampBounds(p) {
  p.x = Math.max(WORLD_BOUNDS.x1, Math.min(WORLD_BOUNDS.x2, p.x));
  p.z = Math.max(WORLD_BOUNDS.z1, Math.min(WORLD_BOUNDS.z2, p.z));
}

// 2D ray vs AABB walls; returns true if line of sight is clear (ignores low furniture)
export function lineOfSight(ax, az, bx, bz, colliders) {
  for (const c of colliders) {
    if (c.y2 < 1.5) continue;
    if (segBox(ax, az, bx, bz, c)) return false;
  }
  return true;
}
function segBox(ax, az, bx, bz, c) {
  let t0 = 0, t1 = 1;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - c.x1, c.x2 - ax, az - c.z1, c.z2 - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-12) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return t0 < t1 && t1 > 0.02 && t0 < 0.98;
}
