"use client";

/**
 * Physics object palette (blueprint §6.2).
 * Sprint 1–4 will wire each entry to lib/physics/* builders.
 * Buttons are enabled as selection state now so page layout / a11y
 * can be verified before the Rapier WASM integration lands.
 */
const TOOLS = [
  { id: "ramp", icon: "📐", label: "Ramp" },
  { id: "cart", icon: "🛒", label: "Cart" },
  { id: "projectile", icon: "🎯", label: "Cannon" },
  { id: "spring", icon: "🌀", label: "Spring" },
  { id: "charge", icon: "⚡", label: "Charge" },
  { id: "laser", icon: "🔆", label: "Laser" },
  { id: "prism", icon: "🔺", label: "Prism" },
  { id: "mass", icon: "⚖", label: "Mass" },
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
          <button
            key={id}
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
        ))}
      </div>
      <p className="m-sub" style={{ marginTop: 8 }}>
        Rapier rigid bodies land in Sprint 1 — selection is staged first.
      </p>
    </nav>
  );
}
