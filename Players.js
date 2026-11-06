// Remote players: snapshot interpolation, avatar animation, nametag visibility/occlusion
import * as THREE from 'three';
import { Avatar } from './Avatar.js';
import { FLAG } from '../../../shared/constants.js';
import { occlusionBetween } from '../../../shared/layout.js';

const INTERP_DELAY = 110; // ms

export class Players {
  constructor(scene, net) {
    this.scene = scene;
    this.net = net;
    this.map = new Map(); // id -> {avatar, buf:[], pos, yaw, flags, info}
    this.myId = null;
    this.segments = [];
    this.emojiFx = null;
  }

  sync(players, myId, opts = {}) {
    this.myId = myId;
    const seen = new Set();
    for (const p of players) {
      if (p.role === 'bb') continue;
      seen.add(p.id);
      let e = this.map.get(p.id);
      const lookKey = JSON.stringify(p.look) + (p.hat || '') + (opts.pajama ? 'pj' : '');
      if (!e || e.lookKey !== lookKey) {
        if (e) e.avatar.group.removeFromParent();
        const look = { ...p.look };
        if (p.hat === 'giant') look.hat = 'giant';
        if (opts.pajama) { look.outfit = 'robe'; look.color = ['#ffb3d1', '#b3e5ff', '#d1c4e9', '#fff59d'][p.name.length % 4]; look.hat = 'none'; }
        const av = new Avatar(look, p.name);
        av.onEmoteIcon = (icon) => this.emojiFx?.(av.group.position, icon);
        this.scene.add(av.group);
        const old = e;
        e = { avatar: av, buf: old?.buf || [], pos: old?.pos || new THREE.Vector3(), yaw: old?.yaw || 0, flags: 0, lookKey, speed: 0 };
        this.map.set(p.id, e);
      }
      e.info = p;
      const a = e.avatar;
      a.name = p.name;
      if (p.role === 'ghost' && !a.ghost) a.setGhost(true);
      if (p.role !== 'ghost' && a.ghost) a.setGhost(false);
      Object.assign(a.flags, { immune: p.immune, mega: p.mega, offline: !p.connected, iso: p.iso, ghost: p.role === 'ghost', wet: p.wet, ally: opts.allies?.has(p.id), nominee: opts.nominees?.includes(p.id), burned: p.burned, hungry: p.hungry });
      e.isMe = p.id === myId;
      a.group.visible = !e.isMe || opts.showSelf;
      e.heldKind = p.held;
    }
    for (const [id, e] of this.map) if (!seen.has(id)) { e.avatar.group.removeFromParent(); this.map.delete(id); }
  }

  onSnapshot(s) {
    const ts = s.ts;
    const present = new Set();
    for (const row of s.p) {
      const [id, x, y, z, yaw, pitch, f, lvl] = row;
      present.add(id);
      const e = this.map.get(id);
      if (!e) continue;
      e.buf.push({ ts, x, y, z, yaw, pitch, f, lvl });
      if (e.buf.length > 30) e.buf.shift();
      e.lastSnap = ts;
    }
    for (const [id, e] of this.map) e.inSnap = present.has(id);
  }

  update(dt, t, camera, voice, opts = {}) {
    const now = this.net.serverNow() - INTERP_DELAY;
    const cx = camera.position.x, cz = camera.position.z;
    for (const [id, e] of this.map) {
      const a = e.avatar;
      if (e.isMe && !opts.showSelf) { a.group.visible = false; continue; }
      if (e.inSnap === false || (e.hiddenUntil && this.net.serverNow() < e.hiddenUntil)) { a.group.visible = false; continue; }
      const b = e.buf;
      if (!b.length) { a.group.visible = false; continue; }
      a.group.visible = true;
      // find interpolation pair
      let s0 = b[0], s1 = b[b.length - 1];
      for (let i = b.length - 1; i > 0; i--) { if (b[i - 1].ts <= now) { s0 = b[i - 1]; s1 = b[i]; break; } }
      let k = s1.ts === s0.ts ? 1 : (now - s0.ts) / (s1.ts - s0.ts);
      k = THREE.MathUtils.clamp(k, 0, 1.25);
      const nx = s0.x + (s1.x - s0.x) * k, ny = s0.y + (s1.y - s0.y) * k, nz = s0.z + (s1.z - s0.z) * k;
      const prev = e.pos.clone();
      // teleports (large jumps) snap instantly
      if (prev.distanceToSquared(new THREE.Vector3(nx, ny, nz)) > 16) e.pos.set(nx, ny, nz);
      else e.pos.set(nx, ny, nz);
      const sp = dt > 0 ? Math.hypot(e.pos.x - prev.x, e.pos.z - prev.z) / dt : 0;
      e.speed = THREE.MathUtils.lerp(e.speed, sp, Math.min(1, dt * 10));
      let dy = s1.yaw - s0.yaw;
      if (dy > Math.PI) dy -= Math.PI * 2; if (dy < -Math.PI) dy += Math.PI * 2;
      const yaw = s0.yaw + dy * Math.min(1, k);
      const f = s1.f;
      a.group.position.copy(e.pos);
      // avatar faces +z; camera yaw 0 looks -z
      let ry = yaw + Math.PI;
      if (f & FLAG.SLEEP) ry = Math.PI / 2;
      a.group.rotation.y = ry;
      const speakingSrv = !!(f & FLAG.SPEAK);
      const lvl = voice?.remoteLevel(id) || (s1.lvl || 0) / 100;
      a.speaking = speakingSrv || lvl > 0.08;
      a.level = Math.max(lvl, speakingSrv ? 0.3 : 0);
      if (e.isMe) { a.speaking = opts.selfSpeaking; a.level = opts.selfLevel || 0; }
      if ((f & FLAG.KNOCKED) && !e.wasKnocked && e.pendingFall) { a.tumble(); e.pendingFall = false; }
      e.wasKnocked = !!(f & FLAG.KNOCKED);
      // nametag visibility: distance + walls
      const d = Math.hypot(e.pos.x - cx, e.pos.z - cz);
      let tagVis = d < 22;
      if (tagVis && d > 3 && !opts.xray && !opts.seeAll) tagVis = occlusionBetween(this.segments, cx, cz, e.pos.x, e.pos.z) < 1;
      if (a.tag) {
        a.tag.visible = tagVis;
        const sc = THREE.MathUtils.clamp(1.15 - d / 40, 0.62, 1.15);
        a.tag.scale.set(0.22 * sc, 0.069 * sc, 1);
      }
      if (d > 30 && (Math.floor(t * 30) + id.length) % 2) continue; // LOD: half-rate animation far away
      a.update(dt, t, camera, {
        moving: Math.min(1, e.speed / 2.5), speed: e.speed, crouch: !!(f & FLAG.CROUCH), sit: !!(f & FLAG.SIT), sleep: !!(f & FLAG.SLEEP),
        swim: !!(f & FLAG.SWIM), air: !!(f & FLAG.AIR) && e.speed > 0.5, pitch: s1.pitch,
      });
      // x-ray outline: draw through walls
      const xr = !!opts.xray && !e.isMe;
      if (e.xr !== xr) {
        e.xr = xr;
        a.group.traverse((o) => { if (o.isMesh) { o.renderOrder = xr ? 40 : 0; if (o.material) { if (xr) { o.userData.xm ||= o.material; o.material = XRAY; } else if (o.userData.xm) o.material = o.userData.xm; } } });
      }
    }
  }

  get(id) { return this.map.get(id); }
  positionOf(id) { return this.map.get(id)?.pos; }
  clear() { for (const e of this.map.values()) e.avatar.group.removeFromParent(); this.map.clear(); }
}

const XRAY = new THREE.MeshBasicMaterial({ color: 0xff4fd8, transparent: true, opacity: 0.65, depthTest: false, depthWrite: false });
