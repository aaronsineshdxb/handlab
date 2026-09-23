/**
 * Standalone VR engine for the isolated `/vr` page.
 * No MediaPipe, no Depth Anything, no 2D fallback — WebXR only.
 * Scene schema (v1) is wire-compatible with the desktop `HandLabEngine`
 * so scenes saved on `/` load on `/vr` and vice versa.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { XRHandModelFactory } from "three/examples/jsm/webxr/XRHandModelFactory.js";
import { requestVRSession } from "./xr/session";
import {
  clampTarget,
  isQuickTap,
  jointDistance,
  latchPinch,
  stickToDepthDZ,
  type Vec3,
} from "./xr/input";

export type VrShapeName =
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

export const VR_SHAPES: VrShapeName[] = [
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

export type VrXrState = "ready" | "presenting" | "unsupported";

export interface VrUiState {
  shape: VrShapeName;
  color: string;
  lineMode: boolean;
  grid: boolean;
  xr: VrXrState;
  count: number;
  hint: string;
}

export interface VrSceneObjectData {
  s: VrShapeName;
  c: string;
  p: [number, number, number];
  r: [number, number, number];
}

export interface VrSceneData {
  version: 1;
  objects: VrSceneObjectData[];
  chains: [number, number, number][][];
}

export interface VrEngineOpts {
  canvas: HTMLCanvasElement;
  toast: HTMLElement;
  onCount?: (n: number) => void;
  emit: (s: VrUiState) => void;
  onFatal?: (msg: string) => void;
}

function isNum3(a: unknown): a is [number, number, number] {
  return (
    Array.isArray(a) &&
    a.length === 3 &&
    a.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

const PLACE_MIN: Vec3 = [-4, -2.5, -3.9];
const PLACE_MAX: Vec3 = [4, 2.5, 3.9];
const STORE_KEY = "handlab.scene.v1"; // shared with desktop lab

export class VRHandLabEngine {
  private opts: VrEngineOpts;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group();
  private controls: OrbitControls | null = null;
  private grid: THREE.GridHelper;
  private clock = new THREE.Clock();

  private cursor = new THREE.Group();
  private core: THREE.Mesh;
  private ring: THREE.Mesh;
  private cursorPos = new THREE.Vector3(0, 0.2, -1.5);

  private spawnables: THREE.Mesh[] = [];
  private shape: VrShapeName = "cube";
  private color = "#4da3ff";
  private geoCache: Partial<Record<VrShapeName, THREE.BufferGeometry>> = {};
  private matCache: Record<string, THREE.MeshStandardMaterial> = {};
  private hovered: THREE.Mesh | null = null;
  private hoverRing: THREE.Mesh;
  private grabbed: THREE.Mesh | null = null;
  private grabOffset = new THREE.Vector3();

  // tap vs hold per input source ("c0" | "c1" | "h0" | "h1")
  private pressT = new Map<string, number>();
  private pressPos = new Map<string, THREE.Vector3>();
  private pressMoved = new Map<string, boolean>();

  // XR rigs
  private controllers: THREE.Group[] = [];
  private controllerGrips: THREE.Group[] = [];
  private lasers: THREE.Line[] = [];
  private hands: THREE.Group[] = [];
  private handPinched = [false, false];
  private rayLength = [3, 3];
  private presenting = false;

  // desktop preview fallback
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private mouseDownAt = 0;
  private mouseDownPos = new THREE.Vector3();

  // lines (lightweight chains)
  private lineMode = false;
  private chains: THREE.Vector3[][] = [];
  private chainGroup = new THREE.Group();
  private activeChain: THREE.Vector3[] | null = null;
  private segGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 10);
  private segMat = new THREE.MeshStandardMaterial({
    color: 0xffc94d,
    roughness: 0.4,
    metalness: 0.15,
    emissive: 0x2a1c00,
  });
  private handleGeo = new THREE.SphereGeometry(0.09, 16, 16);
  private handleMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
    emissive: 0x555555,
  });

  private disposed = false;
  private toastT: ReturnType<typeof setTimeout> | undefined;
  private _v1 = new THREE.Vector3();
  private _v2 = new THREE.Vector3();
  private _v3 = new THREE.Vector3();

  constructor(opts: VrEngineOpts) {
    this.opts = opts;
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: opts.canvas,
        antialias: true,
      });
    } catch (err) {
      throw new Error(
        "WebGL is unavailable — VR preview needs GPU canvas access.",
        { cause: err },
      );
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");

    this.scene.background = new THREE.Color(0x08090d);
    this.scene.fog = new THREE.Fog(0x08090d, 14, 30);

    this.camera = new THREE.PerspectiveCamera(
      55,
      window.innerWidth / window.innerHeight,
      0.05,
      100,
    );
    this.camera.position.set(0, 1.6, 3.2);
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    // desktop orbit preview (disabled while presenting)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 0.4, 0);
    this.controls.maxDistance = 16;
    this.controls.minDistance = 1;

    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x1a1410, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.1);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
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
    floor.position.y = -1.4;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(8.4, 5.4, 8)),
      new THREE.LineBasicMaterial({ color: 0x2a3350 }),
    );
    bounds.position.y = 0.4;
    this.scene.add(bounds);

    // cursor
    this.core = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 20, 20),
      new THREE.MeshBasicMaterial({ color: 0x4da3ff }),
    );
    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.12, 0.012, 10, 32),
      new THREE.MeshBasicMaterial({
        color: 0x4da3ff,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
      }),
    );
    this.ring.renderOrder = 999;
    this.cursor.add(this.core, this.ring);
    this.cursor.position.copy(this.cursorPos);
    this.scene.add(this.cursor);

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
    this.scene.add(this.chainGroup);

    this.setupXRInput();

    window.addEventListener("resize", this.onResize);
    opts.canvas.addEventListener("pointermove", this.onPointerMove);
    opts.canvas.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("keydown", this.onKeyDown);
    opts.canvas.addEventListener("webglcontextlost", this.onCtxLost);
    this.renderer.xr.addEventListener("sessionstart", this.onSessionStart);
    this.renderer.xr.addEventListener("sessionend", this.onSessionEnd);

    this.renderer.setAnimationLoop(this.tick);
    this.emit("desktop preview — Enter VR on a headset for hand tracking");
  }

  /* ---------------- XR input ---------------- */

  private setupXRInput(): void {
    const laserGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1),
    ]);
    for (let i = 0; i < 2; i++) {
      type XRController = THREE.Group & {
        addEventListener(type: string, listener: () => void): void;
      };
      const c = this.renderer.xr.getController(i) as XRController;
      c.add(
        new THREE.Line(
          laserGeo,
          new THREE.LineBasicMaterial({ color: 0x4da3ff, transparent: true, opacity: 0.7 }),
        ),
      );
      const idx = i;
      c.addEventListener("connected", () => {
        this.toast(idx === 0 ? "right input connected" : "left input connected");
      });
      c.addEventListener("selectstart", () => this.onSourceDown(`c${idx}`));
      c.addEventListener("selectend", () => this.onSourceUp(`c${idx}`));
      c.addEventListener("squeezestart", () => this.onGrabStart(`c${idx}`));
      c.addEventListener("squeezeend", () => this.onGrabEnd());
      this.rig.add(c);
      this.controllers.push(c);
      this.lasers.push(c.children[0] as THREE.Line);

      const grip = this.renderer.xr.getControllerGrip(i) as THREE.Group;
      this.rig.add(grip);
      this.controllerGrips.push(grip);

      const hand = this.renderer.xr.getHand(i) as THREE.Group;
      try {
        const factory = new XRHandModelFactory();
        hand.add(factory.createHandModel(hand, "mesh"));
      } catch {
        /* hand mesh optional — joints still tracked */
      }
      this.rig.add(hand);
      this.hands.push(hand);
    }
  }

  async enterVR(): Promise<boolean> {
    try {
      const session = await requestVRSession();
      await this.renderer.xr.setSession(session);
      return true;
    } catch (err) {
      console.error(err);
      this.toast("VR session failed — HTTPS + headset browser required");
      return false;
    }
  }

  async exitVR(): Promise<void> {
    const session = this.renderer.xr.getSession();
    if (session) await session.end().catch(() => undefined);
  }

  private onSessionStart = (): void => {
    this.presenting = true;
    this.controls?.saveState();
    if (this.controls) this.controls.enabled = false;
    this.emit("VR live — trigger = place, grip = grab, stick = depth");
    this.toast("VR live — trigger places, grip grabs");
  };

  private onSessionEnd = (): void => {
    this.presenting = false;
    this.grabbed = null;
    if (this.controls) this.controls.enabled = true;
    this.emit("desktop preview — Enter VR on a headset for hand tracking");
  };

  /* ---------------- shared press semantics ---------------- */

  private setCursorFromController(idx: number): void {
    const c = this.controllers[idx];
    this._v1.set(0, 0, 0);
    c.getWorldPosition(this._v1);
    this._v2.set(0, 0, -1).applyQuaternion(c.getWorldQuaternion(new THREE.Quaternion()));
    this.ray.set(this._v1, this._v2.normalize());
    this.ray.far = this.rayLength[idx];
    const hits = this.ray.intersectObjects(this.spawnables, false);
    if (hits.length > 0) {
      this.cursorPos.copy(hits[0].point);
      this.setHover(hits[0].object as THREE.Mesh);
    } else {
      this.cursorPos
        .copy(this._v1)
        .addScaledVector(this._v2, this.rayLength[idx]);
      const [x, y, z] = clampTarget([this.cursorPos.x, this.cursorPos.y, this.cursorPos.z]);
      this.cursorPos.set(x, y, z);
      this.setHover(this.nearestTo(this.cursorPos, 0.6));
    }
  }

  private onSourceDown(id: string): void {
    this.pressT.set(id, performance.now());
    this.pressPos.set(id, this.cursorPos.clone());
    this.pressMoved.set(id, false);
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(0x3ddc84);
    // grab candidate unless in line mode
    if (!this.lineMode) {
      const g = this.nearestTo(this.cursorPos, 1.0);
      if (g) {
        this.grabbed = g;
        this.grabOffset.copy(g.position).sub(this.cursorPos);
      }
    }
  }

  private onSourceUp(id: string): void {
    const downAt = this.pressT.get(id) ?? performance.now();
    const start = this.pressPos.get(id);
    const moved = start ? start.distanceTo(this.cursorPos) : 99;
    const quick = isQuickTap(downAt, performance.now(), moved);
    const wasGrabbing = this.grabbed !== null;
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(0x4da3ff);
    if (quick && !wasGrabbing) this.tapAction();
    if (!quick || !wasGrabbing) {
      // hold-release drops a grabbed object
      if (!(quick && wasGrabbing)) this.grabbed = null;
      else this.grabbed = null;
    } else {
      this.grabbed = null;
    }
    this.pressT.delete(id);
    this.pressMoved.delete(id);
  }

  private onGrabStart(id: string): void {
    const g = this.nearestTo(this.cursorPos, 1.2);
    if (g) {
      this.grabbed = g;
      this.grabOffset.copy(g.position).sub(this.cursorPos);
      this.toast("grabbed — move to drag, release grip to drop");
    } else {
      this.onSourceDown(id);
    }
  }

  private onGrabEnd(): void {
    this.grabbed = null;
  }

  private tapAction(): void {
    if (this.lineMode) {
      this.dropLinePoint(this.cursorPos);
      return;
    }
    const hit = this.nearestTo(this.cursorPos, 0.8);
    if (!hit) {
      this.placeAt(this.cursorPos);
      this.toast(`placed ${this.shape}`);
    } else {
      this.toast("selected");
    }
  }

  /* ---------------- objects ---------------- */

  private geoFor(s: VrShapeName): THREE.BufferGeometry {
    const hit = this.geoCache[s];
    if (hit) return hit;
    let g: THREE.BufferGeometry;
    switch (s) {
      case "cube": g = new THREE.BoxGeometry(0.62, 0.62, 0.62); break;
      case "sphere": g = new THREE.SphereGeometry(0.4, 32, 32); break;
      case "cone": g = new THREE.ConeGeometry(0.4, 0.8, 28); break;
      case "torus": g = new THREE.TorusGeometry(0.34, 0.13, 18, 40); break;
      case "cylinder": g = new THREE.CylinderGeometry(0.34, 0.34, 0.7, 28); break;
      case "icosa": g = new THREE.IcosahedronGeometry(0.46, 0); break;
      case "knot": g = new THREE.TorusKnotGeometry(0.34, 0.11, 90, 12); break;
      case "tetra": g = new THREE.TetrahedronGeometry(0.58); break;
      case "octa": g = new THREE.OctahedronGeometry(0.52); break;
      case "capsule": g = new THREE.CapsuleGeometry(0.28, 0.5, 6, 14); break;
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

  private placeAt(
    p: THREE.Vector3,
    s: VrShapeName = this.shape,
    c: string = this.color,
    rot?: [number, number, number],
  ): THREE.Mesh {
    const m = new THREE.Mesh(this.geoFor(s), this.matFor(c));
    const [x, y, z] = clampTarget([p.x, p.y, p.z], PLACE_MIN, PLACE_MAX);
    m.position.set(x, y, z);
    m.castShadow = true;
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    else m.rotation.set(Math.random() * 0.4, Math.random() * 0.8, 0);
    this.scene.add(m);
    this.spawnables.push(m);
    this.renderer.shadowMap.needsUpdate = true;
    this.setCount();
    this.emit();
    return m;
  }

  private nearestTo(p: THREE.Vector3, r = 1.0): THREE.Mesh | null {
    let best: THREE.Mesh | null = null;
    let bd = r;
    for (const m of this.spawnables) {
      const d = m.position.distanceTo(p);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  private setHover(m: THREE.Mesh | null): void {
    this.hovered = m;
    this.hoverRing.visible = !!m;
    if (m) {
      this.hoverRing.position.copy(m.position);
      const s = Math.max(m.scale.x, 1);
      this.hoverRing.scale.setScalar(s);
    }
  }

  /* ---------------- lines ---------------- */

  private dropLinePoint(p: THREE.Vector3): void {
    if (!this.activeChain) {
      this.activeChain = [p.clone()];
      this.chains.push(this.activeChain);
    } else {
      this.activeChain.push(p.clone());
    }
    this.rebuildChains();
    this.toast(`line point ${this.activeChain.length} — Finish to end`);
  }

  finishLine(): void {
    this.activeChain = null;
    this.emit();
  }

  private rebuildChains(): void {
    while (this.chainGroup.children.length) {
      const o = this.chainGroup.children.pop() as THREE.Object3D;
      this.chainGroup.remove(o);
    }
    for (const chain of this.chains) {
      for (let i = 0; i + 1 < chain.length; i++) {
        const a = chain[i];
        const b = chain[i + 1];
        const len = a.distanceTo(b);
        if (len < 1e-5) continue;
        const seg = new THREE.Mesh(this.segGeo, this.segMat);
        seg.position.copy(a).lerp(b, 0.5);
        seg.scale.set(1, len, 1);
        seg.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          this._v3.copy(b).sub(a).normalize(),
        );
        this.chainGroup.add(seg);
      }
      for (const p of chain) {
        const h = new THREE.Mesh(this.handleGeo, this.handleMat);
        h.position.copy(p);
        this.chainGroup.add(h);
      }
    }
    this.renderer.shadowMap.needsUpdate = true;
  }

  /* ---------------- public UI API ---------------- */

  setShape(s: VrShapeName): void { this.shape = s; this.emit(); }
  setColor(c: string): void { this.color = c; this.emit(); }
  setLineMode(on: boolean): void {
    this.lineMode = on;
    if (!on) this.activeChain = null;
    else this.toast("line mode — trigger drops points, Finish ends chain");
    this.emit();
  }
  toggleGrid(): void { this.grid.visible = !this.grid.visible; this.emit(); }
  undo(): void {
    const m = this.spawnables.pop();
    if (m) {
      this.scene.remove(m);
      this.renderer.shadowMap.needsUpdate = true;
    }
    this.setCount();
    this.emit();
  }
  clearAll(): void {
    for (const m of this.spawnables) this.scene.remove(m);
    this.spawnables.length = 0;
    this.setCount();
    this.emit();
  }
  clearLines(): void {
    this.chains.length = 0;
    this.activeChain = null;
    while (this.chainGroup.children.length)
      this.chainGroup.remove(this.chainGroup.children[0]);
    this.toast("lines cleared");
    this.emit();
  }

  exportScene(): VrSceneData {
    const shapeOf = (m: THREE.Mesh): VrShapeName => {
      for (const s of VR_SHAPES) if (this.geoFor(s) === m.geometry) return s;
      return "cube";
    };
    return {
      version: 1,
      objects: this.spawnables.map((m) => ({
        s: shapeOf(m),
        c: `#${(m.material as THREE.MeshStandardMaterial).color.getHexString()}`,
        p: [m.position.x, m.position.y, m.position.z],
        r: [m.rotation.x, m.rotation.y, m.rotation.z],
      })),
      chains: this.chains.map((ch) =>
        ch.map((p) => [p.x, p.y, p.z] as [number, number, number]),
      ),
    };
  }

  importScene(data: VrSceneData): boolean {
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
        !o || !VR_SHAPES.includes(o.s) || typeof o.c !== "string" ||
        !/^#[0-9a-fA-F]{6}$/.test(o.c) || !isNum3(o.p) || !isNum3(o.r)
      )
        return bad();
    }
    for (const ch of data.chains) {
      if (!Array.isArray(ch) || ch.length > 200 || !ch.every(isNum3)) return bad();
    }
    this.clearAll();
    this.clearLines();
    for (const o of data.objects)
      this.placeAt(new THREE.Vector3(o.p[0], o.p[1], o.p[2]), o.s, o.c, o.r);
    for (const ch of data.chains) {
      if (!ch.length) continue;
      const chain = ch.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
      this.chains.push(chain);
    }
    this.activeChain = null;
    this.rebuildChains();
    this.toast(`scene loaded — ${data.objects.length} objects`);
    this.emit();
    return true;
  }

  importSceneJson(text: string): boolean {
    try {
      return this.importScene(JSON.parse(text) as VrSceneData);
    } catch {
      this.toast("scene file is not valid JSON");
      return false;
    }
  }

  saveToStorage(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.exportScene()));
      this.toast("scene saved — shared with desktop lab");
    } catch {
      this.toast("scene save failed (storage full?)");
    }
  }

  loadFromStorage(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(STORE_KEY);
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

  /* ---------------- per-frame ---------------- */

  private pollHands(): void {
    for (let i = 0; i < this.hands.length; i++) {
      const hand = this.hands[i] as unknown as {
        joints?: Record<string, THREE.Object3D>;
      };
      const joints = hand.joints;
      if (!joints) continue;
      const thumb = joints["thumb-tip"];
      const index = joints["index-finger-tip"];
      if (!thumb || !index) continue;
      thumb.getWorldPosition(this._v1);
      index.getWorldPosition(this._v2);
      const d = jointDistance(
        { x: this._v1.x, y: this._v1.y, z: this._v1.z },
        { x: this._v2.x, y: this._v2.y, z: this._v2.z },
      );
      const was = this.handPinched[i];
      const now = latchPinch(d, was);
      this.handPinched[i] = now;
      const id = `h${i}`;
      if (now && !was) {
        // index fingertip becomes the cursor
        this.cursorPos.copy(this._v2);
        const [x, y, z] = clampTarget([this.cursorPos.x, this.cursorPos.y, this.cursorPos.z]);
        this.cursorPos.set(x, y, z);
        this.onSourceDown(id);
      } else if (!now && was) {
        this.onSourceUp(id);
      } else if (now) {
        this.cursorPos.copy(this._v2);
        const [x, y, z] = clampTarget([this.cursorPos.x, this.cursorPos.y, this.cursorPos.z]);
        this.cursorPos.set(x, y, z);
        if (this.grabbed) {
          this.grabbed.position.copy(this.cursorPos).add(this.grabOffset);
        }
      }
    }
  }

  private pollSticks(dt: number): void {
    const session = this.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      const gp = src.gamepad as Gamepad | null | undefined;
      if (!gp || gp.axes.length < 4) continue;
      // right stick Y (axes[3]) adjusts active ray depth
      const dz = stickToDepthDZ(gp.axes[3] ?? 0, 2.2, dt);
      if (dz !== 0) {
        const idx = src.handedness === "left" ? 1 : 0;
        this.rayLength[idx] = Math.min(6, Math.max(0.8, this.rayLength[idx] + dz));
      }
      // left stick Y (axes[1]) dollies the rig for comfort
      const dy = gp.axes[1] ?? 0;
      if (Math.abs(dy) > 0.2 && src.handedness === "left") {
        this.rig.position.y = Math.min(1, Math.max(-1, this.rig.position.y - dy * dt));
      }
    }
  }

  private tick = (): void => {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    if (this.presenting) {
      this.setCursorFromController(0);
      if (this.controllers[1]) {
        // keep second controller laser length in sync for hover feedback
        const c = this.controllers[1];
        this._v1.set(0, 0, 0);
        c.getWorldPosition(this._v1);
      }
      this.pollHands();
      this.pollSticks(dt);
      if (this.grabbed) {
        this.grabbed.position.copy(this.cursorPos).add(this.grabOffset);
      }
      const start = this.pressPos.get("c0");
      if (start && start.distanceTo(this.cursorPos) > 0.45)
        this.pressMoved.set("c0", true);
    } else {
      this.controls?.update();
    }
    this.cursor.position.copy(this.cursorPos);
    this.cursor.quaternion.copy(this.camera.getWorldQuaternion(new THREE.Quaternion()));
    this.renderer.render(this.scene, this.camera);
  };

  /* ---------------- desktop preview events ---------------- */

  private onResize = (): void => {
    if (this.presenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.presenting) return;
    this.ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.presenting) return;
    if ((e.target as HTMLElement) !== this.opts.canvas) return;
    this.mouseDownAt = performance.now();
    this.ndc.set(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1,
    );
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(this.spawnables, false);
    if (hits.length > 0) {
      this.mouseDownPos.copy(hits[0].point);
      this.cursorPos.copy(hits[0].point);
    } else {
      const t = -this.ray.ray.origin.z / (this.ray.ray.direction.z || -1);
      this._v1.copy(this.ray.ray.origin).addScaledVector(this.ray.ray.direction, Math.min(Math.max(t, 1), 8));
      const [x, y, z] = clampTarget([this._v1.x, this._v1.y, this._v1.z]);
      this.mouseDownPos.set(x, y, z);
      this.cursorPos.set(x, y, z);
    }
    this.onSourceDown("mouse");
  };

  private onPointerUp = (): void => {
    if (this.presenting) return;
    if (!this.pressT.has("mouse")) return;
    const downAt = this.pressT.get("mouse") ?? 0;
    const moved = this.mouseDownPos.distanceTo(this.cursorPos);
    this.pressT.delete("mouse");
    (this.core.material as THREE.MeshBasicMaterial).color.setHex(0x4da3ff);
    const wasGrabbing = this.grabbed !== null;
    if (isQuickTap(downAt, performance.now(), moved) && !wasGrabbing) this.tapAction();
    this.grabbed = null;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" || e.key === "Enter") {
      if (this.lineMode) this.finishLine();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (this.hovered) {
        this.scene.remove(this.hovered);
        this.spawnables = this.spawnables.filter((m) => m !== this.hovered);
        this.setHover(null);
        this.setCount();
        this.emit();
      }
    }
  };

  private onCtxLost = (e: Event): void => {
    e.preventDefault();
    this.opts.onFatal?.("The GPU (WebGL) context was lost — reload to retry.");
  };

  /* ---------------- helpers ---------------- */

  private setCount(): void {
    this.opts.onCount?.(this.spawnables.length);
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

  private emit(hint?: string): void {
    this.opts.emit({
      shape: this.shape,
      color: this.color,
      lineMode: this.lineMode,
      grid: this.grid.visible,
      xr: this.presenting ? "presenting" : "ready",
      count: this.spawnables.length,
      hint: hint ?? "",
    });
  }

  dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    window.removeEventListener("resize", this.onResize);
    this.opts.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.opts.canvas.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("keydown", this.onKeyDown);
    this.opts.canvas.removeEventListener("webglcontextlost", this.onCtxLost);
    this.renderer.xr.removeEventListener("sessionstart", this.onSessionStart);
    this.renderer.xr.removeEventListener("sessionend", this.onSessionEnd);
    if (this.toastT) clearTimeout(this.toastT);
    this.controls?.dispose();
    this.renderer.dispose();
  }
}
