// lib/geometry/chainMath.test.ts
import { describe, expect, it } from "vitest";
import {
  chainLength,
  dist3,
  interiorAnglesDeg,
  pythagorasOf,
  sumDegrees,
} from "./chainMath";

type P = [number, number, number];

describe("chainMath.dist3", () => {
  it("measures segment distances", () => {
    expect(dist3([0, 0, 0] as P, [3, 4, 0] as P)).toBe(5);
  });
});

describe("chainMath.chainLength", () => {
  const tri: P[] = [
    [0, 0, 0],
    [3, 0, 0],
    [0, 4, 0],
  ];

  it("open chains count segments between consecutive points", () => {
    expect(chainLength(tri, false)).toBeCloseTo(3 + 5);
  });

  it("closed chains add the wrap-around segment (perimeter)", () => {
    expect(chainLength(tri, true)).toBeCloseTo(3 + 5 + 4);
  });
});

describe("chainMath.interiorAnglesDeg", () => {
  it("open chain: one joint angle for 3 points", () => {
    const angles = interiorAnglesDeg(
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ] as P[],
      false,
    );
    expect(angles).toHaveProperty("length", 1);
    expect(angles[0]).toBeCloseTo(90, 5);
  });

  it("closed 3-4 loop: one angle per unique vertex (not duplicate at both ends)", () => {
    const angles = interiorAnglesDeg(
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
        [0, 0, 0],
      ] as P[],
      true,
    );
    // first == last, so the duplicate start is collapsed and each unique
    // vertex gets one angle: the 3-4-5 triangle's 3 corners (90° at [3,0,0]),
    // not 4 entries, and not the same angle duplicated at both ends.
    expect(angles).toHaveProperty("length", 3);
    // The 3-4-5 triangle's interior angles sum to 180°.
    expect(sumDegrees(angles)).toBeCloseTo(180, 5);
  });

  it("closed square loop (loop not repeating last): 4 angles summing 360", () => {
    const square: P[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ];
    const angles = interiorAnglesDeg(square, true);
    expect(angles).toHaveProperty("length", 4);
    expect(sumDegrees(angles)).toBeCloseTo(360, 3);
  });
});

describe("chainMath.sumDegrees", () => {
  it("sums the array", () => {
    expect(sumDegrees([10, 20, 30])).toBe(60);
  });
  it("empty array sums to 0", () => {
    expect(sumDegrees([])).toBe(0);
  });
});

describe("chainMath.pythagorasOf", () => {
  it("gives a right-triangle triple for a 3-point open chain", () => {
    const p = pythagorasOf([
      [0, 0, 0],
      [3, 0, 0],
      [3, 4, 0],
    ] as P[]);
    expect(p).not.toBeNull();
    expect(p!.a).toBeCloseTo(3);
    expect(p!.b).toBeCloseTo(4);
    expect(p!.c).toBeCloseTo(5);
    expect(p!.right).toBe(true);
    expect(p!.residual).toBeCloseTo(0);
  });

  it("marks a non-right chain as not right", () => {
    const p = pythagorasOf([
      [0, 0, 0],
      [3, 0, 0],
      [6, 2, 0],
    ] as P[]);
    expect(p).not.toBeNull();
    expect(p!.right).toBe(false);
  });

  it("returns null unless the chain has exactly 3 points", () => {
    expect(pythagorasOf([[0, 0, 0]] as P[])).toBeNull();
    expect(
      pythagorasOf([
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ] as P[]),
    ).toBeNull();
  });

  it("matches the interior angle at the middle vertex for rightness", () => {
    const pts: P[] = [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ];
    const angle = interiorAnglesDeg(pts, false)[0];
    const p = pythagorasOf(pts);
    expect(p!.right).toBe(Math.abs(angle - 90) <= pythagorasOf.MATCH_TOL_DEG);
  });
});
