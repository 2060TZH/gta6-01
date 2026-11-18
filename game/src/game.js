// Solmar Bay — the game itself: player, cars, camera, day cycle, screens,
// save, and the staging hooks the screenshot scenes use.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, STEP, PLAYER, CAR, WANTED, COMBAT, MISSIONS, PACKAGE_COUNT } from './config.js';
import { mulberry32, range, pick } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createTraffic, createCarMesh, createPersonMesh } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { createCombat } from './combat.js';
import { createHud } from './hud.js';
import { loadSave, writeSave, clearSave } from './save.js';

const PARKED_COLORS = [0xd43d2a, 0x2a6fd4, 0xe8e8e8, 0x222831, 0xd4a02a, 0x3aa655, 0x8a5fc0, 0xc0c0c0];

export function createGame(canvas, options = {}) {
  const seed = options.seed || 1;
  const random = mulberry32(seed);
  const documentRef = options.document || document;
  const freezeTime = !!options.shot;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9e8);
  scene.fog = new THREE.Fog(0xa8c8dc, 180, 520);

  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 1.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -120;
  sun.shadow.camera.right = 120;
  sun.shadow.camera.top = 120;
  sun.shadow.camera.bottom = -120;
  sun.shadow.camera.far = 500;
  scene.add(sun);
  scene.add(sun.target);

  const city = buildCity(scene, random);
  const traffic = createTraffic(scene, random, city.colliders);
  const police = createPolice(scene, random);
  const missions = createMissions(random);
  const combat = createCombat(scene, random);
  const audio = createAudio();
  const hud = createHud(documentRef);
  const input = createInput(canvas);

  missions.initPackages(city.landmarks);

  // ---- state -------------------------------------------------------------
  const state = {
    screen: 'title',
    timeOfDay: 0.42,
    money: 500,
    health: PLAYER.maxHealth,
    ammo: COMBAT.pistolMag,
    reserve: 48,
    wanted: 0,
    elapsed: 0,
    objective: '',
    target: null,
    missionTitle: '',
    muted: false,
    shotMode: !!options.shot,
    endTimer: 0,
  };

  const player = {
    mesh: createPersonMesh(random, { shirt: 0x2e6f8e, pants: 0x2b2f38, hair: 0x2b1a12 }),
    x: city.landmarks.spawn.x,
    z: city.landmarks.spawn.z,
    heading: Math.PI,
    vx: 0,
    vz: 0,
    walkPhase: 0,
    punchCd: 0,
    shootCd: 0,
    reloadT: 0,
    inCar: null,
  };
  scene.add(player.mesh);

  const camera = { yaw: Math.PI, pitch: 0.35 };
  const camPos = new THREE.Vector3();
  const camera3 = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
  // During a staged screenshot the car keeps driving itself forward.
  let stagingDrive = false;
  // 'follow' is the normal chase camera; 'front' looks back at the player
  // from ahead (the chase cover shot, so the pursuit is in frame).
  let cameraMode = 'follow';

  // Parked cars the player can steal, placed along the roads.
  const parkedCars = [];
  function spawnParkedCars() {
    const lines = [];
    for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.block);
    for (let i = 0; i < 10; i += 1) {
      const axis = random() < 0.5 ? 'x' : 'z';
      const line = pick(random, lines);
      const along = range(random, -CITY.half + 30, CITY.half - 30);
      const dir = random() < 0.5 ? 1 : -1;
      const color = pick(random, PARKED_COLORS);
      const mesh = createCarMesh(color);
      scene.add(mesh);
      const car = {
        mesh, color,
        x: axis === 'x' ? along : line + 8,
        z: axis === 'z' ? along : line - 8,
        heading: axis === 'x' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : dir > 0 ? Math.PI : 0,
        speed: 0, health: CAR.maxHealth, driver: null, parked: true, taxi: false, stolen: false, wrecked: false,
      };
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
      parkedCars.push(car);
    }
  }
  spawnParkedCars();

  // Hidden packages: glowing gold crates that bob and spin.
  const packageMeshes = [];
  const pkgGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  for (const pkg of missions.packages) {
    const mesh = new THREE.Mesh(pkgGeo, new THREE.MeshBasicMaterial({ color: 0xfacc15 }));
    mesh.position.set(pkg.x, 1.1, pkg.z);
    scene.add(mesh);
    packageMeshes.push(mesh);
  }

  // Mission target beacon: a column of light and a floating marker.
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.2, 60, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false }),
  );
  beacon.visible = false;
  scene.add(beacon);
  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1),
    new THREE.MeshBasicMaterial({ color: 0xfacc15 }),
  );
  marker.visible = false;
  scene.add(marker);

  // ---- helpers -----------------------------------------------------------
  function collideCircle(x, z, r) {
    let hit = false;
    for (const c of city.colliders) {
      const nx = Math.max(c.minX, Math.min(x, c.maxX));
      const nz = Math.max(c.minZ, Math.min(z, c.maxZ));
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        const d = Math.sqrt(d2) || 0.001;
        const push = (r - d) / d;
        x += dx * push;
        z += dz * push;
      }
    }
    x = Math.max(-CITY.half + 2, Math.min(CITY.half - 2, x));
    if (z > CITY.seaY + 4) {
      z = CITY.seaY + 4;
      hit = true;
    }
    z = Math.max(-CITY.half + 2, Math.min(CITY.half + 2, z));
    return { x, z, hit };
  }

  function nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    const all = [...parkedCars, ...traffic.cars];
    for (const car of all) {
      if (car.wrecked || car === player.inCar) continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    return best;
  }

  function enterCar(car) {
    if (car.driver) {
      // Yank the driver out: a carjacking, and the law notices.
      car.driver = false;
      police.addWanted(1);
      hud.showToast('Carjacked! The cops saw that.');
      audio.crash();
    }
    car.stolen = true;
    car.parked = false;
    player.inCar = car;
    player.mesh.visible = false;
    if (car.taxi) missions.startTaxi(world);
    hud.showToast(car.taxi ? 'Taxi — a fare is waiting.' : 'Press E to get out. Space is the handbrake.');
    audio.setEngine(0, true);
  }

  function exitCar() {
    const car = player.inCar;
    if (!car) return;
    player.inCar = null;
    player.mesh.visible = true;
    const backX = car.x - Math.sin(car.heading) * 3.2;
    const backZ = car.z - Math.cos(car.heading) * 3.2;
    const fixed = collideCircle(backX, backZ, PLAYER.radius);
    player.x = fixed.x;
    player.z = fixed.z;
    player.heading = car.heading;
    audio.setEngine(0, false);
    if (car.taxi) missions.taxi = null;
  }

  function respawn(reason) {
    state.money = Math.max(0, state.money - 300);
    state.health = PLAYER.maxHealth;
    state.wanted = 0;
    police.clearAll();
    combat.clearEnemies();
    if (player.inCar) {
      player.inCar.stolen = false;
      player.inCar = null;
      player.mesh.visible = true;
    }
    player.x = city.landmarks.spawn.x;
    player.z = city.landmarks.spawn.z;
    player.heading = Math.PI;
    state.screen = 'playing';
    hud.setScreen('playing');
    hud.showBanner(reason, 'You woke up at the plaza clinic. -$300.');
    if (missions.active) missions.startMission(missions.missionIndex, world);
  }

  function saveGame() {
    writeSave({
      money: state.money,
      health: state.health,
      missionIndex: missions.missionIndex,
      packagesCollected: missions.status().packagesCollected,
      packagesTaken: missions.saveData().packagesTaken,
      playerX: player.x,
      playerZ: player.z,
      timeOfDay: state.timeOfDay,
      muted: state.muted,
    });
  }

  // ---- the world interface the missions / police / combat use -----------
  const world = {
    landmarks: city.landmarks,
    get playerX() { return player.x; },
    get playerZ() { return player.z; },
    get playerInCar() { return !!player.inCar; },
    get playerCar() { return player.inCar; },
    inCar: () => !!player.inCar,
    near: (x, z, r) => Math.hypot(x - player.x, z - player.z) < r,
    wanted: () => police.wanted,
    setWanted: (n) => {
      state.wanted = police.setWanted(n);
    },
    addMoney: (n) => {
      state.money += n;
    },
    banner: (t, s) => hud.showBanner(t, s),
    toast: (t) => hud.showToast(t),
    audioPickup: () => audio.pickup(),
    audioMissionDone: () => audio.missionDone(),
    audioMissionFail: () => audio.missionFail(),
    audioMissionStart: () => audio.pickup(),
    audioGunshot: () => audio.gunshot(),
    audioCrash: () => audio.crash(),
    saveGame,
    setTarget: (x, z, label) => {
      state.target = { x, z, label };
      beacon.visible = true;
      marker.visible = true;
      beacon.position.set(x, 30, z);
      marker.position.set(x, 8, z);
    },
    clearTarget: () => {
      state.target = null;
      beacon.visible = false;
      marker.visible = false;
    },
    spawnShooters: (positions) => combat.spawnShooters(positions),
    shootersAlive: () => combat.shootersAlive(),
    collide: (x, z, r) => collideCircle(x, z, r),
    damagePlayer: (n) => damagePlayer(n),
    damagePlayerCar: (n) => damagePlayerCar(n),
    pushPlayer: (fx, fz) => {
      player.vx += fx;
      player.vz += fz;
    },
    pushPlayerCar: (fx, fz) => {
      if (player.inCar) player.inCar.speed += (fx * Math.sin(player.inCar.heading) + fz * Math.cos(player.inCar.heading)) * 0.4;
    },
    busted: () => {
      state.screen = 'end';
      hud.setEnd('BUSTED', 'The Solmar Bay PD caught up with you.');
      hud.setScreen('end');
      state.endTimer = 3;
      state.endReason = 'busted';
    },
    onWantedChange: (n) => {
      state.wanted = n;
    },
    sirenOn: false,
  };

  function damagePlayer(n) {
    if (state.screen !== 'playing') return;
    state.health -= n;
    const flash = documentRef.getElementById('damage-flash');
    if (flash) {
      flash.style.opacity = '0.45';
      setTimeout(() => { flash.style.opacity = '0'; }, 130);
    }
    if (state.health <= 0) {
      state.health = 0;
      state.screen = 'end';
      hud.setEnd('WASTED', 'Mara went down in Solmar Bay.');
      hud.setScreen('end');
      state.endTimer = 3;
      state.endReason = 'wasted';
      audio.setEngine(0, false);
    }
  }

  function damagePlayerCar(n) {
    const car = player.inCar;
    if (!car) return;
    car.health -= n;
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
      car.mesh.material = car.mesh.material;
      hud.showToast('Your car is wrecked!');
      audio.crash();
      exitCar();
    }
  }

  // ---- per-frame updates -------------------------------------------------
  // Rising-edge detection for keys that toggle things (E, Escape): the input
  // layer queues each physical press, so a quick tap is never lost and
  // holding the key fires only once.
  function edge(code) {
    return input.takePressed(code);
  }

  function updatePlayer(dt) {
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.shootCd = Math.max(0, player.shootCd - dt);
    if (player.reloadT > 0) {
      player.reloadT -= dt;
      if (player.reloadT <= 0) {
        const need = COMBAT.pistolMag - state.ammo;
        const take = Math.min(need, state.reserve);
        state.ammo += take;
        state.reserve -= take;
      }
    }
    const { dx, dy } = input.consumeMouse();
    camera.yaw -= dx * 0.0028;
    camera.pitch = Math.max(0.05, Math.min(1.1, camera.pitch + dy * 0.0022));

    const mv = input.moveVector();
    const fx = Math.sin(camera.yaw);
    const fz = Math.cos(camera.yaw);
    const rx = -Math.cos(camera.yaw);
    const rz = Math.sin(camera.yaw);
    let mx = fx * mv.f + rx * mv.r;
    let mz = fz * mv.f + rz * mv.r;
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    const running = input.pressed('ShiftLeft') || input.pressed('ShiftRight');
    const speed = running ? PLAYER.runSpeed : PLAYER.walkSpeed;
    player.vx += (mx * speed - player.vx) * Math.min(1, PLAYER.accel * dt / speed + 0.12);
    player.vz += (mz * speed - player.vz) * Math.min(1, PLAYER.accel * dt / speed + 0.12);
    if (len > 0) {
      const targetHeading = Math.atan2(mx, mz);
      let dh = targetHeading - player.heading;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      player.heading += dh * Math.min(1, 14 * dt);
    }
    const nx = player.x + player.vx * dt;
    const nz = player.z + player.vz * dt;
    const fixed = collideCircle(nx, nz, PLAYER.radius);
    if (fixed.hit) {
      player.vx *= 0.4;
      player.vz *= 0.4;
    }
    player.x = fixed.x;
    player.z = fixed.z;
    player.walkPhase += dt * Math.hypot(player.vx, player.vz) * 1.6;
    const swing = Math.sin(player.walkPhase) * (len > 0 ? 0.55 : 0);
    const limbs = player.mesh.userData.limbs;
    if (limbs) {
      limbs.legL.rotation.x = swing;
      limbs.legR.rotation.x = -swing;
      limbs.armL.rotation.x = -swing * 0.7;
      limbs.armR.rotation.x = swing * 0.7;
    }
    player.mesh.position.set(player.x, 0, player.z);
    player.mesh.rotation.y = player.heading;

    // Interact: E enters the nearest car, F punches, click shoots, R reloads.
    if (edge('KeyE')) {
      const car = nearestCar(4.2);
      if (car) enterCar(car);
    }
    if (input.pressed('KeyF') && player.punchCd <= 0) {
      player.punchCd = PLAYER.punchCooldown;
      audio.punch();
      const targets = [
        ...combat.enemies.map((e) => ({ x: e.x, z: e.z, alive: e.alive, damage: (n) => { e.health -= n; if (e.health <= 0 && e.alive) { e.alive = false; e.mesh.rotation.x = -Math.PI / 2; e.mesh.position.y = 0.3; } }, mesh: e.mesh })),
        ...police.footCops.map((c) => ({ x: c.x, z: c.z, alive: true, damage: () => { c.x += Math.sin(player.heading) * 3; c.z += Math.cos(player.heading) * 3; }, mesh: c.mesh })),
      ];
      combat.playerPunch({ x: player.x, z: player.z }, { x: Math.sin(player.heading), z: Math.cos(player.heading) }, targets);
      if (police.wanted === 0 && targets.length) police.addWanted(1);
    }
    if (input.state.mouseDown && player.shootCd <= 0 && player.reloadT <= 0) {
      if (state.ammo > 0) {
        player.shootCd = COMBAT.pistolCooldown;
        state.ammo -= 1;
        audio.gunshot();
        const dir = { x: Math.sin(camera.yaw), z: Math.cos(camera.yaw) };
        combat.playerShoot({ x: player.x, z: player.z }, dir, () => {
          if (police.wanted < 2) police.addWanted(1);
        });
        if (police.wanted === 0) police.addWanted(1);
      } else {
        player.reloadT = COMBAT.pistolReload;
      }
    }
    if (input.pressed('KeyR') && state.ammo < COMBAT.pistolMag && state.reserve > 0 && player.reloadT <= 0) {
      player.reloadT = COMBAT.pistolReload;
    }
  }

  function updateDriving(dt) {
    const car = player.inCar;
    if (!car) return;
    input.consumeMouse(); // look is fixed to the chase camera while driving
    const mv = input.moveVector();
    const forward = stagingDrive ? 1 : mv.f;
    const steerInput = stagingDrive ? 0 : mv.r;
    const handbrake = input.pressed('Space');
    if (forward > 0) car.speed += CAR.accel * dt;
    else if (forward < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed -= CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * 8 * dt;
      if (Math.abs(car.speed) < 0.4) car.speed = 0;
    }
    car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
    const steerAuthority = Math.min(1, Math.abs(car.speed) / 8);
    car.heading += steerInput * CAR.steer * steerAuthority * Math.sign(car.speed) * dt * (handbrake ? 1.6 : 1);
    if (handbrake) car.speed *= Math.max(0, 1 - 1.8 * dt);
    const nx = car.x + Math.sin(car.heading) * car.speed * dt;
    const nz = car.z + Math.cos(car.heading) * car.speed * dt;
    const fixed = collideCircle(nx, nz, 2.3);
    if (fixed.hit && Math.abs(car.speed) > 8) {
      audio.crash();
      damagePlayerCar(Math.round(Math.abs(car.speed) * 0.5));
      car.speed *= 0.45;
    } else if (fixed.hit) {
      car.speed *= 0.6;
    }
    car.x = fixed.x;
    car.z = fixed.z;
    // Bump traffic cars out of the way.
    for (const other of traffic.cars) {
      if (other.stolen) continue;
      const d = Math.hypot(other.x - car.x, other.z - car.z);
      if (d < 4.4) {
        other.along += Math.sign(other.along - (other.axis === 'x' ? car.x : car.z)) * 0;
        car.speed *= 0.82;
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    audio.setEngine(Math.abs(car.speed) / CAR.maxSpeed, true);
    if (edge('KeyE')) exitCar();
  }

  function updateCamera(dt) {
    const dist = player.inCar ? 9 : 8;
    const height = player.inCar ? 4.2 : 4.0 + camera.pitch * 2.0;
    if (cameraMode === 'front' && player.inCar) {
      const fx = Math.sin(player.heading);
      const fz = Math.cos(player.heading);
      const rx = -Math.cos(player.heading);
      const rz = Math.sin(player.heading);
      camPos.set(player.x + fx * 15 + rx * 7, 4.6, player.z + fz * 15 + rz * 7);
      camera3.position.lerp(camPos, 1 - Math.pow(0.0001, dt));
      camera3.lookAt(player.x, 1.6, player.z);
      return;
    }
    const bx = player.x - Math.sin(camera.yaw) * dist;
    const bz = player.z - Math.cos(camera.yaw) * dist;
    camPos.set(bx, height, bz);
    camera3.position.lerp(camPos, 1 - Math.pow(0.0001, dt));
    camera3.lookAt(player.x, player.inCar ? 1.6 : 1.5, player.z);
    if (player.inCar) camera.yaw = player.heading;
  }

  function updateSky() {
    const t = state.timeOfDay;
    const sunH = Math.sin((t - 0.25) * Math.PI * 2);
    const daylight = Math.max(0, Math.min(1, sunH * 1.6 + 0.25));
    const dusk = Math.max(0, 1 - Math.abs(sunH) * 4) * (t > 0.6 && t < 0.85 ? 1 : 0);
    const sky = new THREE.Color(0x0b1026).lerp(new THREE.Color(0x8ec9e8), daylight);
    if (dusk > 0) sky.lerp(new THREE.Color(0xff9a5c), dusk * 0.6);
    scene.background = sky;
    scene.fog.color.copy(sky).lerp(new THREE.Color(0xa8c8dc), daylight * 0.4);
    sun.intensity = 0.35 + daylight * 1.5;
    sun.position.set(
      player.x + Math.cos((t - 0.25) * Math.PI * 2) * 180,
      60 + Math.max(8, sunH * 160),
      player.z + Math.sin((t - 0.25) * Math.PI * 2) * 180,
    );
    sun.target.position.set(player.x, 0, player.z);
    hemi.intensity = 0.45 + daylight * 0.6;
    city.setNight(daylight < 0.35);
  }

  function step(dt) {
    state.elapsed += dt;
    if (!freezeTime) state.timeOfDay = (state.timeOfDay + dt / 900) % 1;
    if (state.screen === 'playing') {
      if (player.inCar) updateDriving(dt);
      else updatePlayer(dt);
      const threat = { active: police.wanted > 0, x: player.x, z: player.z };
      traffic.update(dt, { playerCar: player.inCar, threat });
      const policeState = police.update(dt, world);
      state.wanted = policeState.wanted;
      combat.update(dt, world);
      missions.update(dt, world);
      audio.setSiren(world.sirenOn);
      if (state.target) {
        marker.position.y = 8 + Math.sin(state.elapsed * 2.4) * 0.8;
        marker.rotation.y += dt * 1.5;
      }
      for (let i = 0; i < packageMeshes.length; i += 1) {
        const pkg = missions.packages[i];
        if (pkg.taken) {
          packageMeshes[i].visible = false;
        } else {
          packageMeshes[i].position.y = 1.1 + Math.sin(state.elapsed * 2 + i) * 0.25;
          packageMeshes[i].rotation.y += dt;
        }
      }
      if (edge('Escape')) {
        state.screen = 'paused';
        hud.setScreen('pause');
        audio.setEngine(0, false);
        input.clearPressed();
      }
    } else if (state.screen === 'title') {
      // The title screen already shows the living city behind it.
      traffic.update(dt, { playerCar: null, threat: { active: false } });
    } else if (state.screen === 'end') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) respawn(state.endReason === 'busted' ? 'BUSTED' : 'WASTED');
    } else if (state.screen === 'paused') {
      if (edge('Escape')) {
        state.screen = 'playing';
        hud.setScreen('playing');
        input.clearPressed();
      }
    }
    updateSky();
    updateCamera(dt);
    if (missions.active) state.objective = missions.active.def.brief;
    hud.update({
      health: state.health,
      money: state.money,
      wanted: state.wanted,
      ammo: state.ammo,
      mag: state.reserve,
      speedKmh: player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0,
      timeOfDay: state.timeOfDay,
      missionTitle: missions.active ? `Mission ${missions.missionIndex + 1} — ${missions.active.def.title}` : state.missionTitle,
      objective: state.objective,
      playerX: player.x,
      playerZ: player.z,
      heading: player.heading,
      target: state.target,
      cops: [...police.copCars, ...police.footCops],
      trafficCars: traffic.cars.filter((c) => !c.stolen),
      packages: missions.packages,
      inCar: !!player.inCar,
    });
  }

  // ---- screens / flow ----------------------------------------------------
  function startGame(newGame) {
    audio.start();
    audio.startMusic();
    if (newGame) {
      clearSave();
      state.money = 500;
      state.health = PLAYER.maxHealth;
      state.ammo = COMBAT.pistolMag;
      state.reserve = 48;
      state.timeOfDay = 0.42;
      player.x = city.landmarks.spawn.x;
      player.z = city.landmarks.spawn.z;
      player.heading = Math.PI;
    } else {
      const save = loadSave();
      if (save) {
        state.money = save.money ?? 500;
        state.health = save.health ?? PLAYER.maxHealth;
        state.timeOfDay = save.timeOfDay ?? 0.42;
        player.x = save.playerX ?? city.landmarks.spawn.x;
        player.z = save.playerZ ?? city.landmarks.spawn.z;
        missions.applySave(save, world);
      }
    }
    state.screen = 'playing';
    hud.setScreen('playing');
    input.lockPointer();
    missions.startMission(missions.missionIndex, world);
    state.objective = MISSIONS[missions.missionIndex] ? MISSIONS[missions.missionIndex].brief : 'Free roam.';
  }

  function stageShot(name) {
    state.screen = 'playing';
    hud.setScreen('playing');
    state.muted = true;
    if (name === 'chase') {
      state.timeOfDay = 0.42;
      const car = parkedCars[0];
      // On the x=0 road line, heading north, so the staged chase stays on the road.
      car.x = 0;
      car.z = 200;
      car.heading = Math.PI;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      player.x = car.x;
      player.z = car.z;
      enterCar(car);
      car.speed = 24;
      stagingDrive = true;
      police.setWanted(3);
      state.wanted = 3;
      state.objective = 'Sunset Run — deliver the package to the marina. 0:58 left.';
      state.missionTitle = 'Mission 2 — Sunset Run';
      world.setTarget(city.landmarks.marina.x, city.landmarks.marina.z, 'Marina');
      camera.yaw = Math.PI;
      cameraMode = 'front';
      for (let i = 0; i < 120; i += 1) step(STEP);
      // The pursuit, close behind and flanking, so the chase reads in one frame.
      const pursuit = [
        { dx: -8, behind: 18 },
        { dx: 9, behind: 27 },
        { dx: 2, behind: 38 },
      ];
      police.copCars.slice(0, 3).forEach((cop, i) => {
        cop.x = player.x + pursuit[i].dx;
        cop.z = player.z + pursuit[i].behind;
        cop.heading = Math.PI;
        cop.speed = 32;
        cop.mesh.position.set(cop.x, 0, cop.z);
        cop.mesh.rotation.y = cop.heading;
      });
    } else if (name === 'plaza') {
      state.timeOfDay = 0.45;
      player.x = city.landmarks.plaza.x + 5;
      player.z = city.landmarks.plaza.z + 14;
      player.heading = Math.PI;
      camera.yaw = Math.PI;
      state.objective = 'Hotwire — steal any car on the street and bring it to the garage.';
      state.missionTitle = 'Mission 1 — Hotwire';
      world.setTarget(city.landmarks.garage.x, city.landmarks.garage.z, 'Garage');
      for (let i = 0; i < 90; i += 1) step(STEP);
    } else if (name === 'mission') {
      state.timeOfDay = 0.76;
      player.x = city.landmarks.docks.x + 6;
      player.z = city.landmarks.docks.z - 14;
      player.heading = 0.4;
      camera.yaw = 0.4;
      state.ammo = 12;
      state.reserve = 48;
      police.setWanted(2);
      state.wanted = 2;
      combat.spawnShooters([
        { x: city.landmarks.docks.x - 12, z: city.landmarks.docks.z - 6 },
        { x: city.landmarks.docks.x + 10, z: city.landmarks.docks.z - 10 },
        { x: city.landmarks.docks.x - 4, z: city.landmarks.docks.z + 8 },
        { x: city.landmarks.docks.x + 16, z: city.landmarks.docks.z + 4 },
      ]);
      state.objective = 'Dock Deal — take out the ambush crew and grab the case.';
      state.missionTitle = 'Mission 5 — Dock Deal';
      world.setTarget(city.landmarks.docks.x, city.landmarks.docks.z, 'Crew');
      for (let i = 0; i < 90; i += 1) step(STEP);
      state.health = PLAYER.maxHealth; // the crew shot the player during staging
    } else {
      // night
      state.timeOfDay = 0.97;
      const car = parkedCars[1];
      // On the x=160 road line, heading north into neon downtown.
      car.x = 160;
      car.z = -40;
      car.heading = Math.PI;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      player.x = car.x;
      player.z = car.z;
      enterCar(car);
      car.speed = 18;
      stagingDrive = true;
      police.setWanted(1);
      state.wanted = 1;
      state.objective = 'Free roam — downtown Solmar Bay after dark.';
      state.missionTitle = 'Free Roam';
      world.setTarget(city.landmarks.hideout.x, city.landmarks.hideout.z, 'Hideout');
      camera.yaw = Math.PI;
      for (let i = 0; i < 120; i += 1) step(STEP);
    }
    updateCamera(0.016);
    renderer.render(scene, camera3);
  }

  // ---- main loop ---------------------------------------------------------
  let last = performance.now();
  let acc = 0;
  let rafId = 0;
  function loop(now) {
    rafId = requestAnimationFrame(loop);
    const frameDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += frameDt;
    let guard = 0;
    while (acc >= STEP && guard < 8) {
      step(STEP);
      acc -= STEP;
      guard += 1;
    }
    renderer.render(scene, camera3);
  }

  window.addEventListener('resize', () => {
    camera3.aspect = window.innerWidth / window.innerHeight;
    camera3.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // First frame so the title screen already shows the city behind it.
  updateSky();
  updateCamera(0.016);
  renderer.render(scene, camera3);

  return {
    state,
    player,
    world,
    audio,
    hud,
    missions,
    police,
    scene,
    parkedCars,
    startGame,
    stageShot,
    saveGame,
    step,
    run() {
      last = performance.now();
      rafId = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(rafId);
    },
    snapshot() {
      return {
        screen: state.screen,
        wanted: state.wanted,
        money: state.money,
        health: state.health,
        ammo: state.ammo,
        mission: missions.active ? missions.active.def.title : null,
        missionIndex: missions.missionIndex,
        playerX: Math.round(player.x),
        playerZ: Math.round(player.z),
        inCar: !!player.inCar,
        speed: player.inCar ? Math.round(Math.abs(player.inCar.speed) * 3.6) : 0,
        cops: police.copCars.length + police.footCops.length,
        traffic: traffic.cars.length,
        peds: traffic.peds.length,
        timeOfDay: state.timeOfDay,
      };
    },
  };
}
