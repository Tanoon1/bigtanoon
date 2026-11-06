// The Big Brother live studio (intro cutscene) – stage, giant eye with stairs, LED walls, truss lights, audience
import * as THREE from 'three';
import { tex, ScreenTexture, drawEye } from './materials.js';

export const STUDIO_OFFSET = new THREE.Vector3(1000, 0, 0); // keeps studio outside house light rects

const std = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const glow = (c, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), toneMapped: false });

export const STUDIO = {
  stageR: 4.6,
  stageY: 0.35,
  stairBase: -4.3,
  stairTop: -8.9,
  stairH: 3.6,
  eyeZ: -10.4,
  eyeY: 4.6,
  sideEntry: new THREE.Vector3(9.5, 0.35, 1.2),
};

export class Studio {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.position.copy(STUDIO_OFFSET);
    scene.add(this.root);
    this.lightLevel = 0;
    this.targetLight = 0;
    this.cheer = 0;
    this.beams = [];
    this.anim = [];
    this.build();
  }

  build() {
    const R = this.root;
    // lights
    this.hemi = new THREE.HemisphereLight(0x8fb8ff, 0x101020, 0.6);
    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.position.set(5, 18, 14);
    this.key.target.position.set(0, 0, -2);
    R.add(this.hemi, this.key, this.key.target);
    this.spot = new THREE.SpotLight(0xdff6ff, 60, 40, 0.5, 0.6, 1.5);
    this.spot.position.set(0, 14, 6);
    this.spot.target.position.set(0, 0, 0);
    R.add(this.spot, this.spot.target);

    // floor
    const floor = new THREE.Mesh(new THREE.CircleGeometry(40, 48), new THREE.MeshPhongMaterial({ color: 0x070b16, shininess: 80, specular: 0x334466 }));
    floor.rotation.x = -Math.PI / 2;
    R.add(floor);
    // round stage
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#e9eef3'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = '#9fb2c2';
    for (let r = 40; r < 256; r += 26) { g.lineWidth = r % 52 ? 2 : 5; g.beginPath(); g.arc(256, 256, r, 0, 7); g.stroke(); }
    drawEye(g, 256, 256, 70, 0);
    const st = new THREE.CanvasTexture(c); st.colorSpace = THREE.SRGBColorSpace;
    const stage = new THREE.Mesh(new THREE.CylinderGeometry(STUDIO.stageR, STUDIO.stageR + 0.1, STUDIO.stageY, 48), [std(0xdde5ec), new THREE.MeshPhongMaterial({ map: st, shininess: 60 }), std(0xdde5ec)]);
    stage.position.y = STUDIO.stageY / 2;
    R.add(stage);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(STUDIO.stageR + 0.05, 0.05, 6, 64), glow('#bff6ff', 1.6));
    rim.rotation.x = Math.PI / 2; rim.position.y = STUDIO.stageY;
    R.add(rim);
    // runway (glass with pink LED rails)
    const run = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 11), new THREE.MeshPhongMaterial({ color: 0x0b1830, shininess: 100, specular: 0x88aaff, transparent: true, opacity: 0.92 }));
    run.position.set(0, 0.15, STUDIO.stageR + 5.4);
    R.add(run);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 11), glow('#ffd0f0', 1.4));
      rail.position.set(sx * 1.7, 0.34, STUDIO.stageR + 5.4); R.add(rail);
      for (let i = 0; i < 6; i++) {
        const fx = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.9), std(0x111111));
        fx.position.set(sx * 2.2, 0.2, STUDIO.stageR + 1 + i * 1.8); R.add(fx);
        const lens = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.7), glow('#e8f4ff', 1.2));
        lens.position.set(sx * 2.2 - sx * 0.21, 0.25, STUDIO.stageR + 1 + i * 1.8); lens.rotation.y = -sx * Math.PI / 2; R.add(lens);
      }
    }
    // stairs
    const steps = 12;
    const dz = (STUDIO.stairBase - STUDIO.stairTop) / steps;
    const stepMat = std(0xf3f6f9);
    for (let i = 0; i < steps; i++) {
      const y = STUDIO.stageY + ((i + 1) * (STUDIO.stairH - STUDIO.stageY)) / steps;
      const s = new THREE.Mesh(new THREE.BoxGeometry(3.4 - i * 0.05, y, dz + 0.02), stepMat);
      s.position.set(0, y / 2, STUDIO.stairBase - dz * (i + 0.5));
      R.add(s);
      const n = new THREE.Mesh(new THREE.BoxGeometry(3.4 - i * 0.05, 0.03, 0.04), glow('#ffffff', 1.2));
      n.position.set(0, y + 0.01, STUDIO.stairBase - dz * i - 0.02);
      R.add(n);
    }
    for (const sx of [-1, 1]) {
      const len = Math.hypot(STUDIO.stairBase - STUDIO.stairTop, STUDIO.stairH);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), std(0xcfd8dc));
      rail.position.set(sx * 1.75, STUDIO.stairH / 2 + 1.0, (STUDIO.stairBase + STUDIO.stairTop) / 2);
      rail.rotation.x = Math.atan2(STUDIO.stairBase - STUDIO.stairTop, STUDIO.stairH);
      R.add(rail);
    }
    // landing
    const land = new THREE.Mesh(new THREE.BoxGeometry(4, STUDIO.stairH, 1.6), stepMat);
    land.position.set(0, STUDIO.stairH / 2, STUDIO.stairTop - 0.8);
    R.add(land);

    // the giant eye
    const eye = new THREE.Group();
    eye.position.set(0, STUDIO.eyeY, STUDIO.eyeZ);
    R.add(eye);
    const almond = new THREE.Shape();
    const W = 7.8, H = 3.5;
    almond.moveTo(-W, 0); almond.quadraticCurveTo(0, H * 1.45, W, 0); almond.quadraticCurveTo(0, -H * 1.45, -W, 0);
    const ag = new THREE.ExtrudeGeometry(almond, { depth: 0.6, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.3, bevelSegments: 3, curveSegments: 24 });
    const almondMesh = new THREE.Mesh(ag, new THREE.MeshPhongMaterial({ color: 0xf4f7fa, shininess: 70 }));
    almondMesh.position.z = -0.8;
    eye.add(almondMesh);
    // wings (sweeping blades)
    for (const sx of [-1, 1]) {
      const wing = new THREE.Shape();
      wing.moveTo(0, 0); wing.quadraticCurveTo(sx * 6, 1.6, sx * 10.5, 2.6); wing.quadraticCurveTo(sx * 6, 0.9, 0, -0.5);
      const wg = new THREE.ExtrudeGeometry(wing, { depth: 0.3, bevelEnabled: false, curveSegments: 16 });
      const wm = new THREE.Mesh(wg, std(0xe8eef3));
      wm.position.set(sx * 6.5, -0.4, -1.1);
      eye.add(wm);
      const wm2 = wm.clone(); wm2.scale.set(0.8, -0.8, 1); wm2.position.set(sx * 6.0, -1.6, -1.1); eye.add(wm2);
    }
    // iris with radial LED stripes
    const ic = document.createElement('canvas'); ic.width = ic.height = 512;
    const ig = ic.getContext('2d');
    ig.fillStyle = '#063a5c'; ig.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      ig.strokeStyle = i % 2 ? '#bff6ff' : '#1fd0f0'; ig.lineWidth = 9;
      ig.beginPath(); ig.moveTo(256 + Math.cos(a) * 150, 256 + Math.sin(a) * 150); ig.lineTo(256 + Math.cos(a) * 250, 256 + Math.sin(a) * 250); ig.stroke();
    }
    for (let k = 0; k < 3; k++) { ig.strokeStyle = '#7ff0ff'; ig.lineWidth = 6; ig.beginPath(); ig.arc(256, 256, 140 - k * 16, 0, 7); ig.stroke(); }
    const it = new THREE.CanvasTexture(ic); it.colorSpace = THREE.SRGBColorSpace;
    this.iris = new THREE.Mesh(new THREE.CircleGeometry(3.0, 64), new THREE.MeshBasicMaterial({ map: it, toneMapped: false }));
    this.iris.position.z = 0.12;
    eye.add(this.iris);
    const irisRing = new THREE.Mesh(new THREE.RingGeometry(3.0, 3.25, 64), new THREE.MeshBasicMaterial({ color: 0x041018 }));
    irisRing.position.z = 0.11; eye.add(irisRing);
    // pupil = the door into the house
    this.pupil = new THREE.Mesh(new THREE.CircleGeometry(1.55, 48), new THREE.MeshBasicMaterial({ color: 0x0a1c3a, toneMapped: false }));
    this.pupil.position.set(0, -0.4, 0.16);
    eye.add(this.pupil);
    this.pupilGlow = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.75, 48), glow('#5ff3ff', 1.3));
    this.pupilGlow.position.set(0, -0.4, 0.15); eye.add(this.pupilGlow);
    this.doorLight = new THREE.PointLight(0x7ff0ff, 0, 8);
    this.doorLight.position.set(0, -0.4, 1.2); eye.add(this.doorLight);
    this.eye = eye;

    // curved LED walls
    this.bigScreen = new ScreenTexture(512, 288, 'eye');
    const ledMat = new THREE.MeshBasicMaterial({ map: tex('led'), toneMapped: false, color: 0xa8d8ff });
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI * 0.62 + (i / 13) * Math.PI * 1.24;
      const r = 19;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 8), i === 6 || i === 7 ? new THREE.MeshBasicMaterial({ map: this.bigScreen.tex, toneMapped: false }) : ledMat);
      panel.position.set(Math.sin(a) * r, 5.2, -Math.cos(a) * r - 2);
      panel.lookAt(0, 5.2, -2);
      R.add(panel);
    }
    // truss & moving heads
    const truss = std(0x8a949c);
    for (let i = -3; i <= 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(34, 0.25, 0.25), truss); b.position.set(0, 11, i * 4); R.add(b);
      const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 26), truss); b2.position.set(i * 5, 11.2, 0); R.add(b2);
    }
    const beamTex = (() => {
      const cc = document.createElement('canvas'); cc.width = 4; cc.height = 128;
      const gg = cc.getContext('2d');
      const gr = gg.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      gg.fillStyle = gr; gg.fillRect(0, 0, 4, 128);
      const t = new THREE.CanvasTexture(cc); return t;
    })();
    const beamGeo = new THREE.CylinderGeometry(0.08, 1.4, 14, 12, 1, true);
    beamGeo.translate(0, -7, 0);
    for (let i = 0; i < 18; i++) {
      const fix = new THREE.Group();
      fix.position.set(-15 + (i % 9) * 3.75, 10.7, i < 9 ? -6 : 5);
      fix.add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), std(0x222222)));
      const col = i % 3 === 0 ? 0x4f7bff : 0xeaf6ff;
      const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, map: beamTex, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      fix.add(beam);
      const lens = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), glow(col, 2));
      lens.position.y = -0.22; fix.add(lens);
      R.add(fix);
      this.beams.push({ fix, beam, lens, ph: i * 0.7, sp: 0.4 + (i % 4) * 0.15 });
    }
    // orange LED pillars at audience barrier
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI * 0.85 + (i / 15) * Math.PI * 1.7;
      const r = 12.5;
      const px = Math.sin(a) * r, pz = -Math.cos(a) * r + 2;
      if (Math.abs(px) < 2.6 && pz > 4) continue;
      for (let k = 0; k < 6; k++) {
        const d = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), glow('#ff9a2a', 1.6));
        d.position.set(px, 0.6 + k * 0.42, pz); R.add(d);
      }
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.8, 0.3), std(0x111318)); post.position.set(px, 1.4, pz - 0.2 * Math.sign(pz)); R.add(post);
    }
    // audience (instanced silhouettes)
    const seats = [];
    for (const side of [-1, 1]) for (let row = 0; row < 5; row++) for (let k = 0; k < 14; k++) {
      const a = side * (0.55 + k * 0.075);
      const r = 14 + row * 1.2;
      seats.push([Math.sin(a) * r, 0.2 + row * 0.45, -Math.cos(a) * r + 3 + (side > 0 ? 0 : 0)]);
    }
    for (let row = 0; row < 4; row++) for (let k = 0; k < 16; k++) {
      const x = (k < 8 ? -10.5 + k * 1.0 : 3.5 + (k - 8) * 1.0);
      seats.push([x, 0.2 + row * 0.45, 13.5 + row * 1.2]);
    }
    const body = new THREE.CapsuleGeometry(0.28, 0.6, 2, 6);
    this.crowd = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0x1a2238 }), seats.length);
    this.crowdBase = seats;
    const m4 = new THREE.Matrix4();
    seats.forEach((s, i) => { m4.makeTranslation(s[0], s[1] + 0.9, s[2]); this.crowd.setMatrixAt(i, m4); this.crowd.setColorAt(i, new THREE.Color().setHSL(0.6 + Math.random() * 0.1, 0.3, 0.12 + Math.random() * 0.1)); });
    R.add(this.crowd);
    const phones = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.12, 0.2), glow('#ffffff', 1.5), 40);
    for (let i = 0; i < 40; i++) {
      const s = seats[(i * 7) % seats.length];
      m4.makeTranslation(s[0] * 0.97, s[1] + 1.6, s[2] * 0.97);
      m4.multiply(new THREE.Matrix4().makeRotationY(Math.atan2(-s[0], -s[2])));
      phones.setMatrixAt(i, m4);
    }
    R.add(phones);
    this.phones = phones;
    // cameras on cranes (decor)
    const crane = new THREE.Group();
    crane.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 6, 0.15), std(0x333333)).translateY(3));
    const arm = new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.12), std(0x333333)); arm.position.set(-2, 6, 0); crane.add(arm);
    const camBox = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.35, 0.6), std(0x111111)); camBox.position.set(-5, 5.8, 0); crane.add(camBox);
    crane.position.set(10, 0, 9); crane.rotation.y = -0.6;
    R.add(crane);
  }

  setLights(level) { this.targetLight = level; }
  setCheer(v) { this.cheer = v; }
  openDoor(v) { this.doorOpen = v; }

  update(dt, t) {
    this.lightLevel += (this.targetLight - this.lightLevel) * Math.min(1, dt * 2.5);
    const L = this.lightLevel;
    this.hemi.intensity = 0.15 + L * 0.65;
    this.key.intensity = 0.2 + L * 1.3;
    this.spot.intensity = L * 70;
    for (const b of this.beams) {
      b.fix.rotation.z = Math.sin(t * b.sp + b.ph) * 0.55;
      b.fix.rotation.x = Math.cos(t * b.sp * 0.8 + b.ph) * 0.4;
      b.beam.material.opacity = 0.16 * L;
      b.lens.visible = L > 0.05;
    }
    this.bigScreen.update(dt, 15);
    this.iris.rotation.z = t * 0.08;
    const open = this.doorOpen ? 1 : 0;
    this.pupil.material.color.setRGB(0.04 + open * 0.55, 0.1 + open * 0.85, 0.22 + open * 0.9);
    this.doorLight.intensity += ((open ? 25 : 2) * L - this.doorLight.intensity) * Math.min(1, dt * 5);
    // crowd bounce when cheering
    if (this.cheer > 0.01) {
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < this.crowdBase.length; i += 1) {
        const s = this.crowdBase[i];
        const j = Math.max(0, Math.sin(t * 9 + i * 1.7)) * 0.25 * this.cheer;
        m4.makeTranslation(s[0], s[1] + 0.9 + j, s[2]);
        this.crowd.setMatrixAt(i, m4);
      }
      this.crowd.instanceMatrix.needsUpdate = true;
    }
    this.phones.visible = L > 0.3;
  }

  dispose() { this.root.removeFromParent(); }
}
