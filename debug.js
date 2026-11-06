// Dev viewer: /?debug=house&cam=x,y,z,lx,ly,lz&night=0..1  |  /?debug=studio  |  /?debug=avatars
import * as THREE from 'three';
import { Engine } from './engine.js';
import { House } from './world/House.js';
import { loadLogo } from './world/materials.js';

export async function runDebug(kind, params) {
  await loadLogo();
  const engine = new Engine(document.getElementById('stage'), params.get('q') || 'high');
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 400);
  engine.onResize = (w, h) => { cam.aspect = w / h; cam.updateProjectionMatrix(); };
  const c = (params.get('cam') || '0.7,1.6,4.5,0.7,1.4,-5').split(',').map(Number);
  cam.position.set(c[0], c[1], c[2]); cam.lookAt(c[3], c[4], c[5]);
  let update = () => {};
  if (kind === 'house') {
    const house = new House(scene, engine.quality);
    const env = { night: Number(params.get('night') || 0), lights: {}, party: params.has('party'), eviction: params.has('evict') };
    house.setDoors({ d_yard: { open: true }, d_bed: { open: true }, d_diary: { open: params.has('open') } });
    update = (dt, t) => house.update(dt, t, env);
    if (params.has('avatars')) {
      const { Avatar } = await import('./world/Avatar.js');
      const looks = [{ color: '#26c6da', hat: 'crown', outfit: 'suit', emoji: '😎', hair: 'short' }, { color: '#ff5c8a', hat: 'party', outfit: 'dress', emoji: '💅', hair: 'long', hairColor: '#e6c27a' }, { color: '#ffb627', hat: 'cowboy', outfit: 'hoodie', emoji: '🤠', hair: 'curly' }];
      const avs = looks.map((l, i) => { const a = new Avatar(l, ['דני', 'מאיה', 'יוסי'][i]); a.group.position.set(-0.8 + i * 1.3, 0, 1.2); a.group.rotation.y = 0.3 - i * 0.3; scene.add(a.group); return a; });
      avs[1].speaking = true; avs[1].level = 0.7;
      avs[2].emote('dance');
      const u0 = update;
      update = (dt, t) => { u0(dt, t); avs.forEach((a, i) => { a.update(dt, t, cam, { moving: i === 0 ? 1 : 0, speed: 3 }); }); };
    }
  } else if (kind === 'studio') {
    const { Studio } = await import('./world/Studio.js');
    const { STUDIO_OFFSET } = await import('./world/Studio.js');
    const studio = new Studio(scene);
    studio.setLights(1); studio.setCheer(1);
    const O = STUDIO_OFFSET;
    cam.position.set(c[0] + O.x, c[1], c[2]); cam.lookAt(c[3] + O.x, c[4], c[5]);
    update = (dt, t) => studio.update(dt, t);
  }
  const clock = new THREE.Clock();
  let t = 0;
  window.__frames = 0;
  engine.renderer.setAnimationLoop(() => {
    const dt = Math.min(0.05, clock.getDelta());
    t += dt;
    update(dt, t);
    engine.render(scene, cam);
    window.__frames++;
    window.__info = engine.renderer.info.render;
  });
}
