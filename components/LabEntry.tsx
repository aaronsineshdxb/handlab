"use client";

import dynamic from "next/dynamic";
import { useCallback, useState } from "react";
import Boot from "./Boot";

// Presentation default: judging-panel showcase. Hand-tracking sandbox
// (webcam → 3D cursor) stays one click away — it was never removed,
// only hidden behind ?sandbox=1 with no UI affordance. This toggle
// makes both first-class.
const ShowcaseLab = dynamic(() => import("./ShowcaseLab"), {
  ssr: false,
  loading: () => <Boot />,
});
const HandLab = dynamic(() => import("./HandLab"), {
  ssr: false,
  loading: () => <Boot />,
});

function initialView(): "showcase" | "hand" {
  if (typeof window === "undefined") return "showcase";
  return new URLSearchParams(window.location.search).get("sandbox") === "1" ? "hand" : "showcase";
}

export default function LabEntry() {
  const [view, setView] = useState<"showcase" | "hand">(initialView);

  const switchTo = useCallback((next: "showcase" | "hand") => {
    setView(next);
    try {
      const url = new URL(window.location.href);
      if (next === "hand") url.searchParams.set("sandbox", "1");
      else url.searchParams.delete("sandbox");
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* non-fatal: view still switches */
    }
  }, []);

  return (
    <>
      {view === "hand" ? <HandLab /> : <ShowcaseLab />}
      <button
        type="button"
        onClick={() => switchTo(view === "hand" ? "showcase" : "hand")}
        aria-label={view === "hand" ? "Back to geometry showcase" : "Open hand-tracking lab"}
        title={view === "hand" ? "Back to geometry showcase" : "Open hand-tracking lab (webcam hand control)"}
        style={{
          position: "fixed",
          right: 16,
          top: 76,
          zIndex: 100,
          background: "#0F172A",
          color: "#F8FAFC",
          border: "1px solid #0F172A",
          borderRadius: 999,
          padding: "10px 18px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          boxShadow: "0 12px 30px -12px rgb(15 23 42/.4)",
          whiteSpace: "nowrap",
        }}
      >
        {view === "hand" ? "← Showcase" : "✋ Hand tracking"}
      </button>
    </>
  );
}
