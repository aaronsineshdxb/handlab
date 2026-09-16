import { describe, expect, it } from "vitest";
import {
  MONO_GAIN,
  clampDepth,
  frameStats,
  freshness,
  fuseDepth,
  tipZ,
} from "./fusion";

describe("frameStats", () => {
  it("reads the bilinear tip value and frame median/std", () => {
    // 4x4 gradient map: values 0..15
    const data = Float32Array.from({ length: 16 }, (_, i) => i);
    const s = frameStats(data, 4, 4, 0, 0);
    expect(s.tip).toBeCloseTo(0, 6);
    expect(s.median).toBe(8);
    expect(s.std).toBeGreaterThan(0);
  });

  it("samples the center of a flat-near-hand map", () => {
    const data = new Float32Array(16 * 16).fill(10);
    data[8 * 16 + 8] = 50; // near fingertip pixel
    const s = frameStats(data, 16, 16, 8 / 16, 8 / 16);
    expect(s.tip).toBeCloseTo(50, 6);
    expect(s.median).toBe(10);
  });
});

describe("tipZ", () => {
  it("is positive when the tip is nearer (bigger) than the background", () => {
    expect(tipZ(50, 10, 5)).toBeCloseTo(8, 4);
  });
});

describe("fuseDepth", () => {
  const palm = 2;
  it("passes palm through when mono is missing", () => {
    expect(fuseDepth(palm, null)).toBe(palm);
  });
  it("ignores low-confidence mono samples", () => {
    expect(
      fuseDepth(palm, { dzMeters: 100, confidence: 0.1, source: "monocular" }),
    ).toBe(palm);
  });
  it("blends 70/30 by default", () => {
    const out = fuseDepth(
      palm,
      { dzMeters: 6, confidence: 1, source: "monocular" },
      0.3,
    );
    expect(out).toBeCloseTo(palm * 0.7 + 6 * 0.3, 6);
  });
  it("clamps wild mono values before blending", () => {
    const out = fuseDepth(
      0,
      { dzMeters: 1e6, confidence: 1, source: "monocular" },
      0.3,
    );
    expect(Math.abs(out)).toBeLessThanOrEqual(Math.abs(clampDepth(1e6)) * 0.3 + 1e-9);
  });
});

describe("freshness", () => {
  it("is 1 when fresh, 0 when stale", () => {
    expect(freshness(1000, 500)).toBe(1);
    expect(freshness(10000, 1000)).toBe(0);
  });
});

describe("gain sanity", () => {
  it("a typical push maps to palm-scale cursor units", () => {
    // fingertip z-score rising by ~1.5 on a push toward the camera
    const dz = 1.5 * MONO_GAIN;
    expect(dz).toBeGreaterThan(1);
    expect(dz).toBeLessThan(9);
  });
});
