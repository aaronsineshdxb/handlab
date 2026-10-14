import { describe, expect, it } from "vitest";
import { HandLabEngine } from "./engine";
import { HandLabFallbackEngine } from "./fallback2d";

/**
 * exportCheckSnap reads shape names + chain points straight off the live
 * scene graph, skipping the hex-color / position / rotation work that
 * exportScene does for save/load. These tests call the prototype methods
 * with minimal fakes (no WebGL context) — shapeOf resolves via the
 * userData.shape cache set in placeAt, so no geometry is touched.
 */
describe("HandLabEngine.exportCheckSnap", () => {
  const fakeThis = () => ({
    spawnables: [
      { userData: { shape: "cube" } },
      { userData: { shape: "sphere" } },
    ],
    polylines: [{ pts: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] }],
  });

  it("is exposed for the HandLab union-type call", () => {
    expect(typeof HandLabEngine.prototype.exportCheckSnap).toBe("function");
  });

  it("returns shape names without color/position work", () => {
    const snap = HandLabEngine.prototype.exportCheckSnap.call(
      fakeThis(),
      {},
    );
    expect(snap.objects).toEqual([{ s: "cube" }, { s: "sphere" }]);
    expect(snap.chains).toEqual([
      [
        [0, 0, 0],
        [1, 0, 0],
      ],
    ]);
  });

  it("carries quiz answers through", () => {
    const snap = HandLabEngine.prototype.exportCheckSnap.call(fakeThis(), {
      q1: 2,
    });
    expect(snap.quizAnswers).toEqual({ q1: 2 });
  });

  it("handles an empty scene", () => {
    const snap = HandLabEngine.prototype.exportCheckSnap.call(
      { spawnables: [], polylines: [] },
      {},
    );
    expect(snap).toEqual({ objects: [], chains: [], quizAnswers: {} });
  });
});

describe("HandLabFallbackEngine.exportCheckSnap", () => {
  const fakeThis = () => ({
    objs: [
      { s: "cube", c: "#016a71", x: 1, y: 2, rot: 0 },
      { s: "torus", c: "#ff0000", x: 3, y: 4, rot: 1 },
    ],
    chains: [{ pts: [{ x: 5, y: 6 }] }],
  });

  it("matches the WebGL engine's snapshot shape", () => {
    expect(typeof HandLabFallbackEngine.prototype.exportCheckSnap).toBe(
      "function",
    );
    const snap = HandLabFallbackEngine.prototype.exportCheckSnap.call(
      fakeThis(),
      {},
    );
    expect(snap.objects).toEqual([{ s: "cube" }, { s: "torus" }]);
    expect(snap.chains).toEqual([
      [
        [5, 6, 0],
      ],
    ]);
  });
});
