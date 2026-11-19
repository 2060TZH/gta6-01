// Solmar Bay — the game itself: player, cars, camera, day cycle, screens,
// save, and the staging hooks the screenshot scenes use.
import * as THREE from '../vendor/three.module.min.js';
import { CITY, STEP, PLAYER, CAR, WANTED, COMBAT, MISSIONS, PACKAGE_COUNT } from './config.js';
import { mulberry32, range, pick, clamp } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import { createTraffic, createCarMesh, createPersonMesh, setCarLights } from './traffic.js';
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

  missions.initPackages(city.landmarks, city.colliders);

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
    isNight: false,
    skidCd: 0,
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

  // Parked cars the player can steal, placed along the roads. The south
  // edge road (z = +320) is sea, so no car ever parks on it.
  const parkedCars = [];
  function spawnParkedCars() {
    const lines = [];
    for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.block);
    const innerLines = lines.filter((l) => Math.abs(l) < CITY.half - 40);
    for (let i = 0; i < 10; i += 1) {
      const axis = random() < 0.5 ? 'x' : 'z';
      const line = pick(random, axis === 'x' ? innerLines : lines);
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
        flashT: 0,
      };
      // Home spot, so a New Game can put every parked car back where it was.
      car.homeX = car.x;
      car.homeZ = car.z;
      car.homeHeading = car.heading;
      mesh.position.set(car.x, 0, car.z);
      mesh.rotation.y = car.heading;
      parkedCars.push(car);
    }
  }
  spawnParkedCars();

  function resetParkedCars() {
    for (const car of parkedCars) {
      car.x = car.homeX;
      car.z = car.homeZ;
      car.heading = car.homeHeading;
      car.speed = 0;
      car.health = CAR.maxHealth;
      car.parked = true;
      car.stolen = false;
      car.wrecked = false;
      car.flashT = 0;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      if (car.mesh.userData.bodyMat) car.mesh.userData.bodyMat.color.setHex(car.color);
    }
  }

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

  // Damage smoke for the player's car: three grey puffs that grow and drift
  // while the car is below the smoke threshold, so damage reads at a glance.
  const smokeGroup = new THREE.Group();
  smokeGroup.visible = false;
  const smokePuffs = [];
  const smokeMat = new THREE.MeshBasicMaterial({ color: 0x555555, transparent: true, opacity: 0.55, depthWrite: false });
  for (let i = 0; i < 3; i += 1) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), smokeMat.clone());
    puff.position.set(0, 1.2 + i * 0.5, -1.2);
    smokeGroup.add(puff);
    smokePuffs.push(puff);
  }
  scene.add(smokeGroup);

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
    car.flashT = 0;
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
    if (car.taxi) {
      // Ending the shift drops the fare and hands the beacon back to the
      // mission: v1 left a stale taxi marker pointing at nothing.
      missions.clearTaxi(world);
      missions.restoreTarget(world);
    }
  }

  function respawn(reason) {
    state.money = Math.max(0, state.money - 300);
    state.health = PLAYER.maxHealth;
    state.wanted = 0;
    police.clearAll();
    combat.clearEnemies();
    missions.cancelScheduled();
    missions.clearTaxi(world);
    if (player.inCar) {
      player.inCar.stolen = false;
      player.inCar = null;
      player.mesh.visible = true;
    }
    player.x = city.landmarks.spawn.x;
    player.z = city.landmarks.spawn.z;
    player.heading = Math.PI;
    player.vx = 0;
    player.vz = 0;
    player.punchCd = 0;
    player.shootCd = 0;
    player.reloadT = 0;
    smokeGroup.visible = false;
    state.screen = 'playing';
    hud.setScreen('playing');
    hud.showBanner(reason, 'You woke up at the plaza clinic. -$300.');
    if (missions.active) missions.startMission(missions.missionIndex, world);
    saveGame();
  }

  function saveGame() {
    const ms = missions.saveData();
    const car = player.inCar;
    const ok = writeSave({
      money: state.money,
      health: state.health,
      ammo: state.ammo,
      reserve: state.reserve,
      wanted: state.wanted,
      missionIndex: ms.missionIndex,
      missionStage: ms.missionStage,
      missionTimer: ms.missionTimer,
      missionCollected: ms.missionCollected,
      packagesCollected: ms.packagesCollected,
      packagesTaken: ms.packagesTaken,
      taxi: ms.taxi,
      playerX: player.x,
      playerZ: player.z,
      playerHeading: player.heading,
      timeOfDay: state.timeOfDay,
      muted: state.muted,
      car: car ? {
        x: car.x,
        z: car.z,
        heading: car.heading,
        health: Math.round(car.health),
        color: car.color,
        taxi: !!car.taxi,
      } : null,
    });
    if (ok) hud.showSaved();
    return ok;
  }

  // The beacon shows one target at a time. Mission and taxi targets live in
  // separate slots: a taxi fare temporarily takes over the beacon, and when
  // the fare ends the mission target comes back instead of being lost (v1
  // overwrote the mission beacon and never restored it).
  let missionTarget = null;
  let taxiTarget = null;
  function updateBeacon() {
    const t = taxiTarget || missionTarget;
    state.target = t;
    if (t) {
      beacon.visible = true;
      marker.visible = true;
      beacon.position.set(t.x, 30, t.z);
      marker.position.set(t.x, 8, t.z);
    } else {
      beacon.visible = false;
      marker.visible = false;
    }
  }

  // ---- the world interface the missions / police / combat use -----------
  const world = {
    landmarks: city.landmarks,
    colliders: city.colliders,
    get isNight() { return state.isNight; },
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
      missionTarget = { x, z, label };
      updateBeacon();
    },
    clearTarget: () => {
      missionTarget = null;
      updateBeacon();
    },
    setTaxiTarget: (x, z, label) => {
      taxiTarget = { x, z, label };
      updateBeacon();
    },
    clearTaxiTarget: () => {
      taxiTarget = null;
      updateBeacon();
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
    // Hit flash: the bodywork flashes white for a beat, then restores.
    car.flashT = 0.15;
    if (car.health <= 0 && !car.wrecked) {
      car.wrecked = true;
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
      // Wanted stars only when the punch actually lands: v1 flagged the
      // player for punching thin air while a cop stood anywhere on the map.
      const hit = combat.playerPunch({ x: player.x, z: player.z }, { x: Math.sin(player.heading), z: Math.cos(player.heading) }, targets);
      if (hit && police.wanted === 0) police.addWanted(1);
    }
    if (input.state.mouseDown && player.shootCd <= 0 && player.reloadT <= 0) {
      if (state.ammo > 0) {
        player.shootCd = COMBAT.pistolCooldown;
        state.ammo -= 1;
        audio.gunshot();
        const dir = { x: Math.sin(camera.yaw), z: Math.cos(camera.yaw) };
        combat.playerShoot({ x: player.x, z: player.z }, dir, () => {
          if (police.wanted < 2) police.addWanted(1);
        }, world);
        if (police.wanted === 0) police.addWanted(1);
      } else if (state.reserve > 0) {
        // Empty mag: reload, but only when there is reserve ammo to load.
        // v1 started the reload animation with an empty reserve, forever.
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
    if (handbrake) {
      car.speed *= Math.max(0, 1 - 1.8 * dt);
      // Handbrake at speed is a drift: tyre noise, throttled so it cannot
      // spam the audio graph every frame.
      if (Math.abs(car.speed) > 12 && state.skidCd <= 0) {
        state.skidCd = 0.5;
        audio.skid();
      }
    }
    state.skidCd = Math.max(0, (state.skidCd || 0) - dt);
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
    // A wrecked car throws the player out inside damagePlayerCar: stop here
    // instead of dragging the player back to the car's seat (v1 did that).
    if (!player.inCar) return;
    car.x = fixed.x;
    car.z = fixed.z;
    // Shove traffic cars aside instead of just slowing down: v1's bump line
    // multiplied the push by zero, so it did nothing at all.
    for (const other of traffic.cars) {
      if (other.stolen) continue;
      const d = Math.hypot(other.x - car.x, other.z - car.z);
      if (d < 4.4 && Math.abs(car.speed) > 4) {
        traffic.bumpCar(other, car.x, car.z, Math.abs(car.speed));
        car.speed *= 0.82;
        audio.crash();
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    player.x = car.x;
    player.z = car.z;
    player.heading = car.heading;
    setCarLights(car.mesh, forward < 0 || handbrake, state.isNight);
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

  // Preallocated colours: v1 built two (then three) THREE.Color objects on
  // every frame just to paint the sky, which churns the GC at 60fps.
  const skyNightColor = new THREE.Color(0x0b1026);
  const skyDayColor = new THREE.Color(0x8ec9e8);
  const skyDuskColor = new THREE.Color(0xff9a5c);
  const fogDayColor = new THREE.Color(0xa8c8dc);
  const skyColor = new THREE.Color(0x8ec9e8);

  function updateSky() {
    const t = state.timeOfDay;
    const sunH = Math.sin((t - 0.25) * Math.PI * 2);
    const daylight = Math.max(0, Math.min(1, sunH * 1.6 + 0.25));
    const dusk = Math.max(0, 1 - Math.abs(sunH) * 4) * (t > 0.6 && t < 0.85 ? 1 : 0);
    skyColor.copy(skyNightColor).lerp(skyDayColor, daylight);
    if (dusk > 0) skyColor.lerp(skyDuskColor, dusk * 0.6);
    scene.background = skyColor;
    scene.fog.color.copy(skyColor).lerp(fogDayColor, daylight * 0.4);
    sun.intensity = 0.35 + daylight * 1.5;
    sun.position.set(
      player.x + Math.cos((t - 0.25) * Math.PI * 2) * 180,
      60 + Math.max(8, sunH * 160),
      player.z + Math.sin((t - 0.25) * Math.PI * 2) * 180,
    );
    sun.target.position.set(player.x, 0, player.z);
    hemi.intensity = 0.45 + daylight * 0.6;
    const night = daylight < 0.35;
    state.isNight = night;
    city.setNight(night, 1 - daylight);
    // Traffic lights flip every five seconds of game time.
    city.setSignal(Math.floor(state.elapsed / 5) % 2 === 0);
  }

  function step(dt) {
    state.elapsed += dt;
    if (!freezeTime) state.timeOfDay = (state.timeOfDay + dt / 900) % 1;
    if (state.screen === 'playing') {
      if (player.inCar) updateDriving(dt);
      else updatePlayer(dt);
      const threat = { active: police.wanted > 0, x: player.x, z: player.z };
      traffic.update(dt, { playerCar: player.inCar, threat, collide: collideCircle, isNight: state.isNight });
      const policeState = police.update(dt, world);
      state.wanted = policeState.wanted;
      combat.update(dt, world);
      missions.update(dt, world);
      audio.setSiren(world.sirenOn);
      // The player's car flashes white briefly after a hit, then restores.
      const car = player.inCar;
      if (car) {
        if (car.flashT > 0) {
          car.flashT -= dt;
          const bodyMat = car.mesh.userData.bodyMat;
          if (bodyMat) bodyMat.color.setHex(car.flashT > 0 ? 0xffffff : car.color);
        }
        // Damage smoke while the car is hurt, puffing from the hood.
        const smoking = car.health < CAR.maxHealth * CAR.smokeBelow && !car.wrecked;
        smokeGroup.visible = smoking;
        if (smoking) {
          smokeGroup.position.set(car.x, 0.4, car.z);
          for (let i = 0; i < smokePuffs.length; i += 1) {
            const puff = smokePuffs[i];
            const phase = state.elapsed * 1.6 + i * 2.1;
            puff.position.y = 1.2 + ((phase % 2.4) * 0.7);
            puff.scale.setScalar(0.7 + (phase % 2.4) * 0.55);
            puff.material.opacity = 0.55 * (1 - (phase % 2.4) / 2.4);
          }
        }
      } else {
        smokeGroup.visible = false;
      }
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
      // M mute: the HUD promises it, so it has to exist (v1 had no handler).
      if (edge('KeyM')) toggleMute();
      if (edge('Escape')) {
        state.screen = 'paused';
        hud.setScreen('pause');
        audio.setEngine(0, false);
        input.clearPressed();
        // Release the mouse: while pointer lock is held, every click is
        // retargeted to the canvas and the pause menu's buttons are dead.
        // (A real browser also drops the lock on Esc, but headless Chrome
        // does not — and the game must not depend on the browser here.)
        if (documentRef.exitPointerLock) {
          try {
            documentRef.exitPointerLock();
          } catch (error) {
            // Not locked; nothing to release.
          }
        }
        saveGame();
      }
    } else if (state.screen === 'title') {
      // The title screen already shows the living city behind it.
      traffic.update(dt, { playerCar: null, threat: { active: false }, collide: collideCircle, isNight: state.isNight });
    } else if (state.screen === 'end') {
      state.endTimer -= dt;
      if (state.endTimer <= 0) respawn(state.endReason === 'busted' ? 'BUSTED' : 'WASTED');
    } else if (state.screen === 'paused') {
      if (edge('Escape')) {
        resume();
        input.clearPressed();
      }
    }
    updateSky();
    updateCamera(dt);
    if (missions.active) state.objective = missions.active.def.brief;
    const missionStatus = missions.status();
    hud.update({
      health: state.health,
      money: state.money,
      wanted: state.wanted,
      bustProgress: police.bustProgress,
      ammo: state.ammo,
      mag: state.reserve,
      speedKmh: player.inCar ? Math.abs(player.inCar.speed) * 3.6 : 0,
      timeOfDay: state.timeOfDay,
      missionTitle: missions.active ? `Mission ${missions.missionIndex + 1} — ${missions.active.def.title}` : state.missionTitle,
      objective: state.objective,
      missionTimer: missionStatus.mission ? missionStatus.mission.timer : 0,
      missionCheckpoints: missionStatus.mission && missionStatus.mission.id === 'm4'
        ? `Shops ${missionStatus.mission.collected}/3`
        : '',
      missionHint: missionStatus.mission ? missionStatus.mission.hint : '',
      packagesCollected: missionStatus.packagesCollected,
      taxiActive: !!missionStatus.taxi,
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
  function resume() {
    state.screen = 'playing';
    hud.setScreen('playing');
    input.lockPointer();
  }

  function toggleMute() {
    const muted = !audio.isMuted();
    audio.setMuted(muted);
    state.muted = muted;
    const mute = documentRef.getElementById('btn-mute');
    if (mute) mute.textContent = muted ? '🔇 Sound: Off' : '🔊 Sound: On';
    return muted;
  }

  /** Put the player in a saved car without the side effects of stealing it. */
  function restoreIntoCar(savedCar) {
    // Reuse the nearest parked car so the object graph stays stable.
    let best = null;
    let bestD = Infinity;
    for (const car of parkedCars) {
      const d = Math.hypot(car.x - savedCar.x, car.z - savedCar.z);
      if (d < bestD) {
        best = car;
        bestD = d;
      }
    }
    if (!best) return;
    best.x = clamp(savedCar.x, -CITY.half + 4, CITY.half - 4);
    best.z = clamp(savedCar.z, -CITY.half + 4, CITY.seaY + 2);
    best.heading = savedCar.heading;
    best.color = savedCar.color;
    best.health = savedCar.health;
    best.taxi = !!savedCar.taxi;
    best.speed = 0;
    best.parked = false;
    best.stolen = true;
    best.wrecked = best.health <= 0;
    best.flashT = 0;
    best.mesh.position.set(best.x, 0, best.z);
    best.mesh.rotation.y = best.heading;
    if (best.mesh.userData.bodyMat) best.mesh.userData.bodyMat.color.setHex(best.color);
    player.inCar = best;
    player.mesh.visible = false;
    player.x = best.x;
    player.z = best.z;
    player.heading = best.heading;
    audio.setEngine(0, true);
  }

  function startGame(newGame) {
    audio.start();
    audio.startMusic();
    // A New Game resets everything v1 leaked across restarts: the story,
    // packages, taxi, police, enemies, traffic and parked cars — and the
    // player is always put back on foot at the plaza, even if they paused
    // mid-drive (v1 left them invisible inside the old car).
    if (newGame) {
      clearSave();
      missions.reset();
      police.clearAll();
      combat.clearEnemies();
      traffic.reset();
      resetParkedCars();
      if (player.inCar) {
        player.inCar.stolen = false;
        player.inCar = null;
        player.mesh.visible = true;
      }
      state.money = 500;
      state.health = PLAYER.maxHealth;
      state.ammo = COMBAT.pistolMag;
      state.reserve = 48;
      state.wanted = 0;
      state.timeOfDay = 0.42;
      state.muted = false;
      audio.setMuted(false);
      player.x = city.landmarks.spawn.x;
      player.z = city.landmarks.spawn.z;
      player.heading = Math.PI;
      player.vx = 0;
      player.vz = 0;
      player.punchCd = 0;
      player.shootCd = 0;
      player.reloadT = 0;
      missionTarget = null;
      taxiTarget = null;
      updateBeacon();
      missions.startMission(0, world);
    } else {
      const save = loadSave();
      if (!save) {
        // Continue with no save behaves like a New Game instead of
        // starting with half-restored state.
        startGame(true);
        return;
      }
      missions.reset();
      police.clearAll();
      combat.clearEnemies();
      traffic.reset();
      resetParkedCars();
      state.money = save.money;
      state.health = save.health;
      state.ammo = save.ammo;
      state.reserve = save.reserve;
      state.timeOfDay = save.timeOfDay;
      state.muted = save.muted;
      audio.setMuted(save.muted);
      const mute = documentRef.getElementById('btn-mute');
      if (mute) mute.textContent = save.muted ? '🔇 Sound: Off' : '🔊 Sound: On';
      player.x = save.playerX;
      player.z = save.playerZ;
      player.heading = save.playerHeading;
      player.vx = 0;
      player.vz = 0;
      player.punchCd = 0;
      player.shootCd = 0;
      player.reloadT = 0;
      player.mesh.visible = true;
      player.inCar = null;
      missionTarget = null;
      taxiTarget = null;
      const restored = missions.applySave(save, world);
      if (save.car) restoreIntoCar(save.car);
      if (missions.taxi) world.setTaxiTarget(missions.taxi.x, missions.taxi.z, 'Fare');
      police.setWanted(save.wanted);
      state.wanted = save.wanted;
      missions.startMission(missions.missionIndex, world, restored);
    }
    state.screen = 'playing';
    hud.setScreen('playing');
    input.lockPointer();
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
    combat,
    traffic,
    city,
    scene,
    parkedCars,
    startGame,
    resume,
    toggleMute,
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
        reserve: state.reserve,
        mission: missions.active ? missions.active.def.title : null,
        missionIndex: missions.missionIndex,
        missionStage: missions.active ? missions.active.stage : -1,
        missionTimer: missions.active ? Math.round(missions.active.timer * 10) / 10 : 0,
        missionCollected: missions.active ? missions.active.collected : 0,
        packagesCollected: missions.status().packagesCollected,
        taxi: !!missions.taxi,
        playerX: Math.round(player.x),
        playerZ: Math.round(player.z),
        inCar: !!player.inCar,
        carHealth: player.inCar ? Math.round(player.inCar.health) : null,
        speed: player.inCar ? Math.round(Math.abs(player.inCar.speed) * 3.6) : 0,
        cops: police.copCars.length + police.footCops.length,
        bustProgress: Math.round(police.bustProgress * 100) / 100,
        traffic: traffic.cars.length,
        peds: traffic.peds.length,
        timeOfDay: state.timeOfDay,
        isNight: state.isNight,
        muted: state.muted,
      };
    },
  };
}
