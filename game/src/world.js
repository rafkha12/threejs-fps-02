// The Foundry Yard: an original industrial yard at dusk, 48 x 40 m, built
// from boxes and cylinders. Two spike sites (Furnace A west, Silo B east),
// three lanes (west, mid, east) joined by cross corridors, crates to crouch
// behind, containers for full cover, and a crane pillar splitting mid. Every
// solid is a collider for bodies and a surface a bullet stops on. Waypoints
// and routes are data: bots walk them, never a hardcoded patrol.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const SITES = {
  A: { name: 'Furnace', x: -15, z: -12, r: 5 },
  B: { name: 'Silo', x: 15, z: -12, r: 5 },
};

export const SPAWNS = {
  ember: [[0, 17], [-3, 17], [3, 17], [-6, 16]],
  frost: [[0, -17], [-4, -16], [4, -16], [8, -17]],
};

// Routes are waypoint lists bots follow. Attackers push from the south,
// defenders rotate from the north.
export const ROUTES = {
  aWest: [[0, 16], [-8, 12], [-18, 8], [-18, 0], [-18, -8], [-15, -12]],
  aMid: [[0, 16], [0, 8], [-4, 0], [0, -8], [-10, -8], [-15, -12]],
  bMid: [[0, 16], [0, 8], [4, 0], [0, -8], [10, -8], [15, -12]],
  bEast: [[0, 16], [8, 12], [18, 8], [18, 0], [18, -8], [15, -12]],
  midHold: [[0, 16], [0, 8], [-4, 0]],
  defA: [[0, -17], [-8, -14], [-12, -14]],
  defB: [[0, -17], [8, -14], [12, -14]],
  defMid: [[0, -17], [0, -12]],
  rotateA: [[12, -14], [0, -12], [-12, -14]],
  rotateB: [[-12, -14], [0, -12], [12, -14]],
};

// Where defenders stand to hold an angle once their route ends.
export const HOLDS = {
  A: [[-11, -14, -15, -12], [-19, -9, -15, -12], [-15, -16, -15, -8]],
  B: [[11, -14, 15, -12], [19, -9, 15, -12], [15, -16, 15, -8]],
  MID: [[-4, -10, 0, 0], [4, -10, 0, 0], [0, -13, 0, 4]],
};

function labelTexture(text, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(14,17,24,0.85)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  ctx.strokeRect(6, 6, 116, 116);
  ctx.fillStyle = color;
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 70);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }
  const darkMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#232a36'), roughness: 0.6, metalness: 0.5 });
  const rustMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#7a4a22'), roughness: 0.8, metalness: 0.35 });

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  function cylinder(r, h, x, z, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // Box collider approximating the cylinder, so bodies slide around it.
    colliders.push(new THREE.Box3(
      new THREE.Vector3(x - r * 0.85, 0, z - r * 0.85),
      new THREE.Vector3(x + r * 0.85, h, z + r * 0.85),
    ));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls, 4.2 m high.
  box(48.4, 0.4, 40.4, 0, -0.2, 0, materials.canvas);
  box(0.4, 4.2, 40.4, -24.2, 2.1, 0, materials.surface);
  box(0.4, 4.2, 40.4, 24.2, 2.1, 0, materials.surface);
  box(48.4, 4.2, 0.4, 0, 2.1, -20.2, materials.surface);
  box(48.4, 4.2, 0.4, 0, 2.1, 20.2, materials.surface);

  // Mid: the crane pillar splits the lane; its base is low cover.
  box(2.2, 4.0, 2.2, 0, 2.0, 0, darkMetal);
  box(4.4, 0.9, 1.4, 0, 0.45, 2.6, materials.hairline);
  box(1.4, 0.9, 4.4, -5.2, 0.45, -1.5, materials.hairline);

  // West lane: furnace blocks and crates.
  box(3.4, 2.6, 1.6, -18, 1.3, 4, rustMetal);
  box(1.2, 1.1, 1.2, -14, 0.55, 8, materials.hairline);
  box(1.2, 1.1, 1.2, -20, 0.55, -4, materials.hairline);
  box(2.4, 2.4, 2.4, -21, 1.2, -12, darkMetal);
  box(1.2, 0.7, 1.2, -10, 0.35, -4, materials.hairline);

  // East lane: silo and containers.
  cylinder(1.8, 3.6, 18, 4, rustMetal);
  box(1.2, 1.1, 1.2, 14, 0.55, 8, materials.hairline);
  box(1.2, 1.1, 1.2, 20, 0.55, -4, materials.hairline);
  box(2.4, 2.4, 2.4, 21, 1.2, -12, darkMetal);
  box(1.2, 0.7, 1.2, 10, 0.35, -4, materials.hairline);

  // Site A (Furnace): the furnace block, side crates, low platform.
  box(3.0, 3.4, 2.0, -17, 1.7, -14.5, rustMetal);
  box(1.6, 1.1, 1.6, -11.5, 0.55, -9.5, materials.hairline);
  box(1.6, 1.1, 1.6, -12.5, 0.55, -15.5, materials.hairline);
  box(3.2, 0.5, 2.2, -15, 0.25, -8.5, materials.surface);

  // Site B (Silo): the silo tank, side crates, low platform.
  cylinder(2.2, 4.0, 17.5, -14.5, rustMetal);
  box(1.6, 1.1, 1.6, 11.5, 0.55, -9.5, materials.hairline);
  box(1.6, 1.1, 1.6, 12.5, 0.55, -15.5, materials.hairline);
  box(3.2, 0.5, 2.2, 15, 0.25, -8.5, materials.surface);

  // North connector and south cover, so every lane has a second way in.
  box(6.0, 1.1, 1.2, -6, 0.55, -8, materials.hairline);
  box(6.0, 1.1, 1.2, 6, 0.55, -8, materials.hairline);
  box(2.4, 0.9, 1.2, -6, 0.45, 12, materials.hairline);
  box(2.4, 0.9, 1.2, 6, 0.45, 12, materials.hairline);
  box(1.2, 1.1, 3.6, -22, 0.55, 12, materials.hairline);
  box(1.2, 1.1, 3.6, 22, 0.55, 12, materials.hairline);

  // Site markers: a ground ring and a floating sign for each site.
  const siteMeshes = {};
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.25, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.03, site.z);
    group.add(ring);
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 1.6),
      new THREE.MeshBasicMaterial({ map: labelTexture(key, PALETTE.accent), transparent: true, side: THREE.DoubleSide }),
    );
    sign.position.set(site.x, 3.4, site.z);
    group.add(sign);
    siteMeshes[key] = { ring, sign };
  }

  // Light: dusk sky gradient, a low warm sun from the west, a cool fill,
  // and ember point lights burning at each site.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a4a66'), new THREE.Color(PALETTE.canvas), 1.35);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb066'), 2.6);
  sun.position.set(-18, 10, 12);
  sun.target.position.set(0, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 26;
  sun.shadow.camera.bottom = -26;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#5a7ba6'), 0.5);
  fill.position.set(14, 12, -10);
  scene.add(fill);
  const glowA = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 12);
  glowA.position.set(-15, 2.2, -12);
  scene.add(glowA);
  const glowB = new THREE.PointLight(new THREE.Color('#ff7a3c'), 10, 12);
  glowB.position.set(15, 2.2, -12);
  scene.add(glowB);

  return { colliders, shootables, group, siteMeshes, glowA, glowB };
}
