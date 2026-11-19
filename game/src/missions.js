// Missions, taxi fares and hidden packages: the story and the side work.
// The system is a small state machine driven by the game through a `world`
// interface (position, car, wanted, money, banners), so it never touches Three.
//
// Every mission carries intro / outro / fail copy in config.js: the banner
// shows the intro when the job starts, the outro when it pays out, and the
// fail line when it falls apart, so a failed job tells the player exactly
// what to do next instead of just restarting silently.
import { MISSIONS, PACKAGE_COUNT, TAXI_FARE, CITY } from './config.js';
import { range, pick } from './random.js';

export function createMissions(random) {
  let index = 0; // next mission to play
  let active = null; // {def, stage, timer, target, collected}
  let finished = false;
  let taxi = null; // {x, z}
  let packages = [];
  let packagesCollected = 0;
  // Generation token for the delayed "next mission" start: a respawn or a
  // new game bumps the token, so a stale timeout can never start a mission
  // twice (v1 restarted the job once from respawn and once from the timer).
  let startToken = 0;

  function pointOutsideColliders(x, z, colliders) {
    if (z > CITY.seaY - 6) return false;
    for (const c of colliders) {
      if (x > c.minX - 2 && x < c.maxX + 2 && z > c.minZ - 2 && z < c.maxZ + 2) return false;
    }
    return true;
  }

  function initPackages(landmarks, colliders = []) {
    packages = [];
    const spots = [
      landmarks.plaza, landmarks.beach, landmarks.marina, landmarks.docks,
      landmarks.garage, landmarks.hideout, landmarks.shop1, landmarks.shop2,
    ];
    for (let i = 0; i < PACKAGE_COUNT; i += 1) {
      const base = spots[i % spots.length];
      let x = base.x;
      let z = base.z;
      // Rejection-sample around the landmark until the spot is reachable:
      // v1 could drop a package inside a building or in the sea, where the
      // player can never stand, so that package was uncollectable forever.
      for (let tries = 0; tries < 24; tries += 1) {
        x = Math.max(-CITY.half + 12, Math.min(CITY.half - 12, base.x + range(random, -30, 30)));
        z = Math.max(-CITY.half + 12, Math.min(CITY.half - 12, base.z + range(random, -30, 30)));
        if (pointOutsideColliders(x, z, colliders)) break;
      }
      // Last resort: the landmark itself, clamped out of the sea.
      z = Math.min(z, CITY.seaY - 6);
      packages.push({ x, z, taken: false });
    }
  }

  /** The beacon target for the mission currently running, if any. */
  function missionTarget() {
    if (!active) return null;
    const L = active.landmarks;
    const def = active.def;
    if (def.id === 'm1') return { x: L.garage.x, z: L.garage.z, label: 'Garage' };
    if (def.id === 'm2') return { x: L.marina.x, z: L.marina.z, label: 'Marina' };
    if (def.id === 'm3') {
      if (active.stage === 0) return { x: L.plaza.x, z: L.plaza.z, label: 'Lenny' };
      return null;
    }
    if (def.id === 'm4') {
      const shops = [L.shop1, L.shop2, L.shop3];
      const shop = shops[active.collected];
      return shop ? { x: shop.x, z: shop.z, label: `Shop ${active.collected + 1}/3` } : null;
    }
    if (def.id === 'm5') return { x: L.docks.x, z: L.docks.z, label: active.stage === 2 ? 'Case' : 'Docks' };
    if (def.id === 'm6') return { x: L.hideout.x, z: L.hideout.z, label: 'Hideout' };
    return null;
  }

  function applyTarget(world) {
    const t = missionTarget();
    if (t) world.setTarget(t.x, t.z, t.label);
    else world.clearTarget();
  }

  function startMission(i, world, restored = null) {
    // An explicit start supersedes any pending delayed start (e.g. the
    // 2.6s timer from the previous mission's completion).
    cancelScheduled();
    const def = MISSIONS[i];
    if (!def) {
      finished = true;
      active = null;
      world.banner('Story Complete', 'Mara owns Solmar Bay now. Free roam — keep the city yours.');
      world.clearTarget();
      return;
    }
    index = i;
    active = {
      def,
      stage: restored ? restored.stage : 0,
      timer: restored && restored.timer > 0 ? restored.timer : def.timeLimit || 0,
      target: null,
      collected: restored ? restored.collected : 0,
      landmarks: world.landmarks,
    };
    world.banner(`Mission ${i + 1} — ${def.title}`, def.intro || def.brief);
    if (def.id === 'm3' && active.stage === 1) {
      // Restored mid-getaway: Lenny is already in, the heat is already on.
      world.setWanted(2);
    } else if (def.id === 'm5' && active.stage === 1) {
      // Restored mid-ambush: the crew is waiting again.
      world.spawnShooters([
        { x: world.landmarks.docks.x - 12, z: world.landmarks.docks.z - 6 },
        { x: world.landmarks.docks.x + 10, z: world.landmarks.docks.z - 10 },
        { x: world.landmarks.docks.x - 4, z: world.landmarks.docks.z + 8 },
        { x: world.landmarks.docks.x + 16, z: world.landmarks.docks.z + 4 },
      ]);
      world.banner('Ambush!', 'Take out the dock crew and grab the case.');
    } else if (def.id === 'm6') {
      world.setWanted(5);
    }
    applyTarget(world);
    world.audioMissionStart();
  }

  function scheduleNext(world) {
    const token = ++startToken;
    setTimeout(() => {
      if (token !== startToken) return; // superseded by a respawn / new game
      startMission(index, world);
    }, 2600);
  }

  function cancelScheduled() {
    startToken += 1;
  }

  function completeMission(world) {
    const def = active.def;
    world.addMoney(def.reward);
    world.clearTarget();
    world.audioMissionDone();
    world.banner('Mission Passed', `${def.title}  •  +$${def.reward} — ${def.outro || ''}`);
    active = null;
    index += 1;
    world.saveGame();
    scheduleNext(world);
  }

  function failMission(world, reason) {
    const def = active ? active.def : null;
    world.audioMissionFail();
    world.banner('Mission Failed', def && def.fail ? def.fail : reason);
    active = null;
    scheduleNext(world);
  }

  function startTaxi(world) {
    const lines = [];
    for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.block);
    const tx = pick(random, lines);
    const tz = range(random, -CITY.half + 24, CITY.half - 24);
    taxi = { x: tx, z: tz };
    world.setTaxiTarget(tx, tz, 'Fare');
    world.toast('Taxi fare — take them where the marker points.');
  }

  function clearTaxi(world) {
    taxi = null;
    if (world) world.clearTaxiTarget();
  }

  function update(dt, world) {
    // Packages are always collectable, mission or not.
    for (const pkg of packages) {
      if (pkg.taken) continue;
      if (world.near(pkg.x, pkg.z, 2.6)) {
        pkg.taken = true;
        packagesCollected += 1;
        world.addMoney(100);
        world.audioPickup();
        world.toast(`Hidden package ${packagesCollected}/${PACKAGE_COUNT}  •  +$100`);
        world.saveGame();
      }
    }
    if (taxi && world.inCar() && world.near(taxi.x, taxi.z, 7)) {
      world.addMoney(TAXI_FARE);
      world.audioPickup();
      world.toast(`Fare paid  •  +$${TAXI_FARE}`);
      world.saveGame();
      taxi = null;
      world.clearTaxiTarget();
      startTaxi(world);
    }
    if (!active) return;
    const def = active.def;
    if (active.timer > 0) {
      active.timer -= dt;
      if (active.timer <= 0) {
        failMission(world, 'Out of time.');
        return;
      }
    }
    const L = world.landmarks;
    if (def.id === 'm1') {
      if (world.inCar() && world.near(L.garage.x, L.garage.z, 9)) completeMission(world);
    } else if (def.id === 'm2') {
      if (world.inCar() && world.near(L.marina.x, L.marina.z, 9)) completeMission(world);
    } else if (def.id === 'm3') {
      if (active.stage === 0) {
        if (!world.inCar() && world.near(L.plaza.x, L.plaza.z, 6)) {
          active.stage = 1;
          world.setWanted(2);
          world.toast('Lenny is in. Lose the cops!');
          world.clearTarget();
        }
      } else if (world.wanted() === 0) {
        completeMission(world);
      }
    } else if (def.id === 'm4') {
      const shops = [L.shop1, L.shop2, L.shop3];
      const shop = shops[active.collected];
      if (shop && world.near(shop.x, shop.z, 6)) {
        active.collected += 1;
        world.addMoney(150);
        world.audioPickup();
        if (active.collected >= 3) {
          completeMission(world);
        } else {
          const next = shops[active.collected];
          world.setTarget(next.x, next.z, `Shop ${active.collected + 1}/3`);
          world.toast(`Collected $${150} — ${3 - active.collected} shops left.`);
        }
      }
    } else if (def.id === 'm5') {
      if (active.stage === 0) {
        if (world.near(L.docks.x, L.docks.z, 12)) {
          active.stage = 1;
          world.spawnShooters([
            { x: L.docks.x - 12, z: L.docks.z - 6 },
            { x: L.docks.x + 10, z: L.docks.z - 10 },
            { x: L.docks.x - 4, z: L.docks.z + 8 },
            { x: L.docks.x + 16, z: L.docks.z + 4 },
          ]);
          world.banner('Ambush!', 'Take out the dock crew and grab the case.');
          world.setTarget(L.docks.x, L.docks.z, 'Crew');
        }
      } else if (active.stage === 1) {
        if (world.shootersAlive() === 0) {
          active.stage = 2;
          world.setTarget(L.docks.x, L.docks.z, 'Case');
          world.toast('Crew down. Grab the case.');
        }
      } else if (world.near(L.docks.x, L.docks.z, 3.5)) {
        completeMission(world);
      }
    } else if (def.id === 'm6') {
      if (world.near(L.hideout.x, L.hideout.z, 9)) completeMission(world);
    }
  }

  function status() {
    return {
      missionIndex: index,
      mission: active ? {
        id: active.def.id,
        title: active.def.title,
        stage: active.stage,
        timer: active.timer,
        collected: active.collected,
        hint: active.def.hint || '',
        checkpoints: active.def.checkpoints || null,
      } : null,
      finished,
      packagesCollected,
      taxi: taxi ? { ...taxi } : null,
    };
  }

  function applySave(data, world) {
    if (!data) return null;
    index = Math.min(data.missionIndex || 0, MISSIONS.length);
    packagesCollected = data.packagesCollected || 0;
    if (Array.isArray(data.packagesTaken)) {
      for (const i of data.packagesTaken) if (packages[i]) packages[i].taken = true;
    }
    // Restored mid-mission state; startMission() consumes it on Continue.
    const restored = {
      stage: data.missionStage || 0,
      timer: data.missionTimer || 0,
      collected: data.missionCollected || 0,
    };
    if (data.taxi) taxi = { x: data.taxi.x, z: data.taxi.z };
    return restored;
  }

  function saveData() {
    return {
      missionIndex: index,
      missionStage: active ? active.stage : 0,
      missionTimer: active ? active.timer : 0,
      missionCollected: active ? active.collected : 0,
      packagesCollected,
      packagesTaken: packages.map((p, i) => (p.taken ? i : -1)).filter((i) => i >= 0),
      taxi: taxi ? { ...taxi } : null,
    };
  }

  /** Full reset for a New Game: story, packages and taxi all start over. */
  function reset() {
    cancelScheduled();
    index = 0;
    active = null;
    finished = false;
    taxi = null;
    packagesCollected = 0;
    for (const pkg of packages) pkg.taken = false;
  }

  /** Re-point the beacon at the current mission target (after a taxi ends). */
  function restoreTarget(world) {
    applyTarget(world);
  }

  return {
    initPackages,
    startMission,
    update,
    startTaxi,
    clearTaxi,
    status,
    applySave,
    saveData,
    reset,
    restoreTarget,
    cancelScheduled,
    get packages() {
      return packages;
    },
    get active() {
      return active;
    },
    get taxi() {
      return taxi;
    },
    set taxi(value) {
      taxi = value;
    },
    get missionIndex() {
      return index;
    },
  };
}
