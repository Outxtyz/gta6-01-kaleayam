// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game moves
// between five screens: title, play, paused, game over and story complete.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot. ?selftest=1 runs a headless smoke
// test and writes PASS/FAIL into the document title.
import { STEP, SCREEN_TITLE, SCREEN_PLAY, SCREEN_PAUSED, SCREEN_OVER, SCREEN_COMPLETE, ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_HORN, BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, stepWorld, loadIntoWorld, saveGame, respawn, advanceDialogue, EVENT_WASTED, EVENT_BUSTED, EVENT_STORY_DONE } from './world.js';
import { createInput } from './input.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';
import { hasSave, loadSave } from './save.js';

/** The longest frame the loop catches up on; a longer stall is dropped. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const selftest = params.get('selftest') === '1';
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(seed);
const renderer = createRenderer(canvas);
const audio = createAudio();
world.audio = audio;

// The canvas fills the window; the renderer reads its size every frame.
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function readBest() {
  const save = loadSave();
  return save ? Math.max(save.cash || 0, 0) : 0;
}

function runShot(name) {
  const scene = stageShot(name, world);
  // Paint synchronously, twice, at module level: a headless screenshot can
  // fire before the first animation frame, so the frame must already be
  // on the canvas when the page finishes loading. Then keep repainting:
  // a late resize (headless screenshot applies the window size after
  // load) clears the canvas, and only a live loop puts the frame back.
  renderer.draw(world, scene.screen, { menuIndex: 0, hasSave: false, bestCash: scene.best });
  renderer.draw(world, scene.screen, { menuIndex: 0, hasSave: false, bestCash: scene.best });
  function repaint() {
    renderer.draw(world, scene.screen, { menuIndex: 0, hasSave: false, bestCash: scene.best });
    requestAnimationFrame(repaint);
  }
  requestAnimationFrame(repaint);
  window.__shotReady = true;
}

function runSelftest() {
  // Drive the real loop headlessly: enter a car, steal, shoot, save, load.
  const results = [];
  function check(name, ok) {
    results.push(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  }
  try {
    check('city has buildings', world.city.buildings.length > 30);
    check('city has landmarks', Object.keys(world.city.landmarks).length >= 10);
    check('traffic spawned', world.cars.length >= 10);
    check('pedestrians spawned', world.peds.length >= 15);
    const idle = { x: 0, y: 0, up: false, down: false, left: false, right: false, handbrake: false, run: false, interact: false, interactEdge: false, confirmEdge: false, punch: false, shoot: false, aimX: 0, aimY: 0 };
    const drive = { ...idle, up: true };
    const enter = { ...idle, interact: true, interactEdge: true };
    // Walk into the starter car and drive it east along the road.
    const starter = world.cars[0];
    world.player.x = starter.x;
    world.player.y = starter.y;
    stepWorld(world, enter, STEP);
    check('enter car', !world.player.onFoot && world.player.car === starter);
    for (let i = 0; i < 300; i += 1) stepWorld(world, drive, STEP);
    check('driving moves the car', Math.abs(world.player.car.speed) > 20);
    check('starter car is no crime', world.player.wanted === 0);
    // Get out and steal a traffic car: that is the crime that raises heat.
    stepWorld(world, enter, STEP);
    const traffic = world.cars.find((c) => c.driver === 'traffic');
    world.player.x = traffic.x;
    world.player.y = traffic.y;
    stepWorld(world, enter, STEP);
    check('steal traffic car', world.player.car === traffic);
    check('wanted rose on steal', world.player.wanted >= 1);
    // Keep driving for 10 seconds: the police should show up.
    for (let i = 0; i < 600; i += 1) stepWorld(world, drive, STEP);
    check('police responded', world.cars.some((c) => c.type === 'police'));
    // Get out on foot and shoot once.
    stepWorld(world, enter, STEP);
    const ammoBefore = world.player.ammo;
    stepWorld(world, { ...idle, shoot: true, aimX: world.player.x + 200, aimY: world.player.y }, STEP);
    check('shooting spends ammo', world.player.ammo === ammoBefore - 1);
    // Save and load round-trip.
    saveGame(world);
    const fresh = createWorld(seed);
    const loaded = loadIntoWorld(fresh);
    check('save loads back', loaded && fresh.player.cash === world.player.cash);
    // Teleport the player (and the car, if they are in one) to the garage.
    const g = world.city.landmarks.garage;
    if (world.player.car) {
      world.player.car.x = g.x;
      world.player.car.y = g.y;
    }
    world.player.x = g.x;
    world.player.y = g.y;
    check('world still alive after 900 steps', !world.gameOver);
  } catch (error) {
    results.push(`FAIL exception: ${error.message}`);
  }
  const failed = results.filter((r) => r.startsWith('FAIL')).length;
  document.title = failed === 0 ? `SELFTEST PASS (${results.length})` : `SELFTEST FAIL (${failed}/${results.length})`;
  const pre = document.createElement('pre');
  pre.id = 'selftest';
  pre.textContent = results.join('\n');
  document.body.appendChild(pre);
  window.__shotReady = true;
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let menuIndex = 0;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let interactHeld = false;
  let upHeld = false;
  let downHeld = false;

  function announce(message) {
    status.textContent = message;
  }

  function titleLines() {
    return hasSave() ? ['New Game', 'Continue', 'How to play'] : ['New Game', 'How to play'];
  }

  function startNewGame() {
    const fresh = createWorld(seed);
    Object.assign(world, fresh);
    world.audio = audio;
    screen = SCREEN_PLAY;
    announce('Playing. Steal a car, take the jobs, pay off Vera.');
  }

  function continueGame() {
    const fresh = createWorld(seed);
    Object.assign(world, fresh);
    world.audio = audio;
    loadIntoWorld(world);
    screen = SCREEN_PLAY;
    announce('Welcome back to Porto Verde.');
  }

  function buildControls() {
    const dir = input.direction();
    const interact = input.interact;
    const interactEdge = interact && !interactHeld;
    interactHeld = interact;
    // A click both shoots and confirms; read it before takeActions consumes it.
    const clicked = input.takeClick();
    const actions = input.takeActions();
    const confirmEdge = Boolean(actions & ACTION_CONFIRM) || clicked;
    const upEdge = input.up && !upHeld;
    const downEdge = input.down && !downHeld;
    upHeld = input.up;
    downHeld = input.down;
    if (actions & ACTION_MUTE) {
      audio.toggleMute();
      announce(audio.isMuted ? 'Sound muted.' : 'Sound on.');
    }
    if (actions & ACTION_HORN && !world.player.onFoot) audio.horn();
    return {
      x: dir.x,
      y: dir.y,
      up: input.up,
      down: input.down,
      upEdge,
      downEdge,
      left: input.left,
      right: input.right,
      run: input.run,
      handbrake: input.handbrake,
      interact,
      interactEdge,
      confirmEdge,
      punch: input.punch,
      shoot: clicked,
      aimX: world.camera.x + (input.mouseX - canvas.width / 2),
      aimY: world.camera.y + (input.mouseY - canvas.height / 2),
      pausePressed: Boolean(actions & ACTION_PAUSE),
    };
  }

  function titleMenuAction() {
    const lines = titleLines();
    const choice = lines[menuIndex];
    if (choice === 'New Game') startNewGame();
    else if (choice === 'Continue') continueGame();
    else if (choice === 'How to play') {
      announce('WASD move and drive, E enter or steal a car, mouse to aim, click to shoot, Space to punch, Shift to run or handbrake.');
    }
  }

  function pauseMenuAction() {
    if (menuIndex === 0) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    } else if (menuIndex === 1) {
      saveGame(world);
      announce('Game saved.');
    } else if (menuIndex === 2) {
      screen = SCREEN_TITLE;
      menuIndex = 0;
      announce('Porto Verde. Press Enter to start.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    const controls = buildControls();
    // Menus eat the confirm edge; dialogue eats it next; the world gets it last.
    if (controls.pausePressed && (screen === SCREEN_PLAY || screen === SCREEN_PAUSED)) {
      screen = screen === SCREEN_PLAY ? SCREEN_PAUSED : SCREEN_PLAY;
      menuIndex = 0;
      announce(screen === SCREEN_PAUSED ? 'Paused.' : 'Playing.');
    }
    if (screen === SCREEN_TITLE) {
      if (controls.confirmEdge) {
        if (world.dialogue) advanceDialogue(world);
        else titleMenuAction();
      }
      const lines = titleLines();
      if (controls.upEdge) menuIndex = (menuIndex + lines.length - 1) % lines.length;
      if (controls.downEdge) menuIndex = (menuIndex + 1) % lines.length;
      // The city idles behind the title.
      while (accumulator >= STEP) {
        stepWorld(world, { x: 0, y: 0, up: false, down: false, left: false, right: false, handbrake: false, run: false, interact: false, interactEdge: false, confirmEdge: false, punch: false, shoot: false, aimX: 0, aimY: 0 }, STEP);
        accumulator -= STEP;
      }
      world.camera.x = 1200 + Math.sin(now / 9000) * 160;
      world.camera.y = 760 + Math.cos(now / 11000) * 110;
    } else if (screen === SCREEN_PLAY) {
      if (world.dialogue && controls.confirmEdge) {
        advanceDialogue(world);
      } else {
        while (accumulator >= STEP) {
          const events = stepWorld(world, controls, STEP);
          accumulator -= STEP;
          if (events & EVENT_WASTED || events & EVENT_BUSTED) {
            screen = SCREEN_OVER;
            if (audio.ready) audio.busted();
            break;
          }
          if (events & EVENT_STORY_DONE) {
            screen = SCREEN_COMPLETE;
            break;
          }
        }
      }
      if (world.gameOver === 'wasted' || world.gameOver === 'busted') screen = SCREEN_OVER;
      else if (world.gameOver === 'complete') screen = SCREEN_COMPLETE;
    } else if (screen === SCREEN_PAUSED) {
      if (controls.confirmEdge) pauseMenuAction();
      if (controls.upEdge) menuIndex = (menuIndex + 2) % 3;
      if (controls.downEdge) menuIndex = (menuIndex + 1) % 3;
      accumulator = 0;
    } else if (screen === SCREEN_OVER) {
      accumulator = 0;
      if (controls.confirmEdge) {
        respawn(world);
        screen = SCREEN_PLAY;
        announce('Back on your feet. Stay out of trouble.');
      }
    } else if (screen === SCREEN_COMPLETE) {
      accumulator = 0;
      if (controls.confirmEdge) {
        world.gameOver = null;
        screen = SCREEN_PLAY;
        announce('Free roam. Porto Verde is yours.');
      }
    }
    // First gesture unlocks the sound.
    if (controls.up || controls.down || controls.left || controls.right || controls.shoot || controls.confirmEdge) {
      audio.unlock();
    }
    renderer.draw(world, screen, { menuIndex, hasSave: hasSave(), bestCash: best });
    if (world.player.cash > best) best = world.player.cash;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      menuIndex = 0;
      announce('Paused.');
    }
  });

  announce('Porto Verde. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (selftest) runSelftest();
else if (shot) runShot(shot);
else runGame();
