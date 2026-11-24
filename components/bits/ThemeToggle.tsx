"use client";

import { memo, useEffect, useState } from "react";
import {
  applyTheme,
  currentTheme,
  onAppearanceChange,
  type ThemeName,
} from "../../lib/theme";
import { MoonIcon, SunIcon } from "../icons";

/** Light/dark pill toggle. Writes `data-theme` on <html> (tokens + 3D scene
 *  follow) and persists to localStorage. */
function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>(() =>
    typeof window !== "undefined" ? currentTheme() : "light",
  );
  useEffect(() => {
    setTheme(currentTheme());
    return onAppearanceChange((t) => setTheme(t));
  }, []);
  const next: ThemeName = theme === "dark" ? "light" : "dark";
  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      aria-pressed={isDark}
      title="Toggle light / dark theme"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      <span className="theme-toggle__icon" aria-hidden="true">
        {isDark ? <MoonIcon size={15} /> : <SunIcon size={15} />}
      </span>
      <span className="theme-toggle__label">
        {isDark ? "Dark mode" : "Light mode"}
      </span>
      <span className={"theme-toggle__track" + (isDark ? " is-dark" : "")} aria-hidden="true">
        <span className="theme-toggle__thumb" />
      </span>
    </button>
  );
}

export default memo(ThemeToggle);
