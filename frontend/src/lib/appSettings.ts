import type { AppSettings } from "../types";

const DEFAULT_BRAND_NAME = "TelaiOS";
const DEFAULT_BRAND_COLOR = "#0a84ff";
const DEFAULT_FAVICON_PATH = "/favicon.svg";

export const APP_SETTINGS_STORAGE_KEY = "telaios_app_settings";
export const APP_SETTINGS_UPDATED_EVENT = "telaios:app-settings-updated";

type Theme = "light" | "dark";
type Rgb = { r: number; g: number; b: number };

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  brand_name: DEFAULT_BRAND_NAME,
  brand_color: DEFAULT_BRAND_COLOR,
  logo_url: null,
  favicon_url: null,
  default_theme: "dark",
  updated_at: new Date().toISOString(),
};

// ── Colour utilities ────────────────────────────────────────────────────────

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function isThemeValue(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function parseHexColor(hex: string): Rgb {
  const n = isHexColor(hex) ? hex : DEFAULT_BRAND_COLOR;
  const int = Number.parseInt(n.slice(1), 16);
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const h = (x: number) => clamp(Math.round(x), 0, 255).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

function hslToRgb(h: number, s: number, l: number): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/** A harmonious secondary accent: rotate hue +50°, nudge lightness up. */
export function deriveSecondaryAccent(hex: string): string {
  const { h, s, l } = rgbToHsl(parseHexColor(hex));
  return rgbToHex(hslToRgb((h + 50) % 360, clamp(s, 0, 1), clamp(l + 0.08, 0, 1)));
}

function luminanceChannel(c: number): number {
  const n = c / 255;
  return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * luminanceChannel(rgb.r) + 0.7152 * luminanceChannel(rgb.g) + 0.0722 * luminanceChannel(rgb.b);
}

/** WCAG contrast ratio between two hex colours (1..21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(parseHexColor(a));
  const lb = relativeLuminance(parseHexColor(b));
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

// ── Favicon helpers ──────────────────────────────────────────────────────────

function ensureFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[data-app-favicon='true']");
  if (link) return link;
  link = document.createElement("link");
  link.setAttribute("data-app-favicon", "true");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

function setFavicon(url: string | null): void {
  const link = ensureFaviconLink();
  const href = url ?? DEFAULT_FAVICON_PATH;
  link.href = href;
  link.type = href.startsWith("data:image/png")
    ? "image/png"
    : href.endsWith(".ico")
      ? "image/x-icon"
      : "image/svg+xml";
}

// ── Main apply ───────────────────────────────────────────────────────────────

export function applyAppSettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const s = root.style;

  // Brand accent (legacy glass --accent-* vars stay for unmigrated pages;
  // HeroUI v3 reads --accent / --accent-foreground).
  const brandColor = isHexColor(settings.brand_color) ? settings.brand_color : DEFAULT_BRAND_COLOR;
  const accent2 = deriveSecondaryAccent(brandColor);
  s.setProperty("--accent-1", brandColor);
  s.setProperty("--accent-2", accent2);
  s.setProperty("--accent-grad", `linear-gradient(135deg, ${brandColor} 0%, ${accent2} 100%)`);
  s.setProperty("--accent", brandColor);
  s.setProperty(
    "--accent-foreground",
    relativeLuminance(parseHexColor(brandColor)) > 0.5 ? "#000000" : "#ffffff",
  );

  // Theme polarity.
  root.setAttribute("data-theme", isThemeValue(settings.default_theme) ? settings.default_theme : "dark");

  // Title + favicon.
  document.title = settings.brand_name?.trim() || DEFAULT_BRAND_NAME;
  setFavicon(settings.favicon_url ?? null);
}

// ── Cache + broadcast ────────────────────────────────────────────────────────

function normalize(parsed: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...parsed,
    brand_name:
      typeof parsed.brand_name === "string" && parsed.brand_name.trim()
        ? parsed.brand_name
        : DEFAULT_APP_SETTINGS.brand_name,
    brand_color: isHexColor(parsed.brand_color) ? parsed.brand_color : DEFAULT_APP_SETTINGS.brand_color,
    default_theme: isThemeValue(parsed.default_theme) ? parsed.default_theme : DEFAULT_APP_SETTINGS.default_theme,
  };
}

export function loadCachedAppSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_APP_SETTINGS;
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;
    return normalize(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveCachedAppSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function persistAndApplyAppSettings(settings: AppSettings): void {
  saveCachedAppSettings(settings);
  applyAppSettingsToDocument(settings);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppSettings>(APP_SETTINGS_UPDATED_EVENT, { detail: settings }));
  }
}

export function subscribeToAppSettingsUpdates(listener: (s: AppSettings) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onEvent = (e: Event) => {
    const ce = e as CustomEvent<AppSettings>;
    if (ce.detail) listener(ce.detail);
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key !== APP_SETTINGS_STORAGE_KEY || !e.newValue) return;
    try {
      listener(normalize(JSON.parse(e.newValue) as Partial<AppSettings>));
    } catch {
      /* ignore */
    }
  };
  window.addEventListener(APP_SETTINGS_UPDATED_EVENT, onEvent as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, onEvent as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
