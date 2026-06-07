import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SETTINGS,
  applyAppSettingsToDocument,
  contrastRatio,
  deriveSecondaryAccent,
} from "./appSettings";
import type { AppSettings } from "../types";

function settings(overrides: Partial<AppSettings>): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, ...overrides };
}

describe("appSettings bridge", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets the accent var from brand_color", () => {
    applyAppSettingsToDocument(settings({ brand_color: "#112233" }));
    expect(document.documentElement.style.getPropertyValue("--accent-1")).toBe("#112233");
    expect(document.documentElement.style.getPropertyValue("--accent-grad")).toContain("#112233");
  });

  it("emits HeroUI v3 --accent + --accent-foreground from brand_color", () => {
    applyAppSettingsToDocument(settings({ brand_color: "#0a84ff" }));
    expect(document.documentElement.style.getPropertyValue("--accent")).toBe("#0a84ff");
    // brand color is medium-luminance blue → foreground should be white
    expect(document.documentElement.style.getPropertyValue("--accent-foreground")).toBe("#ffffff");
  });

  it("picks black foreground for light brand_color", () => {
    applyAppSettingsToDocument(settings({ brand_color: "#fff8a0" })); // pale yellow
    expect(document.documentElement.style.getPropertyValue("--accent-foreground")).toBe("#000000");
  });

  it("no longer emits the v2-style --heroui-primary-* scale", () => {
    applyAppSettingsToDocument(settings({ brand_color: "#0a84ff" }));
    expect(document.documentElement.style.getPropertyValue("--heroui-primary")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--heroui-primary-500")).toBe("");
    expect(document.documentElement.style.getPropertyValue("--heroui-primary-foreground")).toBe("");
  });

  it("sets data-theme from default_theme", () => {
    applyAppSettingsToDocument(settings({ default_theme: "light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("computes contrast ratio (white on black ~21)", () => {
    expect(Math.round(contrastRatio("#ffffff", "#000000"))).toBe(21);
  });

  it("derives a different secondary accent", () => {
    expect(deriveSecondaryAccent("#0a84ff")).not.toBe("#0a84ff");
  });
});
