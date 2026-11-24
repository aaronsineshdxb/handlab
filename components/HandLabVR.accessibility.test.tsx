import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HandLabVR from "./HandLabVR";

function elementById(markup: string, id: string): string {
  return markup.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
}

describe("HandLabVR accessibility", () => {
  const markup = renderToStaticMarkup(<HandLabVR />);

  it("names and describes the VR canvas with a textual fallback", () => {
    const canvas = elementById(markup, "scene");

    expect(canvas).toContain('role="img"');
    expect(canvas).toContain('aria-label="Interactive 3D hand-lab VR workspace"');
    expect(canvas).toContain('aria-describedby="scene-description"');
    expect(markup).toContain('id="scene-description"');
    expect(markup).toContain("Interactive 3D hand-lab VR scene");
  });

  it("exposes color and stable mode state", () => {
    const well = markup.match(/<input[^>]*type="color"[^>]*>/)?.[0] ?? "";

    expect(well).toContain('aria-label="Shape color"');
    expect(well).toContain('value="#0D9488"');
    expect(markup).toMatch(/<b aria-live="polite"[^>]*>0<\/b>/);
    expect(markup).toMatch(/Line mode: (On|Off)/);
    expect(markup).toMatch(/<button[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*>/);
    expect(elementById(markup, "toast")).toContain('role="status"');
    expect(elementById(markup, "toast")).toContain('aria-live="polite"');
  });
});
