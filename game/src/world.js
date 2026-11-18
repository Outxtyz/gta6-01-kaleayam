// Porto Verde's living world: the player on foot or behind the wheel, traffic,
// pedestrians, the police and the wanted level, crime and its consequences,
// the taxi job, hidden packages, pickups, and the camera. The mission file
// owns the story; this file owns everything that moves.
import { STEP, WORLD, PLAYER, WANTED, ECONOMY, CAR_TYPES } from './config.js';
import { buildCity, isOnRoad, isInWater, nearestRoadPoint, randomRoadPoint, resolveBuildingCollisions, circleHitsRect } from './city.js';
import { createRandom } from './random.js';
import { makeCar, makePed, makeFootCop, stepCarPhysics, updateTrafficCar, updatePed, updatePoliceCar, updateFootCop, spawnTrafficCar, spawnPed } from './entities.js';
import { createMissionState, currentMission, currentStep, startMission, updateMission, objectiveText } from './missions.js';
import { loadSave, writeSave } from './save.js';

export const EVENT_NONE = 0;
export const EVENT_STEP_DONE = 1;
export const EVENT_MISSION_DONE = 2;
export const EVENT_MISSION_FAILED = 4;
export const EVENT_WASTED = 8;
export const EVENT_BUSTED = 16;
export const EVENT_STAR_UP = 32;
export const EVENT_STAR_DOWN = 64;
export const EVENT_CRASH = 128;
export const EVENT_SHOT = 256;
export const EVENT_PICKUP = 512;
export const EVENT_STORY_DONE = 1024;

const TRAFFIC_TARGET = 14;
const PED_TARGET = 22;
const PACKAGE_SPOTS = 10;

export function createWorld(seed) {
  const rng = createRandom(seed);
  const city = buildCity(rng);
  // Every landmark gets the road point you actually drive to; the buildings
  // sit inside the blocks, so the landmark itself is never on a road.
  for (const key of Object.keys(city.landmarks)) {
    const lm = city.landmarks[key];
    lm.approach = nearestRoadPoint(city, lm.x, lm.y);
  }
  // Home is the safehouse's road approach: the player starts on the sidewalk
  // beside it, the starter car parked on the road facing east.
  const home = city.landmarks.safehouse.approach;
  const state = {
    seed,
    rng,
    city,
    time: 0,
    player: {
      x: home.x + 40,
      y: home.y + 40,
      angle: 0,
      onFoot: true,
      car: null,
      hp: PLAYER.maxHp,
      armor: 0,
      cash: PLAYER.startCash,
      ammo: PLAYER.startAmmo,
      wanted: 0,
      heat: 0,
      lastSeen: 0,
      hiddenTimer: 0,
      punchCooldown: 0,
      shootCooldown: 0,
      bustedTimer: 0,
      invuln: 0,
      speed: 0,
    },
    cars: [],
    peds: [],
    cops: [],
    pickups: [],
    particles: [],
    skids: [],
    mission: createMissionState(),
    taxi: { active: false, stage: '', passenger: null, dest: null, waitTimer: 0, fare: 0 },
    packages: { found: [], spots: [] },
    stats: { carsStolen: 0, pedsHit: 0, copsDown: 0, missionsDone: 0, cashEarned: 0, bestCash: 0 },
    camera: { x: 0, y: 0 },
    banner: null,
    message: null,
    dialogue: null,
    gameOver: null,
    storyComplete: false,
    sprayHold: 0,
    safeHold: 0,
    policeSpawnTimer: 0,
    danger: { x: 0, y: 0, radius: 0, active: false },
    audio: null,
    savedFlag: false,
  };
  // A starter car parked on the road by the safehouse so the first minutes are kind.
  const starter = makeCar('sedan', home.x + 120, home.y, 0, '#2e86c1');
  starter.driver = 'parked';
  state.cars.push(starter);
  // Traffic and pedestrians fill the city.
  for (let i = 0; i < TRAFFIC_TARGET; i += 1) {
    const car = spawnTrafficCar(city, rng, state.player, 260);
    if (car) state.cars.push(car);
  }
  for (let i = 0; i < PED_TARGET; i += 1) {
    const ped = spawnPed(city, rng, state.player, 160);
    if (ped) state.peds.push(ped);
  }
  // Hidden packages: on the roads and sidewalks, where they can be reached.
  for (let i = 0; i < PACKAGE_SPOTS; i += 1) {
    const p = randomRoadPoint(city, rng);
    state.packages.spots.push({
      x: p.x + (p.vertical ? (rng.chance(0.5) ? 44 : -44) : rng.range(-60, 60)),
      y: p.y + (p.vertical ? rng.range(-60, 60) : (rng.chance(0.5) ? 44 : -44)),
      found: false,
    });
  }
  // Health, armor and ammo pickups at fixed, memorable spots — on the road
  // outside each landmark, so they can be grabbed on foot or by driving over.
  const pickupSpots = [
    { kind: 'health', key: 'hospital' },
    { kind: 'armor', key: 'garage' },
    { kind: 'ammo', key: 'docks' },
    { kind: 'health', key: 'motel' },
    { kind: 'ammo', key: 'plaza' },
  ];
  for (const spot of pickupSpots) {
    const at = landmarkPos(state, spot.key);
    state.pickups.push({ kind: spot.kind, x: at.x, y: at.y, respawn: 0 });
  }
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  return state;
}

/** Landmark position by key, for missions and the HUD (the road approach). */
export function landmarkPos(state, key) {
  const lm = state.city.landmarks[key];
  if (!lm) return null;
  return lm.approach || { x: lm.x, y: lm.y };
}

export function starsForHeat(heat) {
  let stars = 0;
  for (const threshold of WANTED.thresholds) if (heat >= threshold) stars += 1;
  return stars;
}

function addHeat(state, amount, reason) {
  const player = state.player;
  const before = player.wanted;
  player.heat = Math.min(200, player.heat + amount);
  player.wanted = starsForHeat(player.heat);
  player.lastSeen = state.time;
  if (player.wanted > before) {
    showMessage(state, `Wanted level ${player.wanted} — ${reason}`, 3);
    return EVENT_STAR_UP;
  }
  return EVENT_NONE;
}

function showMessage(state, text, seconds) {
  state.message = { text, time: seconds || 2.5 };
}

function showBanner(state, text, sub) {
  state.banner = { text, sub: sub || '', time: 3.2 };
}

function showDialogue(state, lines) {
  state.dialogue = { lines: lines.slice(), index: 0 };
}

export function advanceDialogue(state) {
  if (!state.dialogue) return;
  state.dialogue.index += 1;
  if (state.dialogue.index >= state.dialogue.lines.length) state.dialogue = null;
}

function burst(state, x, y, color, count, speed, life) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.rng.range(0, Math.PI * 2);
    const v = state.rng.range(speed * 0.3, speed);
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life: state.rng.range(life * 0.5, life),
      maxLife: life,
      color,
      size: state.rng.range(2, 5),
    });
  }
}

function smoke(state, x, y) {
  state.particles.push({
    x: x + state.rng.range(-8, 8),
    y: y + state.rng.range(-8, 8),
    vx: state.rng.range(-12, 12),
    vy: state.rng.range(-30, -10),
    life: state.rng.range(0.6, 1.2),
    maxLife: 1.2,
    color: '#5a5a5a',
    size: state.rng.range(5, 10),
  });
}

function damagePlayer(state, amount, cause) {
  const player = state.player;
  if (player.invuln > 0 || state.gameOver) return EVENT_NONE;
  let left = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, left);
    player.armor -= absorbed;
    left -= absorbed;
  }
  player.hp -= left;
  burst(state, player.x, player.y, '#ff6b6b', 6, 90, 0.5);
  if (player.hp <= 0) {
    player.hp = 0;
    state.gameOver = 'wasted';
    showBanner(state, 'WASTED', cause || 'You went down in Porto Verde.');
    return EVENT_WASTED;
  }
  return EVENT_NONE;
}

function explodeCar(state, car) {
  burst(state, car.x, car.y, '#ff9f1c', 26, 260, 0.9);
  burst(state, car.x, car.y, '#ff4d4d', 18, 180, 0.7);
  burst(state, car.x, car.y, '#3a3a3a', 14, 120, 1.4);
  state.danger = { x: car.x, y: car.y, radius: 260, active: true };
  if (state.player.car === car) {
    state.player.car = null;
    state.player.onFoot = true;
    state.player.x = car.x + 40;
    state.player.y = car.y;
    state.player.invuln = 1.5;
    damagePlayer(state, 25, 'Your car exploded.');
  }
  car.hp = 0;
  car.driver = 'wreck';
}

/** The player gets into the nearest car, or out of the one they drive. */
function tryEnterExitCar(state) {
  const player = state.player;
  if (!player.onFoot) {
    // Get out: step out beside the car and leave it parked.
    const car = player.car;
    player.car = null;
    player.onFoot = true;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.angle = car.angle;
    car.speed = 0;
    if (car.driver === 'player') car.driver = 'parked';
    if (state.taxi.active) {
      state.taxi.active = false;
      showMessage(state, 'Taxi fare cancelled.', 2);
    }
    return EVENT_NONE;
  }
  let best = null;
  let bestD = 70;
  for (const car of state.cars) {
    if (car.driver === 'wreck' || car.hp <= 0) continue;
    const d = Math.hypot(car.x - player.x, car.y - player.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return EVENT_NONE;
  player.car = best;
  player.onFoot = false;
  player.angle = best.angle;
  let event = EVENT_NONE;
  if (best.driver === 'traffic') {
    best.driver = 'player';
    state.stats.carsStolen += 1;
    event |= addHeat(state, WANTED.crimeHeat.stealCar, 'Grand theft auto!');
    showMessage(state, `Stole a ${CAR_TYPES[best.type].name}!`, 2);
  } else if (best.driver === 'parked') {
    best.driver = 'player';
  } else if (best.driver === 'police') {
    best.driver = 'player';
    state.stats.carsStolen += 1;
    event |= addHeat(state, WANTED.crimeHeat.stealCar + 10, 'You stole a police car!');
  }
  if (best.type === 'taxi' && !state.taxi.active) startTaxiFare(state);
  return event;
}

function startTaxiFare(state) {
  const keys = Object.keys(state.city.landmarks);
  const pickupKey = state.rng.pick(keys);
  const pickup = landmarkPos(state, pickupKey);
  const label = state.city.landmarks[pickupKey].label;
  state.taxi = {
    active: true,
    stage: 'toPassenger',
    passenger: { x: pickup.x, y: pickup.y, label },
    dest: null,
    waitTimer: 0,
    fare: 0,
  };
  showMessage(state, `Taxi fare: pick up a passenger at ${label}.`, 3);
}

/** On-foot movement, punching and shooting. */
function updateOnFoot(state, controls, dt) {
  const player = state.player;
  const speed = controls.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  let dx = controls.x;
  let dy = controls.y;
  const len = Math.hypot(dx, dy);
  if (len > 0) {
    dx /= len;
    dy /= len;
    player.x += dx * speed * dt;
    player.y += dy * speed * dt;
    player.angle = Math.atan2(dy, dx);
    player.speed = speed;
  } else {
    player.speed = 0;
  }
  player.x = Math.max(16, Math.min(WORLD.width - 16, player.x));
  player.y = Math.max(16, Math.min(WORLD.height - 16, player.y));
  const body = { x: player.x, y: player.y, radius: PLAYER.radius };
  resolveBuildingCollisions(state.city, body);
  player.x = body.x;
  player.y = body.y;
  if (isInWater(state.city, player.x, player.y)) {
    player.y = 1700 - PLAYER.radius;
  }
  player.punchCooldown = Math.max(0, player.punchCooldown - dt);
  player.shootCooldown = Math.max(0, player.shootCooldown - dt);
  player.invuln = Math.max(0, player.invuln - dt);
  if (controls.punch && player.punchCooldown <= 0) {
    player.punchCooldown = 0.45;
    return punch(state);
  }
  if (controls.shoot && player.shootCooldown <= 0) {
    player.shootCooldown = PLAYER.pistolCooldown;
    return shoot(state, controls.aimX, controls.aimY);
  }
  return EVENT_NONE;
}

function punch(state) {
  const player = state.player;
  const px = player.x + Math.cos(player.angle) * 30;
  const py = player.y + Math.sin(player.angle) * 30;
  burst(state, px, py, '#ffe66d', 5, 80, 0.3);
  let event = EVENT_NONE;
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    if (Math.hypot(ped.x - px, ped.y - py) < 34) {
      ped.state = 'down';
      ped.stateTime = 0;
      event |= addHeat(state, WANTED.crimeHeat.hitPed, 'Assault!');
      state.stats.pedsHit += 1;
      burst(state, ped.x, ped.y, '#ff6b6b', 8, 120, 0.5);
    }
  }
  for (const cop of state.cops) {
    if (Math.hypot(cop.x - px, cop.y - py) < 36) {
      state.cops = state.cops.filter((c) => c !== cop);
      state.stats.copsDown += 1;
      event |= addHeat(state, WANTED.crimeHeat.hitCop, 'You decked a cop!');
      burst(state, cop.x, cop.y, '#2b6cb0', 10, 140, 0.5);
    }
  }
  return event;
}

function shoot(state, aimX, aimY) {
  const player = state.player;
  if (player.ammo <= 0) {
    showMessage(state, 'Out of ammo — find an ammo pickup.', 2);
    return EVENT_NONE;
  }
  player.ammo -= 1;
  const angle = Math.atan2(aimY - player.y, aimX - player.x);
  player.angle = angle;
  const mx = player.x + Math.cos(angle) * 26;
  const my = player.y + Math.sin(angle) * 26;
  burst(state, mx, my, '#ffd23f', 4, 160, 0.15);
  state.danger = { x: player.x, y: player.y, radius: 320, active: true };
  let event = EVENT_SHOT;
  let best = null;
  let bestD = PLAYER.pistolRange;
  const targets = [];
  for (const ped of state.peds) if (ped.state !== 'down') targets.push({ x: ped.x, y: ped.y, radius: 14, ref: ped, kind: 'ped' });
  for (const cop of state.cops) targets.push({ x: cop.x, y: cop.y, radius: 14, ref: cop, kind: 'cop' });
  for (const car of state.cars) {
    if (car === player.car || car.hp <= 0) continue;
    targets.push({ x: car.x, y: car.y, radius: car.radius, ref: car, kind: 'car' });
  }
  for (const t of targets) {
    const dx = t.x - player.x;
    const dy = t.y - player.y;
    const along = dx * Math.cos(angle) + dy * Math.sin(angle);
    if (along < 0 || along > bestD) continue;
    const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
    if (across < t.radius + 6 && along < bestD) {
      bestD = along;
      best = t;
    }
  }
  if (best) {
    burst(state, best.x, best.y, '#ff6b6b', 8, 120, 0.4);
    if (best.kind === 'ped') {
      best.ref.state = 'down';
      best.ref.stateTime = 0;
      state.stats.pedsHit += 1;
      event |= addHeat(state, WANTED.crimeHeat.shoot, 'Shots fired!');
    } else if (best.kind === 'cop') {
      state.cops = state.cops.filter((c) => c !== best.ref);
      state.stats.copsDown += 1;
      event |= addHeat(state, WANTED.crimeHeat.killCop, 'You shot a cop!');
    } else if (best.kind === 'car') {
      best.ref.hp -= PLAYER.pistolDamage;
      if (best.ref.hp <= 0) explodeCar(state, best.ref);
    }
  }
  return event;
}

/** Driving: physics, building and car collisions, pedestrians in the way. */
function updateDriving(state, controls, dt) {
  const player = state.player;
  const car = player.car;
  const beforeX = car.x;
  const beforeY = car.y;
  stepCarPhysics(car, controls, dt);
  player.x = car.x;
  player.y = car.y;
  player.angle = car.angle;
  player.speed = Math.abs(car.speed);
  let event = EVENT_NONE;
  // Buildings: bounce off with damage.
  const body = { x: car.x, y: car.y, radius: car.radius * 0.82 };
  if (resolveBuildingCollisions(state.city, body)) {
    const impact = Math.abs(car.speed);
    car.x = body.x;
    car.y = body.y;
    player.x = car.x;
    player.y = car.y;
    if (impact > 120) {
      car.hp -= impact * 0.06;
      car.speed *= -0.25;
      burst(state, car.x, car.y, '#ffd23f', 8, 140, 0.4);
      event |= EVENT_CRASH;
      if (state.audio) state.audio.crash(Math.min(1, impact / 400));
    } else {
      car.speed *= 0.4;
    }
  }
  // Skid marks and smoke when handbraking or badly damaged.
  if (controls.handbrake && Math.abs(car.speed) > 120) {
    state.skids.push({ x1: beforeX, y1: beforeY, x2: car.x, y2: car.y, life: 4 });
    if (state.skids.length > 220) state.skids.shift();
    if (state.rng.chance(dt * 20)) smoke(state, car.x, car.y);
  }
  if (car.hp < car.maxHp * 0.35 && state.rng.chance(dt * 8)) smoke(state, car.x, car.y);
  if (car.hp <= 0) {
    explodeCar(state, car);
    return event;
  }
  // Car-to-car collisions.
  for (const other of state.cars) {
    if (other === car || other.hp <= 0) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist = Math.hypot(dx, dy);
    const min = car.radius + other.radius - 6;
    if (dist > 0 && dist < min) {
      const nx = dx / dist;
      const ny = dy / dist;
      const push = (min - dist) / 2;
      car.x -= nx * push;
      car.y -= ny * push;
      other.x += nx * push;
      other.y += ny * push;
      const impact = Math.abs(car.speed - (other.speed || 0));
      if (impact > 90) {
        car.hp -= impact * 0.04;
        other.hp -= impact * 0.04;
        burst(state, (car.x + other.x) / 2, (car.y + other.y) / 2, '#ffd23f', 6, 120, 0.35);
        event |= EVENT_CRASH;
        if (other.driver === 'traffic') event |= addHeat(state, WANTED.crimeHeat.crash, 'Hit and run!');
        if (state.audio) state.audio.crash(Math.min(1, impact / 400));
        if (other.hp <= 0) explodeCar(state, other);
        if (car.hp <= 0) {
          explodeCar(state, car);
          return event;
        }
      }
      other.speed = (other.speed || 0) * 0.5;
      car.speed *= 0.7;
    }
  }
  // Pedestrians in the path.
  for (const ped of state.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - car.x, ped.y - car.y);
    if (d < car.radius + 6 && Math.abs(car.speed) > 40) {
      ped.state = 'down';
      ped.stateTime = 0;
      state.stats.pedsHit += 1;
      burst(state, ped.x, ped.y, '#ff6b6b', 8, 130, 0.5);
      event |= addHeat(state, WANTED.crimeHeat.hitPed, 'You hit a pedestrian!');
      car.speed *= 0.85;
    }
  }
  player.x = car.x;
  player.y = car.y;
  return event;
}

/** Keep the police pressure matched to the wanted level. */
function updatePolice(state, dt) {
  const player = state.player;
  const stars = player.wanted;
  // Decay: hidden from the police for a while and the heat cools off.
  let nearestPolice = Infinity;
  for (const car of state.cars) {
    if (car.type === 'police' && car.driver === 'police') {
      nearestPolice = Math.min(nearestPolice, Math.hypot(car.x - player.x, car.y - player.y));
    }
  }
  for (const cop of state.cops) {
    nearestPolice = Math.min(nearestPolice, Math.hypot(cop.x - player.x, cop.y - player.y));
  }
  const seen = nearestPolice < 520;
  if (seen) player.lastSeen = state.time;
  if (stars > 0 && state.time - player.lastSeen > WANTED.decayDelay && !seen) {
    const before = player.wanted;
    player.heat = Math.max(0, player.heat - WANTED.decayPerSecond * dt * 4);
    player.wanted = starsForHeat(player.heat);
    if (player.wanted < before) {
      showMessage(state, `Wanted level down to ${player.wanted}.`, 2);
    }
  }
  // Spawn police cars up to the level's pressure.
  state.policeSpawnTimer -= dt;
  const wantCars = WANTED.policeCars[stars] || 0;
  const haveCars = state.cars.filter((c) => c.type === 'police' && c.driver === 'police').length;
  if (wantCars > haveCars && state.policeSpawnTimer <= 0) {
    state.policeSpawnTimer = 1.6;
    const p = randomRoadPoint(state.city, state.rng);
    const car = makeCar('police', p.x, p.y, 0, '#1a1a2e');
    // Spawn a few blocks away, never on top of the player.
    if (Math.hypot(car.x - player.x, car.y - player.y) < 380) {
      car.x = player.x + (state.rng.chance(0.5) ? 520 : -520);
      car.y = player.y + (state.rng.chance(0.5) ? 420 : -420);
      const snapped = nearestRoadPoint(state.city, car.x, car.y);
      car.x = snapped.x;
      car.y = snapped.y;
    }
    car.driver = 'police';
    state.cars.push(car);
    if (state.audio) state.audio.setSiren(true, 0);
  }
  // Foot cops join the chase when the player is on foot.
  const wantCops = player.onFoot ? WANTED.policeFoot[stars] || 0 : 0;
  if (wantCops > state.cops.length && state.policeSpawnTimer <= 0 && stars > 0) {
    const p = randomRoadPoint(state.city, state.rng);
    state.cops.push(makeFootCop(p.x, p.y));
  }
  // Police with no wanted level drive off and despawn.
  if (stars === 0) {
    state.cars = state.cars.filter((c) => {
      if (c.type !== 'police' || c.driver !== 'police') return true;
      return Math.hypot(c.x - player.x, c.y - player.y) < 700;
    });
    if (state.cops.length > 0 && state.time - player.lastSeen > 10) state.cops = [];
  }
  // Chase.
  for (const car of state.cars) {
    if (car.type !== 'police' || car.driver !== 'police') continue;
    updatePoliceCar(car, player, dt);
    if (car.hp <= 0) explodeCar(state, car);
  }
  for (const cop of state.cops.slice()) {
    updateFootCop(cop, player, dt, () => {
      damagePlayer(state, 12, 'The police caught you.');
      player.bustedTimer += 0.5;
    });
  }
  // Busted: a cop stays on the player long enough.
  if (player.onFoot && stars > 0) {
    const close = state.cops.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 30);
    if (close) {
      player.bustedTimer += dt;
      if (player.bustedTimer > 2.2) {
        state.gameOver = 'busted';
        showBanner(state, 'BUSTED', 'The Porto Verde police took you in.');
        return EVENT_BUSTED;
      }
    } else {
      player.bustedTimer = Math.max(0, player.bustedTimer - dt * 2);
    }
  }
  return EVENT_NONE;
}

/** Traffic and pedestrians stay topped up around the player. */
function updatePopulation(state, dt) {
  const player = state.player;
  for (const car of state.cars) {
    if (car.driver === 'traffic') updateTrafficCar(car, state.city, state.cars, dt, state.rng);
  }
  // Remove wrecks and far-away traffic, top the count back up.
  state.cars = state.cars.filter((c) => {
    if (c.driver === 'wreck') return false;
    if (c.driver === 'traffic' && Math.hypot(c.x - player.x, c.y - player.y) > 1400) return false;
    return true;
  });
  const trafficCount = state.cars.filter((c) => c.driver === 'traffic').length;
  for (let i = trafficCount; i < TRAFFIC_TARGET; i += 1) {
    const car = spawnTrafficCar(state.city, state.rng, player, 700);
    if (car) state.cars.push(car);
    else break;
  }
  for (const ped of state.peds) updatePed(ped, state.city, dt, state.rng, state.danger);
  state.peds = state.peds.filter((p) => Math.hypot(p.x - player.x, p.y - player.y) < 1300);
  for (let i = state.peds.length; i < PED_TARGET; i += 1) {
    const ped = spawnPed(state.city, state.rng, player, 600);
    if (ped) state.peds.push(ped);
    else break;
  }
  state.danger.active = false;
}

/** Pickups, hidden packages, the spray shop and the safehouse. */
function updatePickupsAndPlaces(state, dt) {
  const player = state.player;
  let event = EVENT_NONE;
  for (const pickup of state.pickups) {
    if (pickup.respawn > 0) {
      pickup.respawn -= dt;
      continue;
    }
    if (Math.hypot(pickup.x - player.x, pickup.y - player.y) < 34) {
      if (pickup.kind === 'health' && player.hp < PLAYER.maxHp) {
        player.hp = Math.min(PLAYER.maxHp, player.hp + ECONOMY.healthPickup);
        pickup.respawn = 30;
        showMessage(state, `+${ECONOMY.healthPickup} health`, 2);
        event |= EVENT_PICKUP;
      } else if (pickup.kind === 'armor' && player.armor < PLAYER.maxArmor) {
        player.armor = Math.min(PLAYER.maxArmor, player.armor + ECONOMY.armorPickup);
        pickup.respawn = 30;
        showMessage(state, `+${ECONOMY.armorPickup} armor`, 2);
        event |= EVENT_PICKUP;
      } else if (pickup.kind === 'ammo') {
        player.ammo += ECONOMY.pistolAmmoPickup;
        pickup.respawn = 30;
        showMessage(state, `+${ECONOMY.pistolAmmoPickup} ammo`, 2);
        event |= EVENT_PICKUP;
      }
    }
  }
  for (const spot of state.packages.spots) {
    if (spot.found) continue;
    if (Math.hypot(spot.x - player.x, spot.y - player.y) < 30) {
      spot.found = true;
      state.packages.found.push(spot);
      player.cash += ECONOMY.packageReward;
      state.stats.cashEarned += ECONOMY.packageReward;
      showMessage(state, `Hidden package! +$${ECONOMY.packageReward} (${state.packages.found.length}/10)`, 3);
      event |= EVENT_PICKUP;
      if (state.audio) state.audio.pickup();
    }
  }
  // Spray shop: hold still in the car to respray and clear the wanted level.
  const spray = landmarkPos(state, 'spray');
  const nearSpray = Math.hypot(spray.x - player.x, spray.y - player.y) < 95;
  if (nearSpray && !player.onFoot && player.wanted > 0 && player.cash >= ECONOMY.sprayCost) {
    state.sprayHold += dt;
    if (state.sprayHold > 1) {
      player.cash -= ECONOMY.sprayCost;
      player.heat = 0;
      player.wanted = 0;
      state.sprayHold = 0;
      showMessage(state, `Resprayed — $${ECONOMY.sprayCost}. Wanted cleared.`, 3);
      if (state.audio) state.audio.jingle();
    }
  } else {
    state.sprayHold = 0;
  }
  // Safehouse: the heat cools fast and the game autosaves.
  const safe = landmarkPos(state, 'safehouse');
  const nearSafe = Math.hypot(safe.x - player.x, safe.y - player.y) < 110;
  if (nearSafe) {
    state.safeHold += dt;
    if (player.wanted > 0) {
      player.heat = Math.max(0, player.heat - 14 * dt);
      player.wanted = starsForHeat(player.heat);
    }
    if (state.safeHold > 4 && !state.savedFlag) {
      state.savedFlag = true;
      saveGame(state);
      showMessage(state, 'Progress saved at the safehouse.', 2);
    }
  } else {
    state.safeHold = 0;
    state.savedFlag = false;
  }
  return event;
}

/** The taxi job: passenger pickup, then the drop-off and the fare. */
function updateTaxi(state, dt) {
  const taxi = state.taxi;
  const player = state.player;
  if (!taxi.active || player.onFoot || !player.car || player.car.type !== 'taxi') return;
  if (taxi.stage === 'toPassenger') {
    const d = Math.hypot(taxi.passenger.x - player.x, taxi.passenger.y - player.y);
    if (d < 70) {
      const keys = Object.keys(state.city.landmarks).filter((k) => k !== 'yacht');
      const destKey = state.rng.pick(keys);
      const dest = landmarkPos(state, destKey);
      const destLabel = state.city.landmarks[destKey].label;
      taxi.dest = { x: dest.x, y: dest.y, label: destLabel };
      taxi.stage = 'toDestination';
      taxi.fare = Math.round(ECONOMY.taxiFareBase + d * ECONOMY.taxiFarePerMetre);
      showMessage(state, `Passenger aboard — take them to ${destLabel}.`, 3);
    }
  } else if (taxi.stage === 'toDestination' && taxi.dest) {
    const d = Math.hypot(taxi.dest.x - player.x, taxi.dest.y - player.y);
    if (d < 80) {
      player.cash += taxi.fare;
      state.stats.cashEarned += taxi.fare;
      showMessage(state, `Fare complete! +$${taxi.fare}`, 3);
      if (state.audio) state.audio.jingle();
      taxi.active = false;
      taxi.waitTimer = 2;
    }
  }
}

/** Missions: offer, start, advance, pay out. */
function updateStory(state, dt, confirmPressed) {
  const mission = currentMission(state.mission);
  if (!mission) {
    if (!state.storyComplete) {
      state.storyComplete = true;
      state.gameOver = 'complete';
      showBanner(state, 'DEBT PAID', 'Porto Verde is yours, Danny.');
      return EVENT_STORY_DONE;
    }
    return EVENT_NONE;
  }
  if (!state.mission.active) {
    if (confirmPressed) {
      const wanted = startMission(state.mission, mission);
      showDialogue(state, mission.startLines);
      showBanner(state, mission.name.toUpperCase(), mission.brief);
      if (wanted > 0) {
        state.player.heat = Math.max(state.player.heat, WANTED.thresholds[wanted - 1]);
        state.player.wanted = starsForHeat(state.player.heat);
        state.player.lastSeen = state.time;
      }
    }
    return EVENT_NONE;
  }
  const ctx = {
    x: state.player.x,
    y: state.player.y,
    inCar: !state.player.onFoot,
    wanted: state.player.wanted,
    landmark: (key) => landmarkPos(state, key),
    setWanted: (n) => {
      state.player.heat = Math.max(state.player.heat, WANTED.thresholds[n - 1]);
      state.player.wanted = starsForHeat(state.player.heat);
      state.player.lastSeen = state.time;
    },
  };
  const result = updateMission(state.mission, ctx, dt);
  if (result === 'step') {
    showMessage(state, 'Objective complete!', 2);
    if (state.audio) state.audio.pickup();
    return EVENT_STEP_DONE;
  }
  if (result === 'done') {
    state.player.cash += mission.reward;
    state.stats.cashEarned += mission.reward;
    state.stats.missionsDone += 1;
    state.stats.bestCash = Math.max(state.stats.bestCash, state.player.cash);
    showDialogue(state, mission.doneLines);
    showBanner(state, 'JOB DONE', `+$${mission.reward} — ${mission.name}`);
    if (state.audio) state.audio.jingle();
    saveGame(state);
    return EVENT_MISSION_DONE;
  }
  if (result === 'failed') {
    showBanner(state, 'JOB FAILED', 'Press Enter to try the job again.');
    if (state.audio) state.audio.busted();
    return EVENT_MISSION_FAILED;
  }
  return EVENT_NONE;
}

/** Camera follows the player with a little look-ahead in the direction of travel. */
function updateCamera(state, dt) {
  const player = state.player;
  const lookX = Math.cos(player.angle) * 60;
  const lookY = Math.sin(player.angle) * 60;
  const tx = player.x + (player.onFoot ? 0 : lookX);
  const ty = player.y + (player.onFoot ? 0 : lookY);
  const k = Math.min(1, 4.5 * dt);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
}

function updateParticles(state, dt) {
  for (const p of state.particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= Math.max(0, 1 - 2 * dt);
    p.vy *= Math.max(0, 1 - 2 * dt);
    p.life -= dt;
  }
  state.particles = state.particles.filter((p) => p.life > 0);
  for (const s of state.skids) s.life -= dt;
  state.skids = state.skids.filter((s) => s.life > 0);
  if (state.banner) {
    state.banner.time -= dt;
    if (state.banner.time <= 0) state.banner = null;
  }
  if (state.message) {
    state.message.time -= dt;
    if (state.message.time <= 0) state.message = null;
  }
}

/** Serialize the progress worth keeping between visits. */
export function saveGame(state) {
  const data = {
    version: 1,
    cash: state.player.cash,
    hp: state.player.hp,
    armor: state.player.armor,
    ammo: state.player.ammo,
    x: state.player.x,
    y: state.player.y,
    missionIndex: state.mission.index,
    missionsDone: state.stats.missionsDone,
    packagesFound: state.packages.found.length,
    packageSpots: state.packages.spots.map((s) => s.found),
    carsStolen: state.stats.carsStolen,
    cashEarned: state.stats.cashEarned,
    savedAt: Date.now(),
  };
  writeSave(data);
}

/** Restore a saved game into a fresh world. */
export function loadIntoWorld(state) {
  const data = loadSave();
  if (!data) return false;
  state.player.cash = data.cash ?? PLAYER.startCash;
  state.player.hp = data.hp ?? PLAYER.maxHp;
  state.player.armor = data.armor ?? 0;
  state.player.ammo = data.ammo ?? PLAYER.startAmmo;
  state.player.x = data.x ?? state.player.x;
  state.player.y = data.y ?? state.player.y;
  state.mission.index = data.missionIndex ?? 0;
  state.stats.missionsDone = data.missionsDone ?? 0;
  state.stats.carsStolen = data.carsStolen ?? 0;
  state.stats.cashEarned = data.cashEarned ?? 0;
  if (Array.isArray(data.packageSpots)) {
    data.packageSpots.forEach((found, i) => {
      if (found && state.packages.spots[i]) {
        state.packages.spots[i].found = true;
        state.packages.found.push(state.packages.spots[i]);
      }
    });
  }
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  return true;
}

/** One fixed step of the whole world. Returns the event bitmask. */
export function stepWorld(state, controls, dt) {
  if (state.gameOver) return EVENT_NONE;
  state.time += dt;
  let event = EVENT_NONE;
  if (controls.interactEdge) event |= tryEnterExitCar(state);
  if (state.player.onFoot) event |= updateOnFoot(state, controls, dt);
  else event |= updateDriving(state, controls, dt);
  if (state.gameOver) return event;
  event |= updatePolice(state, dt);
  if (state.gameOver) return event;
  updatePopulation(state, dt);
  // Traffic can run the player over on foot: a hard hit hurts and knocks them.
  // Only a near-centre hit counts — standing on the sidewalk is safe.
  if (state.player.onFoot && state.player.invuln <= 0) {
    for (const car of state.cars) {
      if (car.hp <= 0 || Math.abs(car.speed || 0) < 50) continue;
      if (Math.hypot(car.x - state.player.x, car.y - state.player.y) < car.radius) {
        state.player.invuln = 1.2;
        state.player.x += (state.player.x - car.x) * 0.4;
        state.player.y += (state.player.y - car.y) * 0.4;
        damagePlayer(state, 12, 'Run over by traffic.');
        if (state.audio) state.audio.crash(0.5);
        break;
      }
    }
  }
  event |= updatePickupsAndPlaces(state, dt);
  updateTaxi(state, dt);
  event |= updateStory(state, dt, controls.confirmEdge);
  updateCamera(state, dt);
  updateParticles(state, dt);
  // Audio follows the world: engine by speed, siren by nearby police.
  if (state.audio && state.audio.ready) {
    const top = state.player.car ? CAR_TYPES[state.player.car.type].topSpeed : 1;
    state.audio.setEngine(state.player.onFoot ? 0 : Math.min(1, Math.abs(state.player.speed) / top), !state.player.onFoot);
    const policeNear = state.cars.some((c) => c.type === 'police' && Math.hypot(c.x - state.player.x, c.y - state.player.y) < 600);
    state.audio.setSiren(policeNear && state.player.wanted > 0, dt);
  }
  return event;
}

/** Respawn after being wasted or busted: hospital, a fee, and another chance. */
export function respawn(state) {
  const hospital = state.city.landmarks.hospital;
  const fee = Math.min(state.player.cash, ECONOMY.hospitalFee + Math.floor(state.player.cash * 0.1));
  state.player.cash -= fee;
  state.player.hp = Math.floor(PLAYER.maxHp / 2);
  state.player.armor = 0;
  state.player.heat = 0;
  state.player.wanted = 0;
  state.player.x = hospital.x;
  state.player.y = hospital.y + 80;
  state.player.angle = 0;
  state.player.onFoot = true;
  state.player.car = null;
  state.player.invuln = 2;
  state.cops = [];
  state.gameOver = null;
  state.camera.x = state.player.x;
  state.camera.y = state.player.y;
  showMessage(state, `Hospital bill: -$${fee}.`, 3);
}
