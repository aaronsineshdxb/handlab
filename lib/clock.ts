/**
 * Fixed-timestep simulation clock (blueprint §1.3).
 * Decouples physics / chemistry kinetics (dt = 1/60s) from the
 * variable display frame rate. Sprint 1 wires this to Rapier stepping.
 */
export const FIXED_DT = 1 / 60;

export interface ClockState {
  playing: boolean;
  speed: number; // 1 | 0.25 | 0
  accumulator: number;
  simTime: number;
  stepsTaken: number;
}

export function createClock(): ClockState {
  return { playing: false, speed: 1, accumulator: 0, simTime: 0, stepsTaken: 0 };
}

/** Advance the accumulator by frameDt seconds; returns # of fixed steps due. */
export function advanceClock(state: ClockState, frameDt: number): number {
  if (!state.playing || state.speed === 0) return 0;
  const clamped = Math.min(Math.max(frameDt, 0), 0.1);
  state.accumulator += clamped * state.speed;
  let steps = 0;
  while (state.accumulator >= FIXED_DT && steps < 5) {
    state.accumulator -= FIXED_DT;
    state.simTime += FIXED_DT;
    state.stepsTaken += 1;
    steps += 1;
  }
  return steps;
}

/** Single 16.67ms impulse while paused. */
export function stepOnce(state: ClockState): void {
  state.simTime += FIXED_DT;
  state.stepsTaken += 1;
}

export function resetClock(state: ClockState): void {
  state.accumulator = 0;
  state.simTime = 0;
  state.stepsTaken = 0;
}
