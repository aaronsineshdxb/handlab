"use client";

import { memo, useEffect, useState } from "react";
import { applyTheme, currentTheme, type ThemeName } from "../../lib/theme";

/** Light/dark toggle. Writes `data-theme` on <html> (tokens + 3D scene
 *  follow) and persists to localStorage. Initial value is painted by the
 *  blocking init script in layout, so this only handles flips. */
function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeName>("light");
  useEffect(() => {
    setTheme(currentTheme());
  }, []);
  const next: ThemeName = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      className="mini"
      style={{ width: "100%" }}
      aria-pressed={theme === "dark"}
      title="Toggle light / dark theme"
      onClick={() => {
        applyTheme(next);
        setTheme(next);
      }}
    >
      ◐ theme: {theme}
    </button>
  );
}

export default memo(ThemeToggle);
