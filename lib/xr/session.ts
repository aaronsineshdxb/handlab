/**
 * WebXR session helpers for the isolated `/vr` page.
 * Desktop `/` lab is untouched — this module never imports MediaPipe.
 */

export type XRSupportState = "unknown" | "ready" | "unsupported";

/** HTTPS (or localhost) is required for immersive-vr. */
export function needsHTTPS(): boolean {
  if (typeof window === "undefined") return false;
  const { protocol, hostname } = window.location;
  const local = hostname === "localhost" || hostname === "127.0.0.1";
  return protocol !== "https:" && !local;
}

export function xrApiPresent(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "xr" in navigator &&
    !!(navigator as Navigator & { xr?: unknown }).xr
  );
}

export async function isVRSupported(): Promise<boolean> {
  try {
    const nav = navigator as Navigator & {
      xr?: { isSessionSupported(mode: string): Promise<boolean> };
    };
    if (!nav.xr?.isSessionSupported) return false;
    return await nav.xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}

export function supportHint(): string {
  if (typeof window === "undefined") return "checking…";
  if (!xrApiPresent())
    return "WebXR unavailable — use Quest Browser or Chrome + Immersive Web Emulator";
  if (needsHTTPS()) return "VR needs HTTPS — open the deployed Vercel URL";
  return "checking headset…";
}

export async function requestVRSession(): Promise<XRSession> {
  const nav = navigator as Navigator & {
    xr?: {
      requestSession(
        mode: string,
        opts?: { optionalFeatures?: string[]; requiredFeatures?: string[] },
      ): Promise<XRSession>;
    };
  };
  if (!nav.xr?.requestSession) throw new Error("WebXR unavailable");
  return nav.xr.requestSession("immersive-vr", {
    optionalFeatures: [
      "local-floor",
      "bounded-floor",
      "hand-tracking",
      "layers",
    ],
  });
}
