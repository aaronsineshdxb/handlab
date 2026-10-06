"use client";

import { memo, useEffect, useState } from "react";
import {
  ACCENTS,
  ACCENT_IDS,
  DEFAULT_CUSTOM_HEX,
  applyAccent,
  currentCustomHex,
  currentScheme,
  isValidCustomHex,
  onAppearanceChange,
  type AccentName,
} from "../../lib/theme";

/** Colour-scheme picker. Writes `data-accent` on <html> (tokens + 3D scene
 *  follow) and persists to localStorage. Presets are tuned per mode in
 *  tokens.css; `custom` paints any hex inline so the user can pick at will.
 *  Initial value is painted by the blocking init script in layout, so this
 *  only handles changes. */
function AccentPicker() {
  const [scheme, setScheme] = useState<AccentName>("teal");
  const [custom, setCustom] = useState<string>(DEFAULT_CUSTOM_HEX);
  useEffect(() => {
    setScheme(currentScheme());
    setCustom(currentCustomHex() ?? DEFAULT_CUSTOM_HEX);
    return onAppearanceChange((_, s) => {
      setScheme(s);
      setCustom(currentCustomHex() ?? DEFAULT_CUSTOM_HEX);
    });
  }, []);

  const pick = (id: AccentName, hex?: string) => {
    applyAccent(id, hex);
    setScheme(id);
    if (id === "custom" && hex && isValidCustomHex(hex)) setCustom(hex);
  };

  return (
    <div className="accent-picker" role="group" aria-label="Colour scheme">
      <div className="accent-picker__row">
        {ACCENT_IDS.map((id) => {
          const preset = ACCENTS[id];
          const active = scheme === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              title={`${preset.label} scheme`}
              aria-label={`${preset.label} colour scheme`}
              className={"accent-swatch" + (active ? " active" : "")}
              style={{ backgroundColor: preset.swatch }}
              onClick={() => pick(id)}
            />
          );
        })}
        <label
          className={
            "accent-swatch accent-swatch--custom" +
            (scheme === "custom" ? " active" : "")
          }
          title="Custom colour scheme — pick any colour"
          style={
            scheme === "custom" ? { backgroundColor: custom } : undefined
          }
        >
          <span className="sr-only">Custom colour scheme</span>
          <span aria-hidden="true" className="accent-swatch__plus">
            +
          </span>
          <input
            type="color"
            className="accent-swatch__input"
            aria-label="Custom colour scheme"
            value={custom}
            onChange={(e) => pick("custom", e.target.value)}
          />
        </label>
      </div>
      <div className="m-sub accent-picker__label" aria-live="polite">
        scheme: {scheme === "custom" ? custom : scheme}
      </div>
    </div>
  );
}

/** Shared DISPLAY subsection: heading + picker. Keeps the four lab
 *  toolbars (geometry / physics / chemistry / VR) identical. */
export function AccentSection() {
  return (
    <>
      <h2 className="accent-title">COLOUR SCHEME</h2>
      <AccentPicker />
    </>
  );
}

export default memo(AccentPicker);
