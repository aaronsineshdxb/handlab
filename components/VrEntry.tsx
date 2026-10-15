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
  // iPad has no WebXR — don't even load the Three.js/XR chunk there.
  const [ipad, setIpad] = useState(false);
  useEffect(() => {
    setIpad(isIPadOS());
  }, []);
  if (ipad) {
    return (
      <div className="vr-fatal">
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
      </div>
    );
  }
  return <HandLabVR />;
}
