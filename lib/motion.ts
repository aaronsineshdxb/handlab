/**
 * OS-level reduced-motion probe and live subscription for the imperative engines.
 *
 * The CSS tokens and every `components/bits/*` primitive already honour
 * `prefers-reduced-motion`, but the engines' `requestAnimationFrame` loops do
 * not go through React or CSS, so they must query and subscribe directly.
 * When reduced motion is active, continuous decorative motion (cursor ring
 * spin, z-axis pulse, auto-spin) is skipped, and the cursor follows input
 * without a trailing lerp. SSR-safe.
 */
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

/** Subscribe to live OS reduced-motion changes. Returns an unsubscribe callback. */
export function onReducedMotionChange(
  cb: (reduced: boolean) => void,
): () => void {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return () => {};
  }
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  const onChange = (e: MediaQueryListEvent) => cb(e.matches);
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }
  if (typeof mql.addListener === "function") {
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }
  return () => {};
}
