// The one place state lives. Every module reads or mutates this object and
// nothing else; the simulation (sim.js) owns advancing it, the renderer
// (main.js) only reads it. No module keeps its own copy of a number the
// judge can see on the HUD.
import { WEAPON_DEFS } from './weapons.js';

export const ROUND_TIME = 100;
export const FREEZE_TIME = 12;
export const SPIKE_TIME = 35;
export const PLANT_TIME = 4;
export const DEFUSE_TIME = 5;
export const ROUNDS_TO_WIN = 5;
export const MAX_ROUNDS = 9;

export function createState() {
  return {
    time: 0,
    tick: 0,
    // 'buy' (freeze time) | 'live' | 'roundEnd' | 'matchEnd'. Planting does
    // not change the phase: the spike timer replaces the round timer.
    phase: 'buy',
    phaseT: 0,
    roundTime: ROUND_TIME,
    round: 1,
    wins: { ember: 0, frost: 0 },
    matchWinner: null,
    roundWinner: null,
    roundReason: '',
    money: 800,
    lossStreak: 0,
    spike: {
      state: 'carried', // carried | dropped | planted | defused | detonated
      carrier: 'player',
      x: 0,
      z: 17,
      plantT: 0, // plant/defuse channel progress, seconds
      timer: SPIKE_TIME,
      site: null, // 'A' | 'B'
    },
    player: {
      body: null, // set by physics at boot
      health: 100,
      alive: true,
      weapons: ['sparrow'],
      weaponStates: { sparrow: weaponState('sparrow') },
      current: 0,
      grenades: { frag: 1, flash: 0 },
      grenadeSel: 'frag',
      planting: 0,
      defusing: 0,
      flashT: 0, // blinded seconds remaining
      kills: 0,
      deaths: 0,
    },
    bots: [],
    grenadesLive: [],
    // Ring of recent events: { kind, x, z, t, text }. Gunshots feed bot
    // hearing; kills feed the killfeed. Capped, oldest dropped.
    events: [],
    kills: [],
    // Last shot direction per actor, for tracers drawn by effects.js.
    shots: [],
  };
}

export function logEvent(state, kind, x, z, text) {
  state.events.push({ kind, x, z, t: state.time, text: text ?? '' });
  if (state.events.length > 48) state.events.splice(0, state.events.length - 48);
}

export function logKill(state, killer, victim, headshot) {
  state.kills.unshift({ killer, victim, headshot, t: state.time });
  if (state.kills.length > 5) state.kills.length = 5;
}

export function weaponState(defId) {
  const def = WEAPON_DEFS[defId];
  return { id: defId, mag: def.mag, reserve: def.reserve, cooldown: 0, reloadLeft: 0, burstLeft: 0 };
}
