/**
 * Math Engine — pure, testable geometry calculators.
 * No DOM, no Three.js. All units are centimetres (cm, cm², cm³).
 * Kept separate from the viewport so judges / tests can verify numbers directly.
 */

export type SimpleShapeId =
  | "cube"
  | "prism"
  | "sphere"
  | "cylinder"
  | "cone"
  | "pyramid";

export type ComplexShapeId =
  | "torus"
  | "dome"
  | "hexPrism"
  | "triPrism"
  | "capsule"
  | "icosa";

export type ShowcaseShapeId = SimpleShapeId | ComplexShapeId;

export interface ShapeDims {
  /** cube edge / pyramid base edge / generic size */
  a?: number;
  w?: number;
  h?: number;
  d?: number;
  /** radius (sphere / cylinder / cone) */
  r?: number;
  /** torus major radius */
  R?: number;
}

export interface ShapeDef {
  id: ShowcaseShapeId;
  label: string;
  kind: "simple" | "complex";
  /** which sliders to show, in order */
  params: { key: keyof ShapeDims; label: string; min: number; max: number; step: number }[];
  defaults: Required<Pick<ShapeDims, "a" | "w" | "h" | "d" | "r" | "R">>;
  faces: number | null;
  vertices: number | null;
  edges: number | null;
  eulerNote?: string;
  netKind: "cube" | "prism" | "cylinder" | "cone" | "pyramid" | "sphere" | "torus" | "dome" | "hexPrism" | "triPrism" | "none";
  blurb: string;
}

const D = (
  a = 3,
  w = 4,
  h = 5,
  d = 6,
  r = 3,
  R = 4,
): Required<Pick<ShapeDims, "a" | "w" | "h" | "d" | "r" | "R">> => ({ a, w, h, d, r, R });

export const SHAPE_DEFS: Record<ShowcaseShapeId, ShapeDef> = {
  cube: {
    id: "cube", label: "Cube", kind: "simple",
    params: [{ key: "a", label: "edge s", min: 1, max: 8, step: 0.1 }],
    defaults: D(3), faces: 6, vertices: 8, edges: 12, netKind: "cube",
    blurb: "6 congruent square faces.",
  },
  prism: {
    id: "prism", label: "Rect. Prism", kind: "simple",
    params: [
      { key: "w", label: "width w", min: 1, max: 8, step: 0.1 },
      { key: "h", label: "height h", min: 1, max: 8, step: 0.1 },
      { key: "d", label: "depth d", min: 1, max: 8, step: 0.1 },
    ],
    defaults: D(3, 4, 5, 3), faces: 6, vertices: 8, edges: 12, netKind: "prism",
    blurb: "Boxes scale volume as w × h × d.",
  },
  sphere: {
    id: "sphere", label: "Sphere", kind: "simple",
    params: [{ key: "r", label: "radius r", min: 0.5, max: 5, step: 0.1 }],
    defaults: D(3, 4, 5, 6, 2.5), faces: 1, vertices: 0, edges: 0, netKind: "sphere",
    eulerNote: "Smooth solid — Euler holds for its polyhedral mesh (see Studio).",
    blurb: "Minimal surface for a given volume.",
  },
  cylinder: {
    id: "cylinder", label: "Cylinder", kind: "simple",
    params: [
      { key: "r", label: "radius r", min: 0.5, max: 5, step: 0.1 },
      { key: "h", label: "height h", min: 1, max: 10, step: 0.1 },
    ],
    defaults: D(3, 4, 5, 6, 2), faces: 3, vertices: 0, edges: 2, netKind: "cylinder",
    eulerNote: "3 faces · 2 circular edges · 0 vertices (curved).",
    blurb: "Prism with a circular base.",
  },
  cone: {
    id: "cone", label: "Cone", kind: "simple",
    params: [
      { key: "r", label: "radius r", min: 0.5, max: 5, step: 0.1 },
      { key: "h", label: "height h", min: 1, max: 10, step: 0.1 },
    ],
    defaults: D(3, 4, 5, 6, 2), faces: 2, vertices: 1, edges: 1, netKind: "cone",
    blurb: "⅓ the volume of its enclosing cylinder.",
  },
  pyramid: {
    id: "pyramid", label: "Pyramid", kind: "simple",
    params: [
      { key: "a", label: "base a", min: 1, max: 8, step: 0.1 },
      { key: "h", label: "height h", min: 1, max: 10, step: 0.1 },
    ],
    defaults: D(4, 4, 5), faces: 5, vertices: 5, edges: 8, netKind: "pyramid",
    blurb: "Square base + 4 triangles. V = a²h / 3.",
  },
  torus: {
    id: "torus", label: "Torus", kind: "complex",
    params: [
      { key: "R", label: "ring R", min: 1, max: 5, step: 0.1 },
      { key: "r", label: "tube r", min: 0.3, max: 2.5, step: 0.05 },
    ],
    defaults: D(3, 4, 5, 6, 1.1, 2.6), faces: null, vertices: null, edges: null, netKind: "torus",
    eulerNote: "Genus-1: mesh Euler χ = 0 (not 2).",
    blurb: "Donut. V = 2π²Rr² (Pappus).",
  },
  dome: {
    id: "dome", label: "Geo Dome", kind: "complex",
    params: [{ key: "r", label: "radius r", min: 1, max: 5, step: 0.1 }],
    defaults: D(3, 4, 5, 6, 3), faces: null, vertices: null, edges: null, netKind: "dome",
    eulerNote: "Icosahedral hemisphere — counts grow with subdivision.",
    blurb: "Hemisphere + geodesic frequency (Studio → detail).",
  },
  hexPrism: {
    id: "hexPrism", label: "Hex Prism", kind: "complex",
    params: [
      { key: "a", label: "side a", min: 0.5, max: 5, step: 0.1 },
      { key: "h", label: "height h", min: 1, max: 10, step: 0.1 },
    ],
    defaults: D(2, 4, 5), faces: 8, vertices: 12, edges: 18, netKind: "hexPrism",
    blurb: "Honeycomb cell. Base = (3√3/2)a².",
  },
  triPrism: {
    id: "triPrism", label: "Tri Prism", kind: "complex",
    params: [
      { key: "a", label: "side a", min: 0.5, max: 5, step: 0.1 },
      { key: "h", label: "length h", min: 1, max: 10, step: 0.1 },
    ],
    defaults: D(3, 4, 5), faces: 5, vertices: 6, edges: 9, netKind: "triPrism",
    blurb: "Wedge / roof profile. Base = equilateral triangle.",
  },
  capsule: {
    id: "capsule", label: "Capsule", kind: "complex",
    params: [
      { key: "r", label: "radius r", min: 0.5, max: 4, step: 0.1 },
      { key: "h", label: "cyl. h", min: 0.5, max: 8, step: 0.1 },
    ],
    defaults: D(3, 4, 3, 6, 1.6), faces: null, vertices: null, edges: null, netKind: "none",
    eulerNote: "Stadium solid — cylinder + 2 hemispheres.",
    blurb: "Pill: cylinder mid-section, spherical caps.",
  },
  icosa: {
    id: "icosa", label: "Icosahedron", kind: "complex",
    params: [{ key: "a", label: "edge a", min: 1, max: 6, step: 0.1 }],
    defaults: D(3), faces: 20, vertices: 12, edges: 30, netKind: "none",
    blurb: "20 equilateral triangles. Golden-ratio vertices.",
  },
};

export const SIMPLE_SHAPES: ShowcaseShapeId[] = ["cube", "prism", "sphere", "cylinder", "cone", "pyramid"];
export const COMPLEX_SHAPES: ShowcaseShapeId[] = ["torus", "dome", "hexPrism", "triPrism", "capsule", "icosa"];

export function dimsFor(id: ShowcaseShapeId): Required<Pick<ShapeDims, "a" | "w" | "h" | "d" | "r" | "R">> {
  return { ...SHAPE_DEFS[id].defaults };
}

/** Merge partial slider updates over defaults. */
export function withDims(id: ShowcaseShapeId, partial: ShapeDims): Required<Pick<ShapeDims, "a" | "w" | "h" | "d" | "r" | "R">> {
  return { ...dimsFor(id), ...Object.fromEntries(Object.entries(partial).filter(([, v]) => typeof v === "number")) } as Required<
    Pick<ShapeDims, "a" | "w" | "h" | "d" | "r" | "R">
  >;
}

export interface SolidMetrics {
  volume: number;
  area: number;
  faces: number | null;
  vertices: number | null;
  edges: number | null;
  euler: number | null;
  volumeSym: string;
  volumeSub: string;
  areaSym: string;
  areaSub: string;
}

const PI = Math.PI;
const f2 = (n: number): string =>
  !Number.isFinite(n) ? "—" : Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 2 }) : n.toFixed(2);

export function metricsFor(id: ShowcaseShapeId, p: ShapeDims): SolidMetrics {
  const d = withDims(id, p);
  const { a, w, h, r, R } = d;
  const dd = d.d;
  let volume = 0, area = 0, volumeSym = "", volumeSub = "", areaSym = "", areaSub = "";

  switch (id) {
    case "cube": {
      volume = a ** 3; area = 6 * a * a;
      volumeSym = "V = s³"; volumeSub = `V = (${f2(a)})³ ≈ ${f2(volume)} cm³`;
      areaSym = "A = 6s²"; areaSub = `A = 6 × (${f2(a)})² ≈ ${f2(area)} cm²`;
      break;
    }
    case "prism": {
      volume = w * h * dd; area = 2 * (w * h + w * dd + h * dd);
      volumeSym = "V = w × h × d"; volumeSub = `V = ${f2(w)} × ${f2(h)} × ${f2(dd)} ≈ ${f2(volume)} cm³`;
      areaSym = "A = 2(wh + wd + hd)"; areaSub = `A = 2(${f2(w * h)} + ${f2(w * dd)} + ${f2(h * dd)}) ≈ ${f2(area)} cm²`;
      break;
    }
    case "sphere": {
      volume = (4 / 3) * PI * r ** 3; area = 4 * PI * r * r;
      volumeSym = "V = ⁴⁄₃πr³"; volumeSub = `V = ⁴⁄₃ × π × (${f2(r)})³ ≈ ${f2(volume)} cm³`;
      areaSym = "A = 4πr²"; areaSub = `A = 4 × π × (${f2(r)})² ≈ ${f2(area)} cm²`;
      break;
    }
    case "cylinder": {
      volume = PI * r * r * h; area = 2 * PI * r * (r + h);
      volumeSym = "V = πr²h"; volumeSub = `V = π × (${f2(r)})² × ${f2(h)} ≈ ${f2(volume)} cm³`;
      areaSym = "A = 2πr² + 2πrh"; areaSub = `A = 2π(${f2(r)})² + 2π(${f2(r)})(${f2(h)}) ≈ ${f2(area)} cm²`;
      break;
    }
    case "cone": {
      const s = Math.hypot(r, h);
      volume = (PI * r * r * h) / 3; area = PI * r * (r + s);
      volumeSym = "V = ⅓πr²h"; volumeSub = `V = ⅓ × π × (${f2(r)})² × ${f2(h)} ≈ ${f2(volume)} cm³`;
      areaSym = "A = πr(r + ℓ), ℓ = √(r²+h²)"; areaSub = `A = π(${f2(r)})(${f2(r)} + ${f2(s)}) ≈ ${f2(area)} cm²`;
      break;
    }
    case "pyramid": {
      const slant = Math.hypot(a / 2, h);
      volume = (a * a * h) / 3; area = a * a + 2 * a * slant;
      volumeSym = "V = a²h / 3"; volumeSub = `V = (${f2(a)})² × ${f2(h)} / 3 ≈ ${f2(volume)} cm³`;
      areaSym = "A = a² + 2aℓ"; areaSub = `A = (${f2(a)})² + 2(${f2(a)})(${f2(slant)}) ≈ ${f2(area)} cm²`;
      break;
    }
    case "torus": {
      volume = 2 * PI * PI * R * r * r; area = 4 * PI * PI * R * r;
      volumeSym = "V = 2π²Rr²"; volumeSub = `V = 2π² × ${f2(R)} × (${f2(r)})² ≈ ${f2(volume)} cm³`;
      areaSym = "A = 4π²Rr"; areaSub = `A = 4π² × ${f2(R)} × ${f2(r)} ≈ ${f2(area)} cm²`;
      break;
    }
    case "dome": {
      volume = (2 / 3) * PI * r ** 3; area = 3 * PI * r * r;
      volumeSym = "V = ⅔πr³ (hemisphere)"; volumeSub = `V = ⅔ × π × (${f2(r)})³ ≈ ${f2(volume)} cm³`;
      areaSym = "A = 3πr² (with base)"; areaSub = `A = 3 × π × (${f2(r)})² ≈ ${f2(area)} cm²`;
      break;
    }
    case "hexPrism": {
      const base = ((3 * Math.sqrt(3)) / 2) * a * a;
      volume = base * h; area = 2 * base + 6 * a * h;
      volumeSym = "V = (3√3/2)a²h"; volumeSub = `V = ${f2(base)} × ${f2(h)} ≈ ${f2(volume)} cm³`;
      areaSym = "A = 2B + 6ah"; areaSub = `A = 2(${f2(base)}) + 6(${f2(a)})(${f2(h)}) ≈ ${f2(area)} cm²`;
      break;
    }
    case "triPrism": {
      const base = (Math.sqrt(3) / 4) * a * a;
      volume = base * h; area = 2 * base + 3 * a * h;
      volumeSym = "V = (√3/4)a²h"; volumeSub = `V = ${f2(base)} × ${f2(h)} ≈ ${f2(volume)} cm³`;
      areaSym = "A = 2B + 3ah"; areaSub = `A = 2(${f2(base)}) + 3(${f2(a)})(${f2(h)}) ≈ ${f2(area)} cm²`;
      break;
    }
    case "capsule": {
      volume = PI * r * r * h + (4 / 3) * PI * r ** 3; area = 2 * PI * r * h + 4 * PI * r * r;
      volumeSym = "V = πr²h + ⁴⁄₃πr³"; volumeSub = `V = π(${f2(r)})²(${f2(h)}) + ⁴⁄₃π(${f2(r)})³ ≈ ${f2(volume)} cm³`;
      areaSym = "A = 2πrh + 4πr²"; areaSub = `A = 2π(${f2(r)})(${f2(h)}) + 4π(${f2(r)})² ≈ ${f2(area)} cm²`;
      break;
    }
    case "icosa": {
      volume = ((5 * (3 + Math.sqrt(5))) / 12) * a ** 3; area = 5 * Math.sqrt(3) * a * a;
      volumeSym = "V = 5(3+√5)a³/12"; volumeSub = `V = 2.182 × (${f2(a)})³ ≈ ${f2(volume)} cm³`;
      areaSym = "A = 5√3·a²"; areaSub = `A = 5√3 × (${f2(a)})² ≈ ${f2(area)} cm²`;
      break;
    }
  }

  const def = SHAPE_DEFS[id];
  const euler =
    def.faces != null && def.vertices != null && def.edges != null
      ? def.vertices - def.edges + def.faces
      : null;
  return { volume, area, faces: def.faces, vertices: def.vertices, edges: def.edges, euler, volumeSym, volumeSub, areaSym, areaSub };
}

/** Golden-ratio comparison helper for Studio mode. */
export function goldenPair(span: number): { long: number; short: number; ratio: number } {
  const phi = (1 + Math.sqrt(5)) / 2;
  return { long: span, short: span / phi, ratio: phi };
}

export const fmt = f2;
