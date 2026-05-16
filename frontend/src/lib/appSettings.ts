import type { AppSettings, CustomTheme, FontFamilyKey, RadiusStep, ShadowStep, ThemePreset } from "../types";

const DEFAULT_BRAND_NAME = "TelaiOS";
const DEFAULT_BRAND_COLOR = "#3B82F6";
const DEFAULT_FAVICON_PATH = "/favicon.svg";

type Theme = "light" | "dark";
type Rgb = { r: number; g: number; b: number };

const WHITE: Rgb = { r: 255, g: 255, b: 255 };
const BLACK: Rgb = { r: 0, g: 0, b: 0 };

const PRIMARY_STOPS: Array<{ key: string; target: Rgb; amount: number }> = [
  { key: "50", target: WHITE, amount: 0.92 },
  { key: "100", target: WHITE, amount: 0.82 },
  { key: "200", target: WHITE, amount: 0.66 },
  { key: "300", target: WHITE, amount: 0.5 },
  { key: "400", target: WHITE, amount: 0.3 },
  { key: "500", target: WHITE, amount: 0 },
  { key: "600", target: BLACK, amount: 0.12 },
  { key: "700", target: BLACK, amount: 0.24 },
  { key: "800", target: BLACK, amount: 0.38 },
  { key: "900", target: BLACK, amount: 0.54 },
];

export const APP_SETTINGS_STORAGE_KEY = "telaios_app_settings";
export const APP_SETTINGS_UPDATED_EVENT = "telaios:app-settings-updated";

// ── Preset definitions ────────────────────────────────────────────────────────

/** A fully-resolved theme (all keys present) used internally for CSS var injection. */
export interface ResolvedTheme {
  background: string;
  foreground: string;
  content1: string;
  content2: string;
  content3: string;
  divider: string;
  radius: RadiusStep;
  shadow: ShadowStep;
  font_family: FontFamilyKey;
  sidebar_background: string;
}

export const THEME_PRESETS: Record<ThemePreset, ResolvedTheme> = {
  default: {
    background: "#1c1c1e",
    foreground: "rgba(255,255,255,0.90)",
    content1: "#2c2c2e",
    content2: "#3a3a3c",
    content3: "#48484a",
    divider: "rgba(84,84,88,0.35)",
    radius: "medium",
    shadow: "medium",
    font_family: "system",
    sidebar_background: "#1c1c1e",
  },
  corporate: {
    background: "#ffffff",
    foreground: "#111111",
    content1: "#f5f5f5",
    content2: "#eeeeee",
    content3: "#e8e8e8",
    divider: "#dddddd",
    radius: "none",
    shadow: "none",
    font_family: "helvetica",
    sidebar_background: "#f0f0f0",
  },
  midnight: {
    background: "#050c1a",
    foreground: "#e8f0ff",
    content1: "#0a1628",
    content2: "#081322",
    content3: "#06101d",
    divider: "#1a2d4d",
    radius: "medium",
    shadow: "large",
    font_family: "inter",
    sidebar_background: "#080f1e",
  },
  warm: {
    background: "#fdf8f2",
    foreground: "#2d1f0e",
    content1: "#fef4e8",
    content2: "#fdf0e0",
    content3: "#fcebd8",
    divider: "#e8d5ba",
    radius: "large",
    shadow: "small",
    font_family: "georgia",
    sidebar_background: "#f9f0e4",
  },
  minimal: {
    background: "#ffffff",
    foreground: "#000000",
    content1: "#fafafa",
    content2: "#f5f5f5",
    content3: "#f0f0f0",
    divider: "#e0e0e0",
    radius: "none",
    shadow: "none",
    font_family: "system",
    sidebar_background: "#f8f8f8",
  },
  ocean: {
    background: "#04101a",
    foreground: "#d6eeff",
    content1: "#071c2e",
    content2: "#061726",
    content3: "#05121e",
    divider: "#0f3050",
    radius: "medium",
    shadow: "large",
    font_family: "inter",
    sidebar_background: "#060f1a",
  },
  forest: {
    background: "#061209",
    foreground: "#d4f0da",
    content1: "#0d2114",
    content2: "#0b1c11",
    content3: "#09170e",
    divider: "#163a1f",
    radius: "large",
    shadow: "medium",
    font_family: "georgia",
    sidebar_background: "#071410",
  },
  sunset: {
    background: "#160508",
    foreground: "#fde8d8",
    content1: "#26080f",
    content2: "#1f060c",
    content3: "#180509",
    divider: "#3d1018",
    radius: "medium",
    shadow: "large",
    font_family: "system",
    sidebar_background: "#1a060b",
  },
};

// ── Radius / shadow / font value maps ─────────────────────────────────────────

const RADIUS_VALUES: Record<RadiusStep, { small: string; medium: string; large: string }> = {
  none:   { small: "0px",   medium: "0px",   large: "0px" },
  small:  { small: "4px",   medium: "8px",   large: "12px" },
  medium: { small: "8px",   medium: "12px",  large: "16px" },
  large:  { small: "12px",  medium: "16px",  large: "24px" },
  full:   { small: "999px", medium: "999px", large: "999px" },
};

const SHADOW_VALUES: Record<ShadowStep, string> = {
  none:   "none",
  small:  "0 1px 3px rgba(0,0,0,0.12)",
  medium: "0 4px 12px rgba(0,0,0,0.18)",
  large:  "0 8px 32px rgba(0,0,0,0.28)",
};

const FONT_FAMILY_VALUES: Record<FontFamilyKey, string> = {
  system:    "-apple-system, BlinkMacSystemFont, \"SF Pro Display\", \"SF Pro Text\", \"Helvetica Neue\", Arial, sans-serif",
  inter:     "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  roboto:    "Roboto, Helvetica Neue, Arial, sans-serif",
  helvetica: "Helvetica Neue, Helvetica, Arial, sans-serif",
  georgia:   "Georgia, Times New Roman, serif",
  mono:      "ui-monospace, \"SF Mono\", \"Fira Code\", \"Cascadia Code\", monospace",
};

// ── Colour utilities ──────────────────────────────────────────────────────────

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  brand_name: DEFAULT_BRAND_NAME,
  brand_color: DEFAULT_BRAND_COLOR,
  logo_url: null,
  favicon_url: null,
  default_theme: "dark",
  theme_preset: null,
  custom_theme: null,
  updated_at: new Date().toISOString(),
};

function normalizeAppSettings(parsed: Partial<AppSettings>): AppSettings {
  return {
    id: typeof parsed.id === "number" ? parsed.id : DEFAULT_APP_SETTINGS.id,
    brand_name:
      typeof parsed.brand_name === "string" && parsed.brand_name.trim().length > 0
        ? parsed.brand_name
        : DEFAULT_APP_SETTINGS.brand_name,
    brand_color: isHexColor(parsed.brand_color)
      ? parsed.brand_color
      : DEFAULT_APP_SETTINGS.brand_color,
    logo_url: typeof parsed.logo_url === "string" ? parsed.logo_url : null,
    favicon_url: typeof parsed.favicon_url === "string" ? parsed.favicon_url : null,
    default_theme: isThemeValue(parsed.default_theme)
      ? parsed.default_theme
      : DEFAULT_APP_SETTINGS.default_theme,
    theme_preset:
      parsed.theme_preset != null && parsed.theme_preset in THEME_PRESETS
        ? (parsed.theme_preset as ThemePreset)
        : null,
    custom_theme: parsed.custom_theme != null && typeof parsed.custom_theme === "object"
      ? (parsed.custom_theme as CustomTheme)
      : null,
    updated_at:
      typeof parsed.updated_at === "string"
        ? parsed.updated_at
        : DEFAULT_APP_SETTINGS.updated_at,
  };
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/.test(value);
}

export function isThemeValue(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(hex: string): Rgb {
  const normalized = isHexColor(hex) ? hex : DEFAULT_BRAND_COLOR;
  const int = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (int >> 16) & 0xff,
    g: (int >> 8) & 0xff,
    b: int & 0xff,
  };
}

function mixRgb(base: Rgb, target: Rgb, amount: number): Rgb {
  return {
    r: Math.round(base.r + (target.r - base.r) * amount),
    g: Math.round(base.g + (target.g - base.g) * amount),
    b: Math.round(base.b + (target.b - base.b) * amount),
  };
}

function rgbToHslChannels(rgb: Rgb): string {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return `${h.toFixed(2)} ${(s * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
}

function hexToHslChannels(hex: string): string {
  return rgbToHslChannels(parseHexColor(hex));
}

function luminanceChannel(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.03928
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * luminanceChannel(rgb.r) +
    0.7152 * luminanceChannel(rgb.g) +
    0.0722 * luminanceChannel(rgb.b)
  );
}

function pickForegroundChannels(baseColor: Rgb): string {
  const baseLum = relativeLuminance(baseColor);
  const whiteContrast = (1.05 + 0.0001) / (baseLum + 0.05 + 0.0001);
  const blackContrast = (baseLum + 0.05 + 0.0001) / (0.05 + 0.0001);
  return whiteContrast >= blackContrast ? "0 0% 100%" : "0 0% 0%";
}

function buildPrimaryScaleChannels(hexColor: string): Record<string, string> {
  const base = parseHexColor(hexColor);
  const channels: Record<string, string> = {};

  for (const stop of PRIMARY_STOPS) {
    const amount = clamp(stop.amount, 0, 1);
    const mixed = amount === 0 ? base : mixRgb(base, stop.target, amount);
    channels[stop.key] = rgbToHslChannels(mixed);
  }

  return channels;
}

// ── Theme override application ────────────────────────────────────────────────

/**
 * Resolve a preset + optional overrides into a complete theme object,
 * then inject all CSS custom properties onto `document.documentElement`.
 */
export function applyThemeOverrides(
  preset: ThemePreset | null,
  overrides: CustomTheme | null,
): void {
  if (typeof document === "undefined") return;

  const base: ResolvedTheme = THEME_PRESETS[preset ?? "default"];

  const resolved: ResolvedTheme = {
    background:        (isHexColor(overrides?.background)  ? overrides!.background!  : base.background),
    foreground:        (isHexColor(overrides?.foreground)   ? overrides!.foreground!  : base.foreground),
    content1:          (isHexColor(overrides?.content1)     ? overrides!.content1!    : base.content1),
    content2:          (isHexColor(overrides?.content2)     ? overrides!.content2!    : base.content2),
    content3:          (isHexColor(overrides?.content3)     ? overrides!.content3!    : base.content3),
    divider:           (isHexColor(overrides?.divider)      ? overrides!.divider!     : base.divider),
    radius:            overrides?.radius      ?? base.radius,
    shadow:            overrides?.shadow      ?? base.shadow,
    font_family:       overrides?.font_family ?? base.font_family,
    sidebar_background:(isHexColor(overrides?.sidebar_background) ? overrides!.sidebar_background! : base.sidebar_background),
  };

  const rootStyle = document.documentElement.style;

  // Colours — HeroUI uses HSL channel-only format (no hsl() wrapper)
  rootStyle.setProperty("--heroui-background",  hexToHslChannels(resolved.background));
  rootStyle.setProperty("--heroui-foreground",  hexToHslChannels(resolved.foreground));
  rootStyle.setProperty("--heroui-content1",    hexToHslChannels(resolved.content1));
  rootStyle.setProperty("--heroui-content2",    hexToHslChannels(resolved.content2));
  rootStyle.setProperty("--heroui-content3",    hexToHslChannels(resolved.content3));
  rootStyle.setProperty("--heroui-divider",     hexToHslChannels(resolved.divider));

  // Sidebar (custom var — hex)
  rootStyle.setProperty("--sidebar-background", resolved.sidebar_background);

  // Border radius
  const r = RADIUS_VALUES[resolved.radius];
  rootStyle.setProperty("--heroui-radius-small",  r.small);
  rootStyle.setProperty("--heroui-radius-medium", r.medium);
  rootStyle.setProperty("--heroui-radius-large",  r.large);

  // Box shadow
  const s = SHADOW_VALUES[resolved.shadow];
  rootStyle.setProperty("--heroui-box-shadow-small",  s);
  rootStyle.setProperty("--heroui-box-shadow-medium", s);
  rootStyle.setProperty("--heroui-box-shadow-large",  s);

  // Font family
  rootStyle.setProperty("font-family", FONT_FAMILY_VALUES[resolved.font_family]);
}

// ── Favicon / meta helpers ────────────────────────────────────────────────────

function ensureDynamicFaviconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>("link[data-app-favicon='true']");
  if (link) return link;

  link = document.createElement("link");
  link.setAttribute("data-app-favicon", "true");
  link.rel = "icon";
  document.head.appendChild(link);
  return link;
}

function setFavicon(url: string | null): void {
  const link = ensureDynamicFaviconLink();
  const nextHref = url ?? DEFAULT_FAVICON_PATH;
  link.href = nextHref;

  if (nextHref.startsWith("data:image/svg+xml")) {
    link.type = "image/svg+xml";
  } else if (nextHref.startsWith("data:image/png")) {
    link.type = "image/png";
  } else if (nextHref.startsWith("data:image/x-icon") || nextHref.endsWith(".ico")) {
    link.type = "image/x-icon";
  } else {
    link.type = "image/svg+xml";
  }
}

function ensureThemeColorMeta(): HTMLMetaElement {
  let meta = document.querySelector<HTMLMetaElement>("meta[name='theme-color']");
  if (meta) return meta;

  meta = document.createElement("meta");
  meta.name = "theme-color";
  document.head.appendChild(meta);
  return meta;
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

export function loadCachedAppSettings(): AppSettings {
  if (typeof window === "undefined") {
    return DEFAULT_APP_SETTINGS;
  }

  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);
    if (!raw) return DEFAULT_APP_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return normalizeAppSettings(parsed);
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function saveCachedAppSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors (e.g., private browsing).
  }
}

export function persistAndApplyAppSettings(settings: AppSettings): void {
  saveCachedAppSettings(settings);
  applyAppSettingsToDocument(settings);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<AppSettings>(APP_SETTINGS_UPDATED_EVENT, { detail: settings }));
  }
}

export function subscribeToAppSettingsUpdates(
  listener: (settings: AppSettings) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }

  const onEvent = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;
    if (customEvent.detail) {
      listener(customEvent.detail);
    }
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== APP_SETTINGS_STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as Partial<AppSettings>;
      listener(normalizeAppSettings(parsed));
    } catch {
      // Ignore malformed storage payloads.
    }
  };

  window.addEventListener(APP_SETTINGS_UPDATED_EVENT, onEvent as EventListener);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(APP_SETTINGS_UPDATED_EVENT, onEvent as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}

// ── Main document apply ───────────────────────────────────────────────────────

export function applyAppSettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;

  const brandName = settings.brand_name.trim() || DEFAULT_BRAND_NAME;
  const brandColor = isHexColor(settings.brand_color)
    ? settings.brand_color
    : DEFAULT_BRAND_COLOR;
  const scale = buildPrimaryScaleChannels(brandColor);
  const foreground = pickForegroundChannels(parseHexColor(brandColor));

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--brand-primary", brandColor);
  rootStyle.setProperty("--heroui-primary", scale["500"]);
  rootStyle.setProperty("--heroui-primary-foreground", foreground);

  for (const [shade, value] of Object.entries(scale)) {
    rootStyle.setProperty(`--heroui-primary-${shade}`, value);
  }

  document.title = brandName;
  setFavicon(settings.favicon_url ?? null);

  const themeColorMeta = ensureThemeColorMeta();
  themeColorMeta.content = brandColor;

  // Theme overrides disabled until Apple HIG interface is fully complete
  // applyThemeOverrides(settings.theme_preset ?? null, settings.custom_theme ?? null);
}
