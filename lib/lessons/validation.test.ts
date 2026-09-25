import { describe, expect, it } from "vitest";
import type { Lesson } from "./types";
import {
  addImportedLesson,
  isLesson,
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
