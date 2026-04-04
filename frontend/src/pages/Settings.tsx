import { useEffect, useState } from "react";
import { Button, Card, CardBody, CardHeader, Chip } from "@heroui/react";
import { getSettings, updateSettings, testLlm } from "../lib/api";
import type { Settings } from "../types";
import ProviderForm from "../components/settings/ProviderForm";

interface LLMConfig {
  llm_provider: string;
  llm_model: string;
  llm_api_key_raw: string;
  llm_base_url: string;
}

export default function SettingsPage() {
  const [config, setConfig] = useState<LLMConfig>({
    llm_provider: "openai",
    llm_model: "",
    llm_api_key_raw: "",
    llm_base_url: "",
  });
  const [hasApiKey, setHasApiKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    getSettings().then((s: Partial<Settings>) => {
      setConfig({
        llm_provider: s.llm_provider ?? "openai",
        llm_model: s.llm_model ?? "",
        llm_api_key_raw: "",
        llm_base_url: s.llm_base_url ?? "",
      });
      setHasApiKey(!!s.has_api_key);
    }).catch(console.error);
  }, []);

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    try {
      const updated = await updateSettings({
        llm_provider: config.llm_provider,
        llm_model: config.llm_model,
        llm_base_url: config.llm_base_url,
        ...(config.llm_api_key_raw ? { llm_api_key_raw: config.llm_api_key_raw } : {}),
      });
      setHasApiKey(!!(updated as Partial<Settings>).has_api_key);
      setConfig((c) => ({ ...c, llm_api_key_raw: "" }));
      setSaved(true);
      setTestResult(null);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      await testLlm({
        provider: config.llm_provider,
        model: config.llm_model,
        api_key: config.llm_api_key_raw || undefined,
        base_url: config.llm_base_url || undefined,
      });
      setTestResult({ ok: true, message: "Connection successful" });
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4">
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
            testResult={testResult}
          />

          <div className="flex items-center gap-3 pt-1">
            <Button color="primary" isLoading={loading} onPress={handleSave}>
              Save Settings
            </Button>
            {saved && <Chip color="success" size="sm">✓ Saved!</Chip>}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
