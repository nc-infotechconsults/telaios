import type {
  AppSettings,
  CustomTheme,
  FontFamilyKey,
  RadiusStep,
  ShadowStep,
  ThemePreset,
} from "../types";

const DEFAULT_BRAND_NAME = "TelaiOS";
const DEFAULT_BRAND_COLOR = "#0a84ff";
const DEFAULT_FAVICON_PATH = "/favicon.svg";

export const APP_SETTINGS_STORAGE_KEY = "telaios_app_settings";
export const APP_SETTINGS_UPDATED_EVENT = "telaios:app-settings-updated";

type Theme = "light" | "dark";
type Rgb = { r: number; g: number; b: number };

// ── Preset definitions (values reused; now applied to glass-shell vars) ──────

interface ShellTheme {
  polarity: Theme;
  background: string;
  foreground: string;
  surfaceStrong: string; // content1 -> --glass-strong
  surface: string; // content2 -> --glass
  surfaceWeak: string; // content3 -> --glass-weak
  divider: string; // -> --hairline
  radius: RadiusStep;
  shadow: ShadowStep;
  font_family: FontFamilyKey;
}

export const THEME_PRESETS: Record<ThemePreset, ShellTheme> = {
  default: { polarity: "dark", background: "#0b0d12", foreground: "#f4f4f7", surfaceStrong: "#2c2c2e", surface: "#1c1c1e", surfaceWeak: "#141418", divider: "rgba(255,255,255,0.08)", radius: "medium", shadow: "medium", font_family: "system" },
  corporate: { polarity: "light", background: "#ffffff", foreground: "#111111", surfaceStrong: "#f5f5f5", surface: "#eeeeee", surfaceWeak: "#e8e8e8", divider: "#dddddd", radius: "none", shadow: "none", font_family: "helvetica" },
  midnight: { polarity: "dark", background: "#050c1a", foreground: "#e8f0ff", surfaceStrong: "#0a1628", surface: "#081322", surfaceWeak: "#06101d", divider: "#1a2d4d", radius: "medium", shadow: "large", font_family: "inter" },
  warm: { polarity: "light", background: "#fdf8f2", foreground: "#2d1f0e", surfaceStrong: "#fef4e8", surface: "#fdf0e0", surfaceWeak: "#fcebd8", divider: "#e8d5ba", radius: "large", shadow: "small", font_family: "georgia" },
  minimal: { polarity: "light", background: "#ffffff", foreground: "#000000", surfaceStrong: "#fafafa", surface: "#f5f5f5", surfaceWeak: "#f0f0f0", divider: "#e0e0e0", radius: "none", shadow: "none", font_family: "system" },
  ocean: { polarity: "dark", background: "#04101a", foreground: "#d6eeff", surfaceStrong: "#071c2e", surface: "#061726", surfaceWeak: "#05121e", divider: "#0f3050", radius: "medium", shadow: "large", font_family: "inter" },
  forest: { polarity: "dark", background: "#061209", foreground: "#d4f0da", surfaceStrong: "#0d2114", surface: "#0b1c11", surfaceWeak: "#09170e", divider: "#163a1f", radius: "large", shadow: "medium", font_family: "georgia" },
  sunset: { polarity: "dark", background: "#160508", foreground: "#fde8d8", surfaceStrong: "#26080f", surface: "#1f060c", surfaceWeak: "#180509", divider: "#3d1018", radius: "medium", shadow: "large", font_family: "system" },
};

const RADIUS_VALUES: Record<RadiusStep, { xs: string; sm: string; md: string; lg: string; xl: string }> = {
  none: { xs: "0px", sm: "0px", md: "0px", lg: "0px", xl: "0px" },
  small: { xs: "4px", sm: "6px", md: "8px", lg: "10px", xl: "12px" },
  medium: { xs: "8px", sm: "12px", md: "16px", lg: "22px", xl: "28px" },
  large: { xs: "12px", sm: "18px", md: "24px", lg: "30px", xl: "36px" },
  full: { xs: "999px", sm: "999px", md: "999px", lg: "999px", xl: "999px" },
};

const SHADOW_VALUES: Record<ShadowStep, { lg: string; sm: string }> = {
  none: { lg: "none", sm: "none" },
  small: { lg: "0 6px 18px -8px rgba(20,20,40,0.18)", sm: "0 1px 3px rgba(0,0,0,0.12)" },
  medium: { lg: "0 12px 32px -16px rgba(20,20,40,0.28)", sm: "0 2px 8px -2px rgba(0,0,0,0.18)" },
  large: { lg: "0 30px 80px -30px rgba(0,0,0,0.6), 0 12px 32px -16px rgba(0,0,0,0.45)", sm: "0 6px 18px -8px rgba(0,0,0,0.4)" },
};

const FONT_FAMILY_VALUES: Record<FontFamilyKey, string> = {
  system: "'Geist', -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
  inter: "Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  roboto: "Roboto, 'Helvetica Neue', Arial, sans-serif",
  helvetica: "'Helvetica Neue', Helvetica, Arial, sans-serif",
  georgia: "Georgia, 'Times New Roman', serif",
  mono: "ui-monospace, 'SF Mono', 'Geist Mono', 'Fira Code', monospace",
};

// Every shell var the bridge may set when a preset/custom theme is active.
// Listed so they can be cleared when reverting to the plain Light/Dark stylesheet.
const PRESET_SHELL_VARS = [
  "--bg", "--fg", "--fg-2", "--fg-3", "--fg-4",
  "--glass", "--glass-strong", "--glass-weak", "--hairline",
  "--radius-xs", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl",
  "--shadow-lg", "--shadow-sm",
];

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  brand_name: DEFAULT_BRAND_NAME,
  brand_color: DEFAULT_BRAND_COLOR,
  logo_url: null,
  favicon_url: null,
  default_theme: "dark",
  density: "regular",
  glass_blur: 28,
  theme_preset: null,
  custom_theme: null,
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

function pickForegroundChannels(base: Rgb): string {
  const lum = relativeLuminance(base);
  const white = 1.05 / (lum + 0.05);
  const black = (lum + 0.05) / 0.05;
  return white >= black ? "0 0% 100%" : "0 0% 0%";
}

function rgbToHslChannels(rgb: Rgb): string {
  const { h, s, l } = rgbToHsl(rgb);
  return `${h.toFixed(2)} ${(s * 100).toFixed(2)}% ${(l * 100).toFixed(2)}%`;
}

// HeroUI primary scale (kept for embedded HeroUI controls in plan/chat/ProviderForm).
const PRIMARY_STOPS: Array<{ key: string; amount: number; toWhite: boolean }> = [
  { key: "50", amount: 0.92, toWhite: true }, { key: "100", amount: 0.82, toWhite: true },
  { key: "200", amount: 0.66, toWhite: true }, { key: "300", amount: 0.5, toWhite: true },
  { key: "400", amount: 0.3, toWhite: true }, { key: "500", amount: 0, toWhite: true },
  { key: "600", amount: 0.12, toWhite: false }, { key: "700", amount: 0.24, toWhite: false },
  { key: "800", amount: 0.38, toWhite: false }, { key: "900", amount: 0.54, toWhite: false },
];

function buildPrimaryScale(hex: string): Record<string, string> {
  const base = parseHexColor(hex);
  const out: Record<string, string> = {};
  for (const stop of PRIMARY_STOPS) {
    const t = stop.toWhite ? 255 : 0;
    const mixed: Rgb = stop.amount === 0 ? base : {
      r: base.r + (t - base.r) * stop.amount,
      g: base.g + (t - base.g) * stop.amount,
      b: base.b + (t - base.b) * stop.amount,
    };
    out[stop.key] = rgbToHslChannels(mixed);
  }
  return out;
}

function alpha(hex: string, a: number): string {
  const { r, g, b } = parseHexColor(hex);
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${a})`;
}

// ── Theme resolution + application ───────────────────────────────────────────

function resolveShellTheme(preset: ThemePreset | null, custom: CustomTheme | null): ShellTheme | null {
  if (!preset && !custom) return null;
  const base = THEME_PRESETS[preset ?? "default"];
  return {
    polarity: base.polarity,
    background: isHexColor(custom?.background) ? custom!.background! : base.background,
    foreground: isHexColor(custom?.foreground) ? custom!.foreground! : base.foreground,
    surfaceStrong: isHexColor(custom?.content1) ? custom!.content1! : base.surfaceStrong,
    surface: isHexColor(custom?.content2) ? custom!.content2! : base.surface,
    surfaceWeak: isHexColor(custom?.content3) ? custom!.content3! : base.surfaceWeak,
    divider: isHexColor(custom?.divider) ? custom!.divider! : base.divider,
    radius: custom?.radius ?? base.radius,
    shadow: custom?.shadow ?? base.shadow,
    font_family: custom?.font_family ?? base.font_family,
  };
}

function applyShellTheme(theme: ShellTheme): void {
  const s = document.documentElement.style;
  s.setProperty("--bg", theme.background);
  if (isHexColor(theme.foreground)) {
    s.setProperty("--fg", theme.foreground);
    s.setProperty("--fg-2", alpha(theme.foreground, 0.64));
    s.setProperty("--fg-3", alpha(theme.foreground, 0.4));
    s.setProperty("--fg-4", alpha(theme.foreground, 0.18));
  } else {
    s.setProperty("--fg", theme.foreground);
  }
  s.setProperty("--glass-strong", theme.surfaceStrong);
  s.setProperty("--glass", theme.surface);
  s.setProperty("--glass-weak", theme.surfaceWeak);
  s.setProperty("--hairline", theme.divider);
  const r = RADIUS_VALUES[theme.radius];
  s.setProperty("--radius-xs", r.xs); s.setProperty("--radius-sm", r.sm);
  s.setProperty("--radius-md", r.md); s.setProperty("--radius-lg", r.lg);
  s.setProperty("--radius-xl", r.xl);
  const sh = SHADOW_VALUES[theme.shadow];
  s.setProperty("--shadow-lg", sh.lg); s.setProperty("--shadow-sm", sh.sm);
  // Font-family must go on <body>: index.css has a direct `body { font-family }`
  // rule that beats inheritance from <html>, so setting it on the root is inert.
  if (document.body) document.body.style.setProperty("font-family", FONT_FAMILY_VALUES[theme.font_family]);
}

function clearShellTheme(): void {
  const s = document.documentElement.style;
  for (const v of PRESET_SHELL_VARS) s.removeProperty(v);
  if (document.body) document.body.style.removeProperty("font-family");
}

// ── Favicon / title helpers ──────────────────────────────────────────────────

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
  link.type = href.startsWith("data:image/png") ? "image/png"
    : href.endsWith(".ico") ? "image/x-icon" : "image/svg+xml";
}

// ── Main apply ───────────────────────────────────────────────────────────────

export function applyAppSettingsToDocument(settings: AppSettings): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const s = root.style;

  // Accent (drives the whole glass shell)
  const brandColor = isHexColor(settings.brand_color) ? settings.brand_color : DEFAULT_BRAND_COLOR;
  const accent2 = deriveSecondaryAccent(brandColor);
  s.setProperty("--accent-1", brandColor);
  s.setProperty("--accent-2", accent2);
  s.setProperty("--accent-grad", `linear-gradient(135deg, ${brandColor} 0%, ${accent2} 100%)`);

  // HeroUI primary (embedded controls)
  const scale = buildPrimaryScale(brandColor);
  s.setProperty("--heroui-primary", scale["500"]);
  s.setProperty("--heroui-primary-foreground", pickForegroundChannels(parseHexColor(brandColor)));
  for (const [k, v] of Object.entries(scale)) s.setProperty(`--heroui-primary-${k}`, v);

  // Theme + density + blur
  const theme = resolveShellTheme(settings.theme_preset ?? null, settings.custom_theme ?? null);
  if (theme) {
    root.setAttribute("data-theme", theme.polarity);
    applyShellTheme(theme);
  } else {
    root.setAttribute("data-theme", isThemeValue(settings.default_theme) ? settings.default_theme : "dark");
    clearShellTheme();
  }
  root.setAttribute("data-density", settings.density ?? "regular");
  s.setProperty("--blur", `${clamp(settings.glass_blur ?? 28, 0, 60)}px`);

  // Title + favicon
  document.title = settings.brand_name?.trim() || DEFAULT_BRAND_NAME;
  setFavicon(settings.favicon_url ?? null);
}

// ── Cache + broadcast ────────────────────────────────────────────────────────

function normalize(parsed: Partial<AppSettings>): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    ...parsed,
    brand_name: typeof parsed.brand_name === "string" && parsed.brand_name.trim() ? parsed.brand_name : DEFAULT_APP_SETTINGS.brand_name,
    brand_color: isHexColor(parsed.brand_color) ? parsed.brand_color : DEFAULT_APP_SETTINGS.brand_color,
    default_theme: isThemeValue(parsed.default_theme) ? parsed.default_theme : DEFAULT_APP_SETTINGS.default_theme,
    density: parsed.density === "compact" || parsed.density === "comfy" || parsed.density === "regular" ? parsed.density : DEFAULT_APP_SETTINGS.density,
    glass_blur: typeof parsed.glass_blur === "number" ? clamp(parsed.glass_blur, 0, 60) : DEFAULT_APP_SETTINGS.glass_blur,
    theme_preset: parsed.theme_preset != null && parsed.theme_preset in THEME_PRESETS ? (parsed.theme_preset as ThemePreset) : null,
    custom_theme: parsed.custom_theme != null && typeof parsed.custom_theme === "object" ? (parsed.custom_theme as CustomTheme) : null,
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
