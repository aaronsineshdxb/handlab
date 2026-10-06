import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AccentPicker, { AccentSection } from "./AccentPicker";
import { ACCENT_IDS, ACCENTS } from "../../lib/theme";

describe("AccentPicker", () => {
  it("renders every preset scheme plus a custom well", () => {
    const markup = renderToStaticMarkup(<AccentPicker />);

    expect(markup).toContain('role="group"');
    for (const id of ACCENT_IDS) {
      expect(markup).toContain(`${ACCENTS[id].label} colour scheme`);
    }
    expect(markup).toContain('aria-label="Custom colour scheme"');
    expect(markup).toContain('type="color"');
  });

  it("announces the active scheme", () => {
    const markup = renderToStaticMarkup(<AccentPicker />);
    expect(markup).toContain("scheme:");
  });

  it("exposes a shared section with heading", () => {
    const markup = renderToStaticMarkup(<AccentSection />);
    expect(markup).toContain("COLOUR SCHEME");
    expect(markup).toContain('role="group"');
  });
});
