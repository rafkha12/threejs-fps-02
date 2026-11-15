// One movement implementation for the player and every bot: acceleration,
// friction, gravity, jump, crouch, resolved as a box against the world's
// colliders one axis at a time, so a wall never swallows a body. A single
// reused Box3 probe means the hot loop allocates nothing.
import * as THREE from 'three';

const RADIUS = 0.34;
const STAND_HEIGHT = 1.72;
const CROUCH_HEIGHT = 1.12;
const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const GRAVITY = 20;
const JUMP_SPEED = 6.2;

const probe = new THREE.Box3();

export function createBody(x, z, yaw) {
  return {
    x, y: 0, z,
    vx: 0, vy: 0, vz: 0,
    yaw: yaw ?? 0,
    pitch: 0,
    eye: STAND_EYE,
    height: STAND_HEIGHT,
    crouching: false,
    onGround: true,
  };
}

export function eyeHeight(body) {
  return body.y + body.eye;
}

function overlaps(colliders, x, y, z, height, lift) {
  probe.min.set(x - RADIUS, y + lift, z - RADIUS);
  probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
  for (let i = 0; i < colliders.length; i += 1) {
    if (probe.intersectsBox(colliders[i])) return colliders[i];
  }
  return null;
}

// wishX/wishZ is a unit (or zero) world-space direction. opts: speed,
// accel, friction, allowJump, wantJump, wantCrouch.
export function stepBody(colliders, body, dt, wishX, wishZ, opts) {
  const crouching = opts.wantCrouch === true;
  if (crouching && !body.crouching) {
    body.crouching = true;
    body.height = CROUCH_HEIGHT;
  } else if (!crouching && body.crouching && !overlaps(colliders, body.x, body.y, body.z, STAND_HEIGHT, 0.02)) {
    body.crouching = false;
    body.height = STAND_HEIGHT;
  }
  const eyeTarget = body.crouching ? CROUCH_EYE : STAND_EYE;
  body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 12);

  const speed = body.crouching ? opts.speed * 0.46 : opts.speed;
  const blend = Math.min(1, (body.onGround ? opts.accel : opts.accel * 0.22) * dt / speed);
  body.vx += (wishX * speed - body.vx) * blend;
  body.vz += (wishZ * speed - body.vz) * blend;
  if (body.onGround && wishX === 0 && wishZ === 0) {
    const damp = Math.max(0, 1 - opts.friction * dt);
    body.vx *= damp;
    body.vz *= damp;
  }

  if (opts.wantJump && body.onGround) {
    body.vy = JUMP_SPEED;
    body.onGround = false;
  }
  body.vy -= GRAVITY * dt;

  const nextX = body.x + body.vx * dt;
  if (!overlaps(colliders, nextX, body.y, body.z, body.height, 0.04)) body.x = nextX;
  else body.vx = 0;
  const nextZ = body.z + body.vz * dt;
  if (!overlaps(colliders, body.x, body.y, nextZ, body.height, 0.04)) body.z = nextZ;
  else body.vz = 0;

  body.y += body.vy * dt;
  body.onGround = false;
  const hit = overlaps(colliders, body.x, body.y, body.z, body.height, 0);
  if (hit && body.vy <= 0) {
    body.y = hit.max.y;
    body.vy = 0;
    body.onGround = true;
  } else if (hit) {
    body.y = hit.min.y - body.height;
    body.vy = 0;
  }
  if (body.y < 0) {
    body.y = 0;
    body.vy = 0;
    body.onGround = true;
  }
  if (body.vy < -30) body.vy = -30;
}

export function groundSpeed(body) {
  return Math.hypot(body.vx, body.vz);
}

// Steer a body toward a target point: returns wishX/wishZ in world space.
export function steerToward(body, tx, tz, out) {
  const dx = tx - body.x;
  const dz = tz - body.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.05) {
    out.x = 0;
    out.z = 0;
    return 0;
  }
  out.x = dx / len;
  out.z = dz / len;
  return len;
}
