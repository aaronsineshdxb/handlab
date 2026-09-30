import { useEffect, useState } from "react";

/**
 * True when the primary pointer is a mouse/trackpad.
 *
 * The page mounts ten Magnets at once, so this caches the matchMedia result at
 * module scope: one query, one synchronous initial value, and no mount-time
 * state flip (the previous version rendered every Magnet twice on mount and
 * then swapped the DOM branch). Subscriptions are still per-instance so a
 * hybrid laptop switching to touch updates live.
 */
let cached: boolean | null = null;
let mql: MediaQueryList | null = null;

function probe(): MediaQueryList {
  if (!mql && typeof window !== "undefined") {
    mql = window.matchMedia("(pointer: fine)");
    cached = mql.matches;
  }
  return mql as MediaQueryList;
}

export function useFinePointer(): boolean {
  // Probing in the state initialiser means the very first Magnet resolves the
  // query during render; the other nine read the cache and never flip.
  const [fine, setFine] = useState<boolean>(() =>
    typeof window === "undefined" ? false : probe().matches,
  );

  useEffect(() => {
    const query = probe();
    if (!query) return;
    setFine(query.matches);
    const onChange = (e: MediaQueryListEvent) => {
      cached = e.matches;
      setFine(e.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return fine;
}
