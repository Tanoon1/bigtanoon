// =====================================================================
//  The Big Brother house – built from shared/layout.js, low-poly stylized.
//  Static geometry is merged per material (few draw calls).
// =====================================================================
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ROOMS, ROOM_BY_ID, DOORS, WALLS, wallPieces, WALL_H, FURNITURE, FURNITURE_TYPES, furnitureSize, POOL, roomAt, BB_CAMERAS, INTERACTABLES, EXIT_STAIRS,
} from '../../../shared/layout.js';
import { lambert, phong, tex, emissive, ScreenTexture, roomUniforms, drawEye } from './materials.js';

const matCache = new Map();
function M(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) {
    const { spec, ...rest } = opts;
    matCache.set(key, (spec ? phong : lambert)({ color, ...rest }));
  }
  return matCache.get(key);
}
function TM(name, repeat = [1, 1], color = '#ffffff', spec = false) {
  const key = `tex:${name}:${repeat}:${color}:${spec}`;
  if (!matCache.has(key)) {
    const t = tex(name).clone();
    t.repeat.set(repeat[0], repeat[1]);
    t.needsUpdate = true;
    matCache.set(key, (spec ? phong : lambert)({ map: t, color, ...(spec ? { shininess: 60, specular: 0x555555 } : {}) }));
  }
  return matCache.get(key);
}

class Batcher {
  constructor() { this.batches = new Map(); }
  add(mesh) {
    mesh.updateMatrixWorld(true);
    const g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (g.index) { /* ok */ }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const ng = g.index ? g.toNonIndexed() : g;
    const list = this.batches.get(mesh.material) || [];
    list.push(ng);
    this.batches.set(mesh.material, list);
  }
  build(parent) {
    for (const [mat, list] of this.batches) {
      const merged = mergeGeometries(list, false);
      const mesh = new THREE.Mesh(merged, mat);
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = true;
      mesh.castShadow = !mat.transparent;
      parent.add(mesh);
    }
    this.batches.clear();
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const SPH = new THREE.SphereGeometry(1, 14, 10);

export class House {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.root = new THREE.Group();
    this.root.name = 'house';
    scene.add(this.root);
    this.static = new Batcher();
    this.doors = {};
    this.screens = [];
    this.anim = [];
    this.build();
  }

  // ---------- primitive helpers (into a parent group, later batched) ----------
  box(parent, w, h, d, mat, x, y, z, ry = 0) {
    const m = new THREE.Mesh(BOX, mat);
    m.scale.set(w, h, d); m.position.set(x, y, z); m.rotation.y = ry;
    parent.add(m);
    return m;
  }
  cyl(parent, r, h, mat, x, y, z, rb = r, seg = 16) {
    const g = seg === 16 && rb === r ? CYL : new THREE.CylinderGeometry(r, rb, 1, seg);
    const m = new THREE.Mesh(g, mat);
    if (g === CYL) m.scale.set(r, h, r); else m.scale.set(1, h, 1);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  sph(parent, r, mat, x, y, z, sy = 1) {
    const m = new THREE.Mesh(SPH, mat);
    m.scale.set(r, r * sy, r); m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  bake(group) {
    group.updateMatrixWorld(true);
    group.traverse((o) => { if (o.isMesh && !o.userData.dynamic) this.static.add(o); });
  }

  build() {
    this.buildFloors();
    this.buildWalls();
    this.buildCeilings();
    this.buildYard();
    for (const f of FURNITURE) this.buildFurniture(f);
    this.buildDecor();
    this.static.build(this.root);
    this.buildDoors();
    this.buildScreens();
    this.buildCameras();
    this.buildSky();
    this.buildLights();
  }

  // =====================================================================
  floorMat(r, w, d) {
    const rep = [w / 2, d / 2];
    switch (r.floor) {
      case 'tile': return TM('tile', [w / 1.5, d / 1.5], '#ffffff', true);
      case 'tileSmall': return TM('tileSmall', rep);
      case 'wood': return TM('wood', [w / 3, d / 3], '#ffffff', true);
      case 'carpet': return TM('carpet', rep);
      case 'dark': return TM('dark', [w / 3, d / 3], '#ffffff', true);
      case 'padded': return TM('padded', rep);
      case 'gold': return TM('marble', rep, '#e8dcc0', true);
      default: return M('#888');
    }
  }
  buildFloors() {
    const g = new THREE.Group();
    for (const r of ROOMS) {
      if (r.outdoor) continue;
      const [x1, z1, x2, z2] = r.rect;
      const w = x2 - x1, d = z2 - z1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.floorMat(r, w, d));
      m.rotation.x = -Math.PI / 2;
      m.position.set((x1 + x2) / 2, 0, (z1 + z2) / 2);
      g.add(m);
    }
    // living room: big round rug with the eye motif ring
    const rug = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), M('#0e3a4c'));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.7, 0.01, 0.4);
    g.add(rug);
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 2.95, 48), emissive('#1ad6f0', 0.9));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0.7, 0.015, 0.4);
    g.add(ring);
    // bedroom rugs
    for (const z of [-2.6, 0, 2.6]) { const rr = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), M('#ff7aa8')); rr.rotation.x = -Math.PI / 2; rr.position.set(-14.6, 0.01, z); g.add(rr); }
    this.root.add(g);
    this.bake(g);
    g.removeFromParent();
  }

  // =====================================================================
  wallMatFor(roomId, kind) {
    if (!roomId) return kind === 'fence' ? M('#0c2b38') : M('#dfe9ec');
    const r = ROOM_BY_ID[roomId];
    if (r.outdoor && kind !== 'fence') return M('#e4edf0');
    if (r.floor === 'padded') return TM('padded', [2, 1.5]);
    return M(r.wall);
  }
  buildWalls() {
    const g = new THREE.Group();
    const glass = new THREE.MeshPhongMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.18, shininess: 90, depthWrite: false, side: THREE.DoubleSide });
    const frame = M('#e8eef0');
    for (const w of WALLS) {
      for (const p of wallPieces(w)) {
        const horiz = p.horiz;
        const len = p.b - p.a;
        const mid = (p.a + p.b) / 2;
        const cx = horiz ? mid : p.x1, cz = horiz ? p.z1 : mid;
        const sideA = horiz ? roomAt(mid, p.z1 - 0.3) : roomAt(p.x1 - 0.3, mid);
        const sideB = horiz ? roomAt(mid, p.z1 + 0.3) : roomAt(p.x1 + 0.3, mid);
        const H = p.h;
        if (p.gap) {
          // lintel above door gaps (doors are 2.3m high), not for the arch opening
          const top = H - 2.35;
          if (top > 0) this.wallSlab(g, horiz, cx, cz, len, 2.35 + top / 2, top, sideA, sideB, w.kind);
          continue;
        }
        if (w.kind === 'glass') {
          // glass façade: frame posts & panes
          const n = Math.max(1, Math.round(len / 1.6));
          for (let i = 0; i <= n; i++) {
            const t = p.a + (len * i) / n;
            this.box(g, 0.08, H, 0.12, frame, horiz ? t : cx, H / 2, horiz ? cz : t);
          }
          this.box(g, horiz ? len : 0.14, 0.18, horiz ? 0.14 : len, frame, cx, H - 0.09, cz);
          this.box(g, horiz ? len : 0.14, 0.1, horiz ? 0.14 : len, frame, cx, 0.05, cz);
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(len, H - 0.25), glass);
          pane.position.set(cx, H / 2, cz);
          if (!horiz) pane.rotation.y = Math.PI / 2;
          this.root.add(pane);
          continue;
        }
        if (p.windows.length) {
          let cur = p.a;
          for (const [s, e] of p.windows) {
            if (s > cur) this.wallSeg(g, horiz, cur, s, p, H, sideA, sideB, w.kind);
            const wm = (s + e) / 2, wl = e - s;
            const wx = horiz ? wm : cx, wz = horiz ? cz : wm;
            this.wallSlab(g, horiz, wx, wz, wl, 0.5, 1.0, sideA, sideB, w.kind);
            this.wallSlab(g, horiz, wx, wz, wl, 2.3 + (H - 2.3) / 2, H - 2.3, sideA, sideB, w.kind);
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(wl, 1.3), glass);
            pane.position.set(wx, 1.65, wz);
            if (!horiz) pane.rotation.y = Math.PI / 2;
            this.root.add(pane);
            this.box(g, horiz ? wl : 0.24, 0.06, horiz ? 0.24 : wl, frame, wx, 1.0, wz);
            cur = e;
          }
          if (cur < p.b) this.wallSeg(g, horiz, cur, p.b, p, H, sideA, sideB, w.kind);
          continue;
        }
        this.wallSeg(g, horiz, p.a, p.b, p, H, sideA, sideB, w.kind);
      }
    }
    this.root.add(g);
    this.bake(g);
    g.removeFromParent();
  }
  wallSeg(g, horiz, a, b, p, H, sideA, sideB, kind) {
    const len = b - a, mid = (a + b) / 2;
    const cx = horiz ? mid : p.x1, cz = horiz ? p.z1 : mid;
    this.wallSlab(g, horiz, cx, cz, len, H / 2, H, sideA, sideB, kind);
    // baseboards + neon top strips per side
    for (const [side, sgn] of [[sideA, -1], [sideB, 1]]) {
      const off = 0.11 * sgn;
      const x = horiz ? cx : cx + off, z = horiz ? cz + off : cz;
      if (!side) {
        if (kind === 'fence') continue;
        // facade trim
        this.box(g, horiz ? len : 0.04, 0.25, horiz ? 0.04 : len, M('#1fb5c9'), x, H - 0.3, z);
        continue;
      }
      const r = ROOM_BY_ID[side];
      if (r.outdoor) {
        if (kind === 'fence' && len > 1) {
          // studio-like LED panels on yard walls
          const n = Math.floor(len / 3.4);
          for (let i = 0; i < n; i++) {
            const t = a + (len / n) * (i + 0.5);
            const px = horiz ? t : cx + off * 1.05, pz = horiz ? cz + off * 1.05 : t;
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.8), new THREE.MeshBasicMaterial({ map: tex('led'), toneMapped: false, color: 0x9fdcff }));
            panel.position.set(px, 2.6, pz);
            panel.rotation.y = horiz ? (sgn > 0 ? 0 : Math.PI) : (sgn > 0 ? Math.PI / 2 : -Math.PI / 2);
            g.add(panel);
          }
          this.box(g, horiz ? len : 0.05, 0.08, horiz ? 0.05 : len, emissive('#22e0ff', 1.3), x, 0.6, z);
          this.box(g, horiz ? len : 0.05, 0.08, horiz ? 0.05 : len, emissive('#22e0ff', 1.3), x, 4.8, z);
        }
        continue;
      }
      this.box(g, horiz ? len : 0.03, 0.12, horiz ? 0.03 : len, M(r.wall2), x, 0.06, z);
      if (['living', 'diary', 'bedroom', 'exit', 'secret'].includes(side)) {
        this.box(g, horiz ? len : 0.03, 0.05, horiz ? 0.03 : len, emissive(r.accent, 1.1), x, H - 0.12, z);
      }
      if (side === 'living' || side === 'kitchen') {
        // accent wainscot band
        this.box(g, horiz ? len : 0.025, 0.9, horiz ? 0.025 : len, M(r.wall2), x, 0.57, z);
      }
    }
  }
  wallSlab(g, horiz, cx, cz, len, y, h, sideA, sideB, kind) {
    const t = 0.1;
    const ma = this.wallMatFor(sideA, kind), mb = this.wallMatFor(sideB, kind);
    if (horiz) {
      this.box(g, len, h, t, ma, cx, y, cz - t / 2);
      this.box(g, len, h, t, mb, cx, y, cz + t / 2);
    } else {
      this.box(g, t, h, len, ma, cx - t / 2, y, cz);
      this.box(g, t, h, len, mb, cx + t / 2, y, cz);
    }
    // top cap
    this.box(g, horiz ? len : 0.2, 0.02, horiz ? 0.2 : len, M('#cfd8dc'), cx, y + h / 2 + 0.01, cz);
  }

  buildCeilings() {
    const g = new THREE.Group();
    for (const r of ROOMS) {
      if (r.outdoor) continue;
      const [x1, z1, x2, z2] = r.rect;
      const w = x2 - x1, d = z2 - z1;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M(r.ceil));
      m.rotation.x = Math.PI / 2;
      m.position.set((x1 + x2) / 2, WALL_H, (z1 + z2) / 2);
      g.add(m);
      // light panels
      const lightMat = emissive(r.id === 'diary' || r.id === 'exit' ? '#2fb8ff' : r.id === 'secret' ? '#ffd890' : r.id === 'bedroom' ? '#ffc6e2' : '#f4fbff', 0.9);
      const nx = Math.max(1, Math.round(w / 4)), nz = Math.max(1, Math.round(d / 4));
      if (r.id !== 'living') for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), lightMat);
        p.rotation.x = Math.PI / 2;
        p.position.set(x1 + (w / nx) * (i + 0.5), WALL_H - 0.01, z1 + (d / nz) * (k + 0.5));
        g.add(p);
      }
      // roof (outside top)
      const roof = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.2, d + 0.2), M('#55666e'));
      roof.rotation.x = -Math.PI / 2;
      roof.position.set((x1 + x2) / 2, WALL_H + 0.03, (z1 + z2) / 2);
      g.add(roof);
    }
    // living room iconic light ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.07, 8, 64), emissive('#40ecff', 0.85));
    ring.rotation.x = Math.PI / 2; ring.position.set(0.7, WALL_H - 0.25, 0.4);
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.05, 8, 48), emissive('#cfffff', 0.7));
    ring2.rotation.x = Math.PI / 2; ring2.position.set(0.7, WALL_H - 0.18, 0.4);
    g.add(ring2);
    this.root.add(g);
    this.bake(g);
    g.removeFromParent();
  }

  // =====================================================================
  buildYard() {
    const g = new THREE.Group();
    const [yx1, yz1, yx2, yz2] = ROOM_BY_ID.yard.rect;
    const D = [-5, 10.4, 9, 21.9];
    const P = POOL.rect;
    const plane = (rect, mat, y = 0) => {
      const [a, b, c, d] = rect;
      if (c - a <= 0 || d - b <= 0) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(c - a, d - b), mat);
      m.rotation.x = -Math.PI / 2; m.position.set((a + c) / 2, y, (b + d) / 2);
      g.add(m);
    };
    const grass = (r) => TM('grass', [(r[2] - r[0]) / 3, (r[3] - r[1]) / 3]);
    for (const r of [[yx1, yz1, yx2, D[1]], [yx1, D[3], yx2, yz2], [yx1, D[1], D[0], D[3]], [D[2], D[1], yx2, D[3]]]) plane(r, grass(r));
    const deck = (r) => TM('deck', [(r[2] - r[0]) / 2, (r[3] - r[1]) / 2]);
    for (const r of [[D[0], D[1], D[2], P[1]], [D[0], P[3], D[2], D[3]], [D[0], P[1], P[0], P[3]], [P[2], P[1], D[2], P[3]]]) plane(r, deck(r), 0.004);
    // stone path from the glass doors
    plane([-1.6, 6.1, 1.6, 10.4], TM('concrete', [1.5, 2]), 0.006);
    plane([13.9, 6.1, 15.5, 10.4], TM('concrete', [1, 2]), 0.006);
    // pool basin
    const dp = POOL.depth;
    const pw = P[2] - P[0], pd = P[3] - P[1];
    const tile = (w, h) => TM('poolTile', [w, h]);
    const bottom = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), tile(pw, pd));
    bottom.rotation.x = -Math.PI / 2; bottom.position.set((P[0] + P[2]) / 2, -dp, (P[1] + P[3]) / 2); g.add(bottom);
    const wallP = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, dp), tile(w, dp)); m.position.set(x, -dp / 2, z); m.rotation.y = ry; g.add(m); };
    wallP(pw, (P[0] + P[2]) / 2, P[1], 0);
    wallP(pw, (P[0] + P[2]) / 2, P[3], Math.PI);
    wallP(pd, P[0], (P[1] + P[3]) / 2, Math.PI / 2);
    wallP(pd, P[2], (P[1] + P[3]) / 2, -Math.PI / 2);
    // coping
    const cop = M('#f3f6f6');
    this.box(g, pw + 0.6, 0.06, 0.3, cop, (P[0] + P[2]) / 2, 0.03, P[1] - 0.15);
    this.box(g, pw + 0.6, 0.06, 0.3, cop, (P[0] + P[2]) / 2, 0.03, P[3] + 0.15);
    this.box(g, 0.3, 0.06, pd, cop, P[0] - 0.15, 0.03, (P[1] + P[3]) / 2);
    this.box(g, 0.3, 0.06, pd, cop, P[2] + 0.15, 0.03, (P[1] + P[3]) / 2);
    // underwater lights
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CircleGeometry(0.15, 12), emissive('#bff8ff', 2));
      l.position.set(P[0] + 1.5 + i * 2.4, -0.7, P[1] + 0.01);
      g.add(l);
      const l2 = l.clone(); l2.position.z = P[3] - 0.01; l2.rotation.y = Math.PI; g.add(l2);
    }
    // ladder
    for (const dx of [-0.25, 0.25]) this.cyl(g, 0.03, 1.4, M('#cfd8dc'), P[2] - 1 + dx, -0.4, P[1] + 0.15);
    this.root.add(g);
    this.bake(g);
    g.removeFromParent();
    // animated water surface
    const wt = tex('water').clone();
    wt.repeat.set(pw / 3, pd / 3); wt.needsUpdate = true;
    this.waterTex = wt;
    const water = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshPhongMaterial({ map: wt, transparent: true, opacity: 0.78, shininess: 100, specular: 0x88ccff, emissive: 0x0a3d52, depthWrite: false }));
    water.rotation.x = -Math.PI / 2; water.position.set((P[0] + P[2]) / 2, -0.12, (P[1] + P[3]) / 2);
    water.renderOrder = 2;
    this.root.add(water);
    this.water = water;
  }

  // =====================================================================
  buildFurniture(f) {
    const g = new THREE.Group();
    g.position.set(f.x, 0, f.z);
    g.rotation.y = (f.rot || 0) * (Math.PI / 2);
    const t = FURNITURE_TYPES[f.type];
    const [w, d, h] = f.size || t.size;
    const B = (...a) => this.box(g, ...a);
    const C = (...a) => this.cyl(g, ...a);
    const white = M('#f1f5f6'), teal = M('#1fb5c9'), dteal = M('#0d6f80'), navy = M('#0d2a3a'), black = M('#1a1d22'), metal = M('#b7c2c8', { spec: true });
    const wood = TM('wood', [1, 1]), pink = M('#ff6f9f'), purple = M('#6b3fa0'), gold = M('#d4a73a', { spec: true });
    const roomId = roomAt(f.x, f.z);
    switch (f.type) {
      case 'sofa': case 'sofa2': case 'armchair': {
        const base = f.type === 'armchair' ? (roomId === 'living' ? pink : teal) : white;
        const cushion = roomId === 'secret' ? gold : f.type === 'armchair' ? white : teal;
        B(w, 0.3, d, base, 0, 0.15, 0);
        B(w - 0.36, 0.16, d - 0.3, cushion, 0, 0.4, 0.08);
        B(w, 0.6, 0.24, base, 0, 0.6, -d / 2 + 0.12);
        B(0.2, 0.55, d, base, -w / 2 + 0.1, 0.42, 0);
        B(0.2, 0.55, d, base, w / 2 - 0.1, 0.42, 0);
        break;
      }
      case 'pouf': C(0.34, 0.42, teal, 0, 0.21, 0); C(0.3, 0.04, white, 0, 0.43, 0); break;
      case 'coffeeTable':
        B(w, 0.06, d, M('#ffffff', { spec: true }), 0, 0.38, 0);
        B(w - 0.2, 0.04, d - 0.2, dteal, 0, 0.14, 0);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.06, 0.38, 0.06, metal, sx * (w / 2 - 0.1), 0.19, sz * (d / 2 - 0.1));
        break;
      case 'tvStand':
        B(w, h, d, navy, 0, h / 2, 0);
        B(w, 0.03, 0.02, emissive('#22e0ff', 1.2), 0, h - 0.05, d / 2);
        break;
      case 'piano':
        B(w, h - 0.2, d, black, 0, (h - 0.2) / 2 + 0.2, -0.05);
        B(w - 0.1, 0.05, 0.25, white, 0, 0.8, d / 2 - 0.02);
        for (let i = 0; i < 14; i++) B(0.04, 0.03, 0.14, black, -w / 2 + 0.15 + i * 0.1, 0.83, d / 2 - 0.05);
        for (const sx of [-1, 1]) B(0.08, 0.75, 0.08, black, sx * (w / 2 - 0.1), 0.38, d / 2 - 0.05);
        break;
      case 'bed': {
        const sheet = roomId === 'secret' ? gold : white;
        B(w, 0.3, d, M('#ece7f2'), 0, 0.15, 0);
        B(w - 0.08, 0.2, d - 0.06, sheet, 0, 0.42, 0);
        B(w * 0.6, 0.07, d - 0.02, f.id.charCodeAt(1) % 2 ? pink : M('#9b6bd8'), w * 0.18, 0.54, 0);
        B(0.32, 0.12, d * 0.7, white, -w / 2 + 0.25, 0.58, 0);
        B(0.1, 0.95, d + 0.06, purple, -w / 2 - 0.02, 0.48, 0);
        B(0.04, 0.04, d, emissive('#ff4fd8', 1.2), -w / 2 + 0.02, 0.96, 0);
        break;
      }
      case 'nightstand':
        B(w, h, d, white, 0, h / 2, 0);
        C(0.08, 0.3, metal, 0, h + 0.15, 0);
        C(0.16, 0.18, emissive('#ffd9ec', 1), 0, h + 0.38, 0, 0.12);
        break;
      case 'wardrobe':
        B(w, h, d, roomId === 'closet' ? M('#f6f0e4') : purple, 0, h / 2, 0);
        if (roomId === 'closet') B(w + 0.02, 0.04, d + 0.02, emissive('#ffd36b', 1.2), 0, h - 0.05, 0);
        B(0.02, h - 0.2, 0.02, M('#ffffff'), 0, h / 2, d / 2 + 0.01);
        for (const sx of [-0.12, 0.12]) B(0.03, 0.3, 0.04, metal, sx, h / 2, d / 2 + 0.02);
        break;
      case 'vanity':
        B(w, h, d, white, 0, h / 2, 0);
        B(w * 0.8, 0.9, 0.04, M('#cfe9f5', { spec: true }), 0, h + 0.65, -d / 2 + 0.03);
        B(w * 0.84, 0.04, 0.05, emissive('#ffe6f3', 1.3), 0, h + 1.12, -d / 2 + 0.03);
        break;
      case 'counter': case 'stove':
        B(w, 0.88, d, f.type === 'stove' ? M('#dfe7ea') : white, 0, 0.44, 0);
        B(w + 0.02, 0.06, d + 0.03, TM('marble', [0.5, 0.5], '#d8dde0', true), 0, 0.91, 0);
        B(w, 0.7, 0.36, teal, 0, 1.95, -d / 2 + 0.18);
        B(w, 0.02, 0.02, emissive('#ffb627', 1.2), 0, 1.58, -d / 2 + 0.36);
        if (f.type === 'stove') {
          B(0.7, 0.02, 0.5, black, 0, 0.95, 0);
          for (const sx of [-0.18, 0.18]) C(0.1, 0.01, emissive('#ff5522', 0.6), sx, 0.965, 0.1);
          C(0.2, 0.22, metal, -0.1, 1.07, 0.05);
          C(0.21, 0.02, metal, -0.1, 1.19, 0.05);
        }
        break;
      case 'island':
        B(w, 0.9, d, teal, 0, 0.45, 0);
        B(w + 0.1, 0.06, d + 0.1, TM('marble', [1, 0.5], '#ffffff', true), 0, 0.93, 0);
        for (let i = -1; i <= 1; i++) { C(0.2, 0.05, white, i * 0.8, 0.72, d / 2 + 0.38); C(0.03, 0.7, metal, i * 0.8, 0.35, d / 2 + 0.38); }
        break;
      case 'fridge':
        B(w, h, d, M('#d9e1e5', { spec: true }), 0, h / 2, 0);
        B(w, 0.015, 0.02, black, 0, 1.25, d / 2 + 0.005);
        B(0.04, 0.5, 0.05, metal, w / 2 - 0.12, 1.5, d / 2 + 0.03);
        B(0.04, 0.4, 0.05, metal, w / 2 - 0.12, 0.9, d / 2 + 0.03);
        break;
      case 'diningTable':
        B(w, 0.06, d, wood, 0, 0.74, 0);
        for (const sx of [-1, 1]) B(0.08, 0.72, d - 0.2, M('#2a2f35'), sx * (w / 2 - 0.25), 0.36, 0);
        break;
      case 'bench': B(w, 0.08, d, wood, 0, h - 0.04, 0); for (const sx of [-1, 1]) B(0.08, h - 0.08, d - 0.05, M('#3a3f45'), sx * (w / 2 - 0.15), (h - 0.08) / 2, 0); break;
      case 'vending': {
        B(w, h, d, M('#c62860'), 0, h / 2, 0);
        const c = document.createElement('canvas'); c.width = 256; c.height = 512;
        const gg = c.getContext('2d');
        gg.fillStyle = '#10213a'; gg.fillRect(0, 0, 256, 512);
        gg.fillStyle = '#ffd34d'; gg.font = '900 40px Rubik, sans-serif'; gg.textAlign = 'center'; gg.direction = 'rtl'; gg.fillText('חנות הבית', 128, 56);
        const icons = ['🍫', '🎩', '🎵', '📣', '🩻', '👁️', '🪩', '✋', '🍿'];
        gg.font = '48px sans-serif';
        icons.forEach((ic, i) => gg.fillText(ic, 50 + (i % 3) * 78, 140 + Math.floor(i / 3) * 110));
        gg.fillStyle = '#22e0ff'; gg.fillRect(20, 470, 216, 6);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
        const front = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.8, h * 0.8), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }));
        front.position.set(0, h * 0.55, d / 2 + 0.005);
        g.add(front);
        break;
      }
      case 'diaryChair': {
        // iconic big curved chair
        const shell = new THREE.Mesh(new THREE.SphereGeometry(0.85, 24, 16, Math.PI * 0.15, Math.PI * 1.7, 0, Math.PI * 0.62), M('#f6f7f8', { spec: true, side: THREE.DoubleSide }));
        shell.position.set(0, 0.95, -0.05); shell.rotation.y = Math.PI / 2 + Math.PI;
        shell.scale.set(1, 1.25, 0.9);
        g.add(shell);
        C(0.7, 0.18, M('#14b9d6'), 0, 0.45, 0.05);
        C(0.25, 0.3, metal, 0, 0.15, 0, 0.4);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.025, 6, 40, Math.PI * 1.2), emissive('#00e5ff', 1.6));
        rim.position.set(0, 1.0, -0.1); rim.rotation.z = -Math.PI * 0.1;
        g.add(rim);
        break;
      }
      case 'camRig':
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const leg = this.box(g, 0.03, 1.4, 0.03, black, Math.cos(a) * 0.22, 0.68, Math.sin(a) * 0.22); leg.rotation.z = Math.cos(a) * 0.18; leg.rotation.x = -Math.sin(a) * 0.18; }
        B(0.32, 0.25, 0.5, black, 0, 1.45, 0);
        C(0.09, 0.2, M('#333'), 0, 1.45, -0.32).rotation.x = Math.PI / 2;
        this.sph(g, 0.03, emissive('#ff2222', 2), 0.1, 1.6, 0.1);
        break;
      case 'plant': {
        C(0.22, 0.45, M('#e9e2d6'), 0, 0.22, 0, 0.17);
        const leaf = M('#2e9a52');
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const l = this.sph(g, 0.22, leaf, Math.cos(a) * 0.16, 0.7 + (i % 3) * 0.17, Math.sin(a) * 0.16, 1.6); l.rotation.z = Math.cos(a) * 0.5; }
        this.sph(g, 0.24, M('#3fb866'), 0, 1.1, 0, 1.3);
        break;
      }
      case 'sink':
        B(w, 0.85, d, white, 0, 0.42, 0);
        B(w, 0.05, d, TM('marble', [1, 0.3], '#ffffff', true), 0, 0.88, 0);
        for (let i = -1; i <= 1; i++) { C(0.18, 0.05, M('#dfe9ec'), i, 0.91, 0.05); B(0.03, 0.2, 0.03, metal, i, 1.0, -0.2); }
        B(w, 1.0, 0.03, M('#d7f1fa', { spec: true }), 0, 1.65, -d / 2 + 0.02);
        B(w, 0.04, 0.05, emissive('#e8fffb', 1.4), 0, 2.2, -d / 2 + 0.03);
        break;
      case 'stall':
        for (const [x, z, sw, sd] of [[0, -d / 2, w, 0.06], [-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d]]) B(sw, h, sd, M('#5fd4c4'), x, h / 2, z);
        B(0.45, 0.42, 0.6, white, 0, 0.21, -d / 2 + 0.35);
        B(0.42, 0.42, 0.18, white, 0, 0.62, -d / 2 + 0.12);
        break;
      case 'shower': {
        const gl = new THREE.MeshPhongMaterial({ color: 0xbff4ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
        for (const [x, z, sw, sd] of [[-w / 2, 0, 0.03, d], [w / 2, 0, 0.03, d]]) B(sw, h, sd, gl, x, h / 2, z);
        B(w, h, 0.05, TM('tileSmall', [1, 1.5]), 0, h / 2, -d / 2);
        B(w - 0.06, 0.05, d - 0.06, M('#c5e8e2'), 0, 0.025, 0);
        C(0.12, 0.03, metal, 0, 2.15, -0.25);
        B(0.03, 0.03, 0.35, metal, 0, 2.18, -0.5);
        break;
      }
      case 'lounger': {
        B(w, 0.1, d, white, 0, 0.25, 0.1);
        B(w - 0.1, 0.08, d - 0.6, teal, 0, 0.33, 0.25);
        const back = B(w - 0.1, 0.08, 0.7, teal, 0, 0.55, -d / 2 + 0.35); back.rotation.x = -0.7;
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.05, 0.25, 0.05, metal, sx * (w / 2 - 0.06), 0.12, sz * (d / 2 - 0.1) + 0.1);
        break;
      }
      case 'umbrella': {
        C(0.04, 2.5, white, 0, 1.25, 0);
        const can = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.6, 8), M('#f6f6f6', { side: THREE.DoubleSide }));
        can.position.y = 2.6; g.add(can);
        const can2 = new THREE.Mesh(new THREE.ConeGeometry(1.52, 0.6, 8, 1, true, 0, Math.PI / 4), teal);
        can2.position.y = 2.61; g.add(can2);
        const can3 = can2.clone(); can3.rotation.y = Math.PI / 2; g.add(can3);
        const can4 = can2.clone(); can4.rotation.y = Math.PI; g.add(can4);
        const can5 = can2.clone(); can5.rotation.y = -Math.PI / 2; g.add(can5);
        C(0.35, 0.05, white, 0, 0.75, 0); C(0.05, 0.75, metal, 0, 0.37, 0);
        break;
      }
      case 'stage': {
        B(w, h, d, navy, 0, h / 2, 0);
        B(w + 0.02, 0.04, 0.04, emissive('#22e0ff', 1.6), 0, h - 0.02, d / 2);
        B(0.04, 0.04, d, emissive('#22e0ff', 1.6), w / 2, h - 0.02, 0);
        B(0.04, 0.04, d, emissive('#22e0ff', 1.6), -w / 2, h - 0.02, 0);
        // backdrop truss
        for (const sx of [-1, 1]) B(0.15, 3.6, 0.15, metal, sx * (w / 2 - 0.1), 1.8 + h, -d / 2 + 0.1);
        B(w, 0.15, 0.15, metal, 0, 3.6 + h, -d / 2 + 0.1);
        for (let i = 0; i < 5; i++) { const sp = C(0.12, 0.25, black, -w / 2 + 0.6 + i * ((w - 1.2) / 4), 3.4 + h, -d / 2 + 0.3); sp.rotation.x = 0.6; this.sph(g, 0.08, emissive(i % 2 ? '#ff4fd8' : '#22e0ff', 2), sp.position.x, 3.3 + h, -d / 2 + 0.42); }
        break;
      }
      case 'bike':
        for (const z of [-0.5, 0.5]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.04, 6, 16), black); wh.position.set(0, 0.32, z); wh.rotation.y = Math.PI / 2; g.add(wh); }
        B(0.06, 0.06, 1.0, teal, 0, 0.6, 0);
        B(0.06, 0.5, 0.06, teal, 0, 0.75, -0.2);
        B(0.18, 0.06, 0.25, black, 0, 1.0, -0.2);
        B(0.5, 0.05, 0.05, metal, 0, 1.05, 0.45);
        break;
      case 'treadmill': B(w, 0.15, d, black, 0, 0.08, 0); for (const sx of [-1, 1]) B(0.05, 1.1, 0.05, metal, sx * 0.35, 0.6, -d / 2 + 0.1); B(0.75, 0.3, 0.1, black, 0, 1.2, -d / 2 + 0.1); break;
      case 'bar': {
        B(w, h, d, navy, 0, h / 2, 0);
        B(w + 0.1, 0.06, d + 0.15, TM('marble', [1, 0.3], '#ffffff', true), 0, h + 0.03, 0);
        B(w, 0.05, 0.02, emissive('#ff4fd8', 1.4), 0, 0.2, d / 2 + 0.01);
        B(w, 0.05, 0.02, emissive('#22e0ff', 1.4), 0, h - 0.15, d / 2 + 0.01);
        for (let i = 0; i < 3; i++) { C(0.2, 0.05, teal, -w / 2 + 0.5 + i * ((w - 1) / 2), 0.75, d / 2 + 0.45); C(0.03, 0.75, metal, -w / 2 + 0.5 + i * ((w - 1) / 2), 0.37, d / 2 + 0.45); }
        break;
      }
      case 'jacuzzi': {
        B(w, h, d, M('#e8eef0'), 0, h / 2, 0);
        const wat = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.3, d - 0.3), emissive('#2fd3ef', 0.8));
        wat.rotation.x = -Math.PI / 2; wat.position.y = h + 0.005; g.add(wat);
        break;
      }
      case 'firepit': {
        C(0.6, 0.3, M('#5d5d5d'), 0, 0.15, 0, 0.65, 10);
        const fl = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.6, 6), emissive('#ff8a2a', 1.6));
        fl.position.y = 0.55; fl.userData.dynamic = true; g.add(fl);
        const fl2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.45, 6), emissive('#ffe066', 2));
        fl2.position.set(0.08, 0.5, 0.05); fl2.userData.dynamic = true; g.add(fl2);
        this.anim.push((t) => { fl.scale.y = 0.85 + Math.sin(t * 9) * 0.15; fl2.scale.y = 0.9 + Math.sin(t * 13 + 1) * 0.2; fl.rotation.y = t; });
        this.fire = [fl, fl2];
        this.root.add(g);
        g.updateMatrixWorld(true);
        fl.removeFromParent(); fl2.removeFromParent();
        fl.position.applyMatrix4(g.matrixWorld); fl2.position.applyMatrix4(g.matrixWorld);
        this.root.add(fl, fl2);
        break;
      }
      case 'hammock': {
        for (const sx of [-1, 1]) B(0.12, 1.4, 0.12, wood, sx * w / 2, 0.7, 0);
        const cl = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.3), M('#ff8fb3', { side: THREE.DoubleSide }));
        cl.scale.set(w / 2.2, 1.2, 0.5); cl.position.y = 2.0; g.add(cl);
        break;
      }
      case 'roundBed': C(1.3, 0.35, gold, 0, 0.18, 0, 1.3, 24); C(1.25, 0.25, M('#fff5e6'), 0, 0.47, 0, 1.25, 24); B(1.2, 0.15, 0.4, M('#ffd36b'), 0, 0.66, -0.7); break;
      case 'isoBench': B(w, h, d, M('#e0e0e0'), 0, h / 2, 0); break;
      case 'bookshelf': {
        B(w, h, d, white, 0, h / 2, 0);
        const cols = ['#ff5c8a', '#1fb5c9', '#ffb627', '#7c4dff', '#4caf50'];
        for (let r = 0; r < 4; r++) for (let i = 0; i < 9; i++) B(0.12, 0.3 + (i % 3) * 0.04, 0.3, M(cols[(i + r) % 5]), -w / 2 + 0.15 + i * 0.16, 0.3 + r * 0.45, 0.05);
        break;
      }
      case 'mailbox': C(0.05, 1.0, M('#555'), 0, 0.5, 0); B(0.45, 0.32, 0.35, M('#d32f2f'), 0, 1.1, 0); B(0.03, 0.2, 0.03, M('#ffd34d'), 0.25, 1.25, 0); break;
      case 'dogHouse': {
        B(w, 0.8, d, M('#d84315'), 0, 0.4, 0);
        const roof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.5, 4), M('#5d4037'));
        roof.position.y = 1.05; roof.rotation.y = Math.PI / 4; g.add(roof);
        B(0.45, 0.5, 0.02, black, 0, 0.3, d / 2 + 0.01);
        break;
      }
      case 'speaker': B(w, h, d, black, 0, h / 2, 0); C(0.18, 0.02, M('#333'), 0, h * 0.35, d / 2 + 0.01).rotation.x = Math.PI / 2; C(0.1, 0.02, M('#333'), 0, h * 0.75, d / 2 + 0.01).rotation.x = Math.PI / 2; break;
      case 'discoBall': {
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 1), new THREE.MeshPhongMaterial({ color: 0xdddddd, specular: 0xffffff, shininess: 120, flatShading: true, emissive: 0x333333 }));
        ball.position.set(f.x, WALL_H - 0.6, f.z);
        this.root.add(ball);
        this.anim.push((t) => { ball.rotation.y = t * 0.8; });
        this.discoBall = ball;
        return;
      }
      case 'pot': return;
      case 'saveButton': {
        C(0.26, 0.9, M('#1b1f26'), 0, 0.45, 0, 0.3);
        C(0.3, 0.06, M('#e9eef0'), 0, 0.92, 0);
        const btn = C(0.18, 0.1, emissive('#ff2b3c', 1.3), 0, 1.0, 0); void btn;
        const c = document.createElement('canvas'); c.width = 256; c.height = 96;
        const gg = c.getContext('2d'); gg.fillStyle = '#c4001d'; gg.fillRect(0, 0, 256, 96); gg.fillStyle = '#fff'; gg.font = '900 64px Rubik, sans-serif'; gg.textAlign = 'center'; gg.textBaseline = 'middle'; gg.fillText('SAVE', 128, 50);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.22), new THREE.MeshBasicMaterial({ map: tx, toneMapped: false }));
        sign.position.set(0, 0.6, 0.27); g.add(sign);
        const cover = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhongMaterial({ color: 0xcfefff, transparent: true, opacity: 0.3, depthWrite: false }));
        cover.position.y = 0.95; g.add(cover);
        break;
      }
    }
    this.root.add(g);
    this.bake(g);
    g.removeFromParent();
  }

  // =====================================================================
  buildDecor() {
    const g = new THREE.Group();
    // big wall eyes / signage
    const eyeTex = (txt) => {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256;
      const gg = c.getContext('2d');
      gg.fillStyle = '#04101e'; gg.fillRect(0, 0, 512, 256);
      drawEye(gg, txt ? 140 : 256, 128, 80, 0);
      if (txt) { gg.fillStyle = '#29c4dc'; gg.font = '900 64px "Secular One", Rubik, sans-serif'; gg.textAlign = 'center'; gg.fillText(txt, 370, 150); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    };
    const sign = (txt, x, y, z, ry, w = 1.6) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 2), new THREE.MeshBasicMaterial({ map: eyeTex(txt), toneMapped: false }));
      m.position.set(x, y, z); m.rotation.y = ry; g.add(m);
    };
    sign('וידוי', -5, 2.65, -5.88, 0, 1.2);
    sign('בידוד', 5.7, 2.65, -5.88, 0, 1.2);
    sign('', -17.88, 1.6, -9, Math.PI / 2, 1.0); // eye poster easter egg (bathroom)
    sign('מטבח', 8.12, 2.6, 0, Math.PI / 2, 1.2);
    sign('שינה', -8.12, 2.65, 0, -Math.PI / 2, 1.2);
    // kitchen backsplash glow
    this.box(g, 4.6, 0.6, 0.02, M('#7fe3f0'), 13.6, 1.25, -5.89);
    // living: framed LED panels on walls like the studio
    for (const [x, z, ry] of [[-7.88, -0.2 - 2.5, Math.PI / 2], [7.88, 4, -Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), new THREE.MeshBasicMaterial({ map: tex('led'), toneMapped: false }));
      p.position.set(x, 1.7, z); p.rotation.y = ry; g.add(p);
    }
    // diary room: blue LED walls + eye behind chair
    for (const [x, ry] of [[-7.88, Math.PI / 2], [-2.12, -Math.PI / 2]]) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.0), new THREE.MeshBasicMaterial({ map: tex('led'), toneMapped: false, color: 0x6fb8ff }));
      p.position.set(x, 1.55, -9); p.rotation.y = ry; g.add(p);
    }
    // exit corridor light strips
    for (let i = 0; i < 6; i++) {
      this.box(g, 0.04, 2.6, 0.04, emissive('#00e5ff', 1.5), -1.85, 1.4, -6.6 - i * 0.9);
      this.box(g, 0.04, 2.6, 0.04, emissive('#00e5ff', 1.5), 2.85, 1.4, -6.6 - i * 0.9);
    }
    // isolation: red alarm light
    this.sph(g, 0.12, emissive('#ff2b2b', 2), 5.5, 3.0, -11.8);
    // yard: string lights
    const bulb = emissive('#fff1b8', 1.8);
    for (let i = 0; i < 26; i++) { const x = -16 + i * 1.2; this.sph(g, 0.06, bulb, x, 4.2 - Math.sin((i % 9) / 8 * Math.PI) * 0.6, 23.7); }
    for (let i = 0; i < 14; i++) { const z = 7 + i * 1.2; this.sph(g, 0.06, bulb, 15.7, 4.2 - Math.sin((i % 7) / 6 * Math.PI) * 0.5, z); this.sph(g, 0.06, bulb, -17.7, 4.2 - Math.sin((i % 7) / 6 * Math.PI) * 0.5, z); }
    // "gossip corner" sign
    sign('רכילות', -17.85, 2.4, 13.5, Math.PI / 2, 1.4);
    // exit corridor stairs up to the studio door
    const stepMat = M('#eef3f6'), nose = emissive('#00e5ff', 1.4);
    for (const st of EXIT_STAIRS) {
      const d = st.z2 - st.z1, w = st.x2 - st.x1;
      this.box(g, w, st.y2, 0.6, stepMat, (st.x1 + st.x2) / 2, st.y2 / 2, st.z2 - 0.3);
      this.box(g, w, 0.03, 0.04, nose, (st.x1 + st.x2) / 2, st.y2 + 0.01, st.z2 - 0.02);
      void d;
    }
    const top = EXIT_STAIRS[EXIT_STAIRS.length - 1];
    this.box(g, top.x2 - top.x1, top.y2, top.z2 - top.z1, stepMat, (top.x1 + top.x2) / 2, top.y2 / 2, (top.z1 + top.z2) / 2);
    const studioDoor = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.9), emissive('#7ff3ff', 1.1));
    studioDoor.position.set(0.7, 1.2 + 0.95, -11.88); g.add(studioDoor);
    const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64;
    const sg = sc.getContext('2d'); sg.fillStyle = '#04101e'; sg.fillRect(0, 0, 256, 64); sg.fillStyle = '#22e0ff'; sg.font = '900 40px "Secular One", Rubik'; sg.textAlign = 'center'; sg.fillText('לאולפן ←', 128, 46);
    const stx = new THREE.CanvasTexture(sc); stx.colorSpace = THREE.SRGBColorSpace;
    const ss = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), new THREE.MeshBasicMaterial({ map: stx, toneMapped: false }));
    ss.position.set(0.7, 3.0, -11.87); g.add(ss);
    // budget tablet on the coffee table
    this.box(g, 0.46, 0.03, 0.32, M('#111418'), 0.7, 0.42, 0.2);
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), emissive('#33dcff', 0.9));
    tab.rotation.x = -Math.PI / 2; tab.position.set(0.7, 0.437, 0.2); g.add(tab);
    // golden eye easter egg behind the bar
    const ge = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshPhongMaterial({ color: 0xffd34d, emissive: 0x664400, shininess: 100 }));
    ge.position.set(13.9, 0.25, 23.6); this.root.add(ge);
    this.goldenEye = ge;
    // hidden message on the bedroom ceiling
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const gg = c.getContext('2d'); gg.fillStyle = 'rgba(255,255,255,0.0)'; gg.fillRect(0, 0, 512, 128);
    gg.fillStyle = '#ff9fd0'; gg.font = '700 44px Rubik, sans-serif'; gg.textAlign = 'center'; gg.fillText('גם עכשיו אנחנו רואים אותך 👁️', 256, 80);
    const tt = new THREE.CanvasTexture(c); tt.colorSpace = THREE.SRGBColorSpace;
    const msg = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), new THREE.MeshBasicMaterial({ map: tt, transparent: true, toneMapped: false }));
    msg.rotation.x = Math.PI / 2; msg.position.set(-14.6, WALL_H - 0.02, 0); this.root.add(msg);
    this.root.add(g);
    this.bake(g);
    g.removeFromParent();
  }

  // =====================================================================
  buildDoors() {
    for (const d of DOORS) {
      const pivot = new THREE.Group();
      pivot.position.set(d.x, 0, d.z);
      if (d.axis === 'z') pivot.rotation.y = Math.PI / 2;
      const leaf = new THREE.Group();
      pivot.add(leaf);
      const W = d.width, H = 2.3;
      let mat;
      switch (d.style) {
        case 'glass': mat = new THREE.MeshPhongMaterial({ color: 0xaeefff, transparent: true, opacity: 0.3, depthWrite: false, shininess: 90 }); break;
        case 'exit': mat = M('#e9f2f5', { spec: true }); break;
        case 'eye': mat = M('#0a2033'); break;
        case 'secret': mat = M('#8a6a2a'); break;
        case 'sliding': mat = M('#ff6f9f'); break;
        default: mat = M('#f4f7f8');
      }
      const panel = new THREE.Mesh(BOX, mat);
      panel.scale.set(W, H, 0.07);
      panel.position.set(d.style === 'hinged' || d.style === 'eye' || d.style === 'secret' ? W / 2 : 0, H / 2, 0);
      leaf.add(panel);
      if (d.style === 'hinged' || d.style === 'eye' || d.style === 'secret') { leaf.position.x = -W / 2; }
      if (d.style === 'glass') {
        const fr = new THREE.Mesh(BOX, M('#e8eef0')); fr.scale.set(W, 0.06, 0.09); fr.position.set(0, H - 0.03, 0); leaf.add(fr);
        const fr2 = fr.clone(); fr2.position.y = 0.03; leaf.add(fr2);
      }
      if (d.style === 'exit' || d.style === 'eye') {
        const c = document.createElement('canvas'); c.width = 256; c.height = 256;
        const gg = c.getContext('2d'); gg.fillStyle = d.style === 'exit' ? '#e9f2f5' : '#0a2033'; gg.fillRect(0, 0, 256, 256); drawEye(gg, 128, 128, 56, 0);
        const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
        for (const s of [1, -1]) {
          const em = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.7, W * 0.7), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
          em.position.set(panel.position.x, 1.35, 0.04 * s); if (s < 0) em.rotation.y = Math.PI;
          leaf.add(em);
        }
        const strip = new THREE.Mesh(BOX, emissive('#00e5ff', 1.6)); strip.scale.set(W + 0.1, 0.05, 0.1); strip.position.set(0, H + 0.03, 0); pivot.add(strip);
      }
      if (d.style === 'hinged' || d.style === 'secret' || d.style === 'eye') {
        const h = new THREE.Mesh(BOX, M('#9aa5ab', { spec: true })); h.scale.set(0.12, 0.04, 0.14); h.position.set(W - 0.12, 1.0, 0); leaf.add(h);
      }
      leaf.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.root.add(pivot);
      this.doors[d.id] = { def: d, pivot, leaf, open: 0, target: 0, locked: d.locked, lockLight: null };
      // lock indicator light above the door (room side)
      const ll = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0x33ff77, toneMapped: false }));
      ll.position.set(W / 2 + 0.15, 2.2, 0.12);
      pivot.add(ll);
      const ll2 = ll.clone(); ll2.material = ll.material; ll2.position.z = -0.12; pivot.add(ll2);
      this.doors[d.id].lockLight = ll;
    }
  }

  setDoors(state) {
    for (const [id, s] of Object.entries(state || {})) {
      const d = this.doors[id];
      if (!d) continue;
      d.target = s.open ? 1 : 0;
      d.locked = s.locked;
      d.lockLight.material.color.set(s.locked ? 0xff3344 : 0x33ff77);
    }
  }

  // =====================================================================
  buildScreens() {
    const add = (w, h, x, y, z, ry, mode, res = 512) => {
      const st = new ScreenTexture(res, Math.round(res * (h / w)), mode);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: st.tex, toneMapped: false }));
      m.position.set(x, y, z); m.rotation.y = ry;
      this.root.add(m);
      // bezel
      const b = new THREE.Mesh(BOX, M('#0b0f14')); b.scale.set(w + 0.08, h + 0.08, 0.05);
      b.position.copy(m.position); b.rotation.y = ry; b.translateZ(-0.03);
      this.root.add(b);
      this.screens.push(st);
      return st;
    };
    this.tvScreen = add(2.6, 1.46, -2.4, 1.75, -5.86, 0, 'eye');
    this.exitEye = add(3.0, 1.0, 0.7, 2.75, -5.86, 0, 'eye', 384);
    add(2.2, 1.24, -5, 2.0, -11.86, 0, 'logo');
    add(4.2, 2.36, -13.5, 3.7, 22.4, 0, 'logo', 512);
    add(3.0, 1.7, 15.86, 3.0, 15, -Math.PI / 2, 'eye', 384);
    add(1.2, 0.68, 12.2, 1.6, -5.88, 0, 'news', 256);
  }

  setTV(channel, bbText) {
    const modes = ['eye', 'logo', 'news', 'static', 'text'];
    this.tvScreen.mode = modes[channel % modes.length];
    if (bbText) { this.tvScreen.mode = 'text'; this.tvScreen.text = bbText; }
  }

  buildCameras() {
    const g = new THREE.Group();
    const black = M('#15191e');
    for (const c of BB_CAMERAS) {
      const [x, y, z] = c.pos;
      if (c.id === 'c6' || c.id === 'c12') continue;
      const dome = this.sph(g, 0.14, black, x, y + 0.05, z, 0.8);
      dome.userData.dynamic = true;
      const led = this.sph(g, 0.025, emissive('#ff2020', 2), x, y - 0.06, z);
      led.userData.dynamic = true;
    }
    this.root.add(g);
    this.recLeds = [];
    g.traverse((o) => { if (o.isMesh && o.scale.x < 0.03) this.recLeds.push(o); });
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(180, 24, 12);
    this.skyUniforms = { night: { value: 0 }, stars: { value: tex('stars') }, t: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, uniforms: this.skyUniforms,
      vertexShader: 'varying vec3 vP; varying vec2 vUv; void main(){ vP = normalize(position); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float night; uniform sampler2D stars; varying vec3 vP; varying vec2 vUv;
        void main(){
          float h = clamp(vP.y, -0.2, 1.0);
          vec3 day = mix(vec3(0.58,0.76,0.92), vec3(0.12,0.38,0.78), smoothstep(0.0,0.7,h));
          vec3 dusk = mix(vec3(1.0,0.55,0.35), vec3(0.25,0.2,0.5), smoothstep(0.0,0.6,h));
          vec3 nt = mix(vec3(0.03,0.06,0.16), vec3(0.0,0.01,0.04), smoothstep(0.0,0.8,h)) + texture2D(stars, vUv*vec2(4.0,2.0)).rgb * smoothstep(0.05,0.4,h) * 0.9;
          vec3 c = night < 0.5 ? mix(day, dusk, night*2.0) : mix(dusk, nt, (night-0.5)*2.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat);
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);
    // moon
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0xe8f0ff, toneMapped: false }));
    this.moon.position.set(-60, 70, 120);
    this.scene.add(this.moon);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xeaf6ff, 0x506070, 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dc, 2.2);
    this.sun.position.set(25, 40, 35);
    this.sun.target.position.set(0, 0, 10);
    this.scene.add(this.sun, this.sun.target);
    if (this.quality === 'high') {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(2048, 2048);
      const s = this.sun.shadow.camera;
      s.left = -26; s.right = 26; s.top = 22; s.bottom = -22; s.near = 5; s.far = 110;
      this.sun.shadow.bias = -0.0008;
      this.sun.shadow.normalBias = 0.03;
    }
  }

  // =====================================================================
  //  Per-frame
  // =====================================================================
  // ---- dynamic: delivery boxes, grill dropping from the sky, romance blanket
  setLife(life, now) {
    if (!this.dyn) {
      this.dyn = {};
      const boxes = new THREE.Group();
      for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(BOX, M(i % 2 ? '#c8a26a' : '#b38750')); b.scale.set(0.55, 0.4, 0.45); b.position.set((i % 3) * 0.6 - 0.6, 0.2 + Math.floor(i / 3) * 0.4, (i % 2) * 0.1); b.castShadow = true; boxes.add(b); }
      boxes.position.set(9.4, 0, 4.6); boxes.visible = false; this.root.add(boxes); this.dyn.boxes = boxes;
      const grill = new THREE.Group();
      grill.add(this.box(new THREE.Group(), 1.2, 0.35, 0.6, M('#1d1f22'), 0, 0.85, 0).parent.children[0]);
      for (const sx of [-0.5, 0.5]) for (const sz of [-0.22, 0.22]) { const l = new THREE.Mesh(BOX, M('#333')); l.scale.set(0.05, 0.7, 0.05); l.position.set(sx, 0.35, sz); grill.add(l); }
      const coals = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5), emissive('#ff5a1f', 1.4)); coals.rotation.x = -Math.PI / 2; coals.position.y = 1.03; grill.add(coals);
      const chute = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M('#ff4fd8', { side: THREE.DoubleSide }));
      chute.position.y = 4.5; grill.add(chute);
      grill.position.set(-4.2, 0, 9.2); grill.visible = false; this.root.add(grill);
      this.dyn.grill = grill; this.dyn.chute = chute; this.dyn.coals = coals;
      const blanket = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), M('#ff6f9f'));
      blanket.scale.set(1.0, 0.32, 0.55); blanket.visible = false; this.root.add(blanket); this.dyn.blanket = blanket;
    }
    this.dyn.boxes.visible = !!life?.delivery?.arrived;
    const g = life?.grill;
    this.dyn.grill.visible = !!g;
    this.dyn.grillLand = g?.landedAt || 0;
    this.dyn.grillBusy = g?.busyUntil || 0;
    void now;
  }
  setRomance(r) { this.romance = r; }

  update(dt, t, env) {
    for (const d of Object.values(this.doors)) {
      d.open += (d.target - d.open) * Math.min(1, dt * 6);
      const st = d.def.style;
      if (st === 'hinged' || st === 'eye' || st === 'secret') d.leaf.rotation.y = -d.open * 1.75;
      else if (st === 'exit') { d.leaf.position.y = d.open * 2.4; }
      else d.leaf.position.x = d.open * (d.def.width * 0.95);
    }
    for (const s of this.screens) s.update(dt, s === this.tvScreen ? 15 : 8);
    if (this.waterTex) { this.waterTex.offset.x = t * 0.02; this.waterTex.offset.y = Math.sin(t * 0.3) * 0.05; }
    for (const f of this.anim) f(t);
    const blink = Math.sin(t * 4) > 0;
    for (const l of this.recLeds) l.visible = blink;
    if (this.goldenEye) this.goldenEye.rotation.y = t * 2;
    if (env) this.applyEnv(env, dt, t);
    if (this.dyn) {
      const nowMs = env?.now || Date.now();
      if (this.dyn.grill.visible) {
        const left = (this.dyn.grillLand - nowMs) / 1000;
        this.dyn.grill.position.y = Math.max(0, left * 6);
        this.dyn.chute.visible = left > -0.5;
        this.dyn.coals.material.color.setScalar(nowMs < this.dyn.grillBusy ? 1.8 + Math.sin(t * 20) * 0.4 : 0.7);
      }
      const r = this.romance;
      const b = this.dyn.blanket;
      b.visible = !!(r && nowMs < r.until);
      if (b.visible) { b.position.set(r.x, 0.75 + Math.abs(Math.sin(t * 5)) * 0.06, r.z); b.rotation.z = Math.sin(t * 7) * 0.04; }
    }
  }

  // env: {night 0..1, lights {room:level}, dark, party, eviction}
  applyEnv(env, dt, t) {
    const n = (this.curNight ??= env.night);
    this.curNight = n + (env.night - n) * Math.min(1, dt * 0.8);
    const night = this.curNight;
    this.skyUniforms.night.value = night;
    this.moon.visible = night > 0.6;
    this.sun.intensity = THREE.MathUtils.lerp(2.3, 0.35, night);
    this.sun.color.setHSL(THREE.MathUtils.lerp(0.1, 0.62, night), 0.5, THREE.MathUtils.lerp(0.9, 0.75, night));
    const dark = env.dark ? 0.06 : 1;
    const outdoor = THREE.MathUtils.lerp(1.05, 0.38, night) * (env.dark ? 0.35 : 1);
    roomUniforms.bbOutside.value.set(outdoor * 0.9, outdoor * 0.95, outdoor * (1 + night * 0.4));
    ROOMS.forEach((r, i) => {
      let lvl = (env.lights?.[r.id] ?? 1) * dark;
      let c = BASE_TINT[r.id] || [1, 1, 1];
      if (r.outdoor) { lvl = outdoor * (env.dark ? 1 : 1); c = [0.95, 0.97, 1 + night * 0.5]; }
      let cr = c[0], cg = c[1], cb = c[2];
      if (env.party && (r.id === 'living' || r.id === 'yard' || r.id === 'kitchen')) {
        const h = (t * 0.25 + i * 0.13) % 1;
        const col = new THREE.Color().setHSL(h, 0.85, 0.6);
        cr = col.r * 1.6; cg = col.g * 1.6; cb = col.b * 1.6;
      }
      if (env.eviction && r.id === 'living') { const pulse = 0.5 + 0.5 * Math.sin(t * 1.6); cr = 0.35 + pulse * 0.35; cg = 0.42; cb = 1.25; }
      const target = new THREE.Vector3(cr * lvl, cg * lvl, cb * lvl);
      roomUniforms.bbCol.value[i].lerp(target, Math.min(1, dt * 4));
    });
  }

  dispose() {
    this.root.removeFromParent();
    this.sky.removeFromParent();
    this.moon.removeFromParent();
    this.scene.remove(this.hemi, this.sun, this.sun.target);
  }
}

const BASE_TINT = {
  closet: [1.12, 1.0, 0.85],
  living: [1.02, 1.03, 1.1], kitchen: [1.08, 1.04, 0.98], bedroom: [1.05, 0.85, 1.05], bathroom: [1.0, 1.06, 1.06],
  diary: [0.55, 0.78, 1.25], exit: [0.6, 0.85, 1.2], isolation: [1.15, 1.1, 1.1], secret: [1.15, 0.95, 0.7],
};
