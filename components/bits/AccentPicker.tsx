"use client";

import { memo, useEffect, useState } from "react";
import {
  ACCENTS,
  ACCENT_IDS,
  DEFAULT_CUSTOM_HEX,
  accentSwatchFor,
  applyAccent,
  currentCustomHex,
  currentScheme,
  currentTheme,
  isValidCustomHex,
  onAppearanceChange,
  type AccentName,
  type ThemeName,
} from "../../lib/theme";

/** Color-scheme picker. Writes `data-accent` on <html> (tokens + 3D scene
 *  follow) and persists to localStorage. Swatch dots adapt to the active theme
 *  so each dot matches the rendered UI accent in both light and dark modes. */
function AccentPicker() {
  const [theme, setTheme] = useState<ThemeName>(() =>
    typeof window !== "undefined" ? currentTheme() : "light",
  );
  const [scheme, setScheme] = useState<AccentName>(() =>
    typeof window !== "undefined" ? currentScheme() : "teal",
  );
  const [custom, setCustom] = useState<string>(() =>
    typeof window !== "undefined"
      ? (currentCustomHex() ?? DEFAULT_CUSTOM_HEX)
      : DEFAULT_CUSTOM_HEX,
  );
  useEffect(() => {
    setTheme(currentTheme());
    setScheme(currentScheme());
    setCustom(currentCustomHex() ?? DEFAULT_CUSTOM_HEX);
    return onAppearanceChange((t, s) => {
      setTheme(t);
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
    <div className="accent-picker" role="group" aria-label="Color scheme">
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
              aria-label={`${preset.label} color scheme`}
              className={"accent-swatch" + (active ? " active" : "")}
              style={{ backgroundColor: accentSwatchFor(id, theme) }}
              onClick={() => pick(id)}
            />
          );
        })}
        <label
          className={
            "accent-swatch accent-swatch--custom" +
            (scheme === "custom" ? " active" : "")
          }
          title="Custom color scheme — pick any color"
          style={
            scheme === "custom" ? { backgroundColor: custom } : undefined
          }
        >
          <span className="sr-only">Custom color scheme</span>
          <span aria-hidden="true" className="accent-swatch__plus">
            +
          </span>
          <input
            type="color"
            className="accent-swatch__input"
            aria-label="Custom color scheme"
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

/** Shared DISPLAY subsection: heading + picker. Accepts headingLevel so
 *  drawers with h2 titles can render h3 subsections cleanly. */
export function AccentSection({
  headingLevel = 2,
}: {
  headingLevel?: 2 | 3;
} = {}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <>
      <Heading className="accent-title">Color scheme</Heading>
      <AccentPicker />
    </>
  );
}

export default memo(AccentPicker);
