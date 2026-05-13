import { useEffect, useState, useCallback, useRef } from "react";
import { Button, Input, Spinner, Switch } from "@heroui/react";
import { getSettings, patchSettings } from "../lib/api";
import type { AppSettings } from "../types";
import { toast } from "../lib/toast";
import {
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
  }, [settings]);

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      e.currentTarget.value = "";
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error("Logo must be under 500KB");
      e.currentTarget.value = "";
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setSettings((prev) => ({ ...prev, logo_url: base64 }));
    } catch {
      toast.error("Failed to read logo file");
    } finally {
      e.currentTarget.value = "";
    }
  }, []);

  const handleFaviconUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      e.currentTarget.value = "";
      return;
    }
    if (file.size > 100 * 1024) {
      toast.error("Favicon must be under 100KB");
      e.currentTarget.value = "";
      return;
    }
    try {
      const base64 = await readFileAsBase64(file);
      setSettings((prev) => ({ ...prev, favicon_url: base64 }));
    } catch {
      toast.error("Failed to read favicon file");
    } finally {
      e.currentTarget.value = "";
    }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

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
          style={{
            borderLeftWidth: "4px",
            borderLeftColor: isValidHex(settings.brand_color) ? settings.brand_color : "#ccc",
          }}
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
            <input
              ref={logoInputRef}
              type="file"
              accept="image/svg+xml,image/png,image/jpeg"
              onChange={handleLogoUpload}
              className="hidden"
            />
            <Button variant="bordered" onPress={() => logoInputRef.current?.click()}>
              Upload Logo
            </Button>
            {settings.logo_url && (
              <>
                <img src={settings.logo_url} alt="Preview" className="h-8 w-auto object-contain" />
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  onPress={() => setSettings((prev) => ({ ...prev, logo_url: null }))}
                >
                  Remove
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-default-400 mt-1">SVG, PNG or JPEG. Max 500KB.</p>
        </div>

        {/* Favicon upload */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Favicon</label>
          <div className="flex items-center gap-3">
            <input
              ref={faviconInputRef}
              type="file"
              accept="image/x-icon,image/png,image/svg+xml"
              onChange={handleFaviconUpload}
              className="hidden"
            />
            <Button variant="bordered" onPress={() => faviconInputRef.current?.click()}>
              Upload Favicon
            </Button>
            {settings.favicon_url && (
              <>
                <img src={settings.favicon_url} alt="Favicon" className="h-6 w-6 object-contain" />
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  onPress={() => setSettings((prev) => ({ ...prev, favicon_url: null }))}
                >
                  Remove
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-default-400 mt-1">ICO, PNG or SVG. Max 100KB.</p>
        </div>

        {/* Default theme */}
        <div>
          <label className="block text-sm font-medium mb-1.5">Default Theme</label>
          <div className="flex items-center gap-4">
            <Switch
              isSelected={settings.default_theme === "dark"}
              onValueChange={(v) =>
                setSettings((prev) => ({ ...prev, default_theme: v ? "dark" : "light" }))
              }
            >
              Dark mode
            </Switch>
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
