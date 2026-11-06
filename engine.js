// Renderer, quality settings & post-processing
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

export function detectQuality() {
  const saved = safeGet('bb_quality');
  if (saved) return saved;
  if (isMobile) return 'low';
  const mem = navigator.deviceMemory || 8;
  return mem >= 4 ? 'high' : 'medium';
}

export function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
export function safeSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

export class Engine {
  constructor(container, quality = detectQuality()) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance', stencil: false });
    const pr = quality === 'high' ? Math.min(2, devicePixelRatio) : quality === 'medium' ? Math.min(1.5, devicePixelRatio) : Math.min(1.25, devicePixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.canvas = this.renderer.domElement;
    this.canvas.id = 'gl';
    this.composers = new Map();
    this.bloom = quality !== 'low';
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    for (const c of this.composers.values()) { c.composer.setSize(w, h); }
    this.onResize?.(w, h);
  }

  composerFor(scene, camera) {
    let c = this.composers.get(scene);
    if (!c) {
      const composer = new EffectComposer(this.renderer);
      const rp = new RenderPass(scene, camera);
      composer.addPass(rp);
      const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2), 0.42, 0.45, 0.93);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      c = { composer, rp, bloom };
      this.composers.set(scene, c);
    }
    c.rp.camera = camera;
    return c;
  }

  render(scene, camera, opts = {}) {
    if (this.bloom && !opts.noPost) {
      const c = this.composerFor(scene, camera);
      if (opts.bloomStrength !== undefined) c.bloom.strength = opts.bloomStrength;
      c.composer.render();
    } else this.renderer.render(scene, camera);
  }
}
