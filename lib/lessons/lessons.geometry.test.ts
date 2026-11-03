import { describe, expect, it } from "vitest";
import { LESSONS } from "./lessons.geometry";

describe("LESSONS", () => {
  it("contains the geometry seed lessons and their checks", () => {
    expect(LESSONS.map((lesson) => lesson.id)).toEqual([
      "shapes-101",
      "measure-lines",
      "volume-adv",
      "angles-adv",
      "estimate-1",
    ]);
    expect(LESSONS[0].steps[0].checks).toEqual([
      { kind: "place-count", shape: "cube", count: 3 },
    ]);
    expect(LESSONS[1].steps[0].checks).toEqual([
      { kind: "chain-closed", minPoints: 3 },
    ]);
    expect(LESSONS[2].steps[0].checks).toEqual([
      {
        kind: "quiz",
        question: "Volume scale?",
        options: ["2x", "4x", "8x"],
        answer: 2,
      },
    ]);
  });

  it("angles lesson authoring matches its checks", () => {
    const angles = LESSONS.find(({ id }) => id === "angles-adv");
    expect(angles).toBeDefined();
    const step = angles!.steps.find(({ id }) => id === "right");
    expect(step!.checks).toEqual([{ kind: "angle-at", min: 88, max: 92 }]);
  });

  it("estimate-then-verify lesson stores the numeric reveal", () => {
    const lesson = LESSONS.find(({ id }) => id === "estimate-1");
    expect(lesson!.steps.some(({ checks }) =>
      checks.some((check) => check.kind === "numeric"),
    )).toBe(true);
  });
});
