import { describe, expect, it } from "vitest";
import { evalCheck, type SceneSnap } from "./checks";
import type { CheckKind } from "./types";

function snap(overrides: Partial<SceneSnap> = {}): SceneSnap {
  return {
    objects: [],
    chains: [],
    quizAnswers: {},
    ...overrides,
  };
}

describe("evalCheck", () => {
  it("passes place-count when enough matching objects are present", () => {
    const check = { kind: "place-count", shape: "cube", count: 2 } as const;

    expect(
      evalCheck(
        check,
        snap({ objects: [{ s: "sphere" }, { s: "cube" }, { s: "cube" }] }),
      ),
    ).toBe(true);
  });

  it("fails place-count when too few matching objects are present", () => {
    const check = { kind: "place-count", shape: "cube", count: 2 } as const;

    expect(evalCheck(check, snap({ objects: [{ s: "cube" }] }))).toBe(false);
  });

  it("passes when any chain closes, not only the first", () => {
    const check = { kind: "chain-closed", minPoints: 3 } as const;
    const openChain = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, 0, 0],
    ];
    const closedChain = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];

    expect(
      evalCheck(check, snap({ chains: [openChain, closedChain] })),
    ).toBe(true);
  });

  it("fails when no chain is closed", () => {
    const check = { kind: "chain-closed", minPoints: 3 } as const;
    const openChain = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, 0, 0],
    ];

    expect(evalCheck(check, snap({ chains: [openChain] }))).toBe(false);
  });

  it("fails a chain at the exact closure distance threshold", () => {
    const check = { kind: "chain-closed", minPoints: 3 } as const;
    const chain = [
      [0, 0, 0],
      [1, 0, 0],
      [0.35, 0, 0],
    ];

    expect(evalCheck(check, snap({ chains: [chain] }))).toBe(false);
  });

  it("passes a chain closed within the closure distance threshold", () => {
    const check = { kind: "chain-closed", minPoints: 3 } as const;
    const chain = [
      [0, 0, 0],
      [1, 0, 0],
      [0.21, 0.27, 0],
    ];

    expect(evalCheck(check, snap({ chains: [chain] }))).toBe(true);
  });

  it("fails area-gt under the current default behavior", () => {
    const check = { kind: "area-gt", min: 1 } as const;

    expect(evalCheck(check, snap())).toBe(false);
  });

  it("passes quiz when the answer matches", () => {
    const check = {
      kind: "quiz",
      question: "Volume scale?",
      options: ["2x", "4x", "8x"],
      answer: 2,
    } satisfies CheckKind;

    expect(evalCheck(check, snap({ quizAnswers: { "Volume scale?": 2 } }))).toBe(true);
  });

  it("fails quiz when the answer does not match", () => {
    const check = {
      kind: "quiz",
      question: "Volume scale?",
      options: ["2x", "4x", "8x"],
      answer: 2,
    } satisfies CheckKind;

    expect(evalCheck(check, snap({ quizAnswers: { "Volume scale?": 1 } }))).toBe(false);
  });
});

describe("angle-at", () => {
  it("passes when any chain has an interior angle within [min,max] (degrees)", () => {
    const check = { kind: "angle-at", min: 89, max: 91 } as const;
    const rightTriangle: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: rightTriangle }))).toBe(true);
  });

  it("fails outside the range", () => {
    const check = { kind: "angle-at", min: 120, max: 130 } as const;
    const chain: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: chain }))).toBe(false);
  });

  it("also looks at closed-loop wrap-around vertices", () => {
    const check = { kind: "angle-at", min: 89, max: 91 } as const;
    const square: number[][][] = [
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: square }))).toBe(true);
  });
});

describe("length-range", () => {
  it("passes when an open chain's total length is within [min,max] inclusive", () => {
    const check = { kind: "length-range", min: 7, max: 9 } as const; // 3+5=8
    const chain: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: chain }))).toBe(true);
  });

  it("closed chains use the perimeter (incl. wrap-around)", () => {
    const check = { kind: "length-range", min: 11.9, max: 12.1 } as const; // 3+5+4=12
    const closed: number[][][] = [
      [
        [0, 0, 0],
        [3, 0, 0],
        [3, 4, 0],
        [0, 0, 0],
      ],
    ];
    expect(evalCheck(check, snap({ chains: closed }))).toBe(true);
  });

  it("fails when no chain fits", () => {
    const check = { kind: "length-range", min: 50, max: 60 } as const;
    expect(evalCheck(check, snap({ chains: [] }))).toBe(false);
  });
});

describe("numeric", () => {
  const check = { kind: "numeric", question: "Volume in m³?", answer: 12, tolerance: 0.5 } as const;

  it("passes within tolerance inclusive", () => {
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": 12.5 } }))).toBe(true);
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": 11.5 } }))).toBe(true);
  });
  it("fails outside tolerance, or with no/invalid answer", () => {
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": 12.51 } }))).toBe(false);
    expect(evalCheck(check, snap({}))).toBe(false);
    expect(evalCheck(check, snap({ quizAnswers: { "Volume in m³?": Number.NaN } }))).toBe(false);
  });
});
