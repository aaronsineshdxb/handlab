import { describe, expect, it } from "vitest";
import { LESSONS } from "./lessons.geometry";

describe("LESSONS", () => {
  it("contains the geometry seed lessons and their checks", () => {
    expect(LESSONS.map((lesson) => lesson.id)).toEqual([
      "shapes-101",
      "measure-lines",
      "volume-adv",
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
});
