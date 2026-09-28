import { describe, expect, it } from "vitest";
import { CHEMISTRY_EXPERIMENTS } from "./chemistry";
import { PHYSICS_EXPERIMENTS } from "./physics";
import { experimentToLesson } from "./toLessons";
import { isLesson } from "../lessons/validation";

const ALL = [...PHYSICS_EXPERIMENTS, ...CHEMISTRY_EXPERIMENTS];

describe("experiment catalogs", () => {
  it("ids are unique across domains", () => {
    const ids = ALL.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every experiment has aim, procedure, result and at least one quiz", () => {
    for (const exp of ALL) {
      expect(exp.aim.length, exp.id).toBeGreaterThan(0);
      expect(exp.procedure.length, exp.id).toBeGreaterThan(0);
      expect(exp.result.length, exp.id).toBeGreaterThan(0);
      expect(exp.quiz.length, exp.id).toBeGreaterThan(0);
      for (const q of exp.quiz) {
        expect(q.options.length, `${exp.id}: ${q.question}`).toBeGreaterThanOrEqual(2);
        expect(q.answer, `${exp.id}: ${q.question}`).toBeLessThan(q.options.length);
      }
    }
  });

  it("expected counts: 14 physics, 9 chemistry", () => {
    expect(PHYSICS_EXPERIMENTS).toHaveLength(14);
    expect(CHEMISTRY_EXPERIMENTS).toHaveLength(9);
  });

  it("every experiment converts to a valid lesson", () => {
    for (const exp of ALL) {
      const lesson = experimentToLesson(exp);
      expect(isLesson(lesson), exp.id).toBe(true);
      expect(lesson.id).toBe(exp.id);
      expect(lesson.domain).toBe(exp.domain);
    }
  });
});
