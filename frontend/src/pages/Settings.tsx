import { useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader } from "@heroui/react";
import { getSettings, updateSettings, testLlm } from "../lib/api";
import { toast } from "../lib/toast";
import type { Settings } from "../types";
import ProviderForm, { type LLMConfig, DEFAULT_LLM_CONFIG } from "../components/settings/ProviderForm";

export default function SettingsPage() {
  const [config, setConfig] = useState<LLMConfig>({
    ...DEFAULT_LLM_CONFIG,
    llm_api_key_raw: "",
  });
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    getSettings()
      .then((s: Partial<Settings>) => {
        setConfig((c) => ({
          ...c,
          llm_provider: s.llm_provider ?? "openai",
          llm_model: s.llm_model ?? "",
          llm_base_url: s.llm_base_url ?? "",
          llm_temperature: s.llm_temperature ?? 1.0,
          llm_max_tokens: s.llm_max_tokens?.toString() ?? "",
          llm_top_p: s.llm_top_p?.toString() ?? "",
          llm_frequency_penalty: s.llm_frequency_penalty?.toString() ?? "",
          llm_presence_penalty: s.llm_presence_penalty?.toString() ?? "",
        }));
        setHasApiKey(!!s.has_api_key);
      })
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const updated = await updateSettings({
        llm_provider: config.llm_provider,
        llm_model: config.llm_model,
        llm_base_url: config.llm_base_url || undefined,
        llm_temperature: config.llm_temperature,
        llm_max_tokens: config.llm_max_tokens ? parseInt(config.llm_max_tokens) : undefined,
        llm_top_p: config.llm_top_p ? parseFloat(config.llm_top_p) : undefined,
        llm_frequency_penalty: config.llm_frequency_penalty ? parseFloat(config.llm_frequency_penalty) : undefined,
        llm_presence_penalty: config.llm_presence_penalty ? parseFloat(config.llm_presence_penalty) : undefined,
        ...(config.llm_api_key_raw ? { llm_api_key_raw: config.llm_api_key_raw } : {}),
      });
      setHasApiKey(!!(updated as Partial<Settings>).has_api_key);
      setConfig((c) => ({ ...c, llm_api_key_raw: "" }));
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    try {
      await testLlm({
        provider: config.llm_provider,
        model: config.llm_model,
        apiKey: config.llm_api_key_raw || undefined,
        baseUrl: config.llm_base_url || undefined,
      });
      toast.success("Connection successful", `${config.llm_provider} / ${config.llm_model}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Connection failed", msg);
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="w-full space-y-4">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader className="flex flex-col items-start gap-1">
          <span className="font-semibold">Planning Agent LLM</span>
          <p className="text-xs text-default-400">
            This LLM is used by the Planning Agent to interview you and generate execution plans.
            {hasApiKey && (
              <span className="ml-1 text-success">An API key is currently saved.</span>
            )}
          </p>
        </CardHeader>
        <CardBody className="space-y-4">
          <ProviderForm
            config={config}
            onChange={setConfig}
            onTest={handleTest}
            isTesting={isTesting}
          />

          <div className="flex items-center gap-3 pt-1">
            <Button color="primary" isLoading={loading} onPress={handleSave}>
              Save Settings
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
