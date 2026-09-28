import { describe, expect, it } from "vitest";
import { advanceClock, createClock, FIXED_DT, resetClock, stepOnce } from "./clock";

describe("simulation clock", () => {
  it("stays still while paused", () => {
    const c = createClock();
    expect(advanceClock(c, 0.5)).toBe(0);
    expect(c.simTime).toBe(0);
  });

  it("accumulates fixed steps at 1x", () => {
    const c = createClock();
    c.playing = true;
    const steps = advanceClock(c, FIXED_DT * 3);
    expect(steps).toBe(3);
    expect(c.stepsTaken).toBe(3);
    expect(c.simTime).toBeCloseTo(FIXED_DT * 3);
  });

  it("slow motion scales accumulation", () => {
    const c = createClock();
    c.playing = true;
    c.speed = 0.25;
    const steps = advanceClock(c, FIXED_DT * 4);
    expect(steps).toBe(1);
  });

  it("stepOnce advances a single tick", () => {
    const c = createClock();
    stepOnce(c);
    expect(c.stepsTaken).toBe(1);
    expect(c.simTime).toBeCloseTo(FIXED_DT);
  });

  it("reset clears time", () => {
    const c = createClock();
    c.playing = true;
    advanceClock(c, FIXED_DT * 2);
    resetClock(c);
    expect(c.simTime).toBe(0);
    expect(c.stepsTaken).toBe(0);
  });
});
