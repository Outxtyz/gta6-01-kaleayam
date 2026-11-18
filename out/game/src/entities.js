// Cars, pedestrians and police: factories plus the steering that drives them.
// Player-driven cars use the same physics as police cars; traffic cars follow
// the road grid on their own; pedestrians walk the sidewalks and run from
// danger. Nothing here knows about missions or the HUD.
import { CAR_TYPES, ROAD_WIDTH, WORLD } from './config.js';
import { nearestRoadPoint, randomRoadPoint, randomSidewalkPoint, resolveBuildingCollisions, isInWater } from './city.js';

let nextId = 1;

export function makeCar(type, x, y, angle, color) {
  const def = CAR_TYPES[type];
  return {
    id: nextId,
    kind: 'car',
    type,
    x, y,
    angle,
    speed: 0,
    radius: def.length / 2,
    length: def.length,
    width: def.width,
    hp: def.hp,
    maxHp: def.hp,
    color: color || def.colors[0],
    driver: type === 'police' ? 'police' : 'traffic',
    // Traffic state: which road and direction it follows.
    vertical: true,
    dir: 1,
    cruise: 0,
    stopped: 0,
    smoke: 0,
    siren: type === 'police',
    // Stuck recovery for cars knocked off the roads.
    offRoadTime: 0,
  };
}

export function makePed(x, y, rng) {
  const shirts = ['#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#fd79a8', '#00cec9'];
  return {
    id: nextId,
    kind: 'ped',
    x, y,
    angle: rng.range(0, Math.PI * 2),
    speed: rng.range(28, 52),
    radius: 10,
    shirt: rng.pick(shirts),
    skin: rng.pick(['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac']),
    state: 'walk',
    stateTime: 0,
    vertical: rng.chance(0.5),
    dir: rng.chance(0.5) ? 1 : -1,
    scared: false,
  };
}

export function makeFootCop(x, y) {
  return {
    id: nextId,
    kind: 'cop',
    x, y,
    angle: 0,
    speed: 185,
    radius: 12,
    state: 'chase',
    punchCooldown: 0,
    stateTime: 0,
  };
}

/** Arcade car physics shared by the player and the police. */
export function stepCarPhysics(car, controls, dt) {
  const def = CAR_TYPES[car.type];
  const forward = controls.up ? 1 : 0;
  const reverse = controls.down ? 1 : 0;
  const accel = (forward - reverse * 0.55) * def.accel;
  if (controls.handbrake) {
    car.speed *= Math.max(0, 1 - 2.4 * dt);
  }
  car.speed += accel * dt;
  // Drag and rolling resistance.
  car.speed -= car.speed * 0.55 * dt;
  const maxForward = def.topSpeed * (controls.boost ? 1.12 : 1);
  if (car.speed > maxForward) car.speed = maxForward;
  if (car.speed < -def.reverse) car.speed = -def.reverse;
  if (Math.abs(car.speed) < 4 && !forward && !reverse) car.speed = 0;
  // Steering bites harder the faster the car goes, and reverses in reverse.
  const steerAmount = (controls.left ? -1 : 0) + (controls.right ? 1 : 0);
  const grip = controls.handbrake ? 1.9 : 1;
  car.angle += steerAmount * def.turn * grip * (car.speed / def.topSpeed) * dt * (car.speed < 0 ? -1 : 1);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx;
  car.y = ny;
  // World bounds: the bay stops cars at the beach.
  car.x = Math.max(24, Math.min(WORLD.width - 24, car.x));
  car.y = Math.max(24, Math.min(WORLD.height - 24, car.y));
  if (isInWater({ water: { y: 1700 } }, car.x, car.y)) {
    car.y = 1700 - car.radius;
    car.speed *= 0.4;
  }
}

/** Traffic cars cruise their road, pause at busy intersections, turn sometimes. */
export function updateTrafficCar(car, city, cars, dt, rng) {
  if (car.driver !== 'traffic') return;
  if (car.cruise === 0) car.cruise = rng.range(120, 200);
  if (car.stopped > 0) {
    car.stopped -= dt;
    car.speed *= Math.max(0, 1 - 6 * dt);
    return;
  }
  // Slow for a car ahead in the same lane.
  let blocked = false;
  for (const other of cars) {
    if (other === car || other.kind !== 'car') continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = car.vertical ? dy * car.dir : dx * car.dir;
    const side = car.vertical ? Math.abs(dx) : Math.abs(dy);
    if (ahead > 0 && ahead < 78 && side < 26) { blocked = true; break; }
  }
  const targetSpeed = blocked ? 0 : car.cruise;
  car.speed += (targetSpeed - car.speed) * Math.min(1, 2.2 * dt);
  if (car.vertical) {
    car.angle = car.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (car.y < 60) { car.y = 60; car.dir = 1; }
    if (car.y > WORLD.height - 240) { car.y = WORLD.height - 240; car.dir = -1; }
  } else {
    car.x += car.speed * car.dir * dt;
    car.angle = car.dir > 0 ? 0 : Math.PI;
    if (car.x < 60) { car.x = 60; car.dir = 1; }
    if (car.x > WORLD.width - 60) { car.x = WORLD.width - 60; car.dir = -1; }
  }
  // At an intersection, sometimes turn onto the crossing road.
  const nearX = city.roadsX.some((rx) => Math.abs(car.x - rx) < 6);
  const nearY = city.roadsY.some((ry) => Math.abs(car.y - ry) < 6);
  if (nearX && nearY && rng.chance(dt * 0.12)) {
    if (car.vertical) {
      car.vertical = false;
      car.dir = rng.chance(0.5) ? 1 : -1;
      car.x = nearestRoadPoint(city, car.x, car.y).x;
    } else {
      car.vertical = true;
      car.dir = rng.chance(0.5) ? 1 : -1;
      car.y = nearestRoadPoint(city, car.x, car.y).y;
    }
  }
  // Knocked off the road? Steer back to the nearest road centre.
  if (!car.vertical && !city.roadsY.some((ry) => Math.abs(car.y - ry) < ROAD_WIDTH / 2 + 4)) {
    car.offRoadTime += dt;
  } else if (car.vertical && !city.roadsX.some((rx) => Math.abs(car.x - rx) < ROAD_WIDTH / 2 + 4)) {
    car.offRoadTime += dt;
  } else {
    car.offRoadTime = 0;
  }
  if (car.offRoadTime > 2.5) {
    const p = randomRoadPoint(city, rng);
    car.x = p.x;
    car.y = p.y;
    car.vertical = p.vertical;
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.offRoadTime = 0;
  }
}

/** Pedestrians stroll the sidewalks and sprint away from anything scary. */
export function updatePed(ped, city, dt, rng, danger) {
  ped.stateTime += dt;
  const dx = ped.x - danger.x;
  const dy = ped.y - danger.y;
  const dist = Math.hypot(dx, dy);
  if (danger.active && dist < danger.radius) {
    ped.state = 'flee';
    ped.scared = true;
    ped.angle = Math.atan2(dy, dx);
    const speed = 150;
    ped.x += Math.cos(ped.angle) * speed * dt;
    ped.y += Math.sin(ped.angle) * speed * dt;
    ped.x = Math.max(16, Math.min(WORLD.width - 16, ped.x));
    ped.y = Math.max(16, Math.min(WORLD.height - 16, ped.y));
    resolveBuildingCollisions(city, { x: ped.x, y: ped.y, radius: ped.radius });
    return;
  }
  if (ped.state === 'flee' && ped.stateTime > 2.5) {
    ped.state = 'walk';
    ped.scared = false;
    ped.stateTime = 0;
  }
  if (ped.state === 'down') {
    if (ped.stateTime > 3) {
      ped.state = 'flee';
      ped.stateTime = 0;
    }
    return;
  }
  // Stroll along a sidewalk; turn at intersections or at random.
  const step = ped.speed * dt;
  if (ped.vertical) {
    ped.y += step * ped.dir;
    ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    if (ped.y < 50) ped.dir = 1;
    if (ped.y > WORLD.height - 200) ped.dir = -1;
  } else {
    ped.x += step * ped.dir;
    ped.angle = ped.dir > 0 ? 0 : Math.PI;
    if (ped.x < 50) ped.dir = 1;
    if (ped.x > WORLD.width - 50) ped.dir = -1;
  }
  const onCrossX = city.roadsX.some((rx) => Math.abs(ped.x - rx) < 8);
  const onCrossY = city.roadsY.some((ry) => Math.abs(ped.y - ry) < 8);
  if (onCrossX && onCrossY && rng.chance(dt * 0.25)) {
    ped.vertical = !ped.vertical;
    ped.dir = rng.chance(0.5) ? 1 : -1;
  }
  resolveBuildingCollisions(city, { x: ped.x, y: ped.y, radius: ped.radius });
}

/** A police car chases the target: steer at it, ram it, keep up. */
export function updatePoliceCar(car, target, dt) {
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.abs(diff) < 0.1 ? 0 : diff > 0 ? 1 : -1;
  const controls = {
    up: dist > 40,
    down: dist < 24,
    left: steer < 0,
    right: steer > 0,
    handbrake: Math.abs(diff) > 1.9 && dist < 120,
    boost: dist > 420,
  };
  stepCarPhysics(car, controls, dt);
}

/** A foot cop runs at the player and punches when close. */
export function updateFootCop(cop, target, dt, onPunch) {
  cop.stateTime += dt;
  const dx = target.x - cop.x;
  const dy = target.y - cop.y;
  const dist = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  if (dist > 26) {
    cop.x += Math.cos(cop.angle) * cop.speed * dt;
    cop.y += Math.sin(cop.angle) * cop.speed * dt;
  } else if (cop.punchCooldown <= 0) {
    cop.punchCooldown = 0.9;
    onPunch();
  }
  cop.punchCooldown = Math.max(0, cop.punchCooldown - dt);
}

/** Spawn a fresh traffic car on a road away from the given point. */
export function spawnTrafficCar(city, rng, awayFrom, minDist) {
  const types = ['sedan', 'sedan', 'sedan', 'taxi', 'sports', 'truck', 'van'];
  for (let tries = 0; tries < 12; tries += 1) {
    const p = randomRoadPoint(city, rng);
    const dx = p.x - awayFrom.x;
    const dy = p.y - awayFrom.y;
    if (Math.hypot(dx, dy) < minDist) continue;
    const type = rng.pick(types);
    const def = CAR_TYPES[type];
    const car = makeCar(type, p.x, p.y, p.vertical ? Math.PI / 2 : 0, rng.pick(def.colors));
    car.vertical = p.vertical;
    car.dir = rng.chance(0.5) ? 1 : -1;
    car.cruise = rng.range(120, 200);
    // Lane offset: right-hand side of the road.
    if (p.vertical) car.x += car.dir > 0 ? 15 : -15;
    else car.y += car.dir > 0 ? 15 : -15;
    return car;
  }
  return null;
}

/** Spawn a pedestrian away from the given point. */
export function spawnPed(city, rng, awayFrom, minDist) {
  for (let tries = 0; tries < 10; tries += 1) {
    const p = randomSidewalkPoint(city, rng);
    if (Math.hypot(p.x - awayFrom.x, p.y - awayFrom.y) < minDist) continue;
    return makePed(p.x, p.y, rng);
  }
  return null;
}
