// Procedural textures + the "room light" shader patch (per-room light levels/tints, fake baked AO,
// indoor sun-occlusion). One cheap uniform array instead of dozens of real lights → fast on phones.
import * as THREE from 'three';
import { ROOMS } from '../../../shared/layout.js';

export const roomUniforms = {
  bbRects: { value: ROOMS.map((r) => new THREE.Vector4(r.rect[0], r.rect[1], r.rect[2], r.rect[3])) },
  bbCol: { value: ROOMS.map(() => new THREE.Vector3(1, 1, 1)) },
  bbSun: { value: ROOMS.map((r) => (r.outdoor ? 1 : 0.0)) },
  bbOutside: { value: new THREE.Vector3(1, 1, 1) },
  bbTime: { value: 0 },
  bbXray: { value: 0 },
};
const NR = ROOMS.length;

const VERT_DECL = 'varying vec3 vBBWorld;\n';
const FRAG_DECL = `
varying vec3 vBBWorld;
uniform vec4 bbRects[${NR}];
uniform vec3 bbCol[${NR}];
uniform float bbSun[${NR}];
uniform vec3 bbOutside;
float bbSunF = 1.0;
vec3 bbLightAt(vec3 p) {
  for (int i = 0; i < ${NR}; i++) {
    vec4 r = bbRects[i];
    if (p.x >= r.x && p.x <= r.z && p.z >= r.y && p.z <= r.w) {
      bbSunF = bbSun[i];
      float e = min(min(p.x - r.x, r.z - p.x), min(p.z - r.y, r.w - p.z));
      float ao = mix(0.62, 1.0, smoothstep(0.0, 1.1, e + min(p.y, 3.2 - p.y) * 0.9));
      if (bbSun[i] > 0.5) ao = mix(0.8, 1.0, smoothstep(0.0, 1.5, e + p.y));
      vec2 c = vec2(r.x + r.z, r.y + r.w) * 0.5;
      vec2 hs = vec2(r.z - r.x, r.w - r.y) * 0.5;
      float d = length((p.xz - c) / hs);
      float pool = 1.12 - 0.28 * clamp(d, 0.0, 1.0);
      if (bbSun[i] > 0.5) pool = 1.0;
      return bbCol[i] * ao * pool;
    }
  }
  bbSunF = 1.0;
  return bbOutside;
}
`;

export function patchMaterial(mat) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, roomUniforms);
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      vec4 bbwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        bbwp = instanceMatrix * bbwp;
      #endif
      vBBWorld = (modelMatrix * bbwp).xyz;`,
    );
    shader.fragmentShader = FRAG_DECL + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `vec3 bbL = bbLightAt(vBBWorld);
      vec3 bbLit = (reflectedLight.indirectDiffuse + reflectedLight.directDiffuse * bbSunF) * bbL;
      #ifdef BB_SPEC
        bbLit += reflectedLight.directSpecular * bbSunF + reflectedLight.indirectSpecular;
      #endif
      outgoingLight = bbLit + totalEmissiveRadiance;
      #include <opaque_fragment>`,
    );
  };
  mat.customProgramCacheKey = () => 'bbroom' + (mat.defines?.BB_SPEC ? 's' : '');
  return mat;
}

export function lambert(opts) { return patchMaterial(new THREE.MeshLambertMaterial(opts)); }
export function phong(opts) {
  const m = new THREE.MeshPhongMaterial(opts);
  m.defines = { BB_SPEC: 1 };
  return patchMaterial(m);
}

// ---------------------------------------------------------------------
//  Canvas textures
// ---------------------------------------------------------------------
function canvas(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function noise(g, w, h, a, rgb = '0,0,0', n = 2000, s = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(${rgb},${Math.random() * a})`;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

const cache = {};
export function tex(name) {
  if (cache[name]) return cache[name];
  let t;
  switch (name) {
    case 'tile': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#eef3f5'; g.fillRect(0, 0, w, w);
      noise(g, w, w, 0.05, '120,140,150', 1500, 3);
      g.strokeStyle = '#b9c7cc'; g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, w - 3, w - 3);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(10, 10, w * 0.5, 6);
    }); break;
    case 'tileSmall': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#e8f6f3'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#a8d6cd'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, w); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
      noise(g, w, w, 0.06, '80,140,130', 900, 2);
    }); break;
    case 'wood': t = canvas(256, 256, (g, w) => {
      for (let i = 0; i < 8; i++) {
        const l = 52 + Math.random() * 14;
        g.fillStyle = `hsl(30, 38%, ${l}%)`; g.fillRect(0, i * 32, w, 32);
        g.fillStyle = 'rgba(70,40,20,0.25)'; g.fillRect(0, i * 32, w, 2);
        g.fillRect((Math.random() * w) | 0, i * 32, 2, 32);
        for (let k = 0; k < 20; k++) { g.fillStyle = `rgba(90,55,25,${Math.random() * 0.12})`; g.fillRect(0, i * 32 + Math.random() * 32, w, 1); }
      }
    }); break;
    case 'deck': t = canvas(256, 256, (g, w) => {
      for (let i = 0; i < 8; i++) {
        g.fillStyle = `hsl(25, 30%, ${38 + Math.random() * 8}%)`; g.fillRect(i * 32, 0, 32, w);
        g.fillStyle = 'rgba(30,15,5,0.5)'; g.fillRect(i * 32, 0, 3, w);
      }
      noise(g, w, w, 0.1, '30,15,5', 1200, 2);
    }); break;
    case 'carpet': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#4a2c6e'; g.fillRect(0, 0, w, w);
      noise(g, w, w, 0.25, '20,5,40', 6000, 2);
      noise(g, w, w, 0.15, '200,120,255', 2500, 1);
    }); break;
    case 'grass': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#3f8f3a'; g.fillRect(0, 0, w, w);
      noise(g, w, w, 0.35, '20,70,20', 7000, 2);
      noise(g, w, w, 0.25, '130,200,90', 4000, 2);
    }); break;
    case 'dark': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#060d1a'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(0,200,255,0.35)'; g.lineWidth = 2;
      g.strokeRect(0, 0, w, w);
      g.beginPath(); g.arc(w / 2, w / 2, 80, 0, Math.PI * 2); g.stroke();
    }); break;
    case 'padded': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#f7f7f7'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#d4d4d4'; g.lineWidth = 3;
      for (let i = -w; i < w * 2; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + w, w); g.moveTo(i + w, 0); g.lineTo(i, w); g.stroke(); }
      for (let x = 0; x <= w; x += 64) for (let y = 0; y <= w; y += 64) { g.fillStyle = '#bbb'; g.beginPath(); g.arc(x + 32, y, 4, 0, 7); g.fill(); }
    }); break;
    case 'gold': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#1c150c'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#c9a03f'; g.lineWidth = 3;
      for (let i = 0; i < w; i += 64) { g.strokeRect(i + 4, 4, 56, w - 8); }
      noise(g, w, w, 0.08, '255,220,120', 800, 2);
    }); break;
    case 'concrete': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#8d9aa0'; g.fillRect(0, 0, w, w);
      noise(g, w, w, 0.18, '40,50,55', 5000, 2);
      g.strokeStyle = 'rgba(50,60,65,0.4)'; g.strokeRect(0, 0, w, w);
    }); break;
    case 'water': t = canvas(256, 256, (g, w) => {
      const gr = g.createLinearGradient(0, 0, w, w);
      gr.addColorStop(0, '#2fd3ef'); gr.addColorStop(1, '#0d8fc4');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2;
      for (let i = 0; i < 18; i++) { g.beginPath(); const x = Math.random() * w, y = Math.random() * w; g.moveTo(x, y); g.bezierCurveTo(x + 20, y - 10, x + 40, y + 10, x + 60, y); g.stroke(); }
    }); break;
    case 'poolTile': t = canvas(128, 128, (g, w) => {
      g.fillStyle = '#5fd0e8'; g.fillRect(0, 0, w, w);
      g.strokeStyle = '#2aa5c7'; g.lineWidth = 2;
      for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, w); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
    }); break;
    case 'led': t = canvas(256, 512, (g, w, h) => {
      // blue LED wall like the studio: vertical gradient stripes + stars
      const gr = g.createLinearGradient(0, 0, w, 0);
      gr.addColorStop(0, '#043a66'); gr.addColorStop(0.5, '#0a77b8'); gr.addColorStop(1, '#043a66');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = `rgba(80,220,255,${0.35 + i * 0.12})`;
        const x = 30 + i * 22;
        g.fillRect(x, 0, 10, h * 0.55);
        g.beginPath(); g.arc(x + 60, h * 0.55, 60, Math.PI, Math.PI * 0.5, true); g.lineWidth = 10; g.strokeStyle = g.fillStyle; g.stroke();
        g.fillRect(x + 110, h * 0.55 + 55, 10, h);
      }
      for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${Math.random()})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
    }); break;
    case 'stars': t = canvas(512, 256, (g, w, h) => {
      g.fillStyle = '#02040c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(200,230,255,${Math.random()})`; const s = Math.random() < 0.08 ? 2 : 1; g.fillRect(Math.random() * w, Math.random() * h, s, s); }
    }); break;
    case 'fabric': t = canvas(128, 128, (g, w) => {
      g.fillStyle = '#fff'; g.fillRect(0, 0, w, w);
      noise(g, w, w, 0.12, '0,0,0', 1600, 1);
    }); break;
    case 'marble': t = canvas(256, 256, (g, w) => {
      g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(120,120,130,0.25)';
      for (let i = 0; i < 14; i++) { g.lineWidth = Math.random() * 2; g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 60; y += 36; g.lineTo(x, y); } g.stroke(); }
    }); break;
    default: t = canvas(4, 4, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 4, 4); });
  }
  cache[name] = t;
  return t;
}

// The Big Brother eye drawn procedurally (used on screens, walls, signs)
export function drawEye(g, cx, cy, R, t = 0, opts = {}) {
  const open = opts.open ?? 1;
  g.save();
  // almond (white sclera, silver rim)
  g.translate(cx, cy);
  const w = R * 1.9, h = R * 1.05 * open;
  g.beginPath();
  g.moveTo(-w, 0); g.quadraticCurveTo(0, -h * 1.5, w, 0); g.quadraticCurveTo(0, h * 1.5, -w, 0);
  const sg = g.createLinearGradient(0, -h, 0, h);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#b8c2c8');
  g.fillStyle = sg; g.fill();
  g.clip();
  // iris
  const ir = R * 0.82;
  const ix = (opts.lookX || 0) * R * 0.3;
  const rg = g.createRadialGradient(ix, 0, ir * 0.1, ix, 0, ir);
  rg.addColorStop(0, '#002a3a'); rg.addColorStop(0.35, '#015a78'); rg.addColorStop(0.75, '#14b9d6'); rg.addColorStop(1, '#e8fbff');
  g.fillStyle = '#000'; g.beginPath(); g.arc(ix, 0, ir * 1.07, 0, Math.PI * 2); g.fill();
  g.fillStyle = rg; g.beginPath(); g.arc(ix, 0, ir, 0, Math.PI * 2); g.fill();
  // iris stripes (studio eye)
  g.strokeStyle = 'rgba(120,240,255,0.35)'; g.lineWidth = Math.max(1, R * 0.03);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + t * 0.2;
    g.beginPath(); g.moveTo(ix + Math.cos(a) * ir * 0.45, Math.sin(a) * ir * 0.45); g.lineTo(ix + Math.cos(a) * ir * 0.9, Math.sin(a) * ir * 0.9); g.stroke();
  }
  const pr = ir * (0.36 + 0.04 * Math.sin(t * 1.7));
  g.fillStyle = '#020608'; g.beginPath(); g.arc(ix, 0, pr, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(ix + pr * 0.45, -pr * 0.45, pr * 0.22, 0, Math.PI * 2); g.fill();
  g.restore();
}

// Hebrew logo lockup (eye + "האח הגדול")
export function drawLogo(g, w, h, t = 0) {
  g.fillStyle = '#ffffff00';
  drawEye(g, w * 0.28, h * 0.5, h * 0.26, t);
  g.fillStyle = '#29c4dc';
  g.font = `900 ${Math.round(h * 0.28)}px "Secular One", "Rubik", "Arial Hebrew", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#00e5ff'; g.shadowBlur = h * 0.05;
  g.fillText('האח', w * 0.72, h * 0.34);
  g.fillText('הגדול', w * 0.72, h * 0.68);
  g.shadowBlur = 0;
}

let logoImg = null;
export function loadLogo() {
  if (logoImg) return Promise.resolve(logoImg);
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { logoImg = img; res(img); };
    img.onerror = () => res(null);
    img.src = '/logo.png';
  });
}
export function getLogoImg() { return logoImg; }

// Animated screen texture (eye / logo / static / custom text)
export class ScreenTexture {
  constructor(w = 512, h = 288, mode = 'eye') {
    this.c = document.createElement('canvas');
    this.c.width = w; this.c.height = h;
    this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mode = mode;
    this.text = '';
    this.t = 0;
    this.acc = 1;
  }
  update(dt, fps = 12) {
    this.t += dt;
    this.acc += dt;
    if (this.acc < 1 / fps) return;
    this.acc = 0;
    const { g, c } = this;
    const w = c.width, h = c.height;
    const bg = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w * 0.7);
    bg.addColorStop(0, '#0b4e74'); bg.addColorStop(1, '#020a18');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    if (this.mode === 'static') {
      const id = g.getImageData(0, 0, w, h);
      for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; }
      g.putImageData(id, 0, 0);
    } else if (this.mode === 'logo') {
      const img = getLogoImg();
      if (img) {
        const s = Math.min(w / img.width, h / img.height) * 0.9;
        g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
        g.drawImage(img, (w - img.width * s) / 2, (h - img.height * s) / 2, img.width * s, img.height * s);
      } else drawLogo(g, w, h, this.t);
    } else if (this.mode === 'text') {
      drawEye(g, w * 0.5, h * 0.33, h * 0.18, this.t);
      g.fillStyle = '#e9fdff'; g.font = `700 ${Math.round(h * 0.11)}px Rubik, sans-serif`; g.textAlign = 'center';
      g.direction = 'rtl';
      wrap(g, this.text, w / 2, h * 0.68, w * 0.9, h * 0.13);
    } else if (this.mode === 'news') {
      g.fillStyle = '#c62828'; g.fillRect(0, h * 0.78, w, h * 0.22);
      g.fillStyle = '#fff'; g.font = `800 ${Math.round(h * 0.1)}px Rubik, sans-serif`; g.textAlign = 'center';
      g.fillText('חדשות הבית • ' + (this.text || 'האח הגדול צופה בכם'), w / 2 + Math.sin(this.t) * 10, h * 0.9);
      drawEye(g, w * 0.5, h * 0.4, h * 0.22, this.t);
    } else {
      drawEye(g, w * 0.5, h * 0.5, h * 0.3, this.t, { lookX: Math.sin(this.t * 0.6) });
    }
    // scanlines
    g.fillStyle = 'rgba(0,0,0,0.14)';
    for (let y = 0; y < h; y += 3) g.fillRect(0, y, w, 1);
    this.tex.needsUpdate = true;
  }
}

export function wrap(g, text, x, y, maxW, lh) {
  const words = String(text).split(' ');
  let line = '', yy = y;
  for (const wd of words) {
    const test = line ? line + ' ' + wd : wd;
    if (g.measureText(test).width > maxW && line) { g.fillText(line, x, yy); line = wd; yy += lh; }
    else line = test;
  }
  if (line) g.fillText(line, x, yy);
}

export function emissive(color, intensity = 1) {
  return new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), toneMapped: false });
}
