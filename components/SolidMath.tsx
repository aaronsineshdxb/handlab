"use client";

import { memo } from "react";
import {
  SHAPE_DEFS,
  metricsFor,
  type ShapeDims,
  type ShowcaseShapeId,
} from "../lib/geometry/math";
import type { ShapeName } from "../lib/engine";

/** Map the hand-lab spawn palette onto the math engine. Knot has no
 *  elementary volume/area formula, so it gets a dedicated note card. */
export function mathIdFor(shape: ShapeName): ShowcaseShapeId | "knot" {
  if (shape === "knot") return "knot";
  return shape as ShowcaseShapeId;
}

interface SolidMathProps {
  shape: ShapeName;
  dims: ShapeDims;
  onDims: (key: keyof ShapeDims, value: number) => void;
  onReset: () => void;
}

function SolidMath({ shape, dims, onDims, onReset }: SolidMathProps) {
  const id = mathIdFor(shape);

  if (id === "knot") {
    const size = dims.a ?? 1;
    return (
      <aside className="solid-math" aria-label="Solid mathematics">
        <div className="solid-math__head">
          <b>Torus knot · live math</b>
        </div>
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
          <span className="sc-slider__head"><span>size</span><b>{size.toFixed(2)}×</b></span>
          <input type="range" min={0.4} max={2.5} step={0.05} value={size} onChange={(e) => onDims("a", Number(e.target.value))} aria-label="knot size" />
        </label>
      </aside>
    );
  }

  const def = SHAPE_DEFS[id];
  const m = metricsFor(id, dims);
  return (
    <aside className="solid-math" aria-label="Solid mathematics">
      <div className="solid-math__head">
        <b>{def.label} · live math</b>
        <button className="mini" onClick={onReset} title="Reset dimensions to defaults">reset</button>
      </div>
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
    </aside>
  );
}

export default memo(SolidMath);
