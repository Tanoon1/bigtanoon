// =====================================================================
//  Intro cutscene: data-driven timeline (intro.json) played identically on every client
//  from a shared server start time. Camera tracks, actor walks, captions, sounds, lights.
// =====================================================================
import * as THREE from 'three';
import TEMPLATE from './intro.json';
import { Studio, STUDIO_OFFSET } from '../world/Studio.js';
import { Avatar } from '../world/Avatar.js';
import { buildTimeline } from './timeline.js';
import { audio } from '../audio/Audio.js';
import { roomUniforms } from '../world/materials.js';

const ease = { linear: (x) => x, inOut: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2), out: (x) => 1 - Math.pow(1 - x, 3) };

export class IntroPlayer {
  constructor({ engine, order, players, mode, ui, startAt, net, bbName }) {
    this.engine = engine;
    this.ui = ui;
    this.net = net;
    this.startAt = startAt;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02040a);
    this.studio = new Studio(this.scene);
    this.cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
    const byId = new Map(players.map((p) => [p.id, p]));
    const entrants = order.map((id) => byId.get(id)).filter(Boolean);
    this.tl = buildTimeline(entrants, mode || 'full', TEMPLATE);
    this.fired = new Set();
    this.done = false;
    this.actors = this.tl.actors.map((a) => {
      const av = new Avatar(a.look, a.name, { noTag: true });
      av.group.visible = false;
      this.studio.root.add(av.group);
      return { ...a, av, emoted: false };
    });
    // generic hosts on the round stage
    this.hosts = [
      new Avatar({ color: '#1d2430', outfit: 'suit', hair: 'short', hairColor: '#2b2b2b', skin: '#e8b48f' }, 'מנחה', { noTag: true }),
      new Avatar({ color: '#ff2d95', outfit: 'dress', hair: 'long', hairColor: '#e6c27a', skin: '#f6d1b5' }, 'מנחה', { noTag: true }),
    ];
    this.hosts[0].group.position.set(-2.6, 0.35, 2.3);
    this.hosts[1].group.position.set(-1.5, 0.35, 3.1);
    for (const h of this.hosts) { h.group.rotation.y = 0.9; this.studio.root.add(h.group); }
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.bbName = bbName;
  }

  elapsed() { return (this.net.serverNow() - this.startAt) / 1000; }

  actorPos(a, t) {
    const k = a.keys;
    if (t <= k[0].t) return { p: k[0].p.clone(), moving: false, visible: false, dir: new THREE.Vector3(-1, 0, 0) };
    for (let i = 1; i < k.length; i++) {
      if (t <= k[i].t) {
        const f = (t - k[i - 1].t) / (k[i].t - k[i - 1].t || 1);
        const p = k[i - 1].p.clone().lerp(k[i].p, f);
        const dir = k[i].p.clone().sub(k[i - 1].p);
        return { p, moving: !k[i].pause, visible: true, dir, pause: k[i].pause, seg: i };
      }
    }
    return { p: k[k.length - 1].p.clone(), moving: false, visible: t < a.end, dir: new THREE.Vector3(0, 0, -1) };
  }

  resolveKey(key, t) {
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    const a = key.actor !== undefined ? this.actors[key.actor] : null;
    const ap = a ? this.actorPos(a, t).p : null;
    if (key.rel === 'actor' && ap) pos.copy(ap).add(new THREE.Vector3(...key.offset));
    else pos.set(...(key.pos || [0, 3, 10]));
    if (key.look === 'actor' && ap) look.copy(ap).add(new THREE.Vector3(0, 1.3, 0));
    else if (key.rel === 'actor' && ap) look.copy(ap).add(new THREE.Vector3(...key.look));
    else look.set(...(key.look || [0, 2, 0]));
    return { pos, look, fov: key.fov || 50 };
  }

  skipToEnd() {
    this.forceT = this.tl.duration - this.tl.timing.outro * (3.4 / 6);
    if (this.tl.duration === 0) this.forceT = 0;
    this.skipBase = performance.now();
  }

  update(dt, t) {
    let et = this.elapsed();
    if (this.forceT !== undefined) et = this.forceT + (performance.now() - this.skipBase) / 1000;
    if (et < 0) { this.ui.introWaiting(true); et = 0; } else this.ui.introWaiting(false);
    // events
    for (let i = 0; i < this.tl.events.length; i++) {
      const e = this.tl.events[i];
      if (this.fired.has(i) || e.t > et) continue;
      this.fired.add(i);
      const late = et - e.t > 1.0; // joined late: don't replay old sounds/captions
      this.fire(e, late);
    }
    // camera
    const cams = this.tl.camera;
    let i = 0;
    while (i < cams.length - 1 && cams[i + 1].t <= et) i++;
    const k0 = cams[i], k1 = cams[i + 1];
    const A = this.resolveKey(k0, et);
    if (k1 && k1.ease !== 'cut') {
      const B = this.resolveKey(k1, et);
      const f = (ease[k1.ease] || ease.inOut)(THREE.MathUtils.clamp((et - k0.t) / (k1.t - k0.t || 1), 0, 1));
      A.pos.lerp(B.pos, f); A.look.lerp(B.look, f); A.fov += (B.fov - A.fov) * f;
    }
    // gentle smoothing (avoids jitter on follow shots, keeps cuts sharp)
    const cut = this.lastKey !== i && k0.ease === 'cut';
    this.lastKey = i;
    if (cut || !this.camInit) { this.camPos.copy(A.pos); this.camLook.copy(A.look); this.camInit = true; }
    else { this.camPos.lerp(A.pos, Math.min(1, dt * 7)); this.camLook.lerp(A.look, Math.min(1, dt * 7)); }
    this.cam.position.copy(this.camPos).add(STUDIO_OFFSET);
    this.cam.lookAt(this.camLook.clone().add(STUDIO_OFFSET));
    if (Math.abs(this.cam.fov - A.fov) > 0.01) { this.cam.fov = A.fov; this.cam.updateProjectionMatrix(); }
    this.cam.aspect = innerWidth / innerHeight; this.cam.updateProjectionMatrix();
    // actors
    for (const a of this.actors) {
      const st = this.actorPos(a, et);
      a.av.group.visible = st.visible;
      if (!st.visible) continue;
      a.av.group.position.copy(st.p);
      if (st.dir.lengthSq() > 0.001 && !st.pause) a.av.group.rotation.y = Math.atan2(st.dir.x, st.dir.z);
      if (st.pause) { a.av.group.rotation.y = THREE.MathUtils.lerp(a.av.group.rotation.y, 0.35, Math.min(1, dt * 5)); if (!a.emoted) { a.emoted = true; a.av.emote(a.look.move || 'wave'); } }
      // vanish into the eye
      const s = st.seg === a.keys.length - 1 ? 1 - THREE.MathUtils.clamp((et - a.keys[a.keys.length - 2].t) / 0.4, 0, 1) * 0.6 : 1;
      a.av.group.scale.setScalar(s);
      a.av.update(dt, t, this.cam, { moving: st.moving ? 1 : 0, speed: 3.6 });
    }
    for (const h of this.hosts) h.update(dt, t, this.cam, {});
    // BB live on the big screens
    this.studio.update(dt, t);
    if (et >= this.tl.duration) this.done = true;
    return this.done;
  }

  fire(e, late) {
    const ui = this.ui, st = this.studio;
    switch (e.type) {
      case 'fade': ui.fade(e.to, e.dur || 0); break;
      case 'eyeOpen': if (!late) ui.eyeOpen(e.dur); break;
      case 'sound': if (!late) audio.sfx(e.name); break;
      case 'music': audio.setMood(e.mood); break;
      case 'tts': if (!late) audio.speak(e.text, { pitch: 0.5, rate: 0.95 }); break;
      case 'subtitle': if (!late) ui.subtitle(e.text, e.dur || 2.5); break;
      case 'lights': st.setLights(e.level); break;
      case 'cheer': st.setCheer(1); if (!late) audio.cheer(e.dur || 2, 0.8); clearTimeout(this.cheerT); this.cheerT = setTimeout(() => st.setCheer(0.2), (e.dur || 2) * 1000); break;
      case 'door': st.openDoor(e.open); break;
      case 'hosts': for (const h of this.hosts) h.emote(e.emote); break;
      case 'lowerThird': { const a = this.actors[e.actor]; if (a && !late) ui.lowerThird(a.n, a.name, a.look.emoji, this.tl.timing.per * 0.92); break; }
      case 'title': ui.titleCard(true); audio.setMood('silence'); break;
      case 'titleOff': ui.titleCard(false); break;
    }
  }

  render() {
    const o = roomUniforms.bbOutside.value.clone();
    roomUniforms.bbOutside.value.set(1, 1, 1);
    this.engine.render(this.scene, this.cam, { bloomStrength: 0.6 });
    roomUniforms.bbOutside.value.copy(o);
  }

  dispose() {
    this.studio.dispose();
    this.ui.lowerThird(null);
    this.ui.titleCard(false);
    this.ui.introWaiting(false);
  }
}
