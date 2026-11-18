// The story: Danny "Wheels" Reyes owes the fixer Vera Solano $50,000, and five
// jobs pay it down. Each mission is a chain of small objectives; the world
// checks them every step and the dialogue lines play at the start and the end.
// Nothing here touches the renderer: the world asks, this file answers.
import { STORY } from './config.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    name: 'First Wheels',
    giver: 'Vera',
    brief: 'Steal a car — any car — and bring it to my garage.',
    reward: 500,
    startLines: [
      'VERA: Danny. You owe me fifty grand and you have no wheels. Fix the second part.',
      'VERA: Walk up to any car on the street and take it. Bring it to my garage.',
    ],
    doneLines: [
      'VERA: Not bad. The car is yours now — consider it a down payment on your debt.',
      'VERA: One job down. Four to go.',
    ],
    steps: [
      { kind: 'steal', text: 'Steal a car (walk up to one and press E)' },
      { kind: 'goto', target: 'garage', radius: 90, text: "Drive to Vera's Garage" },
    ],
  },
  {
    id: 'the-package',
    name: 'The Package',
    giver: 'Vera',
    brief: 'Pick up the package at the docks. Deliver it to the diner. Fast.',
    reward: 1200,
    startLines: [
      'VERA: A package is waiting at the docks. The diner wants it yesterday.',
      "VERA: You have 100 seconds once you grab it. Don't scratch the paint.",
    ],
    doneLines: [
      'VERA: Delivered, on time. The diner pays well when it is happy.',
    ],
    steps: [
      { kind: 'pickup', target: 'docks', radius: 80, hold: 1.2, text: 'Pick up the package at the Docks' },
      { kind: 'deliver', target: 'diner', radius: 90, timeLimit: STORY.packageTimeLimit, text: 'Deliver to the Diner — fast!' },
    ],
  },
  {
    id: 'heat-wave',
    name: 'Heat Wave',
    giver: 'Vera',
    brief: 'The cops are onto you. Lose them — hide, or get the car resprayed.',
    reward: 800,
    startLines: [
      'VERA: Two stars, Danny. The whole precinct is looking for your car.',
      'VERA: Lay low until it cools off — or pay the spray shop to change the paint.',
    ],
    doneLines: [
      'VERA: Clean again. Try not to collect stars like they are souvenirs.',
    ],
    steps: [
      { kind: 'loseWanted', text: 'Lose the wanted level (hide, or visit the Spray Shop)' },
    ],
    // The job starts hot: two stars on the player the moment it begins.
    startWanted: 2,
  },
  {
    id: 'getaway',
    name: 'The Getaway',
    giver: 'Vera',
    brief: 'My crew is walking out of Verde Bank right now. Be their wheels.',
    reward: 3000,
    startLines: [
      'VERA: The crew is at the bank. Pick them up and get them to the safehouse.',
      'VERA: The police will be all over you. Drive like your life depends on it.',
    ],
    doneLines: [
      'VERA: Clean getaway. The crew says you drive like a ghost.',
    ],
    steps: [
      { kind: 'goto', target: 'bank', radius: 90, text: 'Pick up the crew at Verde Bank' },
      { kind: 'goto', target: 'safehouse', radius: 90, text: 'Drive the crew to the Safehouse', startWanted: 3 },
    ],
  },
  {
    id: 'big-score',
    name: 'The Big Score',
    giver: 'Vera',
    brief: 'Three stashes across town, then the yacht at the marina. This clears your debt.',
    reward: 10000,
    startLines: [
      'VERA: This is it, Danny. Three stashes — market, motel, plaza — then the yacht.',
      'VERA: The whole city will be chasing you. Finish this and you are free.',
    ],
    doneLines: [
      'VERA: Fifty grand, paid in full. The yacht sails at dawn, Danny.',
      'VERA: You are a free man. Porto Verde is yours now.',
    ],
    steps: [
      { kind: 'collect', targets: ['market', 'motel', 'plaza'], radius: 80, text: 'Collect the stashes: Market, Motel, Plaza' },
      { kind: 'goto', target: 'yacht', radius: 90, text: 'Reach the Yacht at the Marina', startWanted: 3 },
    ],
    startWanted: 1,
  },
];

export function createMissionState() {
  return {
    index: 0,
    step: 0,
    timer: 0,
    holdTimer: 0,
    collected: [],
    active: false,
    dialogue: [],
    dialogueIndex: 0,
    failed: false,
  };
}

/** The mission currently offered, or null when the story is done. */
export function currentMission(state) {
  return state.index < MISSIONS.length ? MISSIONS[state.index] : null;
}

export function currentStep(state) {
  const mission = currentMission(state);
  if (!mission) return null;
  return mission.steps[state.step] ?? null;
}

/** Start the next mission: reset the step, arm its timer and wanted level. */
export function startMission(state, mission) {
  state.active = true;
  state.step = 0;
  state.timer = 0;
  state.holdTimer = 0;
  state.collected = [];
  state.failed = false;
  state.dialogue = mission.startLines.slice();
  state.dialogueIndex = 0;
  return mission.startWanted || 0;
}

/**
 * Advance the active mission. `ctx` is the world read-out:
 * { x, y, inCar, wanted, landmark(key), setWanted(n), addHeat(n) }.
 * Returns 'step' | 'done' | 'failed' | null.
 */
export function updateMission(state, ctx, dt) {
  const mission = currentMission(state);
  if (!mission || !state.active) return null;
  const step = currentStep(state);
  if (!step) return null;

  if (step.timeLimit) {
    state.timer += dt;
    if (state.timer > step.timeLimit) {
      state.failed = true;
      state.active = false;
      return 'failed';
    }
  }

  switch (step.kind) {
    case 'steal': {
      if (ctx.inCar) {
        state.step += 1;
        state.timer = 0;
        return 'step';
      }
      break;
    }
    case 'goto':
    case 'deliver': {
      const target = ctx.landmark(step.target);
      if (target && Math.hypot(ctx.x - target.x, ctx.y - target.y) < step.radius) {
        if (step.startWanted) ctx.setWanted(step.startWanted);
        state.step += 1;
        state.timer = 0;
        if (state.step >= mission.steps.length) return finishMission(state, mission);
        return 'step';
      }
      break;
    }
    case 'pickup': {
      const target = ctx.landmark(step.target);
      if (target && Math.hypot(ctx.x - target.x, ctx.y - target.y) < step.radius) {
        state.holdTimer += dt;
        if (state.holdTimer >= (step.hold || 1)) {
          state.step += 1;
          state.timer = 0;
          state.holdTimer = 0;
          return 'step';
        }
      } else {
        state.holdTimer = 0;
      }
      break;
    }
    case 'loseWanted': {
      if (ctx.wanted <= 0) {
        state.step += 1;
        if (state.step >= mission.steps.length) return finishMission(state, mission);
        return 'step';
      }
      break;
    }
    case 'collect': {
      for (const key of step.targets) {
        if (state.collected.includes(key)) continue;
        const target = ctx.landmark(key);
        if (target && Math.hypot(ctx.x - target.x, ctx.y - target.y) < step.radius) {
          state.collected.push(key);
          if (state.collected.length >= step.targets.length) {
            state.step += 1;
            state.timer = 0;
            if (state.step >= mission.steps.length) return finishMission(state, mission);
            return 'step';
          }
          return 'step';
        }
      }
      break;
    }
    default:
      break;
  }
  return null;
}

function finishMission(state, mission) {
  state.active = false;
  state.dialogue = mission.doneLines.slice();
  state.dialogueIndex = 0;
  state.index += 1;
  state.step = 0;
  state.timer = 0;
  return 'done';
}

/** Text of the current objective, for the HUD. */
export function objectiveText(state) {
  const mission = currentMission(state);
  if (!mission) return 'Story complete — Porto Verde is yours. Free roam!';
  if (!state.active) return `${mission.name}: press Enter to start the job`;
  const step = currentStep(state);
  if (!step) return mission.name;
  if (step.kind === 'collect') {
    const left = step.targets.filter((t) => !state.collected.includes(t));
    return `${step.text} (${left.length} left)`;
  }
  if (step.timeLimit) {
    const left = Math.max(0, Math.ceil(step.timeLimit - state.timer));
    return `${step.text} — ${left}s`;
  }
  return step.text;
}
