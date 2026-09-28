import { describe, expect, it } from "vitest";
import { PHYSICS_LESSONS } from "./lessons.physics";
import { CHEMISTRY_LESSONS } from "./lessons.chemistry";
import { isLesson } from "./validation";

describe("domain lesson catalogs", () => {
  it("physics lessons validate with domain=physics", () => {
    expect(PHYSICS_LESSONS.length).toBeGreaterThan(0);
    for (const lesson of PHYSICS_LESSONS) {
      expect(lesson.domain).toBe("physics");
      expect(isLesson(lesson)).toBe(true);
    }
  });

  it("chemistry lessons validate with domain=chemistry", () => {
    expect(CHEMISTRY_LESSONS.length).toBeGreaterThan(0);
    for (const lesson of CHEMISTRY_LESSONS) {
      expect(lesson.domain).toBe("chemistry");
      expect(isLesson(lesson)).toBe(true);
    }
  });

  it("lesson ids are unique across domains", () => {
    const ids = [...PHYSICS_LESSONS, ...CHEMISTRY_LESSONS].map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
