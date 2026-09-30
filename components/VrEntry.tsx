"use client";

import dynamic from "next/dynamic";
import Boot from "./Boot";

// Same reasoning as LabEntry: the VR engine pulls in the same Three.js bundle,
// so it loads after the shell rather than blocking first paint.
const HandLabVR = dynamic(() => import("./HandLabVR"), {
  ssr: false,
  loading: () => <Boot />,
});

export default function VrEntry() {
  return <HandLabVR />;
}
