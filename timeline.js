// Timeline builder: pure function of (entrants, mode, template) → identical on every client.
import * as THREE from 'three';
import { introTiming } from '../../../shared/intro.js';

// Build the full timeline from the template + entrants. Pure function of its inputs → same on every client.
export function buildTimeline(entrants, mode, tpl) {
  const timing = introTiming(entrants.length, mode);
  const tl = { duration: timing.total, camera: [], events: [], actors: [], timing };
  const short = mode === 'short';
  const openDur = timing.open;
  const scaleOpen = openDur / tpl.open.duration;
  for (const k of tpl.open.camera) tl.camera.push({ ...k, t: k.t * scaleOpen });
  for (const e of tpl.open.events) if (!short || ['fade', 'lights', 'music', 'door', 'cheer'].includes(e.type) || e.t > 2) tl.events.push({ ...e, t: e.t * scaleOpen, dur: e.dur ? e.dur * scaleOpen : e.dur });
  if (short) tl.events.push({ t: 0, type: 'fade', to: 0, dur: 0.3 }, { t: 0.1, type: 'lights', level: 1 }, { t: 0.1, type: 'music', mood: 'intro' });
  const w = tpl.entry.walk;
  entrants.forEach((p, i) => {
    const s = openDur + i * timing.per;
    // actor path (absolute studio-local coordinates)
    const pts = [w.from, w.edge, w.center, w.stairBase, w.stairTop, w.door].map((a) => new THREE.Vector3(...a));
    const segT = [];
    let t = s;
    const keys = [{ t, p: pts[0] }];
    for (let k = 1; k < pts.length; k++) {
      const d = pts[k].distanceTo(pts[k - 1]);
      t += d / w.speed * (k === 4 ? 1.15 : 1);
      keys.push({ t, p: pts[k] });
      if (k === 2) { t += w.pause; keys.push({ t, p: pts[2], pause: true }); }
      segT.push(t);
    }
    tl.actors.push({ id: p.id, name: p.name, look: p.look, n: i + 1, start: s, keys, end: t + 0.3 });
    const shot = tpl.entry.shots[i % tpl.entry.shots.length];
    for (const k of shot) tl.camera.push({ ...k, t: s + k.t * timing.per, actor: i, ease: k.t === 0 ? 'cut' : 'inOut' });
    for (const e of tpl.entry.events) {
      const text = e.text ? e.text.replace('{n}', String(i + 1)).replace('{name}', p.name) : undefined;
      tl.events.push({ ...e, t: s + e.t, text, actor: i });
    }
  });
  const os = openDur + entrants.length * timing.per;
  const scaleOut = timing.outro / tpl.outro.duration;
  for (const k of tpl.outro.camera) tl.camera.push({ ...k, t: os + k.t * scaleOut, ease: k.t === 0 ? 'cut' : k.ease });
  for (const e of tpl.outro.events) tl.events.push({ ...e, t: os + e.t * scaleOut, dur: e.dur ? e.dur * scaleOut : e.dur });
  tl.camera.sort((a, b) => a.t - b.t);
  tl.events.sort((a, b) => a.t - b.t);
  return tl;
}

