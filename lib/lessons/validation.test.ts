import { describe, expect, it } from "vitest";
import type { SceneData } from "../engine";
import type { Lesson } from "./types";
import {
  addImportedLesson,
  isLesson,
  isLessonCheck,
  MAX_CHECKS,
  MAX_OBJECTIVES,
  MAX_QUIZ_OPTIONS,
  MAX_STEPS,
} from "./validation";

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

function mutate(change: (draft: Lesson) => void): unknown {
  const draft = structuredClone(lesson);
  change(draft);
  return draft;
}

describe("lesson import validation", () => {
  it("accepts the required lesson contract and seed-shaped checks", () => {
    expect(isLesson(lesson)).toBe(true);
    expect(
      isLesson(
        mutate((draft) => {
          draft.steps[0].checks = [{ kind: "quiz", question: "2 + 2?", options: ["3", "4"], answer: 1 }];
        }),
      ),
    ).toBe(true);
  });

  it.each(["", "   "])("rejects blank lesson id %j", (id) => {
    expect(isLesson(mutate((draft) => void (draft.id = id)))).toBe(false);
  });

  it.each(["", "   "])("rejects blank lesson title %j", (title) => {
    expect(isLesson(mutate((draft) => void (draft.title = title)))).toBe(false);
  });

  it("rejects empty and duplicate-id step lists", () => {
    expect(isLesson(mutate((draft) => void (draft.steps = [])))).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          draft.steps.push(structuredClone(draft.steps[0]));
        }),
      ),
    ).toBe(false);
  });

  it.each(["id", "title", "prompt"] as const)("rejects blank or malformed step %s", (field) => {
    expect(isLesson(mutate((draft) => void (draft.steps[0][field] = "")))).toBe(false);
    expect(isLesson(mutate((draft) => void (draft.steps[0][field] = "  ")))).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          (draft.steps[0] as unknown as Record<string, unknown>)[field] = 42;
        }),
      ),
    ).toBe(false);
  });

  it("rejects malformed checks and quiz content", () => {
    expect(isLesson(mutate((draft) => void (draft.steps[0].checks = {} as never)))).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          draft.steps[0].checks = [{ kind: "quiz", question: " ", options: ["4", " "], answer: 0 }];
        }),
      ),
    ).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          draft.steps[0].checks = [{ kind: "quiz", question: "Faces?", options: ["4"], answer: 1 }];
        }),
      ),
    ).toBe(false);
  });

  it("bounds objectives, steps, checks, and quiz options", () => {
    expect(
      isLesson(
        mutate((draft) => {
          draft.objectives = Array.from({ length: MAX_OBJECTIVES + 1 }, (_, index) => `Objective ${index}`);
        }),
      ),
    ).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          const step = draft.steps[0];
          draft.steps = Array.from({ length: MAX_STEPS + 1 }, (_, index) => ({
            ...structuredClone(step),
            id: `step-${index}`,
          }));
        }),
      ),
    ).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          const check = draft.steps[0].checks[0];
          draft.steps[0].checks = Array.from({ length: MAX_CHECKS + 1 }, () => structuredClone(check));
        }),
      ),
    ).toBe(false);
    expect(
      isLesson(
        mutate((draft) => {
          draft.steps[0].checks = [
            {
              kind: "quiz",
              question: "Choose",
              options: Array.from({ length: MAX_QUIZ_OPTIONS + 1 }, (_, index) => String(index)),
              answer: 0,
            },
          ];
        }),
      ),
    ).toBe(false);
  });

  it("returns the current lessons unchanged for invalid or duplicate imports", () => {
    const current = [lesson];
    const invalid = mutate((draft) => void (draft.id = " "));
    const duplicate = structuredClone(lesson);

    expect(addImportedLesson(current, invalid)).toBe(current);
    expect(addImportedLesson(current, duplicate)).toBe(current);
  });

  it("appends a valid non-duplicate lesson", () => {
    const imported = mutate((draft) => void (draft.id = "another-lesson")) as Lesson;
    const current = [lesson];

    expect(addImportedLesson(current, imported)).toEqual([lesson, imported]);
  });
});

describe("angle-at + length-range checks", () => {
  it("accepts valid angle-at", () => {
    expect(isLessonCheck({ kind: "angle-at", min: 30, max: 90 })).toBe(true);
  });
  it("rejects angle-at with min > max or out-of-range degrees", () => {
    expect(isLessonCheck({ kind: "angle-at", min: 90, max: 30 })).toBe(false);
    expect(isLessonCheck({ kind: "angle-at", min: -10, max: 30 })).toBe(false);
    expect(isLessonCheck({ kind: "angle-at", min: 30, max: 190 })).toBe(false);
  });
  it("accepts valid length-range and rejects min > max / negative", () => {
    expect(isLessonCheck({ kind: "length-range", min: 1, max: 2 })).toBe(true);
    expect(isLessonCheck({ kind: "length-range", min: 2, max: 1 })).toBe(false);
    expect(isLessonCheck({ kind: "length-range", min: -1, max: 2 })).toBe(false);
  });
});

describe("numeric checks", () => {
  it("accepts a finite answer + non-negative tolerance", () => {
    expect(isLessonCheck({ kind: "numeric", question: "v?", answer: 5, tolerance: 0 })).toBe(true);
  });
  it("rejects negative tolerance or non-finite answer", () => {
    expect(isLessonCheck({ kind: "numeric", question: "v?", answer: 5, tolerance: -1 })).toBe(false);
    expect(isLessonCheck({ kind: "numeric", question: "v?", answer: Number.NaN, tolerance: 1 })).toBe(false);
    expect(isLessonCheck({ kind: "numeric", question: "", answer: 5, tolerance: 1 })).toBe(false);
  });
});

describe("lesson template vars", () => {
  const varLesson = mutate((draft) => {
    draft.vars = { h: { min: 3, max: 5, step: 1 }, tol: { min: 0.05, max: 0.2, decimals: 2 } };
    draft.steps[0]!.prompt = "Build a prism {{h}} m tall.";
    draft.steps[0]!.checks = [
      { kind: "place-count", shape: "prism", count: "{{h}}" },
      { kind: "numeric", question: "Volume?", answer: "{{h}}", tolerance: "{{tol}}" },
    ];
  });

  it("accepts vars with template references that resolve", () => {
    expect(isLesson(varLesson)).toBe(true);
    expect(isLessonCheck({ kind: "area-gt", min: "{{h}}" }, new Set(["h"]))).toBe(true);
  });

  it("rejects references to undefined vars and malformed specs", () => {
    const dangling = mutate((draft) => {
      draft.steps[0]!.prompt = "Build a prism {{missing}} m tall.";
    });
    expect(isLesson(dangling)).toBe(false);

    // NaN min fails isFiniteNumber, standing in for a missing field while
    // keeping the draft type-correct.
    const badSpec = mutate((draft) => {
      draft.vars = { h: { min: NaN, max: 5 } };
    });
    expect(isLesson(badSpec)).toBe(false);

    const inverted = mutate((draft) => {
      draft.vars = { h: { min: 5, max: 3 } };
    });
    expect(isLesson(inverted)).toBe(false);

    expect(isLessonCheck({ kind: "area-gt", min: "{{nope}}" }, new Set(["h"]))).toBe(false);
    expect(isLessonCheck({ kind: "area-gt", min: "~{{h}}" }, new Set(["h"]))).toBe(false);
  });
});

describe("solution scene ghosts", () => {
  const scene: SceneData = {
    version: 1,
    objects: [{ s: "cube", c: "#0D9488", p: [0, 0, 0], r: [0, 0, 0], k: [1, 1, 1] }],
    chains: [[[0, 0, 0], [1, 0, 0], [1, 1, 0]]],
  };

  it("accepts a well-formed solution scene on a step", () => {
    const withSolution = mutate((draft) => {
      draft.steps[0]!.solution = scene;
    });
    expect(isLesson(withSolution)).toBe(true);
  });

  it("rejects malformed solution scenes", () => {
    const badVersion = mutate((draft) => {
      draft.steps[0]!.solution = { ...scene, version: 2 } as unknown as SceneData;
    });
    expect(isLesson(badVersion)).toBe(false);

    const badCoord = mutate((draft) => {
      draft.steps[0]!.solution = {
        version: 1,
        objects: [{ s: "cube", c: "#0D9488", p: [1e300, 0, 0], r: [0, 0, 0] }],
        chains: [],
      };
    });
    expect(isLesson(badCoord)).toBe(false);
  });
});
