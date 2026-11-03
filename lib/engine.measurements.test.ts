import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { HandLabEngine } from "./engine";

/**
 * getMeasurements math tested via prototype calls with minimal fakes —
 * angleAt needs its preallocated scratch vectors on `this`; the rest are
 * free functions over plain points.
 *
 * The fake `this` also borrows the two private prototype methods
 * getMeasurements resolves off itself (isClosed + angleAt): angleAt only
 * touches the scratch vectors above and isClosed only its argument, so the
 * borrowed implementations work unchanged on the fake.
 */
function fakeEngine(polylines: unknown): unknown {
  return {
    polylines,
    _aa: new THREE.Vector3(),
    _ab: new THREE.Vector3(),
    isClosed: HandLabEngine.prototype["isClosed"],
    angleAt: HandLabEngine.prototype["angleAt"],
  };
}

const v = THREE.Vector3;

describe("HandLabEngine.getMeasurements ext fields", () => {
  it("closed square: angleSum = 360 and five fields stay unchanged", () => {
    // Real closed chains repeat the first point (addPoint pushes a clone when
    // tapping near the first handle), which also satisfies CLOSE_R closure.
    const pts = [
      new v(0, 0, 0),
      new v(1, 0, 0),
      new v(1, 1, 0),
      new v(0, 1, 0),
      new v(0, 0, 0),
    ];
    const engine = HandLabEngine.prototype.getMeasurements.call(
      fakeEngine([{ pts }]),
    );
    expect(engine[0].angleSum).toBeCloseTo(360, 2);
    expect(engine[0].pythag).toBeNull();
  });

  it("open 3-point right chain: angleSum null, pythag describes the triple", () => {
    const pts = [new v(0, 0, 0), new v(3, 0, 0), new v(3, 4, 0)];
    const engine = HandLabEngine.prototype.getMeasurements.call(
      fakeEngine([{ pts }]),
    );
    expect(engine[0].angleSum).toBeNull();
    expect(engine[0].pythag!.right).toBe(true);
    expect(engine[0].pythag!.c).toBeCloseTo(5);
  });

  it("closed chains never report pythag; open non-3-pt chains report neither", () => {
    const open = [new v(0, 0, 0), new v(1, 0, 0)];
    const engine = HandLabEngine.prototype.getMeasurements.call(
      fakeEngine([{ pts: open }]),
    );
    expect(engine[0].angleSum).toBeNull();
    expect(engine[0].pythag).toBeNull();
  });
});
