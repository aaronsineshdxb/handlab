import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NetSvg from "./NetSvg";

describe("NetSvg", () => {
  it("renders a six-square cube net", () => {
    const markup = renderToStaticMarkup(<NetSvg shape="cube" unfold={0.7} />);
    expect(markup.match(/<rect/g)?.length).toBe(6);
    expect(markup).toContain('aria-label="Cube net"');
  });

  it("renders the cylinder lateral band", () => {
    const markup = renderToStaticMarkup(<NetSvg shape="cylinder" unfold={0.7} />);
    expect(markup).toContain("lateral 2πrh");
  });

  it("falls back gracefully for non-developable solids", () => {
    const markup = renderToStaticMarkup(<NetSvg shape="torus" unfold={0.7} />);
    expect(markup).toContain("Torus net");
  });
});
