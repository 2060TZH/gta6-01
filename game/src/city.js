// Solmar Bay itself: ground texture, buildings, beach, sea, palms, lamps and neon.
// All geometry is procedural; the only textures are canvases drawn at build time.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, PALETTE } from './config.js';
import { range } from './random.js';

function groundTexture(random) {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const g = canvas.getContext('2d');
  const u = S / CITY.size; // pixels per world unit
  const toPx = (v) => (v + CITY.half) * u;

  g.fillStyle = '#8f949c';
  g.fillRect(0, 0, S, S);
  // City blocks.
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      const x0 = toPx(-CITY.half + bx * CITY.block + CITY.road / 2);
      const z0 = toPx(-CITY.half + bz * CITY.block + CITY.road / 2);
      const w = (CITY.block - CITY.road) * u;
      const isPlaza = bx === 3 && bz === 3;
      const isPark = (bx === 1 && bz === 5) || (bx === 6 && bz === 1);
      g.fillStyle = isPlaza ? '#c9b18a' : isPark ? '#6f9a58' : '#a9adb3';
      g.fillRect(x0, z0, w, w);
      if (isPlaza) {
        g.strokeStyle = '#8a744e';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(x0 + w / 2, z0 + w / 2, w * 0.28, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(x0 + w / 2, z0 + w / 2, w * 0.12, 0, Math.PI * 2);
        g.stroke();
      }
      if (isPark) {
        g.fillStyle = '#5d8a4a';
        for (let t = 0; t < 8; t += 1) {
          g.beginPath();
          g.arc(x0 + random() * w, z0 + random() * w, 10 + random() * 14, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  // Roads: dark strips along every grid line, with centre dashes.
  g.fillStyle = '#2e3138';
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const p = toPx(-CITY.half + i * CITY.block);
    g.fillRect(p - (CITY.road / 2) * u, 0, CITY.road * u, S);
    g.fillRect(0, p - (CITY.road / 2) * u, S, CITY.road * u);
  }
  g.fillStyle = '#e8c33c';
  for (let i = 0; i <= CITY.blocks; i += 1) {
    const p = toPx(-CITY.half + i * CITY.block);
    for (let d = -CITY.half + 20; d < CITY.half - 20; d += 24) {
      g.fillRect(p - 1, toPx(d), 2, 12);
      g.fillRect(toPx(d), p - 1, 12, 2);
    }
  }
  // Zebra crossings at every intersection (except the beach road).
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i <= CITY.blocks; i += 1) {
    for (let j = 0; j <= CITY.blocks; j += 1) {
      const px = toPx(-CITY.half + i * CITY.block);
      const pz = toPx(-CITY.half + j * CITY.block);
      if (pz > toPx(CITY.beachY)) continue;
      for (let k = -3; k <= 3; k += 1) {
        g.fillRect(px + k * 4 - 1, pz - 13, 2, 11);
        g.fillRect(px - 13, pz + k * 4 - 1, 11, 2);
      }
    }
  }
  // Beach sand, then the sea at the south edge.
  g.fillStyle = '#e8cf9e';
  g.fillRect(0, toPx(CITY.beachY), S, toPx(CITY.seaY) - toPx(CITY.beachY));
  g.fillStyle = '#1d6f8f';
  g.fillRect(0, toPx(CITY.seaY), S, S - toPx(CITY.seaY));
  g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let x = 0; x < S; x += 90) {
    g.fillRect(x, toPx(CITY.seaY) + 4, 46, 3);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function facadeTexture(random, baseColor, litRatio) {
  const W = 128;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = baseColor;
  g.fillRect(0, 0, W, H);
  const cols = 6;
  const rows = 12;
  for (let cx = 0; cx < cols; cx += 1) {
    for (let cy = 0; cy < rows; cy += 1) {
      const lit = random() < litRatio;
      g.fillStyle = lit ? '#ffd98a' : '#20283a';
      g.fillRect(8 + cx * 19, 10 + cy * 20, 12, 13);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function textTexture(text, fg, bg) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = fg;
  g.font = 'bold 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildCity(scene, random) {
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];
  const lamps = [];
  const neon = [];

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size, CITY.size),
    new THREE.MeshLambertMaterial({ map: groundTexture(random) }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // The sea stretches past the south edge so the horizon is water.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(CITY.size * 2, 260),
    new THREE.MeshLambertMaterial({ color: PALETTE.sea }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.3, CITY.seaY + 130);
  group.add(sea);

  const facades = [
    facadeTexture(random, '#d8cfc0', 0.25),
    facadeTexture(random, '#b8c4d0', 0.18),
    facadeTexture(random, '#e0b08a', 0.3),
    facadeTexture(random, '#9fb3a8', 0.15),
    facadeTexture(random, '#7a8ba0', 0.35),
    facadeTexture(random, '#c9a0a0', 0.22),
  ];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a5f68 });
  const acMat = new THREE.MeshLambertMaterial({ color: 0x8a8f96 });
  const SHOP_SIGNS = ['HOTEL', 'CASINO', 'TACOS', 'BAR', 'PIER 9', '24H', 'NOODLES', 'GYM'];
  let waterTowerBuilt = false;

  // Buildings, one to three per block. The plaza, parks, beach strip and the
  // marina/docks blocks stay open so missions have room to play out.
  const openBlocks = new Set(['3,3', '1,5', '6,1', '6,7', '0,7', '7,7', '2,7']);
  for (let bx = 0; bx < CITY.blocks; bx += 1) {
    for (let bz = 0; bz < CITY.blocks; bz += 1) {
      if (openBlocks.has(`${bx},${bz}`)) continue;
      if (bz === 7) continue; // beach row
      const downtown = bx >= 5 && bz <= 2;
      const count = downtown ? 2 + Math.floor(random() * 2) : 1 + Math.floor(random() * 2);
      const blockX0 = -CITY.half + bx * CITY.block + CITY.road / 2 + 4;
      const blockZ0 = -CITY.half + bz * CITY.block + CITY.road / 2 + 4;
      const inner = CITY.block - CITY.road - 8;
      for (let n = 0; n < count; n += 1) {
        const w = 14 + random() * (inner / count - 14);
        const d = 14 + random() * (inner - 14);
        const h = downtown ? 26 + random() * 26 : 8 + random() * 16;
        const x = blockX0 + (n + 0.5) * (inner / count) + range(random, -3, 3);
        const z = blockZ0 + inner / 2 + range(random, -6, 6);
        const mat = new THREE.MeshLambertMaterial({ map: facades[Math.floor(random() * facades.length)] });
        const mesh = new THREE.Mesh(boxGeo, mat);
        mesh.scale.set(Math.max(10, w), h, Math.max(10, d));
        mesh.position.set(x, h / 2, z);
        group.add(mesh);
        if (random() < 0.5) {
          const roof = new THREE.Mesh(boxGeo, roofMat);
          roof.scale.set(4, 1.6, 4);
          roof.position.set(x + range(random, -4, 4), h + 0.8, z + range(random, -4, 4));
          group.add(roof);
        }
        colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
        // Rooftop clutter: AC units on most roofs, and one water tower on the
        // tallest downtown block so the skyline has a landmark.
        if (random() < 0.55) {
          const ac = new THREE.Mesh(boxGeo, acMat);
          ac.scale.set(2.4, 1.1, 2.4);
          ac.position.set(x + range(random, -4, 4), h + 0.55, z + range(random, -4, 4));
          group.add(ac);
        }
        if (downtown && h > 44 && !waterTowerBuilt) {
          waterTowerBuilt = true;
          const tank = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 5, 10), new THREE.MeshLambertMaterial({ color: 0x9a7b52 }));
          tank.position.set(x, h + 4.5, z);
          group.add(tank);
          const cone = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.2, 10), new THREE.MeshLambertMaterial({ color: 0x6b4f30 }));
          cone.position.set(x, h + 8, z);
          group.add(cone);
          for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 3.4, 6), roofMat);
            leg.position.set(x + lx, h + 1.7, z + lz);
            group.add(leg);
          }
        }
        // Neon signs on downtown faces: a named shop sign or a plain bar.
        if (downtown && random() < 0.6) {
          const color = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonGold][Math.floor(random() * 3)];
          if (random() < 0.5) {
            const word = SHOP_SIGNS[Math.floor(random() * SHOP_SIGNS.length)];
            const fg = `#${color.toString(16).padStart(6, '0')}`;
            const sign = new THREE.Mesh(
              new THREE.BoxGeometry(11, 2.4, 0.3),
              new THREE.MeshLambertMaterial({ map: textTexture(word, fg, '#101018') }),
            );
            sign.position.set(x, h * 0.75, z + d / 2 + 0.2);
            group.add(sign);
            neon.push({ mat: sign.material, base: sign.material.color.getHex() });
          } else {
            const sign = new THREE.Mesh(
              new THREE.BoxGeometry(8, 1.2, 0.3),
              new THREE.MeshBasicMaterial({ color }),
            );
            sign.position.set(x, h * 0.75, z + d / 2 + 0.2);
            group.add(sign);
            neon.push({ mat: sign.material, base: color });
          }
        }
      }
    }
  }

  // Street lamps along the roads; their glow turns on at night.
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x3a3f47 });
  const bulbGeo = new THREE.SphereGeometry(0.45, 8, 8);
  for (let i = 0; i <= CITY.blocks; i += 1) {
    for (let j = 0; j <= CITY.blocks; j += 1) {
      if ((i + j) % 2 !== 0) continue;
      // Poles sit 11 units off the road centre: the road is 8 wide and a
      // car is 2.3 in radius, so 9 (v2's first try) wedged any car pulling
      // out of a road-edge parking spot against the pole.
      const x = -CITY.half + i * CITY.block + CITY.road / 2 + 3;
      const z = -CITY.half + j * CITY.block - CITY.road / 2 - 3;
      if (z > CITY.beachY - 8) continue;
      // Corner intersections sit past the ground plane's edge; skip them
      // instead of planting a floating lamp off the map (v1 did exactly that).
      if (Math.abs(x) > CITY.half - 8 || Math.abs(z) > CITY.half - 8) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 5.4, 6), lampMat);
      pole.position.set(x, 2.7, z);
      group.add(pole);
      const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe9a8 });
      const bulb = new THREE.Mesh(bulbGeo, bulbMat);
      bulb.position.set(x, 5.5, z);
      group.add(bulb);
      lamps.push(bulbMat);
      // Lamp posts are solid: the player and cars stop at them now.
      colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
    }
  }

  // Traffic lights at the other intersections: a pole, an arm and a
  // red/green pair. setSignal() flips them on a timer from the game loop.
  const signals = [];
  const signalPoleMat = new THREE.MeshLambertMaterial({ color: 0x2f333a });
  for (let i = 0; i <= CITY.blocks; i += 1) {
    for (let j = 0; j <= CITY.blocks; j += 1) {
      if ((i + j) % 2 === 0) continue;
      const x = -CITY.half + i * CITY.block - CITY.road / 2 - 3;
      const z = -CITY.half + j * CITY.block + CITY.road / 2 + 3;
      if (z > CITY.beachY - 8) continue;
      if (Math.abs(x) > CITY.half - 8 || Math.abs(z) > CITY.half - 8) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 6, 6), signalPoleMat);
      pole.position.set(x, 3, z);
      group.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.7, 0.7), signalPoleMat);
      head.position.set(x, 5.6, z);
      group.add(head);
      const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
      const greenMat = new THREE.MeshBasicMaterial({ color: 0x223322 });
      const red = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), redMat);
      red.position.set(x, 6.05, z + 0.4);
      group.add(red);
      const green = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 8), greenMat);
      green.position.set(x, 5.15, z + 0.4);
      group.add(green);
      signals.push({ redMat, greenMat });
      colliders.push({ minX: x - 0.25, maxX: x + 0.25, minZ: z - 0.25, maxZ: z + 0.25 });
    }
  }

  function setSignal(nsGreen) {
    for (const s of signals) {
      s.redMat.color.setHex(nsGreen ? 0x551111 : 0xff2a2a);
      s.greenMat.color.setHex(nsGreen ? 0x22ff66 : 0x223322);
    }
  }

  // Benches around the plaza and the parks, so the open blocks read as places.
  const benchMat = new THREE.MeshLambertMaterial({ color: 0x6b4f30 });
  const benchSpots = [
    { x: -14, z: -6 }, { x: 14, z: -6 }, { x: -14, z: 14 }, { x: 14, z: 14 },
    { x: -236, z: 96 }, { x: -212, z: 96 }, { x: 196, z: -216 }, { x: 220, z: -216 },
  ];
  for (const spot of benchSpots) {
    const seat = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.28, 1.1), benchMat);
    seat.position.set(spot.x, 0.55, spot.z);
    group.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.18), benchMat);
    back.position.set(spot.x, 1.05, spot.z - 0.5);
    group.add(back);
    colliders.push({ minX: spot.x - 1.7, maxX: spot.x + 1.7, minZ: spot.z - 0.6, maxZ: spot.z + 0.6 });
  }

  // Bus stop by the plaza: a sign and a shelter roof.
  const busSign = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 1.2, 0.15),
    new THREE.MeshLambertMaterial({ map: textTexture('BUS STOP', '#ffffff', '#1d4ed8') }),
  );
  busSign.position.set(-12, 3.4, 18);
  group.add(busSign);
  const busPole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 6), signalPoleMat);
  busPole.position.set(-12, 1.7, 18);
  group.add(busPole);

  // Beach umbrellas on the sand.
  const umbrellaColors = [0xff2e88, 0x22d3ee, 0xffc53d, 0xef4444, 0x3aa655];
  for (let i = 0; i < 5; i += 1) {
    const x = -200 + i * 90 + range(random, -14, 14);
    const z = CITY.beachY + 12 + range(random, 0, 14);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0xe8e8e8 }));
    pole.position.set(x, 1.3, z);
    group.add(pole);
    const top = new THREE.Mesh(
      new THREE.ConeGeometry(2.4, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: umbrellaColors[i % umbrellaColors.length] }),
    );
    top.position.set(x, 3, z);
    group.add(top);
  }

  // Palm trees on the beach.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3f7d3a });
  for (let i = 0; i < 26; i += 1) {
    const x = -CITY.half + 20 + random() * (CITY.size - 40);
    const z = CITY.beachY + 6 + random() * 22;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 6, 6), trunkMat);
    trunk.position.set(x, 3, z);
    trunk.rotation.z = range(random, -0.12, 0.12);
    group.add(trunk);
    const canopy = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 6), leafMat);
    canopy.scale.y = 0.45;
    canopy.position.set(x, 6.4, z);
    group.add(canopy);
    colliders.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }

  // Welcome sign over the beach road.
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(34, 5, 0.6),
    new THREE.MeshLambertMaterial({ map: textTexture('SOLMAR BAY', '#ffffff', '#0e7490') }),
  );
  sign.position.set(0, 7, CITY.beachY - 4);
  group.add(sign);
  const postMat = new THREE.MeshLambertMaterial({ color: 0x374151 });
  for (const px of [-15, 15]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 7, 6), postMat);
    post.position.set(px, 3.5, CITY.beachY - 4);
    group.add(post);
  }

  // Marina pier and dock warehouses.
  const pierMat = new THREE.MeshLambertMaterial({ color: 0x8a6f4d });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 10), pierMat);
  pier.position.set(200, 0.5, CITY.seaY + 2);
  group.add(pier);
  colliders.push({ minX: 170, maxX: 230, minZ: CITY.seaY - 3, maxZ: CITY.seaY + 7 });
  const dockMat = new THREE.MeshLambertMaterial({ color: 0x7d8a99 });
  for (const dx of [-296, -272]) {
    const warehouse = new THREE.Mesh(boxGeo, dockMat);
    warehouse.scale.set(16, 9, 22);
    warehouse.position.set(dx, 4.5, 288);
    group.add(warehouse);
    colliders.push({ minX: dx - 8, maxX: dx + 8, minZ: 277, maxZ: 299 });
  }

  const landmarks = {
    spawn: { x: 0, z: 48 },
    garage: { x: -236, z: -236 },
    plaza: { x: 0, z: 0 },
    marina: { x: 200, z: 282 },
    shop1: { x: 168, z: -152 },
    shop2: { x: 208, z: -112 },
    shop3: { x: 128, z: -192 },
    docks: { x: -284, z: 262 },
    hideout: { x: 236, z: -236 },
    beach: { x: -40, z: 282 },
  };

  function setNight(isNight, nightFactor = 1) {
    for (const bulb of lamps) bulb.color.setHex(isNight ? 0xffe9a8 : 0x555555);
    // Neon earns its keep after dark: signs glow at full colour at night and
    // sit dimmed in daylight. v1's loop was a no-op (it re-set the same hex).
    const glow = 0.45 + 0.55 * (isNight ? nightFactor : 0);
    for (const entry of neon) {
      entry.mat.color.setHex(entry.base).multiplyScalar(glow);
    }
  }

  return { group, colliders, landmarks, lamps, setNight, setSignal };
}
