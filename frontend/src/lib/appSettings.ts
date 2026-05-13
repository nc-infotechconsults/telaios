import type { AppSettings } from "../types";

const DEFAULT_BRAND_NAME = "TelaiOS";
const DEFAULT_BRAND_COLOR = "#006FEE";
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

export const DEFAULT_APP_SETTINGS: AppSettings = {
  id: 1,
  brand_name: DEFAULT_BRAND_NAME,
  brand_color: DEFAULT_BRAND_COLOR,
  logo_url: null,
  favicon_url: null,
  default_theme: "dark",
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
    updated_at:
      typeof parsed.updated_at === "string"
        ? parsed.updated_at
        : DEFAULT_APP_SETTINGS.updated_at,
  };
}

function isHexColor(value: unknown): value is string {
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
}
