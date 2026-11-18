// Missions, taxi fares and hidden packages: the story and the side work.
// The system is a small state machine driven by the game through a `world`
// interface (position, car, wanted, money, banners), so it never touches Three.
import { MISSIONS, PACKAGE_COUNT, TAXI_FARE, CITY } from './config.js';
import { range, pick } from './random.js';

export function createMissions(random) {
  let index = 0; // next mission to play
  let active = null; // {def, stage, timer, target, collected}
  let finished = false;
  let taxi = null; // {x, z}
  let packages = [];
  let packagesCollected = 0;

  function initPackages(landmarks) {
    packages = [];
    const spots = [
      landmarks.plaza, landmarks.beach, landmarks.marina, landmarks.docks,
      landmarks.garage, landmarks.hideout, landmarks.shop1, landmarks.shop2,
    ];
    for (let i = 0; i < PACKAGE_COUNT; i += 1) {
      const base = spots[i % spots.length];
      packages.push({
        x: Math.max(-CITY.half + 12, Math.min(CITY.half - 12, base.x + range(random, -30, 30))),
        z: Math.max(-CITY.half + 12, Math.min(CITY.half - 12, base.z + range(random, -30, 30))),
        taken: false,
      });
    }
  }

  function startMission(i, world) {
    const def = MISSIONS[i];
    if (!def) {
      finished = true;
      world.banner('Story Complete', 'Mara owns Solmar Bay now. Free roam — keep the city yours.');
      return;
    }
    active = { def, stage: 0, timer: def.timeLimit || 0, target: null, collected: 0 };
    world.banner(`Mission ${i + 1} — ${def.title}`, def.brief);
    if (def.id === 'm1') world.setTarget(world.landmarks.garage.x, world.landmarks.garage.z, 'Garage');
    if (def.id === 'm2') world.setTarget(world.landmarks.marina.x, world.landmarks.marina.z, 'Marina');
    if (def.id === 'm3') world.setTarget(world.landmarks.plaza.x, world.landmarks.plaza.z, 'Lenny');
    if (def.id === 'm4') world.setTarget(world.landmarks.shop1.x, world.landmarks.shop1.z, 'Shop 1/3');
    if (def.id === 'm5') world.setTarget(world.landmarks.docks.x, world.landmarks.docks.z, 'Docks');
    if (def.id === 'm6') {
      world.setWanted(5);
      world.setTarget(world.landmarks.hideout.x, world.landmarks.hideout.z, 'Hideout');
    }
    world.audioMissionStart();
  }

  function completeMission(world) {
    const def = active.def;
    world.addMoney(def.reward);
    world.clearTarget();
    world.audioMissionDone();
    world.banner('Mission Passed', `${def.title}  •  +$${def.reward}`);
    active = null;
    index += 1;
    world.saveGame();
    setTimeout(() => startMission(index, world), 2600);
  }

  function failMission(world, reason) {
    world.audioMissionFail();
    world.banner('Mission Failed', reason);
    active = null;
    setTimeout(() => startMission(index, world), 2600);
  }

  function startTaxi(world) {
    const lines = [];
    for (let i = 0; i <= CITY.blocks; i += 1) lines.push(-CITY.half + i * CITY.block);
    const tx = pick(random, lines);
    const tz = range(random, -CITY.half + 24, CITY.half - 24);
    taxi = { x: tx, z: tz };
    world.setTarget(tx, tz, 'Fare');
    world.toast('Taxi fare — take them where the marker points.');
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
      taxi = null;
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
      mission: active ? { id: active.def.id, title: active.def.title, stage: active.stage, timer: active.timer } : null,
      finished,
      packagesCollected,
      taxi: taxi ? { ...taxi } : null,
    };
  }

  function applySave(data, world) {
    if (!data) return;
    index = Math.min(data.missionIndex || 0, MISSIONS.length);
    packagesCollected = data.packagesCollected || 0;
    if (Array.isArray(data.packagesTaken)) {
      for (const i of data.packagesTaken) if (packages[i]) packages[i].taken = true;
    }
  }

  function saveData() {
    return {
      missionIndex: index,
      packagesCollected,
      packagesTaken: packages.map((p, i) => (p.taken ? i : -1)).filter((i) => i >= 0),
    };
  }

  return {
    initPackages,
    startMission,
    update,
    startTaxi,
    status,
    applySave,
    saveData,
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
