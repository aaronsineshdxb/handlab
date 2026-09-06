import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type {
  HandLandmarker,
  NormalizedLandmark,
} from "@mediapipe/tasks-vision";

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
  | "capsule";

export type CamState = "idle" | "loading" | "live";

export interface UiState {
  shape: ShapeName;
  color: string;
  lineMode: boolean;
  snapOn: boolean;
  spin: boolean;
  grid: boolean;
  cam: CamState;
}

export const initialUiState: UiState = {
  shape: "cube",
  color: "#4da3ff",
  lineMode: false,
  snapOn: true,
  spin: true,
  grid: true,
  cam: "idle",
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
];

export interface HudNodes {
  "d-hand": HTMLElement;
  "t-hand": HTMLElement;
  "t-pinch": HTMLElement;
  "t-xyz": HTMLElement;
  "t-count": HTMLElement;
  "t-model": HTMLElement;
  "t-fps": HTMLElement;
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

const LABEL_FONT = '600 52px "IBM Plex Mono",monospace';

function makeLabel(color = "#ffd76a"): LabelSprite {
  const cv = document.createElement("canvas");
  cv.width = 256;
  cv.height = 128;
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  ) as LabelSprite;
  sp.scale.set(1.15, 0.58, 1);
  sp.renderOrder = 999;
  sp.userData.set = (t: string) => {
    if (sp.userData.last === t) return;
    sp.userData.last = t; // skip canvas redraws
    const g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, 256, 128);
    g.font = LABEL_FONT;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineWidth = 8;
    g.strokeStyle = "rgba(0,0,0,.85)";
    g.strokeText(t, 128, 64);
    g.fillStyle = color;
    g.fillText(t, 128, 64);
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
}

interface Anchor {
  hx: number;
  hy: number;
  hs: number;
  base: THREE.Vector3;
}

const TASKS_VISION_VERSION = "0.10.12";
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

// ponytail: rejects if the model/camera promises stall, so the UI can't hang on "Loading model…" forever
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>(
    (_, rej) =>
      (t = setTimeout(
        () => rej(new Error(`${what} timed out after ${ms / 1000}s`)),
        ms,
      )),
  );
  return Promise.race([p, limit]).finally(() => clearTimeout(t));
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
  private UP_Y = new THREE.Vector3(0, 1, 0);

  private spawnables: THREE.Mesh[] = [];
  private shape: ShapeName = "cube";
  private color = "#4da3ff";
  private geoCache: Partial<Record<ShapeName, THREE.BufferGeometry>> = {};
  private matCache: Record<string, THREE.MeshStandardMaterial> = {};
  private hrCache: Partial<Record<ShapeName, number>> = {};

  // pinch gesture state
  private pinchStartT = 0;
  private pinchStartPos = new THREE.Vector3();
  private pinchMoved = false;
  private uiDownEl: Element | null = null;

  // lines + measurement
  private lineMode = false;
  private snapOn = true;
  private activeLine: Polyline | null = null;
  private grabbedHandle: GrabbedHandle | null = null;
  private handleOffset = new THREE.Vector3();
  private polylines: Polyline[] = [];
  private junctionGroup = new THREE.Group();
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

  // hand tracking
  private handActive = false;
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private anchor: Anchor | null = null;
  private lastVideoT = -1;
  private pinchState = false;
  private prevTwoDist = 0;
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
  private zoomSm = 0;
  private mathTick = 0;

  // frame / HUD
  private hudCache: Record<string, string> = {};
  private hudTick = 0;
  private lastCur2dBorder = "";
  private prNow: number;
  private PR_MAX: number;
  private emaDt = 16;
  private prTick = 0;
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private frames = 0;
  private fT = 0;

  private tickRaf = 0;
  private handRaf = 0;
  private disposed = false;

  constructor(opts: EngineOpts) {
    this.opts = opts;
    const dpr = window.devicePixelRatio || 1;
    this.prNow = Math.min(dpr, 2);
    this.PR_MAX = Math.min(dpr, 2);

    /* ---------- renderer / scene ---------- */
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: opts.canvas,
        antialias: true,
      });
    } catch (err) {
      throw new Error(
        "WebGL is unavailable in this browser (context creation failed) — HANDLAB needs GPU canvas access.",
        { cause: err },
      );
    }
    this.renderer.setPixelRatio(Math.min(dpr, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false; // static scene: re-render shadows only when something moves

    this.scene.background = new THREE.Color(0x08090d);
    this.scene.fog = new THREE.Fog(0x08090d, 14, 30);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    this.camera.position.set(0, 2.2, 8.5);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.7;
    this.controls.maxDistance = 16;
    this.controls.minDistance = 3;

    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x1a1410, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x7c5cff, 1.1);
    rim.position.set(-5, 3, -4);
    this.scene.add(rim);

    this.grid = new THREE.GridHelper(14, 28, 0x2c3a55, 0x1a2133);
    this.scene.add(this.grid);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.32 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.6;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(8.4, 5.4, 8)),
      new THREE.LineBasicMaterial({ color: 0x2a3350 }),
    );
    this.scene.add(bounds);

    /* ---------- floating cursor (the 3-axis pointer) ---------- */
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0x4da3ff }),
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.26, 0.018, 12, 40),
      new THREE.MeshBasicMaterial({
        color: 0x4da3ff,
        transparent: true,
        opacity: 0.9,
      }),
    );
    this.zAxis = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 1, 8),
      new THREE.MeshBasicMaterial({
        color: 0x4da3ff,
        transparent: true,
        opacity: 0.45,
      }),
    );
    this.zAxis.rotation.x = Math.PI / 2;
    this.glow = new THREE.PointLight(0x4da3ff, 12, 6);
    this.glow.position.set(0, 0.2, 0);
    this.dropLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineDashedMaterial({
        color: 0x4da3ff,
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

    /* ---------- hover + selection rings ---------- */
    this.hoverRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.55, 0.025, 10, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffe27a,
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
    this.snapMarker = new THREE.Mesh(
      new THREE.TorusGeometry(0.2, 0.03, 10, 32),
      new THREE.MeshBasicMaterial({ color: 0x3ddc84 }),
    );
    this.snapMarker.visible = false;
    this.scene.add(this.snapMarker);
    this.previewLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineDashedMaterial({
        color: 0xffb224,
        dashSize: 0.12,
        gapSize: 0.08,
      }),
    );
    this.previewLine.visible = false;
    this.scene.add(this.previewLine);

    /* ---------- listeners ---------- */
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    opts.canvas.addEventListener("pointerdown", this.onCanvasPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("resize", this.onResize);

    this.sctx = opts.skel.getContext("2d");

    /* ---------- starter objects ---------- */
    const starterShapes: ShapeName[] = ["cube", "sphere", "torus", "cone", "icosa"];
    const starterColors = ["#4da3ff", "#7c5cff", "#3ddc84", "#ffb224", "#ff5d7a"];
    for (let i = 0; i < 5; i++) {
      this.placeAt(
        new THREE.Vector3((i - 2) * 1.3, Math.sin(i) * 0.6, -1 + (i % 2)),
        starterShapes[i],
        starterColors[i],
      );
    }

    const self = this;
    (window as unknown as Record<string, unknown>).__lab = {
      get polylines() {
        return self.getMeasurements();
      },
      target: this.target,
      cursor: this.cursor,
    };

    this.fT = performance.now();
    this.tick();
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.tickRaf);
    cancelAnimationFrame(this.handRaf);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("wheel", this.onWheel);
    this.opts.canvas.removeEventListener(
      "pointerdown",
      this.onCanvasPointerDown,
    );
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("resize", this.onResize);
    if (this.toastT) clearTimeout(this.toastT);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
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
    this.toast("recentered — hold hand still, move from here");
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
    this.emitCam("loading");
    try {
      const { FilesetResolver, HandLandmarker } = await import(
        "@mediapipe/tasks-vision"
      );
      const files = await FilesetResolver.forVisionTasks(WASM_URL);
      this.landmarker = await withTimeout(
        HandLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }),
        30000,
        "model load",
      );
      const stream = await withTimeout(
        navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
        }),
        30000,
        "camera",
      );
      this.stream = stream;
      const video = this.opts.video;
      video.srcObject = stream;
      await video.play();
      this.setText("t-model", "hand model: live");
      this.emitCam("live");
      this.toast("webcam live — move your index finger");
      this.handLoop(performance.now());
    } catch (err) {
      this.emitCam("idle");
      const msg = err instanceof Error ? err.message : String(err);
      this.toast("camera/model failed: " + msg);
      console.error(err);
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
  }

  /* ---------- objects ---------- */

  private geoFor(s: ShapeName): THREE.BufferGeometry {
    const hit = this.geoCache[s];
    if (hit) return hit;
    let g: THREE.BufferGeometry;
    switch (s) {
      case "cube":
        g = new THREE.BoxGeometry(0.62, 0.62, 0.62);
        break;
      case "sphere":
        g = new THREE.SphereGeometry(0.4, 32, 32);
        break;
      case "cone":
        g = new THREE.ConeGeometry(0.4, 0.8, 28);
        break;
      case "torus":
        g = new THREE.TorusGeometry(0.34, 0.13, 18, 40);
        break;
      case "cylinder":
        g = new THREE.CylinderGeometry(0.34, 0.34, 0.7, 28);
        break;
      case "icosa":
        g = new THREE.IcosahedronGeometry(0.46, 0);
        break;
      case "knot":
        g = new THREE.TorusKnotGeometry(0.34, 0.11, 90, 12);
        break;
      case "tetra":
        g = new THREE.TetrahedronGeometry(0.58);
        break;
      case "octa":
        g = new THREE.OctahedronGeometry(0.52);
        break;
      case "capsule":
        g = new THREE.CapsuleGeometry(0.28, 0.5, 6, 14);
        break;
    }
    this.geoCache[s] = g;
    return g;
  }

  private matFor(c: string): THREE.MeshStandardMaterial {
    const hit = this.matCache[c];
    if (hit) return hit;
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(c),
      roughness: 0.32,
      metalness: 0.25,
    });
    this.matCache[c] = m;
    return m;
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
  ): THREE.Mesh {
    const m = new THREE.Mesh(this.geoFor(s), this.matFor(c));
    m.position.copy(p).clamp(this.PLACE_MIN, this.PLACE_MAX);
    m.castShadow = true;
    m.rotation.set(Math.random() * 0.4, Math.random() * 0.8, 0);
    m.userData.hr = this.hrFor(s);
    this.scene.add(m);
    this.spawnables.push(m);
    this.shadowsDirty = true;
    this.setCount();
    return m;
  }

  private nearestTo(p: THREE.Vector3, r = 1.0): THREE.Mesh | null {
    let best: THREE.Mesh | null = null;
    let bd = r;
    for (const m of this.spawnables) {
      const d = m.position.distanceTo(p);
      if (d < bd) {
        bd = d;
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
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(0x3ddc84);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(0x3ddc84);
    this.grabbedHandle = this.nearestHandle(this.cursor.position, 1.0);
    if (this.grabbedHandle) {
      this.handleOffset
        .copy(this.grabbedHandle.L.pts[this.grabbedHandle.idx])
        .sub(this.cursor.position);
      this.grabbed = null;
    } else {
      this.grabbed = this.nearestTo(this.cursor.position, 1.0);
      if (this.lineMode) this.grabbed = null;
    }
    if (this.grabbed)
      this.grabOffset.copy(this.grabbed.position).sub(this.cursor.position);
    this.pressUIAtCursor(true);
  }

  private onPinchUp(): void {
    const quick =
      performance.now() - this.pinchStartT < 380 && !this.pinchMoved;
    this.pinchHeld = false;
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(0x4da3ff);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(0x4da3ff);
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
        } else if (this.lineMode) {
          this.placeLinePoint(this.cursor.position);
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
    this.emitMath();
  }

  private onPinchMove(): void {
    if (this.pinchStartPos.distanceTo(this.cursor.position) > 0.45)
      this.pinchMoved = true;
    if (this.grabbed)
      this.grabbed.position.copy(this.cursor.position).add(this.grabOffset);
    if (this.grabbedHandle) {
      const s = this.findSnapTarget(this.cursor.position, this.grabbedHandle);
      this._v1
        .copy(this.cursor.position)
        .add(this.handleOffset)
        .clamp(this.LIM_MIN, this.LIM_MAX);
      this.grabbedHandle.L.pts[this.grabbedHandle.idx].copy(s ? s.pos : this._v1);
      this.updateLine(this.grabbedHandle.L); // transforms only — junctions refresh on release
      if (++this.mathTick % 6 === 0) this.emitMath();
    }
  }

  /* ---------- fist = right-click/delete ---------- */

  private onFistHold(): void {
    const v =
      this.grabbed ||
      this.hovered ||
      this.nearestTo(this.cursor.position, 1.0);
    if (v) {
      this.scene.remove(v);
      this.spawnables.splice(this.spawnables.indexOf(v), 1);
      this.shadowsDirty = true;
      this.setCount();
      if (this.grabbed === v) this.grabbed = null;
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
    const hit = el?.closest?.("button,.sw") as HTMLElement | null;
    const cursor2d = this.opts.cursor2d;
    cursor2d.style.display = "block";
    cursor2d.style.left = x + "px";
    cursor2d.style.top = y + "px";
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

  private onWheel = (e: WheelEvent): void => {
    if (this.handActive) return;
    this.camera.getWorldDirection(this._v1);
    this.target
      .addScaledVector(this._v1, -Math.sign(e.deltaY) * 0.4)
      .clamp(this.LIM_MIN, this.LIM_MAX);
  };

  private onCanvasPointerDown = (): void => {
    if (this.handActive) return;
    this.mouseDown = true;
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
      const lab = makeLabel("#7cf7ff");
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
      L.sumLabel = makeLabel(closed ? "#8affc1" : "#ffd76a");
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
      L.sumLabel.userData.set(
        `L ${total.toFixed(2)}m · A ${area.toFixed(2)}m²`,
      );
    } else {
      L.sumLabel.userData.set(
        `L ${total.toFixed(2)}m · ${L.pts.length - 1} seg`,
      );
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
      return {
        id,
        pts: L.pts.map(
          (p) => [p.x, p.y, p.z] as [number, number, number],
        ),
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
      };
    });
  }

  private emitMath(): void {
    this.opts.onMath?.(this.getMeasurements());
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
        const lab = makeLabel("#ff9de2");
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
  ): SnapTarget | null {
    if (!this.snapOn) return null;
    let best: SnapTarget | null = null;
    let bd = this.SNAP_R;
    this.polylines.forEach((L) =>
      L.pts.forEach((q, i) => {
        if (exclude && exclude.L === L && exclude.idx === i) return;
        const d = p.distanceTo(q);
        if (d < bd) {
          bd = d;
          best = { pos: q.clone(), L, idx: i };
        }
      }),
    );
    return best;
  }

  private nearestHandle(p: THREE.Vector3, r = 1.0): GrabbedHandle | null {
    let best: GrabbedHandle | null = null;
    let bd = r;
    this.polylines.forEach((L) =>
      L.pts.forEach((q, i) => {
        const d = p.distanceTo(q);
        if (d < bd) {
          bd = d;
          best = { L, idx: i };
        }
      }),
    );
    return best;
  }

  private placeLinePoint(p: THREE.Vector3): void {
    const s = this.findSnapTarget(p);
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
    this.toast(s ? "snapped + point added" : "point added");
    this.emitMath();
  }

  /* ---------- keyboard ---------- */

  private onKeyDown = (e: KeyboardEvent): void => {
    if (
      (e.key >= "1" && e.key <= "9") ||
      e.key === "0"
    ) {
      const i = e.key === "0" ? 9 : +e.key - 1;
      if (i < SHAPES.length) this.setShape(SHAPES[i]);
    }
    if (e.key === "r" || e.key === "R") this.recenter();
    if (e.key === "l" || e.key === "L") this.setLineMode(!this.lineMode);
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
      this.spawnables.splice(this.spawnables.indexOf(v), 1);
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
    this.frames++;
    if (now - this.fT > 1000) {
      this.setText("t-fps", this.frames + " fps");
      this.frames = 0;
      this.fT = now;
    }
    const video = this.opts.video;
    if (
      !this.landmarker ||
      video.readyState < 2 ||
      video.currentTime === this.lastVideoT
    )
      return;
    this.lastVideoT = video.currentTime;
    let res: {
      landmarks?: NormalizedLandmark[][];
      handednesses?: { categoryName?: string }[][];
    };
    try {
      res = this.landmarker.detectForVideo(video, now) as unknown as typeof res;
    } catch {
      return;
    }
    const hands = res.landmarks ?? [];
    this.drawSkel(hands, this.pinchState);
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
    this.drive(hands, res.handednesses);
  };

  private drawSkel(all: NormalizedLandmark[][] | undefined, pinched = false): void {
    if (!this.sctx) return;
    const g = this.sctx;
    g.clearRect(0, 0, 248, 140);
    (all || []).forEach((lm) => {
      g.strokeStyle = pinched
        ? "rgba(61,220,132,.95)"
        : "rgba(77,163,255,.9)";
      g.lineWidth = 1.4;
      g.beginPath();
      EDGES.forEach(([a, b]) => {
        g.moveTo((1 - lm[a].x) * 248, lm[a].y * 140);
        g.lineTo((1 - lm[b].x) * 248, lm[b].y * 140);
      });
      g.stroke();
      g.fillStyle = pinched ? "#3ddc84" : "#9cc6ff";
      lm.forEach((p, i) => {
        if (i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20) {
          g.beginPath();
          g.arc((1 - p.x) * 248, p.y * 140, i === 8 || i === 4 ? 3.2 : 2.2, 0, 7);
          g.fill();
        }
      });
    });
  }

  private setHandUI(on: boolean, n = 0): void {
    this.opts.hud["d-hand"].className = "dot " + (on ? "on" : "off");
    this.opts.hud["t-hand"].textContent = on
      ? `${n} hand${n > 1 ? "s" : ""}`
      : "none";
    if (!on) {
      this.handActive = false;
      this.opts.cursor2d.style.display = "none";
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
    const dzRaw = (size - this.anchor.hs) * 45;
    // rate-limit depth so a lurch toward the camera can't teleport the cursor
    const dzDelta = THREE.MathUtils.clamp(dzRaw - this.smoothZ, -0.6, 0.6);
    this.smoothZ += dzDelta * 0.35;
    this.target
      .copy(this.anchor.base)
      .addScaledVector(this._camR, dx)
      .addScaledVector(this._camU, dy)
      .addScaledVector(this._camF, -this.smoothZ);
    if (other) {
      // second hand height = depth slider along view axis
      const oy = other[8].y;
      const fOy = Number.isFinite(oy) ? oy : 0.5;
      this.target
        .copy(this.anchor.base)
        .addScaledVector(this._camR, dx)
        .addScaledVector(this._camU, dy)
        .addScaledVector(this._camF, (0.5 - fOy) * 8);
      const d = Math.hypot(other[8].x - rawTip.x, other[8].y - rawTip.y);
      if (this.prevTwoDist && Math.abs(d - this.prevTwoDist) > 0.008) {
        const step = THREE.MathUtils.clamp(
          1 - (d - this.prevTwoDist) * 1.4,
          0.97,
          1.03,
        );
        this.zoomSm += (step - this.zoomSm) * 0.5;
        if (this.zoomSm !== 0) this.camera.position.multiplyScalar(1 + (this.zoomSm - 1));
      }
      this.prevTwoDist = d;
    } else {
      this.prevTwoDist = 0;
      this.zoomSm = 0;
    }
    this.target.clamp(this.LIM_MIN, this.LIM_MAX);

    // pinch: thumb-index distance NORMALIZED by palm size, with hysteresis.
    // Survives near/far hands where absolute thresholds fail.
    const pd = dist(main[4], main[8]);
    const ratio = pd / size;
    const farGate = size > 0.035;
    if (!this.pinchState && farGate && ratio < 0.32) {
      this.pinchState = true;
      this.onPinchDown();
    } else if (this.pinchState && (ratio > 0.42 || !farGate)) {
      this.pinchState = false;
      this.onPinchUp();
    }
    if (this.pinchState) this.onPinchMove();

    // fist: no fingers extended — require 3 stable frames before arming the timer
    const open = [
      extended(main, 8, 6),
      extended(main, 12, 10),
      extended(main, 16, 14),
      extended(main, 20, 18),
    ].filter(Boolean).length;
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
      this.pinchState
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
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.cursor.position.lerp(
      this.target,
      1 - Math.pow(0.0015, dt),
    ); // smooth follow
    this.ring.lookAt(this.camera.position);
    this.ring.rotation.z += dt * 1.2;
    this.zAxis.scale.y = 1 + Math.sin(t * 3) * 0.15;
    const p = this.dropLine.geometry.attributes.position as THREE.BufferAttribute;
    p.setXYZ(0, this.cursor.position.x, this.cursor.position.y, this.cursor.position.z);
    p.setXYZ(1, this.cursor.position.x, -2.6, this.cursor.position.z);
    p.needsUpdate = true;
    this.dropLine.computeLineDistances();

    // cursor tint: green = pinching, amber = line mode, blue = normal
    const cc = this.pinchHeld ? 0x3ddc84 : this.lineMode ? 0xffb224 : 0x4da3ff;
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(cc);
    (this.ring.material as THREE.MeshBasicMaterial).color.setHex(cc);
    this.glow.color.setHex(cc);

    // line-mode previews: rubber band + snap ring
    const chaining =
      this.lineMode && this.activeLine && this.activeLine.pts.length > 0;
    this.previewLine.visible = !!chaining;
    if (chaining && this.activeLine) {
      const a = this.activeLine.pts[this.activeLine.pts.length - 1];
      const s = !this.pinchHeld
        ? this.findSnapTarget(this.cursor.position)
        : null;
      const pp = this.previewLine.geometry.attributes
        .position as THREE.BufferAttribute;
      pp.setXYZ(0, a.x, a.y, a.z);
      const e = s ? s.pos : this.cursor.position;
      pp.setXYZ(1, e.x, e.y, e.z);
      pp.needsUpdate = true;
      this.previewLine.computeLineDistances();
      this.snapMarker.visible = !!s;
      if (s) {
        this.snapMarker.position.copy(s.pos);
        this.snapMarker.lookAt(this.camera.position);
      }
    } else {
      this.snapMarker.visible = false;
    }

    this.setHover(
      this.pinchHeld ? this.hovered : this.nearestTo(this.cursor.position, 0.8),
    );
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
    if (this.grabbed) {
      this.grabbed.position.copy(this.cursor.position).add(this.grabOffset);
      this.shadowsDirty = true;
    }
    if (this.grabbedHandle) this.shadowsDirty = true;

    if (this.handActive) {
      const s = this.screenOf(this.cursor.position);
      const c2d = this.opts.cursor2d;
      c2d.style.display = s.behind ? "none" : "block";
      c2d.style.left = s.x + "px";
      c2d.style.top = s.y + "px";
      const cb = this.pinchState ? "#3ddc84" : "#4da3ff";
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

    // adaptive resolution: hold frame time near 60fps by scaling pixel ratio
    this.emaDt = this.emaDt * 0.95 + dt * 1000 * 0.05;
    if (++this.prTick >= 120) {
      this.prTick = 0;
      if (this.emaDt > 26 && this.prNow > 1) {
        this.prNow = Math.max(1, this.prNow - 0.25);
        this.renderer.setPixelRatio(this.prNow);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      } else if (this.emaDt < 13 && this.prNow < this.PR_MAX) {
        this.prNow = Math.min(this.PR_MAX, this.prNow + 0.25);
        this.renderer.setPixelRatio(this.prNow);
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    }

    if (this.shadowsDirty) {
      this.shadowsDirty = false;
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
