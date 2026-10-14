import { describe, expect, it } from "vitest";
import { metricsFor, spawnScaleFor } from "./math";

describe("geometry math engine", () => {
  it("cube: V=s^3, A=6s^2, euler=2", () => {
    const m = metricsFor("cube", { a: 3 });
    expect(m.volume).toBeCloseTo(27, 6);
    expect(m.area).toBeCloseTo(54, 6);
    expect(m.euler).toBe(2);
  });
  it("cylinder substitution", () => {
    const m = metricsFor("cylinder", { r: 3, h: 8 });
    expect(m.volume).toBeCloseTo(Math.PI * 9 * 8, 6);
    expect(m.volumeSub).toContain("226.19");
  });
  it("cone is 1/3 of cylinder", () => {
    const c = metricsFor("cone", { r: 2, h: 6 });
    const cyl = metricsFor("cylinder", { r: 2, h: 6 });
    expect(c.volume).toBeCloseTo(cyl.volume / 3, 6);
  });
  it("pyramid euler = 2", () => {
    expect(metricsFor("pyramid", { a: 4, h: 5 }).euler).toBe(2);
  });
  it("torus uses Pappus centroid theorem", () => {
    const m = metricsFor("torus", { R: 4, r: 1 });
    expect(m.volume).toBeCloseTo(2 * Math.PI * Math.PI * 4 * 1, 6);
    expect(m.euler).toBeNull();
  });
  it("sphere formulas", () => {
    const m = metricsFor("sphere", { r: 2 });
    expect(m.volume).toBeCloseTo((4 / 3) * Math.PI * 8, 6);
    expect(m.area).toBeCloseTo(16 * Math.PI, 6);
  });
  it("tetra/octa euler = 2", () => {
    const t = metricsFor("tetra", { a: 3 });
    expect(t.volume).toBeCloseTo(27 / (6 * Math.sqrt(2)), 6);
    expect(t.area).toBeCloseTo(Math.sqrt(3) * 9, 6);
    expect(t.euler).toBe(2);
    const o = metricsFor("octa", { a: 3 });
    expect(o.volume).toBeCloseTo((Math.sqrt(2) / 3) * 27, 6);
    expect(o.euler).toBe(2);
  });
  it("spawn scale is 1 at defaults", () => {
    expect(spawnScaleFor("cylinder", { r: 2, h: 5 })).toEqual([1, 1, 1]);
    expect(spawnScaleFor("cube", { a: 6 })).toEqual([2, 2, 2]);
  });
});
