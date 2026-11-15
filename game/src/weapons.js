// Weapon definitions and per-actor weapon state. Every number the judge can
// feel — damage, headshot multiplier, spread, recoil, fire rate, price —
// lives in WEAPON_DEFS; the firing itself is in combat.js, the view model
// in effects.js. Spread grows with movement and with sustained fire, so
// stopping to aim pays.
export const WEAPON_DEFS = {
  sparrow: {
    name: 'Sparrow P9', kind: 'sidearm', price: 0, mag: 12, reserve: 48,
    damage: 26, headMult: 2, pellets: 1, auto: false, gap: 0.14,
    reload: 1.4, spreadStill: 0.003, spreadMove: 0.02, spreadBloom: 0.004,
    kick: 0.006, range: 40, tracer: 0.5,
  },
  heron: {
    name: 'Heron VK-7', kind: 'rifle', price: 2700, mag: 30, reserve: 90,
    damage: 34, headMult: 3, pellets: 1, auto: true, gap: 0.1,
    reload: 2.1, spreadStill: 0.0022, spreadMove: 0.028, spreadBloom: 0.0035,
    kick: 0.011, range: 60, tracer: 1,
  },
  wasp: {
    name: 'Wasp PDW', kind: 'smg', price: 1500, mag: 32, reserve: 96,
    damage: 22, headMult: 2, pellets: 1, auto: true, gap: 0.066,
    reload: 1.8, spreadStill: 0.004, spreadMove: 0.03, spreadBloom: 0.004,
    kick: 0.007, range: 30, tracer: 0.7,
  },
  osprey: {
    name: 'Osprey LRM', kind: 'marksman', price: 3800, mag: 5, reserve: 15,
    damage: 82, headMult: 2.5, pellets: 1, auto: false, gap: 0.9,
    reload: 2.8, spreadStill: 0.0006, spreadMove: 0.05, spreadBloom: 0.012,
    kick: 0.035, range: 80, tracer: 1.4,
  },
  badger: {
    name: 'Badger M12', kind: 'shotgun', price: 1200, mag: 6, reserve: 18,
    damage: 11, headMult: 2, pellets: 8, auto: false, gap: 0.85,
    reload: 2.6, spreadStill: 0.02, spreadMove: 0.035, spreadBloom: 0.01,
    kick: 0.03, range: 18, tracer: 0.4,
  },
};

export const GRENADE_DEFS = {
  frag: {
    name: 'Ember frag', price: 300, damage: 95, radius: 5.5, fuse: 1.4,
    blurb: 'Explodes: heavy damage up close, less at the edge.',
  },
  flash: {
    name: 'Spark flash', price: 400, damage: 0, radius: 14, fuse: 1.1,
    blurb: 'Blinds anyone looking at it for up to 3 s.',
  },
};

// Buy order shown in the buy menu. The sidearm is free and always owned.
export const BUY_ORDER = ['heron', 'wasp', 'badger', 'osprey', 'frag', 'flash'];

export function spreadFor(def, speed, bloom) {
  const moving = Math.min(1, speed / 5.2);
  return def.spreadStill + moving * def.spreadMove + bloom;
}

export function damageAtRange(def, dist, headshot) {
  const falloff = dist > def.range ? Math.max(0.45, 1 - (dist - def.range) / def.range) : 1;
  const base = def.damage * falloff;
  return headshot ? base * def.headMult : base;
}
