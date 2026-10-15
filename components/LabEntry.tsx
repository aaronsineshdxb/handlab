"use client";

import dynamic from "next/dynamic";
import Boot from "./Boot";

// Single unified view: the sandbox scene (hand tracking, lines, depth,
// save/load) inside the showcase design (light theme, collapsed chrome,
// live math, Learn/Studio). ?sandbox=1 still lands here for old links.
const ShowcaseLab = dynamic(() => import("./ShowcaseLab"), {
  ssr: false,
  loading: () => <Boot />,
});

export default function LabEntry() {
  return <ShowcaseLab />;
}
