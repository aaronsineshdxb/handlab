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

  it("uses theme tokens and mirrors pyramid triangular faces symmetrically", () => {
    const markup = renderToStaticMarkup(<NetSvg shape="pyramid" unfold={1} />);
    expect(markup).toContain("var(--color-ink)");
    expect(markup).toContain("var(--color-accent)");
    expect(markup).not.toContain("#0F172A");
    // Left apex x = 130 - 30 - 52 = 48; right apex x = 130 + 30 + 52 = 212
    expect(markup).toContain("48,105");
    expect(markup).toContain("212,105");
  });

  it("renders flat-top hexPrism caps hinged with dashed fold lines", () => {
    const markup = renderToStaticMarkup(<NetSvg shape="hexPrism" unfold={0.7} />);
    expect(markup).toContain('aria-label="Hexagonal prism net"');
    expect(markup.match(/<rect/g)?.length).toBe(6);
    expect(markup.match(/<polygon/g)?.length).toBe(2);
    // 5 vertical lateral fold lines + 2 horizontal cap fold lines
    expect(markup.match(/<line/g)?.length).toBe(7);
  });

  it("renders dynamically centered octa net with 8 faces and dashed fold guides", () => {
    const markup = renderToStaticMarkup(<NetSvg shape="octa" unfold={1} />);
    expect(markup).toContain('aria-label="Octahedron net"');
    expect(markup.match(/<polygon/g)?.length).toBe(8);
    // 5 strip fold guides + 2 cap fold guides
    expect(markup.match(/<line/g)?.length).toBe(7);
  });
});
