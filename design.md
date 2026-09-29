# Design — HANDLAB

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Going with: audience = students · use = studying · tone = technical.
Genre: modern-minimal, Perplexity register — warm cream canvas, quiet chrome,
single teal voltage, pill-first geometry.

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
Custom OKLCH light, Perplexity DNA (cream canvas, warm ink, single teal voltage).
Vibe: "warm paper, quiet chrome, teal voltage".
Axes: light / geometric-sans / cool.

- `--color-paper`   oklch(98.6% 0.005 95)  — canvas #FCFCF9
- `--color-paper-2` oklch(99.4% 0.003 95)  — cards, near-white
- `--color-paper-3` oklch(95.5% 0.008 88)  — fills, inputs-at-rest
- `--color-ink`     oklch(24% 0.012 85)    — text #27251E
- `--color-ink-2`   oklch(38% 0.012 85)    — strong secondary
- `--color-rule`    oklch(89% 0.008 85)    — hairlines
- `--color-rule-2`  oklch(82% 0.01 85)     — stronger rules
- `--color-muted`   oklch(56% 0.01 85)     — smoke #72706B
- `--color-neutral` oklch(45% 0.01 85)     — mid neutral
- `--color-accent`  oklch(45% 0.075 202)   — teal voltage #016A71
- `--color-accent-2` oklch(62% 0.10 198)   — bright teal #00A1AC
- `--color-accent-ink` oklch(98.6% 0.005 95) — cream text on teal
- `--color-focus`   oklch(45% 0.075 202)   — teal rings everywhere
- `--color-good`    oklch(55% 0.12 155)    — positive #539E55 family
- `--color-warn`    oklch(52% 0.13 55)     — warning #97431A family
- `--color-bad`     oklch(50% 0.14 20)     — negative #A23544 family

## Dark mode
First-class, Perplexity-style. `data-theme="dark"` on `<html>` re-keys every
token; a blocking init script in layout paints the stored choice (else the OS
preference) before first paint. Toggle lives in each lab toolbar (DISPLAY
section), persists to `localStorage(handlab-theme)`. The 3D engines subscribe
via `lib/theme.ts` (`SCENE_THEMES` + MutationObserver) and re-skin background,
fog, grid, bounds, lights, floor shadow, and rest-state cursor; pinch/line
state tints swap to their bright pair. Placed-object colors are user data and
never change with the theme. 2D fallback picks its palette per frame.

- `--color-paper`   oklch(15% 0.008 80)   — canvas #100E12
- `--color-paper-2` oklch(20% 0.01 80)    — cards
- `--color-paper-3` oklch(25% 0.012 80)   — fills
- `--color-ink`     oklch(93% 0.008 90)   — warm white text
- `--color-ink-2`   oklch(80% 0.01 85)
- `--color-rule`    oklch(28% 0.01 80)
- `--color-rule-2`  oklch(34% 0.012 80)
- `--color-muted`   oklch(68% 0.01 85)
- `--color-neutral` oklch(60% 0.01 85)
- `--color-accent`  oklch(72% 0.09 205)   — brightened teal #34B4C4
- `--color-accent-ink` oklch(15% 0.008 80) — near-black text on teal
- `--color-focus`   oklch(72% 0.09 205)
- `--color-good`    oklch(70% 0.14 155)
- `--color-warn`    oklch(72% 0.12 65)
- `--color-bad`     oklch(68% 0.13 20)
- Shadows go black-based on dark (elevation still reads via lightness steps).

Legacy aliases (do not use in new code, kept for compatibility):
`--bg` → `--color-paper`, `--surface` → `--color-paper-2`,
`--surface2` → `--color-paper-3`, `--fg` → `--color-ink`,
`--muted` → `--color-muted`, `--accent` → `--color-accent`,
`--accent2` → `--color-accent-2`, `--good` → `--color-good`,
`--warn` → `--color-warn`, `--bad` → `--color-bad`,
`--border` → `--color-rule`.

## Typography
- Display: Geist, weight 500, style normal, tracking -0.015em (pplxSans voice)
- Body: Geist, weight 400/500
- Serif: Newsreader, weight 400/500 — reading surfaces only (lesson prompts,
  experiment body, 404 title/sub, VR fatal copy). Perplexity answers in serif.
- Mono: Geist Mono, weight 400 — code, kbd, and data readouts only.
- Wordmark: lowercase, Geist 600, tracking -0.01em (no logo glyph).
- Display tracking: -0.015em
- Label tracking: 0.04em–0.06em, 11–12px, weight 500, uppercase
- Type scale anchor: --text-display = clamp(2.0rem, 3vw + 1rem, 3.0rem)
- Tabular numbers on all data: `font-variant-numeric: tabular-nums`
- Headings roman always. Emphasis via weight or teal, never italic.

## Spacing
4-point named scale. The values are in `tokens.css`. Pages must use named
tokens (`var(--space-md)`), never raw values.

## Motion
- Library: motion 13.x (`motion/react`) — motion-on project as of the visual overhaul.
- Allowlist (max 3 primitives per view): static Dock (entrance fade + press
  tick only — no hover magnification) · Magnet pull ≤0.3 (fine pointers only) · layoutId sliding indicator (tabs, domain pill)
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
- Primary CTA: solid `--color-ink` fill, `--color-paper` text, pill radius,
  single verb ("Enable webcam", "Save", "Next"). `white-space: nowrap`.
- Secondary CTA: `--color-paper-2` fill, 1px `--color-rule` border,
  `--color-ink` text, pill radius. Hover deepens border to ink.
- Color: single round native well (`ColorWell`) + hex readout. Any color
  pickable; hand-pinch path matches `input`, so no extra wiring.
- Teal is CTA-adjacent only: links, focus rings, active pills, citations —
  never a button fill. (Perplexity reserves teal for moments of action.)
- Domain pills: pill, hairline border; active = ink fill + cream text.
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
  --color-paper: oklch(98.6% 0.005 95);
  --color-paper-2: oklch(99.4% 0.003 95);
  --color-paper-3: oklch(95.5% 0.008 88);
  --color-ink: oklch(24% 0.012 85);
  --color-ink-2: oklch(38% 0.012 85);
  --color-rule: oklch(89% 0.008 85);
  --color-muted: oklch(56% 0.01 85);
  --color-accent: oklch(45% 0.075 202);
  --color-accent-ink: oklch(98.6% 0.005 95);
  --color-focus: oklch(45% 0.075 202);
  --font-display: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-body: "Geist", ui-sans-serif, system-ui, sans-serif;
  --font-outlier: "Geist Mono", ui-monospace, monospace;
  --spacing-md: 1.5rem;
  --text-md: 1rem;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}
```

### DTCG `tokens.json`
```json
{
  "color": {
    "paper": { "$value": "oklch(98.6% 0.005 95)", "$type": "color" },
    "paper-2": { "$value": "oklch(99.4% 0.003 95)", "$type": "color" },
    "paper-3": { "$value": "oklch(95.5% 0.008 88)", "$type": "color" },
    "ink": { "$value": "oklch(24% 0.012 85)", "$type": "color" },
    "accent": { "$value": "oklch(45% 0.075 202)", "$type": "color" },
    "focus": { "$value": "oklch(45% 0.075 202)", "$type": "color" }
  },
  "font": {
    "display": { "$value": "Geist", "$type": "fontFamily" },
    "body": { "$value": "Geist", "$type": "fontFamily" },
    "outlier": { "$value": "Geist Mono", "$type": "fontFamily" }
  },
  "space": { "md": { "$value": "1.5rem", "$type": "dimension" } }
}
```

### shadcn/ui CSS variables
```css
:root {
  --background: 98.6% 0.005 95;
  --foreground: 24% 0.012 85;
  --primary: 45% 0.075 202;
  --primary-foreground: 98.6% 0.005 95;
  --muted: 89% 0.008 85;
  --muted-foreground: 56% 0.01 85;
  --border: 89% 0.008 85;
  --input: 89% 0.008 85;
  --ring: 45% 0.075 202;
  --radius: 12px;
}
```

## Provenance
- Pages inventoried: `app/page.tsx` (geometry workspace), `app/physics/page.tsx` (mechanics/electrostatics/optics), `app/chemistry/page.tsx` (VSEPR/wet-lab), `app/vr/page.tsx` (WebXR isolated), `app/not-found.tsx` (out-of-tracking-range 404).
- No prior `.hallmark/log.json`. First Hallmark run for this project.
- Pre-flight preserved: Space Grotesk + IBM Plex Mono via next/font, dark intent, Next.js routes.
- Full remake (2026-09-28): Perplexity design language — cream canvas #FCFCF9,
  ink #27251E, teal voltage #016A71, Geist + Newsreader + Geist Mono,
  pill-first geometry. 3D scene re-lit for cream (bg/fog/grid/lights/cursor).
  Structural DNA only; no Perplexity assets, fonts, or copy reused.
