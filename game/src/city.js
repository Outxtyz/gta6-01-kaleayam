// Porto Verde, the city: a road grid, the blocks between the roads filled with
// buildings and parks, a beach and bay along the south edge, and the named
// landmarks the missions and the HUD point at. All positions are fixed by the
// seed, so every run of the game shows the same city.
import { WORLD, ROAD_XS, ROAD_YS, ROAD_WIDTH, BEACH_TOP, WATER_TOP } from './config.js';

const BUILDING_COLORS = ['#b08968', '#a67c52', '#c9ada7', '#9c6644', '#7f5539', '#b5838d', '#6d6875', '#e5989b', '#84a98c', '#dda15e'];
const ROOF_COLORS = ['#6d4c41', '#5d4037', '#795548', '#4e342e', '#37474f', '#455a64'];

// Landmark spots, chosen by hand on the grid so missions read well.
const LANDMARK_SPOTS = {
  safehouse: { x: 300, y: 260, label: 'Safehouse' },
  spray: { x: 860, y: 500, label: 'Spray Shop' },
  hospital: { x: 1420, y: 260, label: 'Hospital' },
  garage: { x: 580, y: 980, label: "Vera's Garage" },
  bank: { x: 1140, y: 740, label: 'Verde Bank' },
  diner: { x: 1700, y: 500, label: 'Diner' },
  docks: { x: 860, y: 1500, label: 'Docks' },
  marina: { x: 1980, y: 1500, label: 'Marina' },
  yacht: { x: 1980, y: 1670, label: 'Yacht' },
  motel: { x: 300, y: 1220, label: 'Motel' },
  market: { x: 1980, y: 980, label: 'Market' },
  plaza: { x: 1140, y: 1220, label: 'Plaza' },
};

export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const trees = [];

  // Blocks sit between neighbouring roads; the outer ring is the city edge.
  for (let ix = 0; ix < ROAD_XS.length - 1; ix += 1) {
    for (let iy = 0; iy < ROAD_YS.length - 1; iy += 1) {
      const x0 = ROAD_XS[ix] + ROAD_WIDTH / 2 + 14;
      const x1 = ROAD_XS[ix + 1] - ROAD_WIDTH / 2 - 14;
      const y0 = ROAD_YS[iy] + ROAD_WIDTH / 2 + 14;
      const y1 = ROAD_YS[iy + 1] - ROAD_WIDTH / 2 - 14;
      if (x1 - x0 < 40 || y1 - y0 < 40) continue;
      // The south row above the beach is open ground for the docks and marina.
      if (iy === ROAD_YS.length - 2) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'yard' });
        continue;
      }
      if (rng.chance(0.22)) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: 'park' });
        const count = rng.int(3, 7);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: rng.range(x0 + 12, x1 - 12), y: rng.range(y0 + 12, y1 - 12), r: rng.range(7, 12) });
        }
        continue;
      }
      // One or two buildings per block, with a little yard between them.
      const splitVertical = rng.chance(0.5) && x1 - x0 > 130;
      const spots = splitVertical
        ? [
            { x: x0, y: y0, w: (x1 - x0) / 2 - 8, h: y1 - y0 },
            { x: x0 + (x1 - x0) / 2 + 8, y: y0, w: (x1 - x0) / 2 - 8, h: y1 - y0 },
          ]
        : [{ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }];
      for (const spot of spots) {
        const margin = rng.range(4, 12);
        buildings.push({
          x: spot.x + margin,
          y: spot.y + margin,
          w: spot.w - margin * 2,
          h: spot.h - margin * 2,
          color: rng.pick(BUILDING_COLORS),
          roof: rng.pick(ROOF_COLORS),
          tall: rng.chance(0.3),
        });
      }
    }
  }

  // Landmark buildings sit on top of the block they name, drawn distinct.
  const landmarks = {};
  for (const [key, spot] of Object.entries(LANDMARK_SPOTS)) {
    landmarks[key] = { ...spot, w: 74, h: 54 };
  }

  return {
    roadsX: ROAD_XS.slice(),
    roadsY: ROAD_YS.slice(),
    buildings,
    parks,
    trees,
    landmarks,
    beach: { x: 0, y: BEACH_TOP, w: WORLD.width, h: WATER_TOP - BEACH_TOP },
    water: { x: 0, y: WATER_TOP, w: WORLD.width, h: WORLD.height - WATER_TOP },
  };
}

/** True when the point is on a road (within the asphalt). */
export function isOnRoad(city, x, y) {
  const half = ROAD_WIDTH / 2;
  for (const rx of city.roadsX) if (Math.abs(x - rx) < half) return true;
  for (const ry of city.roadsY) if (Math.abs(y - ry) < half) return true;
  return false;
}

/** True when the point is inside the bay water. */
export function isInWater(city, x, y) {
  return y >= city.water.y && x >= 0 && x <= WORLD.width;
}

/** The road point nearest a landmark: where a car or walker can actually reach it. */
export function landmarkApproach(city, key) {
  const lm = city.landmarks[key];
  if (!lm) return null;
  return nearestRoadPoint(city, lm.x, lm.y);
}

/** Snap a point onto the nearest road centre line. */
export function nearestRoadPoint(city, x, y) {
  let bestX = city.roadsX[0];
  let bestDx = Infinity;
  for (const rx of city.roadsX) {
    const dx = Math.abs(x - rx);
    if (dx < bestDx) { bestDx = dx; bestX = rx; }
  }
  let bestY = city.roadsY[0];
  let bestDy = Infinity;
  for (const ry of city.roadsY) {
    const dy = Math.abs(y - ry);
    if (dy < bestDy) { bestDy = dy; bestY = ry; }
  }
  return bestDx <= bestDy ? { x: bestX, y } : { x, y: bestY };
}

/** A random point on a random road, for spawning traffic. */
export function randomRoadPoint(city, rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(city.roadsX), y: rng.range(60, WORLD.height - 220), vertical: true };
  }
  return { x: rng.range(60, WORLD.width - 60), y: rng.pick(city.roadsY), vertical: false };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(city, rng) {
  const p = randomRoadPoint(city, rng);
  if (p.vertical) return { x: p.x + (rng.chance(0.5) ? 44 : -44), y: p.y };
  return { x: p.x, y: p.y + (rng.chance(0.5) ? 44 : -44) };
}

/** The road intersection nearest a point (used by the autopilot). */
export function nearestIntersection(city, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of city.roadsX) {
    for (const ry of city.roadsY) {
      const d = (x - rx) * (x - rx) + (y - ry) * (y - ry);
      if (d < bestD) { bestD = d; best = { x: rx, y: ry }; }
    }
  }
  return best;
}

// Circle-vs-rectangle test used for buildings, parked props and the water edge.
export function circleHitsRect(x, y, r, rect) {
  const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/** Push a circle out of every building it overlaps; returns true when pushed. */
export function resolveBuildingCollisions(city, body) {
  let pushed = false;
  for (const b of city.buildings) {
    if (!circleHitsRect(body.x, body.y, body.radius, b)) continue;
    pushed = true;
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    let dx = body.x - cx;
    let dy = body.y - cy;
    if (dx === 0 && dy === 0) {
      // Centre inside the building: push out along the smallest overlap.
      const left = body.x - b.x;
      const right = b.x + b.w - body.x;
      const top = body.y - b.y;
      const bottom = b.y + b.h - body.y;
      const min = Math.min(left, right, top, bottom);
      if (min === left) { body.x = b.x - body.radius; }
      else if (min === right) { body.x = b.x + b.w + body.radius; }
      else if (min === top) { body.y = b.y - body.radius; }
      else { body.y = b.y + b.h + body.radius; }
      continue;
    }
    const len = Math.hypot(dx, dy);
    dx /= len;
    dy /= len;
    body.x = cx + dx * body.radius;
    body.y = cy + dy * body.radius;
  }
  return pushed;
}
