import { describe, expect, it } from "vitest";
import {
  clampTarget,
  isQuickTap,
  jointDistance,
  latchPinch,
  stickToDepthDZ,
} from "./input";

describe("jointDistance", () => {
  it("measures 3D thumb-index gap", () => {
    expect(
      jointDistance({ x: 0, y: 0, z: 0 }, { x: 0.02, y: 0, z: 0 }),
    ).toBeCloseTo(0.02, 6);
  });
});

describe("latchPinch", () => {
  it("closes below threshold, holds in the gap, opens above", () => {
    expect(latchPinch(0.01, false)).toBe(true);
    expect(latchPinch(0.03, true)).toBe(true); // hysteresis gap
    expect(latchPinch(0.05, true)).toBe(false);
    expect(latchPinch(0.03, false)).toBe(false);
  });
});

describe("isQuickTap", () => {
  it("tap is quick + stationary, hold/drag is not", () => {
    expect(isQuickTap(0, 200, 0.1)).toBe(true);
    expect(isQuickTap(0, 900, 0.1)).toBe(false);
    expect(isQuickTap(0, 200, 2)).toBe(false);
  });
});

describe("clampTarget", () => {
  it("keeps the cursor in the build volume", () => {
    expect(clampTarget([99, -99, 0])).toEqual([4, -2.5, 0]);
  });
});

describe("stickToDepthDZ", () => {
  it("dead-zones small stick drift", () => {
    expect(stickToDepthDZ(0.05)).toBe(0);
    expect(stickToDepthDZ(1)).toBeLessThan(0);
    expect(stickToDepthDZ(-1)).toBeGreaterThan(0);
  });
});
