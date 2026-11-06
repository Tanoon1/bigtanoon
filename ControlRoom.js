// Big Brother control room: wall of security cameras (render targets + CRT shader), single view, free-cam.
import * as THREE from 'three';
import { BB_CAMERAS, ROOM_BY_ID } from '../../../shared/layout.js';

const CRT = {
  uniforms: { map: { value: null }, t: { value: 0 }, sel: { value: 0 }, res: { value: new THREE.Vector2(512, 288) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D map; uniform float t; uniform float sel; uniform vec2 res; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + t*3.7) * 43758.5453); }
    void main(){
      vec2 uv = vUv - 0.5; float r2 = dot(uv,uv); uv *= 1.0 + r2*0.08; uv += 0.5;
      if (uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0){ gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
      vec3 c = texture2D(map, uv).rgb; c = pow(max(c,0.0) / (1.0 + c*0.55) * 1.25, vec3(1.0/2.2));
      float g = dot(c, vec3(0.299,0.587,0.114));
      c = mix(vec3(g), c, 0.75) * vec3(0.95,1.03,1.0);
      c += (rnd(uv*res) - 0.5) * 0.09;
      c *= 0.88 + 0.12*sin(uv.y*res.y*1.6 + t*8.0);
      c *= 1.0 - r2*1.3;
      float roll = smoothstep(0.0,0.02, abs(fract(uv.y - t*0.07) - 0.5)); c *= 0.94 + 0.06*roll;
      if (sel > 0.5) { float e = min(min(vUv.x,1.0-vUv.x), min(vUv.y,1.0-vUv.y)); c = mix(vec3(0.13,0.88,1.0), c, smoothstep(0.0,0.012,e)); }
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export class ControlRoom {
  constructor(engine, scene, input, overlay, opts = { panel: true }) {
    this.opts = opts;
    this.engine = engine;
    this.scene = scene;
    this.input = input;
    this.overlay = overlay;
    this.mode = 'grid';
    this.sel = 0;
    this.cams = BB_CAMERAS.map((c) => {
      const cam = new THREE.PerspectiveCamera(c.id === 'c6' ? 55 : 78, 16 / 9, 0.05, 200);
      cam.position.set(...c.pos); cam.lookAt(...c.look);
      const rt = new THREE.WebGLRenderTarget(512, 288, { samples: 0 });
      const mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CRT.uniforms), vertexShader: CRT.vertexShader, fragmentShader: CRT.fragmentShader });
      mat.uniforms.map.value = rt.texture;
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
      return { ...c, cam, rt, mat, quad, baseYaw: 0 };
    });
    this.big = new THREE.WebGLRenderTarget(1280, 720);
    this.bigMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(CRT.uniforms), vertexShader: CRT.vertexShader, fragmentShader: CRT.fragmentShader });
    this.bigMat.uniforms.map.value = this.big.texture;
    this.bigMat.uniforms.res.value.set(1280, 720);
    this.bigQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.bigMat);
    this.ortho = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.hud = new THREE.Scene();
    for (const c of this.cams) this.hud.add(c.quad);
    this.hud.add(this.bigQuad);
    this.free = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 300);
    this.free.position.set(0.7, 9, 14);
    this.freeYaw = 0; this.freePitch = -0.6;
    this.rr = 0;
    this.layout();
  }

  layout() {
    const W = innerWidth, H = innerHeight;
    this.ortho.right = W; this.ortho.top = H; this.ortho.updateProjectionMatrix();
    const panelW = this.opts.panel && W > 900 ? Math.min(400, W * 0.32) : 0;
    const top = 64;
    const areaW = W - panelW, areaH = H - top - (W > 900 || !this.opts.panel ? 0 : H * 0.42);
    const cols = areaW / areaH > 1.6 ? 4 : 3;
    const rows = Math.ceil(this.cams.length / cols);
    const gap = 6;
    let tw = (areaW - gap * (cols + 1)) / cols, th = tw * 9 / 16;
    if (th * rows + gap * (rows + 1) > areaH) { th = (areaH - gap * (rows + 1)) / rows; tw = th * 16 / 9; }
    const ox = (areaW - (tw * cols + gap * (cols - 1))) / 2;
    const oy = H - top - (areaH - (th * rows + gap * (rows - 1))) / 2;
    this.tiles = [];
    this.cams.forEach((c, i) => {
      const col = cols - 1 - (i % cols); // RTL order
      const row = Math.floor(i / cols);
      const x = ox + col * (tw + gap), y = oy - (row + 1) * th - row * gap;
      c.quad.position.set(x + tw / 2, y + th / 2, 0);
      c.quad.scale.set(tw, th, 1);
      this.tiles.push({ x, y: H - y - th, w: tw, h: th, i });
    });
    const bw = areaW - 20, bh = Math.min(areaH - 20, bw * 9 / 16);
    this.bigQuad.position.set(areaW / 2, H - top - areaH / 2, 0);
    this.bigQuad.scale.set(bh * 16 / 9, bh, 1);
    this.bigRect = { x: areaW / 2 - bh * 8 / 9, y: H - (H - top - areaH / 2) - bh / 2, w: bh * 16 / 9, h: bh };
    this.free.aspect = W / H; this.free.updateProjectionMatrix();
    this.overlay?.layoutTiles(this);
  }

  setMode(m, sel = this.sel) {
    this.mode = m; this.sel = sel;
    this.overlay?.layoutTiles(this);
    if (m === 'free') this.input.requestLock();
  }

  tileAt(x, y) {
    if (this.mode !== 'grid') return null;
    return this.tiles.find((t) => x >= t.x && x <= t.x + t.w && y >= t.y && y <= t.y + t.h)?.i ?? null;
  }

  listenRoom() { return this.mode === 'free' ? 'spatial' : ROOM_BY_ID[this.cams[this.sel].room] ? this.cams[this.sel].room : 'all'; }
  listenerPos() {
    if (this.mode === 'free') return this.free.position;
    return this.cams[this.sel].cam.position;
  }

  update(dt, t) {
    const r = this.engine.renderer;
    for (const c of this.cams) { c.mat.uniforms.t.value = t; c.mat.uniforms.sel.value = c === this.cams[this.sel] ? 1 : 0; }
    this.bigMat.uniforms.t.value = t;
    // slow pan for realism on wall cameras
    if (this.mode === 'free') {
      const look = this.input.consumeLook();
      this.freeYaw -= look.dx; this.freePitch = THREE.MathUtils.clamp(this.freePitch - look.dy, -1.5, 1.5);
      const ax = this.input.axes();
      const sp = (ax.run ? 16 : 7) * dt;
      const f = new THREE.Vector3(-Math.sin(this.freeYaw) * Math.cos(this.freePitch), Math.sin(this.freePitch), -Math.cos(this.freeYaw) * Math.cos(this.freePitch));
      const rgt = new THREE.Vector3(Math.cos(this.freeYaw), 0, -Math.sin(this.freeYaw));
      this.free.position.addScaledVector(f, ax.y * sp).addScaledVector(rgt, ax.x * sp);
      this.free.position.y += ((ax.up ? 1 : 0) - (ax.down ? 1 : 0)) * sp;
      this.free.position.clampScalar(-40, 40); this.free.position.y = THREE.MathUtils.clamp(this.free.position.y, 0.3, 30);
      this.free.rotation.set(this.freePitch, this.freeYaw, 0, 'YXZ');
      this.engine.render(this.scene, this.free);
      return;
    }
    this.input.consumeLook();
    r.setRenderTarget(null);
    if (this.mode === 'grid') {
      const n = this.engine.quality === 'low' ? 2 : 4;
      for (let k = 0; k < n; k++) {
        const c = this.cams[(this.rr + k) % this.cams.length];
        r.setRenderTarget(c.rt); r.render(this.scene, c.cam);
      }
      this.rr = (this.rr + n) % this.cams.length;
      for (const c of this.cams) c.quad.visible = true;
      this.bigQuad.visible = false;
    } else {
      const c = this.cams[this.sel];
      r.setRenderTarget(this.big); r.render(this.scene, c.cam);
      for (const cc of this.cams) cc.quad.visible = false;
      this.bigQuad.visible = true;
    }
    r.setRenderTarget(null);
    r.setClearColor(0x02060c, 1);
    r.clear();
    const tm = r.toneMapping; r.toneMapping = THREE.NoToneMapping;
    r.render(this.hud, this.ortho);
    r.toneMapping = tm;
  }

  dispose() { for (const c of this.cams) c.rt.dispose(); this.big.dispose(); }
}
