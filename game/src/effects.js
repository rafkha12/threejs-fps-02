// Pooled visual effects: tracers, impact sparks, explosions, muzzle flash
// and the spike beacon. Everything is allocated once at boot and reused, so
// the hot loop never creates an object. The weapon view model lives here
// too, because it is pure presentation.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TRACER_COUNT = 24;
const SPARK_COUNT = 40;

export function createEffects(scene, camera) {
  // Tracers: thin stretched boxes, one per recent shot.
  const tracerGeo = new THREE.BoxGeometry(0.02, 0.02, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACER_COUNT; i += 1) {
    const mesh = new THREE.Mesh(tracerGeo, tracerMat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerNext = 0;

  // Impact sparks: small tetrahedrons that fly out and fade.
  const sparkGeo = new THREE.TetrahedronGeometry(0.05);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.95 });
  const sparks = [];
  for (let i = 0; i < SPARK_COUNT; i += 1) {
    const mesh = new THREE.Mesh(sparkGeo, sparkMat);
    mesh.visible = false;
    scene.add(mesh);
    sparks.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
  let sparkNext = 0;

  // Explosion: one expanding shell plus a light, reused for every blast.
  const boom = new THREE.Mesh(
    new THREE.SphereGeometry(1, 20, 14),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false }),
  );
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 18);
  scene.add(boomLight);
  let boomLife = 0;

  // Spike beacon: a pulsing ring at the planted spike.
  const beacon = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 0.75, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  beacon.rotation.x = -Math.PI / 2;
  beacon.visible = false;
  scene.add(beacon);

  // Muzzle flash: a quad and a light on the camera.
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.18, -0.25, -1.2);
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.18, -0.22, -0.9);
  camera.add(flashLight);
  let flashLife = 0;

  // Weapon view model: receiver, barrel, stock, grip. Swaps colour subtly
  // per weapon kind through the receiver material.
  const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const bodyMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const model = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), bodyMat);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), gripMat);
  barrel.position.set(0, 0.025, -0.38);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.16), gripMat);
  stock.position.set(0, -0.02, 0.18);
  model.add(receiver, barrel, stock);
  model.position.set(0.18, -0.27, -0.7);
  model.scale.setScalar(0.6);
  camera.add(model);
  let kick = 0;
  let reloadDip = 0;

  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  return {
    model,
    setKick(amount) {
      kick = amount;
    },
    setReloadDip(amount) {
      reloadDip = amount;
    },
    muzzle() {
      flashLife = 0.06;
    },
    tracer(from, to) {
      const slot = tracers[tracerNext];
      tracerNext = (tracerNext + 1) % TRACER_COUNT;
      tmpA.copy(from);
      tmpB.copy(to);
      const len = tmpA.distanceTo(tmpB);
      slot.mesh.position.copy(tmpA).lerp(tmpB, 0.5);
      slot.mesh.lookAt(tmpB);
      slot.mesh.scale.set(1, 1, Math.max(0.1, len));
      slot.mesh.visible = true;
      slot.life = 0.07;
    },
    sparksAt(point, count) {
      for (let i = 0; i < count; i += 1) {
        const slot = sparks[sparkNext];
        sparkNext = (sparkNext + 1) % SPARK_COUNT;
        slot.mesh.position.copy(point);
        slot.vx = (Math.random() * 2 - 1) * 3;
        slot.vy = Math.random() * 3 + 1;
        slot.vz = (Math.random() * 2 - 1) * 3;
        slot.mesh.visible = true;
        slot.life = 0.35;
      }
    },
    explosion(point, radius) {
      boom.position.set(point.x, Math.max(0.4, point.y), point.z);
      boom.scale.setScalar(0.3);
      boom.visible = true;
      boomLife = 0.5;
      boomLight.position.copy(boom.position);
      boomLight.position.y += 0.5;
      boomLight.intensity = 60;
      this.sparksAt(point, 12);
      void radius;
    },
    setBeacon(x, z, on, pulse) {
      beacon.visible = on;
      if (!on) return;
      beacon.position.set(x, 0.06, z);
      const s = 1 + pulse * 0.25;
      beacon.scale.set(s, s, 1);
      beacon.material.opacity = 0.5 + pulse * 0.4;
    },
    step(dt) {
      for (const t of tracers) {
        if (t.life <= 0) continue;
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
      for (const s of sparks) {
        if (s.life <= 0) continue;
        s.life -= dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        s.vy -= 9 * dt;
        if (s.life <= 0) s.mesh.visible = false;
      }
      if (boomLife > 0) {
        boomLife -= dt;
        const k = 1 - Math.max(0, boomLife) / 0.5;
        boom.scale.setScalar(0.3 + k * 4.5);
        boom.material.opacity = Math.max(0, 0.85 * (1 - k));
        boomLight.intensity = Math.max(0, 60 * (1 - k));
        if (boomLife <= 0) {
          boom.visible = false;
          boomLight.intensity = 0;
        }
      }
      if (flashLife > 0) {
        flashLife -= dt;
        flash.material.opacity = flashLife > 0 ? 0.9 : 0;
        flash.rotation.z = flashLife * 40;
        flashLight.intensity = flashLife > 0 ? 18 : 0;
      } else {
        flash.material.opacity = 0;
        flashLight.intensity = 0;
      }
      kick += (0 - kick) * Math.min(1, dt * 14);
      model.position.z = -0.7 + kick;
      model.rotation.x = kick * 2.2 - reloadDip * 0.55;
    },
  };
}
