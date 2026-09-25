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

  it("evaluates only the first chain", () => {
    const check = { kind: "chain-closed", minPoints: 3 } as const;
    const firstChain = [
      [0, 0, 0],
      [1, 0, 0],
      [0.5, 0, 0],
    ];
    const laterChain = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 0, 0],
    ];

    expect(
      evalCheck(check, snap({ chains: [firstChain, laterChain] })),
    ).toBe(false);
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
