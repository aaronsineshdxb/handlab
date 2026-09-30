import { describe, expect, it } from "vitest";
import { toCheckSnap, type SceneData } from "./engine";

const scene: SceneData = {
  version: 1,
  objects: [
    { s: "cube", c: "#016a71", p: [1, 2, 3], r: [0, 0, 0] },
    { s: "sphere", c: "#ff0000", p: [4, 5, 6], r: [0, 0, 0] },
    { s: "cube", c: "#00ff00", p: [7, 8, 9], r: [0, 0, 0] },
  ],
  chains: [
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 1, 0],
    ],
  ],
};

describe("toCheckSnap", () => {
  it("keeps only the shape name per object", () => {
    const snap = toCheckSnap(scene);
    expect(snap.objects).toEqual([{ s: "cube" }, { s: "sphere" }, { s: "cube" }]);
  });

  it("keeps chain coordinates so closure and area checks still work", () => {
    const snap = toCheckSnap(scene);
    expect(snap.chains).toEqual([
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
    ]);
  });

  it("carries quiz answers through untouched", () => {
    const snap = toCheckSnap(scene, { q1: 2 });
    expect(snap.quizAnswers).toEqual({ q1: 2 });
  });

  it("returns empty collections for an empty scene", () => {
    const snap = toCheckSnap({ version: 1, objects: [], chains: [] });
    expect(snap.objects).toEqual([]);
    expect(snap.chains).toEqual([]);
    expect(snap.quizAnswers).toEqual({});
  });

  it("produces output assignable to the SceneSnap contract", () => {
    // Compile-time guarantee that the shape matches what checks.ts consumes.
    const snap = toCheckSnap(scene);
    const objects: { s: string }[] = snap.objects;
    const chains: number[][][] = snap.chains;
    expect(objects.length + chains.length).toBe(4);
  });
});
