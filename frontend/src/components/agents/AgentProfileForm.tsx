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
  Chip,
} from "@heroui/react";
import { createAgentProfile, updateAgentProfile } from "../../lib/api";
import type { AgentProfile, McpServer, Skill, JsonSchemaProperty } from "../../types";

interface Props {
  initialData?: AgentProfile;
  onSaved: () => void;
  onCancel: () => void;
}

const PROVIDERS = ["openai", "anthropic", "ollama", "vllm", "lmstudio"];
const AGENT_TYPES: AgentProfile["agent_type"][] = ["langgraph", "opencode", "github-copilot"];
const OPENAI_COMPAT = ["openai", "vllm", "lmstudio"];
const SCHEMA_TYPES = ["string", "number", "integer", "boolean", "array", "object"];

/** A single row in the inputSchema property editor. */
interface SchemaProp {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

function schemaPropsToJsonSchema(props: SchemaProp[]): Skill["inputSchema"] {
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];
  for (const p of props) {
    if (!p.name.trim()) continue;
    properties[p.name.trim()] = { type: p.type as JsonSchemaProperty["type"], description: p.description };
    if (p.required) required.push(p.name.trim());
  }
  return { type: "object", properties, required };
}

function jsonSchemaToProps(schema?: Skill["inputSchema"]): SchemaProp[] {
  if (!schema?.properties) return [];
  return Object.entries(schema.properties).map(([name, prop]) => ({
    name,
    type: Array.isArray(prop.type) ? String(prop.type[0]) : String(prop.type),
    description: prop.description ?? "",
    required: schema.required?.includes(name) ?? false,
  }));
}

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
  const [skillProps, setSkillProps] = useState<SchemaProp[][]>(
    initialData?.skills?.map((s) => jsonSchemaToProps(s.inputSchema)) ?? []
  );
  const [saving, setSaving] = useState(false);

  const needsBaseUrl = ["ollama", "vllm", "lmstudio"].includes(llmProvider);
  const showPenalties = OPENAI_COMPAT.includes(llmProvider);

  const addMcp = () =>
    setMcpServers((prev) => [...prev, { name: "", transport: "stdio", command: "" }]);
  const updateMcp = (i: number, update: Partial<McpServer>) =>
    setMcpServers((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));
  const removeMcp = (i: number) =>
    setMcpServers((prev) => prev.filter((_, j) => j !== i));

  const addSkill = () => {
    setSkills((prev) => [...prev, {
      name: "", description: "", inputSchema: { type: "object", properties: {}, required: [] }, instructions: "",
    }]);
    setSkillProps((prev) => [...prev, []]);
  };
  const updateSkill = (i: number, update: Partial<Skill>) =>
    setSkills((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));
  const removeSkill = (i: number) => {
    setSkills((prev) => prev.filter((_, j) => j !== i));
    setSkillProps((prev) => prev.filter((_, j) => j !== i));
  };

  const addProp = (si: number) =>
    setSkillProps((prev) => prev.map((ps, j) =>
      j === si ? [...ps, { name: "", type: "string", description: "", required: false }] : ps
    ));
  const updateProp = (si: number, pi: number, update: Partial<SchemaProp>) => {
    setSkillProps((prev) => {
      const next = prev.map((ps, j) =>
        j === si ? ps.map((p, k) => (k === pi ? { ...p, ...update } : p)) : ps
      );
      // sync inputSchema
      setSkills((ss) => ss.map((s, j) => j === si ? { ...s, inputSchema: schemaPropsToJsonSchema(next[si]) } : s));
      return next;
    });
  };
  const removeProp = (si: number, pi: number) => {
    setSkillProps((prev) => {
      const next = prev.map((ps, j) => j === si ? ps.filter((_, k) => k !== pi) : ps);
      setSkills((ss) => ss.map((s, j) => j === si ? { ...s, inputSchema: schemaPropsToJsonSchema(next[si]) } : s));
      return next;
    });
  };

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
                <SelectItem key="stdio">stdio (local process)</SelectItem>
                <SelectItem key="streamable-http">Streamable HTTP (remote)</SelectItem>
              </Select>
            </div>
            {s.transport === "streamable-http" ? (
              <>
                <Input size="sm" label="URL" placeholder="https://..." value={s.url ?? ""} onValueChange={(v) => updateMcp(i, { url: v })} />
                <Input
                  size="sm"
                  label="Authorization Header"
                  placeholder="Bearer <token>"
                  value={s.headers?.["Authorization"] ?? ""}
                  onValueChange={(v) => updateMcp(i, { headers: { ...s.headers, Authorization: v } })}
                  description="Optional — sent as the HTTP Authorization header."
                />
              </>
            ) : (
              <>
                <Input size="sm" label="Command" placeholder="npx" value={s.command ?? ""} onValueChange={(v) => updateMcp(i, { command: v })} />
                <Input
                  size="sm"
                  label="Args (space-separated)"
                  placeholder="-y @modelcontextprotocol/server-filesystem /workspace"
                  value={(s.args ?? []).join(" ")}
                  onValueChange={(v) => updateMcp(i, { args: v.split(" ").filter(Boolean) })}
                />
              </>
            )}
            <Button size="sm" variant="light" color="danger" onPress={() => removeMcp(i)}>Remove</Button>
          </CardBody>
        </Card>
      ))}

      {/* ── Skills (MCP Tool definitions) ── */}
      <Divider />
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Skills</p>
          <p className="text-[11px] text-default-400">MCP-structured tools the agent can invoke</p>
        </div>
        <Button size="sm" variant="bordered" onPress={addSkill}>+ Add Skill</Button>
      </div>
      {skills.map((s, i) => (
        <Card key={i} className="bg-default-50">
          <CardBody className="space-y-3 py-3">
            {/* Identity */}
            <div className="grid grid-cols-2 gap-2">
              <Input size="sm" label="Tool Name (snake_case)" placeholder="run_tests" value={s.name} onValueChange={(v) => updateSkill(i, { name: v })} />
              <Input size="sm" label="Display Title (optional)" placeholder="Run Tests" value={s.title ?? ""} onValueChange={(v) => updateSkill(i, { title: v })} />
            </div>
            <Input size="sm" label="Description" value={s.description} onValueChange={(v) => updateSkill(i, { description: v })} />

            {/* inputSchema property editor */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-default-600">Input Parameters (inputSchema)</p>
                <Button size="sm" variant="flat" onPress={() => addProp(i)} className="h-6 px-2 text-[10px]">+ Parameter</Button>
              </div>
              {(skillProps[i] ?? []).length === 0 ? (
                <p className="text-[11px] text-default-400 italic">No parameters — skill takes no input.</p>
              ) : (
                <div className="space-y-1.5">
                  {(skillProps[i] ?? []).map((p, pi) => (
                    <div key={pi} className="grid grid-cols-[1fr_100px_1fr_60px_28px] gap-1.5 items-center">
                      <Input
                        size="sm"
                        placeholder="param_name"
                        value={p.name}
                        onValueChange={(v) => updateProp(i, pi, { name: v })}
                        aria-label="Parameter name"
                      />
                      <Select
                        size="sm"
                        selectedKeys={[p.type]}
                        onSelectionChange={(keys) => updateProp(i, pi, { type: Array.from(keys)[0] as string })}
                        aria-label="Parameter type"
                      >
                        {SCHEMA_TYPES.map((t) => <SelectItem key={t}>{t}</SelectItem>)}
                      </Select>
                      <Input
                        size="sm"
                        placeholder="description"
                        value={p.description}
                        onValueChange={(v) => updateProp(i, pi, { description: v })}
                        aria-label="Parameter description"
                      />
                      <button
                        type="button"
                        onClick={() => updateProp(i, pi, { required: !p.required })}
                        className={`text-[10px] rounded px-1.5 py-1 border transition-colors ${p.required ? "bg-primary/10 border-primary text-primary font-semibold" : "border-divider text-default-400"}`}
                        title="Toggle required"
                      >
                        req
                      </button>
                      <button
                        type="button"
                        onClick={() => removeProp(i, pi)}
                        className="text-danger text-xs leading-none hover:opacity-70"
                        aria-label="Remove parameter"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 flex-wrap pt-0.5">
                    {(skillProps[i] ?? []).filter((p) => p.name).map((p) => (
                      <Chip key={p.name} size="sm" variant="flat" color={p.required ? "primary" : "default"}>
                        {p.name}: {p.type}{p.required ? "*" : ""}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <Textarea
              size="sm"
              label="Agent Instructions (Markdown)"
              description="Injected into the LLM system prompt to guide tool usage."
              value={s.instructions}
              onValueChange={(v) => updateSkill(i, { instructions: v })}
              minRows={3}
            />
            <Button size="sm" variant="light" color="danger" onPress={() => removeSkill(i)}>Remove Skill</Button>
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
