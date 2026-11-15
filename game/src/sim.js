// The fixed-step simulation, kept apart from rendering. One step advances
// the round clock, the player, the bots and the grenades — in that order —
// and pushes the results to the HUD. It never allocates in the hot loop:
// direction and spread math reuse module-level scratch, and the bots,
// combat and effects modules own their own reused state.
import { WEAPON_DEFS, GRENADE_DEFS, BUY_ORDER, spreadFor } from './weapons.js';
import { PLANT_TIME } from './state.js';
import { PLANT_REWARD } from './rounds.js';
import { SITES } from './world.js';
import { stepBots } from './bots.js';
import { buy, updateRounds, aliveCount } from './rounds.js';
import { sfx } from './audio.js';

const dir = { x: 0, y: 0, z: 0 };

export function createSim(deps) {
  const { state, world, combat, effects, hud, input, player } = deps;
  let bloom = 0;
  let prevFiring = false;
  let lastPhase = state.phase;
  let lastBeep = 0;

  function currentWeapon() {
    const id = state.player.weapons[state.player.current];
    return { id, def: WEAPON_DEFS[id], w: state.player.weaponStates[id] };
  }

  function firePlayer() {
    const { id, def, w } = currentWeapon();
    if (w.reloadLeft > 0 || w.cooldown > 0) return;
    if (w.mag <= 0) {
      sfx.dryFire();
      w.cooldown = 0.25;
      return;
    }
    const body = state.player.body;
    const speed = player.groundSpeed();
    const walking = input.state.keys.has('ShiftLeft') || input.state.keys.has('ShiftRight');
    const spread = spreadFor(def, speed, bloom) * (walking ? 0.6 : 1);
    const cosP = Math.cos(body.pitch);
    dir.x = -Math.sin(body.yaw) * cosP;
    dir.y = Math.sin(body.pitch);
    dir.z = -Math.cos(body.yaw) * cosP;
    const ox = body.x;
    const oy = body.y + body.eye;
    const oz = body.z;
    for (let p = 0; p < def.pellets; p += 1) {
      const sx = dir.x + (Math.random() * 2 - 1) * spread;
      const sy = dir.y + (Math.random() * 2 - 1) * spread;
      const sz = dir.z + (Math.random() * 2 - 1) * spread;
      combat.hitscan(state, 'You', ox, oy, oz, sx, sy, sz, def, deps.hooks);
    }
    w.mag -= 1;
    w.cooldown = def.gap;
    bloom = Math.min(0.035, bloom + def.spreadBloom);
    player.recoil(def.kick, (Math.random() * 2 - 1) * def.kick * 0.5);
    effects.setKick(0.05);
    effects.muzzle();
    sfx.shot(def.kind);
    state.events.push({ kind: 'shot', x: body.x, z: body.z, t: state.time, text: '' });
    if (state.events.length > 48) state.events.splice(0, state.events.length - 48);
  }

  function tryPlant(dt, keys) {
    const p = state.player;
    if (state.spike.state !== 'carried' || state.spike.carrier !== 'player') {
      p.planting = 0;
      return;
    }
    let siteKey = null;
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      if (Math.hypot(p.body.x - s.x, p.body.z - s.z) <= s.r) {
        siteKey = key;
        break;
      }
    }
    if (!siteKey || !keys.has('KeyE')) {
      p.planting = 0;
      return;
    }
    p.planting += dt;
    if (state.time - lastBeep > 0.5) {
      lastBeep = state.time;
      sfx.plantBeep();
    }
    if (p.planting >= PLANT_TIME) {
      p.planting = 0;
      state.spike.state = 'planted';
      state.spike.site = siteKey;
      state.spike.timer = 35;
      state.money += PLANT_REWARD;
      hud.banner('SPIKE PLANTED', `Detonation in 35 s — hold ${SITES[siteKey].name}.`, 3000);
    }
  }

  function step(dt) {
    state.time += dt;
    state.tick += 1;
    updateRounds(state, dt, deps.hooks);
    if (state.phase !== lastPhase) {
      lastPhase = state.phase;
      if (state.phase === 'live') {
        hud.banner(`ROUND ${state.round}`, state.round === 1 ? 'Plant the spike or eliminate Frost.' : '', 2200);
        hud.hideBuy();
      } else if (state.phase === 'buy') {
        hud.banner(`ROUND ${state.round} — BUY PHASE`, 'Press B to buy, click a row or use keys 1-6.', 3000);
      } else if (state.phase === 'roundEnd') {
        const won = state.roundWinner === 'ember';
        hud.banner(won ? 'ROUND WON' : 'ROUND LOST', state.roundReason, 3400);
        if (won) sfx.roundWin();
        else sfx.roundLose();
      }
    }

    const keys = input.state.keys;
    const pressed = input.takePressed();
    const p = state.player;

    if (state.phase === 'buy') {
      for (let i = 0; i < BUY_ORDER.length; i += 1) {
        if (pressed.has(`Digit${i + 1}`)) {
          if (buy(state, BUY_ORDER[i])) sfx.buy();
        }
      }
      if (pressed.has('KeyB')) deps.toggleBuy();
      pushHud();
      return;
    }
    if (state.phase !== 'live') {
      pushHud();
      return;
    }

    // Player movement and actions, only while alive and the round is live.
    if (p.alive) {
      p.flashT = Math.max(0, p.flashT - dt);
      const walking = player.step(dt, keys);
      void walking;
      bloom = Math.max(0, bloom - dt * 0.025);

      const { def, w } = currentWeapon();
      w.cooldown = Math.max(0, w.cooldown - dt);
      if (w.reloadLeft > 0) {
        w.reloadLeft = Math.max(0, w.reloadLeft - dt);
        effects.setReloadDip(w.reloadLeft > 0 ? 1 : 0);
        if (w.reloadLeft === 0) {
          const need = def.mag - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take;
          w.reserve -= take;
        }
      } else {
        effects.setReloadDip(0);
      }

      const firing = input.state.firing;
      const edge = firing && !prevFiring;
      if (def.auto ? firing : edge) firePlayer();
      prevFiring = firing;

      if (pressed.has('KeyR') && w.reloadLeft === 0 && w.mag < def.mag && w.reserve > 0) {
        w.reloadLeft = def.reload;
        sfx.reload();
      }
      for (let i = 0; i < p.weapons.length; i += 1) {
        if (pressed.has(`Digit${i + 1}`)) {
          p.current = i;
          effects.setKick(0.02);
        }
      }
      if (pressed.has('KeyQ')) {
        p.grenadeSel = p.grenadeSel === 'frag' ? 'flash' : 'frag';
      }
      if (pressed.has('KeyG')) {
        const sel = p.grenadeSel;
        if (p.grenades[sel] > 0) {
          p.grenades[sel] -= 1;
          combat.throwGrenade(state, 'player', sel);
        }
      }
      tryPlant(dt, keys);
    }

    stepBots({ state, world, combat, hooks: deps.hooks }, dt);
    combat.stepGrenades(state, dt, deps.hooks);
    pushHud();
  }

  function pushHud() {
    const p = state.player;
    const { id, def, w } = currentWeapon();
    void id;
    hud.setHealth(p.health);
    hud.setAmmo(w.mag, w.reserve, def.name);
    hud.setGrenades(p.grenades.frag, p.grenades.flash, p.grenadeSel);
    hud.setTimer(state.roundTime, state.spike.state === 'planted', state.spike.timer);
    hud.setScore(state.wins.ember, state.wins.frost, state.round);
    hud.setMoney(state.money);
    hud.setAlive(aliveCount(state, 'ember'), aliveCount(state, 'frost'));
    hud.setSpike(state.spike.state === 'carried' && state.spike.carrier === 'player'
      ? 'SPIKE — plant at A or B [E]'
      : state.spike.state === 'dropped'
        ? 'SPIKE DROPPED — an ally will fetch it'
        : state.spike.state === 'planted'
          ? `SPIKE PLANTED at ${state.spike.site} — ${Math.ceil(state.spike.timer)}s`
          : state.spike.state === 'carried'
            ? 'SPIKE carried by an ally'
            : '');
    hud.killfeed(state.kills);
    const speed = player.groundSpeed();
    const spreadPx = 6 + Math.min(1, speed / 5.2) * 14 + bloom * 500;
    hud.setCrosshair(p.alive ? spreadPx : 6);
    hud.flashBlind(p.alive ? Math.min(0.92, p.flashT / 3) : 0);
    if (p.planting > 0) hud.channel(p.planting / PLANT_TIME, 'PLANTING SPIKE — hold E');
    else hud.channel(null);
  }

  return { step, pushHud, currentWeapon };
}
