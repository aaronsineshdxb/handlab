import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Progress } from "./types";
import { loadProgress, saveStep } from "./store";

class MemoryStorage implements Storage {
  failGet = false;
  failSet = false;
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    if (this.failGet) throw new DOMException("Read failed");
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new DOMException("Write failed");
    this.values.set(key, value);
  }
}

const storageKey = "handlab.progress.v1";
const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  "localStorage",
);
let storage: MemoryStorage;

function restoreLocalStorage(): void {
  if (originalLocalStorage) {
    Object.defineProperty(globalThis, "localStorage", originalLocalStorage);
  } else {
    Reflect.deleteProperty(globalThis, "localStorage");
  }
}

function progress(lessonId: string, stepIdx: number): Progress {
  return {
    lessonId,
    stepIdx,
    done: stepIdx > 0,
    score: stepIdx * 10,
    updatedAt: 100 + stepIdx,
  };
}

beforeEach(() => {
  storage = new MemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: storage,
    writable: true,
  });
});

afterEach(restoreLocalStorage);

describe("lesson progress storage", () => {
  it("saves and loads progress using the progress key", () => {
    const step = progress("shapes-101", 1);

    saveStep(step);

    expect(loadProgress()).toEqual({ [step.lessonId]: step });
    expect(storage.getItem("handlab.scene.v1")).toBeNull();
    expect(JSON.parse(storage.getItem(storageKey) ?? "")[step.lessonId].stepIdx).toBe(1);
  });

  it("merges progress by lesson without dropping other lessons", () => {
    const shapes = progress("shapes-101", 0);
    const measure = progress("measure-lines", 0);
    const updatedShapes = progress("shapes-101", 2);
    storage.setItem(
      storageKey,
      JSON.stringify({
        [shapes.lessonId]: shapes,
        [measure.lessonId]: measure,
      }),
    );

    saveStep(updatedShapes);

    expect(loadProgress()).toEqual({
      [shapes.lessonId]: updatedShapes,
      [measure.lessonId]: measure,
    });
  });

  it("returns an empty object for corrupt JSON", () => {
    storage.setItem(storageKey, "not-json");

    expect(loadProgress()).toEqual({});
  });

  it("rejects non-record progress payloads", () => {
    storage.setItem(storageKey, "null");
    expect(loadProgress()).toEqual({});

    storage.setItem(storageKey, "[]");
    expect(loadProgress()).toEqual({});

    storage.setItem(storageKey, JSON.stringify({ lesson: { stepIdx: 1 } }));
    expect(loadProgress()).toEqual({});
  });

  it("returns an empty object when progress is missing", () => {
    expect(loadProgress()).toEqual({});
  });

  it("returns an empty object when reading localStorage throws", () => {
    storage.failGet = true;

    expect(loadProgress()).toEqual({});
  });

  it("does not throw when saving to localStorage fails", () => {
    storage.failSet = true;

    expect(() => saveStep(progress("shapes-101", 1))).not.toThrow();
  });
});
