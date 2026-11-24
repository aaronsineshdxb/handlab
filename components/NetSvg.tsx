"use client";

import { SHAPE_DEFS, type ShowcaseShapeId } from "../lib/geometry/math";

const UNFOLDABLE_NETS = new Set<ShowcaseShapeId>([
  "cube",
  "prism",
  "cylinder",
  "cone",
  "pyramid",
  "sphere",
  "tetra",
  "octa",
  "triPrism",
  "hexPrism",
]);

export function hasUnfoldableNet(shape: ShowcaseShapeId | "knot"): boolean {
  return shape !== "knot" && UNFOLDABLE_NETS.has(shape);
}

/** Flat-top / flat-bottom regular hexagon of circumradius `r` (edge length = `r`,
 *  apothem = `r * sqrt(3) / 2`) so top and bottom edges hinge flush along horizontal lines. */
function hexPoints(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}

/** 2D net previews (SVG, unfold = gap scale). Shared by showcase + hand view. */
export default function NetSvg({ shape, unfold }: { shape: ShowcaseShapeId; unfold: number }) {
  const g = Math.max(0.15, unfold);
  const ink = "var(--color-ink)";
  const muted = "var(--color-muted)";
  const fill = "var(--color-paper-2)";
  const acc = "var(--color-accent)";
  const style = { stroke: ink, strokeWidth: 1.5, fill };
  const accStyle = { stroke: acc, strokeWidth: 1.5, className: "net-svg__accent" };
  const foldStyle = { stroke: muted, strokeWidth: 1.1, strokeDasharray: "3 3", fill: "none" };
  const gap = 8 * g + 2;

  if (shape === "cube") {
    const s = 44;
    const cells: [number, number][] = [
      [1, 0],
      [0, 1],
      [1, 1],
      [2, 1],
      [1, 2],
      [1, 3],
    ];
    const totalW = 3 * s + 2 * gap;
    const totalH = 4 * s + 3 * gap;
    const ox = (240 - totalW) / 2;
    const oy = (264 - totalH) / 2;
    return (
      <svg viewBox="0 0 240 264" className="net-svg" role="img" aria-label="Cube net">
        {/* dashed hinge guides along central spine */}
        <line x1={ox + s + gap + 6} y1={oy + s + gap / 2} x2={ox + 2 * s + gap - 6} y2={oy + s + gap / 2} {...foldStyle} />
        <line x1={ox + s + gap + 6} y1={oy + 2 * s + 1.5 * gap} x2={ox + 2 * s + gap - 6} y2={oy + 2 * s + 1.5 * gap} {...foldStyle} />
        <line x1={ox + s + gap + 6} y1={oy + 3 * s + 2.5 * gap} x2={ox + 2 * s + gap - 6} y2={oy + 3 * s + 2.5 * gap} {...foldStyle} />
        <line x1={ox + s + gap / 2} y1={oy + s + gap + 6} x2={ox + s + gap / 2} y2={oy + 2 * s + gap - 6} {...foldStyle} />
        <line x1={ox + 2 * s + 1.5 * gap} y1={oy + s + gap + 6} x2={ox + 2 * s + 1.5 * gap} y2={oy + 2 * s + gap - 6} {...foldStyle} />
        {cells.map(([cx, cy], i) => (
          <rect
            key={i}
            x={ox + cx * (s + gap)}
            y={oy + cy * (s + gap)}
            width={s}
            height={s}
            {...(cx === 1 && cy === 1 ? accStyle : style)}
            rx={4}
          />
        ))}
      </svg>
    );
  }

  if (shape === "cylinder") {
    const bw = 156 + gap * 3.5;
    const bh = 68;
    const bx = (260 - bw) / 2;
    const by = 66;
    const r = 21;
    const topCy = by - gap - r;
    const botCy = by + bh + gap + r;
    return (
      <svg viewBox="0 0 260 200" className="net-svg" role="img" aria-label="Cylinder net">
        <line x1={130 - r * 0.7} y1={by - gap / 2} x2={130 + r * 0.7} y2={by - gap / 2} {...foldStyle} />
        <line x1={130 - r * 0.7} y1={by + bh + gap / 2} x2={130 + r * 0.7} y2={by + bh + gap / 2} {...foldStyle} />
        <rect x={bx} y={by} width={bw} height={bh} {...style} rx={5} />
        <circle cx={130} cy={topCy} r={r} {...accStyle} />
        <circle cx={130} cy={botCy} r={r} {...accStyle} />
        <text x={130} y={by + bh / 2 + 4} textAnchor="middle" fontSize={11} fill={ink}>
          lateral 2πrh
        </text>
      </svg>
    );
  }

  if (shape === "cone") {
    // Outward-sweeping circular sector centered at apex (130, 18), radius 106, ±36°
    const ax = 130;
    const ay = 18;
    const R = 106;
    const ang = (36 * Math.PI) / 180;
    const lx = ax - R * Math.sin(ang);
    const ly = ay + R * Math.cos(ang);
    const rx = ax + R * Math.sin(ang);
    const ry = ly;
    const baseR = 24;
    const baseCy = ay + R + gap + baseR;
    return (
      <svg viewBox="0 0 260 206" className="net-svg" role="img" aria-label="Cone net">
        <path
          d={`M ${lx.toFixed(1)} ${ly.toFixed(1)} L ${ax} ${ay} L ${rx.toFixed(1)} ${ry.toFixed(1)} A ${R} ${R} 0 0 1 ${lx.toFixed(1)} ${ly.toFixed(1)} Z`}
          {...style}
        />
        <line x1={ax - 14} y1={ay + R + gap / 2} x2={ax + 14} y2={ay + R + gap / 2} {...foldStyle} />
        <circle cx={ax} cy={baseCy} r={baseR} {...accStyle} />
        <text x={ax} y={ay + R * 0.62} textAnchor="middle" fontSize={11} fill={ink}>
          sector + base
        </text>
      </svg>
    );
  }

  if (shape === "pyramid") {
    // Translate the 4 triangular faces cleanly outward along their edge normals without distorting altitude.
    const cx = 130;
    const cy = 105;
    const s = 60;
    const alt = 42;
    const half = s / 2;
    return (
      <svg viewBox="0 0 260 210" className="net-svg" role="img" aria-label="Pyramid net">
        <line x1={cx - half + 6} y1={cy - half - gap / 2} x2={cx + half - 6} y2={cy - half - gap / 2} {...foldStyle} />
        <line x1={cx - half + 6} y1={cy + half + gap / 2} x2={cx + half - 6} y2={cy + half + gap / 2} {...foldStyle} />
        <line x1={cx - half - gap / 2} y1={cy - half + 6} x2={cx - half - gap / 2} y2={cy + half - 6} {...foldStyle} />
        <line x1={cx + half + gap / 2} y1={cy - half + 6} x2={cx + half + gap / 2} y2={cy + half - 6} {...foldStyle} />
        <rect x={cx - half} y={cy - half} width={s} height={s} {...style} rx={4} />
        <polygon
          points={`${cx - half},${cy - half - gap} ${cx + half},${cy - half - gap} ${cx},${cy - half - gap - alt}`}
          {...accStyle}
        />
        <polygon
          points={`${cx - half},${cy + half + gap} ${cx + half},${cy + half + gap} ${cx},${cy + half + gap + alt}`}
          {...accStyle}
        />
        <polygon
          points={`${cx - half - gap},${cy - half} ${cx - half - gap},${cy + half} ${cx - half - gap - alt},${cy}`}
          {...accStyle}
        />
        <polygon
          points={`${cx + half + gap},${cy - half} ${cx + half + gap},${cy + half} ${cx + half + gap + alt},${cy}`}
          {...accStyle}
        />
      </svg>
    );
  }

  if (shape === "prism") {
    // 4 hinged lateral faces (w, d, w, d) + top & bottom caps that separate with gap
    const widths = [52, 34, 52, 34];
    const h = 62;
    const capH = 34;
    const totalW = widths.reduce((a, b) => a + b, 0) + 3 * gap;
    const ox = (280 - totalW) / 2;
    const by = 69;
    const xs: number[] = [];
    let curX = ox;
    for (const w of widths) {
      xs.push(curX);
      curX += w + gap;
    }
    return (
      <svg viewBox="0 0 280 200" className="net-svg" role="img" aria-label="Rectangular prism net">
        {[0, 1, 2].map((i) => (
          <line
            key={`f-${i}`}
            x1={xs[i] + widths[i] + gap / 2}
            y1={by + 6}
            x2={xs[i] + widths[i] + gap / 2}
            y2={by + h - 6}
            {...foldStyle}
          />
        ))}
        <line x1={xs[0] + 6} y1={by - gap / 2} x2={xs[0] + widths[0] - 6} y2={by - gap / 2} {...foldStyle} />
        <line x1={xs[0] + 6} y1={by + h + gap / 2} x2={xs[0] + widths[0] - 6} y2={by + h + gap / 2} {...foldStyle} />
        {widths.map((w, i) => (
          <rect key={i} x={xs[i]} y={by} width={w} height={h} {...style} rx={3} />
        ))}
        <rect x={xs[0]} y={by - gap - capH} width={widths[0]} height={capH} {...accStyle} rx={3} />
        <rect x={xs[0]} y={by + h + gap} width={widths[0]} height={capH} {...accStyle} rx={3} />
      </svg>
    );
  }

  if (shape === "sphere") {
    const step = 54 + gap * 1.6;
    const startX = 130 - step;
    return (
      <svg viewBox="0 0 260 184" className="net-svg" role="img" aria-label="Sphere gore net">
        {[0, 1, 2].map((i) => (
          <ellipse
            key={i}
            cx={startX + i * step}
            cy={84}
            rx={26}
            ry={64}
            {...(i === 1 ? accStyle : style)}
          />
        ))}
        <text x={130} y={170} textAnchor="middle" fontSize={11} fill={ink}>
          gore approximation
        </text>
      </svg>
    );
  }

  if (shape === "tetra") {
    // Central inverted equilateral triangle + 3 outward-translated equilateral triangles
    const cx = 130;
    const cy = 108;
    const s = 64;
    const h = (s * Math.sqrt(3)) / 2;
    // Central triangle: top-left A, top-right B, bottom C
    const ax = cx - s / 2;
    const ay = cy - h / 3;
    const bx = cx + s / 2;
    const by = ay;
    const vx = cx;
    const vy = cy + (2 * h) / 3;
    // Outward normals for the 3 edges
    const nTop = { x: 0, y: -1 };
    const nLeft = { x: -Math.sqrt(3) / 2, y: 0.5 };
    const nRight = { x: Math.sqrt(3) / 2, y: 0.5 };
    const shift = (x: number, y: number, n: { x: number; y: number }) =>
      `${(x + n.x * gap).toFixed(1)},${(y + n.y * gap).toFixed(1)}`;
    return (
      <svg viewBox="0 0 260 210" className="net-svg" role="img" aria-label="Tetrahedron net">
        <polygon points={`${ax.toFixed(1)},${ay.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)} ${vx.toFixed(1)},${vy.toFixed(1)}`} {...style} />
        {/* Top face */}
        <polygon
          points={`${shift(ax, ay, nTop)} ${shift(bx, by, nTop)} ${shift(cx, ay - h, nTop)}`}
          {...accStyle}
        />
        {/* Bottom-left face */}
        <polygon
          points={`${shift(ax, ay, nLeft)} ${shift(vx, vy, nLeft)} ${shift(ax - s / 2, vy, nLeft)}`}
          {...accStyle}
        />
        {/* Bottom-right face */}
        <polygon
          points={`${shift(bx, by, nRight)} ${shift(vx, vy, nRight)} ${shift(bx + s / 2, vy, nRight)}`}
          {...accStyle}
        />
      </svg>
    );
  }

  if (shape === "octa") {
    // 8 equilateral triangles in a dynamically centered alternating strip with uniform gap & fold guides
    const s = 38;
    const h = (s * Math.sqrt(3)) / 2;
    const dx = s / 2 + gap;
    const totalW = 5 * dx + s;
    const ox = (260 - totalW) / 2;
    const oy = (180 - h) / 2;
    const tris: { pts: string; accent: boolean }[] = [];
    const folds: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (let i = 0; i < 6; i++) {
      const x = ox + i * dx;
      const up = i % 2 === 0;
      if (up) {
        tris.push({
          pts: `${x.toFixed(1)},${(oy + h).toFixed(1)} ${(x + s).toFixed(1)},${(oy + h).toFixed(1)} ${(x + s / 2).toFixed(1)},${oy.toFixed(1)}`,
          accent: i === 2,
        });
      } else {
        tris.push({
          pts: `${x.toFixed(1)},${oy.toFixed(1)} ${(x + s).toFixed(1)},${oy.toFixed(1)} ${(x + s / 2).toFixed(1)},${(oy + h).toFixed(1)}`,
          accent: i === 3,
        });
      }
      if (i < 5) {
        // Dashed hinge along the slanted gap between triangle i and i+1
        const midX = x + s / 2 + gap / 2;
        if (up) {
          folds.push({
            x1: midX + s * 0.08,
            y1: oy + h * 0.16,
            x2: midX + s * 0.42,
            y2: oy + h * 0.84,
          });
        } else {
          folds.push({
            x1: midX + s * 0.42,
            y1: oy + h * 0.16,
            x2: midX + s * 0.08,
            y2: oy + h * 0.84,
          });
        }
      }
    }
    // Top cap above i=1 (down triangle top edge)
    const tx = ox + 1 * dx;
    folds.push({ x1: tx + 5, y1: oy - gap / 2, x2: tx + s - 5, y2: oy - gap / 2 });
    tris.push({
      pts: `${tx.toFixed(1)},${(oy - gap).toFixed(1)} ${(tx + s).toFixed(1)},${(oy - gap).toFixed(1)} ${(tx + s / 2).toFixed(1)},${(oy - gap - h).toFixed(1)}`,
      accent: true,
    });
    // Bottom cap below i=4 (up triangle bottom edge)
    const bx = ox + 4 * dx;
    folds.push({ x1: bx + 5, y1: oy + h + gap / 2, x2: bx + s - 5, y2: oy + h + gap / 2 });
    tris.push({
      pts: `${bx.toFixed(1)},${(oy + h + gap).toFixed(1)} ${(bx + s).toFixed(1)},${(oy + h + gap).toFixed(1)} ${(bx + s / 2).toFixed(1)},${(oy + 2 * h + gap).toFixed(1)}`,
      accent: true,
    });
    return (
      <svg viewBox="0 0 260 180" className="net-svg" role="img" aria-label="Octahedron net">
        {folds.map((f, i) => (
          <line
            key={`of-${i}`}
            x1={f.x1.toFixed(1)}
            y1={f.y1.toFixed(1)}
            x2={f.x2.toFixed(1)}
            y2={f.y2.toFixed(1)}
            {...foldStyle}
          />
        ))}
        {tris.map((t, i) => (
          <polygon key={i} points={t.pts} {...(t.accent ? accStyle : style)} />
        ))}
      </svg>
    );
  }

  if (shape === "triPrism") {
    // 3 rectangular lateral faces + 2 equilateral triangle caps on the middle face
    const fw = 52;
    const fh = 64;
    const th = (fw * Math.sqrt(3)) / 2;
    const totalW = 3 * fw + 2 * gap;
    const ox = (260 - totalW) / 2;
    const by = 68;
    const midX = ox + fw + gap;
    return (
      <svg viewBox="0 0 260 200" className="net-svg" role="img" aria-label="Triangular prism net">
        <line x1={ox + fw + gap / 2} y1={by + 6} x2={ox + fw + gap / 2} y2={by + fh - 6} {...foldStyle} />
        <line x1={midX + fw + gap / 2} y1={by + 6} x2={midX + fw + gap / 2} y2={by + fh - 6} {...foldStyle} />
        <line x1={midX + 6} y1={by - gap / 2} x2={midX + fw - 6} y2={by - gap / 2} {...foldStyle} />
        <line x1={midX + 6} y1={by + fh + gap / 2} x2={midX + fw - 6} y2={by + fh + gap / 2} {...foldStyle} />
        {[0, 1, 2].map((i) => (
          <rect key={i} x={ox + i * (fw + gap)} y={by} width={fw} height={fh} {...style} rx={3} />
        ))}
        <polygon
          points={`${midX},${by - gap} ${midX + fw},${by - gap} ${midX + fw / 2},${(by - gap - th).toFixed(1)}`}
          {...accStyle}
        />
        <polygon
          points={`${midX},${by + fh + gap} ${midX + fw},${by + fh + gap} ${midX + fw / 2},${(by + fh + gap + th).toFixed(1)}`}
          {...accStyle}
        />
      </svg>
    );
  }

  if (shape === "hexPrism") {
    // 6 lateral rectangular faces + 2 flat-top/flat-bottom regular hexagon caps (edge = fw) hinged on face 2
    const fw = 28;
    const fh = 60;
    const hexR = fw;
    const apothem = (hexR * Math.sqrt(3)) / 2;
    const step = fw + gap * 0.65;
    const totalW = 6 * fw + 5 * gap * 0.65;
    const ox = (280 - totalW) / 2;
    const by = 70;
    const capX = ox + 2 * step;
    const capCx = capX + fw / 2;
    return (
      <svg viewBox="0 0 280 200" className="net-svg" role="img" aria-label="Hexagonal prism net">
        {[0, 1, 2, 3, 4].map((i) => (
          <line
            key={`hf-${i}`}
            x1={ox + i * step + fw + (gap * 0.65) / 2}
            y1={by + 6}
            x2={ox + i * step + fw + (gap * 0.65) / 2}
            y2={by + fh - 6}
            {...foldStyle}
          />
        ))}
        {/* Horizontal dashed fold lines where flat hex edges hinge onto face 2 */}
        <line x1={capX + 4} y1={by - gap / 2} x2={capX + fw - 4} y2={by - gap / 2} {...foldStyle} />
        <line x1={capX + 4} y1={by + fh + gap / 2} x2={capX + fw - 4} y2={by + fh + gap / 2} {...foldStyle} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={ox + i * step} y={by} width={fw} height={fh} {...style} rx={2} />
        ))}
        <polygon points={hexPoints(capCx, by - gap - apothem, hexR)} {...accStyle} />
        <polygon points={hexPoints(capCx, by + fh + gap + apothem, hexR)} {...accStyle} />
      </svg>
    );
  }

  const def = SHAPE_DEFS[shape];
  return (
    <div className="net-empty">
      <b>{def.label} net</b>
      <span>
        Non-developable or unsupported flat net — use Studio wireframe to inspect the full 3D structure.
      </span>
    </div>
  );
}
