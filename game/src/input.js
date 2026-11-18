// Keyboard and mouse input: held keys as a small state object, edge-triggered
// actions (confirm, pause, save, mute, horn) and the mouse position in canvas
// pixels plus the world point it aims at (set by the game each frame).
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_MUTE, ACTION_HORN } from './config.js';

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM,
  Escape: ACTION_PAUSE,
  KeyP: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyH: ACTION_HORN,
};

export function createInput(canvas) {
  const held = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicked = false;

  function onKeyDown(event) {
    if (event.repeat) return;
    held.add(event.code);
    const action = KEY_ACTIONS[event.code];
    if (action) {
      actions |= action;
      event.preventDefault();
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  }
  function onKeyUp(event) {
    held.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  }
  function onMouseDown(event) {
    if (event.button === 0) {
      mouseDown = true;
      clicked = true;
      onMouseMove(event);
    }
  }
  function onMouseUp(event) {
    if (event.button === 0) mouseDown = false;
  }
  function onClick(event) {
    // A click on the canvas also confirms menus.
    if (event.target === canvas) actions |= ACTION_CONFIRM;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** Driving / walking direction: -1, 0 or 1 on each axis. */
    direction() {
      const left = held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0;
      const right = held.has('KeyD') || held.has('ArrowRight') ? 1 : 0;
      const up = held.has('KeyW') || held.has('ArrowUp') ? 1 : 0;
      const down = held.has('KeyS') || held.has('ArrowDown') ? 1 : 0;
      return { x: right - left, y: down - up };
    },
    get up() { return held.has('KeyW') || held.has('ArrowUp'); },
    get down() { return held.has('KeyS') || held.has('ArrowDown'); },
    get left() { return held.has('KeyA') || held.has('ArrowLeft'); },
    get right() { return held.has('KeyD') || held.has('ArrowRight'); },
    get run() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    get handbrake() { return held.has('ShiftLeft') || held.has('ShiftRight'); },
    get interact() { return held.has('KeyE'); },
    get punch() { return held.has('Space'); },
    get mouseDown() { return mouseDown; },
    get mouseX() { return mouseX; },
    get mouseY() { return mouseY; },
    /** Edge-triggered actions since the last call; also consumes the click. */
    takeActions() {
      const value = actions | (clicked ? ACTION_CONFIRM : 0);
      actions = 0;
      clicked = false;
      return value;
    },
    /** True on the frame the mouse button went down. */
    takeClick() {
      const value = clicked;
      clicked = false;
      return value;
    },
  };
}
