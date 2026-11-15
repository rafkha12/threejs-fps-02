// Bot AI: route followers that hold angles, react to what they see and
// hear, and work the objective. One state machine per bot, driven by the
// fixed step: route -> hold -> engage -> investigate, plus plant / defuse /
// pickup for the spike. Aim error grows with distance, target speed and the
// bot's own movement, and every bot waits out a reaction time before its
// first shot — so a player who stops, aims and peeks first wins duels.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createBody, stepBody, steerToward, groundSpeed } from './physics.js';
import { WEAPON_DEFS, spreadFor } from './weapons.js';
import { weaponState } from './state.js';
import { HOLDS, SITES } from './world.js';

const VISION_RANGE = 28;
const HEAR_RANGE = 22;
const BOT_SPEED = 4.3;

const ALLY_DEFS = [
  { id: 'ember-2', name: 'Ember-2', weapon: 'heron', skill: 0.55 },
  { id: 'ember-3', name: 'Ember-3', weapon: 'wasp', skill: 0.5 },
  { id: 'ember-4', name: 'Ember-4', weapon: 'heron', skill: 0.45 },
];
const FOE_DEFS = [
  { id: 'frost-1', name: 'Frost-1', weapon: 'heron', skill: 0.55 },
  { id: 'frost-2', name: 'Frost-2', weapon: 'wasp', skill: 0.5 },
  { id: 'frost-3', name: 'Frost-3', weapon: 'osprey', skill: 0.6 },
  { id: 'frost-4', name: 'Frost-4', weapon: 'badger', skill: 0.45 },
];

const wish = { x: 0, z: 0 };
const tmp = { x: 0, z: 0 };

function buildBotMesh(scene, team) {
  const teamColor = team === 'ember' ? PALETTE.ember : PALETTE.frost;
  const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a2f38'), roughness: 0.8, metalness: 0.1 });
  const teamMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(teamColor), roughness: 0.5, metalness: 0.2 });
  const skinMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.6, metalness: 0.05 });

  const group = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.16, 0.8, 0.18);
  const legL = new THREE.Mesh(legGeo, suit);
  legL.position.set(-0.11, 0.4, 0);
  const legR = new THREE.Mesh(legGeo, suit);
  legR.position.set(0.11, 0.4, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suit);
  torso.position.y = 1.12;
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.1, 0.32), teamMat);
  stripe.position.y = 1.3;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), skinMat);
  head.position.y = 1.56;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.05), teamMat);
  visor.position.set(0, 1.58, -0.14);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.55), suit);
  gun.position.set(0.2, 1.25, -0.3);
  group.add(legL, legR, torso, stripe, head, visor, gun);
  group.traverse((mesh) => {
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  scene.add(group);
  return { group, torso, head };
}

export function createBots(scene) {
  const bots = [];
  const hitMeshes = [];
  for (const def of ALLY_DEFS) {
    const meshes = buildBotMesh(scene, 'ember');
    const bot = makeBot(def, 'ember', meshes);
    hitMeshes.push(meshes.torso, meshes.head);
    bots.push(bot);
  }
  for (const def of FOE_DEFS) {
    const meshes = buildBotMesh(scene, 'frost');
    const bot = makeBot(def, 'frost', meshes);
    hitMeshes.push(meshes.torso, meshes.head);
    bots.push(bot);
  }
  return { bots, hitMeshes };
}

function makeBot(def, team, meshes) {
  const bot = {
    id: def.id,
    name: def.name,
    team,
    skill: def.skill,
    body: createBody(0, 17, Math.PI),
    health: 100,
    alive: true,
    weaponDef: WEAPON_DEFS[def.weapon],
    weapon: weaponState(def.weapon),
    mode: 'route',
    route: [],
    wpIndex: 0,
    hold: null,
    holdT: 0,
    target: null, // { kind: 'player' | 'bot', ref }
    reactT: 0,
    lastSeenT: -99,
    lastSeenX: 0,
    lastSeenZ: 0,
    blindT: 0,
    alertT: 0,
    deathT: 0,
    fall: 0,
    strafeDir: 1,
    strafeT: 0,
    burstLeft: 0,
    burstPause: 0,
    bloom: 0,
    stuckT: 0,
    stuckX: 0,
    stuckZ: 0,
    detour: null,
    heardUpTo: 0,
    plantT: 0,
    defuseT: 0,
    mesh: meshes.group,
    torsoMesh: meshes.torso,
    headMesh: meshes.head,
  };
  meshes.torso.userData.bot = bot;
  meshes.torso.userData.part = 'torso';
  meshes.head.userData.bot = bot;
  meshes.head.userData.part = 'head';
  return bot;
}

export function resetBot(bot, x, z, yaw, route) {
  bot.body.x = x;
  bot.body.z = z;
  bot.body.y = 0;
  bot.body.vx = 0;
  bot.body.vy = 0;
  bot.body.vz = 0;
  bot.body.yaw = yaw;
  bot.body.pitch = 0;
  bot.health = 100;
  bot.alive = true;
  bot.weapon = weaponState(bot.weapon.id);
  bot.mode = 'route';
  bot.route = route;
  bot.wpIndex = 0;
  bot.hold = null;
  bot.holdT = 0;
  bot.target = null;
  bot.reactT = 0;
  bot.lastSeenT = -99;
  bot.blindT = 0;
  bot.alertT = 0;
  bot.fall = 0;
  bot.burstLeft = 0;
  bot.burstPause = 0;
  bot.bloom = 0;
  bot.stuckT = 0;
  bot.detour = null;
  bot.plantT = 0;
  bot.defuseT = 0;
  bot.mesh.rotation.set(0, yaw, 0);
  bot.mesh.position.set(x, 0, z);
  bot.mesh.visible = true;
}

function forwardOf(body) {
  return { x: -Math.sin(body.yaw), z: -Math.cos(body.yaw) };
}

function canSee(ctx, bot, tx, ty, tz) {
  const dx = tx - bot.body.x;
  const dy = ty - (bot.body.y + bot.body.eye);
  const dz = tz - bot.body.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist > VISION_RANGE) return false;
  const f = forwardOf(bot.body);
  const facing = (dx * f.x + dz * f.z) / (dist || 1);
  if (facing < 0.2 && dist > 3) return false;
  const blocked = ctx.combat.worldHit(bot.body.x, bot.body.y + bot.body.eye, bot.body.z, dx / (dist || 1), dy / (dist || 1), dz / (dist || 1), dist);
  return blocked >= dist - 0.4;
}

function nearestVisibleEnemy(ctx, bot) {
  const state = ctx.state;
  let best = null;
  let bestDist = Infinity;
  const consider = (kind, ref, x, y, z) => {
    const d = Math.hypot(x - bot.body.x, z - bot.body.z);
    if (d >= bestDist) return;
    if (canSee(ctx, bot, x, y, z)) {
      best = { kind, ref, x, y, z, dist: d };
      bestDist = d;
    }
  };
  if (bot.team === 'frost' && state.player.alive) {
    consider('player', null, state.player.body.x, state.player.body.y + 1.2, state.player.body.z);
  }
  for (const other of state.bots) {
    if (other === bot || !other.alive || other.team === bot.team) continue;
    if (other.team === 'ember' && bot.team === 'ember') continue;
    consider('bot', other, other.body.x, other.body.y + 1.2, other.body.z);
  }
  return best;
}

function faceToward(bot, x, z, dt) {
  const want = Math.atan2(-(x - bot.body.x), -(z - bot.body.z));
  let diff = want - bot.body.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  bot.body.yaw += diff * Math.min(1, dt * 8);
}

function moveAlong(ctx, bot, dt, tx, tz, speedScale) {
  const dist = steerToward(bot.body, tx, tz, wish);
  if (dist < 0.05) return true;
  // Stuck detection: barely moving while trying -> sidestep once.
  if (Math.hypot(bot.body.x - bot.stuckX, bot.body.z - bot.stuckZ) < 0.15) {
    bot.stuckT += dt;
    if (bot.stuckT > 1.2 && !bot.detour) {
      bot.detour = { x: bot.body.x - wish.z * 3 * bot.strafeDir, z: bot.body.z + wish.x * 3 * bot.strafeDir };
      bot.strafeDir *= -1;
    }
  } else {
    bot.stuckT = 0;
    bot.stuckX = bot.body.x;
    bot.stuckZ = bot.body.z;
  }
  let gx = tx;
  let gz = tz;
  if (bot.detour) {
    gx = bot.detour.x;
    gz = bot.detour.z;
    steerToward(bot.body, gx, gz, wish);
    if (Math.hypot(gx - bot.body.x, gz - bot.body.z) < 0.5) bot.detour = null;
  }
  faceToward(bot, bot.body.x + wish.x, bot.body.z + wish.z, dt);
  stepBody(ctx.world.colliders, bot.body, dt, wish.x, wish.z, {
    speed: BOT_SPEED * (speedScale ?? 1),
    accel: 30,
    friction: 8,
    wantJump: false,
    wantCrouch: false,
  });
  return dist < 0.6;
}

function startBurst(bot) {
  const def = bot.weaponDef;
  bot.burstLeft = def.kind === 'marksman' ? 1 : 3 + Math.floor(Math.random() * 3);
  bot.burstPause = 0;
}

function botFire(ctx, bot, dt) {
  const def = bot.weaponDef;
  const w = bot.weapon;
  w.cooldown = Math.max(0, w.cooldown - dt);
  if (w.reloadLeft > 0) {
    w.reloadLeft = Math.max(0, w.reloadLeft - dt);
    if (w.reloadLeft === 0) {
      const need = def.mag - w.mag;
      const take = Math.min(need, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    return;
  }
  if (bot.burstPause > 0) {
    bot.burstPause -= dt;
    return;
  }
  if (bot.burstLeft <= 0) {
    if (w.mag === 0) {
      if (w.reserve > 0) w.reloadLeft = def.reload;
      return;
    }
    startBurst(bot);
    return;
  }
  if (w.cooldown > 0 || w.mag <= 0) return;
  const target = bot.target;
  if (!target) return;
  const t = target.kind === 'player' ? ctx.state.player.body : target.ref.body;
  const tx = t.x;
  const ty = t.y + 1.15;
  const tz = t.z;
  const dist = Math.hypot(tx - bot.body.x, tz - bot.body.z);
  const targetSpeed = target.kind === 'player' ? groundSpeed(ctx.state.player.body) : groundSpeed(t);
  const ownSpeed = groundSpeed(bot.body);
  const spread = spreadFor(def, ownSpeed, bot.bloom)
    + dist * 0.0009
    + (targetSpeed > 1 ? 0.008 : 0)
    + (1 - bot.skill) * 0.012;
  w.mag -= 1;
  w.cooldown = def.gap;
  bot.burstLeft -= 1;
  bot.bloom = Math.min(0.03, bot.bloom + def.spreadBloom);
  if (bot.burstLeft === 0) bot.burstPause = 0.45 + Math.random() * 0.5;
  const muzzleY = bot.body.y + bot.body.eye - 0.15;
  if (target.kind === 'player') {
    ctx.combat.botShotAtPlayer(ctx.state, bot, def, spread, ctx.hooks);
    ctx.hooks.distantShot();
  } else {
    const dx = tx - bot.body.x;
    const dy = ty - muzzleY;
    const dz = tz - bot.body.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const sx = dx / len + (Math.random() * 2 - 1) * spread;
    const sy = dy / len + (Math.random() * 2 - 1) * spread;
    const sz = dz / len + (Math.random() * 2 - 1) * spread;
    ctx.combat.hitscan(ctx.state, bot.name, bot.body.x, muzzleY, bot.body.z, sx, sy, sz, def, ctx.hooks);
    ctx.hooks.distantShot();
  }
  ctx.hooks.muzzleAt(bot);
  logNoise(ctx, bot.body.x, bot.body.z);
}

function logNoise(ctx, x, z) {
  ctx.state.events.push({ kind: 'shot', x, z, t: ctx.state.time, text: '' });
  if (ctx.state.events.length > 48) ctx.state.events.splice(0, ctx.state.events.length - 48);
}

function hear(ctx, bot) {
  const state = ctx.state;
  for (const e of state.events) {
    if (e.t <= bot.heardUpTo || (e.kind !== 'shot' && e.kind !== 'noise')) continue;
    const d = Math.hypot(e.x - bot.body.x, e.z - bot.body.z);
    if (d < HEAR_RANGE && bot.mode !== 'engage' && bot.mode !== 'defuse' && bot.mode !== 'plant') {
      bot.mode = 'investigate';
      bot.route = [[e.x, e.z]];
      bot.wpIndex = 0;
      bot.holdT = 0;
    }
  }
  bot.heardUpTo = state.time;
}

function stepBot(ctx, bot, dt) {
  const state = ctx.state;
  if (!bot.alive) {
    bot.fall = Math.min(1, bot.fall + dt / 0.4);
    return;
  }
  bot.blindT = Math.max(0, bot.blindT - dt);
  bot.bloom = Math.max(0, bot.bloom - dt * 0.02);
  bot.weapon.cooldown = Math.max(0, bot.weapon.cooldown - dt);

  if (bot.blindT > 0) {
    stepBody(ctx.world.colliders, bot.body, dt, 0, 0, { speed: BOT_SPEED, accel: 30, friction: 8, wantJump: false, wantCrouch: false });
    return;
  }

  // Vision is checked before any objective move: a bot that can see an
  // enemy fights first, and a defusing bot aborts when one appears.
  const seenNow = nearestVisibleEnemy(ctx, bot);
  if (seenNow && bot.mode === 'defuse') {
    bot.mode = 'engage';
    bot.defuseT = 0;
  }

  // Objective overrides: spike carrier plants, defenders defuse, allies
  // fetch a dropped spike. Each yields to a visible enemy (seenNow).
  const spike = state.spike;
  if (!seenNow && bot.team === 'ember' && spike.state === 'dropped') {
    const d = Math.hypot(spike.x - bot.body.x, spike.z - bot.body.z);
    const nearest = state.bots.filter((b) => b.alive && b.team === 'ember')
      .reduce((best, b) => {
        const bd = Math.hypot(spike.x - b.body.x, spike.z - b.body.z);
        return bd < best.d ? { b, d: bd } : best;
      }, { b: null, d: Infinity });
    if (nearest.b === bot) {
      if (d < 0.9) {
        spike.state = 'carried';
        spike.carrier = bot.id;
        bot.mode = 'route';
        const site = nearestSite(spike, bot);
        bot.route = [[bot.body.x, bot.body.z], [site.x, site.z]];
        bot.wpIndex = 0;
      } else {
        moveAlong(ctx, bot, dt, spike.x, spike.z, 1);
        return;
      }
    }
  }
  if (bot.team === 'ember' && spike.state === 'carried' && spike.carrier === bot.id && bot.mode !== 'plant') {
    const site = SITES[spike.site ?? nearestSiteKey(bot)];
    const d = Math.hypot(site.x - bot.body.x, site.z - bot.body.z);
    if (d < 2) {
      bot.mode = 'plant';
      bot.plantT = 0;
    }
  }
  if (bot.mode === 'plant' && !seenNow) {
    bot.plantT += dt;
    if (Math.floor(bot.plantT * 2) !== Math.floor((bot.plantT - dt) * 2)) ctx.hooks.plantBeep();
    if (bot.plantT >= 4) {
      spike.state = 'planted';
      spike.timer = 35;
      spike.site = spike.site ?? nearestSiteKey(bot);
      bot.mode = 'hold';
      bot.hold = { x: bot.body.x, z: bot.body.z, fx: SITES[spike.site].x, fz: SITES[spike.site].z };
    }
    return;
  }
  if (!seenNow && bot.team === 'frost' && spike.state === 'planted') {
    const d = Math.hypot(spike.x - bot.body.x, spike.z - bot.body.z);
    const nearEmber = state.player.alive && Math.hypot(spike.x - state.player.body.x, spike.z - state.player.body.z) < 14
      || state.bots.some((b) => b.alive && b.team === 'ember' && Math.hypot(spike.x - b.body.x, spike.z - b.body.z) < 14);
    if (bot.mode !== 'defuse' && d < 2.2 && !nearEmber) {
      bot.mode = 'defuse';
      bot.defuseT = 0;
    } else if (bot.mode !== 'defuse' && d > 2.2) {
      moveAlong(ctx, bot, dt, spike.x, spike.z, 1);
      return;
    }
    if (bot.mode === 'defuse') {
      if (nearEmber) {
        bot.mode = 'engage';
        bot.defuseT = 0;
      } else {
        bot.defuseT += dt;
        if (Math.floor(bot.defuseT * 2) !== Math.floor((bot.defuseT - dt) * 2)) ctx.hooks.defuseBeep();
        if (bot.defuseT >= 5) {
          spike.state = 'defused';
          bot.mode = 'hold';
        }
        return;
      }
    }
  }

  hear(ctx, bot);

  // Vision: acquire or drop the target.
  const seen = seenNow;
  if (seen) {
    if (!bot.target) bot.reactT = state.time + 0.35 + (1 - bot.skill) * 0.45 + Math.random() * 0.2;
    bot.target = seen;
    bot.lastSeenT = state.time;
    bot.lastSeenX = seen.x;
    bot.lastSeenZ = seen.z;
    if (bot.mode !== 'engage') bot.mode = 'engage';
  } else if (bot.target && state.time - bot.lastSeenT > 2.5) {
    bot.target = null;
    if (bot.mode === 'engage') {
      bot.mode = 'investigate';
      bot.route = [[bot.lastSeenX, bot.lastSeenZ]];
      bot.wpIndex = 0;
      bot.holdT = 0;
    }
  }

  if (bot.mode === 'engage' && bot.target) {
    const t = bot.target.kind === 'player' ? state.player.body : bot.target.ref.body;
    faceToward(bot, t.x, t.z, dt);
    // Strafe and keep a fighting distance; never stand still in the open.
    bot.strafeT -= dt;
    if (bot.strafeT <= 0) {
      bot.strafeDir *= -1;
      bot.strafeT = 0.7 + Math.random() * 0.7;
    }
    const dist = Math.hypot(t.x - bot.body.x, t.z - bot.body.z);
    const f = forwardOf(bot.body);
    let mx = f.x * (dist > 16 ? 1 : dist < 4 ? -0.7 : 0);
    let mz = f.z * (dist > 16 ? 1 : dist < 4 ? -0.7 : 0);
    mx += -f.z * bot.strafeDir * 0.8;
    mz += f.x * bot.strafeDir * 0.8;
    const len = Math.hypot(mx, mz) || 1;
    stepBody(ctx.world.colliders, bot.body, dt, mx / len, mz / len, {
      speed: BOT_SPEED * 0.6, accel: 30, friction: 8, wantJump: false, wantCrouch: false,
    });
    if (state.time >= bot.reactT) botFire(ctx, bot, dt);
    return;
  }

  if (bot.mode === 'route') {
    const wp = bot.route[bot.wpIndex];
    if (!wp) {
      bot.mode = 'hold';
      bot.holdT = 0;
      pickHold(bot);
      return;
    }
    if (moveAlong(ctx, bot, dt, wp[0], wp[1], 1)) bot.wpIndex += 1;
    return;
  }

  if (bot.mode === 'investigate') {
    const wp = bot.route[bot.wpIndex];
    if (!wp) {
      bot.holdT += dt;
      if (bot.holdT > 2.5) {
        bot.mode = 'hold';
        bot.holdT = 0;
        pickHold(bot);
      }
      return;
    }
    if (moveAlong(ctx, bot, dt, wp[0], wp[1], 1)) bot.wpIndex += 1;
    return;
  }

  // Hold: stand the angle, scan slowly, shuffle position a little.
  if (bot.hold) faceToward(bot, bot.hold.fx, bot.hold.fz, dt * 0.4);
  bot.holdT += dt;
  if (bot.holdT > 6 && bot.team === 'frost') {
    bot.holdT = 0;
    pickHold(bot);
  }
}

function pickHold(bot) {
  const pool = bot.team === 'frost'
    ? (bot.id === 'frost-1' || bot.id === 'frost-2' ? HOLDS.A : bot.id === 'frost-3' ? HOLDS.B : HOLDS.MID)
    : HOLDS.MID;
  const spot = pool[Math.floor(Math.random() * pool.length)];
  bot.hold = { x: spot[0], z: spot[1], fx: spot[2], fz: spot[3] };
}

function nearestSite(spike, bot) {
  const dA = Math.hypot(SITES.A.x - bot.body.x, SITES.A.z - bot.body.z);
  const dB = Math.hypot(SITES.B.x - bot.body.x, SITES.B.z - bot.body.z);
  return dA < dB ? SITES.A : SITES.B;
}

function nearestSiteKey(bot) {
  return nearestSite(null, bot) === SITES.A ? 'A' : 'B';
}

export function stepBots(ctx, dt) {
  for (const bot of ctx.state.bots) stepBot(ctx, bot, dt);
}

// Sync every bot's mesh to its body. Called from the render loop, not the sim.
export function syncBotMeshes(state) {
  for (const bot of state.bots) {
    bot.mesh.position.set(bot.body.x, bot.body.y, bot.body.z);
    bot.mesh.rotation.y = bot.body.yaw;
    if (!bot.alive) {
      bot.mesh.rotation.x = -bot.fall * 1.45;
      bot.mesh.position.y = -bot.fall * 0.08;
    } else {
      bot.mesh.rotation.x = 0;
    }
    bot.mesh.visible = true;
  }
}
