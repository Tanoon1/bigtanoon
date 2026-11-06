import crypto from 'node:crypto';
import { CODE_ALPHABET, CODE_LENGTH } from '../shared/constants.js';

export const now = () => Date.now();
export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function makeCode(existing) {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    const bytes = crypto.randomBytes(CODE_LENGTH);
    for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    if (!existing.has(c)) return c;
  }
  throw new Error('no codes left');
}

export const makeToken = () => crypto.randomBytes(18).toString('base64url');
let idc = 0;
export const makeId = () => (++idc).toString(36) + crypto.randomBytes(2).toString('hex');

// Strip control chars, bidi overrides, angle brackets; trim & limit
const BAD = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩<>]/g;
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  return s.replace(BAD, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

// Token bucket rate limiter
export class Bucket {
  constructor(rate, burst) {
    this.rate = rate; this.burst = burst; this.tokens = burst; this.t = now();
  }
  take(n = 1) {
    const t = now();
    this.tokens = Math.min(this.burst, this.tokens + ((t - this.t) / 1000) * this.rate);
    this.t = t;
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
}

export function dist2(a, b) {
  const dx = a.x - b.x, dz = a.z - b.z;
  return dx * dx + dz * dz;
}
