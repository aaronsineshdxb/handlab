import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HandLabEngine } from "./engine";
import { HandLabFallbackEngine } from "./fallback2d";
import { VRHandLabEngine } from "./vr-engine";
import HandLab from "../components/HandLab";
import HandLabVR from "../components/HandLabVR";

/**
 * Shapes stay creatable while line mode is on: every engine exposes
 * placeCurrentShape(), which must not consult lineMode, and the tap path
 * in line mode must select solids tapped directly instead of swallowing
 * them as line points.
 */
describe("shapes in line mode", () => {
  it("WebGL engine exposes placeCurrentShape", () => {
    expect(typeof HandLabEngine.prototype.placeCurrentShape).toBe("function");
  });

  it("WebGL placeCurrentShape places at the cursor regardless of lineMode", () => {
    let placed: unknown = null;
    let toasted = "";
    const fake = {
      lineMode: true,
      shape: "cube",
      cursor: { position: { x: 1, y: 2, z: 3 } },
      placeAt: (p: unknown) => {
        placed = p;
        return { id: "mesh" };
      },
      setSelected: (_m: unknown) => undefined,
      toast: (s: string) => {
        toasted = s;
      },
      emitMath: () => undefined,
    };
    HandLabEngine.prototype.placeCurrentShape.call(fake);
    expect(placed).toEqual({ x: 1, y: 2, z: 3 });
    expect(toasted).toContain("cube");
  });

  it("2D fallback exposes placeCurrentShape and spawns at the cursor", () => {
    expect(typeof HandLabFallbackEngine.prototype.placeCurrentShape).toBe(
      "function",
    );
    let at: unknown = null;
    const fake = {
      lineMode: true,
      cursor: { x: 4, y: 5 },
      placeShapeAt: (p: unknown) => {
        at = p;
      },
    };
    HandLabFallbackEngine.prototype.placeCurrentShape.call(fake);
    expect(at).toEqual({ x: 4, y: 5 });
  });

  it("VR engine exposes placeCurrentShape and places at the cursor", () => {
    expect(typeof VRHandLabEngine.prototype.placeCurrentShape).toBe(
      "function",
    );
    let placed: unknown = null;
    const fake = {
      lineMode: true,
      shape: "cone",
      cursorPos: { x: 0, y: 0, z: 0 },
      placeAt: (p: unknown) => {
        placed = p;
        return { id: "mesh" };
      },
      toast: (_s: string) => undefined,
    };
    VRHandLabEngine.prototype.placeCurrentShape.call(fake);
    expect(placed).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("desktop and VR toolbars expose a place action that works in line mode", () => {
    expect(renderToStaticMarkup(<HandLab />)).toMatch(/place .*\[P\]/);
    expect(renderToStaticMarkup(<HandLabVR />)).toMatch(/place /);
  });
});
