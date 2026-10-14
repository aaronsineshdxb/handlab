"use client";

import { SHAPE_DEFS, type ShowcaseShapeId } from "../lib/geometry/math";

/** 2D net previews (SVG, unfold = gap scale). Shared by showcase + hand view. */
export default function NetSvg({ shape, unfold }: { shape: ShowcaseShapeId; unfold: number }) {
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
        <polygon points={`${cx + s / 2 + gap},${cy - s / 2} ${cx + s / 2 + gap},${cy + s / 2} ${cx - s / 2 + s + gap},${cy}`} {...accStyle} />
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
      <span>{def.netKind === "none" ? "Non-developable — no exact flat net. Studio wireframe shows the structure instead." : "Fold-out preview — drag Unfold to separate faces."}</span>
    </div>
  );
}
