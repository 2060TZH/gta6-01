// Solmar Bay — every tuning number and colour in one place.
// The city is a 640x640 unit grid (8x8 blocks, 80 units a block) with a beach
// and sea along its south edge and a neon downtown in the north-east.
export const CITY = {
  size: 640,
  half: 320,
  block: 80,
  road: 16,
  blocks: 8,
  beachY: 264, // south of this line is sand, then sea
  seaY: 300,
};

export const STEP = 1 / 60;

export const PLAYER = {
  walkSpeed: 7,
  runSpeed: 12,
  accel: 60,
  radius: 0.9,
  height: 1.8,
  maxHealth: 100,
  punchDamage: 12,
  punchRange: 2.2,
  punchCooldown: 0.45,
};

export const CAR = {
  accel: 26,
  brake: 42,
  reverseAccel: 14,
  maxSpeed: 46,
  maxReverse: 12,
  steer: 1.9,
  grip: 6.5,
  handbrakeGrip: 2.2,
  maxHealth: 100,
  length: 4.6,
  width: 2.1,
  // Damage smoke starts below this health fraction; the car is a wreck at 0.
  smokeBelow: 0.45,
};

export const TRAFFIC = {
  cars: 14,
  peds: 26,
  carSpeed: 11,
  pedSpeed: 1.6,
  // Seconds a traffic car must wait after turning before it may turn again,
  // so cars stop jittering through the same intersection.
  turnCooldown: 3,
};

export const WANTED = {
  maxStars: 5,
  loseSightSeconds: 9,
  copCarSpeed: 34,
  copSpawnDistance: 90,
  maxCopCars: 4,
  maxFootCops: 6,
  bustDistance: 2.2,
  bustSeconds: 2.5,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 55,
  pistolMag: 12,
  pistolReload: 1.1,
  pistolCooldown: 0.22,
  enemyHealth: 60,
  enemyDamage: 8,
  enemyRange: 30,
  enemyCooldown: 1.4,
};

export const PALETTE = {
  skyDay: 0x8ec9e8,
  skyDusk: 0xff9a5c,
  skyNight: 0x0b1026,
  sun: 0xfff2d0,
  fogDay: 0xa8c8dc,
  fogNight: 0x0d1330,
  road: 0x2e3138,
  sidewalk: 0x9aa0a8,
  sand: 0xe8cf9e,
  sea: 0x1d6f8f,
  grass: 0x5d8a4a,
  buildingA: 0xd8cfc0,
  buildingB: 0xb8c4d0,
  buildingC: 0xe0b08a,
  neonPink: 0xff2e88,
  neonCyan: 0x22d3ee,
  neonGold: 0xffc53d,
  playerJacket: 0x2e6f8e,
  playerPants: 0x2b2f38,
  copBlue: 0x1d4ed8,
  taxiYellow: 0xfacc15,
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Save format version. Loaders accept older saves and fill missing fields
// with defaults; writers always stamp the current version.
export const SAVE_VERSION = 2;
export const SAVE_KEY = 'solmar-bay.save.v1';

/**
 * The story: six missions. Each one carries the copy the HUD shows:
 * `intro` when the job starts, `outro` when it pays out, `fail` when it
 * falls apart, and `hint` — a one-line reminder that stays under the
 * objective while the mission is active.
 */
export const MISSIONS = [
  {
    id: 'm1',
    title: 'Hotwire',
    brief: 'Mara needs wheels. Steal any car on the street and bring it to the garage.',
    intro: 'Mara: "First rule of Solmar Bay — never walk when you can drive. Get me a car."',
    outro: 'Mara: "Clean. The crew notices people who deliver."',
    fail: 'The garage is still waiting. Steal a car and bring it over.',
    hint: 'E near any parked or traffic car to steal it, then follow the beacon.',
    reward: 250,
  },
  {
    id: 'm2',
    title: 'Sunset Run',
    brief: 'Deliver the package to the marina before the clock runs out. Drive fast, drive clean.',
    intro: 'Lenny: "Package goes to the marina. 75 seconds. Don\'t scratch the paint — or do, I don\'t care."',
    outro: 'Lenny: "On time. You drive like the bay is on fire."',
    fail: 'Out of time — the buyer walked. The marina run resets.',
    hint: 'Stay on the roads and cut the corners wide; the beacon is the marina pier.',
    reward: 400,
    timeLimit: 75,
  },
  {
    id: 'm3',
    title: 'The Pickup',
    brief: 'Pick up Lenny at the plaza, then lose the cops. Two stars and counting.',
    intro: 'Lenny: "Pick me up at the plaza. And Mara — the cops already know my face."',
    outro: 'Lenny: "Clean getaway. You\'re alright, Mara."',
    fail: 'Lenny is still waiting at the plaza. Go get him — on foot.',
    hint: 'Walk up to Lenny at the plaza, then break line of sight until the stars fade.',
    reward: 550,
  },
  {
    id: 'm4',
    title: 'Collection Day',
    brief: 'Collect the weekly cut from three shops downtown. No trouble — or some trouble.',
    intro: 'Mara: "Three shops owe the crew. Collect, smile, don\'t start anything you can\'t finish."',
    outro: 'Mara: "All three paid. Downtown remembers who collects."',
    fail: 'The shops are still waiting. Three stops, then the money is yours.',
    hint: 'Walk into each marked shop. The counter tells you how many are left.',
    reward: 700,
    checkpoints: ['Shop 1/3', 'Shop 2/3', 'Shop 3/3'],
  },
  {
    id: 'm5',
    title: 'Dock Deal',
    brief: 'The deal at the docks went bad. Take out the ambush crew and grab the case.',
    intro: 'Mara: "The dock deal was a setup. Four guns waiting. Take them down and bring me the case."',
    outro: 'Mara: "Case secured. The crew that set us up won\'t try twice."',
    fail: 'The crew is still standing at the docks. Finish it.',
    hint: 'Use cover, watch the tracers, and grab the case once the crew is down.',
    reward: 900,
  },
  {
    id: 'm6',
    title: 'Grand Escape',
    brief: 'Five stars. Get to the hideout across town before the city locks down.',
    intro: 'Mara: "Five stars. Every cop in Solmar Bay is coming. Get to the hideout — now."',
    outro: 'Mara: "You made it. The city is yours now, Mara Voss."',
    fail: 'The hideout is still across town. Five stars won\'t wait.',
    hint: 'Two minutes. Drive like the whole city is behind you — because it is.',
    reward: 1500,
    timeLimit: 120,
  },
];

export const PACKAGE_COUNT = 20;
export const TAXI_FARE = 120;
