# DUSKLINE

An original round-based tactical FPS on three.js 0.187.0, built for the
make.fun threejs-fps-02 bounty. Single-player against bots, no network, no
build step: serve `game/` with any static server and open `index.html`.

## The game

Two teams fight short rounds in the Foundry Yard, an industrial yard at
dusk. Ember (you + 3 bots) attacks; Frost (4 bots) defends two spike sites,
Furnace (A) and Silo (B). Win a round by eliminating the other team, or by
planting the spike and letting it detonate. Lose it if the defenders defuse
the spike or the round timer runs out before a plant.

- Money between rounds, buy menu (`B`) during the 12 s freeze time.
- Five weapons (sidearm, rifle, SMG, marksman, shotgun) and two grenades
  (frag + flash), each with its own damage, spread, recoil and price.
- Hits are checked against bodies; headshots deal 3x damage. Spread and
  recoil punish firing on the move; stopping to aim pays.
- Bots follow routes through the yard, hold site angles, react to gunfire
  they hear, and plant/defuse the spike.
- Movement with acceleration and friction, crouching, jumping, and
  collision with the map. Fixed 60 Hz simulation, rendering decoupled.

## Controls

- `W A S D` move, mouse look, click fire, `R` reload
- `Ctrl` / `C` crouch, `Space` jump, `Shift` walk (quiet, accurate)
- `1-5` switch weapon, `G` throw grenade, `Q` swap grenade type
- `E` hold to plant / defuse the spike, `B` buy menu (freeze time)

## Run it

```sh
node serve.ts   # http://localhost:8080
```

## Hand in

`main.ts` (Node 22, standard library only) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` with the
kit's `vendor/makefun-threejs.ts`.
