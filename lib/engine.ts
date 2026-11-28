import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { fuseDepth } from "./depth/fusion";
import { DepthAnythingV2Provider } from "./depth/monocular";
import { PalmDepthProvider } from "./depth/palm";
import {
  MODEL_URL,
  MODEL_GZ_URL,
  WASM_URL,
  WASM_GZ_URL,
  gzAssetsAvailable,
} from "./handAssets";
import { shouldDetect } from "./handRate";
import { perf } from "./perf/recorder";
import { createLandmarker, withTimeout } from "./landmarker";
import type {
  HandTracker,
  TrackerFactory,
  TrackerResult,
} from "./handTracker";
import { nextPixelRatio, PR_MAX_CAP } from "./adaptivePr";
import { isIPadOS } from "./caps";
import {
  angleSumText,
  interiorAnglesDeg,
  pythagorasOf,
  pythagText,
  sumDegrees,
  type Pt,
} from "./geometry/chainMath";
import { onReducedMotionChange, prefersReducedMotion } from "./motion";
import {
  SCALE_MAX,
  SCALE_MIN,
  clampedUniformScale,
  interHandDist,
  nextPinchState,
  pinchMid,
  scaleFactorForDist,
} from "./twoHandScale";
import { cmPerMeterFor, ndcFromLandmark, rulerText } from "./ruler";
import type { SceneSnap } from "./lessons/checks";
import {
  SCENE_THEMES,
  currentCustomHex,
  currentScheme,
  currentTheme,
  onThemeChange,
  sceneThemeFor,
  sceneThemeNow,
  type ThemeName,
} from "./theme";

export type ShapeName =
  | "cube"
  | "sphere"
  | "cone"
  | "torus"
  | "cylinder"
  | "icosa"
  | "knot"
  | "tetra"
  | "octa"
  | "capsule"
  | "prism"
  | "pyramid"
  | "dome"
  | "hexPrism"
  | "triPrism";

export type CamState = "idle" | "loading" | "live";

export type StudioMaterial = "standard" | "clay" | "flat";
export type ClipAxis = "x" | "y" | "z" | null;

/** Shared engine contract implemented by both HandLabEngine (WebGL) and
 *  HandLabFallbackEngine (2D canvas). 3D-only Studio methods are optional. */
export interface LabEngine {
  setWireframe?: (on: boolean) => void;
  setMaterialMode?: (mode: StudioMaterial) => void;
  setDetail?: (level: number) => void;
  setClip?: (axis: ClipAxis, pos: number) => void;
  setSpawnScale?: (x: number, y: number, z: number) => void;
  setShape: (s: ShapeName) => void;
  setColor: (c: string) => void;
  setLineMode: (on: boolean) => void;
  toggleSnap: () => void;
  setChainMathMode?: (kind: "angleSum" | "pythag", on: boolean) => void;
  toggleRuler: () => boolean;
  setRulerSpanCm: (cm: number) => void;
  clearLines: () => void;
  undo: () => void;
  clearAll: () => void;
  recenter: () => void;
  toggleSpin: () => void;
  toggleGrid: () => void;
  saveToStorage: () => void;
  loadFromStorage: () => void;
  exportPNG: () => string | null;
  exportScene: () => SceneData;
  exportCheckSnap: (quizAnswers?: Record<string, number>) => SceneSnap;
  importSceneJson: (text: string) => boolean;
  /** Ghost overlay: render a target scene JSON as a translucent overlay the
   *  student can match. 3D-only; the 2D fallback does not implement these. */
  setGhostScene?: (text: string) => boolean;
  clearGhost?: () => void;
  enableWebcam: () => Promise<void> | void;
  cancelWebcamLoad: () => void;
  setDepthEnabled?: (on: boolean) => Promise<void> | void;
  setCameraDistance?: (d: number) => void;
  placeCenter: () => void;
  placeCurrentShape: () => void;
  dispose: () => void;
}

export interface UiState {
  shape: ShapeName;
  color: string;
  lineMode: boolean;
  snapOn: boolean;
  spin: boolean;
  grid: boolean;
  cam: CamState;
  depthOn: boolean;
  depth: string;
}

export const initialUiState: UiState = {
  shape: "cube",
  color: "#2563eb",
  lineMode: false,
  snapOn: true,
  spin: false,
  grid: true,
  cam: "idle",
  depthOn: false,
  depth: "depth AI off — enable with 'depth v2' for neural depth",
};

export const SHAPES: ShapeName[] = [
  "cube",
  "sphere",
  "cone",
  "torus",
  "cylinder",
  "icosa",
  "knot",
  "tetra",
  "octa",
  "capsule",
  "prism",
  "pyramid",
  "dome",
  "hexPrism",
  "triPrism",
];

export interface HudNodes {
  "d-hand": HTMLElement;
  "t-hand": HTMLElement;
  "t-pinch": HTMLElement;
  "t-xyz": HTMLElement;
  "t-count": HTMLElement;
  "t-model": HTMLElement;
  "t-fps": HTMLElement;
  "t-detect": HTMLElement;
  "t-pr": HTMLElement;
  "t-z": HTMLElement;
  depthi: HTMLElement;
}

export interface Measurement {
  id: number;
  pts: [number, number, number][];
  segs: number;
  total: number;
  closed: boolean;
  perimeter: number;
  area: number;
  centroid: [number, number, number];
  normal: [number, number, number];
  angles: number[];
  minAngle: number | null;
  maxAngle: number | null;
  /** Sum of interior angles in degrees — closed loops only, else null. */
  angleSum: number | null;
  /** Pythagoras triple for open 3-point chains, else null. */
  pythag: {
    a: number;
    b: number;
    c: number;
    residual: number;
    right: boolean;
  } | null;
}

export interface SceneObjectData {
  s: ShapeName;
  c: string;
  p: [number, number, number];
  r: [number, number, number];
  /** Uniform/non-uniform mesh scale. Optional so pre-scale saves still load. */
  k?: [number, number, number];
}

export interface SceneData {
  version: 1;
  objects: SceneObjectData[];
  chains: [number, number, number][][];
}

// Audit §3.1: reject absurd coordinates (e.g. 1e300) that could cause
// Three.js matrix singularities or render stalls. 100 is far outside the
// placeable bounds (±4) but leaves headroom for file-format evolution.
const SCENE_COORD_LIMIT = 100;

function isNum3(a: unknown): a is [number, number, number] {
  return (
    Array.isArray(a) &&
    a.length === 3 &&
    a.every(
      (v) =>
        typeof v === "number" &&
        Number.isFinite(v) &&
        Math.abs(v) <= SCENE_COORD_LIMIT,
    )
  );
}

export interface EngineOpts {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  skel: HTMLCanvasElement;
  cursor2d: HTMLElement;
  toast: HTMLElement;
  hud: HudNodes;
  emit: (s: UiState) => void;
  onMath?: (m: Measurement[]) => void;
  onCamLive?: () => void;
  onFatal?: (msg: string) => void;
  /** Fired whenever the set of objects or the line geometry changes, so
   *  lesson checks can re-evaluate against the live scene. */
  onScene?: () => void;
  /** Optional factory for the worker-backed detector. When it returns a
   *  tracker, MediaPipe inference runs off the main thread; when the worker
   *  path fails at runtime the engine silently falls back to inline. */
  trackerFactory?: TrackerFactory;
}

/* ---------- module-level helpers (no DOM access at import time) ---------- */

const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15],
  [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

const dist = (
  a: NormalizedLandmark,
  b: NormalizedLandmark,
): number => Math.hypot(a.x - b.x, a.y - b.y, (a.z - b.z) * 0.6);
const D = (a: NormalizedLandmark, b: NormalizedLandmark): number =>
  Math.hypot(a.x - b.x, a.y - b.y);
function extended(
  lm: NormalizedLandmark[],
  tip: number,
  pip: number,
): boolean {
  return D(lm[tip], lm[0]) > D(lm[pip], lm[0]) * 1.15;
}

type LabelSprite = THREE.Sprite & {
  userData: { set(t: string): void; last?: string };
};

const LABEL_FONT = '600 44px ui-monospace, SFMono-Regular, Menlo, monospace';

function makeLabel(color = "#fde68a"): LabelSprite {
  const cv = document.createElement("canvas");
  cv.width = 320;
  cv.height = 112;
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  ) as LabelSprite;
  sp.scale.set(1.3, 0.46, 1);
  sp.renderOrder = 999;
  sp.userData.set = (t: string) => {
    if (sp.userData.last === t) return;
    sp.userData.last = t; // skip canvas redraws
    const g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, 320, 112);
    g.font = LABEL_FONT;
    const w = Math.min(300, Math.max(120, g.measureText(t).width + 44));
    const h = 76;
    const x = (320 - w) / 2;
    const y = (112 - h) / 2;
    const r = h / 2;
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
    g.fillStyle = "rgba(27, 26, 23, 0.88)";
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(252, 252, 249, 0.22)";
    g.stroke();
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(t, 160, 57);
    tex.needsUpdate = true;
  };
  return sp;
}

function disposeGroup(gr: THREE.Group): void {
  const dead: THREE.Object3D[] = [];
  gr.traverse((o) => {
    if (o.userData.shared || o === gr) return;
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      const mats = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      mats.forEach((m) => {
        const mm = m as THREE.SpriteMaterial;
        if (mm.map) mm.map.dispose();
        m.dispose();
      });
    }
    dead.push(o);
  });
  dead.forEach((o) => gr.remove(o));
}

interface Polyline {
  pts: THREE.Vector3[];
  group: THREE.Group;
  segs: THREE.Mesh[];
  handles: THREE.Mesh[];
  lenLabels: LabelSprite[];
  angLabels: { sp: LabelSprite; i: number }[];
  labels: LabelSprite[];
  sumLabel: LabelSprite | null;
}

/* Closed-loop threshold: first/last points within this distance count as closed. */
const CLOSE_R = 0.35;

/* 3D polygon area via Newell's method — works for non-axis-aligned loops. */
function newellArea(pts: THREE.Vector3[]): { area: number; normal: THREE.Vector3 } {
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    n.x += (p.y - q.y) * (p.z + q.z);
    n.y += (p.z - q.z) * (p.x + q.x);
    n.z += (p.x - q.x) * (p.y + q.y);
  }
  return { area: n.length() / 2, normal: n.normalize() };
}

function polyTotal(pts: THREE.Vector3[], closed: boolean): number {
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) L += pts[i].distanceTo(pts[i + 1]);
  if (closed && pts.length > 2) L += pts[pts.length - 1].distanceTo(pts[0]);
  return L;
}

function centroidOf(pts: THREE.Vector3[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  pts.forEach((p) => c.add(p));
  if (pts.length) c.divideScalar(pts.length);
  return c;
}

interface GrabbedHandle {
  L: Polyline;
  idx: number;
}

interface SnapTarget {
  pos: THREE.Vector3;
  L: Polyline;
  idx: number;
  // vertex snap => segIndex null; mid-segment snap => segment start index
  segIndex: number | null;
}

interface Anchor {
  hx: number;
  hy: number;
  hs: number;
  base: THREE.Vector3;
}

// MODEL_URL/WASM_URL and their supply-chain notes live in lib/handAssets.ts.
// createLandmarker + withTimeout moved to lib/landmarker.ts so the detector
// worker can share them without importing three.js.

/**
 * Reduce a full scene to the minimal shape lesson checks need.
 *
 * `exportScene` builds a hex color string plus 6 numbers per object because
 * it round-trips through save/load. Lesson checks only read the shape name
 * and chain coordinates, so this drops roughly 200 allocations per sync for
 * a 30-object scene. Pure function, so it is testable without a WebGL
 * context — see lib/checksnap.test.ts.
 */
export function toCheckSnap(
  scene: SceneData,
  quizAnswers: Record<string, number> = {},
): SceneSnap {
  return {
    objects: scene.objects.map(({ s }) => ({ s })),
    chains: scene.chains,
    quizAnswers,
  };
}

/**
 * Unpack a worker landmark buffer (21 x,y,z triplets) back into the
 * NormalizedLandmark shape the gesture math (drive) and skeleton preview
 * read. Fresh objects per result: gesture code holds no references across
 * frames, but the deferred skeleton draw does — a shared pool would tear.
 */
export function unpackLandmarks(pts: Float32Array): NormalizedLandmark[] {
  const n = Math.min(21, Math.floor(pts.length / 3));
  const out: NormalizedLandmark[] = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = { x: pts[i * 3], y: pts[i * 3 + 1], z: pts[i * 3 + 2], visibility: 1 };
  }
  return out;
}

/* ================= the engine ================= */

export class HandLabEngine {
  private opts: EngineOpts;

  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private grid: THREE.GridHelper;
  private clock = new THREE.Clock();
  private hemi: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private boundsMat: THREE.LineBasicMaterial;
  private floorMat: THREE.ShadowMaterial;
  private cursorRest = SCENE_THEMES.light.cursor;
  private cursorPinch = 0x2E7D46;
  private cursorLine = 0xB26A00;
  private themeOff: (() => void) | null = null;
  private motionOff: (() => void) | null = null;

  private cursor = new THREE.Group();
  private core: THREE.Mesh;
  private ring: THREE.Mesh;
  private zAxis: THREE.Mesh;
  private glow: THREE.PointLight;
  private dropLine: THREE.Line;
  private hoverRing: THREE.Mesh;
  private selectRing: THREE.Mesh;

  private target = new THREE.Vector3(0, 0, 0);
  private pinchHeld = false;
  private hovered: THREE.Mesh | null = null;
  private grabbed: THREE.Mesh | null = null;
  private selected: THREE.Mesh | null = null;
  private grabOffset = new THREE.Vector3();
  private shadowsDirty = true;

  // scratch temps: never allocate per-frame vectors in hot paths
  private _v1 = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _v3 = new THREE.Vector3();
  private _camR = new THREE.Vector3();
  private _camU = new THREE.Vector3();
  private _camF = new THREE.Vector3();
  private _sd = new THREE.Vector3();
  private _aa = new THREE.Vector3();
  private _ab = new THREE.Vector3();
  private rulerA = new THREE.Vector3(); // ruler: first hand's plane intersection
  private UP_Y = new THREE.Vector3(0, 1, 0);

  private spawnables: THREE.Mesh[] = [];
  private shape: ShapeName = "cube";
  private color = "#2563eb";
  /** Scale applied to newly placed meshes (driven by the solid-math panel
   *  sliders). Stored as ratios so defaults keep the exact legacy sizes. */
  private spawnScale: [number, number, number] = [1, 1, 1];
  /** Studio inspection state (pushed from the solid-math panel). */
  private wireframe = false;
  private matMode: StudioMaterial = "standard";
  private detail = 1;
  private clipAxis: ClipAxis = null;
  private clipPos = 0;
  private clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  private clipHelper: THREE.Mesh | null = null;
  private geoCache: Partial<Record<ShapeName, THREE.BufferGeometry>> = {};
  private matCache: Record<string, THREE.MeshStandardMaterial> = {};
  private hrCache: Partial<Record<ShapeName, number>> = {};

  // pinch gesture state
  private pinchStartT = 0;
  private pinchStartPos = new THREE.Vector3();
  private pinchMoved = false;
  private uiDownEl: Element | null = null;

  // two-hand pinch-scale: both hands pinched -> spread/shrink to scale shape
  private pinchState2 = false;
  private twoHandScaling = false;
  private scaleTarget: THREE.Mesh | null = null;
  private scaleStart = new THREE.Vector3(1, 1, 1);
  private pinchDist0 = 0;
  private pinchDistSmooth = 0;
  private scaleFactor = 1;

  // two-hand pinch ruler (line-drawer chip): while armed, the both-hands
  // spread measures instead of scaling — each pinch midpoint is projected
  // onto the camera plane through the cursor target and the distance floats
  // as a label; a calibrated real hand span converts readouts to local cm.
  private rulerOn = false;
  private rulerLabel: LabelSprite | null = null;
  private rulerGroup = new THREE.Group();
  private rulerCalibrating = false;
  private rulerSpanCm = 0;
  private rulerCmPerMeter: number | null = null;
  private rulerSpanMeters = 0;

  // chain label variants (line-drawer chips): Σ-angle-sum on closed loops /
  // a²+b²−c² residual on open 3-point chains. OFF = existing text unchanged.
  private angleSumLabels = false;
  private pythagLabels = false;

  // lines + measurement
  private lineMode = false;
  private snapOn = true;
  private activeLine: Polyline | null = null;
  private grabbedHandle: GrabbedHandle | null = null;
  private handleOffset = new THREE.Vector3();
  private polylines: Polyline[] = [];
  private junctionGroup = new THREE.Group();
  /* ---------- ghost scene overlay (hint ladder / target diff) ----------
   * A separate group rendered on top of the workspace: translucent target
   * objects + chain outlines the student can match. Contents never enter
   * spawnables/polylines, so picking (nearestTo scans spawnables only),
   * measurement, exportScene and exportCheckSnap are untouched for free. */
  private ghostGroup = new THREE.Group();
  private ghostObjectMat = new THREE.MeshStandardMaterial({
    color: 0x7c86a0,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    roughness: 0.7,
    metalness: 0,
  });
  private ghostLineMat = new THREE.LineBasicMaterial({
    color: 0x7c86a0,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  /** Per-chain buffer geometries created for ghost lines — disposed on clear. */
  private ghostGeos: THREE.BufferGeometry[] = [];

  private snapMarker: THREE.Mesh;
  private previewLine: THREE.Line;
  private SEG_GEO = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
  private SEG_MAT = new THREE.MeshStandardMaterial({
    color: 0xffc94d,
    roughness: 0.4,
    metalness: 0.15,
    emissive: 0x2a1c00,
  });
  private HANDLE_GEO = new THREE.SphereGeometry(0.09, 16, 16);
  private HANDLE_MAT = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    emissive: 0x555555,
  });
  private SNAP_R = 0.55;

  // mouse fallback
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private camPlane = new THREE.Plane();
  private LIM_MIN = new THREE.Vector3(-4.2, -2.6, -4);
  private LIM_MAX = new THREE.Vector3(4.2, 2.6, 4);
  private PLACE_MIN = new THREE.Vector3(-4, -2.5, -3.9);
  private PLACE_MAX = new THREE.Vector3(4, 2.5, 3.9);
  private mouseDown = false;
  /** Shift held at press time — Shift+click places a shape even in line mode. */
  private shiftAtDown = false;

  // hand tracking
  private handActive = false;
  private landmarker: HandLandmarker | null = null;
  // Worker-backed detector when available (see lib/handTracker.ts): at most
  // one bitmap is in flight, so a slow worker backpressures naturally.
  private tracker: HandTracker | null = null;
  private trackerFactory: TrackerFactory | null = null;
  private trackerUsedCpu = false;
  private bmpInFlight = false;
  private stream: MediaStream | null = null;
  private anchor: Anchor | null = null;
  private lastVideoT = -1;
  private lastDetectAt = -Infinity;
  private skelRaf = 0;
  private lastHands: NormalizedLandmark[][] = [];
  private lastSkelHash = 0;
  private skelW = 248;
  private skelH = 140;
  private skelRo: ResizeObserver | null = null;
  private lastCur2dVis = false;
  private lastHandOn: boolean | null = null;
  private lastHandCount = -1;
  private lastCursorHex = -1;
  private lastDropX = NaN;
  private lastDropY = NaN;
  private lastDropZ = NaN;
  private landmarkerUsedCpu = false;
  private onVisibility: (() => void) | null = null;
  private wasHidden = false;
  /** OS reduced-motion: skip decorative loop motion, snap the cursor. */
  private reducedMotion = prefersReducedMotion();
  private pinchState = false;
  private smoothZ = 0;
  private fistSince = 0;
  private sctx: CanvasRenderingContext2D | null;
  // tracking filters: EMA tip + size, hysteresis counters
  private fTipX = 0;
  private fTipY = 0;
  private fSize = 0;
  private filtInit = false;
  private lostFrames = 0;
  private fistFrames = 0;
  private mathTick = 0;
  // webcam lifecycle guards: single detect loop, stale-request protection
  private camStarting = false;
  private camRequest = 0;
  private camLive = false;
  private loopStarted = false;

  // depth providers: palm-size baseline (always) + Depth Anything V2 (opt-in)
  private palm = new PalmDepthProvider();
  private mono = new DepthAnythingV2Provider();
  private depthOn = false;
  private depthStatus = "depth AI off — enable with 'depth v2' for neural depth";

  // frame / HUD
  private hudCache: Record<string, string> = {};
  private hudTick = 0;
  // Hover + snap scans walk every object/vertex. At 60fps that is a full
  // scene traversal per frame for a ring that humans read at ~20Hz, so
  // recompute every 3rd frame and reuse the cached result in between.
  private hoverTick = 0;
  private cachedSnap: SnapTarget | null = null;
  private lastCur2dBorder = "";
  private prNow: number;
  private PR_MAX: number;
  private emaDt = 16;
  private prTick = 0;
  private isIPad = false;
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private frames = 0;
  private fT = 0;
  // 1s-window detect-cost accumulator for the HUD (perf.detect keeps the
  // full distribution; this only feeds the "t-detect" readout).
  private detectAccum = 0;
  private detectN = 0;

  /**
   * Consume a packed detection from the worker. Runs on the main thread but
   * never during inference: by the time results arrive, the frame that paid
   * for the model has long been rendered.
   */
  private onTrackerResult = (r: TrackerResult): void => {
    this.bmpInFlight = false;
    if (this.disposed) return;
    perf.detect.push(r.detectMs, performance.now());
    this.detectAccum += r.detectMs;
    this.detectN++;
    const hands = r.hands.map((h) => unpackLandmarks(h.pts));
    const handednesses = r.hands.map((h) => [{ categoryName: h.handed }]);
    this.processHands(hands, handednesses);
  };

  private onTrackerError = (): void => {
    this.bmpInFlight = false;
  };

  private tickRaf = 0;
  private handRaf = 0;
  private disposed = false;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    this.trackerFactory = opts.trackerFactory ?? null;
    // iPadOS thermally throttles with camera + WebGL + WASM together, so
    // start cheaper there (no AA, 1024 shadows). Pixel ratio is capped at
    // 1.5x everywhere (PR_MAX_CAP); See lib/caps.ts — iPad is the only
    // remaining visual-downgrade exception.
    const ipad = isIPadOS();
    this.isIPad = ipad;
    const dpr = window.devicePixelRatio || 1;
    this.prNow = Math.min(dpr, PR_MAX_CAP);
    this.PR_MAX = Math.min(dpr, PR_MAX_CAP);
    if (ipad) {
      this.depthOn = false;
      this.depthStatus = "off — tap depth v2 to enable (iPad saves ~50MB)";
    }

    /* ---------- renderer / scene ---------- */
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: opts.canvas,
        antialias: !ipad,
      });
    } catch {
      // second chance: minimal context (no AA) for locked-down GPUs
      try {
        this.renderer = new THREE.WebGLRenderer({
          canvas: opts.canvas,
          antialias: false,
          stencil: false,
          depth: true,
        });
      } catch (err) {
        throw new Error(
          "WebGL is unavailable in this browser (context creation failed) — HANDLAB needs GPU canvas access.",
          { cause: err },
        );
      }
    }
    this.renderer.setPixelRatio(this.prNow);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap was removed in three r186 and is silently coerced to
    // PCFShadowMap; naming the type we actually get keeps the console clean and
    // stops this line reading as a soft-shadow setting it no longer is.
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // static scene: re-render shadows only when something moves
    this.renderer.localClippingEnabled = true; // studio slicing planes

    const initTheme = sceneThemeNow();
    this.scene.background = new THREE.Color(initTheme.bg);
    this.scene.fog = new THREE.Fog(initTheme.bg, 14, 30);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 2.2, 8.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.maxDistance = 16;
    this.controls.minDistance = 3;

    this.hemi = new THREE.HemisphereLight(initTheme.hemiSky, initTheme.hemiGround, 0.9);
    this.scene.add(this.hemi);
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    this.rimLight = new THREE.DirectionalLight(initTheme.rim, initTheme.rimIntensity);
    this.rimLight.position.set(-5, 3, -4);
    this.scene.add(this.rimLight);

    this.grid = new THREE.GridHelper(14, 28, initTheme.gridCenter, initTheme.gridMain);
    this.scene.add(this.grid);
    this.floorMat = new THREE.ShadowMaterial({ opacity: initTheme.floorOpacity });
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      this.floorMat,
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.6;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.boundsMat = new THREE.LineBasicMaterial({ color: initTheme.bounds });
    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(8.4, 5.4, 8)),
      this.boundsMat,
    );
    this.scene.add(bounds);

    /* ---------- floating cursor (the 3-axis pointer) ---------- */
    // Seed cursor meshes from the effective scheme so first paint is
    // correct even before applySceneTheme runs below.
    const seedAccent = sceneThemeNow().cursor;
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 24),
      new THREE.MeshBasicMaterial({ color: seedAccent }),
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.018, 12, 40),
      new THREE.MeshBasicMaterial({
        color: seedAccent,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.zAxis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 8),
      new THREE.MeshBasicMaterial({
        color: seedAccent,
        transparent: true,
        opacity: 0.45,
      }),
    );
    this.zAxis.rotation.x = Math.PI / 2;
    this.glow = new THREE.PointLight(seedAccent, 12, 6);
    this.glow.position.set(0, 0.2, 0);
    this.dropLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineDashedMaterial({
        color: seedAccent,
        dashSize: 0.12,
        gapSize: 0.08,
        transparent: true,
        opacity: 0.5,
      }),
    );
    this.dropLine.computeLineDistances();
    this.cursor.add(this.core, this.ring, this.zAxis, this.glow, this.dropLine);
    this.cursor.position.set(0, 0, 0);
    this.scene.add(this.cursor);

    // Runs after cursor meshes exist so accent re-skin covers zAxis/dropLine.
    this.applySceneTheme(currentTheme());
    this.themeOff = onThemeChange((t) => this.applySceneTheme(t));
    this.motionOff = onReducedMotionChange((reduced) => {
      this.reducedMotion = reduced;
      if (reduced && this.controls.autoRotate) {
        this.controls.autoRotate = false;
        this.emit();
      }
    });

    /* ---------- hover + selection rings ---------- */
    this.hoverRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.025, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0xB26A00,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    );
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 998;
    this.scene.add(this.hoverRing);

    this.selectRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.03, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0xff5d7a,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      }),
    );
    this.selectRing.visible = false;
    this.selectRing.renderOrder = 997;
    this.scene.add(this.selectRing);

    /* ---------- lines infra ---------- */
    this.scene.add(this.junctionGroup);
    this.scene.add(this.ghostGroup);
    // two-hand ruler label park — same group lifecycle as junctionGroup
    this.scene.add(this.rulerGroup);
    this.snapMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.03, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0x2E7D46 }),
    );
    this.snapMarker.visible = false;
    this.scene.add(this.snapMarker);
    this.previewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineDashedMaterial({
        color: 0xB26A00,
        dashSize: 0.12,
        gapSize: 0.08,
      }),
    );
    this.previewLine.visible = false;
    this.scene.add(this.previewLine);

    /* ---------- listeners ---------- */
    window.addEventListener("pointermove", this.onPointerMove);
    // Zoom disabled: camera stays fixed — no wheel listener.
    opts.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);
    // iPad Safari toolbar show/hide + rotation don't always fire resize —
    // visualViewport does. orientationchange covers older iPads.
    window.visualViewport?.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    opts.canvas.addEventListener("webglcontextlost", this.onCtxLost);

    this.sctx = opts.skel.getContext("2d");
    this.skelW = opts.skel.clientWidth || 248;
    this.skelH = opts.skel.clientHeight || 140;
    if (typeof ResizeObserver !== "undefined") {
      this.skelRo = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr && cr.width > 0 && cr.height > 0) {
          this.skelW = cr.width;
          this.skelH = cr.height;
        }
      });
      this.skelRo.observe(opts.skel);
    }

    /* ---------- start with an empty scene — user places shapes ---------- */

    // Debug handle (console: __lab.polylines / __lab.target / __lab.cursor).
    // Object-literal getters can't capture lexical `this`, so the getter is
    // defined with an arrow closure instead of a `const self = this` alias.
    const lab = {} as Record<string, unknown>;
    Object.defineProperty(lab, "polylines", {
      get: () => this.getMeasurements(),
      enumerable: true,
    });
    lab.target = this.target;
    lab.cursor = this.cursor;
    (window as unknown as Record<string, unknown>).__lab = lab;

    this.fT = performance.now();
    this.tick();
  }

  /* ---------- Depth Anything V2 (opt-in monocular depth) ---------- */

  private depthListenerAttached = false;

  private attachDepthListener(): void {
    if (this.depthListenerAttached) return;
    this.depthListenerAttached = true;
    this.mono.setStatusListener((s, detail) => {
      if (this.disposed) return;
      this.depthStatus =
        s === "live"
          ? `live${this.mono.fps > 0 ? ` · ${this.mono.fps.toFixed(1)}fps` : ""}`
          : s === "loading"
            ? detail || "loading…"
            : s === "error"
              ? `error — ${detail}`
              : "off";
      if (s === "live") this.toast("depth AI live — push hand in/out");
      else if (s === "error") this.toast("depth AI failed: " + detail);
      this.emit();
    });
  }

  /** Toggle the Depth Anything V2 monocular provider. Safe before webcam. */
  async setDepthEnabled(on: boolean): Promise<void> {
    this.attachDepthListener();
    this.depthOn = on;
    if (!on) {
      this.mono.stop();
      this.depthStatus = "off";
      this.emit();
      return;
    }
    const video = this.opts.video;
    if (this.camLive && video.readyState >= 2) {
      this.depthStatus = "loading depth model…";
      this.emit();
      await this.mono.start(video);
    } else {
      this.depthStatus = "waiting for camera — enable webcam first";
      this.emit();
      this.toast("depth AI armed — enable webcam to start it");
    }
  }

  private onCtxLost = (e: Event): void => {
    // preventDefault leaves restore possible, but three.js can't safely
    // resume mid-session — route to the fatal screen (Retry = fresh context)
    e.preventDefault();
    this.opts.onFatal?.(
      "The GPU (WebGL) context was lost — press Retry below to reload with a fresh context.",
    );
  };

  /** Re-skin scene chrome for the current UI theme + colour scheme.
   *  Placed objects are user data and keep their colors; only background,
   *  grid, lights, and the rest-state cursor follow the toggle. The
   *  per-frame tick picks up `cursorRest`, so state tints (pinch/line) keep
   *  working. `onThemeChange` also fires on scheme flips, so this stays in
   *  sync when the user picks a scheme at will. */
  private applySceneTheme(name: ThemeName): void {
    const p = sceneThemeFor(name, currentScheme(), currentCustomHex());
    (this.scene.background as THREE.Color).setHex(p.bg);
    (this.scene.fog as THREE.Fog).color.setHex(p.bg);
    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.rimLight.color.setHex(p.rim);
    this.rimLight.intensity = p.rimIntensity;
    this.boundsMat.color.setHex(p.bounds);
    this.floorMat.opacity = p.floorOpacity;
    this.scene.remove(this.grid);
    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.grid = new THREE.GridHelper(14, 28, p.gridCenter, p.gridMain);
    this.scene.add(this.grid);
    this.cursorRest = p.cursor;
    // applySceneTheme runs once before the cursor meshes exist — guard it.
    if (this.zAxis)
      (this.zAxis.material as THREE.MeshBasicMaterial).color.setHex(p.cursor);
    if (this.dropLine)
      (this.dropLine.material as THREE.LineBasicMaterial).color.setHex(p.cursor);
    // state tints stay readable on both canvases: deep pair on cream, bright pair on near-black
    const dark = name === "dark";
    this.cursorPinch = dark ? 0x3ddc84 : 0x2e7d46;
    this.cursorLine = dark ? 0xffb224 : 0xb26a00;
  }

  dispose(): void {
    this.disposed = true;
    this.themeOff?.();
    this.themeOff = null;
    this.motionOff?.();
    this.motionOff = null;
    this.camRequest++; // invalidate any in-flight enableWebcam()
    if (this.onVisibility) {
      document.removeEventListener("visibilitychange", this.onVisibility);
      this.onVisibility = null;
    }
    cancelAnimationFrame(this.tickRaf);
    cancelAnimationFrame(this.handRaf);
    cancelAnimationFrame(this.skelRaf);
    this.skelRo?.disconnect();
    this.skelRo = null;
    window.removeEventListener("pointermove", this.onPointerMove);
    // No wheel listener (zoom disabled) — nothing to remove.
    this.opts.canvas.removeEventListener(
      "pointerdown",
      this.onCanvasPointerDown,
    );
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    window.visualViewport?.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    this.opts.canvas.removeEventListener("webglcontextlost", this.onCtxLost);
    if (this.toastT) clearTimeout(this.toastT);
    this.landmarker?.close();
    this.landmarker = null;
    this.tracker?.dispose();
    this.tracker = null;
    this.mono.stop();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.opts.video.srcObject) this.opts.video.srcObject = null;
    delete (window as unknown as Record<string, unknown>).__lab;
    // Lines / junctions own label sprites + CanvasTextures — dispose those,
    // but shared SEG/HANDLE meshes are flagged userData.shared and skipped.
    for (const L of this.polylines) {
      this.scene.remove(L.group);
      disposeGroup(L.group);
    }
    this.polylines.length = 0;
    this.activeLine = null;
    disposeGroup(this.junctionGroup);
    this.scene.remove(this.junctionGroup);
    disposeGroup(this.rulerGroup);
    this.scene.remove(this.rulerGroup);
    this.rulerLabel = null;
    this.clearGhostMeshes();
    this.ghostObjectMat.dispose();
    this.ghostLineMat.dispose();
    const disposeObj = (o: THREE.Object3D): void => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat) {
        const sm = mat as THREE.SpriteMaterial;
        if (sm.map) sm.map.dispose();
        mat.dispose();
      }
      this.scene.remove(o);
    };
    disposeObj(this.previewLine);
    disposeObj(this.snapMarker);
    disposeObj(this.hoverRing);
    disposeObj(this.selectRing);
    this.cursor.traverse((o) => {
      if (o === this.cursor) return;
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const mat = mesh.material as THREE.Material | undefined;
      mat?.dispose?.();
    });
    this.scene.remove(this.cursor);
    // Floor / bounds geometries were never disposed (only materials).
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (
        mesh.geometry &&
        (mesh.geometry.type === "PlaneGeometry" ||
          mesh.geometry.type === "EdgesGeometry" ||
          mesh.geometry.type === "BoxGeometry")
      ) {
        // Floor + bounds live directly on the scene (not in caches).
        if (o.parent === this.scene) mesh.geometry.dispose();
      }
    });
    Object.values(this.geoCache).forEach((g) => g?.dispose());
    Object.values(this.matCache).forEach((m) => m.dispose());
    this.geoCache = {};
    this.matCache = {};
    for (const m of this.spawnables) this.scene.remove(m);
    this.spawnables.length = 0;
    this.SEG_GEO.dispose();
    this.SEG_MAT.dispose();
    this.HANDLE_GEO.dispose();
    this.HANDLE_MAT.dispose();
    this.floorMat.dispose();
    this.boundsMat.dispose();
    if (this.clipHelper) {
      this.clipHelper.geometry.dispose();
      (this.clipHelper.material as THREE.Material).dispose();
      this.clipHelper = null;
    }    this.grid.geometry.dispose();
    (this.grid.material as THREE.Material).dispose();
    this.controls.dispose();
    this.renderer.dispose();
  }

  /* ================= public UI API (called from React) ================= */

  setShape(s: ShapeName): void {
    this.shape = s;
    this.emit();
  }

  setColor(c: string): void {
    this.color = c;
    this.emit();
  }

  /** Scale for newly placed meshes. Clamped so sliders can't collapse or
   *  blow up the scene. Existing meshes keep their scale. */
  setSpawnScale(x: number, y: number, z: number): void {
    const cl = (v: number): number =>
      Number.isFinite(v) ? Math.min(4, Math.max(0.2, v)) : 1;
    this.spawnScale = [cl(x), cl(y), cl(z)];
  }

  /** Place the current shape at the scene centre — the hero solid that
   *  gives first paint a finished look. */
  placeCenter(): void {
    this.setSelected(this.placeAt(new THREE.Vector3(0, 0.2, 0)));
  }

  /** Place the current shape at the live cursor — works in any mode,
   *  including line mode, so solids stay creatable while drawing chains. */
  placeCurrentShape(): void {
    this.setSelected(this.placeAt(this.cursor.position));
    this.toast("placed " + this.shape);
    this.emitMath();
  }

  /** Dolly the camera along its current orbit direction (showcase framing).
   *  OrbitControls limits (3–16) still apply. */
  setCameraDistance(d: number): void {
    const dist = Math.min(16, Math.max(3, Number.isFinite(d) ? d : 8.5));
    this._v1.copy(this.camera.position).sub(this.controls.target);
    if (this._v1.lengthSq() < 1e-6) this._v1.set(0, 0.3, 1);
    this._v1.setLength(dist);
    this.camera.position.copy(this.controls.target).add(this._v1);
  }

  setLineMode(on: boolean): void {
    this.lineMode = on;
    if (!on) {
      this.activeLine = null;
      this.previewLine.visible = false;
      this.snapMarker.visible = false;
    } else {
      this.toast("line mode — tap to drop points, tap last point to finish");
    }
    this.emit();
  }

  toggleSnap(): void {
    this.snapOn = !this.snapOn;
    this.emit();
  }

  /** Line-drawer chip toggles for the Σ-angle-sum / Pythagoras label variants. */
  setChainMathMode(kind: "angleSum" | "pythag", on: boolean): void {
    if (kind === "angleSum") this.angleSumLabels = on;
    else this.pythagLabels = on;
    this.updateLineLabelsAll();
  }

  /** Line-drawer ruler chip: while ON, the both-hands spread measures (the
   *  ruler owns that gesture; scale may not arm under it). Returns the new
   *  state so the chip reflects reality even if the engine re-arms around it. */
  toggleRuler(): boolean {
    this.rulerOn = !this.rulerOn;
    if (this.rulerOn && this.twoHandScaling) this.endTwoHandScale(true);
    if (this.rulerOn) {
      // A span set before arming must still calibrate on the next pinch.
      this.rulerCalibrating = this.rulerSpanCm > 0;
    } else {
      this.rulerCalibrating = false;
      if (this.rulerLabel) this.rulerLabel.visible = false;
    }
    return this.rulerOn;
  }

  /** Student enters their real hand span (cm) — next both-hands pinch arms
   *  the conversion factor from that sample's projected metres. */
  setRulerSpanCm(cm: number): void {
    this.rulerSpanCm = cm;
    this.rulerCalibrating = cm > 0 && this.rulerOn;
  }

  private updateLineLabelsAll(): void {
    this.polylines.forEach((L) => this.updateLine(L));
  }

  clearLines(): void {
    this.polylines.forEach((L) => {
      this.scene.remove(L.group);
      disposeGroup(L.group);
    });
    this.polylines.length = 0;
    this.activeLine = null;
    this.rebuildJunctions();
    this.shadowsDirty = true;
    this.toast("lines cleared");
    this.emitMath();
  }

  undo(): void {
    const m = this.spawnables.pop();
    if (m) {
      this.scene.remove(m);
      if (m === this.selected) this.setSelected(null);
      this.shadowsDirty = true;
    }
    this.setCount();
  }

  clearAll(): void {
    [...this.spawnables].forEach((m) => this.scene.remove(m));
    this.spawnables.length = 0;
    this.setSelected(null);
    this.shadowsDirty = true;
    this.setCount();
  }

  recenter(): void {
    this.anchor = null;
    this.smoothZ = 0;
    this.palm.reset();
    this.mono.resetAnchor();
    this.toast("recentered — hold hand still, move from here");
  }

  /* ---------- scene persistence + export ---------- */

  private shapeOf(m: THREE.Mesh): ShapeName {
    const cached = m.userData.shape as ShapeName | undefined;
    if (cached && SHAPES.includes(cached)) return cached;
    for (const s of SHAPES) if (this.geoFor(s) === m.geometry) return s;
    return "cube";
  }

  /**
   * Direct check-only snapshot from the live scene graph.
   *
   * `exportScene()` + `toCheckSnap()` pays for a hex color string plus
   * position/rotation arrays per object and then throws them away — the checks
   * only read the shape name and chain coordinates. This reads the shape
   * (O(1) via userData, set in placeAt) and chain points directly, so a
   * 10Hz scene sync never touches getHexString or builds SceneData.
   */
  exportCheckSnap(
    quizAnswers: Record<string, number> = {},
  ): SceneSnap {
    return {
      // Fast path first: placeAt caches the shape in userData, so the common
      // case never even calls shapeOf (which falls back to a geometry scan
      // for meshes that predate the cache).
      objects: this.spawnables.map((m) => {
        const cached = m.userData.shape as ShapeName | undefined;
        return {
          s: cached && SHAPES.includes(cached) ? cached : this.shapeOf(m),
        };
      }),
      chains: this.polylines.map((L) =>
        L.pts.map((p) => [p.x, p.y, p.z] as [number, number, number]),
      ),
      quizAnswers,
    };
  }

  exportScene(): SceneData {
    return {
      version: 1,
      objects: this.spawnables.map((m) => ({
        s: this.shapeOf(m),
        c: `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`,
        p: [m.position.x, m.position.y, m.position.z],
        r: [m.rotation.x, m.rotation.y, m.rotation.z],
        k: [m.scale.x, m.scale.y, m.scale.z],
      })),
      chains: this.polylines.map((L) =>
        L.pts.map((p) => [p.x, p.y, p.z] as [number, number, number]),
      ),
    };
  }

  importScene(data: SceneData): boolean {
    const bad = (): boolean => {
      this.toast("scene data invalid — nothing loaded");
      return false;
    };
    if (!data || data.version !== 1) return bad();
    if (
      !Array.isArray(data.objects) ||
      !Array.isArray(data.chains) ||
      data.objects.length > 500 ||
      data.chains.length > 100
    )
      return bad();
    for (const o of data.objects) {
      if (
        !o ||
        !SHAPES.includes(o.s) ||
        typeof o.c !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(o.c) ||
        !isNum3(o.p) ||
        !isNum3(o.r) ||
        (o.k !== undefined &&
          !(Array.isArray(o.k) && o.k.length === 3 && o.k.every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= SCENE_COORD_LIMIT)))
      )
        return bad();
    }
    for (const ch of data.chains) {
      if (!Array.isArray(ch) || ch.length > 200 || !ch.every(isNum3))
        return bad();
    }
    this.clearAll();
    this.clearLines();
    this.spawnScale = [1, 1, 1];
    for (const o of data.objects) {
      this.placeAt(
        new THREE.Vector3(o.p[0], o.p[1], o.p[2]),
        o.s,
        o.c,
        o.r,
        o.k,
      );
    }
    for (const ch of data.chains) {
      if (ch.length === 0) continue;
      const L = this.newLine(new THREE.Vector3(ch[0][0], ch[0][1], ch[0][2]));
      for (let i = 1; i < ch.length; i++)
        L.pts.push(new THREE.Vector3(ch[i][0], ch[i][1], ch[i][2]));
      this.buildLineStructure(L);
    }
    this.activeLine = null;
    this.rebuildJunctions();
    this.emitMath();
    this.toast(
      `scene loaded — ${data.objects.length} objects, ${data.chains.length} chains`,
    );
    return true;
  }

  importSceneJson(text: string): boolean {
    try {
      return this.importScene(JSON.parse(text) as SceneData);
    } catch {
      this.toast("scene file is not valid JSON");
      return false;
    }
  }

  /* ---------- ghost scene overlay ---------- */

  /**
   * Render a target scene (same JSON format as scene export) as a
   * translucent overlay. Unlike importScene, nothing in the live scene is
   * touched: ghost meshes live in their own group, never enter
   * spawnables/polylines, and are therefore invisible to picking,
   * measurement, lesson checks, and scene export by construction.
   * Returns false (with a toast) on invalid JSON or an unknown shape.
   */
  setGhostScene(text: string): boolean {
    let data: SceneData;
    try {
      data = JSON.parse(text) as SceneData;
    } catch {
      this.toast("ghost scene is not valid JSON");
      return false;
    }
    const bad = (): boolean => {
      this.toast("ghost scene data invalid");
      return false;
    };
    if (!data || data.version !== 1) return bad();
    if (
      !Array.isArray(data.objects) ||
      !Array.isArray(data.chains) ||
      data.objects.length > 500 ||
      data.chains.length > 100
    )
      return bad();
    for (const o of data.objects) {
      if (
        !o ||
        !SHAPES.includes(o.s) ||
        typeof o.c !== "string" ||
        !isNum3(o.p) ||
        !isNum3(o.r)
      )
        return bad();
    }
    for (const ch of data.chains) {
      if (!Array.isArray(ch) || ch.length > 200 || !ch.every(isNum3))
        return bad();
    }
    this.clearGhostMeshes();
    for (const o of data.objects) {
      const m = new THREE.Mesh(this.geoFor(o.s), this.ghostObjectMat);
      m.position.set(o.p[0], o.p[1], o.p[2]);
      m.rotation.set(o.r[0], o.r[1], o.r[2]);
      if (o.k) m.scale.set(o.k[0], o.k[1], o.k[2]);
      m.renderOrder = 5;
      this.ghostGroup.add(m);
    }
    for (const ch of data.chains) {
      if (ch.length < 2) continue;
      const geo = new THREE.BufferGeometry().setFromPoints(
        ch.map((p) => new THREE.Vector3(p[0], p[1], p[2])),
      );
      this.ghostGeos.push(geo);
      const line = new THREE.Line(geo, this.ghostLineMat);
      line.renderOrder = 6;
      this.ghostGroup.add(line);
    }
    this.toast(
      `ghost loaded — ${data.objects.length} objects, ${data.chains.length} chains`,
    );
    return true;
  }

  clearGhost(): void {
    this.clearGhostMeshes();
  }

  private clearGhostMeshes(): void {
    this.ghostGroup.clear();
    for (const geo of this.ghostGeos) geo.dispose();
    this.ghostGeos.length = 0;
  }

  private static STORE_KEY = "handlab.scene.v1";

  saveToStorage(): void {
    try {
      localStorage.setItem(
        HandLabEngine.STORE_KEY,
        JSON.stringify(this.exportScene()),
      );
      this.toast("scene saved in this browser");
    } catch {
      this.toast("scene save failed (storage full?)");
    }
  }

  loadFromStorage(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(HandLabEngine.STORE_KEY);
    } catch {
      this.toast("saved scene unreadable");
      return;
    }
    if (!raw) {
      this.toast("no saved scene yet");
      return;
    }
    this.importSceneJson(raw);
  }

  exportPNG(): string | null {
    try {
      // render synchronously first so capture works without preserveDrawingBuffer
      this.renderer.render(this.scene, this.camera);
      const url = this.renderer.domElement.toDataURL("image/png");
      this.toast("photo captured");
      return url;
    } catch {
      this.toast("photo capture failed");
      return null;
    }
  }

  toggleSpin(): void {
    this.controls.autoRotate = !this.controls.autoRotate;
    this.emit();
  }

  toggleGrid(): void {
    this.grid.visible = !this.grid.visible;
    this.emit();
  }

  async enableWebcam(): Promise<void> {
    if (this.camStarting) return;
    this.camStarting = true;
    const req = ++this.camRequest;
    const stale = (): boolean => req !== this.camRequest;
    this.emitCam("loading");
    try {
      // Start webcam permission/hardware warm-up in parallel with MediaPipe WASM/model load.
      const maxFps = this.isIPad ? 24 : 30;
      const idealFps = this.isIPad ? 20 : 30;
      const streamPromise = withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            facingMode: "user",
            frameRate: { ideal: idealFps, max: maxFps },
          },
        }),
        30000,
        "camera",
      );
      // Preferred path: the detector worker owns MediaPipe entirely, so
      // inference never blocks the render loop. Created synchronously here so
      // the model promise below can race it against the camera warm-up; any
      // failure degrades silently to the inline main-thread path.
      const nextTracker = this.trackerFactory?.() ?? null;
      // Precompressed vendored payload when present (~13MB less cold).
      const gz = await gzAssetsAvailable();
      if (stale() || this.disposed) return;
      const wasmUrl = gz ? WASM_GZ_URL : WASM_URL;
      const modelUrl = gz ? MODEL_GZ_URL : MODEL_URL;
      const modelPromise = (async () => {
        if (nextTracker) {
          try {
            const started = await withTimeout(
              nextTracker.start(wasmUrl, modelUrl),
              30000,
              "model load",
            );
            if (stale() || this.disposed) {
              nextTracker.dispose();
              return null;
            }
            this.trackerUsedCpu = started.usedCpu;
            return null;
          } catch {
            nextTracker.dispose();
            // fall through to the inline path
          }
        }
        const { FilesetResolver, HandLandmarker } = await withTimeout(
          import("@mediapipe/tasks-vision"),
          30000,
          "vision module",
        );
        if (stale() || this.disposed) return null;
        const files = await withTimeout(
          FilesetResolver.forVisionTasks(wasmUrl),
          30000,
          "wasm backend",
        );
        if (stale() || this.disposed) return null;
        return withTimeout(
          createLandmarker(files, HandLandmarker, modelUrl),
          30000,
          "model load",
        );
      })();
      let nextLandmarker: HandLandmarker | null = null;
      let usedCpu = false;
      let stream: MediaStream | null = null;
      const [modelRes, streamRes] = await Promise.allSettled([
        modelPromise,
        streamPromise,
      ]);
      if (modelRes.status === "fulfilled" && modelRes.value) {
        nextLandmarker = modelRes.value.landmarker;
        usedCpu = modelRes.value.usedCpu;
      } else if (nextTracker) {
        usedCpu = this.trackerUsedCpu;
      }
      if (streamRes.status === "fulfilled") stream = streamRes.value;
      if (modelRes.status === "rejected" || streamRes.status === "rejected") {
        stream?.getTracks().forEach((t) => t.stop());
        try {
          nextLandmarker?.close();
        } catch {
          /* noop */
        }
        nextTracker?.dispose();
        throw modelRes.status === "rejected"
          ? modelRes.reason
          : (streamRes as PromiseRejectedResult).reason;
      }
      // At least one model path (worker or inline) must have succeeded.
      const modelReady = !!(nextLandmarker || nextTracker);
      if (!modelReady) {
        stream?.getTracks().forEach((t) => t.stop());
        return;
      }
      if (!stream) {
        nextLandmarker?.close();
        nextTracker?.dispose();
        return;
      }
      this.landmarkerUsedCpu = usedCpu;
      if (stale() || this.disposed) {
        stream.getTracks().forEach((t) => t.stop());
        nextLandmarker?.close();
        nextTracker?.dispose();
        return;
      }
      // swap: tear down the previous pipeline before going live on the new one
      try {
        this.landmarker?.close();
      } catch {
        /* noop */
      }
      this.tracker?.dispose();
      this.tracker = nextTracker;
      if (this.tracker) {
        this.tracker.onResult(this.onTrackerResult);
        this.tracker.onError(this.onTrackerError);
      }
      this.bmpInFlight = false;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.landmarker = nextLandmarker;
      this.stream = stream;
      const video = this.opts.video;
      video.srcObject = stream;
      await video.play();
      if (stale() || this.disposed) return;
      this.camLive = true;
      // Background work: the depth model runs on setTimeout, which browsers do
      // NOT throttle when a tab is hidden, so pause it explicitly.
      this.onVisibility = () => {
        this.mono.setPaused(document.hidden);
      };
      document.addEventListener("visibilitychange", this.onVisibility);
      this.setText(
        "t-model",
        this.landmarkerUsedCpu ? "hand model: live (cpu)" : "hand model: live",
      );
      this.emitCam("live");
      this.toast("webcam live — move your index finger");
      this.opts.onCamLive?.();
      if (!this.loopStarted) {
        this.loopStarted = true;
        this.handLoop(performance.now());
      }
      // Depth AI armed before the camera went live: start it now.
      if (this.depthOn && !this.disposed && req === this.camRequest) {
        this.attachDepthListener();
        this.depthStatus = "loading depth model…";
        this.emit();
        void this.mono.start(video);
      }
    } catch (err) {
      if (stale()) return;
      this.stream?.getTracks().forEach((t) => t.stop());
      this.stream = null;
      try { this.landmarker?.close(); } catch {}
      this.landmarker = null;
      this.tracker?.dispose();
      this.tracker = null;
      this.bmpInFlight = false;
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.camLive) {
        // first start failed: reset input state, fall back to mouse
        this.handActive = false;
        this.pinchState = false;
        this.pinchHeld = false;
        this.grabbed = null;
        this.grabbedHandle = null;
        this.uiDownEl = null;
        this.fistSince = 0;
        this.fistFrames = 0;
        this.anchor = null;
        this.smoothZ = 0;
        this.setText("t-model", "camera unavailable — mouse fallback");
        this.emitCam("idle");
        this.toast("camera/model failed: " + msg);
      } else {
        this.toast("webcam restart failed, keeping previous stream: " + msg);
        this.emitCam("live");
      }
    } finally {
      if (req === this.camRequest) this.camStarting = false;
    }
  }

  cancelWebcamLoad(): void {
    if (!this.camStarting) return;
    this.camRequest++;
    this.camStarting = false;
    if (!this.camLive) {
      this.setText("t-model", "camera unavailable — mouse fallback");
      this.emitCam("idle");
      this.toast("model load cancelled");
    } else {
      this.emitCam("live");
    }
  }

  /* ================= internals ================= */

  private emit(): void {
    this.opts.emit({
      shape: this.shape,
      color: this.color,
      lineMode: this.lineMode,
      snapOn: this.snapOn,
      spin: this.controls.autoRotate,
      grid: this.grid.visible,
      cam: this.camState(),
      depthOn: this.depthOn,
      depth: this.depthStatus,
    });
  }

  private camState(): CamState {
    return this._cam;
  }
  private _cam: CamState = "idle";
  private emitCam(s: CamState): void {
    this._cam = s;
    this.emit();
  }

  private toast(s: string): void {
    const t = this.opts.toast;
    t.textContent = s;
    t.style.opacity = "1";
    if (this.toastT) clearTimeout(this.toastT);
    this.toastT = setTimeout(() => {
      t.style.opacity = "0";
    }, 1400);
  }

  private setText(id: keyof HudNodes, txt: string): void {
    if (this.hudCache[id] !== txt) {
      this.hudCache[id] = txt;
      this.opts.hud[id].textContent = txt;
    }
  }

  private setCount(): void {
    this.opts.hud["t-count"].textContent = String(this.spawnables.length);
    this.opts.onScene?.();
  }

  /* ---------- objects ---------- */

  private geoFor(s: ShapeName): THREE.BufferGeometry {
    const hit = this.geoCache[s];
    if (hit) return hit;
    // detail scales tessellation: 0 = coarse, 1 = legacy, 2 = fine.
    const seg = (base: number): number =>
      Math.max(3, Math.round(base * (this.detail === 0 ? 0.5 : this.detail === 2 ? 1.9 : 1)));
    const poly = (base: number): number =>
      this.detail === 0 ? 0 : this.detail === 2 ? Math.max(base, 1) : base;
    let g: THREE.BufferGeometry;
    switch (s) {
      case "cube":
        g = new THREE.BoxGeometry(0.62, 0.62, 0.62);
        break;
      case "sphere":
        g = new THREE.SphereGeometry(0.4, seg(32), Math.max(8, Math.round(seg(32) / 2)));
        break;
      case "cone":
        g = new THREE.ConeGeometry(0.4, 0.8, seg(28));
        break;
      case "torus":
        g = new THREE.TorusGeometry(0.34, 0.13, Math.max(6, Math.round(seg(18) / 2)), seg(40));
        break;
      case "cylinder":
        g = new THREE.CylinderGeometry(0.34, 0.34, 0.7, seg(28));
        break;
      case "icosa":
        g = new THREE.IcosahedronGeometry(0.46, poly(0));
        break;
      case "knot":
        g = new THREE.TorusKnotGeometry(0.34, 0.11, seg(90), Math.max(6, Math.round(seg(12) / 2)));
        break;
      case "tetra":
        g = new THREE.TetrahedronGeometry(0.58, poly(0));
        break;
      case "octa":
        g = new THREE.OctahedronGeometry(0.52, poly(0));
        break;
      case "capsule":
        g = new THREE.CapsuleGeometry(0.28, 0.5, Math.max(2, Math.round(seg(6) / 2)), seg(14));
        break;
      case "prism":
        g = new THREE.BoxGeometry(0.55, 0.6, 0.5);
        break;
      case "pyramid": {
        const pg = new THREE.ConeGeometry(0.42, 0.7, 4);
        pg.rotateY(Math.PI / 4);
        g = pg;
        break;
      }
      case "dome":
        g = new THREE.SphereGeometry(0.4, seg(24), 12, 0, Math.PI * 2, 0, Math.PI / 2);
        break;
      case "hexPrism":
        g = new THREE.CylinderGeometry(0.36, 0.36, 0.6, 6);
        break;
      case "triPrism":
        g = new THREE.CylinderGeometry(0.4, 0.4, 0.6, 3);
        break;
    }
    this.geoCache[s] = g;
    return g;
  }

  private clipPlanesList(): THREE.Plane[] {
    if (!this.clipAxis) return [];
    // Reuse one Plane instead of allocating per material per slider tick.
    if (this.clipAxis === "x") this.clipPlane.normal.set(-1, 0, 0);
    else if (this.clipAxis === "y") this.clipPlane.normal.set(0, -1, 0);
    else this.clipPlane.normal.set(0, 0, -1);
    this.clipPlane.constant = this.clipPos;
    return [this.clipPlane];
  }

  private matFor(c: string): THREE.MeshStandardMaterial {
    const hit = this.matCache[c];
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c),
      roughness: 0.32,
      metalness: 0.25,
    });
    this.applyStudioProps(m);
    this.matCache[c] = m;
    return m;
  }

  /** Apply the current studio flags to one placed-solid material. */
  private applyStudioProps(m: THREE.MeshStandardMaterial): void {
    if (this.matMode === "clay") {
      m.roughness = 0.92;
      m.metalness = 0;
      m.flatShading = false;
    } else if (this.matMode === "flat") {
      m.roughness = 0.6;
      m.metalness = 0.05;
      m.flatShading = true;
    } else {
      m.roughness = 0.32;
      m.metalness = 0.25;
      m.flatShading = false;
    }
    m.wireframe = this.wireframe;
    m.clippingPlanes = this.clipPlanesList();
    m.needsUpdate = true;
  }

  /** Wireframe overlay for every placed solid (Studio). */
  setWireframe(on: boolean): void {
    this.wireframe = on;
    Object.values(this.matCache).forEach((m) => {
      m.wireframe = on;
    });
  }

  /** Lighting/material voice for placed solids (Studio). */
  setMaterialMode(mode: StudioMaterial): void {
    this.matMode = mode;
    Object.values(this.matCache).forEach((m) => this.applyStudioProps(m));
  }

  /** Tessellation level 0–2 (Studio). Rebuilds shared geometries and swaps
   *  them onto live meshes, preserving each mesh's spawn scale. */
  setDetail(level: number): void {
    const next = Math.min(2, Math.max(0, Math.round(level)));
    if (next === this.detail) return;
    this.detail = next;
    Object.values(this.geoCache).forEach((g) => g?.dispose());
    this.geoCache = {};
    this.hrCache = {};
    for (const m of this.spawnables) {
      const s = this.shapeOf(m);
      m.geometry = this.geoFor(s);
      const k = Math.max(m.scale.x, m.scale.y, m.scale.z);
      m.userData.hr = this.hrFor(s) * k;
    }
    this.shadowsDirty = true;
  }

  /** Cross-section slicing plane (Studio). Null axis disables it. */
  setClip(axis: ClipAxis, pos: number): void {
    const wasActive = this.clipAxis !== null;
    const isActive = axis !== null;
    this.clipAxis = axis;
    this.clipPos = Number.isFinite(pos) ? Math.min(3, Math.max(-3, pos)) : 0;
    const planes = this.clipPlanesList();
    // Only recompile shaders when toggling clipping on/off; moving the plane
    // mutates the shared THREE.Plane normal/constant uniform in place.
    if (wasActive !== isActive) {
      Object.values(this.matCache).forEach((m) => {
        m.clippingPlanes = planes;
        m.needsUpdate = true;
      });
    }
    if (!axis) {
      if (this.clipHelper) this.clipHelper.visible = false;
      return;
    }
    if (!this.clipHelper) {
      this.clipHelper = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 9),
        new THREE.MeshBasicMaterial({
          color: 0x0ea5e9,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      this.scene.add(this.clipHelper);
    }
    const helper = this.clipHelper;
    helper.visible = true;
    helper.position.set(0, 0, 0);
    helper.rotation.set(0, 0, 0);
    if (axis === "x") {
      helper.rotation.y = Math.PI / 2;
      helper.position.x = this.clipPos;
    } else if (axis === "y") {
      helper.rotation.x = -Math.PI / 2;
      helper.position.y = this.clipPos;
    } else {
      helper.position.z = this.clipPos;
    }
  }

  private hrFor(s: ShapeName): number {
    const hit = this.hrCache[s];
    if (hit !== undefined) return hit;
    const g = this.geoFor(s);
    g.computeBoundingSphere();
    const r = (g.boundingSphere?.radius ?? 0.5) * 1.5 + 0.3;
    this.hrCache[s] = r;
    return r;
  }

  private placeAt(
    p: THREE.Vector3,
    s: ShapeName = this.shape,
    c: string = this.color,
    rot?: [number, number, number],
    scale?: [number, number, number],
  ): THREE.Mesh {
    const m = new THREE.Mesh(this.geoFor(s), this.matFor(c));
    m.position.copy(p).clamp(this.PLACE_MIN, this.PLACE_MAX);
    m.castShadow = true;
    const k = scale ?? this.spawnScale;
    const cl = (v: number): number =>
      Number.isFinite(v) ? Math.min(SCALE_MAX, Math.max(SCALE_MIN, v)) : 1;
    const ks: [number, number, number] = [cl(k[0]), cl(k[1]), cl(k[2])];
    m.scale.set(ks[0], ks[1], ks[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    else m.rotation.set(Math.random() * 0.4, Math.random() * 0.8, 0);
    const maxK = Math.max(ks[0], ks[1], ks[2]);
    m.userData.hr = this.hrFor(s) * maxK;
    m.userData.shape = s;
    this.scene.add(m);
    this.spawnables.push(m);
    this.shadowsDirty = true;
    this.setCount();
    return m;
  }

  private nearestTo(p: THREE.Vector3, r = 1.0): THREE.Mesh | null {
    let best: THREE.Mesh | null = null;
    // Squared comparison: distanceTo does a sqrt per object, and this runs on
    // the frame path. r <= 1 so r*r is exact for the radii we use.
    let bd2 = r * r;
    for (const m of this.spawnables) {
      const d2 = m.position.distanceToSquared(p);
      if (d2 < bd2) {
        bd2 = d2;
        best = m;
      }
    }
    return best;
  }

  private setHover(m: THREE.Mesh | null): void {
    if (this.hovered === m) return;
    this.hovered = m;
    document.body.style.cursor = this.hovered ? "pointer" : "default";
  }

  private setSelected(m: THREE.Mesh | null): void {
    this.selected = m;
    this.selectRing.visible = !!m;
  }

  /* ---------- pinch = click/down ; release = up ---------- */

  private onPinchDown(): void {
    this.pinchHeld = true;
    this.pinchStartT = performance.now();
    this.pinchStartPos.copy(this.cursor.position);
    this.pinchMoved = false;
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(this.cursorPinch);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(this.cursorPinch);
    this.grabbedHandle = this.nearestHandle(this.cursor.position, 1.0);
    if (this.grabbedHandle) {
      this.handleOffset
        .copy(this.grabbedHandle.L.pts[this.grabbedHandle.idx])
        .sub(this.cursor.position);
      this.grabbed = null;
    } else {
      // Shapes stay grabbable in line mode so solids can be moved/selected
      // without leaving line mode. Empty-space taps still drop line points
      // (see onPinchUp); Shift+tap or placeCurrentShape() creates solids.
      this.grabbed = this.nearestTo(this.cursor.position, 1.0);
    }
    if (this.grabbed)
      this.grabOffset.copy(this.grabbed.position).sub(this.cursor.position);
    this.pressUIAtCursor(true);
  }

  private onPinchUp(): void {
    const quick =
      performance.now() - this.pinchStartT < 380 && !this.pinchMoved;
    this.pinchHeld = false;
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(this.cursorRest);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(this.cursorRest);
    if (this.grabbed && !quick) {
      this.grabbed = null;
    }
    if (this.grabbedHandle && !quick) {
      this.grabbedHandle = null;
      this.rebuildJunctions();
    } else if (quick) {
      if (!this.pressUIAtCursor(false)) {
        if (this.grabbedHandle) {
          /* tapped a vertex — nothing to place */
        } else if (this.shiftAtDown) {
          // Shift+tap forces shape creation even in line mode.
          const hit = this.nearestTo(this.cursor.position, 0.8);
          if (!hit) {
            this.setSelected(this.placeAt(this.cursor.position));
            this.toast("placed " + this.shape);
          } else {
            this.setSelected(hit);
            this.toast("selected");
          }
        } else if (this.lineMode) {
          if (this.grabbed) {
            // Press started on a solid — select it instead of dropping a
            // line point, so shapes stay usable without leaving line mode.
            this.setSelected(this.grabbed);
            this.toast("selected");
          } else {
            this.placeLinePoint(this.cursor.position);
          }
        } else {
          const hit = this.nearestTo(this.cursor.position, 0.8);
          if (!hit) {
            this.setSelected(this.placeAt(this.cursor.position));
            this.toast("placed " + this.shape);
          } else {
            this.setSelected(hit);
            this.toast("selected");
          }
        }
      }
      this.grabbed = null;
      this.grabbedHandle = null;
    }
    this.shiftAtDown = false;
    this.emitMath();
  }

  private onPinchMove(): void {
    if (this.pinchStartPos.distanceTo(this.cursor.position) > 0.45)
      this.pinchMoved = true;
    // Two-hand scale owns the gesture: freeze drag so spread maps to size,
    // not position. pinchMoved still updates so a scale never becomes a tap.
    if (this.twoHandScaling) return;
    if (this.grabbed)
      this.grabbed.position.copy(this.cursor.position).add(this.grabOffset);
    if (this.grabbedHandle) {
      const s = this.findSnapTarget(
        this.cursor.position,
        this.grabbedHandle,
        this.grabbedHandle.L,
      );
      this._v1
        .copy(this.cursor.position)
        .add(this.handleOffset)
        .clamp(this.LIM_MIN, this.LIM_MAX);
      this.grabbedHandle.L.pts[this.grabbedHandle.idx].copy(s ? s.pos : this._v1);
      this.updateLine(this.grabbedHandle.L); // transforms only — junctions refresh on release
      if (++this.mathTick % 6 === 0) this.emitMath();
    }
  }

  /* ---------- two-hand pinch-scale = enlarge / shrink ---------- */

  private interPinchDist(
    a: NormalizedLandmark[],
    b: NormalizedLandmark[],
  ): number {
    return interHandDist(pinchMid(a[4], a[8]), pinchMid(b[4], b[8]));
  }

  private pickScaleTarget(): THREE.Mesh | null {
    return (
      this.grabbed ??
      this.selected ??
      this.hovered ??
      this.nearestTo(this.cursor.position, 1.0)
    );
  }

  private applyScaleToTarget(target: THREE.Mesh, factor: number): void {
    const start: [number, number, number] = [
      this.scaleStart.x,
      this.scaleStart.y,
      this.scaleStart.z,
    ];
    const [x, y, z] = clampedUniformScale(start, factor);
    target.scale.set(x, y, z);
    const s = this.shapeOf(target);
    const maxK = Math.max(x, y, z);
    target.userData.hr = this.hrFor(s) * maxK;
    this.shadowsDirty = true;
  }

  /** Returns true while the two-hand scale gesture owns the frame. */
  private updateTwoHandScale(
    main: NormalizedLandmark[],
    other: NormalizedLandmark[],
  ): boolean {
    const cur = this.interPinchDist(main, other);
    if (!Number.isFinite(cur)) return this.twoHandScaling;
    if (!this.twoHandScaling) {
      const target = this.pickScaleTarget();
      if (!target) return false;
      if (cur < 0.02) return false;
      this.twoHandScaling = true;
      this.scaleTarget = target;
      this.scaleStart.copy(target.scale);
      this.pinchDist0 = cur;
      this.pinchDistSmooth = cur;
      this.scaleFactor = 1;
      this.toast("scaling — spread to enlarge, close to shrink");
      return true;
    }
    if (!this.scaleTarget || !this.spawnables.includes(this.scaleTarget)) {
      this.endTwoHandScale(true);
      return false;
    }
    // Light smoothing so sensor jitter doesn't shimmer the mesh.
    this.pinchDistSmooth += (cur - this.pinchDistSmooth) * 0.5;
    const factor = scaleFactorForDist(this.pinchDistSmooth, this.pinchDist0);
    // Deadzone: ignore sub-percent tremor around the arming spread.
    if (Math.abs(factor - this.scaleFactor) < 0.005) return true;
    this.scaleFactor = factor;
    this.applyScaleToTarget(this.scaleTarget, factor);
    return true;
  }

  private endTwoHandScale(silent = false): void {
    if (!this.twoHandScaling) return;
    const done = this.scaleTarget;
    const finishedFactor = this.scaleFactor;
    this.twoHandScaling = false;
    this.scaleTarget = null;
    this.pinchDist0 = 0;
    this.pinchDistSmooth = 0;
    this.scaleFactor = 1;
    if (done && !silent) {
      this.toast(`scaled x${finishedFactor.toFixed(2)}`);
      this.opts.onScene?.();
    }
  }

  /* ---------- two-hand pinch ruler ---------- */

  /** Both-pinch measuring: project each hand's pinch midpoint onto the
   *  camera plane through the live cursor target (mouse-fallback pattern)
   *  and float the distance label at the midpoint. */
  private updateRulerLabel(
    main: NormalizedLandmark[],
    other: NormalizedLandmark[],
  ): void {
    const aNdc = ndcFromLandmark(
      (main[4].x + main[8].x) / 2,
      (main[4].y + main[8].y) / 2,
    );
    const bNdc = ndcFromLandmark(
      (other[4].x + other[8].x) / 2,
      (other[4].y + other[8].y) / 2,
    );
    this.ndc.set(aNdc.x, aNdc.y);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.camera.getWorldDirection(this._v1);
    this.camPlane.setFromNormalAndCoplanarPoint(
      this._v1.negate(),
      this.target,
    );
    if (!this.ray.ray.intersectPlane(this.camPlane, this.rulerA)) {
      if (this.rulerLabel) this.rulerLabel.visible = false;
      return;
    }
    this.ndc.set(bNdc.x, bNdc.y);
    this.ray.setFromCamera(this.ndc, this.camera);
    if (!this.ray.ray.intersectPlane(this.camPlane, this._v2)) {
      if (this.rulerLabel) this.rulerLabel.visible = false;
      return;
    }
    const aMeters = this.rulerA.distanceTo(this._v2);
    if (this.rulerCalibrating) {
      // First both-pinch frame after arming: this spread IS the student's
      // measured span. Commit whatever cmPerMeterFor returns — its own
      // 0.02 m floor already rejects degenerate samples.
      this.rulerSpanMeters = aMeters;
      this.rulerCmPerMeter = cmPerMeterFor(this.rulerSpanCm, aMeters);
      this.rulerCalibrating = false;
    }
    this.ensureRulerLabel();
    const label = this.rulerLabel;
    if (!label) return;
    label.position.copy(this.rulerA).add(this._v2).multiplyScalar(0.5);
    label.position.y += 0.05;
    label.userData.set(rulerText(aMeters, this.rulerCmPerMeter));
    label.visible = true;
  }

  private ensureRulerLabel(): void {
    if (this.rulerLabel) return;
    this.rulerLabel = makeLabel("#86efac");
    this.rulerGroup.add(this.rulerLabel);
  }

  /* ---------- fist = right-click/delete ---------- */

  private onFistHold(): void {
    const v =
      this.grabbed ||
      this.hovered ||
      this.nearestTo(this.cursor.position, 1.0);
    if (v) {
      this.scene.remove(v);
      const idx = this.spawnables.indexOf(v);
      if (idx !== -1) this.spawnables.splice(idx, 1);
      this.shadowsDirty = true;
      this.setCount();
      if (this.grabbed === v) this.grabbed = null;
      if (this.scaleTarget === v) this.endTwoHandScale(true);
      this.hovered = null;
      if (this.selected === v) this.setSelected(null);
      this.toast("deleted");
      this.fistSince = 0;
    }
  }

  /* ---------- HTML UI clickable by the 3D cursor ---------- */

  private screenOf(v3: THREE.Vector3): {
    x: number;
    y: number;
    behind: boolean;
  } {
    const v = this._v3.copy(v3).project(this.camera);
    return {
      x: (v.x * 0.5 + 0.5) * window.innerWidth,
      y: (-v.y * 0.5 + 0.5) * window.innerHeight,
      behind: v.z > 1,
    };
  }

  private pressUIAtCursor(down: boolean): boolean {
    const { x, y, behind } = this.screenOf(this.cursor.position);
    if (behind) return false;
    const el = document.elementFromPoint(x, y);
    const hit = el?.closest?.("button,input") as HTMLElement | null;
    const cursor2d = this.opts.cursor2d;
    if (!this.lastCur2dVis) {
      this.lastCur2dVis = true;
      cursor2d.style.display = "block";
    }
    cursor2d.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -50%)`;
    if (down && hit) {
      this.uiDownEl = hit;
      return true;
    }
    if (!down && hit && hit === this.uiDownEl) {
      hit.click();
      this.uiDownEl = null;
      return true;
    }
    if (!down) this.uiDownEl = null;
    return !!hit;
  }

  /* ---------- mouse fallback ---------- */

  private onPointerMove = (e: PointerEvent): void => {
    if (this.handActive) return;
    this.ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    this.camera.getWorldDirection(this._v1);
    this.camPlane.setFromNormalAndCoplanarPoint(
      this._v1.negate(),
      this.target,
    );
    if (this.ray.ray.intersectPlane(this.camPlane, this._v2)) {
      this.target.copy(this._v2).clamp(this.LIM_MIN, this.LIM_MAX);
    }
    if (this.mouseDown && this.grabbed) this.onPinchMove();
  };

  // Zoom disabled: camera stays fixed — wheel does nothing.
  private onWheel = (_e: WheelEvent): void => {};

  private onCanvasPointerDown = (e: PointerEvent): void => {
    if (this.handActive) return;
    this.mouseDown = true;
    this.shiftAtDown = e.shiftKey;
    this.onPinchDown();
  };

  private onPointerUp = (): void => {
    if (this.handActive) return;
    if (this.mouseDown) {
      this.mouseDown = false;
      this.onPinchUp();
    }
  };

  /* ---------- lines + measurement ---------- */

  private angleAt(
    prev: THREE.Vector3,
    v: THREE.Vector3,
    next: THREE.Vector3,
  ): number {
    this._aa.subVectors(prev, v).normalize();
    this._ab.subVectors(next, v).normalize();
    return THREE.MathUtils.radToDeg(
      Math.acos(THREE.MathUtils.clamp(this._aa.dot(this._ab), -1, 1)),
    );
  }

  private dirAt(L: Polyline, idx: number): THREE.Vector3 | null {
    const p = L.pts;
    if (p.length < 2) return null;
    if (idx < p.length - 1)
      return new THREE.Vector3().subVectors(p[idx + 1], p[idx]).normalize();
    return new THREE.Vector3().subVectors(p[idx], p[idx - 1]).normalize();
  }

  private buildLineStructure(L: Polyline): void {
    // structure changes only when points are added/removed
    (L.labels || []).forEach((sp) => {
      const m = sp.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.dispose();
    });
    if (L.sumLabel) {
      const m = L.sumLabel.material as THREE.SpriteMaterial;
      m.map?.dispose();
      m.dispose();
      L.sumLabel = null;
    }
    L.group.clear();
    L.segs = [];
    L.handles = [];
    L.lenLabels = [];
    L.angLabels = [];
    L.labels = [];
    const n = L.pts.length;
    for (let i = 0; i < n - 1; i++) {
      const m = new THREE.Mesh(this.SEG_GEO, this.SEG_MAT);
      m.castShadow = true;
      m.userData.shared = true;
      L.group.add(m);
      L.segs.push(m);
      const lab = makeLabel();
      L.group.add(lab);
      L.lenLabels.push(lab);
      L.labels.push(lab);
    }
    L.pts.forEach(() => {
      const h = new THREE.Mesh(this.HANDLE_GEO, this.HANDLE_MAT);
      h.castShadow = true;
      h.userData.shared = true;
      L.group.add(h);
      L.handles.push(h);
    });
    for (let i = 1; i < n - 1; i++) {
      const lab = makeLabel("#fcfcf9");
      L.group.add(lab);
      L.angLabels.push({ sp: lab, i });
      L.labels.push(lab);
    }
    this.updateLine(L);
  }

  private updateLine(L: Polyline): void {
    // drag path: reposition/rescale only, zero allocation
    for (let i = 0; i < L.segs.length; i++) {
      const a = L.pts[i];
      const b = L.pts[i + 1];
      const m = L.segs[i];
      this._sd.subVectors(b, a);
      const len = Math.max(this._sd.length(), 1e-4);
      m.position.copy(a).addScaledVector(this._sd, 0.5);
      m.quaternion.setFromUnitVectors(this.UP_Y, this._sd.divideScalar(len));
      m.scale.set(1, len, 1);
      const lab = L.lenLabels[i];
      lab.userData.set(len.toFixed(2));
      lab.position.copy(a).lerp(b, 0.5);
      lab.position.y += 0.28;
    }
    L.handles.forEach((h, i) => h.position.copy(L.pts[i]));
    L.angLabels.forEach(({ sp, i }) => {
      sp.userData.set(
        this.angleAt(L.pts[i - 1], L.pts[i], L.pts[i + 1]).toFixed(0) + "°",
      );
      sp.position.copy(L.pts[i]);
      sp.position.y += 0.44;
    });
    // summary label: total length always; + perimeter/area when closed
    const closed = this.isClosed(L);
    const total = polyTotal(L.pts, closed);
    if (!L.sumLabel) {
      L.sumLabel = makeLabel(closed ? "#86efac" : "#fde68a");
      L.sumLabel.scale.set(1.9, 0.95, 1);
      L.group.add(L.sumLabel);
    }
    const c = centroidOf(L.pts);
    L.sumLabel.position.copy(c);
    L.sumLabel.position.y += 0.85;
    if (L.pts.length < 2) {
      L.sumLabel.userData.set("tap to add pts");
    } else if (closed && L.pts.length >= 3) {
      const loop =
        L.pts.length > 2 &&
        L.pts[0].distanceTo(L.pts[L.pts.length - 1]) < 0.001
          ? L.pts.slice(0, -1)
          : L.pts;
      const { area } = newellArea(loop);
      let text = `L ${total.toFixed(2)}m · A ${area.toFixed(2)}m²`;
      // chip-toggled teaching extension: (n−2)·180° comparison on the
      // collapsed loop — interiorAnglesDeg covers the wrap-around vertices
      // that angLabels can't. Allocates only while the chip is ON.
      if (this.angleSumLabels && loop.length >= 3) {
        const angles = interiorAnglesDeg(
          loop.map((p) => [p.x, p.y, p.z] as Pt),
          true,
        );
        text += ` · ${angleSumText(sumDegrees(angles), loop.length)}`;
      }
      L.sumLabel.userData.set(text);
    } else {
      let text = `L ${total.toFixed(2)}m · ${L.pts.length - 1} seg`;
      if (this.pythagLabels && L.pts.length === 3) {
        const triple = pythagorasOf(L.pts.map((p) => [p.x, p.y, p.z] as Pt));
        if (triple) text += ` · ${pythagText(triple)}`;
      }
      L.sumLabel.userData.set(text);
    }
  }

  private isClosed(L: Polyline): boolean {
    return (
      L.pts.length >= 3 &&
      L.pts[0].distanceTo(L.pts[L.pts.length - 1]) < CLOSE_R
    );
  }

  /** Structured math for every chain — consumed by the React measure panel. */
  getMeasurements(): Measurement[] {
    return this.polylines.map((L, id) => {
      const closed = this.isClosed(L);
      const total = polyTotal(L.pts, closed);
      const loop =
        closed &&
        L.pts.length > 2 &&
        L.pts[0].distanceTo(L.pts[L.pts.length - 1]) < 0.001
          ? L.pts.slice(0, -1)
          : L.pts;
      const { area, normal } =
        closed && loop.length >= 3
          ? newellArea(loop)
          : { area: 0, normal: new THREE.Vector3(0, 1, 0) };
      const c = centroidOf(L.pts);
      const angles: number[] = [];
      // open chain: interior joints; closed: every vertex incl. wrap-around
      if (!closed) {
        for (let i = 1; i + 1 < L.pts.length; i++)
          angles.push(this.angleAt(L.pts[i - 1], L.pts[i], L.pts[i + 1]));
      } else if (loop.length >= 3) {
        for (let i = 0; i < loop.length; i++)
          angles.push(
            this.angleAt(
              loop[(i - 1 + loop.length) % loop.length],
              loop[i],
              loop[(i + 1) % loop.length],
            ),
          );
      }
      const pts: [number, number, number][] = L.pts.map(
        (p) => [p.x, p.y, p.z] as [number, number, number],
      );
      // (n−2)·180° comparison basis for closed loops; pure triple data for
      // open 3-point chains. Both feed the React measure panel via onMath.
      const angleSum =
        closed && angles.length > 0 ? angles.reduce((s, a) => s + a, 0) : null;
      const pythag = !closed ? pythagorasOf(pts) : null;
      return {
        id,
        pts,
        segs: Math.max(L.pts.length - 1, 0),
        total,
        closed,
        perimeter: closed ? total : 0,
        area: closed ? area : 0,
        centroid: [c.x, c.y, c.z],
        normal: [normal.x, normal.y, normal.z],
        angles,
        minAngle: angles.length ? Math.min(...angles) : null,
        maxAngle: angles.length ? Math.max(...angles) : null,
        angleSum,
        pythag,
      };
    });
  }

  private emitMath(): void {
    this.opts.onMath?.(this.getMeasurements());
    this.opts.onScene?.();
  }

  private rebuildJunctions(): void {
    disposeGroup(this.junctionGroup);
    const verts: { L: Polyline; idx: number; p: THREE.Vector3 }[] = [];
    this.polylines.forEach((L) =>
      L.pts.forEach((p, i) => verts.push({ L, idx: i, p })),
    );
    for (let a = 0; a < verts.length; a++)
      for (let b = a + 1; b < verts.length; b++) {
        const A = verts[a];
        const B = verts[b];
        if (A.L === B.L) continue;
        if (A.p.distanceTo(B.p) > 0.06) continue;
        const d1 = this.dirAt(A.L, A.idx);
        const d2 = this.dirAt(B.L, B.idx);
        if (!d1 || !d2) continue;
        const deg = THREE.MathUtils.radToDeg(
          Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1)),
        );
        const lab = makeLabel("#fde68a");
        lab.userData.set(deg.toFixed(0) + "°");
        lab.position.copy(A.p).lerp(B.p, 0.5);
        lab.position.y += 0.44;
        this.junctionGroup.add(lab);
      }
  }

  private newLine(firstPt: THREE.Vector3): Polyline {
    const L: Polyline = {
      pts: [firstPt.clone()],
      group: new THREE.Group(),
      segs: [],
      handles: [],
      lenLabels: [],
      angLabels: [],
      labels: [],
      sumLabel: null,
    };
    this.scene.add(L.group);
    this.polylines.push(L);
    this.activeLine = L;
    this.buildLineStructure(L);
    return L;
  }

  private findSnapTarget(
    p: THREE.Vector3,
    exclude: GrabbedHandle | null = null,
    excludeLine: Polyline | null = null,
  ): SnapTarget | null {
    if (!this.snapOn) return null;
    let best: SnapTarget | null = null;
    let bd2 = this.SNAP_R * this.SNAP_R;
    // pass 1: existing vertices (preferred — chains share the exact point)
    this.polylines.forEach((L) =>
      L.pts.forEach((q, i) => {
        if (exclude && exclude.L === L && exclude.idx === i) return;
        const d2 = p.distanceToSquared(q);
        if (d2 < bd2) {
          bd2 = d2;
          best = { pos: q.clone(), L, idx: i, segIndex: null };
        }
      }),
    );
    // pass 2: anywhere along a line's segments, so tapping mid-line
    // connects to it (the caller drops a vertex there for a true junction)
    this.polylines.forEach((L) => {
      if (L === excludeLine) return;
      for (let i = 0; i + 1 < L.pts.length; i++) {
        const a = L.pts[i];
        const b = L.pts[i + 1];
        const abx = b.x - a.x;
        const aby = b.y - a.y;
        const abz = b.z - a.z;
        const len2 = abx * abx + aby * aby + abz * abz;
        if (len2 < 1e-9) continue;
        let t =
          ((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / len2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = a.x + abx * t;
        const cy = a.y + aby * t;
        const cz = a.z + abz * t;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const dz = p.z - cz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < bd2) {
          bd2 = d2;
          best = { pos: new THREE.Vector3(cx, cy, cz), L, idx: -1, segIndex: i };
        }
      }
    });
    return best;
  }

  private nearestHandle(p: THREE.Vector3, r = 1.0): GrabbedHandle | null {
    let best: GrabbedHandle | null = null;
    let bd2 = r * r;
    this.polylines.forEach((L) =>
      L.pts.forEach((q, i) => {
        const d2 = p.distanceToSquared(q);
        if (d2 < bd2) {
          bd2 = d2;
          best = { L, idx: i };
        }
      }),
    );
    return best;
  }

  private placeLinePoint(p: THREE.Vector3): void {
    const s = this.findSnapTarget(p, null, this.activeLine);
    // Tapping mid-way along another line connects to it: drop a real vertex
    // into that line at the tap point so both chains share the point.
    let connected = false;
    if (s && s.segIndex !== null && s.L !== this.activeLine) {
      s.L.pts.splice(s.segIndex + 1, 0, s.pos.clone());
      this.buildLineStructure(s.L);
      connected = true;
    }
    const pt = s ? s.pos.clone() : p.clone().clamp(this.LIM_MIN, this.LIM_MAX);
    if (!this.activeLine) {
      this.newLine(pt);
    } else {
      const L = this.activeLine;
      // tap near the FIRST point with 3+ pts => close the loop explicitly
      if (L.pts.length >= 3 && pt.distanceTo(L.pts[0]) < CLOSE_R) {
        L.pts.push(L.pts[0].clone());
        this.buildLineStructure(L);
        this.rebuildJunctions();
        this.shadowsDirty = true;
        const m = this.getMeasurements().find(
          (x) => x.id === this.polylines.indexOf(L),
        );
        this.toast(
          m && m.closed
            ? `loop closed — P ${m.perimeter.toFixed(2)}m · A ${m.area.toFixed(2)}m²`
            : "chain done",
        );
        this.activeLine = null;
        this.emitMath();
        return;
      }
      const hitSelf = L.pts.some((q) => pt.distanceTo(q) < 0.25);
      if (hitSelf) {
        this.toast("chain done — " + L.pts.length + " pts");
        this.activeLine = null;
        this.rebuildJunctions();
        this.emitMath();
        return;
      }
      L.pts.push(pt);
    }
    if (this.activeLine) this.buildLineStructure(this.activeLine);
    this.rebuildJunctions();
    this.shadowsDirty = true;
    this.toast(
      s
        ? connected
          ? "connected + point added"
          : "snapped + point added"
        : "point added",
    );
    this.emitMath();
  }

  /* ---------- keyboard ---------- */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    if (e.shiftKey && e.code.startsWith("Digit")) {
      // Shift+1..5 reach the 11th..15th palette shapes, which `1–0` cannot
      // select. Shift+6..9 fall through the SHAPES.length guard.
      const i = 9 + +e.code.slice(5);
      if (i > 9 && i < SHAPES.length) this.setShape(SHAPES[i]);
      return;
    }
    if (
      (e.key >= "1" && e.key <= "9") ||
      e.key === "0"
    ) {
      const i = e.key === "0" ? 9 : +e.key - 1;
      if (i < SHAPES.length) this.setShape(SHAPES[i]);
    }
    if (e.key === "r" || e.key === "R") this.recenter();
    if (e.key === "l" || e.key === "L") this.setLineMode(!this.lineMode);
    // Place the current solid without leaving line mode (same as the
    // toolbar "place" button; Shift+click is the mouse equivalent).
    if (e.key === "p" || e.key === "P") this.placeCurrentShape();
    if (e.key === "Escape") {
      if (this.lineMode) {
        if (this.activeLine && this.activeLine.pts.length > 1) {
          this.activeLine = null;
          this.toast("chain done");
          this.emitMath();
        } else {
          this.setLineMode(false);
        }
      }
    }
    if (e.key === "Enter" && this.lineMode && this.activeLine) {
      this.activeLine = null;
      this.toast("chain done");
      this.emitMath();
    }
    if (
      (e.key === "Delete" || e.key === "Backspace") &&
      (this.hovered || this.grabbed)
    ) {
      const v = (this.grabbed || this.hovered)!;
      this.scene.remove(v);
      const idx = this.spawnables.indexOf(v);
      if (idx !== -1) this.spawnables.splice(idx, 1);
      this.grabbed = null;
      this.hovered = null;
      if (this.selected === v) this.setSelected(null);
      this.shadowsDirty = true;
      this.setCount();
    }
  };

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  /* ---------- hand tracking (MediaPipe Tasks Vision) ---------- */

  private handLoop = (now: number): void => {
    if (this.disposed) return;
    this.handRaf = requestAnimationFrame(this.handLoop);
    // Browsers throttle rAF to ~1Hz rather than suspending it, and MediaPipe
    // inference is by far the most expensive thing we do per frame.
    if (document.hidden) return;
    this.frames++;
    if (now - this.fT > 1000) {
      this.setText("t-fps", this.frames + " fps");
      this.setText(
        "t-detect",
        this.detectN
          ? (this.detectAccum / this.detectN).toFixed(1) + " ms"
          : "— ms",
      );
      this.frames = 0;
      this.fT = now;
      this.detectAccum = 0;
      this.detectN = 0;
    }
    const video = this.opts.video;
    if (
      (!this.landmarker && !this.tracker) ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoT ||
      !shouldDetect(now, this.lastDetectAt)
    )
      return;
    this.lastVideoT = video.currentTime;
    this.lastDetectAt = now;
    if (this.tracker) {
      // Worker path: inference runs off the main thread. Submit the newest
      // frame as a transferable ImageBitmap; results land in onTrackerResult.
      // One bitmap in flight = a slow worker skips frames instead of lagging.
      if (this.bmpInFlight) return;
      this.bmpInFlight = true;
      void createImageBitmap(video)
        .then((bmp) => this.tracker?.submit(bmp, now))
        .catch(() => {
          this.bmpInFlight = false;
        });
      return;
    }
    let res: {
      landmarks?: NormalizedLandmark[][];
      handednesses?: { categoryName?: string }[][];
    };
    const inferT0 = performance.now();
    try {
      res = this.landmarker!.detectForVideo(video, now) as unknown as typeof res;
    } catch {
      return;
    }
    const inferMs = performance.now() - inferT0;
    perf.detect.push(inferMs, performance.now());
    this.detectAccum += inferMs;
    this.detectN++;
    this.processHands(res.landmarks ?? [], res.handednesses);
  };

  /**
   * Shared tail of both detection paths (inline + worker): skeleton preview,
   * loss hysteresis, gesture processing. hysteresis counts consecutive
   * no-hand results, so it behaves identically whichever path feeds it.
   */
  private processHands(
    hands: NormalizedLandmark[][],
    handednesses?: { categoryName?: string }[][],
  ): void {
    this.queueSkel(hands);
    if (!hands.length) {
      // hysteresis: tolerate a few dropped frames before declaring loss
      if (++this.lostFrames >= 4) {
        this.setHandUI(false);
        this.anchor = null; // re-anchor on next appearance
        this.smoothZ = 0;
        this.filtInit = false;
        this.fistFrames = 0;
      }
      return;
    }
    this.lostFrames = 0;
    this.handActive = true;
    this.setHandUI(true, hands.length);
    this.drive(hands, handednesses);
  }

  /**
   * Defer the skeleton redraw out of the detection frame.
   *
   * drawSkel is a 2D canvas repaint of 21 landmarks x N hands. Running it
   * inside handLoop lengthens the frame that also pays for inference and
   * gesture processing, which is exactly the frame we care about. Handing it
   * to its own rAF keeps detection and preview on separate frames.
   */
  private queueSkel(hands: NormalizedLandmark[][]): void {
    this.lastHands = hands;
    if (this.skelRaf) return;
    this.skelRaf = requestAnimationFrame(() => {
      this.skelRaf = 0;
      if (this.disposed) return;
      this.drawSkel(this.lastHands, this.pinchState);
    });
  }

  private drawSkel(all: NormalizedLandmark[][] | undefined, pinched = false): void {
    if (!this.sctx) return;
    // 21 landmarks x N hands. Numeric FNV-1a hash of quantized coordinates
    // (~2px on a 248x140 preview) skips redraws with zero string allocations.
    let h = pinched ? 0x811c9dc5 : 0x01000193;
    if (all) {
      for (let hi = 0; hi < all.length; hi++) {
        const lm = all[hi];
        h = Math.imul(h ^ (hi + 1), 0x01000193);
        for (let i = 0; i < lm.length; i++) {
          const p = lm[i];
          const qx = (p.x * 124 + 0.5) | 0;
          const qy = (p.y * 70 + 0.5) | 0;
          h = Math.imul(h ^ ((qx << 10) ^ qy), 0x01000193);
        }
      }
    }
    if (h === this.lastSkelHash) return;
    this.lastSkelHash = h;
    const g = this.sctx;
    const canvas = this.opts.skel;
    const W = this.skelW || 248;
    const H = this.skelH || 140;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const needW = Math.max(1, Math.round(W * dpr));
    const needH = Math.max(1, Math.round(H * dpr));
    if (canvas.width !== needW || canvas.height !== needH) {
      canvas.width = needW;
      canvas.height = needH;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    // #cam uses object-fit:cover + scaleX(-1) mirror. A 640x480 stream in a
    // ~16:9 box crops top/bottom, so naive (1-x)*W / y*H drifts vertically.
    // Reproduce the cover crop here so the skeleton lands on the hand.
    const vw = this.opts.video.videoWidth || 0;
    const vh = this.opts.video.videoHeight || 0;
    let s = 1;
    let cropX = 0;
    let cropY = 0;
    if (vw > 0 && vh > 0) {
      s = Math.max(W / vw, H / vh);
      cropX = (vw * s - W) / 2;
      cropY = (vh * s - H) / 2;
    }
    const mapX = (nx: number): number =>
      vw > 0 && vh > 0 ? W - (nx * vw * s - cropX) : (1 - nx) * W;
    const mapY = (ny: number): number =>
      vw > 0 && vh > 0 ? ny * vh * s - cropY : ny * H;
    const accentNum = sceneThemeNow().cursor;
    const ar = (accentNum >> 16) & 255;
    const ag = (accentNum >> 8) & 255;
    const ab = accentNum & 255;
    const accentStroke = `rgba(${ar},${ag},${ab},.92)`;
    const accentJoint = `rgb(${Math.min(255, ar + 45)},${Math.min(255, ag + 45)},${Math.min(255, ab + 45)})`;
    (all || []).forEach((lm) => {
      g.strokeStyle = pinched
        ? "rgba(61,220,132,.95)"
        : accentStroke;
      g.lineWidth = 1.4;
      g.beginPath();
      EDGES.forEach(([a, b]) => {
        g.moveTo(mapX(lm[a].x), mapY(lm[a].y));
        g.lineTo(mapX(lm[b].x), mapY(lm[b].y));
      });
      g.stroke();
      g.fillStyle = pinched ? "#3ddc84" : accentJoint;
      lm.forEach((p, i) => {
        if (i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
          g.beginPath();
          g.arc(mapX(p.x), mapY(p.y), i === 8 || i === 4 ? 3.2 : 2.2, 0, 7);
          g.fill();
        }
      });
    });
  }

  private setHandUI(on: boolean, n = 0): void {
    if (this.lastHandOn !== on || (on && this.lastHandCount !== n)) {
      this.lastHandOn = on;
      this.lastHandCount = n;
      this.opts.hud["d-hand"].className = "dot " + (on ? "on" : "off");
      this.opts.hud["t-hand"].textContent = on
        ? `${n} hand${n > 1 ? "s" : ""}`
        : "none";
    }
    if (!on) {
      // tracking lost: release all gesture state so nothing sticks,
      // and report waiting instead of a stale pinch state
      this.handActive = false;
      this.pinchState = false;
      this.pinchState2 = false;
      this.endTwoHandScale(true);
      // ruler measurement is lost with the hands — never leave a stuck label
      if (this.rulerLabel) this.rulerLabel.visible = false;
      this.scaleFactor = 1;
      this.pinchHeld = false;
      this.grabbed = null;
      if (this.grabbedHandle) {
        this.grabbedHandle = null;
        this.rebuildJunctions();
      }
      this.uiDownEl = null;
      this.fistSince = 0;
      this.fistFrames = 0;
      this.anchor = null;
      if (this.lastCur2dVis) {
        this.lastCur2dVis = false;
        this.opts.cursor2d.style.display = "none";
      }
      this.setText("t-pinch", "waiting");
    }
  }

  private drive(
    hands: NormalizedLandmark[][],
    handedness?: { categoryName?: string }[][],
  ): void {
    // Pick control hand: prefer the hand labelled Right (user's dominant),
    // fall back to the largest (closest to camera).
    let main = hands[0];
    let other = hands[1] as NormalizedLandmark[] | undefined;
    if (hands.length > 1 && handedness && handedness.length > 1) {
      const label = (i: number): string =>
        (handedness[i]?.[0]?.categoryName ?? "").toLowerCase();
      if (label(1) === "right" && label(0) !== "right") {
        main = hands[1];
        other = hands[0];
      } else if (
        label(0) !== "right" &&
        label(1) !== "left" &&
        D(hands[1][0], hands[1][9]) > D(hands[0][0], hands[0][9])
      ) {
        main = hands[1];
        other = hands[0];
      }
    } else if (other && D(other[0], other[9]) > D(main[0], main[9])) {
      main = other;
      other = hands[0];
    }
    const rawTip = main[8];
    const rawSize = Math.max(D(main[0], main[9]), 1e-4); // palm scale ~.12 far … ~.32 near

    // EMA filter on tip + size with a small deadzone to kill sensor jitter.
    // Alpha rises with motion so fast moves stay responsive, slow holds stay still.
    if (!this.filtInit) {
      this.fTipX = rawTip.x;
      this.fTipY = rawTip.y;
      this.fSize = rawSize;
      this.filtInit = true;
    } else {
      const jx = Math.abs(rawTip.x - this.fTipX);
      const jy = Math.abs(rawTip.y - this.fTipY);
      const motion = Math.min(jx + jy, 0.1) / 0.1; // 0 still … 1 fast
      const a = 0.28 + motion * 0.42;
      if (jx > 0.0008) this.fTipX += (rawTip.x - this.fTipX) * a;
      if (jy > 0.0008) this.fTipY += (rawTip.y - this.fTipY) * a;
      this.fSize += (rawSize - this.fSize) * 0.3;
    }
    const tipX = this.fTipX;
    const tipY = this.fTipY;
    const size = this.fSize;

    // Second-hand pinch latch (same palm-normalized hysteresis as main).
    // Computed before the cursor target so the depth slider can yield to
    // the two-hand scale gesture on the same frame the second pinch lands.
    let otherRatio = Infinity;
    if (other) {
      const oSize = Math.max(D(other[0], other[9]), 1e-4);
      const oPd = dist(other[4], other[8]);
      otherRatio = oPd / oSize;
      this.pinchState2 = nextPinchState(this.pinchState2, otherRatio, oSize);
    } else {
      if (this.pinchState2 && this.twoHandScaling) this.endTwoHandScale();
      this.pinchState2 = false;
    }
    const bothHeld = !!(other && this.pinchState && this.pinchState2);

    // CAMERA-RELATIVE control: displacement from the anchored hand pose,
    // projected onto the camera's own right / up / view axes.
    if (!this.anchor)
      this.anchor = {
        hx: tipX,
        hy: tipY,
        hs: size,
        base: this.target.clone(),
      };
    // Slow anchor creep: absorbs breathing/drift without fighting intent.
    this.anchor.hx += (tipX - this.anchor.hx) * 0.004;
    this.anchor.hy += (tipY - this.anchor.hy) * 0.004;
    this._camR.setFromMatrixColumn(this.camera.matrix, 0).normalize(); // screen-right
    this._camU.setFromMatrixColumn(this.camera.matrix, 1).normalize(); // screen-up
    this.camera.getWorldDirection(this._camF); // into the screen
    const dx = (this.anchor.hx - tipX) * 14; // mirrored feed: smaller x = hand moved right
    const dy = (this.anchor.hy - tipY) * 10;
    // depth: palm-size baseline fused with Depth Anything V2 when enabled.
    // The neural sample is ignored while stale/low-confidence, so the cursor
    // never depends on it — worst case is pure palm baseline.
    this.palm.observe(size);
    const palmS = this.palm.sample();
    let dzRaw = palmS ? palmS.dzMeters : 0;
    if (this.depthOn) dzRaw = fuseDepth(dzRaw, this.mono.sample(tipX, tipY));
    // rate-limit depth so a lurch toward the camera can't teleport the cursor
    const dzDelta = THREE.MathUtils.clamp(dzRaw - this.smoothZ, -0.6, 0.6);
    this.smoothZ += dzDelta * 0.35;
    this.target
      .copy(this.anchor.base)
      .addScaledVector(this._camR, dx)
      .addScaledVector(this._camU, dy)
      .addScaledVector(this._camF, -this.smoothZ);
    if (other && !bothHeld) {
      // second hand height = depth slider along view axis.
      // Suspended while both hands are pinched — that spread owns scaling.
      const oy = other[8].y;
      const fOy = Number.isFinite(oy) ? oy : 0.5;
      this.target
        .copy(this.anchor.base)
        .addScaledVector(this._camR, dx)
        .addScaledVector(this._camU, dy)
        .addScaledVector(this._camF, (0.5 - fOy) * 8);
      // Zoom disabled: two-hand spread no longer moves the camera.
    }
    this.target.clamp(this.LIM_MIN, this.LIM_MAX);

    // pinch: thumb-index distance NORMALIZED by palm size, with hysteresis.
    // Survives near/far hands where absolute thresholds fail.
    const pd = dist(main[4], main[8]);
    const ratio = pd / size;
    const farGate = size > 0.035;
    if (!this.pinchState && farGate && ratio < 0.32) {
      this.pinchState = true;
      this.shiftAtDown = false; // hand taps never carry the mouse Shift modifier
      this.onPinchDown();
    } else if (this.pinchState && (ratio > 0.42 || !farGate)) {
      this.pinchState = false;
      this.onPinchUp();
    }
    const bothPinched = !!(other && this.pinchState && this.pinchState2);
    if (bothPinched && other) {
      if (this.rulerOn) {
        // Ruler owns the two-hand gesture while armed — measure, never scale;
        // the single-hand drag path stays frozen exactly as while scaling.
        this.updateRulerLabel(main, other);
        if (this.twoHandScaling) this.endTwoHandScale(true);
      } else {
        this.updateTwoHandScale(main, other);
        // While scaling, the single-hand drag path stays frozen (see
        // onPinchMove early-return + tick guard) so spread maps to size only.
        if (!this.twoHandScaling && this.pinchState) this.onPinchMove();
      }
    } else {
      // ruler armed but hands not both pinched → hide the label (also no
      // per-frame work at all while this.rulerOn is false)
      if (this.rulerOn && this.rulerLabel) this.rulerLabel.visible = false;
      if (this.twoHandScaling) this.endTwoHandScale();
      if (this.pinchState) this.onPinchMove();
    }

    // fist: no fingers extended — require 3 stable frames before arming the timer
    const open =
      (extended(main, 8, 6) ? 1 : 0) +
      (extended(main, 12, 10) ? 1 : 0) +
      (extended(main, 16, 14) ? 1 : 0) +
      (extended(main, 20, 18) ? 1 : 0);
    const thumbOpen = D(main[4], main[0]) > D(main[3], main[0]) * 1.25;
    const isFist = open === 0 && !thumbOpen;
    this.fistFrames = isFist ? this.fistFrames + 1 : 0;
    if (this.fistFrames >= 3) {
      if (!this.fistSince) this.fistSince = performance.now();
      if (performance.now() - this.fistSince > 600) {
        this.onFistHold();
        this.fistFrames = 0;
      }
    } else {
      this.fistSince = 0;
    }

    const handOpen = open === 4 && thumbOpen;
    this.setText(
      "t-pinch",
      this.twoHandScaling
        ? `SCALE x${this.scaleFactor.toFixed(2)}`
        : this.pinchState
          ? `PINCH ${ratio.toFixed(2)}`
          : this.fistSince
            ? "fist…"
            : handOpen
              ? "open"
              : "track",
    );
  }

  /* ---------- frame ---------- */

  private tick = (): void => {
    if (this.disposed) return;
    this.tickRaf = requestAnimationFrame(this.tick);
    if (document.hidden) {
      this.wasHidden = true;
      return;
    }
    if (this.wasHidden) {
      // Drain the elapsed time accrued while hidden. Without this the first
      // visible frame reports a 50ms dt (the clamp ceiling), which poisons the
      // frame-time EMA and can trigger a spurious pixel-ratio step-down.
      this.wasHidden = false;
      this.clock.getDelta();
      this.emaDt = 16;
    }
    // Record the raw frame delta before the clamp: the clamp exists to
    // protect the animation EMA, while perf.render must see real jank.
    const rawDtMs = this.clock.getDelta() * 1000;
    perf.render.push(rawDtMs, performance.now());
    const dt = Math.min(rawDtMs / 1000, 0.05);
    const t = this.clock.elapsedTime;
    if (this.reducedMotion) {
      // Follow input exactly (no trailing lerp); the decorative ring spin and
      // z-axis pulse below are skipped instead.
      this.cursor.position.copy(this.target);
    } else {
      this.cursor.position.lerp(
        this.target,
        1 - Math.pow(0.0015, dt),
      ); // smooth follow
    }
    // lookAt() rebuilds the quaternion, so the decorative spin must come
    // after it — otherwise lookAt overwrites the rotation every frame.
    this.ring.lookAt(this.camera.position);
    if (!this.reducedMotion) {
      this.ring.rotation.z += dt * 1.2;
      this.zAxis.scale.y = 1 + Math.sin(t * 3) * 0.15;
    }
    const cx = this.cursor.position.x;
    const cy = this.cursor.position.y;
    const cz = this.cursor.position.z;
    if (
      Math.abs(cx - this.lastDropX) > 1e-5 ||
      Math.abs(cy - this.lastDropY) > 1e-5 ||
      Math.abs(cz - this.lastDropZ) > 1e-5
    ) {
      this.lastDropX = cx;
      this.lastDropY = cy;
      this.lastDropZ = cz;
      const p = this.dropLine.geometry.attributes.position as THREE.BufferAttribute;
      p.setXYZ(0, cx, cy, cz);
      p.setXYZ(1, cx, -2.6, cz);
      p.needsUpdate = true;
      this.dropLine.computeLineDistances();
    }

    // cursor tint: green = pinching, amber = line mode, themed = normal
    const cc = this.pinchHeld ? this.cursorPinch : this.lineMode ? this.cursorLine : this.cursorRest;
    if (cc !== this.lastCursorHex) {
      this.lastCursorHex = cc;
      (this.core.material as THREE.MeshBasicMaterial).color.setHex(cc);
      (this.ring.material as THREE.MeshBasicMaterial).color.setHex(cc);
      this.glow.color.setHex(cc);
    }

    // line-mode previews: rubber band + snap ring. The ring shows whenever
    // the cursor is near a snappable point or line — even before the chain
    // starts — so you can see what a tap would connect to.
    // Hover + snap walk the whole scene, so refresh every 3rd frame (~20Hz);
    // the markers interpolate visually between refreshes.
    const chaining =
      this.lineMode && this.activeLine && this.activeLine.pts.length > 0;
    this.previewLine.visible = !!chaining;
    if (this.hoverTick++ % 3 === 0) {
      this.cachedSnap =
        this.lineMode && !this.pinchHeld
          ? this.findSnapTarget(this.cursor.position, null, this.activeLine)
          : null;
      this.setHover(
        this.pinchHeld ? this.hovered : this.nearestTo(this.cursor.position, 0.8),
      );
    }
    const s = this.cachedSnap;
    if (chaining && this.activeLine) {
      const a = this.activeLine.pts[this.activeLine.pts.length - 1];
      const pp = this.previewLine.geometry.attributes
        .position as THREE.BufferAttribute;
      pp.setXYZ(0, a.x, a.y, a.z);
      const e = s ? s.pos : this.cursor.position;
      pp.setXYZ(1, e.x, e.y, e.z);
      pp.needsUpdate = true;
      this.previewLine.computeLineDistances();
    }
    this.snapMarker.visible = !!s;
    if (s) {
      this.snapMarker.position.copy(s.pos);
      this.snapMarker.lookAt(this.camera.position);
    }

    this.hoverRing.visible = !!this.hovered;
    if (this.hovered) {
      this.hoverRing.position.copy(this.hovered.position);
      this.hoverRing.lookAt(this.camera.position);
      this.hoverRing.scale.setScalar(
        (this.hovered.userData.hr as number | undefined) || 1,
      );
    }
    this.selectRing.visible = !!this.selected;
    if (this.selected) {
      this.selectRing.position.copy(this.selected.position);
      this.selectRing.lookAt(this.camera.position);
      this.selectRing.scale.setScalar(
        ((this.selected.userData.hr as number | undefined) || 1) * 1.12,
      );
    }
    if (this.grabbed && !this.twoHandScaling) {
      this.grabbed.position.copy(this.cursor.position).add(this.grabOffset);
      this.shadowsDirty = true;
    }
    if (this.grabbedHandle) this.shadowsDirty = true;
    if (this.twoHandScaling) this.shadowsDirty = true;

    if (this.handActive) {
      const s = this.screenOf(this.cursor.position);
      const c2d = this.opts.cursor2d;
      const vis = !s.behind;
      if (vis !== this.lastCur2dVis) {
        this.lastCur2dVis = vis;
        c2d.style.display = vis ? "block" : "none";
      }
      if (vis) {
        c2d.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
      }
      // Follow the active theme + colour scheme like the 3D ring: themed
      // rest colour, theme-aware pinch green. No hardcoded hex.
      const cc2d = this.pinchState ? this.cursorPinch : this.cursorRest;
      const cb = "#" + cc2d.toString(16).padStart(6, "0");
      if (cb !== this.lastCur2dBorder) {
        this.lastCur2dBorder = cb;
        c2d.style.borderColor = cb;
      }
    }

    if (++this.hudTick >= 6) {
      this.hudTick = 0; // HUD text at ~10Hz is plenty; skips DOM writes otherwise
      this.setText(
        "t-xyz",
        `${this.cursor.position.x.toFixed(1)}, ${this.cursor.position.y.toFixed(1)}, ${this.cursor.position.z.toFixed(1)}`,
      );
      this.setText("t-z", this.cursor.position.z.toFixed(1));
      const dw = (((this.cursor.position.z + 4) / 8) * 100).toFixed(1) + "%";
      if (this.hudCache.depthw !== dw) {
        this.hudCache.depthw = dw;
        this.opts.hud.depthi.style.width = dw;
      }
    }

    // adaptive resolution: hold frame time near 60fps by scaling pixel ratio.
    // iPad reacts every ~1s (60 frames) instead of ~2s — Safari kills
    // backgrounded/thermal tabs fast, so shed pixels before it does.
    this.emaDt = this.emaDt * 0.95 + dt * 1000 * 0.05;
    if (++this.prTick >= (this.isIPad ? 60 : 120)) {
      this.prTick = 0;
            const next = nextPixelRatio(this.prNow, this.emaDt, this.PR_MAX);
      if (next !== this.prNow) {
        this.prNow = next;
        this.renderer.setPixelRatio(next);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
      // Surface the ratio so an unexpectedly low value is visible rather than
      // mysterious. A healthy machine reads 2.00x and stays there.
      this.setText("t-pr", `render ${this.prNow.toFixed(2)}x`);
    }

    if (this.shadowsDirty) {
      this.shadowsDirty = false;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
