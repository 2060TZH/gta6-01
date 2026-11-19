// Traffic cars that follow the road grid and pedestrians on the sidewalks.
// Mesh builders live here so the game, the police and the missions share them.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, TRAFFIC } from './config.js';
import { range, pick } from './random.js';

const CAR_COLORS = [0xd43d2a, 0x2a6fd4, 0xe8e8e8, 0x222831, 0xd4a02a, 0x3aa655, 0x8a5fc0, 0xd47a2a];

export function createCarMesh(color, opts = {}) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x182430 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  group.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  group.add(cabin);
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.3, 10);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, 0.36, wz);
    group.add(wheel);
    wheels.push(wheel);
  }
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff6c9 });
  for (const hx of [-0.65, 0.65]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.1), headMat);
    head.position.set(hx, 0.62, 2.22);
    group.add(head);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x991111 });
  for (const hx of [-0.65, 0.65]) {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.1), tailMat);
    tail.position.set(hx, 0.62, -2.22);
    group.add(tail);
  }
  if (opts.taxi) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.28, 0.4),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
    );
    sign.position.set(0, 1.55, -0.2);
    group.add(sign);
  }
  if (opts.cop) {
    const barMat = new THREE.MeshBasicMaterial({ color: 0xff2244 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.4), barMat);
    bar.position.set(0, 1.45, -0.2);
    group.add(bar);
    group.userData.lightBar = bar;
  }
  // Brake lights and headlights are driven per frame (see updateDriving and
  // the traffic update below); the materials live here so nobody has to
  // traverse the group to find them.
  group.userData.bodyMat = bodyMat;
  group.userData.headMat = headMat;
  group.userData.tailMat = tailMat;
  group.userData.wheels = wheels;
  return group;
}

/** Set a car mesh's brake lights on or off, and its headlights for night. */
export function setCarLights(mesh, braking, night) {
  const tail = mesh.userData.tailMat;
  if (tail) tail.color.setHex(braking ? 0xff2a2a : 0x991111);
  const head = mesh.userData.headMat;
  if (head) head.color.setHex(night ? 0xfffbe0 : 0xfff6c9);
}

const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRTS = [0xd43d2a, 0x2a6fd4, 0x3aa655, 0xe8e8e8, 0xd4a02a, 0x8a5fc0, 0x222831, 0xe07a5f];
const PANTS = [0x222831, 0x3a4a5a, 0x5a3a2a, 0x6b7a8a];

export function createPersonMesh(random, opts = {}) {
  const group = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: opts.skin ?? pick(random, SKIN) });
  const shirt = new THREE.MeshLambertMaterial({ color: opts.shirt ?? pick(random, SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: opts.pants ?? pick(random, PANTS) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
  head.position.y = 1.68;
  group.add(head);
  const hair = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.38), new THREE.MeshLambertMaterial({ color: opts.hair ?? 0x1a1a1a }));
  hair.position.y = 1.9;
  group.add(hair);
  const legGeo = new THREE.BoxGeometry(0.24, 0.72, 0.26);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.16, 0.36, 0);
  group.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.16, 0.36, 0);
  group.add(legR);
  const armGeo = new THREE.BoxGeometry(0.18, 0.66, 0.2);
  const armL = new THREE.Mesh(armGeo, shirt);
  armL.position.set(-0.42, 1.12, 0);
  group.add(armL);
  const armR = new THREE.Mesh(armGeo, shirt);
  armR.position.set(0.42, 1.12, 0);
  group.add(armR);
  group.userData.limbs = { legL, legR, armL, armR };
  return group;
}

function roadLines() {
  const lines = [];
  for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.block);
  return lines;
}

// AI traffic stays off the two edge roads: the south edge (z = +320) is sea,
// and the ±320 lines sit past the ground plane's edge once the lane offset
// is added, so cars there would drive on water or off the map. The player
// can still drive those roads; traffic just never spawns or turns onto them.
function innerRoadLines() {
  return roadLines().filter((l) => Math.abs(l) < CITY.half - 40);
}

export function createTraffic(scene, random, colliders) {
  const lines = roadLines();
  const aiLines = innerRoadLines();
  const cars = [];
  const peds = [];
  const group = new THREE.Group();
  scene.add(group);

  function randomRoadPoint() {
    const line = pick(random, aiLines);
    // Cap the along-road coordinate short of the sea: a car driving the
    // north-south roads would otherwise run past the beach into the water.
    const along = range(random, -CITY.half + 20, CITY.seaY - 10);
    return { line, along };
  }

  function makeCar(taxi, color) {
    const mesh = createCarMesh(color, { taxi });
    group.add(mesh);
    const axis = random() < 0.5 ? 'x' : 'z';
    const { line, along } = randomRoadPoint();
    const dir = random() < 0.5 ? 1 : -1;
    return {
      mesh,
      axis,
      dir,
      line,
      along,
      speed: range(random, TRAFFIC.carSpeed * 0.8, TRAFFIC.carSpeed * 1.2),
      baseSpeed: 0,
      lane: 4,
      taxi,
      color,
      driver: true,
      health: 100,
      turnCd: 0,
      braking: false,
    };
  }

  for (let i = 0; i < TRAFFIC.cars; i += 1) {
    const taxi = random() < 0.18;
    const color = taxi ? 0xfacc15 : pick(random, CAR_COLORS);
    const car = makeCar(taxi, color);
    car.baseSpeed = car.speed;
    cars.push(car);
  }

  for (let i = 0; i < TRAFFIC.peds; i += 1) {
    const mesh = createPersonMesh(random);
    group.add(mesh);
    const { line, along } = randomRoadPoint();
    const ped = {
      mesh,
      x: line + 11,
      z: along,
      targetX: line + 11,
      targetZ: range(random, -CITY.half + 20, CITY.seaY - 10),
      speed: range(random, TRAFFIC.pedSpeed * 0.8, TRAFFIC.pedSpeed * 1.3),
      walkPhase: random() * Math.PI * 2,
      fleeing: false,
    };
    peds.push(ped);
  }

  function nearestCarAhead(car) {
    let best = null;
    for (const other of cars) {
      if (other === car || other.stolen || other.axis !== car.axis || other.line !== car.line) continue;
      const gap = (other.along - car.along) * car.dir;
      if (gap > 0 && gap < 11 && (best === null || gap < best)) best = gap;
    }
    return best;
  }

  /** Put a traffic car back on the road after a New Game. */
  function reset() {
    for (const car of cars) {
      car.stolen = false;
      car.driver = true;
      car.health = 100;
      car.turnCd = 0;
      car.speed = car.baseSpeed;
      const { line, along } = randomRoadPoint();
      car.axis = random() < 0.5 ? 'x' : 'z';
      car.line = line;
      car.along = along;
      car.dir = random() < 0.5 ? 1 : -1;
    }
  }

  /** Shove a traffic car aside when the player's car hits it (game.js calls this). */
  function bumpCar(car, fromX, fromZ, force) {
    const push = Math.max(2, Math.min(9, force));
    // Push away from the player along the car's own road. v1 pushed along
    // the car's driving direction, so a car driving toward the player got
    // shoved into the player again on the next hit and pinned both cars.
    const alongCoord = car.axis === 'x' ? fromX : fromZ;
    const delta = car.along - alongCoord;
    car.along += Math.sign(delta || 1) * push;
    car.along = Math.max(-CITY.half + 10, Math.min(CITY.half - 10, car.along));
  }

  function update(dt, world) {
    const night = !!world.isNight;
    const collide = world.collide || null;
    for (const car of cars) {
      if (car.stolen) continue; // the player is driving it now
      car.turnCd = Math.max(0, car.turnCd - dt);
      const gap = nearestCarAhead(car);
      let speed = car.speed;
      let braking = false;
      if (gap !== null && gap < 11) {
        speed = Math.min(speed, Math.max(0, (gap - 6) * 1.2));
        braking = speed < car.speed * 0.5;
      }
      // Slow for the player car ahead on the same lane.
      if (world.playerCar) {
        const pc = world.playerCar;
        const pAxis = Math.abs(Math.sin(pc.heading)) < 0.5 ? 'x' : 'z';
        const pLine = pAxis === 'x' ? pc.z : pc.x;
        const pAlong = pAxis === 'x' ? pc.x : pc.z;
        if (pAxis === car.axis && Math.abs(pLine - car.line) < 5) {
          const pgap = (pAlong - car.along) * car.dir;
          if (pgap > 0 && pgap < 12) {
            speed = 0;
            braking = true;
          }
        }
      }
      car.braking = braking;
      car.along += car.dir * speed * dt;
      // The south end of a north-south road is the beach: turn around at the
      // water's edge instead of driving into the sea (v1 let cars run to z=310).
      const alongMax = car.axis === 'z' ? CITY.seaY - 6 : CITY.half - 8;
      // At an intersection, sometimes turn onto the crossing road — but only
      // once per cooldown, and only while actually moving: v1 rolled the
      // dice every frame while crossing the intersection, so cars jittered
      // through two or three turns in a row — and a stopped car sitting
      // exactly on a line could turn in place.
      const nearLine = speed > 1 ? lines.find((l) => Math.abs(car.along - l) < speed * dt + 0.6) : undefined;
      if (nearLine !== undefined && car.turnCd <= 0 && random() < 0.3) {
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        // Never turn onto the sea road (z = +320).
        if (!(newAxis === 'x' && nearLine >= CITY.seaY)) {
          car.along = nearLine;
          const newLine = car.line;
          car.line = nearLine;
          car.axis = newAxis;
          car.dir = random() < 0.5 ? 1 : -1;
          car.along = newLine;
          car.turnCd = TRAFFIC.turnCooldown;
        }
      }
      if (car.along > alongMax || car.along < -CITY.half + 8) {
        car.dir *= -1;
        car.along = Math.max(-CITY.half + 10, Math.min(alongMax, car.along));
      }
      const x = car.axis === 'x' ? car.along : car.line + (car.dir > 0 ? car.lane : -car.lane);
      const z = car.axis === 'z' ? car.along : car.line + (car.dir > 0 ? -car.lane : car.lane);
      car.mesh.position.set(x, 0, z);
      const heading = car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : car.dir > 0 ? Math.PI : 0;
      car.mesh.rotation.y = heading;
      car.x = x;
      car.z = z;
      car.heading = heading;
      setCarLights(car.mesh, braking, night);
    }

    for (const ped of peds) {
      const dx = ped.targetX - ped.x;
      const dz = ped.targetZ - ped.z;
      const dist = Math.hypot(dx, dz);
      let speed = ped.speed;
      // Flee from a wanted player or a gunshot nearby.
      if (world.threat && world.threat.active) {
        const tdx = ped.x - world.threat.x;
        const tdz = ped.z - world.threat.z;
        const tdist = Math.hypot(tdx, tdz);
        if (tdist < 14) {
          ped.x += (tdx / (tdist || 1)) * 4.5 * dt;
          ped.z += (tdz / (tdist || 1)) * 4.5 * dt;
          ped.fleeing = true;
        } else {
          ped.fleeing = false;
        }
      }
      if (!ped.fleeing) {
        if (dist < 1.5) {
          const line = pick(random, aiLines);
          ped.targetX = line + 11;
          ped.targetZ = range(random, -CITY.half + 20, CITY.seaY - 10);
        } else {
          ped.x += (dx / dist) * speed * dt;
          ped.z += (dz / dist) * speed * dt;
          ped.mesh.rotation.y = Math.atan2(dx, dz);
        }
      }
      // Sidewalks end at building fronts: keep pedestrians out of walls
      // instead of letting them clip through corners (v1 never collided).
      if (collide) {
        const fixed = collide(ped.x, ped.z, 0.6);
        ped.x = fixed.x;
        ped.z = fixed.z;
        if (fixed.hit && !ped.fleeing) {
          const line = pick(random, aiLines);
          ped.targetX = line + 11;
          ped.targetZ = range(random, -CITY.half + 20, CITY.seaY - 10);
        }
      }
      ped.walkPhase += dt * (ped.fleeing ? 14 : 7);
      const swing = Math.sin(ped.walkPhase) * 0.45;
      const limbs = ped.mesh.userData.limbs;
      if (limbs) {
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
        limbs.armL.rotation.x = -swing * 0.7;
        limbs.armR.rotation.x = swing * 0.7;
      }
      ped.mesh.position.set(ped.x, 0, ped.z);
    }
  }

  /** Cars the player can steal: traffic cars with a driver, plus parked cars the game adds. */
  function stealableCars() {
    return cars;
  }

  return { cars, peds, update, stealableCars, reset, bumpCar, group };
}
