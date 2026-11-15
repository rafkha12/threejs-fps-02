// Boot and the one loop: a fixed 60 Hz simulation (sim.js) feeding a render
// at the display's rate. ?shot=cover|buy|plant|win with &seed=N sets up a
// deterministic frame for a capture, renders it twice, then freezes it and
// sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createEffects } from './effects.js';
import { createHud } from './hud.js';
import { createState, weaponState } from './state.js';
import { createCombat } from './combat.js';
import { createBots, syncBotMeshes } from './bots.js';
import { createSim } from './sim.js';
import { startMatch, buy } from './rounds.js';
import { sfx, ensureAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const world = createWorld(scene);
const state = createState();
const player = createPlayer(world.colliders, 0, 17);
state.player.body = player.body;
state.player.weaponStates = { sparrow: weaponState('sparrow') };
const { bots, hitMeshes } = createBots(scene);
state.bots = bots;
const combat = createCombat(world);
combat.setBotMeshes(hitMeshes);
const effects = createEffects(scene, camera);
const hud = createHud((item) => {
  if (buy(state, item)) sfx.buy();
});
const input = createInput(renderer.domElement, onLockChange);

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const hooks = {
  tracer(a, b) {
    tmpA.set(a.x, a.y, a.z);
    tmpB.set(b.x, b.y, b.z);
    effects.tracer(tmpA, tmpB);
  },
  sparks(point, count) {
    tmpA.set(point.x, point.y, point.z);
    effects.sparksAt(tmpA, count);
  },
  explosion(at, radius) {
    tmpA.set(at.x, at.y, at.z);
    effects.explosion(tmpA, radius);
    sfx.explosion();
  },
  flash() {
    sfx.plantBeep();
  },
  muzzleAt() {},
  hit(headshot) {
    hud.hitMarker(false);
    sfx.hit();
    void headshot;
  },
  kill() {
    hud.hitMarker(true);
    sfx.kill();
  },
  hurt() {
    hud.damageFlash();
    sfx.hurt();
  },
  plantBeep() {
    sfx.plantBeep();
  },
  defuseBeep() {
    sfx.defuseBeep();
  },
  distantShot() {
    sfx.distantShot();
  },
};

let buyOpen = false;
const sim = createSim({
  state, world, combat, effects, hud, input, player, hooks,
  toggleBuy() {
    buyOpen = !buyOpen;
    if (buyOpen) hud.showBuy(state.money, state.player.weapons);
    else hud.hideBuy();
  },
});

startMatch(state);
window.__state = state;

hud.onPlay(() => {
  if (shot) return;
  ensureAudio();
  if (state.phase === 'matchEnd') {
    startMatch(state);
    hud.hideOverlay();
  }
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    buyOpen = false;
    hud.hideBuy();
    hud.hideOverlay();
  } else if (state.phase === 'buy') {
    // Freeze time: the buy menu is the UI, not the pause panel.
    hud.hideOverlay();
  } else if (state.phase === 'matchEnd') {
    hud.showMatchEnd(state.matchWinner, state.wins.ember, state.wins.frost);
  } else if (!state.player.alive && state.phase === 'live') {
    hud.showOverlay('dead');
  } else {
    hud.showOverlay('paused');
  }
}

const body = state.player.body;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();

function syncCamera() {
  if (state.player.alive) {
    camera.position.set(body.x, body.y + body.eye, body.z);
    camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
    return;
  }
  // Spectate the first living ally; if none, hold the death view.
  const ally = state.bots.find((b) => b.team === 'ember' && b.alive);
  if (ally) {
    camera.position.set(ally.body.x, ally.body.y + ally.body.eye, ally.body.z);
    camera.rotation.set(ally.body.pitch, ally.body.yaw, 0, 'YXZ');
  }
}

function aimAt(point) {
  const dx = point.x - body.x;
  const dy = point.y - (body.y + body.eye);
  const dz = point.z - body.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shootAt(point) {
  const { def, w } = sim.currentWeapon();
  if (w.mag <= 0) return;
  camera.getWorldDirection(tmpA);
  const ox = body.x;
  const oy = body.y + body.eye;
  const oz = body.z;
  const dx = point.x - ox;
  const dy = point.y - oy;
  const dz = point.z - oz;
  const len = Math.hypot(dx, dy, dz) || 1;
  for (let p = 0; p < def.pellets; p += 1) {
    combat.hitscan(state, 'You', ox, oy, oz, dx / len, dy / len, dz / len, def, hooks);
  }
  w.mag -= 1;
  effects.muzzle();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    if (state.player.alive) player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      sim.step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    // Buy menu follows the phase: shown during freeze time, hidden live.
    if (state.phase === 'buy' && !buyOpen && !input.state.locked) {
      buyOpen = true;
      hud.showBuy(state.money, state.player.weapons);
    } else if (state.phase !== 'buy' && buyOpen) {
      buyOpen = false;
      hud.hideBuy();
    }
    if (state.phase === 'buy' && input.state.locked) input.releaseLock();
    syncCamera();
    syncBotMeshes(state);
    effects.step(dt);
    world.glowA.intensity = 13 + Math.sin(state.time * 7) * 2.5;
    const plantedSite = state.spike.state === 'planted' ? state.spike.site : null;
    for (const key of ['A', 'B']) {
      const ring = world.siteMeshes[key].ring;
      ring.material.opacity = key === plantedSite ? 0.85 : 0.4 + Math.sin(state.time * 2) * 0.12;
    }
    effects.setBeacon(
      state.spike.x, state.spike.z,
      state.spike.state === 'planted',
      Math.sin(state.time * 4) * 0.5 + 0.5,
    );
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let i = 0; i < steps; i += 1) sim.step(FIXED_STEP);
}

function nearestFrostBot() {
  let best = null;
  let bestD = Infinity;
  for (const b of state.bots) {
    if (b.team !== 'frost' || !b.alive) continue;
    const d = Math.hypot(b.body.x - body.x, b.body.z - body.z);
    if (d < bestD) {
      best = b;
      bestD = d;
    }
  }
  return best;
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  if (name === 'cover') {
    // Live mid-fight: player in mid lane, bots spread, one duel in frame.
    state.phase = 'live';
    state.phaseT = 0;
    state.roundTime = 88;
    state.wins.ember = 1;
    state.wins.frost = 0;
    state.round = 2;
    body.x = 0;
    body.z = 10;
    body.y = 0;
    settle(60);
    const foe = nearestFrostBot();
    if (foe) {
      aimAt({ x: foe.body.x, y: foe.body.y + 1.2, z: foe.body.z });
      shootAt({ x: foe.body.x, y: foe.body.y + 1.2, z: foe.body.z });
      settle(6);
    }
    hud.hideBanner();
    if (foe) shootAt({ x: foe.body.x, y: foe.body.y + 1.0, z: foe.body.z });
    settle(1);
  } else if (name === 'buy') {
    state.phase = 'buy';
    state.phaseT = 6;
    state.money = 4100;
    buy(state, 'heron');
    buy(state, 'frag');
    body.x = 0;
    body.z = 17;
    body.yaw = 0;
    body.pitch = 0;
    settle(10);
    hud.showBuy(state.money, state.player.weapons);
    sim.pushHud();
  } else if (name === 'plant') {
    state.phase = 'live';
    state.roundTime = 40;
    state.wins.ember = 2;
    state.wins.frost = 1;
    state.round = 4;
    state.spike.state = 'planted';
    state.spike.site = 'A';
    state.spike.x = SITES.A.x;
    state.spike.z = SITES.A.z;
    state.spike.timer = 22;
    body.x = -9;
    body.z = -6;
    body.y = 0;
    settle(30);
    const foe = nearestFrostBot();
    if (foe) {
      aimAt({ x: foe.body.x, y: foe.body.y + 1.2, z: foe.body.z });
      shootAt({ x: foe.body.x, y: foe.body.y + 1.2, z: foe.body.z });
    }
    settle(8);
    hud.banner('SPIKE PLANTED', 'Detonation in 22 s — hold Furnace.', 60000);
    sim.pushHud();
  } else if (name === 'win') {
    state.phase = 'roundEnd';
    state.phaseT = 1;
    state.roundWinner = 'ember';
    state.roundReason = 'Enemy team eliminated';
    state.wins.ember = 3;
    state.wins.frost = 1;
    state.round = 5;
    body.x = 2;
    body.z = 4;
    body.y = 0;
    settle(20);
    aimAt({ x: 0, y: 1.5, z: -8 });
    hud.banner('ROUND WON', 'Enemy team eliminated', 60000);
    sim.pushHud();
  }
  syncCamera();
  syncBotMeshes(state);
  sim.pushHud();
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    syncBotMeshes(state);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
if (shot) runShot(shot);
else requestAnimationFrame(frame);
