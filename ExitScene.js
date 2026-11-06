// Eviction exit: the evicted houseguest comes out of the eye door, walks down the studio stairs,
// says goodbye to the hosts and the cheering crowd, and leaves down the runway. Same timeline on all clients.
import * as THREE from 'three';
import { Studio, STUDIO_OFFSET } from '../world/Studio.js';
import { Avatar } from '../world/Avatar.js';
import { audio } from '../audio/Audio.js';
import { roomUniforms } from '../world/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const PER = 8.5, OPEN = 4;

export class ExitScene {
  constructor({ engine, ids, players, ui, startAt, net }) {
    this.engine = engine; this.ui = ui; this.net = net; this.startAt = startAt;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.studio = new Studio(this.scene);
    this.studio.setLights(1);
    this.studio.openDoor(true);
    this.cam = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 300);
    this.actors = ids.map((id, i) => {
      const p = players.find((x) => x.id === id) || { name: '?', look: {} };
      const av = new Avatar(p.look, p.name, { noTag: true });
      av.group.visible = false;
      this.studio.root.add(av.group);
      const s = OPEN + i * PER;
      const keys = [
        { t: s, p: V(0, 3.6, -10.1) }, { t: s + 0.6, p: V(0, 3.6, -8.9) }, { t: s + 2.8, p: V(0, 0.35, -4.2) },
        { t: s + 4.1, p: V(1.4, 0.35, 0.8) }, { t: s + 5.6, p: V(1.4, 0.35, 0.8), pause: true },
        { t: s + 6.4, p: V(0, 0.35, 4.6) }, { t: s + 8.6, p: V(0, 0, 13) },
      ];
      return { id, name: p.name, look: p.look, av, s, keys, emoted: false };
    });
    this.hosts = [
      new Avatar({ color: '#1d2430', outfit: 'suit', hair: 'short', skin: '#e8b48f' }, '', { noTag: true }),
      new Avatar({ color: '#ff2d95', outfit: 'dress', hair: 'long', hairColor: '#e6c27a', skin: '#f6d1b5' }, '', { noTag: true }),
    ];
    this.hosts[0].group.position.set(-1.2, 0.35, 1.8); this.hosts[1].group.position.set(-0.2, 0.35, 2.6);
    for (const h of this.hosts) { h.group.rotation.y = 1.4; this.studio.root.add(h.group); }
    this.duration = OPEN + PER * ids.length;
    this.fired = new Set();
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    audio.setMood('dramatic');
  }

  at(a, t) {
    const k = a.keys;
    if (t < k[0].t) return null;
    for (let i = 1; i < k.length; i++) if (t <= k[i].t) {
      const f = (t - k[i - 1].t) / (k[i].t - k[i - 1].t);
      return { p: k[i - 1].p.clone().lerp(k[i].p, f), dir: k[i].p.clone().sub(k[i - 1].p), pause: k[i].pause, moving: !k[i].pause };
    }
    return null;
  }

  update(dt, t) {
    const et = (this.net.serverNow() - this.startAt) / 1000;
    const once = (key, fn) => { if (!this.fired.has(key)) { this.fired.add(key); if (et - 0 < this.duration) fn(); } };
    if (et > 0.1) once('open', () => { this.ui.fade(0, 0.3); audio.cheer(3, 0.8); this.studio.setCheer(1); this.ui.subtitle('ומחוץ לבית... נפרדים מדייר/ת.', 3); });
    // camera: wide → per-actor coverage
    let tgtPos = V(10, 6, 15), tgtLook = V(0, 3, -6);
    const cur = this.actors.find((a) => et >= a.s - 0.3 && et < a.s + PER) || null;
    if (cur) {
      const lt = et - cur.s;
      const st = this.at(cur, et);
      const ap = st ? st.p : V(0, 3.6, -10);
      if (lt < 2.8) { tgtPos = V(3.5, 2.2, 3.5); tgtLook = ap.clone().add(V(0, 1.3, 0)); }
      else if (lt < 5.8) { tgtPos = ap.clone().add(V(2.2, 1.5, 2.6)); tgtLook = ap.clone().add(V(0, 1.35, 0)); }
      else { tgtPos = ap.clone().add(V(0, 2.4, -4.2)); tgtLook = ap.clone().add(V(0, 1, 4)); }
      once('lt' + cur.id, () => { this.ui.lowerThird('👋', cur.name, '• פונה/ה מהבית', 5); audio.speak(`${cur.name}, פונה מבית האח הגדול`); });
      if (lt > 4.1) once('cheer' + cur.id, () => { audio.cheer(2.5, 1); for (const h of this.hosts) h.emote('clap'); });
    }
    if (!this.camInit) { this.pos.copy(tgtPos); this.look.copy(tgtLook); this.camInit = true; }
    this.pos.lerp(tgtPos, Math.min(1, dt * 2.2));
    this.look.lerp(tgtLook, Math.min(1, dt * 4));
    this.cam.position.copy(this.pos).add(STUDIO_OFFSET);
    this.cam.lookAt(this.look.clone().add(STUDIO_OFFSET));
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    for (const a of this.actors) {
      const st = this.at(a, et);
      a.av.group.visible = !!st;
      if (!st) continue;
      a.av.group.position.copy(st.p);
      if (!st.pause && st.dir.lengthSq() > 1e-4) a.av.group.rotation.y = Math.atan2(st.dir.x, st.dir.z);
      if (st.pause && !a.emoted) { a.emoted = true; a.av.emote(Math.random() < 0.5 ? 'cry' : 'wave'); a.av.group.rotation.y = 0.4; }
      a.av.update(dt, t, this.cam, { moving: st.moving ? 1 : 0, speed: 3 });
    }
    for (const h of this.hosts) h.update(dt, t, this.cam, {});
    this.studio.update(dt, t);
    return et >= this.duration;
  }

  render() {
    const o = roomUniforms.bbOutside.value.clone();
    roomUniforms.bbOutside.value.set(1, 1, 1);
    this.engine.render(this.scene, this.cam, { bloomStrength: 0.6 });
    roomUniforms.bbOutside.value.copy(o);
  }
  dispose() { this.studio.dispose(); this.ui.lowerThird(null); }
}
