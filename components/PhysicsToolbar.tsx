"use client";

/**
 * Physics object palette (blueprint §6.2).
 * Sprint 1–4 will wire each entry to lib/physics/* builders.
 * Buttons are enabled as selection state now so page layout / a11y
 * can be verified before the Rapier WASM integration lands.
 */
import Magnet from "./bits/Magnet";

const TOOLS = [
  { id: "ramp", icon: "RMP", label: "Ramp" },
  { id: "cart", icon: "CRT", label: "Cart" },
  { id: "projectile", icon: "CN", label: "Cannon" },
  { id: "spring", icon: "SPR", label: "Spring" },
  { id: "charge", icon: "CHG", label: "Charge" },
  { id: "laser", icon: "LSR", label: "Laser" },
  { id: "prism", icon: "PRS", label: "Prism" },
  { id: "mass", icon: "MAS", label: "Mass" },
] as const;

export type PhysicsToolId = (typeof TOOLS)[number]["id"];

export default function PhysicsToolbar({
  active,
  onSelect,
}: {
  active: PhysicsToolId | null;
  onSelect: (tool: PhysicsToolId) => void;
}) {
  return (
    <nav className="toolbar domain-toolbar" aria-label="Physics palette">
      <h2>PHYSICS TOOLS</h2>
      <div className="shape-grid">
        {TOOLS.map(({ id, icon, label }) => (
          <Magnet key={id} strength={0.25}>
            <button
              type="button"
              className={"shape-btn" + (active === id ? " active" : "")}
              aria-pressed={active === id}
              onClick={() => onSelect(id)}
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
        Rapier rigid bodies land in Sprint 1 — selection is staged first.
      </p>
    </nav>
  );
}
