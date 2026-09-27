import { describe, expect, it } from "vitest";
import {
  concaveFocalLength,
  convexFocalLength,
  figureOfMerit,
  galvanometerResistance,
  metreBridgeX,
  redoxTitrantMolarity,
  resistivity,
  sonometerFrequency,
  strengthGPerL,
} from "./calculations";

describe("volumetric calculations", () => {
  it("Mohr's salt vs KMnO4: 20 mL M/20 FAS, 20 mL titre -> 0.01 M", () => {
    const m = redoxTitrantMolarity({
      analyteMolarity: 0.05,
      analyteVolumeMl: 20,
      titreMl: 20,
      titrantPerAnalyte: 1 / 5,
    });
    expect(m).toBeCloseTo(0.01, 6);
    expect(strengthGPerL(m, 158)).toBeCloseTo(1.58, 6);
  });

  it("oxalic acid vs KMnO4: 10 mL M/20 acid, 20 mL titre -> 0.01 M", () => {
    const m = redoxTitrantMolarity({
      analyteMolarity: 0.05,
      analyteVolumeMl: 10,
      titreMl: 20,
      titrantPerAnalyte: 2 / 5,
    });
    expect(m).toBeCloseTo(0.01, 6);
  });

  it("molarity scales inversely with titre", () => {
    const base = {
      analyteMolarity: 0.05,
      analyteVolumeMl: 20,
      titrantPerAnalyte: 1 / 5,
    };
    const m20 = redoxTitrantMolarity({ ...base, titreMl: 20 });
    const m40 = redoxTitrantMolarity({ ...base, titreMl: 40 });
    expect(m20 / m40).toBeCloseTo(2, 6);
  });

  it("rejects non-positive titre", () => {
    expect(() =>
      redoxTitrantMolarity({
        analyteMolarity: 0.05,
        analyteVolumeMl: 20,
        titreMl: 0,
        titrantPerAnalyte: 1 / 5,
      }),
    ).toThrow(RangeError);
  });
});

describe("electricity experiments", () => {
  it("metre bridge: R=2, l=40 -> X=3", () => {
    expect(metreBridgeX(2, 40)).toBeCloseTo(3, 6);
  });

  it("metre bridge null point must lie on the wire", () => {
    expect(() => metreBridgeX(2, 0)).toThrow(RangeError);
    expect(() => metreBridgeX(2, 100)).toThrow(RangeError);
  });

  it("half deflection: R=3000, S=150", () => {
    expect(galvanometerResistance(3000, 150)).toBeCloseTo(157.89, 2);
  });

  it("half deflection requires S < R", () => {
    expect(() => galvanometerResistance(100, 100)).toThrow(RangeError);
  });

  it("figure of merit falls with larger deflection", () => {
    const base = { emf: 2, seriesR: 2000, galvanometerG: 100 };
    const k30 = figureOfMerit({ ...base, deflection: 30 });
    const k60 = figureOfMerit({ ...base, deflection: 60 });
    expect(k30 / k60).toBeCloseTo(2, 6);
    expect(k30).toBeCloseTo(2 / (30 * 2100), 10);
  });

  it("resistivity rho = RA/l", () => {
    expect(resistivity(5, 2e-6, 1)).toBeCloseTo(1e-5, 11);
  });
});

describe("waves and optics", () => {
  it("sonometer: T=9N, l=0.25m, m=1e-4 kg/m -> 300 Hz", () => {
    expect(
      sonometerFrequency({ tensionN: 9, lengthM: 0.25, linearDensityKgPerM: 1e-4 }),
    ).toBeCloseTo(300, 6);
  });

  it("sonometer frequency doubles when tension quadruples", () => {
    const base = { lengthM: 0.25, linearDensityKgPerM: 1e-4 };
    const ratio =
      sonometerFrequency({ ...base, tensionN: 36 }) /
      sonometerFrequency({ ...base, tensionN: 9 });
    expect(ratio).toBeCloseTo(2, 6);
  });

  it("convex lens: symmetric conjugates give f = u/2", () => {
    expect(convexFocalLength(30, 30)).toBeCloseTo(15, 6);
  });

  it("concave lens: f1=10, F=15 -> f2=30", () => {
    expect(concaveFocalLength(10, 15)).toBeCloseTo(30, 6);
  });

  it("concave lens requires combination weaker than convex alone", () => {
    expect(() => concaveFocalLength(10, 10)).toThrow(RangeError);
  });
});
