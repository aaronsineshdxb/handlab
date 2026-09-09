# Dogfood QA Report

**Target:** http://localhost:8735/index.html (HANDLAB — 3D Hand Cursor, single-file app at `~/workspace/designs/hand-3d-cursor/index.html`)
**Date:** 2026-09-05
**Scope:** Full page — initial render, Three.js scene, toolbar/palette, mouse-fallback pointer model (place, hover, drag, wheel-Z, Delete, undo, clear, toggles, keyboard shortcuts), console-error monitoring, favicon/network check, webcam-flow attempt, 390px mobile layout audit.
**Tester:** Hermes Agent (automated exploratory QA via ego-browser)

---

## Executive Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 4 |
| **Total** | **5** |

**Overall Assessment:** Core app is healthy — scene renders, all pointer functions work, zero JS errors across every interaction; findings are one responsive overflow plus minor polish items.

---

## Issues

### Issue #1: Status cards overflow the viewport at 390px wide

| Field | Value |
|-------|-------|
| **Severity** | Medium |
| **Category** | Visual |
| **URL** | http://localhost:8735/index.html (emulated 390x844) |

**Description:**
The top-right `.status-cards` row has 4 cards at `min-width:108px` plus gaps/padding (~470px total) inside a non-wrapping flex `.hud-top`. At 390px viewport the row is wider than the screen, and since `body{overflow:hidden}`, the excess is clipped with no way to scroll to it — the OBJECTS card (and possibly CURSOR XYZ) is cut off on phones.

**Steps to Reproduce:**
1. Open the page at 390px width (mobile emulation or a phone).
2. Look at the top-right telemetry cards.

**Expected Behavior:**
All four status cards visible, or gracefully wrapped/collapsed on narrow screens.

**Actual Behavior:**
Row exceeds viewport width; rightmost cards clipped, unreachable (no scroll).

**Screenshot:**
See `screenshots/mobile-390.png` (captured; AI-vision review unavailable — see Blockers).

---

### Issue #2: Palette heading says [1–5] but there are 6 shapes / keys 1–6

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Content |
| **URL** | http://localhost:8735/index.html |

**Description:**
Toolbar heading reads `SPAWN SHAPE [1–5]`, but the grid has 6 buttons (cube, sphere, cone, torus, cyl, gem) and the keyboard handler accepts keys `1`–`6`. Verified live: pressing `3` selected cone.

**Steps to Reproduce:**
1. Count the shape buttons (6) and read the heading ([1–5]).

**Expected Behavior:** Heading reads `[1–6]`.

**Actual Behavior:** Heading reads `[1–5]`.

---

### Issue #3: Missing favicon causes /favicon.ico 404

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Console |
| **URL** | http://localhost:8735/index.html |

**Description:**
No `<link rel="icon">` in the document; every page load fires a favicon request that 404s.

**Steps to Reproduce:**
1. Load the page and watch the server/access log.

**Expected Behavior:** No failed requests on load.

**Actual Behavior:** `GET /favicon.ico → 404` on every load.

**Console Errors** (server access log):
```
::1 - - [05/Sep/2026 12:09:07] code 404, message File not found
::1 - - [05/Sep/2026 12:09:07] "GET /favicon.ico HTTP/1.1" 404 -
```

**Suggested fix:** one-line inline SVG data-URI icon.

---

### Issue #4: Bottom controls and depth bar can overlap on narrow screens

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | Visual |
| **URL** | http://localhost:8735/index.html (narrow viewports) |

**Description:**
`.controls` (left-anchored, ~3 buttons ≈ 340px+) and `#depthbar` (centered, 280px) are both fixed to `bottom:20px` with no media-query adjustment. At ~390px they overlap each other. At desktop widths (tested 1424px) they are clear.

**Steps to Reproduce:**
1. Shrink viewport to ~390px.
2. Observe bottom-left controls vs centered depth bar.

**Expected Behavior:** Stacked or repositioned controls on small screens.

**Actual Behavior:** Elements overlap; see `screenshots/mobile-390.png`.

---

### Issue #5: Pinch-tap on an existing object gives no persistent selection feedback

| Field | Value |
|-------|-------|
| **Severity** | Low |
| **Category** | UX |
| **URL** | http://localhost:8735/index.html |

**Description:**
Tapping an existing object fires a `selected` toast, but nothing persists — hover emissive highlight is transient, and there is no selected-state ring/outline. A user can't tell what is "selected" afterward.

**Steps to Reproduce:**
1. Click an existing shape in the scene.
2. Observe the toast; note no lasting visual change on the object.

**Expected Behavior:** A visible selected state (or no "selected" claim).

**Actual Behavior:** Toast only, no persistent state.

---

## Issues Summary Table

| # | Title | Severity | Category | URL |
|---|-------|----------|----------|-----|
| 1 | Status cards overflow at 390px | Medium | Visual | /index.html (mobile) |
| 2 | Heading [1–5] vs 6 shapes/keys | Low | Content | /index.html |
| 3 | Missing favicon → 404 | Low | Console | /index.html |
| 4 | Bottom controls/depth overlap on narrow screens | Low | Visual | /index.html (mobile) |
| 5 | No persistent selection feedback | Low | UX | /index.html |

## Testing Coverage

### Pages Tested
- Single-page app: full HUD (header stats, shape palette, gesture map, video dock, bottom controls, depth bar), Three.js viewport.

### Features Tested
- Initial render: WebGL live, grid, bounds box, 5 starter objects with shadows, 3D cursor with drop line — all correct, no visual glitches.
- Shape select via click (sphere) and keyboard (`3` → cone).
- Place object by clicking empty canvas (count 5 → 6).
- Undo (6 → 5), Delete key on hovered object (5 → 4), Clear (→ 0).
- auto-rotate and grid toggles (labels flip on/off).
- Mouse wheel → Z depth (0.0 → −0.3, smoothing as designed).
- In-page error hook (`error` + `unhandledrejection` listeners) across all interactions: zero JS errors.
- Server log: no failed CDN loads (three.js/OrbitControls executed — scene proves it; a naive transferSize check false-flagged them as cached).

### Not Tested / Out of Scope
- Real hand-tracking gestures (pinch, fist, two-hand zoom) — need a physical camera + hand.
- Webcam-denied UX copy in a real browser permission flow.
- Performance profiling under sustained load.

### Blockers
- Automation browser had no camera: `Enable webcam` flow couldn't complete (model stays `loading…`, hand status `none` — correct idle state, not a bug).
- User took over the ego-browser task space twice mid-run (once around the webcam click, once ending it); live testing stopped there. Page state confirmed reloaded afterward.
- AI-vision screenshot review failed (vision API credits exhausted, 402). Screenshots were captured and are cosmetically verified only via DOM/state probing:
  - `screenshots/desktop-final.png` (1424x702)
  - `screenshots/mobile-390.png` (390x844)
  - `screenshots/webcam-state.png`, `screenshots/webcam-denied.png`

---

## Notes

- Suggested fix bundle (all one-liners): `[1–5]` → `[1–6]`; add inline-SVG favicon; allow `.hud-top` to wrap and `.status-cards` to shrink/scroll at <720px; stack `.controls`/`#depthbar` under the existing 900px breakpoint.
- The `transferSize === 0` resource heuristic false-flags cached CDN modules — don't treat it as a failure signal when the dependent feature demonstrably works.
- Test server left running on port 8735 for manual follow-up; say the word and I'll stop it or apply the fixes.
