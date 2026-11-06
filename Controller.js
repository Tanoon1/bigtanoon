// First-person controller (client prediction with shared physics, server-validated)
import * as THREE from 'three';
import { MOVE, FLAG } from '../../../shared/constants.js';
import { stepCharacter, inWater, clampBounds } from '../../../shared/physics.js';
import { audio } from '../audio/Audio.js';

export class Controller {
  constructor(camera, net) {
    this.camera = camera;
    this.net = net;
    this.s = { x: 0, y: 0, z: 0, vy: 0, onGround: true };
    this.yaw = 0;
    this.pitch = 0;
    this.stamina = MOVE.STAMINA_MAX;
    this.tp = 0;
    this.mode = 'hg'; // hg | ghost | none
    this.crouch = false;
    this.sit = null;
    this.sleep = false;
    this.knock = { x: 0, z: 0 };
    this.tumbleT = 0;
    this.sendAcc = 0;
    this.bob = 0;
    this.stepAcc = 0;
    this.speedMul = 1;
    this.noRun = false;
    this.frozen = false;
    this.moving = 0;
    this.camRoll = 0;
    this.landDip = 0;
  }

  setPos(p, tp, yaw) {
    this.s.x = p[0]; this.s.y = p[1]; this.s.z = p[2]; this.s.vy = 0;
    if (tp !== undefined) this.tp = tp;
    if (yaw !== undefined && yaw !== null) this.yaw = yaw;
    this.sit = null; this.sleep = false;
  }
  sitAt(seat, yaw) {
    this.s.x = seat.x; this.s.z = seat.z; this.s.y = seat.y ?? this.s.y; this.s.vy = 0;
    this.sit = seat;
    if (yaw !== undefined) this.yaw = yaw;
  }
  lieAt(bed) { this.s.x = bed.x; this.s.z = bed.z; this.s.y = 0.55; this.sleep = true; this.sit = bed; }
  standUp() { if (this.sit || this.sleep) { this.sit = null; this.sleep = false; this.net.send({ t: 'stand' }); } }

  applyKnock(vx, vz, fall) {
    this.knock.x += vx; this.knock.z += vz;
    this.standUp();
    if (fall) this.tumbleT = 1.6;
    this.s.vy = Math.max(this.s.vy, fall ? 3.2 : 1.6);
    this.s.onGround = false;
  }

  update(dt, input, colliders) {
    const look = input.consumeLook();
    this.yaw -= look.dx;
    this.pitch = THREE.MathUtils.clamp(this.pitch - look.dy, -1.45, 1.45);
    if (this.mode === 'none') return;
    const ax = input.axes();
    const tumbling = this.tumbleT > 0;
    if (tumbling) this.tumbleT -= dt;
    let mx = this.frozen || tumbling ? 0 : ax.x, my = this.frozen || tumbling ? 0 : ax.y;
    if ((mx || my || ax.jump) && (this.sit || this.sleep) && !this.frozen) this.standUp();
    if (this.sit || this.sleep) { mx = 0; my = 0; }
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    let dirx = fx * my + rx * mx, dirz = fz * my + rz * mx;

    if (this.mode === 'ghost') {
      const sp = MOVE.GHOST * (ax.run ? 1.8 : 1);
      const up = (ax.up ? 1 : 0) - (ax.down ? 1 : 0);
      this.s.x += dirx * sp * dt; this.s.z += dirz * sp * dt;
      this.s.y = THREE.MathUtils.clamp(this.s.y + up * sp * dt * 0.7, -0.5, 8);
      clampBounds(this.s);
      this.updateCamera(dt, 0);
      this.sendMove(dt, 0);
      return;
    }

    this.crouch = ax.crouch && !this.sit;
    const water = inWater(this.s.x, this.s.z) && this.s.y < -0.2;
    let speed = water ? MOVE.SWIM : this.crouch ? MOVE.CROUCH : MOVE.WALK;
    const wantsRun = ax.run && !this.crouch && !water && !this.noRun && len > 0.1;
    if (wantsRun && this.stamina > 2) { speed = MOVE.RUN; this.stamina = Math.max(0, this.stamina - MOVE.STAMINA_DRAIN * dt); this.running = true; }
    else { this.running = false; this.stamina = Math.min(MOVE.STAMINA_MAX, this.stamina + MOVE.STAMINA_REGEN * dt * (len > 0.1 ? 0.6 : 1)); }
    speed *= this.speedMul;
    let dx = dirx * speed * Math.min(1, len) * dt, dz = dirz * speed * Math.min(1, len) * dt;
    // knockback impulse
    dx += this.knock.x * dt; dz += this.knock.z * dt;
    const kd = Math.exp(-dt * 4);
    this.knock.x *= kd; this.knock.z *= kd;
    if (Math.abs(this.knock.x) < 0.05) this.knock.x = 0;
    if (Math.abs(this.knock.z) < 0.05) this.knock.z = 0;
    const wasGround = this.s.onGround;
    const vyBefore = this.s.vy;
    if (!this.sit && !this.sleep) stepCharacter(this.s, dx, dz, ax.jump && !this.frozen && !tumbling, dt, colliders);
    if (!wasGround && this.s.onGround && vyBefore < -4) { this.landDip = Math.min(0.2, -vyBefore * 0.02); audio.sfx('footstep', null, 1.5); }
    this.moving = Math.min(1, len) * (this.sit ? 0 : 1);
    // footsteps
    if (this.s.onGround && this.moving > 0.2 && !water) {
      this.stepAcc += dt * speed;
      if (this.stepAcc > 1.7) { this.stepAcc = 0; audio.sfx('footstep', null, this.running ? 1 : 0.6); }
    }
    this.updateCamera(dt, speed * this.moving);
    this.sendMove(dt);
  }

  eyeHeight() {
    if (this.sleep) return 0.35;
    if (this.sit) return 1.02;
    if (inWater(this.s.x, this.s.z) && this.s.y < -0.2) return 1.35;
    return this.crouch ? MOVE.EYE_CROUCH : MOVE.EYE;
  }

  updateCamera(dt, speed) {
    this.eye = THREE.MathUtils.lerp(this.eye ?? MOVE.EYE, this.eyeHeight(), Math.min(1, dt * 10));
    this.bob += dt * speed * 1.9;
    const bobY = this.mode === 'ghost' ? 0 : Math.sin(this.bob * 2) * 0.035 * Math.min(1, speed / 3);
    this.landDip = Math.max(0, this.landDip - dt * 0.8);
    const c = this.camera;
    c.position.set(this.s.x, this.s.y + this.eye + bobY - this.landDip, this.s.z);
    const roll = this.tumbleT > 0 ? Math.sin(this.tumbleT * 6) * 0.35 * Math.min(1, this.tumbleT) : 0;
    this.camRoll = THREE.MathUtils.lerp(this.camRoll, roll, Math.min(1, dt * 8));
    const pitch = this.sleep ? 1.25 : this.tumbleT > 0.3 ? this.pitch + Math.sin(this.tumbleT * 4) * 0.4 : this.pitch;
    c.rotation.set(pitch, this.yaw, this.camRoll, 'YXZ');
  }

  flags() {
    let f = 0;
    if (this.crouch) f |= FLAG.CROUCH;
    if (this.running) f |= FLAG.RUN;
    if (this.sit) f |= FLAG.SIT;
    if (this.sleep) f |= FLAG.SLEEP;
    if (inWater(this.s.x, this.s.z) && this.s.y < -0.2) f |= FLAG.SWIM;
    if (!this.s.onGround) f |= FLAG.AIR;
    return f;
  }

  sendMove(dt) {
    this.sendAcc += dt;
    if (this.sendAcc < 1 / MOVE.SEND_HZ) return;
    this.sendAcc = 0;
    const r = (v) => Math.round(v * 1000) / 1000;
    this.net.send({ t: 'move', p: [r(this.s.x), r(this.s.y), r(this.s.z)], yaw: r(this.yaw), pitch: r(this.pitch), f: this.flags(), tp: this.tp });
  }

  forward() { return new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); }
}
