"use client";

import { memo, useEffect, useState, type CSSProperties } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  SHAPE_DEFS,
  metricsFor,
  type ShapeDims,
  type ShowcaseShapeId,
} from "../lib/geometry/math";
import type { ClipAxis, ShapeName, StudioMaterial } from "../lib/engine";
import NetSvg, { hasUnfoldableNet } from "./NetSvg";

function sliderTrackStyle(value: number, min: number, max: number): CSSProperties {
  const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
  return { "--pct": `${pct.toFixed(1)}%` } as CSSProperties;
}

/** Map the hand-lab spawn palette onto the math engine. Knot has no
 *  elementary volume/area formula, so it gets a dedicated note card. */
export function mathIdFor(shape: ShapeName): ShowcaseShapeId | "knot" {
  if (shape === "knot") return "knot";
  return shape as ShowcaseShapeId;
}

export interface StudioState {
  wireframe: boolean;
  matMode: StudioMaterial;
  detail: number;
  clipAxis: ClipAxis;
  clipPos: number;
}

interface SolidMathProps {
  shape: ShapeName;
  dims: ShapeDims;
  onReset: () => void;
  studio: boolean;
  is2D: boolean;
  studioState: StudioState;
  onWireframe: (on: boolean) => void;
  onMatMode: (mode: StudioMaterial) => void;
  onDetail: (level: number) => void;
  onClipAxis: (axis: ClipAxis) => void;
  onClipPos: (pos: number) => void;
}

function Chip({
  on,
  onClick,
  children,
  label,
}: {
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={"sc-chip" + (on ? " on" : "")}
      aria-pressed={!!on}
      aria-label={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function SolidMath({
  shape,
  dims,
  onReset,
  studio,
  is2D,
  studioState,
  onWireframe,
  onMatMode,
  onDetail,
  onClipAxis,
  onClipPos,
}: SolidMathProps) {
  const id = mathIdFor(shape);
  const [netOpen, setNetOpen] = useState(false);
  const [unfold, setUnfold] = useState(0.7);
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.innerWidth <= 900,
  );
  const { wireframe, matMode, detail, clipAxis, clipPos } = studioState;
  const reduce = useReducedMotion();
  const unfoldable = hasUnfoldableNet(id);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 900px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const panelMotion = narrow
    ? {
        initial: reduce ? false : { opacity: 0, y: 12 },
        animate: { opacity: 1, y: 0 },
        exit: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
      }
    : {
        initial: reduce ? false : { opacity: 0, x: 14, scale: 0.985 },
        animate: { opacity: 1, x: 0, scale: 1 },
        exit: reduce ? { opacity: 0 } : { opacity: 0, x: 14, scale: 0.985 },
      };

  return (
    <motion.aside
      id="solid-math-panel"
      className="solid-math"
      aria-label="Solid mathematics"
      {...panelMotion}
      transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="solid-math__head">
        <h2>{id === "knot" ? "Torus knot" : SHAPE_DEFS[id].label} · live math</h2>
        <button
          type="button"
          className="mini"
          onClick={onReset}
          title="Reset dimensions to defaults"
        >
          Reset
        </button>
      </div>
      {id === "knot" ? (
        <>
          <article className="sc-card">
            <span className="sc-card__label">Volume V</span>
            <b>—</b>
            <code className="sub">No elementary formula — the tube follows a knotted centerline.</code>
          </article>
          <article className="sc-card">
            <span className="sc-card__label">Surface area A</span>
            <b>—</b>
            <code className="sub">Numerically integrated in CAD; not a classroom formula.</code>
          </article>
          <article className="sc-card">
            <span className="sc-card__label">Topology</span>
            <b>genus-1 <span>tube</span></b>
            <code>Mesh Euler χ = 0 (same family as the torus)</code>
          </article>
        </>
      ) : (
        <MathCards id={id} dims={dims} />
      )}

      {studio && id !== "knot" && (
        <>
          <h3 className="solid-math__h">Mesh &amp; material</h3>
          <div className="sc-chips">
            <Chip on={wireframe} onClick={() => onWireframe(!wireframe)}>Wireframe</Chip>
            <Chip on={matMode === "standard"} onClick={() => onMatMode("standard")}>Pastel</Chip>
            <Chip on={matMode === "clay"} onClick={() => onMatMode("clay")}>Clay</Chip>
            <Chip on={matMode === "flat"} onClick={() => onMatMode("flat")}>Flat</Chip>
          </div>
          <label className="sc-slider">
            <span className="sc-slider__head"><span>Tessellation</span><b>Level {detail}</b></span>
            <input
              type="range"
              min={0}
              max={2}
              step={1}
              value={detail}
              style={sliderTrackStyle(detail, 0, 2)}
              onChange={(e) => onDetail(Number(e.target.value))}
              aria-label="Tessellation level"
            />
          </label>

          <h3 className="solid-math__h">Cross-section slice</h3>
          <div className="sc-chips">
            {(["x", "y", "z"] as ClipAxis[]).map((ax) => (
              <Chip
                key={String(ax)}
                on={clipAxis === ax}
                onClick={() => onClipAxis(clipAxis === ax ? null : ax)}
              >
                {String(ax).toUpperCase()}
              </Chip>
            ))}
            <Chip on={!clipAxis} onClick={() => onClipAxis(null)}>Off</Chip>
          </div>
          <label className="sc-slider">
            <span className="sc-slider__head"><span>Slice position</span><b>{clipPos.toFixed(2)}</b></span>
            <input
              type="range"
              min={-2}
              max={2}
              step={0.05}
              value={clipPos}
              style={sliderTrackStyle(clipPos, -2, 2)}
              onChange={(e) => {
                onClipPos(Number(e.target.value));
                if (!clipAxis) onClipAxis("y");
              }}
              aria-label="Slice position"
            />
          </label>
          {is2D && (
            <p className="sc-note">
              Software 3D (Rust/WASM) — drag empty space to orbit, scroll to zoom.
            </p>
          )}
        </>
      )}

      {studio && (
        <>
          <h3 className="solid-math__h">Unfold · 2D net</h3>
          <div className="sc-chips">
            <Chip on={netOpen} onClick={() => setNetOpen((v) => !v)}>
              {netOpen ? "Hide net" : "Show net"}
            </Chip>
          </div>
          {netOpen && id !== "knot" && (
            <>
              <NetSvg shape={id} unfold={unfold} />
              {unfoldable && (
                <label className="sc-slider">
                  <span className="sc-slider__head"><span>Unfold</span><b>{Math.round(unfold * 100)}%</b></span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={unfold}
                    style={sliderTrackStyle(unfold, 0, 1)}
                    onChange={(e) => setUnfold(Number(e.target.value))}
                    aria-label="Unfold amount"
                  />
                </label>
              )}
            </>
          )}
          {netOpen && id === "knot" && (
            <div className="net-empty">
              <b>Torus knot net</b>
              <span>Non-developable — no exact flat net for a knotted tube.</span>
            </div>
          )}
        </>
      )}
    </motion.aside>
  );
}

/** Substitution line: the worked expression with real dimensions. The ≈
 *  result is not repeated here — the card's headline number already is it. */
function SubLine({ text }: { text: string }) {
  const i = text.indexOf(" ≈ ");
  return <code className="sub">{i < 0 ? text : text.slice(0, i)}</code>;
}

function MathCards({ id, dims }: { id: ShowcaseShapeId; dims: ShapeDims }) {
  const def = SHAPE_DEFS[id];
  const m = metricsFor(id, dims);
  return (
    <>
      <article className="sc-card sc-card--vol">
        <span className="sc-card__label">Volume V</span>
        <b>{m.volume.toFixed(2)}&nbsp;<span>cm³</span></b>
        <code>{m.volumeSym}</code>
        <SubLine text={m.volumeSub} />
      </article>
      <article className="sc-card sc-card--area">
        <span className="sc-card__label">Surface area A</span>
        <b>{m.area.toFixed(2)}&nbsp;<span>cm²</span></b>
        <code>{m.areaSym}</code>
        <SubLine text={m.areaSub} />
      </article>
      <article className="sc-card sc-card--euler">
        <span className="sc-card__label">Faces · Edges · Vertices</span>
        {m.faces != null ? (
          <b>{m.faces}&nbsp;<span>F</span> · {m.edges}&nbsp;<span>E</span> · {m.vertices}&nbsp;<span>V</span></b>
        ) : (
          <b>smooth <span>· no flat faces</span></b>
        )}
        <code>{m.euler != null ? `V − E + F = ${m.vertices} − ${m.edges} + ${m.faces} = ${m.euler}` : (def.eulerNote ?? "V − E + F → Studio mesh χ")}</code>
        {def.eulerNote && m.euler != null && <code className="sub">{def.eulerNote}</code>}
      </article>
    </>
  );
}

export default memo(SolidMath);
