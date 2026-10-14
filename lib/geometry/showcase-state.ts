/**
 * UI State / Theme Manager for the presentation showcase.
 * React state lives in the component; this module owns the shareable
 * defaults, mode gating, and light-theme lock for judging.
 */
import type { ShowcaseShapeId } from "./math";
import { COMPLEX_SHAPES, SIMPLE_SHAPES } from "./math";
import type { ClipAxis, MaterialMode } from "./viewport";

export type StudioMode = "learn" | "studio";

export interface ShowcaseUI {
  mode: StudioMode;
  shape: ShowcaseShapeId;
  wireframe: boolean;
  showNormals: boolean;
  showVertices: boolean;
  detail: number;
  clipAxis: ClipAxis;
  clipPos: number;
  material: MaterialMode;
  spin: boolean;
  grid: boolean;
  showDims: boolean;
  netOpen: boolean;
  unfold: number;
  drawer: "shapes" | "math" | "studio" | null;
}

export const INITIAL_UI: ShowcaseUI = {
  mode: "learn",
  shape: "cylinder",
  wireframe: false,
  showNormals: false,
  showVertices: false,
  detail: 1,
  clipAxis: null,
  clipPos: 0,
  material: "pastel",
  spin: false,
  grid: true,
  showDims: true,
  netOpen: false,
  unfold: 0.7,
  drawer: null,
};

/** Studio shapes are hidden in Learn mode. */
export function visibleShapes(mode: StudioMode): ShowcaseShapeId[] {
  return mode === "learn" ? [...SIMPLE_SHAPES] : [...SIMPLE_SHAPES, ...COMPLEX_SHAPES];
}

/** Lock the page to the polished light theme for the judging panel. */
export function lockLightTheme(): () => void {
  const prevTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = "light";
  try {
    localStorage.setItem("handlab-theme", "light");
  } catch { /* private mode */ }
  return () => {
    document.documentElement.dataset.theme = prevTheme ?? "light";
  };
}
