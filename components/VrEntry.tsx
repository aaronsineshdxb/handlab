"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import Boot from "./Boot";
import { isIPadOS } from "../lib/caps";

// Same reasoning as LabEntry: the VR engine pulls in the same Three.js bundle,
// so it loads after the shell rather than blocking first paint.
const HandLabVR = dynamic(() => import("./HandLabVR"), {
  ssr: false,
  loading: () => <Boot />,
});

export default function VrEntry() {
  // iPad has no WebXR — hold on <Boot /> until client detection resolves so
  // Three.js/XR chunks are never fetched on iPadOS.
  const [ipad, setIpad] = useState<boolean | null>(null);
  useEffect(() => {
    setIpad(isIPadOS());
  }, []);
  if (ipad === null) {
    return <Boot />;
  }
  if (ipad) {
    return (
      <main className="vr-fatal">
        <div>
          <h1>
            hand<span>lab</span>
          </h1>
          <p>VR needs a headset browser — this iPad gets the full touch lab instead.</p>
          <p>
            <Link className="btn" href="/">
              Back to the lab
            </Link>
          </p>
        </div>
      </main>
    );
  }
  return <HandLabVR />;
}
