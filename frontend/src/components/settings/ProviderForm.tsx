import { useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Slider,
} from "@heroui/react";

export interface LLMConfig {
  llm_provider: string;
  llm_model: string;
  llm_api_key_raw: string;
  llm_base_url: string;
  llm_temperature: number;
  llm_max_tokens: string;
  llm_top_p: string;
  llm_frequency_penalty: string;
  llm_presence_penalty: string;
}

export const DEFAULT_LLM_CONFIG: Omit<LLMConfig, "llm_api_key_raw"> = {
  llm_provider: "openai",
  llm_model: "",
  llm_base_url: "",
  llm_temperature: 1.0,
  llm_max_tokens: "",
  llm_top_p: "",
  llm_frequency_penalty: "",
  llm_presence_penalty: "",
};

interface Props {
  config: LLMConfig;
  onChange: (updated: LLMConfig) => void;
  onTest?: () => void;
  isTesting?: boolean;
  testResult?: { ok: boolean; message: string } | null;
}

const PROVIDERS = [
  { key: "openai", label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "ollama", label: "Ollama (local)" },
  { key: "vllm", label: "vLLM (self-hosted)" },
  { key: "lmstudio", label: "LM Studio (local)" },
];

const COMPAT_PROVIDERS = ["ollama", "vllm", "lmstudio"];
const OPENAI_COMPAT = ["openai", "vllm", "lmstudio"];

export default function ProviderForm({ config, onChange, onTest, isTesting, testResult }: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const needsBaseUrl = COMPAT_PROVIDERS.includes(config.llm_provider);
  const showPenalties = OPENAI_COMPAT.includes(config.llm_provider);

  const set = (key: keyof LLMConfig, value: string | number) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="space-y-4">
      <Select
        label="LLM Provider"
        selectedKeys={config.llm_provider ? [config.llm_provider] : []}
        onSelectionChange={(keys) => set("llm_provider", [...keys][0] as string)}
      >
        {PROVIDERS.map((p) => (
          <SelectItem key={p.key}>{p.label}</SelectItem>
        ))}
      </Select>

      <Input
        label="Model"
        placeholder={
          config.llm_provider === "openai" ? "gpt-4o"
          : config.llm_provider === "anthropic" ? "claude-3-5-sonnet-20241022"
          : config.llm_provider === "ollama" ? "llama3"
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
            config.llm_provider === "ollama" ? "http://localhost:11434/v1"
            : config.llm_provider === "vllm" ? "http://localhost:8000/v1"
            : "http://localhost:1234/v1"
          }
          value={config.llm_base_url}
          onValueChange={(v) => set("llm_base_url", v)}
        />
      )}

      {/* ── LLM Parameters ── */}
      <div className="space-y-3 pt-1">
        <Slider
          label="Temperature"
          step={0.01}
          minValue={0}
          maxValue={2}
          value={config.llm_temperature}
          onChange={(v) => set("llm_temperature", v as number)}
          getValue={(v) => String(v)}
          marks={[
            { value: 0, label: "0" },
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          classNames={{ label: "text-sm" }}
        />

        <Input
          label="Max Tokens"
          type="number"
          placeholder="model default"
          description="Maximum tokens in the response. Leave blank for model default."
          value={config.llm_max_tokens}
          min={1}
          onValueChange={(v) => set("llm_max_tokens", v)}
        />

        {/* Advanced toggle */}
        <button
          type="button"
          onClick={() => setShowAdvanced((p) => !p)}
          className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
        >
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Advanced sampling parameters
        </button>

        {showAdvanced && (
          <div className="space-y-3 pl-3 border-l-2 border-divider">
            <Input
              label="Top P"
              type="number"
              placeholder="1.0"
              description="Nucleus sampling (0–1). Alternative to temperature; avoid setting both."
              min={0}
              max={1}
              step={0.01}
              value={config.llm_top_p}
              onValueChange={(v) => set("llm_top_p", v)}
            />

            {showPenalties && (
              <>
                <Input
                  label="Frequency Penalty"
                  type="number"
                  placeholder="0"
                  description="Reduces repetition of tokens by frequency (−2 to 2)."
                  min={-2}
                  max={2}
                  step={0.01}
                  value={config.llm_frequency_penalty}
                  onValueChange={(v) => set("llm_frequency_penalty", v)}
                />
                <Input
                  label="Presence Penalty"
                  type="number"
                  placeholder="0"
                  description="Encourages new topics by penalising tokens already used (−2 to 2)."
                  min={-2}
                  max={2}
                  step={0.01}
                  value={config.llm_presence_penalty}
                  onValueChange={(v) => set("llm_presence_penalty", v)}
                />
              </>
            )}
          </div>
        )}
      </div>

      {onTest && (
        <div className="flex items-center gap-3 pt-1">
          <Button variant="bordered" onPress={onTest} isLoading={isTesting} isDisabled={isTesting}>
            Test Connection
          </Button>
          {testResult && (
            <span className={`text-sm ${testResult.ok ? "text-success" : "text-danger"}`}>
              {testResult.ok ? "✓" : "✗"} {testResult.message}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
