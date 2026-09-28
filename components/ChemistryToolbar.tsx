"use client";

import Magnet from "./bits/Magnet";

/**
 * Chemistry palette (blueprint §6.2).
 * Sprint 2–3 will wire atoms to lib/chemistry/elements.ts +
 * molecular-graph.ts and glassware to lib/chemistry/glassware.ts.
 */
const ATOMS = [
  { id: "H", label: "H" },
  { id: "C", label: "C" },
  { id: "N", label: "N" },
  { id: "O", label: "O" },
  { id: "Na", label: "Na" },
  { id: "Cl", label: "Cl" },
] as const;

const GLASSWARE = [
  { id: "beaker", icon: "BKR", label: "Beaker" },
  { id: "flask", icon: "FLS", label: "Flask" },
  { id: "cylinder", icon: "CYL", label: "Cylinder" },
  { id: "tube", icon: "TBE", label: "Tube" },
  { id: "burette", icon: "BUR", label: "Burette" },
  { id: "burner", icon: "BRN", label: "Burner" },
] as const;

export type AtomId = (typeof ATOMS)[number]["id"];
export type GlasswareId = (typeof GLASSWARE)[number]["id"];

export default function ChemistryToolbar({
  atom,
  glass,
  onAtom,
  onGlass,
}: {
  atom: AtomId | null;
  glass: GlasswareId | null;
  onAtom: (atom: AtomId) => void;
  onGlass: (glass: GlasswareId) => void;
}) {
  return (
    <nav className="toolbar domain-toolbar" aria-label="Chemistry palette">
      <h2>ATOMS</h2>
      <div className="shape-grid">
        {ATOMS.map(({ id, label }) => (
          <Magnet key={id} strength={0.25}>
            <button
              type="button"
              className={"shape-btn" + (atom === id ? " active" : "")}
              aria-pressed={atom === id}
              onClick={() => onAtom(id)}
            >
              <span className="g" aria-hidden="true">
                {label}
              </span>
              {id}
            </button>
          </Magnet>
        ))}
      </div>
      <h2 style={{ marginTop: 8 }}>GLASSWARE</h2>
      <div className="shape-grid">
        {GLASSWARE.map(({ id, icon, label }) => (
          <Magnet key={id} strength={0.25}>
            <button
              type="button"
              className={"shape-btn" + (glass === id ? " active" : "")}
              aria-pressed={glass === id}
              onClick={() => onGlass(id)}
            >
              <span className="g" aria-hidden="true">
                {icon}
              </span>
              {label}
            </button>
          </Magnet>
        ))}
      </div>
      <p className="m-sub" style={{ marginTop: 8 }}>
        VSEPR snapping + fluids land in Sprints 2–3.
      </p>
    </nav>
  );
}
