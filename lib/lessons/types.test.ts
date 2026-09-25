import { describe, expect, it } from "vitest";
import * as lessonTypes from "./types";
import type { Lesson, Progress } from "./types";

const lesson: Lesson = {
  id: "counting-cubes",
  title: "Counting Cubes",
  level: "intro",
  objectives: ["Count placed objects"],
  steps: [
    {
      id: "count-three",
      title: "Count three cubes",
      prompt: "Place three cubes and count them.",
      level: "intro",
      checks: [{ kind: "place-count", shape: "cube", count: 3 }],
    },
  ],
};

const progress: Progress = {
  lessonId: "counting-cubes",
  stepIdx: 0,
  done: false,
  score: 0,
  updatedAt: 123,
};

describe("Lesson", () => {
  it("accepts a minimal lesson", () => {
    expect(lessonTypes).toBeDefined();
    expect(lesson.steps[0].checks[0]).toEqual({
      kind: "place-count",
      shape: "cube",
      count: 3,
    });
    expect(progress.updatedAt).toBe(123);
  });
});
