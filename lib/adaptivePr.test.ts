import { describe, expect, it } from "vitest";
import { PR_FLOOR, PR_MAX_CAP, PR_STEP, nextPixelRatio } from "./adaptivePr";

describe("adaptivePr constants", () => {
  it("uses 0.25 steps, a 0.75 floor and a 2x cap", () => {
    expect(PR_STEP).toBe(0.25);
    expect(PR_FLOOR).toBe(0.75);
    expect(PR_MAX_CAP).toBe(2);
  });
});

describe("nextPixelRatio", () => {
  it("steps down when frame time is above the slow threshold", () => {
    // 30ms ≈ 33fps. The comparison is strictly `>`, matching the existing
    // engine behaviour, so exactly the threshold value holds steady.
    expect(nextPixelRatio(1, 30)).toBe(0.75);
  });

  it("holds steady at exactly the slow threshold", () => {
    expect(nextPixelRatio(1, 26)).toBe(1);
  });

  it("never goes below the floor", () => {
    expect(nextPixelRatio(0.75, 40)).toBe(PR_FLOOR);
    expect(nextPixelRatio(0.75, 200)).toBe(PR_FLOOR);
  });

  it("holds steady inside the target band", () => {
    expect(nextPixelRatio(1, 18)).toBe(1);
    expect(nextPixelRatio(1.5, 13)).toBe(1.5);
  });

  it("steps up when there is clear headroom", () => {
    expect(nextPixelRatio(1, 10)).toBe(1.25);
  });

  it("never exceeds the device cap", () => {
    expect(nextPixelRatio(2, 10)).toBe(PR_MAX_CAP);
  });

  it("is stable at the floor when slow, and recovers when fast", () => {
    // A device that cannot hold up: sits at the floor rather than oscillating.
    let pr = 1;
    for (let i = 0; i < 20; i++) pr = nextPixelRatio(pr, 40);
    expect(pr).toBe(PR_FLOOR);
    for (let i = 0; i < 20; i++) pr = nextPixelRatio(pr, 8);
    expect(pr).toBe(PR_MAX_CAP);
  });
});
