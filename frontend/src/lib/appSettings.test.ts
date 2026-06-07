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
    document.documentElement.removeAttribute("data-density");
    document.body.removeAttribute("style");
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

  it("sets data-theme and data-density", () => {
    applyAppSettingsToDocument(settings({ default_theme: "light", density: "compact" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-density")).toBe("compact");
  });

  it("sets --blur from glass_blur", () => {
    applyAppSettingsToDocument(settings({ glass_blur: 42 }));
    expect(document.documentElement.style.getPropertyValue("--blur")).toBe("42px");
  });

  it("applies a preset palette to shell vars", () => {
    applyAppSettingsToDocument(settings({ theme_preset: "corporate" }));
    // corporate background is #ffffff
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#ffffff");
  });

  it("clears preset shell vars when no preset/custom", () => {
    applyAppSettingsToDocument(settings({ theme_preset: "corporate" }));
    applyAppSettingsToDocument(settings({ theme_preset: null, custom_theme: null }));
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("");
  });

  it("custom_theme overrides a preset", () => {
    applyAppSettingsToDocument(
      settings({ theme_preset: "corporate", custom_theme: { background: "#010203" } }),
    );
    expect(document.documentElement.style.getPropertyValue("--bg")).toBe("#010203");
  });

  it("applies the preset font to <body> (not the inert <html>)", () => {
    // corporate -> font_family "helvetica"
    applyAppSettingsToDocument(settings({ theme_preset: "corporate" }));
    expect(document.body.style.getPropertyValue("font-family")).toContain("Helvetica Neue");
    expect(document.documentElement.style.getPropertyValue("font-family")).toBe("");
  });

  it("clears the body font when reverting to plain Light/Dark", () => {
    applyAppSettingsToDocument(settings({ theme_preset: "corporate" }));
    applyAppSettingsToDocument(settings({ theme_preset: null, custom_theme: null }));
    expect(document.body.style.getPropertyValue("font-family")).toBe("");
  });

  it("computes contrast ratio (white on black ~21)", () => {
    expect(Math.round(contrastRatio("#ffffff", "#000000"))).toBe(21);
  });

  it("derives a different secondary accent", () => {
    expect(deriveSecondaryAccent("#0a84ff")).not.toBe("#0a84ff");
  });
});
