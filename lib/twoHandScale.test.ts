import { describe, expect, it } from "vitest";
import {
  FACTOR_MAX,
  FACTOR_MIN,
  clampedUniformScale,
  interHandDist,
  nextPinchState,
  pinchMid,
  pinchRatio,
  scaleFactorForDist,
} from "./twoHandScale";

describe("two-hand pinch scale", () => {
  it("pinchRatio normalizes thumb-index distance by palm size", () => {
    const r = pinchRatio({ x: 0, y: 0 }, { x: 0.03, y: 0 }, 0.15);
    expect(r).toBeCloseTo(0.2, 5);
  });

  it("nextPinchState latches with hysteresis + far gate", () => {
    expect(nextPinchState(false, 0.2, 0.15)).toBe(true);
    expect(nextPinchState(false, 0.4, 0.15)).toBe(false);
    expect(nextPinchState(false, 0.1, 0.01)).toBe(false); // too far
    expect(nextPinchState(true, 0.35, 0.15)).toBe(true); // hysteresis band
    expect(nextPinchState(true, 0.5, 0.15)).toBe(false);
    expect(nextPinchState(true, 0.2, 0.01)).toBe(false); // lost far gate
  });

  it("pinchMid averages thumb and index", () => {
    expect(pinchMid({ x: 0, y: 0 }, { x: 0.2, y: 0.4 })).toEqual({
      x: 0.1,
      y: 0.2,
    });
  });

  it("interHandDist is the screen-space spread", () => {
    expect(interHandDist({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(
      0.5,
      5,
    );
  });

  it("scaleFactorForDist spreads to enlarge, closes to shrink", () => {
    expect(scaleFactorForDist(0.4, 0.2)).toBeCloseTo(2, 5);
    expect(scaleFactorForDist(0.1, 0.2)).toBeCloseTo(0.5, 5);
    expect(scaleFactorForDist(0.2, 0.2)).toBeCloseTo(1, 5);
  });

  it("scaleFactorForDist clamps runaway gestures + degenerate baselines", () => {
    expect(scaleFactorForDist(10, 0.2)).toBe(FACTOR_MAX);
    expect(scaleFactorForDist(0.001, 0.2)).toBe(FACTOR_MIN);
    expect(scaleFactorForDist(0.3, 0)).toBe(1);
    expect(scaleFactorForDist(0.3, 0.001)).toBe(1);
    expect(scaleFactorForDist(NaN, 0.2)).toBe(1);
  });

  it("clampedUniformScale keeps aspect and clamps per axis", () => {
    expect(clampedUniformScale([1, 1, 1], 2)).toEqual([2, 2, 2]);
    expect(clampedUniformScale([1, 2, 0.5], 0.5)).toEqual([0.5, 1, 0.25]);
    expect(clampedUniformScale([1, 1, 1], 100)).toEqual([4, 4, 4]);
    expect(clampedUniformScale([1, 1, 1], 0.01)).toEqual([0.2, 0.2, 0.2]);
    expect(clampedUniformScale([1, 1, 1], NaN)).toEqual([1, 1, 1]);
  });
});
