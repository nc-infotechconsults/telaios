import {
  Button,
  Input,
  Select,
  SelectItem,
} from "@heroui/react";

interface LLMConfig {
  llm_provider: string;
  llm_model: string;
  llm_api_key_raw: string;
  llm_base_url: string;
}

interface Props {
  config: LLMConfig;
  onChange: (updated: LLMConfig) => void;
  onTest?: () => void;
  isTesting?: boolean;
  testResult?: { ok: boolean; message: string } | null;
  showBaseUrl?: boolean;
}

const PROVIDERS = [
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "ollama", label: "Ollama (local)" },
  { key: "vllm", label: "vLLM (self-hosted)" },
  { key: "lmstudio", label: "LM Studio (local)" },
];

const COMPAT_PROVIDERS = ["ollama", "vllm", "lmstudio"];

export default function ProviderForm({ config, onChange, onTest, isTesting, testResult }: Props) {
  const needsBaseUrl = COMPAT_PROVIDERS.includes(config.llm_provider);

  const set = (key: keyof LLMConfig, value: string) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <Select
        label="LLM Provider"
        selectedKeys={config.llm_provider ? [config.llm_provider] : []}
        onSelectionChange={(keys) => {
          const val = [...keys][0] as string;
          set("llm_provider", val);
        }}
      >
        {PROVIDERS.map((p) => (
          <SelectItem key={p.key}>{p.label}</SelectItem>
        ))}
      </Select>

      <Input
        label="Model"
        placeholder={
          config.llm_provider === "openai"
            ? "gpt-4o"
            : config.llm_provider === "anthropic"
            ? "claude-3-5-sonnet-20241022"
            : config.llm_provider === "ollama"
            ? "llama3"
            : "your-model"
        }
        value={config.llm_model}
        onValueChange={(v) => set("llm_model", v)}
      />

      <Input
        label="API Key"
        placeholder={needsBaseUrl ? "optional" : "sk-..."}
        type="password"
        value={config.llm_api_key_raw}
        onValueChange={(v) => set("llm_api_key_raw", v)}
      />

      {needsBaseUrl && (
        <Input
          label="Base URL"
          placeholder={
            config.llm_provider === "ollama"
              ? "http://localhost:11434/v1"
              : config.llm_provider === "vllm"
              ? "http://localhost:8000/v1"
              : "http://localhost:1234/v1"
          }
          value={config.llm_base_url}
          onValueChange={(v) => set("llm_base_url", v)}
        />
      )}

      {onTest && (
        <div className="flex items-center gap-3">
          <Button
            variant="bordered"
            onPress={onTest}
            isLoading={isTesting}
            isDisabled={isTesting}
          >
            Test Connection
          </Button>
          {testResult && (
            <span
              className={`text-sm ${testResult.ok ? "text-success" : "text-danger"}`}
            >
              {testResult.ok ? "✓" : "✗"} {testResult.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
