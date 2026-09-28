/**
 * Quantitative helpers for the school-lab experiments. All formulas follow
 * the class practical manuals. Distances are magnitudes (positive numbers);
 * molarity in mol/L; volumes in mL (ratios, so units cancel consistently).
 */

/** Molarity of a redox titrant (e.g. KMnO4) from a concordant titre. */
export function redoxTitrantMolarity(args: {
  analyteMolarity: number;
  analyteVolumeMl: number;
  titreMl: number;
  /** moles of titrant reacting per mole of analyte (1/5 for Fe2+, 2/5 for oxalic acid) */
  titrantPerAnalyte: number;
}): number {
  const { analyteMolarity, analyteVolumeMl, titreMl, titrantPerAnalyte } = args;
  if (titreMl <= 0) throw new RangeError("titre must be positive");
  return (
    (titrantPerAnalyte * analyteMolarity * analyteVolumeMl) / titreMl
  );
}

/** Strength in g/L from molarity and molar mass. */
export function strengthGPerL(molarity: number, molarMass: number): number {
  return molarity * molarMass;
}

/** Metre bridge: unknown resistance X = R(100 − l)/l, l in cm. */
export function metreBridgeX(knownResistance: number, nullPointCm: number): number {
  if (nullPointCm <= 0 || nullPointCm >= 100)
    throw new RangeError("null point must lie between 0 and 100 cm");
  return (knownResistance * (100 - nullPointCm)) / nullPointCm;
}

/** Half-deflection: galvanometer resistance G = RS/(R − S). Requires S < R. */
export function galvanometerResistance(seriesR: number, shuntS: number): number {
  if (shuntS <= 0 || shuntS >= seriesR)
    throw new RangeError("shunt S must satisfy 0 < S < R");
  return (seriesR * shuntS) / (seriesR - shuntS);
}

/** Figure of merit k = (1/θ)(E/(R + G)), current per scale division. */
export function figureOfMerit(args: {
  emf: number;
  seriesR: number;
  galvanometerG: number;
  deflection: number;
}): number {
  const { emf, seriesR, galvanometerG, deflection } = args;
  if (deflection <= 0) throw new RangeError("deflection must be positive");
  return emf / (deflection * (seriesR + galvanometerG));
}

/** Sonometer: AC mains frequency ν = √T / (4l√m). SI units. */
export function sonometerFrequency(args: {
  tensionN: number;
  lengthM: number;
  linearDensityKgPerM: number;
}): number {
  const { tensionN, lengthM, linearDensityKgPerM } = args;
  if (lengthM <= 0 || linearDensityKgPerM <= 0)
    throw new RangeError("length and linear density must be positive");
  return (
    Math.sqrt(tensionN) / (4 * lengthM * Math.sqrt(linearDensityKgPerM))
  );
}

/**
 * Convex lens focal length from conjugate distances (magnitudes):
 * 1/f = 1/v − 1/u with sign convention folded in, i.e. f = uv/(u + v).
 */
export function convexFocalLength(objectDistance: number, imageDistance: number): number {
  if (objectDistance <= 0 || imageDistance <= 0)
    throw new RangeError("distances must be positive magnitudes");
  return (objectDistance * imageDistance) / (objectDistance + imageDistance);
}

/**
 * Concave lens by combination: 1/F = 1/f1 − 1/f2 (magnitudes), so
 * f2 = f1·F/(F − f1). Requires F > f1 (combination weaker than convex alone).
 */
export function concaveFocalLength(convexF1: number, combinationF: number): number {
  if (combinationF <= convexF1)
    throw new RangeError("combination focal length must exceed the convex lens f1");
  return (convexF1 * combinationF) / (combinationF - convexF1);
}

/** Resistivity ρ = RA/l. SI units. */
export function resistivity(resistance: number, areaM2: number, lengthM: number): number {
  if (areaM2 <= 0 || lengthM <= 0)
    throw new RangeError("area and length must be positive");
  return (resistance * areaM2) / lengthM;
}
