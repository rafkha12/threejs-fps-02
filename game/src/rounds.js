// Round and match flow plus the economy. A match is first to 5 round wins
// (at most 9 rounds). A round is won by elimination, by the spike
// detonating, by a defuse, or by the defenders running the clock out before
// a plant. Winners take $3250, losers $1900 plus a growing loss bonus, kills
// pay $300, a plant pays $300 — and the buy menu spends it during freeze time.
import { FREEZE_TIME, ROUND_TIME, SPIKE_TIME, ROUNDS_TO_WIN, MAX_ROUNDS, weaponState } from './state.js';
import { WEAPON_DEFS, GRENADE_DEFS } from './weapons.js';
import { SPAWNS, ROUTES } from './world.js';
import { resetBot } from './bots.js';

export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_BASE = 1900;
export const PLANT_REWARD = 300;

export function aliveCount(state, team) {
  if (team === 'ember') {
    let n = state.player.alive ? 1 : 0;
    for (const b of state.bots) if (b.team === 'ember' && b.alive) n += 1;
    return n;
  }
  let n = 0;
  for (const b of state.bots) if (b.team === 'frost' && b.alive) n += 1;
  return n;
}

export function startMatch(state) {
  state.wins.ember = 0;
  state.wins.frost = 0;
  state.matchWinner = null;
  state.round = 1;
  state.money = 800;
  state.lossStreak = 0;
  startRound(state);
}

export function startRound(state) {
  state.phase = 'buy';
  state.phaseT = 0;
  state.roundTime = ROUND_TIME;
  state.roundWinner = null;
  state.roundReason = '';
  state.spike.state = 'carried';
  state.spike.carrier = 'player';
  state.spike.site = null;
  state.spike.plantT = 0;
  state.spike.timer = SPIKE_TIME;
  state.grenadesLive.length = 0;
  state.events.length = 0;

  const p = state.player;
  p.health = 100;
  p.alive = true;
  p.planting = 0;
  p.defusing = 0;
  p.flashT = 0;
  const spawn = SPAWNS.ember[0];
  p.body.x = spawn[0];
  p.body.z = spawn[1];
  p.body.y = 0;
  p.body.vx = 0;
  p.body.vy = 0;
  p.body.vz = 0;
  p.body.yaw = 0; // face north, toward the sites
  p.body.pitch = 0;
  // Ammo is refilled every round; owned weapons are kept.
  for (const id of p.weapons) {
    const def = WEAPON_DEFS[id];
    const w = p.weaponStates[id];
    w.mag = def.mag;
    w.reserve = def.reserve;
    w.cooldown = 0;
    w.reloadLeft = 0;
  }

  const allyRoutes = [ROUTES.aWest, ROUTES.aMid, ROUTES.bMid];
  const foeRoutes = [ROUTES.defA, ROUTES.defB, ROUTES.defMid, ROUTES.defA];
  let ai = 0;
  let fi = 0;
  for (const bot of state.bots) {
    if (bot.team === 'ember') {
      const s = SPAWNS.ember[1 + ai];
      resetBot(bot, s[0], s[1], 0, allyRoutes[ai % allyRoutes.length]);
      ai += 1;
    } else {
      const s = SPAWNS.frost[fi % SPAWNS.frost.length];
      resetBot(bot, s[0], s[1], Math.PI, foeRoutes[fi % foeRoutes.length]);
      fi += 1;
    }
  }
}

export function buy(state, itemId) {
  if (state.phase !== 'buy') return false;
  const p = state.player;
  if (WEAPON_DEFS[itemId]) {
    const def = WEAPON_DEFS[itemId];
    if (p.weapons.includes(itemId)) return false;
    if (state.money < def.price) return false;
    state.money -= def.price;
    p.weapons.push(itemId);
    p.weaponStates[itemId] = weaponState(itemId);
    p.current = p.weapons.length - 1;
    return true;
  }
  if (GRENADE_DEFS[itemId]) {
    const def = GRENADE_DEFS[itemId];
    if (p.grenades[itemId] >= 2) return false;
    if (state.money < def.price) return false;
    state.money -= def.price;
    p.grenades[itemId] += 1;
    return true;
  }
  return false;
}

export function endRound(state, winner, reason) {
  if (state.phase === 'roundEnd' || state.phase === 'matchEnd') return;
  state.roundWinner = winner;
  state.roundReason = reason;
  state.wins[winner] += 1;
  if (winner === 'ember') {
    state.money += WIN_REWARD;
    state.lossStreak = 0;
  } else {
    state.lossStreak += 1;
    state.money += LOSS_BASE + Math.min(2, state.lossStreak - 1) * 500;
  }
  state.phase = 'roundEnd';
  state.phaseT = 0;
}

export function updateRounds(state, dt, hooks) {
  if (state.phase === 'buy') {
    state.phaseT += dt;
    if (state.phaseT >= FREEZE_TIME) {
      state.phase = 'live';
      state.phaseT = 0;
    }
    return;
  }
  if (state.phase === 'live') {
    if (state.spike.state === 'planted') {
      state.spike.timer -= dt;
      if (state.spike.timer <= 0) {
        state.spike.state = 'detonated';
        hooks.explosion({ x: state.spike.x, y: 0.6, z: state.spike.z }, 6);
        endRound(state, 'ember', 'Spike detonated');
        return;
      }
    } else {
      state.roundTime -= dt;
      if (state.roundTime <= 0) {
        endRound(state, 'frost', 'Time expired — no plant');
        return;
      }
    }
    if (state.spike.state === 'defused') {
      endRound(state, 'frost', 'Spike defused');
      return;
    }
    if (aliveCount(state, 'frost') === 0) {
      endRound(state, 'ember', 'Enemy team eliminated');
      return;
    }
    if (aliveCount(state, 'ember') === 0) {
      endRound(state, 'frost', 'Your team was eliminated');
      return;
    }
    return;
  }
  if (state.phase === 'roundEnd') {
    state.phaseT += dt;
    if (state.phaseT < 4) return;
    if (state.wins.ember >= ROUNDS_TO_WIN || state.wins.frost >= ROUNDS_TO_WIN || state.round >= MAX_ROUNDS) {
      state.matchWinner = state.wins.ember > state.wins.frost ? 'ember' : 'frost';
      state.phase = 'matchEnd';
      state.phaseT = 0;
      return;
    }
    state.round += 1;
    startRound(state);
  }
}
