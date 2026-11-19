// The wanted level and the police who answer it: pursuit cars, foot cops,
// losing the heat, and getting busted.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, WANTED } from './config.js';
import { createCarMesh, createPersonMesh, setCarLights } from './traffic.js';
import { range } from './random.js';

export function createPolice(scene, random) {
  const group = new THREE.Group();
  scene.add(group);
  let wanted = 0;
  let unseenTimer = 0;
  let bustTimer = 0;
  let flashPhase = 0;
  const copCars = [];
  const footCops = [];

  function addWanted(n) {
    wanted = Math.max(0, Math.min(WANTED.maxStars, wanted + n));
    unseenTimer = 0;
    return wanted;
  }

  function setWanted(n) {
    wanted = Math.max(0, Math.min(WANTED.maxStars, n));
    unseenTimer = 0;
    return wanted;
  }

  function clearAll() {
    for (const cop of copCars) group.remove(cop.mesh);
    for (const cop of footCops) group.remove(cop.mesh);
    copCars.length = 0;
    footCops.length = 0;
    wanted = 0;
    unseenTimer = 0;
    bustTimer = 0;
  }

  // Spawn on a road near the player, never inside a building: v1 dropped
  // pursuit cars at a raw 90-unit ring, so a cop could start inside a
  // tower and shove its way out through the walls.
  function spawnPoint(px, pz, distance, world) {
    for (let tries = 0; tries < 8; tries += 1) {
      const angle = random() * Math.PI * 2;
      let x = px + Math.cos(angle) * distance;
      let z = pz + Math.sin(angle) * distance;
      x = Math.max(-CITY.half + 10, Math.min(CITY.half - 10, x));
      z = Math.max(-CITY.half + 10, Math.min(CITY.half - 10, z));
      if (world && world.collide) {
        const fixed = world.collide(x, z, 2.4);
        if (!fixed.hit) return { x, z };
      } else {
        return { x, z };
      }
    }
    return { x: px + distance, z: pz };
  }

  function spawnCopCar(px, pz, world) {
    const mesh = createCarMesh(0x1d4ed8, { cop: true });
    group.add(mesh);
    const at = spawnPoint(px, pz, WANTED.copSpawnDistance, world);
    const cop = {
      mesh,
      x: at.x,
      z: at.z,
      heading: random() * Math.PI * 2,
      speed: 0,
      ramCooldown: 0,
    };
    copCars.push(cop);
    return cop;
  }

  function spawnFootCop(px, pz, world) {
    const mesh = createPersonMesh(random, { shirt: 0x1d4ed8, pants: 0x111827, hair: 0x111111 });
    group.add(mesh);
    const at = spawnPoint(px, pz, 30, world);
    const cop = {
      mesh,
      x: at.x,
      z: at.z,
      speed: 6.5,
      punchCooldown: 0,
      walkPhase: random() * 6,
    };
    footCops.push(cop);
    return cop;
  }

  function update(dt, world) {
    flashPhase += dt * 6;
    const px = world.playerX;
    const pz = world.playerZ;

    // Spawn pursuit cars up to the wanted level.
    const wantCars = Math.min(wanted, WANTED.maxCopCars);
    while (copCars.length < wantCars) spawnCopCar(px, pz, world);
    while (copCars.length > wantCars) {
      const cop = copCars.pop();
      group.remove(cop.mesh);
    }
    // Foot cops join the chase once the player is on foot at 2+ stars.
    if (wanted >= 2 && !world.playerInCar) {
      while (footCops.length < Math.min(wanted - 1, WANTED.maxFootCops)) spawnFootCop(px, pz, world);
    } else {
      while (footCops.length > 0) {
        const cop = footCops.pop();
        group.remove(cop.mesh);
      }
    }

    // Cop cars chase: steer at the player, push out of buildings, ram on contact.
    for (const cop of copCars) {
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const dist = Math.hypot(dx, dz) || 1;
      const wantHeading = Math.atan2(dx, dz);
      let dh = wantHeading - cop.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      cop.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, dh));
      cop.speed = Math.min(WANTED.copCarSpeed, cop.speed + 22 * dt);
      const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
      const fixed = world.collide(nx, nz, 2.2);
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      const bar = cop.mesh.userData.lightBar;
      if (bar) bar.material.color.setHex(Math.sin(flashPhase) > 0 ? 0xff2244 : 0x2266ff);
      setCarLights(cop.mesh, false, !!world.isNight);
      cop.ramCooldown = Math.max(0, cop.ramCooldown - dt);
      if (dist < 4.5 && cop.ramCooldown <= 0) {
        cop.ramCooldown = 1.2;
        if (world.playerInCar) {
          world.damagePlayerCar(9);
          world.pushPlayerCar(Math.sin(cop.heading) * 9, Math.cos(cop.heading) * 9);
        } else {
          world.damagePlayer(12);
          world.pushPlayer(Math.sin(cop.heading) * 6, Math.cos(cop.heading) * 6);
        }
        world.audioCrash();
      }
    }

    // Foot cops run the player down and try to bust them. They collide with
    // buildings now: v1 let them walk straight through walls to reach the player.
    let nearestCop = Infinity;
    for (const cop of footCops) {
      const dx = px - cop.x;
      const dz = pz - cop.z;
      const dist = Math.hypot(dx, dz) || 1;
      nearestCop = Math.min(nearestCop, dist);
      const nx = cop.x + (dx / dist) * cop.speed * dt;
      const nz = cop.z + (dz / dist) * cop.speed * dt;
      const fixed = world.collide ? world.collide(nx, nz, 0.9) : { x: nx, z: nz };
      cop.x = fixed.x;
      cop.z = fixed.z;
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = Math.atan2(dx, dz);
      cop.walkPhase += dt * 11;
      const swing = Math.sin(cop.walkPhase) * 0.5;
      const limbs = cop.mesh.userData.limbs;
      if (limbs) {
        limbs.legL.rotation.x = swing;
        limbs.legR.rotation.x = -swing;
      }
      cop.punchCooldown = Math.max(0, cop.punchCooldown - dt);
      if (dist < 1.8 && cop.punchCooldown <= 0) {
        cop.punchCooldown = 1.1;
        world.damagePlayer(7);
      }
    }
    if (!world.playerInCar && nearestCop < WANTED.bustDistance && wanted > 0) {
      bustTimer += dt;
      if (bustTimer >= WANTED.bustSeconds) {
        bustTimer = 0;
        world.busted();
      }
    } else {
      bustTimer = 0;
    }

    // Lose the heat: no cop close for a while, one star drops off.
    const nearestCar = copCars.reduce((m, c) => Math.min(m, Math.hypot(c.x - px, c.z - pz)), Infinity);
    const nearest = Math.min(nearestCar, nearestCop);
    if (wanted > 0 && nearest > 70) {
      unseenTimer += dt;
      if (unseenTimer >= WANTED.loseSightSeconds) {
        unseenTimer = 0;
        wanted -= 1;
        world.onWantedChange(wanted);
      }
    } else {
      unseenTimer = 0;
    }
    world.sirenOn = wanted > 0 && copCars.length > 0;
    return { wanted, copCars, footCops, bustTimer };
  }

  return {
    get wanted() {
      return wanted;
    },
    get bustProgress() {
      return bustTimer / WANTED.bustSeconds;
    },
    addWanted,
    setWanted,
    clearAll,
    update,
    copCars,
    footCops,
  };
}
