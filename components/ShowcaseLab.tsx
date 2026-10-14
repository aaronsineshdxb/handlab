"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  COMPLEX_SHAPES,
  SHAPE_DEFS,
  goldenPair,
  metricsFor,
  type ShapeDims,
  type ShowcaseShapeId,
} from "../lib/geometry/math";
import { ShowcaseEngine, type ClipAxis, type MaterialMode } from "../lib/geometry/viewport";
import {
  INITIAL_UI,
  lockLightTheme,
  visibleShapes,
  type ShowcaseUI,
} from "../lib/geometry/showcase-state";

/* ---------- 2D net previews (SVG, unfold = gap scale) ---------- */

function NetSvg({ shape, unfold }: { shape: ShowcaseShapeId; unfold: number }) {
  const g = Math.max(0.15, unfold);
  const ink = "#0F172A";
  const fill = "#FFFFFF";
  const acc = "#0EA5E9";
  const style = { stroke: ink, strokeWidth: 1.6, fill };
  const accStyle = { stroke: acc, strokeWidth: 1.6, fill: "#F0F9FF" };
  const gap = 8 * g + 2;
  if (shape === "cube") {
    const s = 44;
    const cells: [number, number][] = [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2], [1, 3]];
    return (
      <svg viewBox="0 0 220 300" className="net-svg" role="img" aria-label="Cube net">
        {cells.map(([cx, cy], i) => (
          <rect key={i} x={20 + cx * (s + gap)} y={10 + cy * (s + gap)} width={s} height={s} {...style} rx={4} />
        ))}
      </svg>
    );
  }
  if (shape === "cylinder") {
    return (
      <svg viewBox="0 0 260 190" className="net-svg" role="img" aria-label="Cylinder net">
        <rect x={20} y={60} width={150 + gap * 6} height={70} {...style} rx={6} />
        <circle cx={45} cy={30} r={22} {...accStyle} />
        <circle cx={45 + 60 * g} cy={162} r={22} {...accStyle} />
        <text x={95} y={100} textAnchor="middle" fontSize={11} fill={ink}>lateral 2πrh</text>
      </svg>
    );
  }
  if (shape === "cone") {
    return (
      <svg viewBox="0 0 260 200" className="net-svg" role="img" aria-label="Cone net">
        <path d={`M 60 170 L 130 20 L 200 170 A 90 90 0 0 0 60 170`} {...style} />
        <circle cx={200 - gap} cy={160} r={24} {...accStyle} />
        <text x={130} y={185} textAnchor="middle" fontSize={11} fill={ink}>sector + base</text>
      </svg>
    );
  }
  if (shape === "pyramid") {
    const cx = 130, cy = 105, s = 60;
        return (
      <svg viewBox="0 0 260 220" className="net-svg" role="img" aria-label="Pyramid net">
        <rect x={cx - s / 2} y={cy - s / 2} width={s} height={s} {...style} rx={4} />
        <polygon points={`${cx - s / 2},${cy - s / 2 - gap} ${cx + s / 2},${cy - s / 2 - gap} ${cx},${cy - s / 2 - 52 * g}`} {...accStyle} />
        <polygon points={`${cx - s / 2},${cy + s / 2 + gap} ${cx + s / 2},${cy + s / 2 + gap} ${cx},${cy + s / 2 + 52 * g}`} {...accStyle} />
        <polygon points={`${cx - s / 2 - gap},${cy - s / 2} ${cx - s / 2 - gap},${cy + s / 2} ${cx - s / 2 - 52 * g},${cy}`} {...accStyle} />
        <polygon points={`${cx + s / 2 + gap},${cy - s / 2} ${cx + s / 2 + gap},${cy + s / 2} ${cx + s / 2 + 52 * g},${cy}`} {...accStyle} />
      </svg>
    );
  }
  if (shape === "prism") {
    return (
      <svg viewBox="0 0 280 200" className="net-svg" role="img" aria-label="Prism net">
        <rect x={20} y={70} width={220} height={56} {...style} rx={6} />
        <rect x={40} y={20} width={60} height={40} {...accStyle} />
        <rect x={40} y={136} width={60} height={40} {...accStyle} />
        <text x={130} y={102} textAnchor="middle" fontSize={11} fill={ink}>w × h × d band</text>
      </svg>
    );
  }
  if (shape === "sphere") {
    return (
      <svg viewBox="0 0 260 180" className="net-svg" role="img" aria-label="Sphere gore net">
        {[0, 1, 2].map((i) => (
          <ellipse key={i} cx={60 + i * (60 + gap * 2)} cy={90} rx={28} ry={70} {...(i === 1 ? accStyle : style)} />
        ))}
        <text x={130} y={172} textAnchor="middle" fontSize={11} fill={ink}>gore approximation</text>
      </svg>
    );
  }
  const def = SHAPE_DEFS[shape];
  return (
    <div className="net-empty">
      <b>{def.label} net</b>
      <span>{def.netKind === "none" ? "Non-developable — no exact flat net. Studio shows wireframe instead." : "Fold-out preview for the judging panel — drag Unfold to separate faces."}</span>
    </div>
  );
}

/* ---------- small UI atoms ---------- */

function IconBtn({ label, active, onClick, children, title }: { label: string; active?: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <button
      className={"sc-fab" + (active ? " active" : "")}
      onClick={onClick}
      aria-pressed={!!active}
      aria-label={label}
      title={title ?? label}
    >
      {children}
    </button>
  );
}

function Row({ label, value, onChange, min, max, step }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number }) {
  return (
    <label className="sc-slider">
      <span className="sc-slider__head"><span>{label}</span><b>{value.toFixed(2)} cm</b></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={label} />
    </label>
  );
}

function Toggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button className={"sc-chip" + (on ? " on" : "")} aria-pressed={on} onClick={onClick}>{label}: {on ? "on" : "off"}</button>
  );
}

/* ---------- main showcase ---------- */

export default function ShowcaseLab() {
  const [ui, setUi] = useState<ShowcaseUI>(INITIAL_UI);
  const [dims, setDims] = useState<ShapeDims>({ ...SHAPE_DEFS.cylinder.defaults });
  const [meshInfo, setMeshInfo] = useState<{ v: number; f: number; e: number; euler: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShowcaseEngine | null>(null);

  const patch = (p: Partial<ShowcaseUI>) => setUi((u) => ({ ...u, ...p }));
  const toggleDrawer = (d: ShowcaseUI["drawer"]) =>
    setUi((u) => ({ ...u, drawer: u.drawer === d ? null : d }));

  // Judging panel: always open in the polished light theme.
  useEffect(() => lockLightTheme(), []);

  // Engine lifecycle — OrbitControls + scene persist across renders.
  useEffect(() => {
    if (!canvasRef.current) return;
    const eng = new ShowcaseEngine(canvasRef.current);
    engineRef.current = eng;
    setMeshInfo(eng.meshStats());
    return () => {
      eng.dispose();
      engineRef.current = null;
    };
  }, []);

  const metrics = useMemo(() => metricsFor(ui.shape, dims), [ui.shape, dims]);
  const def = SHAPE_DEFS[ui.shape];
  const shapes = visibleShapes(ui.mode);

  // Push React state → viewport (shape scale, overlays, clipping, materials).
  useEffect(() => {
    engineRef.current?.set({
      shape: ui.shape,
      dims,
      wireframe: ui.wireframe,
      showNormals: ui.showNormals,
      showVertices: ui.showVertices,
      detail: ui.detail,
      clipAxis: ui.clipAxis,
      clipPos: ui.clipPos,
      material: ui.material,
      spin: ui.spin,
      grid: ui.grid,
      showDims: ui.showDims,
    });
    // meshStats is synchronous after rebuild — refresh the Studio readout.
    const t = setTimeout(() => setMeshInfo(engineRef.current?.meshStats() ?? null), 30);
    return () => clearTimeout(t);
  }, [ui.shape, ui.wireframe, ui.showNormals, ui.showVertices, ui.detail, ui.clipAxis, ui.clipPos, ui.material, ui.spin, ui.grid, ui.showDims, dims]);

  const selectShape = (id: ShowcaseShapeId) => {
    setDims({ ...SHAPE_DEFS[id].defaults });
    patch({ shape: id, drawer: null });
  };

  const setDim = (key: keyof ShapeDims, v: number) =>
    setDims((d) => ({ ...d, [key]: v }));

  const onPhoto = () => {
    const url = engineRef.current?.exportPNG();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `geometry-${ui.shape}-${Date.now()}.png`;
    a.click();
  };

  const golden = useMemo(() => goldenPair(Number(dims.w ?? dims.a ?? 4)), [dims.w, dims.a]);
  const phi = (1 + Math.sqrt(5)) / 2;

  return (
    <div className="sc-root">
      <div className="sc-stage">
        <canvas ref={canvasRef} className="sc-canvas" aria-label={`Interactive 3D ${def.label}`} role="img" />
        <div className="sc-grid-overlay" aria-hidden="true" />
      </div>

      {/* Top header — minimalist, mode toggle centred */}
      <header className="sc-header">
        <div className="sc-brand">
          <b>handlab <span>· geometry</span></b>
          <i>presentation build · light · orbit to inspect</i>
        </div>
        <div className="sc-mode" role="tablist" aria-label="Learning mode">
          <button role="tab" aria-selected={ui.mode === "learn"} className={ui.mode === "learn" ? "on" : ""} onClick={() => {
            const firstSimple = "cylinder" as ShowcaseShapeId;
            patch({ mode: "learn", drawer: null, clipAxis: null, showNormals: false, showVertices: false, material: "pastel" });
            if (COMPLEX_SHAPES.includes(ui.shape)) selectShape(firstSimple);
          }}>Simple · Learn</button>
          <button role="tab" aria-selected={ui.mode === "studio"} className={ui.mode === "studio" ? "on" : ""} onClick={() => patch({ mode: "studio", drawer: "studio" })}>Complex · Studio</button>
        </div>
        <div className="sc-header__actions">
          <button className="sc-btn ghost" onClick={() => engineRef.current?.resetView()}>Reset view</button>
          <button className="sc-btn" onClick={onPhoto}>Export PNG</button>
        </div>
      </header>

      {/* Floating icon rail — collapsed by default, canvas stays unobstructed */}
      <nav className="sc-rail" aria-label="Showcase controls">
        <IconBtn label="Shapes" active={ui.drawer === "shapes"} onClick={() => toggleDrawer("shapes")} title="Shape library">
          <span aria-hidden="true">▦</span>
        </IconBtn>
        <IconBtn label="Measurements" active={ui.drawer === "math"} onClick={() => toggleDrawer("math")} title="Surface area · volume · Euler">
          <span aria-hidden="true">∑</span>
        </IconBtn>
        <IconBtn label="Unfold net" active={ui.netOpen} onClick={() => patch({ netOpen: !ui.netOpen })} title="Unfold / 2D net">
          <span aria-hidden="true">⤢</span>
        </IconBtn>
        <IconBtn label="Studio tools" active={ui.drawer === "studio"} onClick={() => toggleDrawer("studio")} title="Wireframe · clipping · materials">
          <span aria-hidden="true">◈</span>
        </IconBtn>
      </nav>

      {/* Fly-out drawers */}
      {ui.drawer === "shapes" && (
        <aside className="sc-drawer" aria-label="Shape library">
          <div className="sc-drawer__head"><b>{ui.mode === "learn" ? "Foundations (6)" : "Full library (12)"}</b><button aria-label="Close" onClick={() => patch({ drawer: null })}>×</button></div>
          <div className="sc-shape-grid">
            {shapes.map((id) => (
              <button key={id} className={"sc-shape" + (ui.shape === id ? " on" : "")} aria-pressed={ui.shape === id} onClick={() => selectShape(id)}>
                <b>{SHAPE_DEFS[id].label}</b><i>{SHAPE_DEFS[id].blurb}</i>
              </button>
            ))}
          </div>
          {ui.mode === "learn" && <p className="sc-note">Studio unlocks torus · dome · prisms · capsule · icosahedron.</p>}
        </aside>
      )}

      {ui.drawer === "math" && (
        <aside className="sc-drawer sc-drawer--wide" aria-label="Live mathematics">
          <div className="sc-drawer__head"><b>Live mathematics</b><button aria-label="Close" onClick={() => patch({ drawer: null })}>×</button></div>
          <MathCards shape={ui.shape} dims={dims} />
        </aside>
      )}

      {ui.drawer === "studio" && (
        <aside className="sc-drawer sc-drawer--wide" aria-label="Studio tools">
          <div className="sc-drawer__head"><b>Studio · architect tools</b><button aria-label="Close" onClick={() => patch({ drawer: null })}>×</button></div>
          {ui.mode === "learn" ? (
            <div className="sc-upsell">
              <p>Studio is locked in Learn mode to keep the panel focused.</p>
              <button className="sc-btn" onClick={() => patch({ mode: "studio" })}>Unlock Complex · Studio</button>
            </div>
          ) : (
            <div className="sc-studio">
              <h4>Mesh &amp; topology</h4>
              <div className="sc-chips">
                <Toggle label="Wireframe" on={ui.wireframe} onClick={() => patch({ wireframe: !ui.wireframe })} />
                <Toggle label="Normals" on={ui.showNormals} onClick={() => patch({ showNormals: !ui.showNormals })} />
                <Toggle label="Vertices" on={ui.showVertices} onClick={() => patch({ showVertices: !ui.showVertices })} />
                <Toggle label="Spin" on={ui.spin} onClick={() => patch({ spin: !ui.spin })} />
                <Toggle label="Dims" on={ui.showDims} onClick={() => patch({ showDims: !ui.showDims })} />
              </div>
              <Row label={`Tessellation (detail ${ui.detail})`} value={ui.detail} min={0} max={2} step={1} onChange={(v) => patch({ detail: Math.round(v) })} />
              {meshInfo && <p className="sc-note mono">mesh V {meshInfo.v} · E {meshInfo.e} · F {meshInfo.f} → χ = {meshInfo.euler}</p>}

              <h4>Cross-section · slicing plane</h4>
              <div className="sc-chips">
                {(["x", "y", "z"] as ClipAxis[]).map((ax) => (
                  <button key={String(ax)} className={"sc-chip" + (ui.clipAxis === ax ? " on" : "")} aria-pressed={ui.clipAxis === ax} onClick={() => patch({ clipAxis: ui.clipAxis === ax ? null : ax })}>{String(ax).toUpperCase()}</button>
                ))}
                <button className="sc-chip" onClick={() => patch({ clipAxis: null })}>off</button>
              </div>
              <Row label="Slice position" value={ui.clipPos} min={-2} max={2} step={0.05} onChange={(v) => patch({ clipPos: v, clipAxis: ui.clipAxis ?? "y" })} />

              <h4>Material / lighting</h4>
              <div className="sc-chips">
                {(["pastel", "clay", "cad", "flat"] as MaterialMode[]).map((m) => (
                  <button key={m} className={"sc-chip" + (ui.material === m ? " on" : "")} aria-pressed={ui.material === m} onClick={() => patch({ material: m })}>{m === "pastel" ? "pastel" : m === "clay" ? "clay" : m === "cad" ? "CAD edges" : "flat"}</button>
                ))}
              </div>

              <h4>Golden ratio · aspect check</h4>
              <p className="sc-note">φ = {phi.toFixed(5)} · span {golden.long.toFixed(2)} → short {golden.short.toFixed(2)} cm. Set prism w to {golden.short.toFixed(2)} for a golden plan.</p>
            </div>
          )}
        </aside>
      )}

      {/* Bottom param bar — always visible, compact */}
      <div className="sc-params" aria-label="Dimensions">
        <b className="sc-params__shape">{def.label}</b>
        {def.params.map((p) => (
          <Row key={p.key} label={p.label} value={Number(dims[p.key] ?? SHAPE_DEFS[ui.shape].defaults[p.key])} min={p.min} max={p.max} step={p.step} onChange={(v) => setDim(p.key, v)} />
        ))}
        <button className="sc-btn ghost" onClick={() => patch({ netOpen: !ui.netOpen })} aria-pressed={ui.netOpen}>{ui.netOpen ? "Hide net" : "Unfold net"}</button>
      </div>

      {/* Live metric cards — big, clear for judges */}
      <section className="sc-metrics" aria-label="Surface area and volume">
        <article className="sc-card sc-card--vol">
          <label>Volume V</label>
          <b>{metrics.volume.toFixed(2)} <span>cm³</span></b>
          <code>{metrics.volumeSym}</code>
          <code className="sub">{metrics.volumeSub}</code>
        </article>
        <article className="sc-card sc-card--area">
          <label>Surface area A</label>
          <b>{metrics.area.toFixed(2)} <span>cm²</span></b>
          <code>{metrics.areaSym}</code>
          <code className="sub">{metrics.areaSub}</code>
        </article>
        <article className="sc-card sc-card--euler">
          <label>Faces · Edges · Vertices</label>
          <b>{metrics.faces ?? "mesh"} <span>F</span> · {metrics.edges ?? "mesh"} <span>E</span> · {metrics.vertices ?? "mesh"} <span>V</span></b>
          <code>{metrics.euler != null ? `V − E + F = ${metrics.vertices} − ${metrics.edges} + ${metrics.faces} = ${metrics.euler}` : "V − E + F → see Studio mesh χ"}</code>
          {def.eulerNote && <code className="sub">{def.eulerNote}</code>}
        </article>
      </section>

      {/* 2D net overlay */}
      {ui.netOpen && (
        <section className="sc-net" aria-label="2D net unfolding">
          <div className="sc-net__head"><b>{def.label} · 2D net</b><button aria-label="Close net" onClick={() => patch({ netOpen: false })}>×</button></div>
          <NetSvg shape={ui.shape} unfold={ui.unfold} />
          <label className="sc-slider"><span className="sc-slider__head"><span>Unfold</span><b>{Math.round(ui.unfold * 100)}%</b></span>
            <input type="range" min={0} max={1} step={0.01} value={ui.unfold} onChange={(e) => patch({ unfold: Number(e.target.value) })} aria-label="Unfold amount" />
          </label>
        </section>
      )}
    </div>
  );
}

function MathCards({ shape, dims }: { shape: ShowcaseShapeId; dims: ShapeDims }) {
  const m = metricsFor(shape, dims);
  return (
    <div className="sc-mathcards">
      <article><label>Volume</label><b>{m.volume.toFixed(2)} cm³</b><code>{m.volumeSym}</code><code className="sub">{m.volumeSub}</code></article>
      <article><label>Surface area</label><b>{m.area.toFixed(2)} cm²</b><code>{m.areaSym}</code><code className="sub">{m.areaSub}</code></article>
      <article><label>Euler</label><b>{m.euler != null ? `χ = ${m.euler}` : "smooth / mesh"}</b><code>{m.euler != null ? `${m.vertices} − ${m.edges} + ${m.faces} = ${m.euler}` : SHAPE_DEFS[shape].eulerNote ?? "See Studio mesh χ"}</code></article>
    </div>
  );
}
