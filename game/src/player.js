// The human player: look, recoil and movement through the shared physics.
// Walk (Shift) is slower and quieter and steadies aim; sprint does not
// exist — this game rewards stopping to aim, not running and gunning.
import { createBody, stepBody, groundSpeed } from './physics.js';

const WALK_SPEED = 5.2;
const SHIFT_SPEED = 2.6;
const ACCEL = 42;
const FRICTION = 9;

export function createPlayer(colliders, x, z) {
  const body = createBody(x, z, 0);
  // Face north (yaw 0: forward is -z, toward the sites) at spawn.
  body.yaw = 0;

  function look(dx, dy, sensitivity = 0.0021) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function step(dt, keys) {
    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    let wishX = 0;
    let wishZ = 0;
    if (forward !== 0 || strafe !== 0) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      const fx = -sin * forward + cos * strafe;
      const fz = -cos * forward - sin * strafe;
      const len = Math.hypot(fx, fz) || 1;
      wishX = fx / len;
      wishZ = fz / len;
    }
    const walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    stepBody(colliders, body, dt, wishX, wishZ, {
      speed: walking ? SHIFT_SPEED : WALK_SPEED,
      accel: ACCEL,
      friction: FRICTION,
      wantJump: keys.has('Space'),
      wantCrouch: keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC'),
    });
    return walking;
  }

  return {
    body,
    step,
    look,
    recoil,
    groundSpeed() {
      return groundSpeed(body);
    },
  };
}
