import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { surfaceTopology } from "./topology";

describe("surfaceTopology", () => {
  it("cube has χ = 2 (not 18 from raw position counts)", () => {
    const t = surfaceTopology(new THREE.BoxGeometry(1, 1, 1));
    expect(t.v).toBe(8);
    expect(t.f).toBe(12);
    expect(t.euler).toBe(2);
  });
  it("closed smooth solids have χ = 2", () => {
    expect(surfaceTopology(new THREE.SphereGeometry(1, 48, 24)).euler).toBe(2);
    expect(surfaceTopology(new THREE.CylinderGeometry(1, 1, 2, 56)).euler).toBe(2);
    expect(surfaceTopology(new THREE.ConeGeometry(1, 2, 56)).euler).toBe(2);
    expect(surfaceTopology(new THREE.CapsuleGeometry(1, 2, 8, 28)).euler).toBe(2);
  });
  it("platonic solids have χ = 2", () => {
    expect(surfaceTopology(new THREE.TetrahedronGeometry(1)).euler).toBe(2);
    expect(surfaceTopology(new THREE.OctahedronGeometry(1)).euler).toBe(2);
    expect(surfaceTopology(new THREE.IcosahedronGeometry(1)).euler).toBe(2);
  });
  it("torus has χ = 0", () => {
    expect(surfaceTopology(new THREE.TorusGeometry(2.6, 1.1, 28, 72)).euler).toBe(0);
  });
  it("open hemisphere patch has χ = 1", () => {
    const dome = new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    expect(surfaceTopology(dome).euler).toBe(1);
  });
});
