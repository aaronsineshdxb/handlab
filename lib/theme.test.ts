import { describe, expect, it } from "vitest";
import {
  ACCENTS,
  accentInkFor,
  hexToNumber,
  isValidCustomHex,
  resolveCustomHex,
  resolveScheme,
  resolveTheme,
  sceneAccentFor,
  sceneThemeFor,
} from "./theme";

describe("resolveTheme", () => {
  it("honours an explicit stored choice over the OS preference", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("falls back to the OS preference when nothing is stored", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
  });

  it("ignores garbage stored values", () => {
    expect(resolveTheme("midnight", true)).toBe("dark");
    expect(resolveTheme("", false)).toBe("light");
  });
});

describe("resolveScheme", () => {
  it("honours stored presets and custom", () => {
    expect(resolveScheme("violet")).toBe("violet");
    expect(resolveScheme("custom")).toBe("custom");
  });

  it("falls back to teal on garbage", () => {
    expect(resolveScheme(null)).toBe("teal");
    expect(resolveScheme("midnight")).toBe("teal");
    expect(resolveScheme("")).toBe("teal");
  });
});

describe("custom hex", () => {
  it("validates #rrggbb only", () => {
    expect(isValidCustomHex("#016A71")).toBe(true);
    expect(isValidCustomHex("#GGGGGG")).toBe(false);
    expect(isValidCustomHex("red")).toBe(false);
    expect(isValidCustomHex(null)).toBe(false);
  });

  it("resolves stored custom hex or null", () => {
    expect(resolveCustomHex("#ff0000")).toBe("#ff0000");
    expect(resolveCustomHex("garbage")).toBeNull();
    expect(resolveCustomHex(null)).toBeNull();
  });

  it("converts hex to numbers for the scene", () => {
    expect(hexToNumber("#016A71")).toBe(0x016a71);
    expect(hexToNumber("nope")).toBeNull();
  });

  it("picks readable ink by luminance", () => {
    expect(accentInkFor("#016A71")).toBe("#FCFCF9");
    expect(accentInkFor("#FFE27A")).toBe("#27251E");
  });
});

describe("scene accents", () => {
  it("maps every preset to a distinct scene hex per mode", () => {
    for (const [id, preset] of Object.entries(ACCENTS)) {
      expect(sceneAccentFor("light", id as keyof typeof ACCENTS, null)).toBe(
        preset.light.scene,
      );
      expect(sceneAccentFor("dark", id as keyof typeof ACCENTS, null)).toBe(
        preset.dark.scene,
      );
    }
  });

  it("uses the custom hex verbatim for the scene", () => {
    expect(sceneAccentFor("light", "custom", "#ff0000")).toBe(0xff0000);
    expect(sceneAccentFor("dark", "custom", "#00ff00")).toBe(0x00ff00);
  });

  it("keeps canvas chrome but swaps cursor + rim per scheme", () => {
    const teal = sceneThemeFor("light", "teal", null);
    const violet = sceneThemeFor("light", "violet", null);
    expect(violet.bg).toBe(teal.bg);
    expect(violet.gridMain).toBe(teal.gridMain);
    expect(violet.cursor).toBe(ACCENTS.violet.light.scene);
    expect(violet.rim).toBe(ACCENTS.violet.light.scene);
  });
});
