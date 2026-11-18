// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a small road-following autopilot, so the frame is what a short
// game really looks like and the same seed always gives the same frame.
import { STEP, SCREEN_TITLE, SCREEN_PLAY, WANTED } from './config.js';
import { stepWorld, starsForHeat } from './world.js';
import { makeCar } from './entities.js';
import { startMission, currentMission } from './missions.js';
import { nearestRoadPoint, nearestIntersection } from './city.js';

const SAMPLE_SECONDS = { drive: 12, chase: 9, mission: 8 };

/** Waypoints along the road grid from the car to the target point. */
function planRoute(city, from, to) {
  const start = nearestRoadPoint(city, from.x, from.y);
  const goal = nearestRoadPoint(city, to.x, to.y);
  const waypoints = [];
  // Go along the start road to the goal's road line, then along it to the goal.
  const startVertical = Math.abs(from.x - start.x) < Math.abs(from.y - start.y);
  if (startVertical) {
    waypoints.push({ x: start.x, y: goal.y });
  } else {
    waypoints.push({ x: goal.x, y: start.y });
  }
  waypoints.push({ x: goal.x, y: goal.y });
  return waypoints;
}

function autopilotControls(state, waypoints) {
  const player = state.player;
  const car = player.car;
  if (!car) return { x: 0, y: 0, up: false, down: false, left: false, right: false, handbrake: false, run: false, interact: false, interactEdge: false, confirmEdge: false, punch: false, shoot: false, aimX: 0, aimY: 0 };
  let target = waypoints[0];
  while (waypoints.length > 1 && Math.hypot(target.x - car.x, target.y - car.y) < 70) {
    waypoints.shift();
    target = waypoints[0];
  }
  const wantAngle = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const dist = Math.hypot(target.x - car.x, target.y - car.y);
  return {
    x: 0, y: 0,
    up: dist > 30,
    down: false,
    left: diff < -0.12,
    right: diff > 0.12,
    handbrake: Math.abs(diff) > 1.8,
    run: false,
    interact: false,
    interactEdge: false,
    confirmEdge: false,
    punch: false,
    shoot: false,
    aimX: target.x,
    aimY: target.y,
  };
}

/** Put the player behind the wheel of a car of the given type at a road point. */
function seatPlayerInCar(state, type, x, y, color) {
  const p = { x, y };
  const snapped = nearestRoadPoint(state.city, x, y);
  const car = makeCar(type, snapped.x, snapped.y, 0, color);
  car.driver = 'player';
  state.cars.push(car);
  state.player.car = car;
  state.player.onFoot = false;
  state.player.x = car.x;
  state.player.y = car.y;
  state.player.angle = car.angle;
  state.camera.x = car.x;
  state.camera.y = car.y;
  return car;
}

function simulate(state, seconds, waypoints) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const controls = autopilotControls(state, waypoints);
    stepWorld(state, controls, STEP);
    if (state.gameOver) break;
  }
}

/**
 * Set `state` to the named scene and return the screen to draw over it.
 * Names: start (title), drive, chase, mission; anything else is start.
 */
export function stageShot(name, state) {
  if (name === 'drive') {
    const car = seatPlayerInCar(state, 'sports', 720, 380, '#e74c3c');
    car.angle = 0;
    const waypoints = planRoute(state.city, car, { x: 1980, y: 1100 });
    simulate(state, SAMPLE_SECONDS.drive, waypoints);
    return { screen: SCREEN_PLAY, best: state.player.cash };
  }
  if (name === 'chase') {
    const car = seatPlayerInCar(state, 'sports', 1000, 860, '#00b4d8');
    car.angle = Math.PI / 2;
    state.player.heat = WANTED.thresholds[2];
    state.player.wanted = starsForHeat(state.player.heat);
    state.player.lastSeen = state.time;
    // Three police cars already in pursuit.
    for (let i = 0; i < 3; i += 1) {
      const pc = makeCar('police', car.x - 120 - i * 90, car.y + (i - 1) * 60, Math.PI / 2, '#1a1a2e');
      pc.driver = 'police';
      state.cars.push(pc);
    }
    state.message = { text: 'Wanted level 3 — the whole precinct is on you!', time: 30 };
    const waypoints = planRoute(state.city, car, { x: 300, y: 140 });
    simulate(state, SAMPLE_SECONDS.chase, waypoints);
    return { screen: SCREEN_PLAY, best: state.player.cash };
  }
  if (name === 'mission') {
    // Jump to the second job, mid-delivery, for the busiest frame.
    state.mission.index = 1;
    const job = currentMission(state.mission);
    startMission(state.mission, job);
    state.mission.step = 1;
    state.mission.timer = 42;
    const car = seatPlayerInCar(state, 'sedan', 860, 1340, '#c0392b');
    car.angle = -Math.PI / 2;
    state.banner = { text: 'THE PACKAGE', sub: 'Deliver to the Diner — fast!', time: 30 };
    const waypoints = planRoute(state.city, car, { x: 1700, y: 500 });
    simulate(state, SAMPLE_SECONDS.mission, waypoints);
    return { screen: SCREEN_PLAY, best: state.player.cash };
  }
  // Title: the city alive behind the menu, camera drifting over downtown.
  state.camera.x = 1200;
  state.camera.y = 760;
  for (let i = 0; i < 5 / STEP; i += 1) {
    stepWorld(state, { x: 0, y: 0, up: false, down: false, left: false, right: false, handbrake: false, run: false, interact: false, interactEdge: false, confirmEdge: false, punch: false, shoot: false, aimX: 0, aimY: 0 }, STEP);
  }
  state.camera.x = 1200 + Math.sin(1.2) * 60;
  state.camera.y = 760 + Math.cos(0.8) * 40;
  return { screen: SCREEN_TITLE, best: 1250 };
}
