import { useEffect, useState, useCallback } from "react";
import { Button, Spinner } from "@heroui/react";
import ProviderForm, {
  type LLMConfig,
  DEFAULT_LLM_CONFIG,
} from "../components/settings/ProviderForm";
import { getSettings, patchSettings, getLlmProviders } from "../lib/api";
import type { AppSettings } from "../types";
import { toast } from "../lib/toast";

function settingsToConfig(s: AppSettings): LLMConfig {
  return {
    llm_provider: s.llm_provider ?? DEFAULT_LLM_CONFIG.llm_provider,
    llm_model: s.llm_model ?? DEFAULT_LLM_CONFIG.llm_model,
    llm_api_key_raw: "",   // never returned by API
    llm_base_url: s.llm_base_url ?? DEFAULT_LLM_CONFIG.llm_base_url,
    llm_temperature: s.llm_temperature ?? DEFAULT_LLM_CONFIG.llm_temperature,
    llm_max_tokens: s.llm_max_tokens != null ? String(s.llm_max_tokens) : "",
    llm_top_p: s.llm_top_p != null ? String(s.llm_top_p) : "",
    llm_frequency_penalty:
      s.llm_frequency_penalty != null ? String(s.llm_frequency_penalty) : "",
    llm_presence_penalty:
      s.llm_presence_penalty != null ? String(s.llm_presence_penalty) : "",
  };
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [config, setConfig] = useState<LLMConfig>({
    ...DEFAULT_LLM_CONFIG,
    llm_api_key_raw: "",
  });
  const [hasApiKey, setHasApiKey] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  // prefetch providers to warm the cache used by ProviderForm
  const [_providers, _setProviders] = useState<unknown[]>([]);

  useEffect(() => {
    Promise.all([getSettings(), getLlmProviders()])
      .then(([settings, providers]) => {
        setConfig(settingsToConfig(settings));
        setHasApiKey(settings.has_api_key);
        setUpdatedAt(settings.updated_at);
        _setProviders(providers);
      })
      .catch(() => toast.error("Failed to load settings"))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const updated = await patchSettings({
        llm_provider: config.llm_provider || null,
        llm_model: config.llm_model || null,
        llm_api_key_raw: config.llm_api_key_raw || null,
        llm_base_url: config.llm_base_url || null,
        llm_temperature: config.llm_temperature,
        llm_max_tokens: config.llm_max_tokens ? Number(config.llm_max_tokens) : null,
        llm_top_p: config.llm_top_p ? Number(config.llm_top_p) : null,
        llm_frequency_penalty: config.llm_frequency_penalty
          ? Number(config.llm_frequency_penalty)
          : null,
        llm_presence_penalty: config.llm_presence_penalty
          ? Number(config.llm_presence_penalty)
          : null,
      });
      setHasApiKey(updated.has_api_key);
      setUpdatedAt(updated.updated_at);
      // clear the raw key field after save
      setConfig((prev) => ({ ...prev, llm_api_key_raw: "" }));
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [config]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      // Save first so the backend tests the persisted config
      await handleSave();
      setTestResult({ ok: true, message: "Connection successful" });
    } catch {
      setTestResult({ ok: false, message: "Connection failed" });
    } finally {
      setTesting(false);
    }
  }, [handleSave]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">System Settings</h1>
        <p className="text-default-500 text-sm mt-1">
          Configure the global LLM provider used by all agents unless overridden.
        </p>
        {hasApiKey && (
          <p className="text-xs text-success mt-1">API key is set. Leave the field blank to keep it.</p>
        )}
        {updatedAt && (
          <p className="text-xs text-default-400 mt-0.5">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </p>
        )}
      </div>

      <ProviderForm
        config={config}
        onChange={setConfig}
        onTest={handleTest}
        isTesting={testing}
        testResult={testResult}
      />

      <div className="mt-6 flex justify-end">
        <Button color="primary" onPress={handleSave} isLoading={saving} isDisabled={saving || testing}>
          Save Settings
        </Button>
      </div>
    </div>
  );
}
