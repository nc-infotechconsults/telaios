import { useEffect, useState, useCallback, useRef } from "react";
import { Button, Input, Select, SelectItem, Spinner, Switch } from "@heroui/react";
import { getSettings, patchSettings } from "../lib/api";
import type { AppSettings, CustomTheme, FontFamilyKey, RadiusStep, ShadowStep, ThemePreset } from "../types";
import { toast } from "../lib/toast";
import {
  THEME_PRESETS,
  applyThemeOverrides,
  loadCachedAppSettings,
  persistAndApplyAppSettings,
} from "../lib/appSettings";
import { useTheme } from "../context/ThemeContext";

function isValidHex(color: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ── Preset card ───────────────────────────────────────────────────────────────

const PRESET_LABELS: Record<ThemePreset, string> = {
  default:   "Default",
  corporate: "Corporate",
  midnight:  "Midnight",
  warm:      "Warm",
  minimal:   "Minimal",
  ocean:     "Ocean",
  forest:    "Forest",
  sunset:    "Sunset",
};

function PresetCard({
  name,
  selected,
  onSelect,
}: {
  name: ThemePreset;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = THEME_PRESETS[name];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex flex-col gap-2 p-3 rounded-xl border-2 transition-all cursor-pointer w-full text-left ${
        selected
          ? "border-primary ring-2 ring-primary/20"
          : "border-divider hover:border-default-400"
      }`}
      aria-pressed={selected}
    >
      {/* Mini swatch */}
      <div
        className="h-10 w-full rounded-lg overflow-hidden flex"
        style={{ borderRadius: name === "corporate" || name === "minimal" ? "2px" : undefined }}
      >
        <div className="w-1/4 h-full" style={{ background: t.sidebar_background }} />
        <div className="flex-1 h-full flex flex-col gap-0.5 p-1" style={{ background: t.background }}>
          <div className="h-1.5 rounded-full w-3/4" style={{ background: t.foreground, opacity: 0.7 }} />
          <div className="h-1.5 rounded-full w-1/2" style={{ background: t.foreground, opacity: 0.35 }} />
          <div className="h-2 rounded mt-0.5 w-full" style={{ background: t.content1 }} />
        </div>
      </div>
      <span className="text-xs font-medium">{PRESET_LABELS[name]}</span>
    </button>
  );
}

// ── Color row ─────────────────────────────────────────────────────────────────

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  const hex = value ?? "#000000";
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 text-sm text-default-600 shrink-0">{label}</span>
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg cursor-pointer border-0 p-0 shrink-0"
        aria-label={`Pick ${label}`}
      />
      <Input
        value={hex}
        onValueChange={(v) => onChange(v)}
        placeholder="#000000"
        className="w-36"
        size="sm"
        isInvalid={!isValidHex(hex)}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(loadCachedAppSettings);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const { syncThemeWithDefault } = useTheme();

  useEffect(() => {
    getSettings()
      .then((s) => {
        setSettings(s);
        persistAndApplyAppSettings(s);
        syncThemeWithDefault(s.default_theme === "light" ? "light" : "dark");
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, [syncThemeWithDefault]);

  // Instant live preview when preset or override changes
  const handlePresetSelect = useCallback((preset: ThemePreset) => {
    setSettings((prev) => {
      const next = { ...prev, theme_preset: preset };
      applyThemeOverrides(preset, prev.custom_theme ?? null);
      return next;
    });
  }, []);

  const handleOverrideChange = useCallback((patch: Partial<CustomTheme>) => {
    setSettings((prev) => {
      const next: AppSettings = {
        ...prev,
        custom_theme: { ...(prev.custom_theme ?? {}), ...patch },
      };
      applyThemeOverrides(next.theme_preset ?? null, next.custom_theme);
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!isValidHex(settings.brand_color)) {
      toast.error("Brand colour must be a valid hex code (e.g. #006FEE)");
      return;
    }
    setSaving(true);
    try {
      const updated = await patchSettings({
        brand_name: settings.brand_name,
        brand_color: settings.brand_color,
        logo_url: settings.logo_url,
        favicon_url: settings.favicon_url,
        default_theme: settings.default_theme,
        theme_preset: settings.theme_preset,
        custom_theme: settings.custom_theme,
      });
      setSettings(updated);
      persistAndApplyAppSettings(updated);
      syncThemeWithDefault(updated.default_theme === "light" ? "light" : "dark");
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [settings, syncThemeWithDefault]);

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { e.currentTarget.value = ""; return; }
    if (file.size > 500 * 1024) { toast.error("Logo must be under 500KB"); e.currentTarget.value = ""; return; }
    try {
      const base64 = await readFileAsBase64(file);
      setSettings((prev) => ({ ...prev, logo_url: base64 }));
    } catch { toast.error("Failed to read logo file"); }
    finally { e.currentTarget.value = ""; }
  }, []);

  const handleFaviconUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) { e.currentTarget.value = ""; return; }
    if (file.size > 100 * 1024) { toast.error("Favicon must be under 100KB"); e.currentTarget.value = ""; return; }
    try {
      const base64 = await readFileAsBase64(file);
      setSettings((prev) => ({ ...prev, favicon_url: base64 }));
    } catch { toast.error("Failed to read favicon file"); }
    finally { e.currentTarget.value = ""; }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  const preset = settings.theme_preset ?? "default";
  const overrides = settings.custom_theme ?? {};

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-default-500 text-sm mt-1">
          Customise the appearance and branding of your TelaiOS instance.
        </p>
      </div>

      <div className="space-y-6">
        {/* Brand name */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Brand Name</label>
          <Input
            value={settings.brand_name}
            onValueChange={(v) => setSettings((prev) => ({ ...prev, brand_name: v }))}
            placeholder="TelaiOS"
            maxLength={255}
          />
        </div>

        {/* Brand colour */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Primary Colour</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={settings.brand_color}
              onChange={(e) => setSettings((prev) => ({ ...prev, brand_color: e.target.value }))}
              className="w-10 h-10 rounded-lg cursor-pointer border-0 p-0"
              aria-label="Pick primary colour"
            />
            <Input
              value={settings.brand_color}
              onValueChange={(v) => setSettings((prev) => ({ ...prev, brand_color: v }))}
              placeholder="#006FEE"
              className="w-40"
              isInvalid={!isValidHex(settings.brand_color)}
            />
            <div
              className="w-8 h-8 rounded-full border border-divider"
              style={{ backgroundColor: isValidHex(settings.brand_color) ? settings.brand_color : "#ccc" }}
              aria-hidden="true"
            />
          </div>
          {!isValidHex(settings.brand_color) && (
            <p className="text-danger text-xs mt-1">Must be a valid 6-digit hex code</p>
          )}
        </div>

        {/* Live preview */}
        <div
          className="p-6 rounded-xl border border-divider"
          style={{ borderLeftWidth: "4px", borderLeftColor: isValidHex(settings.brand_color) ? settings.brand_color : "#ccc" }}
        >
          <p className="text-xs text-default-400 mb-2 uppercase tracking-wide">Live Preview</p>
          <div className="flex items-center gap-3">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="Logo" className="h-8 w-auto object-contain" />
            ) : (
              <div
                className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ backgroundColor: settings.brand_color }}
              >
                {settings.brand_name.charAt(0).toUpperCase()}
              </div>
            )}
            <span className="font-bold text-lg" style={{ color: settings.brand_color }}>
              {settings.brand_name}
            </span>
          </div>
        </div>

        {/* Logo upload */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Logo</label>
          <div className="flex items-center gap-3">
            <input ref={logoInputRef} type="file" accept="image/svg+xml,image/png,image/jpeg" onChange={handleLogoUpload} className="hidden" />
            <Button variant="bordered" onPress={() => logoInputRef.current?.click()}>Upload Logo</Button>
            {settings.logo_url && (
              <>
                <img src={settings.logo_url} alt="Preview" className="h-8 w-auto object-contain" />
                <Button size="sm" variant="light" color="danger" onPress={() => setSettings((prev) => ({ ...prev, logo_url: null }))}>Remove</Button>
              </>
            )}
          </div>
          <p className="text-xs text-default-400 mt-1">SVG, PNG or JPEG. Max 500KB.</p>
        </div>

        {/* Favicon upload */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Favicon</label>
          <div className="flex items-center gap-3">
            <input ref={faviconInputRef} type="file" accept="image/x-icon,image/png,image/svg+xml" onChange={handleFaviconUpload} className="hidden" />
            <Button variant="bordered" onPress={() => faviconInputRef.current?.click()}>Upload Favicon</Button>
            {settings.favicon_url && (
              <>
                <img src={settings.favicon_url} alt="Favicon" className="h-6 w-6 object-contain" />
                <Button size="sm" variant="light" color="danger" onPress={() => setSettings((prev) => ({ ...prev, favicon_url: null }))}>Remove</Button>
              </>
            )}
          </div>
          <p className="text-xs text-default-400 mt-1">ICO, PNG or SVG. Max 100KB.</p>
        </div>

        {/* Default theme */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Default Theme</label>
          <Switch
            isSelected={settings.default_theme === "dark"}
            onValueChange={(v) => setSettings((prev) => ({ ...prev, default_theme: v ? "dark" : "light" }))}
          >
            Dark mode
          </Switch>
        </div>

        {/* ── Theme section ── */}
        <div className="border-t border-divider pt-6">
          <h2 className="text-lg font-semibold mb-1">Theme</h2>
          <p className="text-default-500 text-sm mb-4">
            Pick a preset and optionally override individual properties. Changes preview instantly but are only saved when you click Save Settings.
          </p>

          {/* Preset cards */}
          <div className="grid grid-cols-5 gap-2 mb-6">
            {(["default", "corporate", "midnight", "warm", "minimal"] as ThemePreset[]).map((p) => (
              <PresetCard
                key={p}
                name={p}
                selected={preset === p}
                onSelect={() => handlePresetSelect(p)}
              />
            ))}
          </div>

          {/* Colour overrides */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-default-700 uppercase tracking-wide">Colors</h3>
            <ColorRow
              label="Page background"
              value={overrides.background ?? THEME_PRESETS[preset].background}
              onChange={(v) => handleOverrideChange({ background: v })}
            />
            <ColorRow
              label="Card surface"
              value={overrides.content1 ?? THEME_PRESETS[preset].content1}
              onChange={(v) => handleOverrideChange({ content1: v, content2: v, content3: v })}
            />
            <ColorRow
              label="Primary text"
              value={overrides.foreground ?? THEME_PRESETS[preset].foreground}
              onChange={(v) => handleOverrideChange({ foreground: v })}
            />
            <ColorRow
              label="Divider / borders"
              value={overrides.divider ?? THEME_PRESETS[preset].divider}
              onChange={(v) => handleOverrideChange({ divider: v })}
            />
            <ColorRow
              label="Sidebar background"
              value={overrides.sidebar_background ?? THEME_PRESETS[preset].sidebar_background}
              onChange={(v) => handleOverrideChange({ sidebar_background: v })}
            />
          </div>

          {/* Shape + typography */}
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div>
              <label className="block text-sm font-medium mb-1.5">Border Radius</label>
              <Select
                selectedKeys={[overrides.radius ?? THEME_PRESETS[preset].radius]}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as RadiusStep;
                  handleOverrideChange({ radius: v });
                }}
                size="sm"
                aria-label="Border radius"
              >
                {(["none", "small", "medium", "large", "full"] as RadiusStep[]).map((r) => (
                  <SelectItem key={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</SelectItem>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5">Box Shadow</label>
              <Select
                selectedKeys={[overrides.shadow ?? THEME_PRESETS[preset].shadow]}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as ShadowStep;
                  handleOverrideChange({ shadow: v });
                }}
                size="sm"
                aria-label="Box shadow"
              >
                {(["none", "small", "medium", "large"] as ShadowStep[]).map((s) => (
                  <SelectItem key={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </Select>
            </div>

            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1.5">Font Family</label>
              <Select
                selectedKeys={[overrides.font_family ?? THEME_PRESETS[preset].font_family]}
                onSelectionChange={(keys) => {
                  const v = Array.from(keys)[0] as FontFamilyKey;
                  handleOverrideChange({ font_family: v });
                }}
                size="sm"
                aria-label="Font family"
              >
                <SelectItem key="system">System UI</SelectItem>
                <SelectItem key="inter">Inter</SelectItem>
                <SelectItem key="roboto">Roboto</SelectItem>
                <SelectItem key="helvetica">Helvetica Neue</SelectItem>
                <SelectItem key="georgia">Georgia</SelectItem>
                <SelectItem key="mono">Monospace</SelectItem>
              </Select>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 flex justify-end">
        <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={saving}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
