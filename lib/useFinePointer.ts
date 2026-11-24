import { useEffect, useState } from "react";

/**
 * True when the primary pointer is a mouse/trackpad.
 *
 * SSR-safe: initializes to `false` so server and initial client render always
 * agree (no hydration mismatch), then reads and subscribes to the cached
 * matchMedia query in `useEffect` so hybrid devices switching between mouse
 * and touch update live.
 */
let mql: MediaQueryList | null = null;

function probe(): MediaQueryList | null {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }
  if (!mql) {
    mql = window.matchMedia("(pointer: fine)");
  }
  return mql;
}

export function useFinePointer(): boolean {
  const [fine, setFine] = useState<boolean>(false);

  useEffect(() => {
    const query = probe();
    if (!query) return;
    setFine(query.matches);
    const onChange = (e: MediaQueryListEvent) => {
      setFine(e.matches);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return fine;
}
