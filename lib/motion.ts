/**
 * OS-level reduced-motion probe for the imperative 3D engines.
 *
 * The CSS tokens and every `components/bits/*` primitive already honour
 * `prefers-reduced-motion`, but the engines' `requestAnimationFrame` loops do
 * not go through React or CSS, so they must ask directly. Read once at engine
 * construction: continuous decorative motion (cursor ring spin, z-axis pulse)
 * is skipped, and the cursor follows input without a trailing lerp. SSR-safe.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}
