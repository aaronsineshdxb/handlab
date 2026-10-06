/* Shared light/dark + accent-scheme contract. `data-theme` (light/dark)
 * and `data-accent` (colour scheme) on <html> are the single source of
 * truth; CSS tokens key off them and the 3D engines subscribe to them.
 * Stored choices win, else the OS preference / teal default. */

export type ThemeName = "light" | "dark";

export const THEME_KEY = "handlab-theme";
export const SCHEME_KEY = "handlab-scheme";
export const CUSTOM_ACCENT_KEY = "handlab-accent-custom";

export type AccentName =
  | "teal"
  | "violet"
  | "forest"
  | "amber"
  | "rose"
  | "blue"
  | "custom";

export interface AccentPreset {
  id: Exclude<AccentName, "custom">;
  label: string;
  /** swatch dot shown in the picker (works on both modes) */
  swatch: string;
  light: { accent: string; accent2: string; scene: number };
  dark: { accent: string; accent2: string; scene: number };
}

/** Preset colour schemes. Light values target ≥4.5:1 on cream, dark values
 *  target ≥4.5:1 on near-black; `scene` is the matching Three.js cursor/rim
 *  hex so the 3D chrome follows the CSS accent. */
export const ACCENTS: Record<Exclude<AccentName, "custom">, AccentPreset> = {
  teal: {
    id: "teal",
    label: "teal",
    swatch: "#016A71",
    light: {
      accent: "oklch(45% 0.075 202)",
      accent2: "oklch(62% 0.1 198)",
      scene: 0x016a71,
    },
    dark: {
      accent: "oklch(72% 0.09 205)",
      accent2: "oklch(76% 0.1 198)",
      scene: 0x34b4c4,
    },
  },
  violet: {
    id: "violet",
    label: "violet",
    swatch: "#6D4DE0",
    light: {
      accent: "oklch(48% 0.14 285)",
      accent2: "oklch(62% 0.15 285)",
      scene: 0x6d4de0,
    },
    dark: {
      accent: "oklch(75% 0.12 285)",
      accent2: "oklch(79% 0.11 285)",
      scene: 0xa48fff,
    },
  },
  forest: {
    id: "forest",
    label: "forest",
    swatch: "#2E7D46",
    light: {
      accent: "oklch(48% 0.11 155)",
      accent2: "oklch(60% 0.13 155)",
      scene: 0x2e7d46,
    },
    dark: {
      accent: "oklch(75% 0.14 155)",
      accent2: "oklch(79% 0.13 155)",
      scene: 0x3ddc84,
    },
  },
  amber: {
    id: "amber",
    label: "amber",
    swatch: "#9A5B00",
    light: {
      accent: "oklch(48% 0.12 75)",
      accent2: "oklch(62% 0.13 75)",
      scene: 0x9a5b00,
    },
    dark: {
      accent: "oklch(76% 0.12 75)",
      accent2: "oklch(80% 0.11 75)",
      scene: 0xe8a33d,
    },
  },
  rose: {
    id: "rose",
    label: "rose",
    swatch: "#A23544",
    light: {
      accent: "oklch(48% 0.13 20)",
      accent2: "oklch(60% 0.14 20)",
      scene: 0xa23544,
    },
    dark: {
      accent: "oklch(70% 0.13 20)",
      accent2: "oklch(75% 0.12 20)",
      scene: 0xe86a7a,
    },
  },
  blue: {
    id: "blue",
    label: "blue",
    swatch: "#2B5FCE",
    light: {
      accent: "oklch(48% 0.13 260)",
      accent2: "oklch(62% 0.14 260)",
      scene: 0x2b5fce,
    },
    dark: {
      accent: "oklch(74% 0.11 260)",
      accent2: "oklch(78% 0.1 260)",
      scene: 0x6ea8fe,
    },
  },
};

export const ACCENT_IDS = Object.keys(ACCENTS) as (keyof typeof ACCENTS)[];

export const DEFAULT_SCHEME: AccentName = "teal";
export const DEFAULT_CUSTOM_HEX = "#016A71";

export function resolveTheme(
  stored: string | null,
  prefersDark: boolean,
): ThemeName {
  if (stored === "dark" || stored === "light") return stored;
  return prefersDark ? "dark" : "light";
}

// NOTE: the scheme allow-list is triplicated — here, the `ok` array in
// THEME_INIT (app/layout.tsx, cannot import TS), and the keys of ACCENTS
// plus tokens.css blocks. Adding a preset must touch all four.
export function isAccentName(v: string | null): v is AccentName {
  return (
    v === "teal" ||
    v === "violet" ||
    v === "forest" ||
    v === "amber" ||
    v === "rose" ||
    v === "blue" ||
    v === "custom"
  );
}

export function resolveScheme(stored: string | null): AccentName {
  return isAccentName(stored) ? stored : DEFAULT_SCHEME;
}

export function isValidCustomHex(v: string | null): v is string {
  return typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function resolveCustomHex(stored: string | null): string | null {
  return isValidCustomHex(stored) ? stored : null;
}

export function currentTheme(): ThemeName {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function currentScheme(): AccentName {
  if (typeof document === "undefined") return DEFAULT_SCHEME;
  const v = document.documentElement.dataset.accent ?? null;
  if (isAccentName(v)) return v;
  try {
    return resolveScheme(localStorage.getItem(SCHEME_KEY));
  } catch {
    return DEFAULT_SCHEME;
  }
}

export function currentCustomHex(): string | null {
  if (typeof document === "undefined") return null;
  const inline = document.documentElement.style
    .getPropertyValue("--color-accent")
    .trim();
  if (isValidCustomHex(inline)) return inline;
  try {
    return resolveCustomHex(localStorage.getItem(CUSTOM_ACCENT_KEY));
  } catch {
    return null;
  }
}

export function hexToNumber(hex: string): number | null {
  if (!isValidCustomHex(hex)) return null;
  return parseInt(hex.slice(1), 16);
}

/** Three.js cursor/rim hex for the effective scheme. Placed-object colors
 *  are user data and never flow through here. */
export function sceneAccentFor(
  theme: ThemeName,
  scheme: AccentName,
  customHex: string | null,
): number {
  if (scheme === "custom" && isValidCustomHex(customHex)) {
    return hexToNumber(customHex) ?? ACCENTS.teal[theme].scene;
  }
  if (scheme === "custom") return ACCENTS.teal[theme].scene;
  return ACCENTS[scheme][theme].scene;
}

/** Luminance threshold for picking readable text on an accent fill.
 *  Keep in sync with the duplicated inline logic in THEME_INIT
 *  (app/layout.tsx) — the blocking script cannot import this module. */
export const ACCENT_INK_THRESHOLD = 0.35;

/** Readable text on top of an accent fill. Picks cream vs warm-black by
 *  relative luminance of the accent hex. */
export function accentInkFor(hex: string): string {
  const n = hexToNumber(hex);
  if (n == null) return "#FCFCF9";
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > ACCENT_INK_THRESHOLD ? "#27251E" : "#FCFCF9";
}

/** Persist + paint a scheme. Presets clear the custom inline overrides so
 *  `tokens.css` owns the tokens again; `custom` sets them inline so any hex
 *  works in both modes. */
export function applyAccent(scheme: AccentName, customHex?: string): void {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  const next = resolveScheme(scheme);
  let custom: string | null = null;
  if (next === "custom") {
    custom =
      isValidCustomHex(customHex ?? null)
        ? (customHex as string)
        : currentCustomHex() ?? DEFAULT_CUSTOM_HEX;
  }
  el.dataset.accent = next;
  if (next === "custom" && custom) {
    el.style.setProperty("--color-accent", custom);
    el.style.setProperty("--color-focus", custom);
    el.style.setProperty(
      "--color-accent-2",
      `color-mix(in oklch, ${custom} 72%, white)`,
    );
    el.style.setProperty("--color-accent-ink", accentInkFor(custom));
  } else {
    el.style.removeProperty("--color-accent");
    el.style.removeProperty("--color-focus");
    el.style.removeProperty("--color-accent-2");
    el.style.removeProperty("--color-accent-ink");
  }
  try {
    localStorage.setItem(SCHEME_KEY, next);
    if (next === "custom" && custom) localStorage.setItem(CUSTOM_ACCENT_KEY, custom);
  } catch {
    /* private mode: scheme still applies for this session */
  }
}

export function applyTheme(theme: ThemeName): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* private mode */
  }
}

function appearanceKey(): string {
  return `${currentTheme()}|${currentScheme()}|${currentCustomHex() ?? ""}`;
}

function observeAppearance(cb: () => void): () => void {
  const el = document.documentElement;
  let last = appearanceKey();
  const mo = new MutationObserver(() => {
    const next = appearanceKey();
    if (next !== last) {
      last = next;
      cb();
    }
  });
  mo.observe(el, {
    attributes: true,
    attributeFilter: ["data-theme", "data-accent", "style"],
  });
  return () => mo.disconnect();
}

/** Fires on theme AND scheme flips (scheme lives in data-accent/style, so
 *  engines re-skin without a second subscription). */
export function onThemeChange(cb: (t: ThemeName) => void): () => void {
  return observeAppearance(() => cb(currentTheme()));
}

export function onAppearanceChange(
  cb: (t: ThemeName, s: AccentName) => void,
): () => void {
  return observeAppearance(() => cb(currentTheme(), currentScheme()));
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

/** Full scene chrome for a theme+scheme pair. Base canvas/grid/lights
 *  come from the mode; cursor + rim follow the accent scheme. */
export function sceneThemeFor(
  theme: ThemeName,
  scheme: AccentName,
  customHex: string | null,
): SceneTheme {
  const base = SCENE_THEMES[theme];
  const accent = sceneAccentFor(theme, scheme, customHex);
  return { ...base, cursor: accent, rim: accent };
}

export function sceneThemeNow(): SceneTheme {
  return sceneThemeFor(currentTheme(), currentScheme(), currentCustomHex());
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
