// Porto Verde: tuning, palette and vehicle definitions for the whole game.
// Everything here is a plain constant so the world, the renderer and the
// screenshot scenes all agree on the same numbers.
export const STEP = 1 / 60;
export const WORLD = { width: 2400, height: 1800 };
export const ROAD_WIDTH = 64;
export const BLOCK = 176;

// Vertical roads (x) and horizontal roads (y) of the city grid.
export const ROAD_XS = [160, 440, 720, 1000, 1280, 1560, 1840, 2120];
export const ROAD_YS = [140, 380, 620, 860, 1100, 1340, 1560];

// South edge: sand strip then open water (the bay).
export const BEACH_TOP = 1640;
export const WATER_TOP = 1700;

// Sun-soaked late-afternoon palette.
export const COLORS = {
  grass: '#7fae5a',
  grassDark: '#74a24f',
  sand: '#e8d29a',
  water: '#2e7fb8',
  waterDeep: '#256b9e',
  road: '#3c3f46',
  roadLine: '#e8d44d',
  sidewalk: '#b9bcc2',
  curb: '#9a9da5',
  park: '#5d9b4a',
  tree: '#2f7a33',
  treeLight: '#4da34d',
  buildingRoof: '#8a6f5c',
  hudBg: 'rgba(12, 16, 24, 0.72)',
  hudText: '#f5f2e8',
  hudAccent: '#ffd23f',
  danger: '#ff4d4d',
  police: '#2b6cb0',
  mission: '#ffd23f',
};

export const CAR_TYPES = {
  sedan: { name: 'Sedan', length: 46, width: 22, accel: 260, topSpeed: 330, reverse: 140, turn: 2.6, hp: 100, colors: ['#c0392b', '#2e86c1', '#7d3c98', '#b7950b', '#5d6d7e'] },
  taxi: { name: 'Taxi', length: 46, width: 22, accel: 250, topSpeed: 310, reverse: 130, turn: 2.6, hp: 100, colors: ['#f1c40f'] },
  sports: { name: 'Sports', length: 48, width: 22, accel: 380, topSpeed: 460, reverse: 160, turn: 3.1, hp: 80, colors: ['#e74c3c', '#00b4d8', '#f72585'] },
  truck: { name: 'Truck', length: 62, width: 26, accel: 170, topSpeed: 240, reverse: 110, turn: 2.0, hp: 160, colors: ['#6c757d', '#8d6e63', '#455a64'] },
  police: { name: 'Police', length: 48, width: 23, accel: 340, topSpeed: 400, reverse: 150, turn: 2.9, hp: 120, colors: ['#1a1a2e'] },
  van: { name: 'Van', length: 54, width: 24, accel: 210, topSpeed: 280, reverse: 120, turn: 2.3, hp: 130, colors: ['#e9ecef', '#adb5bd'] },
};

// On-foot tuning.
export const PLAYER = {
  walkSpeed: 150,
  runSpeed: 240,
  radius: 13,
  maxHp: 100,
  maxArmor: 100,
  punchDamage: 25,
  pistolDamage: 34,
  pistolRange: 420,
  pistolCooldown: 0.22,
  startCash: 150,
  startAmmo: 24,
};

// Wanted level: heat points needed for each star, police pressure per star.
export const WANTED = {
  // heat thresholds for stars 1..5
  thresholds: [10, 30, 60, 100, 150],
  decayPerSecond: 1.6,
  decayDelay: 6,
  maxStars: 5,
  policeCars: [0, 1, 2, 3, 4, 5],
  policeFoot: [0, 1, 2, 3, 4, 6],
  crimeHeat: { stealCar: 12, hitPed: 14, killPed: 25, hitCop: 30, killCop: 40, shoot: 6, crash: 2 },
};

// Cash and pickups.
export const ECONOMY = {
  sprayCost: 200,
  taxiFareBase: 60,
  taxiFarePerMetre: 0.35,
  packageReward: 250,
  hospitalFee: 150,
  pistolAmmoPickup: 12,
  healthPickup: 40,
  armorPickup: 50,
};

// Mission / story tuning.
export const STORY = {
  debtTotal: 50000,
  packageTimeLimit: 100,
  getawayTimeLimit: 150,
  bigScoreTimeLimit: 240,
};

// Save key.
export const SAVE_KEY = 'porto-verde-save-v1';
export const BEST_KEY = 'porto-verde-best-v1';

// Screen names shared by main, render and shots.
export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_COMPLETE = 'complete';

// Input actions (bit flags for the input module).
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_SAVE = 4;
export const ACTION_MUTE = 8;
export const ACTION_HORN = 16;
