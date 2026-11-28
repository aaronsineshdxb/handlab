import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Lesson } from "./types";
import {
  ensureRolls,
  instantiateLesson,
  rerollLesson,
  resolveNum,
  rollVars,
  usedVarNames,
} from "./vars";

const template: Lesson = {
  id: "vol-template",
  title: "Volume with height {{h}}",
  level: "advanced",
  vars: {
    h: { min: 3, max: 5, step: 1, decimals: 1 },
    tol: { min: 0.05, max: 0.15, decimals: 2 },
  },
  objectives: ["Compute volume for height {{h}}"],
  steps: [
    {
      id: "v1",
      title: "Set the height",
      prompt: "Place a prism with height {{h}} m.",
      level: "advanced",
      hint: "The height is {{h}} m — check the math panel slider.",
      checks: [
        { kind: "place-count", shape: "prism", count: "{{h}}" },
        {
          kind: "numeric",
          question: "Volume of a {{h}} m cube?",
          answer: "{{h}}",
          tolerance: "{{tol}}",
        },
      ],
    },
  ],
};

describe("rollVars", () => {
  it("stays inside [min,max] and respects step + decimals", () => {
    const rolls = rollVars(
      { a: { min: 2, max: 4, step: 0.5, decimals: 2 } },
      () => 0.999,
    );
    expect(rolls.a).toBe(4); // clamped quantized max

    const low = rollVars({ a: { min: 2, max: 4, step: 0.5 } }, () => 0);
    expect(low.a).toBe(2);

    const cont = rollVars({ a: { min: 0, max: 1, decimals: 2 } }, () => 0.123456);
    expect(cont.a).toBe(0.12);
  });

  it("produces different values across rolls", () => {
    const rolls1 = rollVars({ a: { min: 0, max: 100 } }, () => 0.1);
    const rolls2 = rollVars({ a: { min: 0, max: 100 } }, () => 0.9);
    expect(rolls1.a).not.toBe(rolls2.a);
  });
});

describe("resolveNum", () => {
  it("passes numbers through and resolves template refs", () => {
    expect(resolveNum(2.5, {})).toBe(2.5);
    expect(resolveNum("{{h}}", { h: 4 })).toBe(4);
    expect(resolveNum("{{nope}}", { h: 4 })).toBeNaN();
    expect(resolveNum("~{{h}}", { h: 4 })).toBeNaN(); // not an exact ref
  });
});

describe("instantiateLesson", () => {
  const rolls = { h: 4, tol: 0.1 };

  it("substitutes prose fields as text", () => {
    const inst = instantiateLesson(template, rolls);
    expect(inst.title).toBe("Volume with height 4");
    expect(inst.objectives[0]).toBe("Compute volume for height 4");
    expect(inst.steps[0]!.prompt).toBe("Place a prism with height 4 m.");
    expect(inst.steps[0]!.hint).toBe("The height is 4 m — check the math panel slider.");
  });

  it("resolves numeric check fields as numbers", () => {
    const inst = instantiateLesson(template, rolls);
    expect(inst.steps[0]!.checks[0]).toEqual({ kind: "place-count", shape: "prism", count: 4 });
    const numeric = inst.steps[0]!.checks[1]!;
    expect(numeric).toMatchObject({
      kind: "numeric",
      question: "Volume of a 4 m cube?",
      answer: 4,
      tolerance: 0.1,
    });
  });

  it("never mutates the template", () => {
    const before = structuredClone(template);
    instantiateLesson(template, rolls);
    expect(template).toEqual(before);
  });

  it("drops unresolved references in prose but NaN-fails unresolved check numbers", () => {
    const inst = instantiateLesson(template, { h: 3 }); // tol missing
    expect(inst.steps[0]!.prompt).toBe("Place a prism with height 3 m.");
    const numeric = inst.steps[0]!.checks[1] as { tolerance: number };
    expect(Number.isNaN(numeric.tolerance)).toBe(true);
  });
});

describe("usedVarNames", () => {
  it("collects references from prose and numeric fields", () => {
    expect(usedVarNames(template)).toEqual(new Set(["h", "tol"]));
  });

  it("returns an empty set for plain lessons", () => {
    expect(usedVarNames({ ...template, vars: undefined, title: "Plain", objectives: [], steps: [{ ...template.steps[0]!, title: "s", prompt: "p", hint: undefined, checks: [] }] })).toEqual(new Set());
  });
});

describe("roll persistence", () => {
  const originalLocalStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
      },
      writable: true,
    });
  });

  afterEach(() => {
    if (originalLocalStorage) {
      Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
    } else {
      Reflect.deleteProperty(globalThis, "localStorage");
    }
  });

  it("persists rolls per lesson id and re-rolls on demand", () => {
    const first = ensureRolls(template);
    expect(Object.keys(first).sort()).toEqual(["h", "tol"]);
    expect(ensureRolls(template)).toEqual(first); // stable across calls

    const fresh = rerollLesson(template);
    expect(ensureRolls(template)).toEqual(fresh); // re-roll sticks
  });

  it("returns empty rolls for lessons without vars", () => {
    const plain: Lesson = { ...template, vars: undefined };
    expect(ensureRolls(plain)).toEqual({});
    expect(rerollLesson(plain)).toEqual({});
  });
});
