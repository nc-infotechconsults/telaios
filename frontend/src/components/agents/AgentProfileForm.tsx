import { useState } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Slider,
  Textarea,
  Divider,
  Card,
  CardBody,
} from "@heroui/react";
import { createAgentProfile, updateAgentProfile } from "../../lib/api";
import type { AgentProfile, McpServer, Skill } from "../../types";

interface Props {
  initialData?: AgentProfile;
  onSaved: () => void;
  onCancel: () => void;
}

const PROVIDERS = ["openai", "anthropic", "ollama", "vllm", "lmstudio"];
const AGENT_TYPES: AgentProfile["agent_type"][] = ["langgraph", "opencode", "github-copilot"];
const OPENAI_COMPAT = ["openai", "vllm", "lmstudio"];

export default function AgentProfileForm({ initialData, onSaved, onCancel }: Props) {
  // Basic
  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [agentType, setAgentType] = useState<AgentProfile["agent_type"]>(initialData?.agent_type ?? "langgraph");

  // LLM connection
  const [llmProvider, setLlmProvider] = useState(initialData?.llm_provider ?? "openai");
  const [llmModel, setLlmModel] = useState(initialData?.llm_model ?? "");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState(initialData?.llm_base_url ?? "");
  const [githubToken, setGithubToken] = useState("");

  // LLM parameters
  const [temperature, setTemperature] = useState<number>(initialData?.llm_temperature ?? 1.0);
  const [maxTokens, setMaxTokens] = useState(initialData?.llm_max_tokens?.toString() ?? "");
  const [topP, setTopP] = useState(initialData?.llm_top_p?.toString() ?? "");
  const [freqPenalty, setFreqPenalty] = useState(initialData?.llm_frequency_penalty?.toString() ?? "");
  const [presPenalty, setPresPenalty] = useState(initialData?.llm_presence_penalty?.toString() ?? "");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Capabilities
  const [mcpServers, setMcpServers] = useState<McpServer[]>(initialData?.mcp_servers ?? []);
  const [skills, setSkills] = useState<Skill[]>(initialData?.skills ?? []);
  const [saving, setSaving] = useState(false);

  const needsBaseUrl = ["ollama", "vllm", "lmstudio"].includes(llmProvider);
  const showPenalties = OPENAI_COMPAT.includes(llmProvider);

  const addMcp = () =>
    setMcpServers((prev) => [...prev, { name: "", transport: "stdio", command: "" }]);
  const updateMcp = (i: number, update: Partial<McpServer>) =>
    setMcpServers((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));
  const removeMcp = (i: number) =>
    setMcpServers((prev) => prev.filter((_, j) => j !== i));

  const addSkill = () =>
    setSkills((prev) => [...prev, { name: "", description: "", parameters: {}, instructions: "" }]);
  const updateSkill = (i: number, update: Partial<Skill>) =>
    setSkills((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));
  const removeSkill = (i: number) =>
    setSkills((prev) => prev.filter((_, j) => j !== i));

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const payload: Partial<AgentProfile> & { llm_api_key_raw?: string; github_token_raw?: string } = {
        name: name.trim(),
        description: description.trim(),
        agent_type: agentType,
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_base_url: llmBaseUrl || undefined,
        llm_temperature: temperature,
        llm_max_tokens: maxTokens ? parseInt(maxTokens) : undefined,
        llm_top_p: topP ? parseFloat(topP) : undefined,
        llm_frequency_penalty: freqPenalty ? parseFloat(freqPenalty) : undefined,
        llm_presence_penalty: presPenalty ? parseFloat(presPenalty) : undefined,
        mcp_servers: mcpServers,
        skills,
        ...(llmApiKey ? { llm_api_key_raw: llmApiKey } : {}),
        ...(githubToken ? { github_token_raw: githubToken } : {}),
      };
      if (initialData) {
        await updateAgentProfile(initialData.id, payload);
      } else {
        await createAgentProfile(payload);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Basic ── */}
      <Input label="Name" value={name} onValueChange={setName} isRequired />
      <Textarea label="Description" value={description} onValueChange={setDescription} />

      <Select
        label="Agent Type (Driver)"
        selectedKeys={[agentType]}
        onSelectionChange={(keys) => setAgentType(Array.from(keys)[0] as AgentProfile["agent_type"])}
      >
        {AGENT_TYPES.map((t) => <SelectItem key={t}>{t}</SelectItem>)}
      </Select>

      <Divider />

      {/* ── LLM Connection ── */}
      <p className="font-semibold text-sm">
        LLM Configuration
        {agentType === "github-copilot" && (
          <span className="text-default-400 font-normal ml-2">(used for BYOK mode)</span>
        )}
      </p>
      <Select
        label="Provider"
        selectedKeys={[llmProvider]}
        onSelectionChange={(keys) => setLlmProvider(Array.from(keys)[0] as string)}
      >
        {PROVIDERS.map((p) => <SelectItem key={p}>{p}</SelectItem>)}
      </Select>
      <Input label="Model" placeholder="gpt-4o" value={llmModel} onValueChange={setLlmModel} />
      <Input
        label="API Key"
        type="password"
        placeholder={initialData?.has_llm_api_key ? "••••• (saved)" : "sk-..."}
        value={llmApiKey}
        onValueChange={setLlmApiKey}
        description={initialData?.has_llm_api_key ? "Enter a new key to replace the saved one" : undefined}
      />
      {needsBaseUrl && (
        <Input
          label="Base URL"
          placeholder="http://localhost:11434/v1"
          value={llmBaseUrl}
          onValueChange={setLlmBaseUrl}
        />
      )}

      {/* GitHub Copilot section */}
      {agentType === "github-copilot" && (
        <>
          <Divider />
          <p className="font-semibold text-sm">GitHub Copilot — Subscription Auth</p>
          <p className="text-xs text-default-400">
            Provide a GitHub token with Copilot access, OR leave blank and use BYOK mode (LLM config above).
          </p>
          <Input
            label="GitHub Token"
            type="password"
            placeholder={initialData?.has_github_token ? "••••• (saved)" : "ghp_..."}
            value={githubToken}
            onValueChange={setGithubToken}
          />
        </>
      )}

      {/* ── LLM Parameters ── */}
      <Divider />
      <p className="font-semibold text-sm">LLM Parameters</p>

      <Slider
        label="Temperature"
        step={0.01}
        minValue={0}
        maxValue={2}
        value={temperature}
        onChange={(v) => setTemperature(v as number)}
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
        value={maxTokens}
        min={1}
        onValueChange={setMaxTokens}
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
            value={topP}
            onValueChange={setTopP}
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
                value={freqPenalty}
                onValueChange={setFreqPenalty}
              />
              <Input
                label="Presence Penalty"
                type="number"
                placeholder="0"
                description="Encourages new topics by penalising tokens already used (−2 to 2)."
                min={-2}
                max={2}
                step={0.01}
                value={presPenalty}
                onValueChange={setPresPenalty}
              />
            </>
          )}
        </div>
      )}

      {/* ── MCP Servers ── */}
      <Divider />
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">MCP Servers</p>
        <Button size="sm" variant="bordered" onPress={addMcp}>+ Add</Button>
      </div>
      {mcpServers.map((s, i) => (
        <Card key={i} className="bg-default-50">
          <CardBody className="space-y-2 py-2">
            <div className="grid grid-cols-2 gap-2">
              <Input size="sm" label="Name" value={s.name} onValueChange={(v) => updateMcp(i, { name: v })} />
              <Select
                size="sm"
                label="Transport"
                selectedKeys={[s.transport]}
                onSelectionChange={(keys) => updateMcp(i, { transport: Array.from(keys)[0] as McpServer["transport"] })}
              >
                <SelectItem key="stdio">stdio</SelectItem>
                <SelectItem key="sse">SSE</SelectItem>
              </Select>
            </div>
            {s.transport === "sse" ? (
              <Input size="sm" label="URL" value={s.url ?? ""} onValueChange={(v) => updateMcp(i, { url: v })} />
            ) : (
              <Input size="sm" label="Command" value={s.command ?? ""} onValueChange={(v) => updateMcp(i, { command: v })} />
            )}
            <Button size="sm" variant="light" color="danger" onPress={() => removeMcp(i)}>Remove</Button>
          </CardBody>
        </Card>
      ))}

      {/* ── Skills ── */}
      <Divider />
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">Claude Skills</p>
        <Button size="sm" variant="bordered" onPress={addSkill}>+ Add</Button>
      </div>
      {skills.map((s, i) => (
        <Card key={i} className="bg-default-50">
          <CardBody className="space-y-2 py-2">
            <Input size="sm" label="Skill Name" value={s.name} onValueChange={(v) => updateSkill(i, { name: v })} />
            <Input size="sm" label="Description" value={s.description} onValueChange={(v) => updateSkill(i, { description: v })} />
            <Textarea
              size="sm"
              label="Instructions (Markdown)"
              value={s.instructions}
              onValueChange={(v) => updateSkill(i, { instructions: v })}
              minRows={3}
            />
            <Button size="sm" variant="light" color="danger" onPress={() => removeSkill(i)}>Remove</Button>
          </CardBody>
        </Card>
      ))}

      <Divider />
      <div className="flex gap-2 pb-2">
        <Button color="primary" isLoading={saving} onPress={handleSave}>
          {initialData ? "Save Changes" : "Create Profile"}
        </Button>
        <Button variant="light" onPress={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}
