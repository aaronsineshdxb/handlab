"use client";

import { memo } from "react";

/** Single round color well (native picker). One circle shows the current
 *  color; any color is pickable. Keyboard + pinch accessible natively —
 *  the engine's hand-press path matches `input`, so no extra wiring. */
function ColorWell({
  color,
  onChange,
  label = "Shape color",
}: {
  color: string;
  onChange: (hex: string) => void;
  label?: string;
}) {
  return (
    <div className="color-well">
      <input
        type="color"
        className="color-well__input"
        aria-label={label}
        value={color}
        onChange={(e) => onChange(e.target.value)}
      />
      <span className="m-sub color-well__value" aria-hidden="true">
        {color}
      </span>
    </div>
  );
}

export default memo(ColorWell);
