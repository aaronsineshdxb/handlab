/* Shared light/dark theme contract. The DOM attribute `data-theme` on
 * <html> is the single source of truth; CSS tokens key off it and the 3D
 * engines subscribe to it. Stored choice wins, else the OS preference. */

export type ThemeName = "light" | "dark";

export const THEME_KEY = "handlab-theme";

export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): ThemeName {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

export function currentTheme(): ThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function onThemeChange(cb: (t: ThemeName) => void): () => void {
  const el = document.documentElement;
  let last = currentTheme();
  const mo = new MutationObserver(() => {
    const next = currentTheme();
    if (next !== last) {
      last = next;
      cb(next);
    }
  });
  mo.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}

export interface SceneTheme {
  bg: number;
  gridCenter: number;
  gridMain: number;
  bounds: number;
  cursor: number;
  hemiSky: number;
  hemiGround: number;
  rim: number;
  rimIntensity: number;
  floorOpacity: number;
}

/** Scene chrome per theme. Placed-object colors are user data and never
 *  touched here — only background, grid, lights, and the cursor. */
export const SCENE_THEMES: Record<ThemeName, SceneTheme> = {
  light: {
    bg: 0xFCFCF9,
    gridCenter: 0xCFC9B8,
    gridMain: 0xE3DED0,
    bounds: 0xD8D2C2,
    cursor: 0x016A71,
    hemiSky: 0xffffff,
    hemiGround: 0xd8cfb8,
    rim: 0x016A71,
    rimIntensity: 0.7,
    floorOpacity: 0.32,
  },
  dark: {
    bg: 0x100E12,
    gridCenter: 0x4A4438,
    gridMain: 0x2A2721,
    bounds: 0x3A352B,
    cursor: 0x34B4C4,
    hemiSky: 0x9a9384,
    hemiGround: 0x100e12,
    rim: 0x34B4C4,
    rimIntensity: 0.5,
    floorOpacity: 0.6,
  },
};
