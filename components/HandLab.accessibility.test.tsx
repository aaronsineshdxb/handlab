import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HandLab from "./HandLab";
import HandLabVR from "./HandLabVR";

function elementById(markup: string, id: string): string {
  return markup.match(new RegExp(`<[^>]*id="${id}"[^>]*>`))?.[0] ?? "";
}

describe("HandLab accessibility", () => {
  const markup = renderToStaticMarkup(<HandLab />);

  it("names and describes the desktop canvas with a textual fallback", () => {
    const canvas = elementById(markup, "scene");

    expect(canvas).toContain('role="img"');
    expect(canvas).toContain('aria-label="Interactive 3D hand-lab workspace"');
    expect(canvas).toContain('aria-describedby="scene-description"');
    expect(markup).toContain('id="scene-description"');
    expect(markup).toContain("Interactive 3D hand-lab scene");
  });

  it("announces stable scene controls without making motion readouts chatty", () => {
    expect(elementById(markup, "t-count")).toContain('aria-live="polite"');
    expect(elementById(markup, "t-count")).toContain('aria-atomic="true"');
    expect(elementById(markup, "btn-line")).toContain('aria-live="polite"');
    expect(elementById(markup, "btn-line")).toContain('aria-atomic="true"');
    expect(markup).toMatch(/line mode: (on|off)/);
    expect(elementById(markup, "toast")).toContain('role="status"');
    expect(elementById(markup, "toast")).toContain('aria-live="polite"');
    expect(elementById(markup, "t-xyz")).not.toContain("aria-live");
    expect(elementById(markup, "t-z")).not.toContain("aria-live");
  });

  it("exposes color selection and gesture drawer state", () => {
    const swatches = markup.match(/<div class="sw[^>]+><\/div>/g)?.join("") ?? "";

    expect(swatches.match(/aria-pressed="(true|false)"/g)).toHaveLength(5);
    expect(swatches.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(elementById(markup, "hint-panel")).toContain("gesture-help");
  });
});

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
    const swatches = markup.match(/<div class="sw[^>]+><\/div>/g)?.join("") ?? "";

    expect(swatches.match(/aria-pressed="(true|false)"/g)).toHaveLength(5);
    expect(swatches.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(markup).toMatch(/<b aria-live="polite"[^>]*>0<\/b>/);
    expect(markup).toMatch(/line mode: (on|off)/);
    expect(markup).toMatch(/<button[^>]*aria-live="polite"[^>]*aria-atomic="true"[^>]*>/);
    expect(elementById(markup, "toast")).toContain('role="status"');
    expect(elementById(markup, "toast")).toContain('aria-live="polite"');
  });
});
