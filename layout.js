// =====================================================================
//  House layout – single source of truth (server physics + client visuals)
//  Coordinates: meters. X = east, Z = south, Y = up. Floor at y=0.
// =====================================================================

export const WALL_H = 3.2;
export const YARD_WALL_H = 5.2;
export const WALL_T = 0.2;

export const ROOMS = [
  { id: 'living', name: 'הסלון', rect: [-8, -6, 8, 6], floor: 'tile', wall: '#123a4a', wall2: '#e8f3f5', accent: '#22e0ff', ceil: '#0c1d26' },
  { id: 'kitchen', name: 'המטבח', rect: [8, -6, 16, 6], floor: 'wood', wall: '#eef6f6', wall2: '#1fb5c9', accent: '#ffb627', ceil: '#e9eef0' },
  { id: 'bedroom', name: 'חדר השינה', rect: [-18, -6, -8, 6], floor: 'carpet', wall: '#3a2357', wall2: '#ff5c8a', accent: '#ff4fd8', ceil: '#24143a' },
  { id: 'bathroom', name: 'המקלחות', rect: [-18, -12, -12, -6], floor: 'tileSmall', wall: '#e4f4f1', wall2: '#5fd4c4', accent: '#7fffe5', ceil: '#dfeeee' },
  { id: 'closet', name: 'חדר הארונות', rect: [-12, -12, -8, -6], floor: 'wood', wall: '#7a5a9e', wall2: '#ffd36b', accent: '#ffcf6b', ceil: '#efe6f7' },
  { id: 'diary', name: 'חדר הוידוי', rect: [-8, -12, -2, -6], floor: 'dark', wall: '#06142a', wall2: '#0aa6d6', accent: '#00d9ff', ceil: '#030a16' },
  { id: 'exit', name: 'מסדרון היציאה', rect: [-2, -12, 3, -6], floor: 'dark', wall: '#050a12', wall2: '#00e5ff', accent: '#00e5ff', ceil: '#020408' },
  { id: 'isolation', name: 'חדר הבידוד', rect: [3, -12, 8, -6], floor: 'padded', wall: '#f4f4f4', wall2: '#dddddd', accent: '#ff3b3b', ceil: '#ffffff' },
  { id: 'secret', name: 'החדר הסודי', rect: [8, -12, 16, -6], floor: 'gold', wall: '#14100a', wall2: '#d4a73a', accent: '#ffd36b', ceil: '#0a0805' },
  { id: 'yard', name: 'החצר', rect: [-18, 6, 16, 24], floor: 'grass', outdoor: true, wall: '#0f3442', wall2: '#22c9e0', accent: '#22e0ff' },
];

export const ROOM_BY_ID = Object.fromEntries(ROOMS.map((r) => [r.id, r]));

export function roomAt(x, z) {
  for (const r of ROOMS) {
    const [x1, z1, x2, z2] = r.rect;
    if (x >= x1 && x <= x2 && z >= z1 && z <= z2) return r.id;
  }
  return null;
}

// ---------------------------------------------------------------------
// Doors. axis: direction of the wall the door sits in ('x' = wall runs along X)
// ---------------------------------------------------------------------
export const DOORS = [
  { id: 'd_bath', x: -15, z: -6, axis: 'x', width: 1.4, rooms: ['bathroom', 'bedroom'], style: 'hinged', locked: false },
  { id: 'd_closet', x: -10, z: -6, axis: 'x', width: 1.4, rooms: ['closet', 'bedroom'], style: 'sliding', locked: false },
  { id: 'd_diary', x: -5, z: -6, axis: 'x', width: 1.4, rooms: ['diary', 'living'], style: 'eye', locked: false },
  { id: 'd_exit', x: 0.7, z: -6, axis: 'x', width: 1.8, rooms: ['exit', 'living'], style: 'exit', locked: true, bbOnly: true },
  { id: 'd_iso', x: 5.7, z: -6, axis: 'x', width: 1.4, rooms: ['isolation', 'living'], style: 'hinged', locked: true },
  { id: 'd_secret', x: 9.7, z: -6, axis: 'x', width: 1.4, rooms: ['secret', 'kitchen'], style: 'secret', locked: true },
  { id: 'd_bed', x: -8, z: 0, axis: 'z', width: 1.6, rooms: ['bedroom', 'living'], style: 'sliding', locked: false },
  { id: 'd_yard', x: 0, z: 6, axis: 'x', width: 3.0, rooms: ['living', 'yard'], style: 'glass', locked: false },
  { id: 'd_kyard', x: 14.7, z: 6, axis: 'x', width: 1.4, rooms: ['kitchen', 'yard'], style: 'glass', locked: false },
];
export const DOOR_BY_ID = Object.fromEntries(DOORS.map((d) => [d.id, d]));

// ---------------------------------------------------------------------
// Wall segments (axis aligned). gaps are [from,to] along the segment axis.
// windows are visual only (still block movement + sound).
// ---------------------------------------------------------------------
function doorGaps(axis, coord) {
  return DOORS.filter((d) => d.axis === axis && (axis === 'x' ? d.z === coord : d.x === coord)).map((d) => {
    const c = axis === 'x' ? d.x : d.z;
    return [c - d.width / 2, c + d.width / 2, d.id];
  });
}

export const WALLS = [
  // exterior north
  { x1: -18, z1: -12, x2: 16, z2: -12, h: WALL_H, kind: 'ext' },
  // exterior west / east of building
  { x1: -18, z1: -12, x2: -18, z2: 6, h: WALL_H, kind: 'ext' },
  { x1: 16, z1: -12, x2: 16, z2: 6, h: WALL_H, kind: 'ext' },
  // middle horizontal z=-6 (north row | middle row)
  { x1: -18, z1: -6, x2: 16, z2: -6, h: WALL_H, kind: 'wall', gaps: doorGaps('x', -6) },
  // building south z=6
  { x1: -18, z1: 6, x2: -8, z2: 6, h: WALL_H, kind: 'ext', windows: [[-16.5, -14], [-12, -9.5]] },
  { x1: -8, z1: 6, x2: 8, z2: 6, h: WALL_H, kind: 'glass', gaps: doorGaps('x', 6).filter((g) => g[0] < 8) },
  { x1: 8, z1: 6, x2: 16, z2: 6, h: WALL_H, kind: 'ext', gaps: doorGaps('x', 6).filter((g) => g[0] > 8), windows: [[9, 12.5]] },
  // vertical interior walls
  { x1: -12, z1: -12, x2: -12, z2: -6, h: WALL_H, kind: 'wall' },
  { x1: -8, z1: -12, x2: -8, z2: -6, h: WALL_H, kind: 'wall' },
  { x1: -2, z1: -12, x2: -2, z2: -6, h: WALL_H, kind: 'wall' },
  { x1: 3, z1: -12, x2: 3, z2: -6, h: WALL_H, kind: 'wall' },
  { x1: 8, z1: -12, x2: 8, z2: -6, h: WALL_H, kind: 'wall' },
  { x1: -8, z1: -6, x2: -8, z2: 6, h: WALL_H, kind: 'wall', gaps: doorGaps('z', -8) },
  // living <-> kitchen: wide arch opening (no door)
  { x1: 8, z1: -6, x2: 8, z2: 6, h: WALL_H, kind: 'wall', gaps: [[-2.2, 2.2, null]] },
  // yard perimeter
  { x1: -18, z1: 6, x2: -18, z2: 24, h: YARD_WALL_H, kind: 'fence' },
  { x1: 16, z1: 6, x2: 16, z2: 24, h: YARD_WALL_H, kind: 'fence' },
  { x1: -18, z1: 24, x2: 16, z2: 24, h: YARD_WALL_H, kind: 'fence' },
];

// Split a wall into solid pieces [{x1,z1,x2,z2}] (gaps removed)
export function wallPieces(w) {
  const horiz = w.z1 === w.z2;
  const a0 = horiz ? Math.min(w.x1, w.x2) : Math.min(w.z1, w.z2);
  const a1 = horiz ? Math.max(w.x1, w.x2) : Math.max(w.z1, w.z2);
  const gaps = (w.gaps || []).slice().sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = a0;
  for (const [g0, g1, doorId] of gaps) {
    if (g0 > cur) out.push({ a: cur, b: g0, gap: false });
    out.push({ a: g0, b: g1, gap: true, doorId });
    cur = g1;
  }
  if (cur < a1) out.push({ a: cur, b: a1, gap: false });
  return out.map((p) => ({
    ...p,
    horiz,
    x1: horiz ? p.a : w.x1,
    x2: horiz ? p.b : w.x1,
    z1: horiz ? w.z1 : p.a,
    z2: horiz ? w.z1 : p.b,
    h: w.h,
    kind: w.kind,
    windows: (w.windows || []).filter(([s, e]) => s >= p.a && e <= p.b),
  }));
}

// ---------------------------------------------------------------------
// Furniture. rot in quarter turns (0..3). size: [w (x), d (z), h]
// solid: has collider. top: walkable top height (defaults to h)
// ---------------------------------------------------------------------
export const FURNITURE_TYPES = {
  sofa: { size: [3.0, 1.0, 0.48], seats: 3 },
  sofa2: { size: [2.2, 1.0, 0.48], seats: 2 },
  armchair: { size: [1.0, 0.95, 0.48], seats: 1 },
  pouf: { size: [0.7, 0.7, 0.42], seats: 1 },
  coffeeTable: { size: [1.8, 0.9, 0.4] },
  tvStand: { size: [3.2, 0.5, 0.55] },
  piano: { size: [1.6, 0.6, 1.05] },
  bed: { size: [2.1, 1.15, 0.55] },
  nightstand: { size: [0.5, 0.5, 0.55] },
  wardrobe: { size: [1.8, 0.6, 2.2] },
  vanity: { size: [1.4, 0.5, 0.8] },
  counter: { size: [1, 0.7, 0.95] },
  island: { size: [2.6, 1.0, 0.95] },
  fridge: { size: [0.9, 0.8, 2.0] },
  stove: { size: [1.0, 0.7, 0.95] },
  diningTable: { size: [2.4, 1.0, 0.76] },
  bench: { size: [1.8, 0.45, 0.45], seats: 2 },
  vending: { size: [1.0, 0.8, 2.0] },
  diaryChair: { size: [1.4, 1.2, 0.5], seats: 1 },
  camRig: { size: [0.6, 0.6, 1.6] },
  plant: { size: [0.6, 0.6, 1.3] },
  sink: { size: [3, 0.6, 0.9] },
  stall: { size: [1.4, 1.4, 2.2], hollow: true },
  shower: { size: [1.4, 1.4, 2.3], hollow: true },
  lounger: { size: [0.8, 2.0, 0.35], seats: 1 },
  umbrella: { size: [0.3, 0.3, 2.6] },
  stage: { size: [5, 4, 0.55] },
  bike: { size: [0.6, 1.4, 1.0] },
  bar: { size: [3, 0.8, 1.05] },
  jacuzzi: { size: [2.4, 2.4, 0.7] },
  firepit: { size: [1.2, 1.2, 0.4] },
  hammock: { size: [2.6, 1.0, 0.5], nonSolid: true },
  roundBed: { size: [2.6, 2.6, 0.6] },
  isoBench: { size: [2.0, 0.6, 0.45], seats: 2 },
  bookshelf: { size: [1.6, 0.45, 2.0] },
  mailbox: { size: [0.5, 0.4, 1.2] },
  pot: { size: [0.01, 0.01, 0.01], nonSolid: true },
  discoBall: { size: [0.01, 0.01, 0.01], nonSolid: true },
  dogHouse: { size: [1.2, 1.2, 1.1] },
  speaker: { size: [0.6, 0.6, 1.4] },
  saveButton: { size: [0.55, 0.55, 1.0] },
  treadmill: { size: [0.8, 1.8, 0.25] },
};

let fid = 0;
const F = (type, x, z, rot = 0, extra = {}) => ({ id: `f${fid++}`, type, x, z, rot, ...extra });

export const FURNITURE = [
  // ---- living room (U of sofas facing north: exit door + big eye) ----
  F('sofa', 0.7, 2.6, 2), // faces north (-z)
  F('sofa2', -3.0, -0.2, 1), // faces east
  F('sofa2', 4.4, -0.2, 3), // faces west
  F('armchair', -2.6, 2.8, 2),
  F('armchair', 4.0, 2.8, 2),
  F('coffeeTable', 0.7, 0.2, 0),
  F('pouf', -1.9, 4.5), F('pouf', -0.6, 4.5), F('pouf', 0.7, 4.5), F('pouf', 2.0, 4.5), F('pouf', 3.3, 4.5),
  F('tvStand', -2.4, -5.6, 0),
  F('piano', -6.9, 4.9, 2),
  F('plant', -7.4, -5.3), F('plant', 7.4, -5.3), F('plant', 7.3, 5.4), F('plant', -7.4, 3.0),
  F('bookshelf', -7.65, -3.1, 1),
  F('speaker', 7.5, 4.0),
  F('saveButton', 2.6, -5.3, 0),
  // ---- kitchen ----
  F('counter', 11.5, -5.55), F('counter', 12.5, -5.55), F('stove', 13.5, -5.55), F('counter', 14.5, -5.55), F('counter', 15.5, -5.55, 0),
  F('fridge', 15.5, -3.6, 3),
  F('island', 12.2, -2.2, 0),
  F('diningTable', 12.0, 2.8, 0),
  F('bench', 12.0, 1.85, 0), F('bench', 12.0, 3.75, 2),
  F('vending', 15.5, 3.3, 3),
  F('plant', 8.6, 5.4),
  F('pot', 13.5, -5.6),
  // ---- bedroom ----
  F('bed', -16.85, -3.9, 0), F('bed', -16.85, -1.3, 0), F('bed', -16.85, 1.3, 0), F('bed', -16.85, 3.9, 0),
  F('bed', -12.4, -3.4, 0), F('bed', -12.4, -0.8, 0), F('bed', -12.4, 1.8, 0), F('bed', -12.4, 4.4, 0),
  F('nightstand', -17.6, -2.6), F('nightstand', -17.6, 0), F('nightstand', -17.6, 2.6),
  F('wardrobe', -8.45, -3.9, 3), F('vanity', -8.4, 3.6, 3),
  // ---- bathroom ----
  F('sink', -16.6, -11.6, 0, { size: [2.4, 0.6, 0.9] }),
  F('shower', -14.6, -11.1), F('shower', -12.9, -11.1),
  F('stall', -17.1, -8.0),
  // ---- closet (dressing room) ----
  F('wardrobe', -10, -11.6, 0), F('wardrobe', -11.65, -9.2, 1), F('wardrobe', -8.35, -9.2, 3),
  F('vanity', -8.4, -7.3, 3), F('pouf', -10, -9.4),
  // ---- diary room ----
  F('diaryChair', -5.0, -10.6, 0),
  F('camRig', -4.2, -7.6, 0),
  // ---- isolation ----
  F('isoBench', 5.5, -11.4, 0),
  // ---- secret room ----
  F('roundBed', 13.0, -9.3), F('discoBall', 12, -9), F('sofa2', 9.3, -9.3, 1), F('bar', 14.8, -6.9, 2, { size: [2, 0.6, 1.05] }),
  // ---- yard ----
  F('lounger', -1.5, 20.2), F('lounger', 0.5, 20.2), F('lounger', 2.5, 20.2), F('lounger', 4.5, 20.2), F('lounger', 6.5, 20.2),
  F('umbrella', 1.5, 21.6), F('umbrella', 5.5, 21.6),
  F('jacuzzi', 10.5, 13.5),
  F('stage', -13.5, 20.5),
  F('bar', 12.5, 22.9, 0),
  F('bike', -16.6, 8.6), F('bike', -15.4, 8.6), F('treadmill', -14.0, 8.7),
  F('hammock', 12.5, 8.6),
  F('firepit', -7.5, 14),
  F('bench', -7.5, 12.4, 0), F('bench', -7.5, 15.6, 2), F('bench', -9.3, 14, 1), F('bench', -5.7, 14, 3),
  F('bench', -16.9, 12.5, 1), F('bench', -16.9, 14.6, 1),
  F('dogHouse', 14.6, 17.5),
  F('mailbox', -2.0, 7.0),
  F('plant', -17.2, 23.2), F('plant', 15.2, 23.2), F('plant', 15.2, 6.8),
  F('speaker', -17.3, 18), F('speaker', 15.3, 18),
];

export const POOL = { rect: [-3, 12, 7, 18], depth: 1.45, floatFeet: -1.05 };

export function furnitureSize(f) {
  const t = FURNITURE_TYPES[f.type];
  const [w, d, h] = f.size || t.size;
  return f.rot % 2 === 1 ? [d, w, h] : [w, d, h];
}

// stairs in the exit corridor (evicted houseguests climb them to the studio door)
export const EXIT_STAIRS = Array.from({ length: 6 }, (_, i) => ({ x1: -0.5, x2: 1.9, z1: -11.95, z2: -8 - i * 0.6, y1: 0, y2: 0.2 * (i + 1) }));

// ---------------------------------------------------------------------
// Colliders: AABBs {x1,z1,x2,z2,y1,y2}
// ---------------------------------------------------------------------
function staticColliders() {
  const list = [];
  for (const w of WALLS) {
    for (const p of wallPieces(w)) {
      if (p.gap) continue;
      const t = WALL_T / 2;
      list.push({ x1: Math.min(p.x1, p.x2) - t, x2: Math.max(p.x1, p.x2) + t, z1: Math.min(p.z1, p.z2) - t, z2: Math.max(p.z1, p.z2) + t, y1: 0, y2: p.h, wall: true });
    }
  }
  for (const f of FURNITURE) {
    const t = FURNITURE_TYPES[f.type];
    if (t.nonSolid) continue;
    const [w, d, h] = furnitureSize(f);
    if (t.hollow) {
      // three thin walls (open towards +z)
      const x1 = f.x - w / 2, x2 = f.x + w / 2, z1 = f.z - d / 2, z2 = f.z + d / 2;
      list.push({ x1, x2, z1, z2: z1 + 0.08, y1: 0, y2: h });
      list.push({ x1, x2: x1 + 0.08, z1, z2, y1: 0, y2: h });
      list.push({ x1: x2 - 0.08, x2, z1, z2, y1: 0, y2: h });
      continue;
    }
    list.push({ x1: f.x - w / 2, x2: f.x + w / 2, z1: f.z - d / 2, z2: f.z + d / 2, y1: 0, y2: h, furn: f.id });
  }
  for (const st of EXIT_STAIRS) list.push({ ...st, stairs: true });
  return list;
}
export const STATIC_COLLIDERS = staticColliders();

export function doorCollider(d) {
  const hw = d.width / 2;
  if (d.axis === 'x') return { x1: d.x - hw, x2: d.x + hw, z1: d.z - 0.08, z2: d.z + 0.08, y1: 0, y2: WALL_H, door: d.id };
  return { x1: d.x - 0.08, x2: d.x + 0.08, z1: d.z - hw, z2: d.z + hw, y1: 0, y2: WALL_H, door: d.id };
}

// doorState: { [id]: {open:bool, locked:bool} }
export function buildColliders(doorState) {
  const list = STATIC_COLLIDERS.slice();
  for (const d of DOORS) {
    const s = doorState?.[d.id];
    if (!s || !s.open) list.push(doorCollider(d));
  }
  return list;
}

// ---------------------------------------------------------------------
// 2D occlusion segments for voice (walls + closed doors)
// ---------------------------------------------------------------------
export function occluderSegments(doorState) {
  const segs = [];
  for (const w of WALLS) {
    for (const p of wallPieces(w)) {
      if (p.gap) {
        if (p.doorId) {
          const s = doorState?.[p.doorId];
          if (!s || !s.open) segs.push([p.x1, p.z1, p.x2, p.z2, 0.5]);
        }
        continue;
      }
      // yard fence: sound goes over the top (outdoor) – count as normal wall
      segs.push([p.x1, p.z1, p.x2, p.z2, 1]);
    }
  }
  return segs;
}

function segIntersect(ax, az, bx, bz, cx, cz, dx, dz) {
  const d = (bx - ax) * (dz - cz) - (bz - az) * (dx - cx);
  if (Math.abs(d) < 1e-9) return false;
  const u = ((cx - ax) * (dz - cz) - (cz - az) * (dx - cx)) / d;
  const v = ((cx - ax) * (bz - az) - (cz - az) * (bx - ax)) / d;
  return u > 0 && u < 1 && v > 0 && v < 1;
}

// returns sum of occlusion weights between two points
export function occlusionBetween(segs, ax, az, bx, bz) {
  let n = 0;
  for (const s of segs) if (segIntersect(ax, az, bx, bz, s[0], s[1], s[2], s[3])) n += s[4];
  return n;
}

// ---------------------------------------------------------------------
// Spawn points
// ---------------------------------------------------------------------
export const SPAWNS_LOBBY = [];
for (let i = 0; i < 16; i++) SPAWNS_LOBBY.push({ x: -5 + (i % 8) * 1.9 + (i >= 8 ? 0.95 : 0), z: i < 8 ? 9.0 : 10.6 });

export const SPAWNS_GAME = [
  { x: 0.7, z: -1.6 }, { x: -1.5, z: 1.4 }, { x: 2.9, z: 1.4 }, { x: -5.5, z: 2 }, { x: 6.3, z: 1.6 },
  { x: 11, z: 0 }, { x: 13.5, z: 0.4 }, { x: -10, z: 1 }, { x: -14.5, z: -2.5 }, { x: -14.6, z: 2.5 },
  { x: 0, z: 9 }, { x: 4, z: 9.5 }, { x: -4, z: 9.5 }, { x: 9, z: 9 }, { x: -12, z: 15 }, { x: 8.5, z: 20 },
];

// Eviction night seats (sit positions, facing)
export function seatPositions() {
  const seats = [];
  for (const f of FURNITURE) {
    const t = FURNITURE_TYPES[f.type];
    if (!t.seats) continue;
    if (roomAt(f.x, f.z) !== 'living') continue;
    const [w, d] = furnitureSize(f);
    const n = t.seats;
    const yaw = [Math.PI, -Math.PI / 2, 0, Math.PI / 2][f.rot % 4];
    for (let i = 0; i < n; i++) {
      const tt = (i + 0.5) / n - 0.5;
      const along = f.rot % 2 === 0 ? [tt * w, 0] : [0, tt * d];
      seats.push({ x: f.x + along[0], z: f.z + along[1], y: t.size[2], yaw });
    }
  }
  return seats;
}

// ---------------------------------------------------------------------
// Big Brother fixed cameras
// ---------------------------------------------------------------------
export const BB_CAMERAS = [
  { id: 'c1', name: 'סלון 1', room: 'living', pos: [7.5, 2.95, 5.5], look: [-2, 0.9, -2.5] },
  { id: 'c2', name: 'סלון 2', room: 'living', pos: [-7.5, 2.95, -5.5], look: [3, 0.8, 3] },
  { id: 'c3', name: 'מטבח', room: 'kitchen', pos: [8.5, 2.95, 5.5], look: [13.5, 0.8, -3] },
  { id: 'c4', name: 'חדר שינה', room: 'bedroom', pos: [-8.5, 2.95, 5.5], look: [-15, 0.6, -2] },
  { id: 'c5', name: 'מקלחות', room: 'bathroom', pos: [-12.4, 2.9, -6.4], look: [-16, 0.8, -10] },
  { id: 'c13', name: 'ארונות', room: 'closet', pos: [-8.4, 2.9, -6.4], look: [-10.5, 0.8, -10.5] },
  { id: 'c14', name: 'מסדרון יציאה', room: 'exit', pos: [2.7, 2.9, -6.4], look: [0.7, 1.0, -11] },
  { id: 'c6', name: 'חדר הוידוי', room: 'diary', pos: [-5, 1.45, -7.05], look: [-5, 1.05, -10.6] },
  { id: 'c7', name: 'חצר', room: 'yard', pos: [15.5, 4.8, 23.5], look: [0, 0, 12] },
  { id: 'c8', name: 'חצר 2', room: 'yard', pos: [-17.5, 4.8, 6.5], look: [2, 0, 17] },
  { id: 'c9', name: 'בריכה', room: 'yard', pos: [2, 5, 23.6], look: [2, 0, 14] },
  { id: 'c10', name: 'בידוד', room: 'isolation', pos: [7.6, 2.85, -6.4], look: [4.5, 0.6, -11] },
  { id: 'c11', name: 'חדר סודי', room: 'secret', pos: [15.6, 2.85, -6.4], look: [10, 0.6, -10.5] },
  { id: 'c12', name: 'תקרה', room: 'living', pos: [0.6, 3.1, 0.4], look: [0.6, 0, 0.45] },
];

// ---------------------------------------------------------------------
// Interactables (E key). r = interaction radius.
// ---------------------------------------------------------------------
export const INTERACTABLES = [
  { id: 'fridge', type: 'fridge', x: 15.0, y: 1.1, z: -3.6, r: 1.7, label: 'פתח מקרר' },
  { id: 'tv', type: 'tv', x: -2.4, y: 1.7, z: -5.6, r: 3.5, label: 'החלף ערוץ' },
  { id: 'shop', type: 'shop', x: 15.0, y: 1.2, z: 3.3, r: 1.8, label: 'חנות הבית' },
  { id: 'keypad', type: 'keypad', x: -7.8, y: 1.4, z: -1.6, r: 1.6, label: 'לוח קוד' },
  { id: 'pot', type: 'pot', x: 13.5, y: 1.1, z: -5.3, r: 1.6, label: 'בשל ארוחה' },
  { id: 'diaryChair', type: 'diaryChair', x: -5.0, y: 0.6, z: -10.4, r: 1.5, label: 'שב בכיסא הוידוי' },
  { id: 'mailbox', type: 'mailbox', x: -2.0, y: 1.1, z: 7.0, r: 1.6, label: 'תיבת דואר' },
  { id: 'piano', type: 'piano', x: -6.9, y: 1, z: 4.4, r: 1.6, label: 'נגן' },
  { id: 'shower1', type: 'shower', x: -14.6, y: 1, z: -10.6, r: 1.2, label: 'מקלחת' },
  { id: 'shower2', type: 'shower', x: -12.9, y: 1, z: -10.6, r: 1.2, label: 'מקלחת' },
  { id: 'closet', type: 'closet', x: -10, y: 1.2, z: -10.9, r: 2.0, label: 'החלף בגדים' },
  { id: 'closet2', type: 'closet', x: -10.9, y: 1.2, z: -9.2, r: 1.6, label: 'החלף בגדים' },
  { id: 'grill', type: 'grill', x: -4.2, y: 0.9, z: 9.2, r: 1.8, label: 'על האש' },
  { id: 'saveBtn', type: 'save', x: 2.6, y: 1.1, z: -5.3, r: 1.7, label: 'SAVE' },
  { id: 'tablet', type: 'tablet', x: 0.7, y: 0.5, z: 0.2, r: 2.2, label: 'טאבלט התקציב' },
  { id: 'delivery', type: 'delivery', x: 9.2, y: 0.5, z: 4.6, r: 1.8, label: 'פרוק משלוח' },
  ...[-1.5, 0.5, 2.5, 4.5, 6.5].map((x, i) => ({ id: 'tan' + i, type: 'lounger', furnX: x, x, y: 0.4, z: 20.2, r: 1.3, label: 'השתזף' })),
  { id: 'dogbowl', type: 'dog', x: 14.0, y: 0.4, z: 16.6, r: 1.8, label: 'ליטוף' },
  { id: 'jukebox', type: 'speaker', x: 7.5, y: 1, z: 4.0, r: 1.5, label: 'מוזיקה' },
  { id: 'goldeneye', type: 'easter', x: 13.9, y: 0.25, z: 23.6, r: 1.2, label: '???' },
  { id: 'bike1', type: 'bike', x: -16.6, y: 0.8, z: 8.6, r: 1.1, label: 'רכיבה' },
  { id: 'eyeposter', type: 'easter2', x: -17.85, y: 1.6, z: -9, r: 1.4, label: 'גע בעין' },
  ...ROOMS.filter((r) => !r.outdoor && r.id !== 'exit').map((r) => {
    const d = DOORS.find((dd) => dd.rooms.includes(r.id) && dd.id !== 'd_exit');
    // switch near the door, inside the room
    const [x1, z1, x2, z2] = r.rect;
    let x = d ? d.x : (x1 + x2) / 2, z = d ? d.z : (z1 + z2) / 2;
    if (d && d.axis === 'x') { x += d.width / 2 + 0.35; z += z > (z1 + z2) / 2 ? -0.13 : 0.13; }
    else if (d) { z += d.width / 2 + 0.35; x += x > (x1 + x2) / 2 ? -0.13 : 0.13; }
    if (r.id === 'kitchen') { x = 8.13; z = 3; }
    if (r.id === 'living') { x = 7.87; z = -3; }
    return { id: `sw_${r.id}`, type: 'switch', room: r.id, x, y: 1.3, z, r: 1.3, label: 'מתג אור' };
  }),
  ...DOORS.filter((d) => !d.bbOnly).map((d) => ({ id: d.id, type: 'door', x: d.x, y: 1.1, z: d.z, r: 1.9, label: 'דלת' })),
  ...FURNITURE.filter((f) => FURNITURE_TYPES[f.type].seats && f.type !== 'diaryChair').map((f) => ({ id: `seat_${f.id}`, type: 'seat', furn: f.id, x: f.x, y: 0.5, z: f.z, r: 1.4, label: 'שב' })),
  ...FURNITURE.filter((f) => f.type === 'bed' || f.type === 'roundBed').map((f) => ({ id: `bed_${f.id}`, type: 'bed', furn: f.id, x: f.x, y: 0.6, z: f.z, r: 1.5, label: 'שכב לישון' })),
];
export const INTERACTABLE_BY_ID = Object.fromEntries(INTERACTABLES.map((i) => [i.id, i]));

// Item spawn spots for tasks (collect/hunt etc.)
export const ITEM_SPOTS = [
  { x: 0.7, y: 0.45, z: 0.2 }, { x: -6.5, y: 0.05, z: -4.5 }, { x: 6.5, y: 0.05, z: 4.6 }, { x: 12.2, y: 0.98, z: -2.2 },
  { x: 12, y: 0.8, z: 2.8 }, { x: 15, y: 0.05, z: 0.5 }, { x: -16.85, y: 0.6, z: -1.3 }, { x: -12.4, y: 0.6, z: 1.8 },
  { x: -10.0, y: 0.05, z: 4.8 }, { x: -15.5, y: 0.92, z: -11.6 }, { x: -12.5, y: 0.05, z: -8.5 }, { x: -6.5, y: 0.05, z: -7.0 },
  { x: -13.5, y: 0.6, z: 20.5 }, { x: -7.5, y: 0.45, z: 12.4 }, { x: 12.5, y: 1.08, z: 22.9 }, { x: 9.0, y: 0.05, z: 10 },
  { x: -16, y: 0.05, z: 22 }, { x: 14.5, y: 0.05, z: 12 }, { x: 2.5, y: 0.4, z: 20.2 }, { x: -10, y: 0.05, z: 8.5 },
  { x: 4.3, y: 0.5, z: -0.2 }, { x: -3.0, y: 0.5, z: -0.2 }, { x: 15.5, y: 0.98, z: -5.6 }, { x: -8.4, y: 0.82, z: 3.6 },
];

export const ZONES = {
  living: ROOM_BY_ID.living.rect,
  kitchen: ROOM_BY_ID.kitchen.rect,
  bedroom: ROOM_BY_ID.bedroom.rect,
  yard: ROOM_BY_ID.yard.rect,
  pool: POOL.rect,
  stage: [-16, 18.5, -11, 22.5],
  table: [-0.3, -0.35, 1.7, 0.75],
  bathroom: ROOM_BY_ID.bathroom.rect,
  closet: ROOM_BY_ID.closet.rect,
};

export function inRect(rect, x, z) {
  return x >= rect[0] && x <= rect[2] && z >= rect[1] && z <= rect[3];
}

export const ISOLATION_SPOT = { x: 5.5, z: -9.5 };
export const DIARY_SPOT = { x: -5, z: -9.6 };
export const EXIT_PATH = [{ x: 0.7, z: -4.5 }, { x: 0.7, z: -7.2 }, { x: 0.7, z: -11.5 }];

export const SECRET_SPOT = { x: 12, z: -8 };
