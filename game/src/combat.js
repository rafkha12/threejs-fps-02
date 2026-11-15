// Firing, damage and grenades. One reused raycaster, no per-shot
// allocation beyond the result array three.js reuses internally. Hits are
// checked against real bodies: a head mesh takes headshot damage, a torso
// mesh body damage, and a wall in between stops the bullet. Bots shooting
// the player use the same world raycast for line of sight.
import * as THREE from 'three';
import { damageAtRange, GRENADE_DEFS } from './weapons.js';
import { logEvent, logKill } from './state.js';

const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const dir = new THREE.Vector3();
const hitPoint = new THREE.Vector3();
const probe = new THREE.Box3();

export function createCombat(world) {
  // World meshes plus bot body meshes, set once bots exist.
  let shootables = world.shootables.slice();
  let botHitMeshes = [];

  function worldHit(ox, oy, oz, dx, dy, dz, maxDist) {
    origin.set(ox, oy, oz);
    dir.set(dx, dy, dz);
    raycaster.set(origin, dir);
    raycaster.far = maxDist;
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return hit ? hit.distance : Infinity;
  }

  // A hitscan shot from a bot at the player. Returns 'hit' | 'head' | 'miss'.
  function botShotAtPlayer(state, bot, def, spread, hooks) {
    const p = state.player.body;
    const chestY = p.y + p.eye - 0.25;
    const dx = p.x - bot.body.x;
    const dy = chestY - (bot.body.y + bot.body.eye - 0.15);
    const dz = p.z - bot.body.z;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const sx = dx / dist + (Math.random() * 2 - 1) * spread;
    const sy = dy / dist + (Math.random() * 2 - 1) * spread;
    const sz = dz / dist + (Math.random() * 2 - 1) * spread;
    const blocked = worldHit(bot.body.x, bot.body.y + bot.body.eye - 0.15, bot.body.z, sx, sy, sz, dist);
    const muzzle = { x: bot.body.x, y: bot.body.y + 1.35, z: bot.body.z };
    const end = { x: bot.body.x + sx * Math.min(dist, def.range), y: bot.body.y + 1.35 + sy * Math.min(dist, def.range), z: bot.body.z + sz * Math.min(dist, def.range) };
    hooks.tracer(muzzle, blocked === Infinity ? end : { x: bot.body.x + sx * blocked, y: bot.body.y + 1.35 + sy * blocked, z: bot.body.z + sz * blocked });
    if (blocked < dist - 0.4) return 'miss';
    const headshot = Math.random() < 0.1;
    const amount = damageAtRange(def, dist, headshot);
    damagePlayer(state, amount, bot.name, headshot, hooks);
    return headshot ? 'head' : 'hit';
  }

  // A hitscan shot from the player (or an ally bot) at the world and bots.
  function hitscan(state, shooterName, ox, oy, oz, dx, dy, dz, def, hooks) {
    origin.set(ox, oy, oz);
    dir.set(dx, dy, dz).normalize();
    raycaster.set(origin, dir);
    raycaster.far = def.range + 20;
    const hits = raycaster.intersectObjects(shootables, false);
    const endDist = def.range;
    let endX = ox + dir.x * endDist;
    let endY = oy + dir.y * endDist;
    let endZ = oz + dir.z * endDist;
    let result = 'miss';
    if (hits.length > 0) {
      const hit = hits[0];
      endX = hit.point.x;
      endY = hit.point.y;
      endZ = hit.point.z;
      const target = hit.object.userData.bot;
      if (target && target.alive) {
        const headshot = hit.object.userData.part === 'head';
        const amount = damageAtRange(def, hit.distance, headshot);
        damageBot(state, target, amount, headshot, shooterName, hooks);
        result = headshot ? 'head' : 'hit';
      } else {
        hitPoint.copy(hit.point);
        hooks.sparks(hitPoint, 3);
      }
    }
    hooks.tracer({ x: ox, y: oy, z: oz }, { x: endX, y: endY, z: endZ });
    return result;
  }

  function damagePlayer(state, amount, attackerName, headshot, hooks) {
    const player = state.player;
    if (!player.alive) return;
    player.health -= amount;
    hooks.hurt();
    if (player.health <= 0) {
      player.health = 0;
      player.alive = false;
      player.deaths += 1;
      logKill(state, attackerName, 'You', headshot);
      if (state.spike.state === 'carried' && state.spike.carrier === 'player') {
        state.spike.state = 'dropped';
        state.spike.carrier = null;
        state.spike.x = player.body.x;
        state.spike.z = player.body.z;
        logEvent(state, 'spike', player.body.x, player.body.z, 'Spike dropped');
      }
    }
  }

  function damageBot(state, bot, amount, headshot, attackerName, hooks) {
    if (!bot.alive) return;
    bot.health -= amount;
    if (attackerName === 'You') hooks.hit(headshot);
    if (bot.health <= 0) {
      bot.health = 0;
      bot.alive = false;
      bot.deathT = state.time;
      logKill(state, attackerName, bot.name, headshot);
      if (attackerName === 'You') {
        hooks.kill();
        state.money += 300;
        state.player.kills += 1;
      }
      if (state.spike.state === 'carried' && state.spike.carrier === bot.id) {
        state.spike.state = 'dropped';
        state.spike.carrier = null;
        state.spike.x = bot.body.x;
        state.spike.z = bot.body.z;
      }
    } else {
      // A wounded bot knows roughly where the shot came from.
      bot.alertT = state.time + 2;
    }
  }

  function throwGrenade(state, thrower, kind) {
    const def = GRENADE_DEFS[kind];
    const body = thrower === 'player' ? state.player.body : state.bots.find((b) => b.id === thrower).body;
    const yaw = body.yaw;
    const pitch = body.pitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch);
    const fy = Math.sin(pitch) + 0.25;
    const fz = -Math.cos(yaw) * Math.cos(pitch);
    state.grenadesLive.push({
      kind, thrower,
      x: body.x + fx * 0.5, y: body.y + body.eye - 0.1, z: body.z + fz * 0.5,
      vx: fx * 11, vy: fy * 11, vz: fz * 11,
      fuse: def.fuse, def,
    });
  }

  function stepGrenades(state, dt, hooks) {
    const live = state.grenadesLive;
    for (let i = live.length - 1; i >= 0; i -= 1) {
      const g = live[i];
      g.fuse -= dt;
      g.vy -= 14 * dt;
      // Axis-separated bounce against colliders, damped.
      let nx = g.x + g.vx * dt;
      probe.min.set(nx - 0.12, g.y - 0.12, g.z - 0.12);
      probe.max.set(nx + 0.12, g.y + 0.12, g.z + 0.12);
      if (!world.colliders.some((c) => probe.intersectsBox(c))) g.x = nx;
      else g.vx *= -0.4;
      let nz = g.z + g.vz * dt;
      probe.min.set(g.x - 0.12, g.y - 0.12, nz - 0.12);
      probe.max.set(g.x + 0.12, g.y + 0.12, nz + 0.12);
      if (!world.colliders.some((c) => probe.intersectsBox(c))) g.z = nz;
      else g.vz *= -0.4;
      let ny = g.y + g.vy * dt;
      if (ny < 0.12) {
        ny = 0.12;
        g.vy = Math.abs(g.vy) > 1 ? -g.vy * 0.4 : 0;
      }
      probe.min.set(g.x - 0.12, ny - 0.12, g.z - 0.12);
      probe.max.set(g.x + 0.12, ny + 0.12, g.z + 0.12);
      if (!world.colliders.some((c) => probe.intersectsBox(c))) g.y = ny;
      else g.vy *= -0.4;
      if (g.fuse <= 0) {
        detonate(state, g, hooks);
        live.splice(i, 1);
      }
    }
  }

  function detonate(state, g, hooks) {
    const at = { x: g.x, y: g.y, z: g.z };
    if (g.kind === 'frag') {
      hooks.explosion(at, g.def.radius);
      logEvent(state, 'noise', g.x, g.z, 'Explosion');
      const victims = [];
      if (state.player.alive) victims.push({ kind: 'player', x: state.player.body.x, y: state.player.body.y + 1, z: state.player.body.z });
      for (const b of state.bots) {
        if (b.alive) victims.push({ kind: 'bot', ref: b, x: b.body.x, y: b.body.y + 1, z: b.body.z });
      }
      for (const v of victims) {
        const d = Math.hypot(v.x - g.x, v.y - g.y, v.z - g.z);
        if (d > g.def.radius) continue;
        const amount = g.def.damage * (1 - (d / g.def.radius) * 0.7);
        if (v.kind === 'player') damagePlayer(state, amount, g.thrower === 'player' ? 'You' : g.thrower, false, hooks);
        else damageBot(state, v.ref, amount, false, g.thrower === 'player' ? 'You' : g.thrower, hooks);
      }
    } else {
      hooks.flash(at);
      logEvent(state, 'noise', g.x, g.z, 'Flash');
      const viewers = [];
      if (state.player.alive) {
        viewers.push({ kind: 'player', x: state.player.body.x, y: state.player.body.y + state.player.body.eye, z: state.player.body.z, yaw: state.player.body.yaw, pitch: state.player.body.pitch });
      }
      for (const b of state.bots) {
        if (b.alive) viewers.push({ kind: 'bot', ref: b, x: b.body.x, y: b.body.y + b.body.eye, z: b.body.z, yaw: b.body.yaw, pitch: b.body.pitch });
      }
      for (const v of viewers) {
        const dx = g.x - v.x;
        const dy = g.y - v.y;
        const dz = g.z - v.z;
        const d = Math.hypot(dx, dy, dz);
        if (d > g.def.radius) continue;
        // Looking at the flash blinds; being very close blinds regardless.
        const lx = -Math.sin(v.yaw) * Math.cos(v.pitch);
        const ly = Math.sin(v.pitch);
        const lz = -Math.cos(v.yaw) * Math.cos(v.pitch);
        const facing = (dx * lx + dy * ly + dz * lz) / (d || 1);
        if (facing < 0.1 && d > 3) continue;
        if (worldHit(v.x, v.y, v.z, dx / (d || 1), dy / (d || 1), dz / (d || 1), d) < d - 0.4) continue;
        const blind = Math.max(0.6, 3 * (1 - d / g.def.radius));
        if (v.kind === 'player') state.player.flashT = Math.max(state.player.flashT, blind);
        else v.ref.blindT = Math.max(v.ref.blindT, blind);
      }
    }
  }

  return {
    setBotMeshes(meshes) {
      botHitMeshes = meshes;
      shootables = world.shootables.concat(botHitMeshes);
    },
    worldHit,
    botShotAtPlayer,
    hitscan,
    damagePlayer,
    damageBot,
    throwGrenade,
    stepGrenades,
  };
}
