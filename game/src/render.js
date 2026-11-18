// The painter: the city from above, the cars and the people in it, the HUD
// with its minimap, and the title, pause and game-over screens. Everything
// is drawn on one canvas; nothing here loads an image or a font file.
import { WORLD, ROAD_WIDTH, COLORS, CAR_TYPES, PLAYER, SCREEN_TITLE, SCREEN_PAUSED, SCREEN_OVER, SCREEN_COMPLETE } from './config.js';
import { objectiveText, currentMission } from './missions.js';

const MINIMAP_W = 190;
const MINIMAP_H = 142;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  const def = CAR_TYPES[car.type];
  const half = def.length / 2;
  const halfW = def.width / 2;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  roundRect(ctx, -half + 3, -halfW + 3, def.length, def.width, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -half, -halfW, def.length, def.width, 7);
  ctx.fill();
  // Roof and windows.
  ctx.fillStyle = 'rgba(20, 28, 38, 0.85)';
  roundRect(ctx, -half * 0.45, -halfW + 4, def.length * 0.42, def.width - 8, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180, 220, 255, 0.75)';
  roundRect(ctx, half * 0.28, -halfW + 5, 7, def.width - 10, 3);
  ctx.fill();
  // Headlights and tail lights.
  ctx.fillStyle = '#fff8c9';
  ctx.fillRect(half - 3, -halfW + 3, 3, 5);
  ctx.fillRect(half - 3, halfW - 8, 3, 5);
  ctx.fillStyle = '#ff3b30';
  ctx.fillRect(-half, -halfW + 3, 3, 5);
  ctx.fillRect(-half, halfW - 8, 3, 5);
  if (car.type === 'taxi') {
    ctx.fillStyle = '#111';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(-half + 8 + i * 8, -2, 4, 4);
  }
  if (car.type === 'police') {
    // Flashing light bar.
    const phase = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2d2d' : '#2d7dff';
    roundRect(ctx, -6, -halfW + 2, 12, 6, 2);
    ctx.fill();
    ctx.fillStyle = phase ? '#2d7dff' : '#ff2d2d';
    roundRect(ctx, -6, halfW - 8, 12, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#f5f2e8';
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PVPD', 0, 1);
  }
  if (car.type === 'truck') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-half + 4, -halfW + 3, def.length * 0.4, def.width - 6);
  }
  // Damage smoke is particles; heavy damage shows a dent.
  if (car.hp < car.maxHp * 0.4) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -half + 2, -halfW + 2, 10, 8, 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPedShape(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath();
  ctx.arc(Math.cos(ped.angle) * 4, Math.sin(ped.angle) * 4, 5.5, 0, Math.PI * 2);
  ctx.fill();
  if (ped.state === 'down') {
    ctx.rotate(ped.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');

  function drawGround(state) {
    const cam = state.camera;
    const viewW = canvas.width;
    const viewH = canvas.height;
    const x0 = Math.max(0, cam.x - viewW / 2 - 40);
    const y0 = Math.max(0, cam.y - viewH / 2 - 40);
    const x1 = Math.min(WORLD.width, cam.x + viewW / 2 + 40);
    const y1 = Math.min(WORLD.height, cam.y + viewH / 2 + 40);
    // Grass base.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Mown stripes for a little texture.
    ctx.fillStyle = COLORS.grassDark;
    const stripe = 90;
    for (let y = Math.floor(y0 / stripe) * stripe; y < y1; y += stripe * 2) {
      ctx.fillRect(x0, y, x1 - x0, stripe);
    }
    // Parks.
    for (const park of state.city.parks) {
      ctx.fillStyle = park.kind === 'park' ? COLORS.park : '#a8bf7a';
      ctx.fillRect(park.x, park.y, park.w, park.h);
    }
    // Beach and bay.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(state.city.beach.x, state.city.beach.y, state.city.beach.w, state.city.beach.h);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(state.city.water.x, state.city.water.y, state.city.water.w, state.city.water.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 5; i += 1) {
      const wy = state.city.water.y + 18 + i * 22 + Math.sin(state.time * 1.2 + i * 1.7) * 4;
      ctx.beginPath();
      ctx.moveTo(x0, wy);
      ctx.lineTo(x1, wy + Math.sin(state.time + i) * 3);
      ctx.stroke();
    }
    // Trees.
    for (const tree of state.city.trees) {
      ctx.fillStyle = COLORS.tree;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = COLORS.treeLight;
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 3, tree.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawRoads(state) {
    const half = ROAD_WIDTH / 2;
    // Sidewalk border, then asphalt.
    ctx.fillStyle = COLORS.sidewalk;
    for (const rx of state.city.roadsX) ctx.fillRect(rx - half - 8, 0, ROAD_WIDTH + 16, WORLD.height);
    for (const ry of state.city.roadsY) ctx.fillRect(0, ry - half - 8, WORLD.width, ROAD_WIDTH + 16);
    ctx.fillStyle = COLORS.road;
    for (const rx of state.city.roadsX) ctx.fillRect(rx - half, 0, ROAD_WIDTH, WORLD.height);
    for (const ry of state.city.roadsY) ctx.fillRect(0, ry - half, WORLD.width, ROAD_WIDTH);
    // Centre dashes.
    ctx.fillStyle = COLORS.roadLine;
    for (const rx of state.city.roadsX) {
      for (let y = 0; y < WORLD.height; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
    }
    for (const ry of state.city.roadsY) {
      for (let x = 0; x < WORLD.width; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
    }
    // Curbs.
    ctx.strokeStyle = COLORS.curb;
    ctx.lineWidth = 2;
    for (const rx of state.city.roadsX) {
      ctx.beginPath(); ctx.moveTo(rx - half - 8, 0); ctx.lineTo(rx - half - 8, WORLD.height); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx + half + 8, 0); ctx.lineTo(rx + half + 8, WORLD.height); ctx.stroke();
    }
    for (const ry of state.city.roadsY) {
      ctx.beginPath(); ctx.moveTo(0, ry - half - 8); ctx.lineTo(WORLD.width, ry - half - 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, ry + half + 8); ctx.lineTo(WORLD.width, ry + half + 8); ctx.stroke();
    }
  }

  function drawBuildings(state) {
    for (const b of state.city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 5, b.y + 6, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 5, b.y + 5, b.w - 10, b.h - 10);
      // Windows.
      ctx.fillStyle = 'rgba(255, 244, 200, 0.75)';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let c = 0; c < cols; c += 1) {
        for (let r = 0; r < rows; r += 1) {
          if ((c * 7 + r * 3 + b.x) % 5 === 0) continue;
          ctx.fillRect(b.x + 10 + c * 26, b.y + 10 + r * 26, 10, 12);
        }
      }
    }
    // Landmarks stand out: a coloured block with a white initial.
    const landmarkColors = {
      safehouse: '#2e9e5b', spray: '#e67e22', hospital: '#e74c3c', garage: '#8e44ad',
      bank: '#2c3e50', diner: '#d35400', docks: '#16a085', marina: '#2980b9',
      yacht: '#f1c40f', motel: '#c0392b', market: '#27ae60', plaza: '#7f8c8d',
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [key, lm] of Object.entries(state.city.landmarks)) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(lm.x - lm.w / 2 + 4, lm.y - lm.h / 2 + 5, lm.w, lm.h);
      ctx.fillStyle = landmarkColors[key] || '#888';
      ctx.fillRect(lm.x - lm.w / 2, lm.y - lm.h / 2, lm.w, lm.h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(lm.label.slice(0, 1), lm.x, lm.y);
    }
  }

  function drawMarkers(state) {
    const player = state.player;
    // Mission target: pulsing yellow diamond.
    const mission = currentMission(state.mission);
    let target = null;
    if (state.taxi.active && state.taxi.stage === 'toPassenger' && state.taxi.passenger) {
      target = { x: state.taxi.passenger.x, y: state.taxi.passenger.y, label: 'Passenger', color: '#22d3ee' };
    } else if (state.taxi.active && state.taxi.dest) {
      target = { x: state.taxi.dest.x, y: state.taxi.dest.y, label: 'Drop-off', color: '#22d3ee' };
    } else if (mission && state.mission.active) {
      const step = mission.steps[state.mission.step];
      if (step) {
        if (step.kind === 'collect') {
          const next = step.targets.find((t) => !state.mission.collected.includes(t));
          if (next) {
            const lm = state.city.landmarks[next];
            const at = lm.approach || lm;
            target = { x: at.x, y: at.y, label: next, color: COLORS.mission };
          }
        } else if (step.target) {
          const lm = state.city.landmarks[step.target];
          if (lm) {
            const at = lm.approach || lm;
            target = { x: at.x, y: at.y, label: lm.label, color: COLORS.mission };
          }
        }
      }
    }
    if (target) {
      const pulse = 1 + Math.sin(state.time * 5) * 0.15;
      ctx.save();
      ctx.translate(target.x, target.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = target.color;
      ctx.globalAlpha = 0.9;
      const s = 15 * pulse;
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.strokeRect(-s / 2, -s / 2, s, s);
      ctx.restore();
      ctx.globalAlpha = 1;
      // Distance line from the player.
      ctx.strokeStyle = 'rgba(255, 210, 63, 0.5)';
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(player.x, player.y);
      ctx.lineTo(target.x, target.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${target.label} — ${Math.round(Math.hypot(target.x - player.x, target.y - player.y) / 10) * 10}m`, target.x, target.y - 26);
    }
    // Hidden packages glint.
    for (const spot of state.packages.spots) {
      if (spot.found) continue;
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(spot.x - 6, spot.y - 6, 12, 12);
      ctx.strokeStyle = '#8a6d00';
      ctx.lineWidth = 2;
      ctx.strokeRect(spot.x - 6, spot.y - 6, 12, 12);
    }
    // Pickups.
    for (const pickup of state.pickups) {
      if (pickup.respawn > 0) continue;
      const colors = { health: '#ff5b5b', armor: '#4da3ff', ammo: '#ffd23f' };
      const labels = { health: '+', armor: 'A', ammo: '»' };
      ctx.fillStyle = colors[pickup.kind];
      ctx.beginPath();
      ctx.arc(pickup.x, pickup.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[pickup.kind], pickup.x, pickup.y + 0.5);
    }
  }

  function drawWorld(state) {
    const cam = state.camera;
    ctx.save();
    ctx.translate(Math.round(canvas.width / 2 - cam.x), Math.round(canvas.height / 2 - cam.y));
    drawGround(state);
    drawRoads(state);
    // Skid marks under everything that drives.
    ctx.strokeStyle = 'rgba(20,20,20,0.4)';
    ctx.lineWidth = 4;
    for (const skid of state.skids) {
      ctx.globalAlpha = Math.min(1, skid.life / 2);
      ctx.beginPath();
      ctx.moveTo(skid.x1, skid.y1);
      ctx.lineTo(skid.x2, skid.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    drawBuildings(state);
    drawMarkers(state);
    // Cars, sorted so nearer ones draw last.
    const cars = state.cars.slice().sort((a, b) => a.y - b.y);
    for (const car of cars) {
      if (car.hp <= 0) continue;
      drawCarShape(ctx, car, state.time);
    }
    for (const ped of state.peds) drawPedShape(ctx, ped);
    for (const cop of state.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.fillStyle = '#1f3a93';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(Math.cos(cop.angle) * 3, Math.sin(cop.angle) * 3, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1f3a93';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // The player on foot: a red-jacketed figure with a white cap.
    if (state.player.onFoot) {
      const p = state.player;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d7263d';
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f1c27d';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 4, Math.sin(p.angle) * 4, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5f2e8';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 4, Math.sin(p.angle) * 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    // Particles on top.
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Warm late-afternoon light over everything.
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, 'rgba(255, 190, 90, 0.05)');
    grad.addColorStop(1, 'rgba(255, 120, 40, 0.08)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawBar(x, y, w, h, ratio, fill, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, ratio)), h);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 6, y + h / 2 + 0.5);
  }

  function drawMinimap(state) {
    const x0 = canvas.width - MINIMAP_W - 16;
    const y0 = canvas.height - MINIMAP_H - 16;
    const sx = MINIMAP_W / WORLD.width;
    const sy = MINIMAP_H / WORLD.height;
    ctx.save();
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(x0 - 4, y0 - 4, MINIMAP_W + 8, MINIMAP_H + 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 - 4, y0 - 4, MINIMAP_W + 8, MINIMAP_H + 8);
    ctx.beginPath();
    ctx.rect(x0, y0, MINIMAP_W, MINIMAP_H);
    ctx.clip();
    ctx.fillStyle = '#5d8a4a';
    ctx.fillRect(x0, y0, MINIMAP_W, MINIMAP_H);
    ctx.fillStyle = '#2e7fb8';
    ctx.fillRect(x0, y0 + MINIMAP_H - 8, MINIMAP_W, 8);
    ctx.strokeStyle = '#3c3f46';
    ctx.lineWidth = 3;
    for (const rx of state.city.roadsX) {
      ctx.beginPath();
      ctx.moveTo(x0 + rx * sx, y0);
      ctx.lineTo(x0 + rx * sx, y0 + MINIMAP_H);
      ctx.stroke();
    }
    for (const ry of state.city.roadsY) {
      ctx.beginPath();
      ctx.moveTo(x0, y0 + ry * sy);
      ctx.lineTo(x0 + MINIMAP_W, y0 + ry * sy);
      ctx.stroke();
    }
    // Safehouse.
    const safe = state.city.landmarks.safehouse;
    ctx.fillStyle = '#2e9e5b';
    ctx.fillRect(x0 + safe.x * sx - 3, y0 + safe.y * sy - 3, 6, 6);
    // Mission target.
    const mission = currentMission(state.mission);
    if (mission && state.mission.active) {
      const step = mission.steps[state.mission.step];
      let target = null;
      if (step && step.kind === 'collect') {
        const next = step.targets.find((t) => !state.mission.collected.includes(t));
        if (next) target = state.city.landmarks[next];
      } else if (step && step.target) {
        target = state.city.landmarks[step.target];
      }
      if (target) {
        const at = target.approach || target;
        ctx.fillStyle = COLORS.mission;
        ctx.beginPath();
        ctx.arc(x0 + at.x * sx, y0 + at.y * sy, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (state.taxi.active) {
      const t = state.taxi.stage === 'toPassenger' ? state.taxi.passenger : state.taxi.dest;
      if (t) {
        ctx.fillStyle = '#22d3ee';
        ctx.beginPath();
        ctx.arc(x0 + t.x * sx, y0 + t.y * sy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Police as red dots.
    ctx.fillStyle = '#ff2d2d';
    for (const car of state.cars) {
      if (car.type === 'police' && car.driver === 'police') {
        ctx.beginPath();
        ctx.arc(x0 + car.x * sx, y0 + car.y * sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // The player as a white arrow.
    const p = state.player;
    ctx.save();
    ctx.translate(x0 + p.x * sx, y0 + p.y * sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(7, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // Viewport rectangle.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      x0 + (state.camera.x - canvas.width / 2) * sx,
      y0 + (state.camera.y - canvas.height / 2) * sy,
      canvas.width * sx,
      canvas.height * sy,
    );
    ctx.restore();
  }

  function drawHud(state) {
    const p = state.player;
    ctx.save();
    // Top-left status panel.
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect(12, 12, 248, 96);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(12, 12, 248, 96);
    drawBar(24, 22, 200, 16, p.hp / PLAYER.maxHp, '#e74c3c', 'HP');
    drawBar(24, 44, 200, 12, p.armor / PLAYER.maxArmor, '#4da3ff', 'ARMOR');
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 17px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 24, 76);
    ctx.font = '13px sans-serif';
    ctx.fillStyle = p.ammo > 0 ? '#ffd23f' : '#ff6b6b';
    ctx.fillText(`Ammo ${p.ammo}`, 150, 76);
    ctx.fillStyle = '#aaa';
    ctx.font = '11px sans-serif';
    ctx.fillText('WASD move/drive · E car · Click shoot · Space punch', 24, 96);
    // Wanted stars, top-right.
    ctx.textAlign = 'right';
    ctx.font = 'bold 26px sans-serif';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < p.wanted ? COLORS.hudAccent : 'rgba(255,255,255,0.22)';
      ctx.fillText('★', canvas.width - 24 - i * 30, 34);
    }
    ctx.font = '12px sans-serif';
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(p.wanted > 0 ? `WANTED ${p.wanted}` : 'CLEAN', canvas.width - 24, 58);
    // Objective, bottom centre.
    const objective = objectiveText(state.mission);
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    const objW = ctx.measureText(objective).width + 28;
    ctx.fillStyle = COLORS.hudBg;
    ctx.fillRect((canvas.width - objW) / 2, canvas.height - 118, objW, 30);
    ctx.fillStyle = COLORS.hudAccent;
    ctx.fillText(`◆ ${objective}`, canvas.width / 2, canvas.height - 102);
    // Speed and car, bottom-left when driving.
    if (!p.onFoot && p.car) {
      ctx.textAlign = 'left';
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#fff';
      const kmh = Math.round(Math.abs(p.speed) * 0.55);
      ctx.fillText(`${kmh}`, 24, canvas.height - 68);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#ddd';
      ctx.fillText(`km/h · ${CAR_TYPES[p.car.type].name} · HP ${Math.max(0, Math.ceil(p.car.hp))}`, 74, canvas.height - 68);
      ctx.fillStyle = '#aaa';
      ctx.font = '11px sans-serif';
      ctx.fillText('Shift handbrake · E get out · H horn', 24, canvas.height - 48);
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ddd';
      ctx.font = '13px sans-serif';
      const mission = currentMission(state.mission);
      ctx.fillText(mission && !state.mission.active ? 'Press Enter to start the next job' : 'On foot — walk up to a car and press E to steal it', 24, canvas.height - 68);
      ctx.fillStyle = '#aaa';
      ctx.font = '11px sans-serif';
      ctx.fillText('Shift run · Space punch · Click shoot · E enter car', 24, canvas.height - 48);
    }
    // Spray hold progress.
    if (state.sprayHold > 0) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(`Respraying… ${Math.ceil(state.sprayHold * 100)}%`, canvas.width / 2, canvas.height - 140);
    }
    drawMinimap(state);
    // Banner.
    if (state.banner) {
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      const bw = 520;
      ctx.fillRect((canvas.width - bw) / 2, 84, bw, 64);
      ctx.fillStyle = COLORS.hudAccent;
      ctx.font = 'bold 30px sans-serif';
      ctx.fillText(state.banner.text, canvas.width / 2, 108);
      ctx.fillStyle = '#fff';
      ctx.font = '15px sans-serif';
      ctx.fillText(state.banner.sub, canvas.width / 2, 134);
    }
    // Toast message.
    if (state.message) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText(state.message.text, canvas.width / 2, 168);
    }
    // Dialogue box.
    if (state.dialogue) {
      const line = state.dialogue.lines[state.dialogue.index];
      ctx.fillStyle = 'rgba(10, 12, 20, 0.88)';
      const bw = Math.min(760, canvas.width - 120);
      ctx.fillRect((canvas.width - bw) / 2, canvas.height - 220, bw, 76);
      ctx.strokeStyle = COLORS.hudAccent;
      ctx.strokeRect((canvas.width - bw) / 2, canvas.height - 220, bw, 76);
      ctx.fillStyle = '#fff';
      ctx.font = '15px sans-serif';
      ctx.textAlign = 'left';
      wrapText(line, (canvas.width - bw) / 2 + 18, canvas.height - 196, bw - 36, 20);
      ctx.fillStyle = '#aaa';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('Enter / click to continue', (canvas.width + bw) / 2 - 14, canvas.height - 156);
    }
    ctx.restore();
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let cy = y;
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, cy);
        line = word;
        cy += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, cy);
  }

  function drawMenu(title, lines, selected) {
    ctx.save();
    ctx.fillStyle = 'rgba(8, 10, 18, 0.62)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.hudAccent;
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText(title, canvas.width / 2, canvas.height / 2 - 130);
    ctx.fillStyle = '#fff';
    ctx.font = '20px sans-serif';
    ctx.fillText('A street crime story — Porto Verde', canvas.width / 2, canvas.height / 2 - 92);
    lines.forEach((entry, i) => {
      const y = canvas.height / 2 - 30 + i * 40;
      if (i === selected) {
        ctx.fillStyle = COLORS.hudAccent;
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`▶ ${entry}`, canvas.width / 2, y);
      } else {
        ctx.fillStyle = '#ddd';
        ctx.font = '20px sans-serif';
        ctx.fillText(entry, canvas.width / 2, y);
      }
    });
    ctx.fillStyle = '#aaa';
    ctx.font = '14px sans-serif';
    ctx.fillText('WASD / arrows — move & drive · E — enter / steal car · Mouse — aim & shoot · Space — punch', canvas.width / 2, canvas.height / 2 + 150);
    ctx.fillText('Shift — run / handbrake · Esc — pause · M — mute sound', canvas.width / 2, canvas.height / 2 + 176);
    ctx.restore();
  }

  function draw(state, screen, ui) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (screen === SCREEN_TITLE) {
      drawWorld(state);
      const lines = ui.hasSave
        ? ['New Game', 'Continue', 'How to play']
        : ['New Game', 'How to play'];
      drawMenu('PORTO VERDE', lines, ui.menuIndex);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = '15px sans-serif';
      if (ui.bestCash > 0) ctx.fillText(`Best cash: $${ui.bestCash.toLocaleString('en-US')}`, canvas.width / 2, canvas.height / 2 + 210);
      return;
    }
    drawWorld(state);
    if (screen === SCREEN_PAUSED) {
      drawHud(state);
      ctx.save();
      ctx.fillStyle = 'rgba(8, 10, 18, 0.66)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 60);
      const lines = ['Resume', 'Save game', 'Quit to title'];
      lines.forEach((entry, i) => {
        const y = canvas.height / 2 + i * 40;
        if (i === ui.menuIndex) {
          ctx.fillStyle = COLORS.hudAccent;
          ctx.font = 'bold 22px sans-serif';
          ctx.fillText(`▶ ${entry}`, canvas.width / 2, y);
        } else {
          ctx.fillStyle = '#ddd';
          ctx.font = '20px sans-serif';
          ctx.fillText(entry, canvas.width / 2, y);
        }
      });
      ctx.restore();
      return;
    }
    if (screen === SCREEN_OVER) {
      drawHud(state);
      ctx.save();
      ctx.fillStyle = 'rgba(20, 4, 4, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff5b5b';
      ctx.font = 'bold 64px sans-serif';
      ctx.fillText(state.gameOver === 'busted' ? 'BUSTED' : 'WASTED', canvas.width / 2, canvas.height / 2 - 40);
      ctx.fillStyle = '#fff';
      ctx.font = '18px sans-serif';
      ctx.fillText(state.gameOver === 'busted' ? 'The Porto Verde police took you in.' : 'You went down in Porto Verde.', canvas.width / 2, canvas.height / 2 + 4);
      ctx.fillText(`Cash $${state.player.cash.toLocaleString('en-US')} · Missions done ${state.stats.missionsDone} · Cars stolen ${state.stats.carsStolen}`, canvas.width / 2, canvas.height / 2 + 36);
      ctx.fillStyle = COLORS.hudAccent;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Press Enter to respawn at the hospital', canvas.width / 2, canvas.height / 2 + 84);
      ctx.restore();
      return;
    }
    if (screen === SCREEN_COMPLETE) {
      drawHud(state);
      ctx.save();
      ctx.fillStyle = 'rgba(8, 18, 8, 0.72)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.textAlign = 'center';
      ctx.fillStyle = COLORS.hudAccent;
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText('DEBT PAID', canvas.width / 2, canvas.height / 2 - 40);
      ctx.fillStyle = '#fff';
      ctx.font = '19px sans-serif';
      ctx.fillText('All five jobs done. Vera is paid. Porto Verde is yours, Danny.', canvas.width / 2, canvas.height / 2 + 4);
      ctx.fillText(`Total earned $${state.stats.cashEarned.toLocaleString('en-US')} · Cars stolen ${state.stats.carsStolen} · Packages ${state.packages.found.length}/10`, canvas.width / 2, canvas.height / 2 + 36);
      ctx.fillStyle = COLORS.hudAccent;
      ctx.font = 'bold 20px sans-serif';
      ctx.fillText('Press Enter to keep playing — free roam', canvas.width / 2, canvas.height / 2 + 84);
      ctx.restore();
      return;
    }
    drawHud(state);
  }

  return { draw };
}
