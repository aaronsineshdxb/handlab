"use client";

import { memo, useEffect, useState } from "react";
import {
  SHAPE_DEFS,
  metricsFor,
  type ShapeDims,
  type ShowcaseShapeId,
} from "../lib/geometry/math";
import type { ClipAxis, ShapeName, StudioMaterial } from "../lib/engine";
import NetSvg from "./NetSvg";

/** Map the hand-lab spawn palette onto the math engine. Knot has no
 *  elementary volume/area formula, so it gets a dedicated note card. */
export function mathIdFor(shape: ShapeName): ShowcaseShapeId | "knot" {
  if (shape === "knot") return "knot";
  return shape as ShowcaseShapeId;
}

/** Subset of the engine API the studio section drives. Everything is
 *  optional-chained at the call site so the 2D fallback (which lacks
 *  these) simply ignores studio input. */
export interface StudioEngine {
  setWireframe?: (on: boolean) => void;
  setMaterialMode?: (mode: StudioMaterial) => void;
  setDetail?: (level: number) => void;
  setClip?: (axis: ClipAxis, pos: number) => void;
}

interface SolidMathProps {
  shape: ShapeName;
  dims: ShapeDims;
  onDims: (key: keyof ShapeDims, value: number) => void;
  onReset: () => void;
  getEngine: () => StudioEngine | null;
  /** Bumped when the async engine becomes ready; re-runs the push effects. */
  readyRev: number;
  studio: boolean;
  onStudio: (v: boolean) => void;
}

function Chip({ on, onClick, children, label }: { on?: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button className={"sc-chip" + (on ? " on" : "")} aria-pressed={!!on} aria-label={label} onClick={onClick}>
      {children}
    </button>
  );
}

function SolidMath({ shape, dims, onDims, onReset, getEngine, readyRev, studio, onStudio }: SolidMathProps) {
  const id = mathIdFor(shape);
  const [wireframe, setWireframe] = useState(false);
  const [matMode, setMatMode] = useState<StudioMaterial>("standard");
  const [detail, setDetail] = useState(1);
  const [clipAxis, setClipAxis] = useState<ClipAxis>(null);
  const [clipPos, setClipPos] = useState(0);
  const [netOpen, setNetOpen] = useState(false);
  const [unfold, setUnfold] = useState(0.7);

  useEffect(() => {
    getEngine()?.setWireframe?.(wireframe);
  }, [getEngine, wireframe, readyRev]);
  useEffect(() => {
    getEngine()?.setMaterialMode?.(matMode);
  }, [getEngine, matMode, readyRev]);
  useEffect(() => {
    getEngine()?.setDetail?.(detail);
  }, [getEngine, detail, readyRev]);
  useEffect(() => {
    getEngine()?.setClip?.(clipAxis, clipPos);
  }, [getEngine, clipAxis, clipPos, readyRev]);

  return (
    <aside className="solid-math" aria-label="Solid mathematics">
      <div className="solid-math__head">
        <b>{id === "knot" ? "Torus knot" : SHAPE_DEFS[id].label} · live math</b>
        <button className="mini" onClick={onReset} title="Reset dimensions to defaults">reset</button>
      </div>
      <div className="sc-chips" role="tablist" aria-label="Learning mode">
        <Chip on={!studio} onClick={() => onStudio(false)}>Learn</Chip>
        <Chip on={studio} onClick={() => onStudio(true)}>Studio</Chip>
      </div>

      {id === "knot" ? (
        <>
          <article className="sc-card">
            <label>Volume V</label>
            <b>—</b>
            <code className="sub">No elementary formula — the tube follows a knotted centreline.</code>
          </article>
          <article className="sc-card">
            <label>Surface area A</label>
            <b>—</b>
            <code className="sub">Numerically integrated in CAD; not a classroom formula.</code>
          </article>
          <article className="sc-card">
            <label>Topology</label>
            <b>genus-1 <span>tube</span></b>
            <code>Mesh Euler χ = 0 (same family as the torus)</code>
          </article>
          <label className="sc-slider">
            <span className="sc-slider__head"><span>size</span><b>{(dims.a ?? 1).toFixed(2)}×</b></span>
            <input type="range" min={0.4} max={2.5} step={0.05} value={dims.a ?? 1} onChange={(e) => onDims("a", Number(e.target.value))} aria-label="knot size" />
          </label>
        </>
      ) : (
        <MathCards id={id} dims={dims} onDims={onDims} />
      )}

      {studio && id !== "knot" && (
        <>
          <h4 className="solid-math__h">Mesh &amp; material</h4>
          <div className="sc-chips">
            <Chip on={wireframe} onClick={() => setWireframe((w) => !w)}>Wireframe</Chip>
            <Chip on={matMode === "standard"} onClick={() => setMatMode("standard")}>pastel</Chip>
            <Chip on={matMode === "clay"} onClick={() => setMatMode("clay")}>clay</Chip>
            <Chip on={matMode === "flat"} onClick={() => setMatMode("flat")}>flat</Chip>
          </div>
          <label className="sc-slider">
            <span className="sc-slider__head"><span>Tessellation</span><b>level {detail}</b></span>
            <input type="range" min={0} max={2} step={1} value={detail} onChange={(e) => setDetail(Number(e.target.value))} aria-label="Tessellation level" />
          </label>

          <h4 className="solid-math__h">Cross-section slice</h4>
          <div className="sc-chips">
            {(["x", "y", "z"] as ClipAxis[]).map((ax) => (
              <Chip key={String(ax)} on={clipAxis === ax} onClick={() => setClipAxis((c) => (c === ax ? null : ax))}>{String(ax).toUpperCase()}</Chip>
            ))}
            <Chip on={!clipAxis} onClick={() => { setClipAxis(null); }}>off</Chip>
          </div>
          <label className="sc-slider">
            <span className="sc-slider__head"><span>Slice position</span><b>{clipPos.toFixed(2)}</b></span>
            <input type="range" min={-2} max={2} step={0.05} value={clipPos} onChange={(e) => { setClipPos(Number(e.target.value)); setClipAxis((c) => c ?? "y"); }} aria-label="Slice position" />
          </label>
        </>
      )}

      {studio && (
        <>
          <h4 className="solid-math__h">Unfold · 2D net</h4>
          <div className="sc-chips">
            <Chip on={netOpen} onClick={() => setNetOpen((v) => !v)}>{netOpen ? "Hide net" : "Show net"}</Chip>
          </div>
          {netOpen && id !== "knot" && (
            <>
              <NetSvg shape={id} unfold={unfold} />
              <label className="sc-slider">
                <span className="sc-slider__head"><span>Unfold</span><b>{Math.round(unfold * 100)}%</b></span>
                <input type="range" min={0} max={1} step={0.01} value={unfold} onChange={(e) => setUnfold(Number(e.target.value))} aria-label="Unfold amount" />
              </label>
            </>
          )}
          {netOpen && id === "knot" && (
            <p className="sc-note">Non-developable — no exact flat net for a knotted tube.</p>
          )}
        </>
      )}
    </aside>
  );
}

function MathCards({ id, dims, onDims }: { id: ShowcaseShapeId; dims: ShapeDims; onDims: (key: keyof ShapeDims, value: number) => void }) {
  const def = SHAPE_DEFS[id];
  const m = metricsFor(id, dims);
  return (
    <>
      <article className="sc-card sc-card--vol">
        <label>Volume V</label>
        <b>{m.volume.toFixed(2)} <span>cm³</span></b>
        <code>{m.volumeSym}</code>
        <code className="sub">{m.volumeSub}</code>
      </article>
      <article className="sc-card sc-card--area">
        <label>Surface area A</label>
        <b>{m.area.toFixed(2)} <span>cm²</span></b>
        <code>{m.areaSym}</code>
        <code className="sub">{m.areaSub}</code>
      </article>
      <article className="sc-card sc-card--euler">
        <label>Faces · Edges · Vertices</label>
        <b>{m.faces ?? "mesh"} <span>F</span> · {m.edges ?? "mesh"} <span>E</span> · {m.vertices ?? "mesh"} <span>V</span></b>
        <code>{m.euler != null ? `V − E + F = ${m.vertices} − ${m.edges} + ${m.faces} = ${m.euler}` : "V − E + F → Studio mesh χ"}</code>
        {def.eulerNote && <code className="sub">{def.eulerNote}</code>}
      </article>
      {def.params.map((p) => {
        const v = Number(dims[p.key] ?? def.defaults[p.key]);
        return (
          <label className="sc-slider" key={p.key}>
            <span className="sc-slider__head"><span>{p.label}</span><b>{v.toFixed(2)} cm</b></span>
            <input type="range" min={p.min} max={p.max} step={p.step} value={v} onChange={(e) => onDims(p.key, Number(e.target.value))} aria-label={p.label} />
          </label>
        );
      })}
      <p className="sc-note">Sliders update the cards and the size of newly placed {def.label.toLowerCase()}s.</p>
    </>
  );
}

export default memo(SolidMath);
