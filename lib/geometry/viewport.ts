/**
 * 3D Viewport / Overlay Helpers — presentation showcase renderer.
 * Owns: scene lifecycle, OrbitControls, lighting, grid, parametric mesh,
 * dimension overlays, wireframe / normals / vertex dots, clipping plane,
 * material modes. Pure Three.js; React only pushes settings in.
 */
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ShowcaseShapeId, ShapeDims } from "./math";
import { withDims } from "./math";

export type MaterialMode = "pastel" | "clay" | "cad" | "flat";
export type ClipAxis = "x" | "y" | "z" | null;

export interface ShowcaseSettings {
  shape: ShowcaseShapeId;
  dims: ShapeDims;
  wireframe: boolean;
  showNormals: boolean;
  showVertices: boolean;
  /** 0..2 — tessellation level for sphere/dome/icosa */
  detail: number;
  clipAxis: ClipAxis;
  /** world-space slice position */
  clipPos: number;
  material: MaterialMode;
  spin: boolean;
  grid: boolean;
  showDims: boolean;
}

export const DEFAULT_SETTINGS: ShowcaseSettings = {
  shape: "cylinder",
  dims: { a: 3, w: 4, h: 5, d: 3, r: 2, R: 2.6 },
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
};

/** Presentation palette — soft off-white canvas, slate ink, pastel solids. */
export const STAGE = {
  bg: 0xf8fafc,
  gridCenter: 0xcbd5e1,
  gridMain: 0xe2e8f0,
  bounds: 0xe2e8f0,
  ink: 0x0f172a,
  accent: 0x0ea5e9,
};

const PASTEL: Record<ShowcaseShapeId, number> = {
  cube: 0x93c5fd,
  prism: 0xf9a8d4,
  sphere: 0x7dd3fc,
  cylinder: 0x5eead4,
  cone: 0xfda4af,
  pyramid: 0xfcd34d,
  torus: 0xc4b5fd,
  dome: 0x6ee7b7,
  hexPrism: 0xfca5a5,
  triPrism: 0xfdba74,
  capsule: 0xbae6fd,
  icosa: 0xddd6fe,
  tetra: 0xa5f3d6,
  octa: 0xfbcfe8,
};

function makeTextSprite(): THREE.Sprite & { set(t: string): void; _last?: string } {
  const cv = document.createElement("canvas");
  cv.width = 256; cv.height = 96;
  const tex = new THREE.CanvasTexture(cv);
  const sp = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }),
  ) as THREE.Sprite & { set(t: string): void; _last?: string };
  sp.scale.set(1.25, 0.47, 1);
  sp.renderOrder = 50;
  sp.set = (t: string) => {
    if (sp._last === t) return;
    sp._last = t;
    const g = cv.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, 256, 96);
    // pill background
    g.fillStyle = "rgba(15,23,42,0.88)";
    g.beginPath();
    const gg = g as CanvasRenderingContext2D & { roundRect?: (x: number, y: number, w: number, h: number, r: number) => void };
    if (gg.roundRect) gg.roundRect(8, 14, 240, 68, 34);
    else g.rect(8, 14, 240, 68);
    g.fill();
    g.font = '600 34px ui-monospace, Menlo, monospace';
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "#f8fafc";
    g.fillText(t, 128, 50);
    tex.needsUpdate = true;
  };
  return sp;
}

export class ShowcaseEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private grid: THREE.GridHelper;
  private hemi: THREE.HemisphereLight;
  private key: THREE.DirectionalLight;
  private rim: THREE.DirectionalLight;
  private mesh: THREE.Mesh | null = null;
  private edgeLines: THREE.LineSegments | null = null;
  private normalLines: THREE.LineSegments | null = null;
  private vertexPts: THREE.Points | null = null;
  private dimGroup = new THREE.Group();
  private sliceHelper: THREE.Mesh | null = null;
  private raf = 0;
  private disposed = false;
  private settings: ShowcaseSettings = { ...DEFAULT_SETTINGS };
  private clock = new THREE.Clock();
  private resizeObs: ResizeObserver | null = null;
  private dimSprites: THREE.Sprite[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    const parent = canvas.parentElement ?? document.body;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.localClippingEnabled = true;

    this.scene.background = new THREE.Color(STAGE.bg);
    this.scene.fog = new THREE.Fog(STAGE.bg, 12, 26);

    // Maximised viewport: tighter FOV + closer camera so the solid fills ~65%.
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0.6, 1.6, 5.4);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.15, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 12;
    this.controls.autoRotateSpeed = 1.1;

    this.hemi = new THREE.HemisphereLight(0xffffff, 0xe2e8f0, 1.0);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xffffff, 2.0);
    this.key.position.set(4, 7, 5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.scene.add(this.key);
    this.rim = new THREE.DirectionalLight(0x0ea5e9, 0.55);
    this.rim.position.set(-5, 3, -4);
    this.scene.add(this.rim);

    this.grid = new THREE.GridHelper(14, 28, STAGE.gridCenter, STAGE.gridMain);
    this.scene.add(this.grid);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.ShadowMaterial({ opacity: 0.16 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.9;
    floor.receiveShadow = true;
    this.scene.add(floor);

    this.scene.add(this.dimGroup);

    const resize = () => {
      const w = parent.clientWidth || window.innerWidth;
      const h = parent.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
    };
    resize();
    this.resizeObs = new ResizeObserver(resize);
    this.resizeObs.observe(parent);
    window.addEventListener("resize", resize);

    this.rebuild();
    this.tick();
  }

  set(s: Partial<ShowcaseSettings>): void {
    const shapeChanged = s.shape !== undefined && s.shape !== this.settings.shape;
    const dimsChanged = s.dims !== undefined;
    const detailChanged = s.detail !== undefined && s.detail !== this.settings.detail;
    Object.assign(this.settings, s);
    this.controls.autoRotate = this.settings.spin;
    this.grid.visible = this.settings.grid;
    this.dimGroup.visible = this.settings.showDims;
    if (shapeChanged || dimsChanged || detailChanged) this.rebuild();
    else this.applyOverlays();
  }

  resetView(): void {
    this.camera.position.set(0.6, 1.6, 5.4);
    this.controls.target.set(0, 0.15, 0);
  }

  exportPNG(): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      return this.renderer.domElement.toDataURL("image/png");
    } catch {
      return null;
    }
  }

  /** Live mesh topology (indexed geometry) for Studio readout. */
  meshStats(): { v: number; f: number; e: number; euler: number } | null {
    if (!this.mesh) return null;
    const g = this.mesh.geometry;
    const pos = g.attributes.position.count;
    const idx = g.index;
    const f = idx ? idx.count / 3 : pos / 3;
    const v = pos;
    const e = Math.round((3 * f) / 2);
    return { v, f: Math.round(f), e, euler: v - e + Math.round(f) };
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.controls.dispose();
    this.mesh?.geometry.dispose();
    (this.mesh?.material as THREE.Material | undefined)?.dispose?.();
    this.renderer.dispose();
  }

  // ---------- internals ----------

  private scaleFor(): number {
    // cm → world, then normalise so the longest side ≈ 2.9 world units (fills view).
    const d = withDims(this.settings.shape, this.settings.dims);
    let longest = 2;
    const s = this.settings.shape;
    if (s === "cube" || s === "icosa" || s === "tetra" || s === "octa") longest = d.a;
    else if (s === "prism") longest = Math.max(d.w, d.h, d.d);
    else if (s === "sphere" || s === "dome") longest = d.r * 2;
    else if (s === "cylinder" || s === "cone") longest = Math.max(d.r * 2, d.h);
    else if (s === "pyramid" || s === "hexPrism" || s === "triPrism") longest = Math.max(d.a, d.h);
    else if (s === "torus") longest = (d.R + d.r) * 2;
    else if (s === "capsule") longest = d.h + d.r * 2;
    const k = 0.34;
    const world = Math.max(longest * k, 0.001);
    return (2.9 / world) * k;
  }

  private buildGeometry(): THREE.BufferGeometry {
    const d = withDims(this.settings.shape, this.settings.dims);
    const k = this.scaleFor();
    const S = (v: number) => v * k;
    const det = this.settings.detail;
    switch (this.settings.shape) {
      case "cube": return new THREE.BoxGeometry(S(d.a), S(d.a), S(d.a));
      case "prism": return new THREE.BoxGeometry(S(d.w), S(d.h), S(d.d));
      case "sphere": {
        const seg = det === 0 ? 24 : det === 1 ? 48 : 64;
        return new THREE.SphereGeometry(S(d.r), seg, Math.max(16, seg / 2));
      }
      case "cylinder": return new THREE.CylinderGeometry(S(d.r), S(d.r), S(d.h), 56);
      case "cone": return new THREE.ConeGeometry(S(d.r), S(d.h), 56);
      case "pyramid": {
        const g = new THREE.ConeGeometry(S(d.a / Math.SQRT2), S(d.h), 4, 1);
        g.rotateY(Math.PI / 4);
        return g;
      }
      case "torus": return new THREE.TorusGeometry(S(d.R), S(d.r), 28, 72);
      case "dome": {
        const ws = det === 0 ? 24 : det === 1 ? 48 : 72;
        const g = new THREE.SphereGeometry(S(d.r), ws, Math.max(12, ws / 3), 0, Math.PI * 2, 0, Math.PI / 2);
        return g;
      }
      case "hexPrism": return new THREE.CylinderGeometry(S(d.a), S(d.a), S(d.h), 6);
      case "triPrism": return new THREE.CylinderGeometry(S(d.a), S(d.a), S(d.h), 3);
      case "capsule": return new THREE.CapsuleGeometry(S(d.r), S(d.h), 8, 28);
      case "tetra": return new THREE.TetrahedronGeometry(S(d.a * 0.95));
      case "octa": return new THREE.OctahedronGeometry(S(d.a * 0.95));
      case "icosa": return new THREE.IcosahedronGeometry(S(d.a * 0.95), det >= 2 ? 1 : 0);
    }
  }

  private materialFor(): THREE.Material {
    const { material } = this.settings;
    const color = PASTEL[this.settings.shape];
    const clip = this.clipPlanes();
    const base = { clippingPlanes: clip, clipShadows: true };
    if (material === "clay") {
      return new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.92, metalness: 0, ...base });
    }
    if (material === "flat") {
      return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, flatShading: true, ...base });
    }
    if (material === "cad") {
      return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1, ...base });
    }
    return new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.08, ...base });
  }

  private clipPlanes(): THREE.Plane[] {
    const { clipAxis, clipPos } = this.settings;
    if (!clipAxis) return [];
    if (clipAxis === "x") return [new THREE.Plane(new THREE.Vector3(-1, 0, 0), clipPos)];
    if (clipAxis === "y") return [new THREE.Plane(new THREE.Vector3(0, -1, 0), clipPos)];
    return [new THREE.Plane(new THREE.Vector3(0, 0, -1), clipPos)];
  }

  private rebuild(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      (this.mesh.material as THREE.Material).dispose();
      this.mesh = null;
    }
    this.clearOverlays();
    const geo = this.buildGeometry();
    geo.computeVertexNormals();
    this.mesh = new THREE.Mesh(geo, this.materialFor());
    this.mesh.castShadow = true;
    // Centre vertically: domes sit on the floor, everything else centred.
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const cy = (bb.max.y + bb.min.y) / 2;
    this.mesh.position.y = this.settings.shape === "dome" ? -bb.min.y - 1.55 : 0.15 - cy * 0.15;
    // Nudge dome down so its base rests near the grid.
    if (this.settings.shape === "dome") this.mesh.position.y = -0.4 - bb.min.y;
    else this.mesh.position.y = 0.15;
    this.scene.add(this.mesh);
    this.applyOverlays();
  }

  private clearOverlays(): void {
    if (this.edgeLines) { this.scene.remove(this.edgeLines); this.edgeLines.geometry.dispose(); (this.edgeLines.material as THREE.Material).dispose(); this.edgeLines = null; }
    if (this.normalLines) { this.scene.remove(this.normalLines); this.normalLines.geometry.dispose(); (this.normalLines.material as THREE.Material).dispose(); this.normalLines = null; }
    if (this.vertexPts) { this.scene.remove(this.vertexPts); this.vertexPts.geometry.dispose(); (this.vertexPts.material as THREE.Material).dispose(); this.vertexPts = null; }
    if (this.sliceHelper) { this.scene.remove(this.sliceHelper); this.sliceHelper.geometry.dispose(); (this.sliceHelper.material as THREE.Material).dispose(); this.sliceHelper = null; }
    while (this.dimGroup.children.length) {
      const o = this.dimGroup.children.pop()!;
      this.dimGroup.remove(o);
      const m = o as THREE.Mesh;
      (m.geometry as THREE.BufferGeometry | undefined)?.dispose?.();
      ((m.material as THREE.Material | undefined))?.dispose?.();
    }
    this.dimSprites = [];
  }

  private applyOverlays(): void {
    if (!this.mesh) return;
    this.clearOverlays();
    const s = this.settings;
    const geo = this.mesh.geometry;
    // keep material clipping in sync without a full rebuild
    (this.mesh.material as THREE.Material).clippingPlanes = this.clipPlanes();

    // CAD edges — technical highlight
    if (s.material === "cad" || s.wireframe) {
      const edges = new THREE.EdgesGeometry(geo, 24);
      this.edgeLines = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: s.material === "cad" ? 0x0f172a : 0x0ea5e9 }),
      );
      this.edgeLines.position.copy(this.mesh.position);
      this.edgeLines.rotation.copy(this.mesh.rotation);
      this.scene.add(this.edgeLines);
    }
    if (s.wireframe) {
      (this.mesh.material as THREE.MeshStandardMaterial).wireframe = true;
    }

    // vertex dots
    if (s.showVertices) {
      const pts = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: 0x0f172a, size: 0.045, sizeAttenuation: true, depthTest: false }),
      );
      pts.position.copy(this.mesh.position);
      pts.renderOrder = 20;
      this.vertexPts = pts;
      this.scene.add(pts);
    }

    // normal vectors — sample every Nth vertex
    if (s.showNormals) {
      const pos = geo.attributes.position;
      const nor = geo.attributes.normal;
      const step = Math.max(1, Math.floor(pos.count / 220));
      const arr: number[] = [];
      const v = new THREE.Vector3(); const n = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i); n.fromBufferAttribute(nor, i);
        arr.push(v.x, v.y, v.z, v.x + n.x * 0.32, v.y + n.y * 0.32, v.z + n.z * 0.32);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
      this.normalLines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x7c3aed }));
      this.normalLines.position.copy(this.mesh.position);
      this.scene.add(this.normalLines);
    }

    // slice helper plane
    if (s.clipAxis) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
      const pg = new THREE.PlaneGeometry(4.4, 4.4);
      this.sliceHelper = new THREE.Mesh(pg, mat);
      const p = s.clipPos + this.mesh.position.y * (s.clipAxis === "y" ? 0 : 0);
      void p;
      if (s.clipAxis === "x") { this.sliceHelper.rotation.y = Math.PI / 2; this.sliceHelper.position.x = s.clipPos; }
      if (s.clipAxis === "y") { this.sliceHelper.rotation.x = -Math.PI / 2; this.sliceHelper.position.y = THREE.MathUtils.clamp(s.clipPos, -1.8, 1.8); }
      if (s.clipAxis === "z") { this.sliceHelper.position.z = s.clipPos; }
      this.scene.add(this.sliceHelper);
    }

    if (s.showDims) this.buildDims();
  }

  private dimLine(a: THREE.Vector3, b: THREE.Vector3, label: string, lift = 0): void {
    const g = new THREE.BufferGeometry().setFromPoints([a, b]);
    const line = new THREE.Line(g, new THREE.LineDashedMaterial({ color: 0x0f172a, dashSize: 0.07, gapSize: 0.05, transparent: true, opacity: 0.75 }));
    line.computeLineDistances();
    this.dimGroup.add(line);
    // end ticks
    const tickG = new THREE.BufferGeometry().setFromPoints([
      a.clone().add(new THREE.Vector3(0, 0.06, 0)), a.clone().add(new THREE.Vector3(0, -0.06, 0)),
      b.clone().add(new THREE.Vector3(0, 0.06, 0)), b.clone().add(new THREE.Vector3(0, -0.06, 0)),
    ]);
    this.dimGroup.add(new THREE.LineSegments(tickG, new THREE.LineBasicMaterial({ color: 0x0f172a })));
    const sp = makeTextSprite();
    sp.set(label);
    sp.position.copy(a).lerp(b, 0.5); sp.position.y += 0.32 + lift;
    this.dimGroup.add(sp);
    this.dimSprites.push(sp);
  }

  private buildDims(): void {
    if (!this.mesh) return;
    const d = withDims(this.settings.shape, this.settings.dims);
    const box = new THREE.Box3().setFromObject(this.mesh);
    const cx = (box.max.x + box.min.x) / 2;
    // const cy = (box.max.y + box.min.y) / 2;
    const off = 0.42;
    const y0 = box.min.y, y1 = box.max.y;
    const x0 = box.min.x, x1 = box.max.x;
    const z1 = box.max.z;
    const id = this.settings.shape;
    const hLbl = id === "cube" || id === "icosa" ? `s = ${d.a} cm` : `h = ${d.h ?? d.r ?? d.a} cm`;

    if (id === "sphere" || id === "dome") {
      this.dimLine(new THREE.Vector3(cx, (y0 + y1) / 2, z1), new THREE.Vector3(x1 + off * 0.4, (y0 + y1) / 2, z1), `r = ${d.r} cm`);
    } else if (id === "cylinder" || id === "cone" || id === "capsule") {
      this.dimLine(new THREE.Vector3(x1 + off, y0, z1 * 0.4), new THREE.Vector3(x1 + off, y1, z1 * 0.4), `h = ${id === "capsule" ? d.h : id === "cone" ? d.h : d.h} cm`);
      this.dimLine(new THREE.Vector3(cx, y0 - off * 0.7, z1), new THREE.Vector3(x1, y0 - off * 0.7, z1), `r = ${d.r} cm`);
    } else if (id === "torus") {
      this.dimLine(new THREE.Vector3(cx, y0 - off * 0.7, 0), new THREE.Vector3(cx + d.R * this.scaleFor(), y0 - off * 0.7, 0), `R = ${d.R} cm`);
      this.dimLine(new THREE.Vector3(x1 + off, (y0 + y1) / 2, 0), new THREE.Vector3(x1 + off + d.r * this.scaleFor(), (y0 + y1) / 2, 0), `r = ${d.r} cm`);
    } else if (id === "prism") {
      this.dimLine(new THREE.Vector3(x1 + off, y0, 0), new THREE.Vector3(x1 + off, y1, 0), `h = ${d.h} cm`);
      this.dimLine(new THREE.Vector3(x0, y0 - off * 0.7, z1), new THREE.Vector3(x1, y0 - off * 0.7, z1), `w = ${d.w} cm`);
    } else {
      this.dimLine(new THREE.Vector3(x1 + off, y0, 0), new THREE.Vector3(x1 + off, y1, 0), hLbl);
      this.dimLine(new THREE.Vector3(x0, y0 - off * 0.7, z1), new THREE.Vector3(x1, y0 - off * 0.7, z1), id === "cube" ? `s = ${d.a} cm` : `a = ${d.a} cm`);
    }
    void cx;
  }

  private tick = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (document.hidden) return;
    this.clock.getDelta();
    this.dimSprites.forEach((sp) => sp.quaternion.copy(this.camera.quaternion));
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
