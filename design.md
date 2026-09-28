# Design — HANDLAB

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Going with: audience = students · use = studying · tone = technical.
Genre: modern-minimal (Cobalt register — cool instrument-panel technical).

## Genre
modern-minimal

## Macrostructure family
Pick one base macrostructure for marketing pages, one for app pages, one for
content pages (if applicable). Pages within a family share the family's shape;
they vary only in component archetypes.

- Marketing pages (future): Marquee Hero — title-left / live-lab proof-right, hairline dividers.
- App pages: Workbench — canvas-first workspace, left tool rail, top HUD status, bottom control bar. F2 sticky-scroll knobs: pinned=left, content=tool-rail, steps=4.
- Content pages: Long Document — 404 + error states, centred card, typography only.

## Theme
Custom OKLCH dark, anchored on brand blue `#4da3ff`. Vibe: "industrial precision, cool, technical".
Axes: dark / geometric-sans / cool.

- `--color-paper`   oklch(13% 0.012 250)
- `--color-paper-2` oklch(17% 0.014 250)
- `--color-paper-3` oklch(22% 0.014 250)
- `--color-ink`     oklch(94% 0.008 250)
- `--color-ink-2`   oklch(78% 0.010 250)
- `--color-rule`    oklch(30% 0.014 250)
- `--color-rule-2`  oklch(38% 0.014 250)
- `--color-muted`   oklch(68% 0.018 250)
- `--color-neutral` oklch(58% 0.014 250)
- `--color-accent`  oklch(68% 0.160 250)
- `--color-accent-2` oklch(64% 0.200 285)
- `--color-accent-ink` oklch(18% 0.020 250)
- `--color-focus`   oklch(72% 0.200 250)
- `--color-good`    oklch(72% 0.170 160)
- `--color-warn`    oklch(76% 0.160 75)
- `--color-bad`     oklch(64% 0.220 25)

Legacy aliases (do not use in new code, kept for compatibility):
`--bg` → `--color-paper`, `--surface` → `--color-paper-2`,
`--surface2` → `--color-paper-3`, `--fg` → `--color-ink`,
`--muted` → `--color-muted`, `--accent` → `--color-accent`,
`--accent2` → `--color-accent-2`, `--good` → `--color-good`,
`--warn` → `--color-warn`, `--bad` → `--color-bad`,
`--border` → `--color-rule`.

## Typography
- Display: Space Grotesk, weight 700, style normal (roman — italic headers banned)
- Body: IBM Plex Sans, weight 400
- Mono: IBM Plex Mono, weight 400/500
- Display tracking: -0.02em
- Label tracking: 0.08em–0.14em uppercase
- Type scale anchor: --text-display = clamp(2.0rem, 3vw + 1rem, 3.25rem) — app HUD, not marketing hero
- Tabular numbers on all data: `font-variant-numeric: tabular-nums`
- Headings roman always. Emphasis via weight or accent, never italic.

## Spacing
4-point named scale. The values are in `tokens.css`. Pages must use named
tokens (`var(--space-md)`), never raw values.

## Motion
- Library: motion 13.x (`motion/react`) — motion-on project as of the visual overhaul.
- Allowlist (max 3 primitives per view): Dock magnification (fine pointers only)
  · Magnet pull ≤0.3 (fine pointers only) · layoutId sliding indicator (tabs, domain pill)
  · one-shot text entrance (BlurText) · one-shot list stagger (AnimatedList)
  · 404 turbulence + conic border (content page only).
- Everything else stays CSS: easings cubic-bezier(0.16, 1, 0.3, 1) `--ease-out`,
  cubic-bezier(0.7, 0, 0.84, 0) `--ease-in`, cubic-bezier(0.65, 0, 0.35, 1) `--ease-in-out`.
- Reveal pattern: fade only + ≤12px rise, one-shot. No scroll-linked motion.
- Reduced-motion fallback: opacity-only, ≤ 150 ms. Every motion primitive ships
  static (useReducedMotion + media query). Touch gets static bars.
- Animate transform + opacity only. Never width/height/top/left/margin/padding.
- Focus rings appear instantly (0 ms), never transitioned.
- Deliberately skipped: second WebGL background (live canvas owns the GPU),
  toast-stack refactor (engine writes `#toast` imperatively), CountUp on HUD
  stats (engine writes via refs), carousels, Lottie.

## Microinteractions stance
- silent success — no celebratory toasts for visible effects; toasts only for failures + invisible async
- hover delay 800 ms · focus delay 0 ms
- optimistic update + Undo for reversible actions; confirm only for irreversible destroy
- button press: scale 0.98 / translateY(1px), 100 ms in, 150 ms out
- copy-to-clipboard: label swap, no toast
- spinners: delay-show 150 ms or min-visible 300 ms

## CTA voice
- Primary CTA: solid `--color-accent` fill, `--color-accent-ink` text, 8px radius, single verb ("Enable webcam", "Save", "Next"). `white-space: nowrap`.
- Secondary CTA: `--color-paper-3` fill, 1px `--color-rule` border, `--color-ink` text, 8px radius.
- Domain pills: 999px pill, 1px border, active = accent border + accent-tinted fill.
- Technical voice: spec-embedded, measured, data-first. Name the endpoint, command, number. Banned: seamless, unleash, empower, supercharge, magical, click here.

## Per-page allowances
- Marketing pages MAY use enrichment (Tier-A CSS art, Tier-B SVG, etc.).
- App pages MUST NOT use enrichment — function carries the page.
- Content pages: typography only.

## What pages MUST share
- The wordmark / logotype (HANDLAB, Space Grotesk 700, tracking 0.14em).
- The accent colour and its placement (≤ 5 % per viewport).
- The display + body fonts.
- The CTA voice (button shape, border-radius, padding rhythm).
- Section heading rhythm (mono label + display heading stacked vertically, never tag-left/header-right).

## What pages MAY differ on
- Macrostructure within the page-type family (geometry vs physics vs chemistry labs share Workbench bones, vary tool rails).
- Hero archetype (within the family's allowance).
- Enrichment — only on marketing pages, only Tier-A or Tier-B.

## Exports

Drop-in formats for re-using this design system in other projects.

### tokens.css
See `tokens.css` at project root (source of truth).

### Tailwind v4 `@theme`
```css
@theme {
  --color-paper: oklch(13% 0.012 250);
  --color-paper-2: oklch(17% 0.014 250);
  --color-paper-3: oklch(22% 0.014 250);
  --color-ink: oklch(94% 0.008 250);
  --color-ink-2: oklch(78% 0.010 250);
  --color-rule: oklch(30% 0.014 250);
  --color-muted: oklch(68% 0.018 250);
  --color-accent: oklch(68% 0.160 250);
  --color-accent-ink: oklch(18% 0.020 250);
  --color-focus: oklch(72% 0.200 250);
  --font-display: "Space Grotesk", ui-sans-serif, system-ui, sans-serif;
  --font-body: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  --font-outlier: "IBM Plex Mono", ui-monospace, monospace;
  --spacing-md: 1.5rem;
  --text-md: 1.125rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`
```json
{
  "color": {
    "paper": { "$value": "oklch(13% 0.012 250)", "$type": "color" },
    "paper-2": { "$value": "oklch(17% 0.014 250)", "$type": "color" },
    "paper-3": { "$value": "oklch(22% 0.014 250)", "$type": "color" },
    "ink": { "$value": "oklch(94% 0.008 250)", "$type": "color" },
    "accent": { "$value": "oklch(68% 0.160 250)", "$type": "color" },
    "focus": { "$value": "oklch(72% 0.200 250)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Space Grotesk", "$type": "fontFamily" },
    "body": { "$value": "IBM Plex Sans", "$type": "fontFamily" },
    "outlier": { "$value": "IBM Plex Mono", "$type": "fontFamily" }
  },
  "space": { "md": { "$value": "1.5rem", "$type": "dimension" } }
}
```

### shadcn/ui CSS variables
```css
:root {
  --background: 13% 0.012 250;
  --foreground: 94% 0.008 250;
  --primary: 68% 0.160 250;
  --primary-foreground: 18% 0.020 250;
  --muted: 30% 0.014 250;
  --muted-foreground: 68% 0.018 250;
  --border: 30% 0.014 250;
  --input: 30% 0.014 250;
  --ring: 72% 0.200 250;
  --radius: 8px;
}
```

## Provenance
- Pages inventoried: `app/page.tsx` (geometry workspace), `app/physics/page.tsx` (mechanics/electrostatics/optics), `app/chemistry/page.tsx` (VSEPR/wet-lab), `app/vr/page.tsx` (WebXR isolated), `app/not-found.tsx` (out-of-tracking-range 404).
- No prior `.hallmark/log.json`. First Hallmark run for this project.
- Pre-flight preserved: Space Grotesk + IBM Plex Mono via next/font, dark intent, Next.js routes.
