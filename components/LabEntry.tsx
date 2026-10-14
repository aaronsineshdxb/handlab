"use client";

import dynamic from "next/dynamic";
import Boot from "./Boot";

// Presentation default: the judging-panel showcase (light, maximised
// viewport, collapsed chrome, live math, Learn/Studio toggle).
// The hand-tracking sandbox is preserved at ?sandbox=1.
const ShowcaseLab = dynamic(() => import("./ShowcaseLab"), {
  ssr: false,
  loading: () => <Boot />,
});
const HandLab = dynamic(() => import("./HandLab"), {
  ssr: false,
  loading: () => <Boot />,
});

export default function LabEntry() {
  if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("sandbox") === "1") {
    return <HandLab />;
  }
  return <ShowcaseLab />;
}
