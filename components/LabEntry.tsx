"use client";

import dynamic from "next/dynamic";
import Boot from "./Boot";

// The lab is a WebGL canvas sitting behind a ~590KB Three.js bundle. Splitting
// it keeps the renderer off the critical path so the shell paints first.
// This wrapper exists because Next 15 forbids `ssr: false` in a Server
// Component, and app/page.tsx needs to stay one to own its metadata.
const HandLab = dynamic(() => import("./HandLab"), {
  ssr: false,
  loading: () => <Boot />,
});

export default function LabEntry() {
  return <HandLab />;
}
