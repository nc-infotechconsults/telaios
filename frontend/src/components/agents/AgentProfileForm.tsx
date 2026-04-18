import { useState, useEffect } from "react";
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
  Tabs,
  Tab,
  Spinner,
} from "@heroui/react";
import { createAgentProfile, updateAgentProfile, getAgentProfiles, discoverMcpTools } from "../../lib/api";
import { toast } from "../../lib/toast";
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

/** A single row in the inputSchema / outputSchema property editor. */
interface SchemaProp {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

/** A single env var row. */
interface EnvEntry {
  key: string;
  value: string;
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

function envRecordToEntries(env?: Record<string, string>): EnvEntry[] {
  if (!env) return [];
  return Object.entries(env).map(([key, value]) => ({ key, value }));
}

function envEntriesToRecord(entries: EnvEntry[]): Record<string, string> {
  return entries.reduce<Record<string, string>>((acc, { key, value }) => {
    if (key.trim()) acc[key.trim()] = value;
    return acc;
  }, {});
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

  // System prompt
  const [systemPrompt, setSystemPrompt] = useState(initialData?.system_prompt ?? "");
  const [systemPromptMode, setSystemPromptMode] = useState<"override" | "extend">(
    initialData?.system_prompt_mode ?? "extend"
  );

  // Sub-agents
  const [subAgentIds, setSubAgentIds] = useState<string[]>(initialData?.sub_agent_ids ?? []);

  // MCP Servers + their env entries (parallel array)
  const [mcpServers, setMcpServers] = useState<McpServer[]>(initialData?.mcp_servers ?? []);
  const [mcpEnvEntries, setMcpEnvEntries] = useState<EnvEntry[][]>(
    initialData?.mcp_servers?.map((s) => envRecordToEntries(s.env)) ?? []
  );

  // Skills + their input/output schema props (parallel arrays)
  const [skills, setSkills] = useState<Skill[]>(initialData?.skills ?? []);
  const [skillInputProps, setSkillInputProps] = useState<SchemaProp[][]>(
    initialData?.skills?.map((s) => jsonSchemaToProps(s.inputSchema)) ?? []
  );
  const [skillOutputProps, setSkillOutputProps] = useState<SchemaProp[][]>(
    initialData?.skills?.map((s) => jsonSchemaToProps(s.outputSchema)) ?? []
  );
  const [saving, setSaving] = useState(false);

  // Structured output
  const [useStructuredOutput, setUseStructuredOutput] = useState<boolean>(
    initialData?.structured_output != null
  );
  const [structuredOutputProps, setStructuredOutputProps] = useState<SchemaProp[]>(
    jsonSchemaToProps(initialData?.structured_output ?? undefined)
  );

  // All profiles for sub-agent picker
  const [allProfiles, setAllProfiles] = useState<AgentProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);

  // Tab state
  const [activeTab, setActiveTab] = useState("general");

  const needsBaseUrl = ["ollama", "vllm", "lmstudio"].includes(llmProvider);
  const showPenalties = OPENAI_COMPAT.includes(llmProvider);

  // Load all profiles for sub-agent picker
  useEffect(() => {
    setLoadingProfiles(true);
    getAgentProfiles()
      .then(setAllProfiles)
      .catch(() => {})
      .finally(() => setLoadingProfiles(false));
  }, []);

  // ── MCP helpers ──────────────────────────────────────────────────────────────

  const addMcp = () => {
    setMcpServers((prev) => [...prev, { name: "", transport: "stdio", command: "" }]);
    setMcpEnvEntries((prev) => [...prev, []]);
  };

  const updateMcp = (i: number, update: Partial<McpServer>) =>
    setMcpServers((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));

  const removeMcp = (i: number) => {
    setMcpServers((prev) => prev.filter((_, j) => j !== i));
    setMcpEnvEntries((prev) => prev.filter((_, j) => j !== i));
  };

  const addEnvEntry = (si: number) =>
    setMcpEnvEntries((prev) => prev.map((entries, j) =>
      j === si ? [...entries, { key: "", value: "" }] : entries
    ));

  const updateEnvEntry = (si: number, ei: number, update: Partial<EnvEntry>) => {
    setMcpEnvEntries((prev) => {
      const next = prev.map((entries, j) =>
        j === si ? entries.map((e, k) => (k === ei ? { ...e, ...update } : e)) : entries
      );
      // sync env back to mcpServers
      setMcpServers((ss) => ss.map((s, j) => j === si ? { ...s, env: envEntriesToRecord(next[si]) } : s));
      return next;
    });
  };

  const removeEnvEntry = (si: number, ei: number) => {
    setMcpEnvEntries((prev) => {
      const next = prev.map((entries, j) => j === si ? entries.filter((_, k) => k !== ei) : entries);
      setMcpServers((ss) => ss.map((s, j) => j === si ? { ...s, env: envEntriesToRecord(next[si]) } : s));
      return next;
    });
  };

  // ── Skill helpers ─────────────────────────────────────────────────────────────

  const addSkill = () => {
    setSkills((prev) => [...prev, {
      name: "", description: "", inputSchema: { type: "object", properties: {}, required: [] }, instructions: "",
    }]);
    setSkillInputProps((prev) => [...prev, []]);
    setSkillOutputProps((prev) => [...prev, []]);
  };

  const updateSkill = (i: number, update: Partial<Skill>) =>
    setSkills((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));

  const removeSkill = (i: number) => {
    setSkills((prev) => prev.filter((_, j) => j !== i));
    setSkillInputProps((prev) => prev.filter((_, j) => j !== i));
    setSkillOutputProps((prev) => prev.filter((_, j) => j !== i));
  };

  const makeSchemaUpdater = (
    _getProps: () => SchemaProp[][],
    setProps: React.Dispatch<React.SetStateAction<SchemaProp[][]>>,
    schemaField: "inputSchema" | "outputSchema"
  ) => ({
    add: (si: number) =>
      setProps((prev) => prev.map((ps, j) =>
        j === si ? [...ps, { name: "", type: "string", description: "", required: false }] : ps
      )),
    update: (si: number, pi: number, update: Partial<SchemaProp>) => {
      setProps((prev) => {
        const next = prev.map((ps, j) =>
          j === si ? ps.map((p, k) => (k === pi ? { ...p, ...update } : p)) : ps
        );
        setSkills((ss) => ss.map((s, j) => j === si ? { ...s, [schemaField]: schemaPropsToJsonSchema(next[si]) } : s));
        return next;
      });
    },
    remove: (si: number, pi: number) => {
      setProps((prev) => {
        const next = prev.map((ps, j) => j === si ? ps.filter((_, k) => k !== pi) : ps);
        setSkills((ss) => ss.map((s, j) => j === si ? { ...s, [schemaField]: schemaPropsToJsonSchema(next[si]) } : s));
        return next;
      });
    },
  });

  // Suppress lint warning — these are used via closures in the schema updaters
  void getSkillInputProps;
  void getSkillOutputProps;

  function getSkillInputProps() { return skillInputProps; }
  function getSkillOutputProps() { return skillOutputProps; }

  const inputSchemaOps = makeSchemaUpdater(getSkillInputProps, setSkillInputProps, "inputSchema");
  const outputSchemaOps = makeSchemaUpdater(getSkillOutputProps, setSkillOutputProps, "outputSchema");

  // ── Save ──────────────────────────────────────────────────────────────────────

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
        system_prompt: systemPrompt.trim() || null,
        system_prompt_mode: systemPromptMode,
        sub_agent_ids: subAgentIds,
        structured_output: useStructuredOutput ? schemaPropsToJsonSchema(structuredOutputProps) : null,
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
    } catch {
      toast.error(initialData ? "Failed to update agent profile" : "Failed to create agent profile");
    } finally {
      setSaving(false);
    }
  };

  // ── Shared schema property row renderer ──────────────────────────────────────

  function SchemaPropEditor({
    props,
    onAdd,
    onUpdate,
    onRemove,
    label,
  }: {
    props: SchemaProp[];
    onAdd: () => void;
    onUpdate: (pi: number, update: Partial<SchemaProp>) => void;
    onRemove: (pi: number) => void;
    label: string;
  }) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-medium text-default-600">{label}</p>
          <Button size="sm" variant="flat" onPress={onAdd} className="h-6 px-2 text-[10px]">+ Parameter</Button>
        </div>
        {props.length === 0 ? (
          <p className="text-[11px] text-default-400 italic">No parameters defined.</p>
        ) : (
          <div className="space-y-1.5">
            {props.map((p, pi) => (
              <div key={pi} className="grid grid-cols-[1fr_100px_1fr_60px_28px] gap-1.5 items-center">
                <Input
                  size="sm"
                  placeholder="param_name"
                  value={p.name}
                  onValueChange={(v) => onUpdate(pi, { name: v })}
                  aria-label="Parameter name"
                />
                <Select
                  size="sm"
                  selectedKeys={[p.type]}
                  onSelectionChange={(keys) => onUpdate(pi, { type: Array.from(keys)[0] as string })}
                  aria-label="Parameter type"
                >
                  {SCHEMA_TYPES.map((t) => <SelectItem key={t}>{t}</SelectItem>)}
                </Select>
                <Input
                  size="sm"
                  placeholder="description"
                  value={p.description}
                  onValueChange={(v) => onUpdate(pi, { description: v })}
                  aria-label="Parameter description"
                />
                <button
                  type="button"
                  onClick={() => onUpdate(pi, { required: !p.required })}
                  className={`text-[10px] rounded px-1.5 py-1 border transition-colors ${p.required ? "bg-primary/10 border-primary text-primary font-semibold" : "border-divider text-default-400"}`}
                  title="Toggle required"
                >
                  req
                </button>
                <button
                  type="button"
                  onClick={() => onRemove(pi)}
                  className="text-danger text-xs leading-none hover:opacity-70"
                  aria-label="Remove parameter"
                >
                  ✕
                </button>
              </div>
            ))}
            <div className="flex gap-2 flex-wrap pt-0.5">
              {props.filter((p) => p.name).map((p) => (
                <Chip key={p.name} size="sm" variant="flat" color={p.required ? "primary" : "default"}>
                  {p.name}: {p.type}{p.required ? "*" : ""}
                </Chip>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Tab content renderers ─────────────────────────────────────────────────────

  const renderGeneralTab = () => (
    <div className="space-y-4">
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

      {/* LLM Connection */}
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

      {/* LLM Parameters */}
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
    </div>
  );

  const renderSystemPromptTab = () => (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-sm">System Prompt</p>
        <p className="text-[11px] text-default-400 mt-0.5">
          Customize the agent&apos;s built-in instructions. Leave blank to use the default.
        </p>
      </div>
      <Select
        label="Mode"
        selectedKeys={[systemPromptMode]}
        onSelectionChange={(keys) => setSystemPromptMode(Array.from(keys)[0] as "override" | "extend")}
        description={
          systemPromptMode === "override"
            ? "Fully replaces the built-in agent prompt."
            : "Appended after the built-in agent prompt."
        }
      >
        <SelectItem key="override">Override — replace built-in prompt</SelectItem>
        <SelectItem key="extend">Extend — append to built-in prompt</SelectItem>
      </Select>
      <Textarea
        label="System Prompt"
        placeholder={systemPromptMode === "override" ? "You are a specialized agent that…" : "Additionally, you must…"}
        value={systemPrompt}
        onValueChange={setSystemPrompt}
        minRows={6}
        description={systemPrompt ? `${systemPrompt.length} characters` : "Optional. Markdown is supported."}
      />
    </div>
  );

  const renderSubAgentsTab = () => {
    const eligibleProfiles = allProfiles.filter(
      (p) => p.id !== initialData?.id && !subAgentIds.includes(p.id)
    );

    return (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-sm">Sub-agents</p>
          <p className="text-[11px] text-default-400 mt-0.5">
            Other agent profiles this agent may delegate tasks to. The agent can invoke
            these sub-agents as tools during execution.
          </p>
        </div>

        {loadingProfiles ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" label="Loading profiles…" />
          </div>
        ) : (
          <>
            {/* Selected sub-agents */}
            {subAgentIds.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-default-600">
                  Selected ({subAgentIds.length})
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {subAgentIds.map((id) => {
                    const profile = allProfiles.find((p) => p.id === id);
                    return (
                      <Chip
                        key={id}
                        size="sm"
                        variant="flat"
                        color="secondary"
                        onClose={() => setSubAgentIds((prev) => prev.filter((sid) => sid !== id))}
                      >
                        {profile?.name ?? id.slice(0, 8)}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Add sub-agent */}
            {eligibleProfiles.length > 0 ? (
              <Select
                label="Add sub-agent"
                placeholder="Select an agent profile…"
                selectedKeys={[]}
                onSelectionChange={(keys) => {
                  const picked = Array.from(keys)[0] as string;
                  if (picked && !subAgentIds.includes(picked)) {
                    setSubAgentIds((prev) => [...prev, picked]);
                  }
                }}
              >
                {eligibleProfiles.map((p) => (
                  <SelectItem key={p.id} textValue={p.name}>
                    <div className="flex flex-col">
                      <span className="text-sm">{p.name}</span>
                      {p.description && (
                        <span className="text-xs text-default-400 truncate">{p.description}</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </Select>
            ) : (
              <p className="text-xs text-default-400 italic">
                {allProfiles.length <= 1
                  ? "No other agent profiles available. Create more profiles to enable delegation."
                  : "All eligible profiles are already selected."}
              </p>
            )}

            {/* Sub-agent summary cards */}
            {subAgentIds.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-default-600">Delegated Agents</p>
                {subAgentIds.map((id) => {
                  const profile = allProfiles.find((p) => p.id === id);
                  if (!profile) return null;
                  return (
                    <Card key={id} className="bg-default-50">
                      <CardBody className="py-2 px-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{profile.name}</p>
                            {profile.description && (
                              <p className="text-xs text-default-400 line-clamp-2 mt-0.5">{profile.description}</p>
                            )}
                            <div className="flex gap-1.5 mt-1 flex-wrap">
                              <Chip size="sm" variant="bordered" className="text-[10px]">
                                {profile.agent_type}
                              </Chip>
                              {profile.llm_model && (
                                <Chip size="sm" variant="bordered" className="text-[10px]">
                                  🧠 {profile.llm_model}
                                </Chip>
                              )}
                              {profile.skills.length > 0 && (
                                <Chip size="sm" variant="bordered" className="text-[10px]">
                                  ⚡ {profile.skills.length} skill{profile.skills.length > 1 ? "s" : ""}
                                </Chip>
                              )}
                            </div>
                          </div>
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            aria-label={`Remove ${profile.name}`}
                            onPress={() => setSubAgentIds((prev) => prev.filter((sid) => sid !== id))}
                          >
                            ✕
                          </Button>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderMcpServersTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">MCP Servers</p>
          <p className="text-[11px] text-default-400">External tool servers using the Model Context Protocol</p>
        </div>
        <Button size="sm" variant="bordered" onPress={addMcp}>+ Add Server</Button>
      </div>

      {mcpServers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-default-400">No MCP servers configured</p>
          <p className="text-xs text-default-300 mt-1">
            Add an MCP server to give the agent access to external tools.
          </p>
        </div>
      )}

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
                {/* Env vars editor */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-default-600">Environment Variables</p>
                    <Button size="sm" variant="flat" onPress={() => addEnvEntry(i)} className="h-6 px-2 text-[10px]">
                      + Add Var
                    </Button>
                  </div>
                  {(mcpEnvEntries[i] ?? []).length === 0 ? (
                    <p className="text-[11px] text-default-400 italic">No env vars.</p>
                  ) : (
                    <div className="space-y-1">
                      {(mcpEnvEntries[i] ?? []).map((entry, ei) => (
                        <div key={ei} className="grid grid-cols-[1fr_1fr_28px] gap-1.5 items-center">
                          <Input
                            size="sm"
                            placeholder="KEY"
                            value={entry.key}
                            onValueChange={(v) => updateEnvEntry(i, ei, { key: v })}
                            aria-label="Env var key"
                          />
                          <Input
                            size="sm"
                            placeholder="value"
                            value={entry.value}
                            onValueChange={(v) => updateEnvEntry(i, ei, { value: v })}
                            aria-label="Env var value"
                          />
                          <button
                            type="button"
                            onClick={() => removeEnvEntry(i, ei)}
                            className="text-danger text-xs leading-none hover:opacity-70"
                            aria-label="Remove env var"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Tool selection */}
            <Divider className="my-1" />
            <McpToolSelector server={s} index={i} updateMcp={updateMcp} />

            <Button size="sm" variant="light" color="danger" onPress={() => removeMcp(i)}>Remove Server</Button>
          </CardBody>
        </Card>
      ))}
    </div>
  );

  const renderSkillsTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">Skills</p>
          <p className="text-[11px] text-default-400">MCP-structured tools the agent can invoke</p>
        </div>
        <Button size="sm" variant="bordered" onPress={addSkill}>+ Add Skill</Button>
      </div>

      {skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-default-400">No custom skills defined</p>
          <p className="text-xs text-default-300 mt-1">
            Skills are custom MCP tools with instructions for the agent.
          </p>
        </div>
      )}

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
            <SchemaPropEditor
              props={skillInputProps[i] ?? []}
              onAdd={() => inputSchemaOps.add(i)}
              onUpdate={(pi, update) => inputSchemaOps.update(i, pi, update)}
              onRemove={(pi) => inputSchemaOps.remove(i, pi)}
              label="Input Parameters (inputSchema)"
            />

            {/* outputSchema property editor */}
            <SchemaPropEditor
              props={skillOutputProps[i] ?? []}
              onAdd={() => outputSchemaOps.add(i)}
              onUpdate={(pi, update) => outputSchemaOps.update(i, pi, update)}
              onRemove={(pi) => outputSchemaOps.remove(i, pi)}
              label="Output Parameters (outputSchema — optional)"
            />

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
    </div>
  );

  const renderStructuredOutputTab = () => (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-sm">Structured Output</p>
        <p className="text-[11px] text-default-400 mt-0.5">
          Define a JSON Schema so the agent returns structured data instead of free-form text.
          Uses the LLM&apos;s <code className="text-[10px]">response_format</code> / <code className="text-[10px]">with_structured_output</code>.
        </p>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={useStructuredOutput}
          onChange={(e) => setUseStructuredOutput(e.target.checked)}
          className="accent-primary"
        />
        <span className="text-sm">Enable structured output</span>
      </label>

      {useStructuredOutput && (
        <>
          <SchemaPropEditor
            props={structuredOutputProps}
            onAdd={() =>
              setStructuredOutputProps((prev) => [
                ...prev,
                { name: "", type: "string", description: "", required: false },
              ])
            }
            onUpdate={(pi, update) =>
              setStructuredOutputProps((prev) =>
                prev.map((p, i) => (i === pi ? { ...p, ...update } : p))
              )
            }
            onRemove={(pi) =>
              setStructuredOutputProps((prev) => prev.filter((_, i) => i !== pi))
            }
            label="Output Schema Properties"
          />

          {structuredOutputProps.filter((p) => p.name.trim()).length > 0 && (
            <Card className="bg-default-50">
              <CardBody className="py-2 px-3">
                <p className="text-[11px] font-medium text-default-600 mb-1">Preview</p>
                <pre className="text-[10px] text-default-500 whitespace-pre-wrap font-mono">
                  {JSON.stringify(schemaPropsToJsonSchema(structuredOutputProps), null, 2)}
                </pre>
              </CardBody>
            </Card>
          )}
        </>
      )}
    </div>
  );

  // ── Tab badges ──────────────────────────────────────────────────────────────

  function tabTitle(label: string, count?: number) {
    return (
      <span className="flex items-center gap-1.5">
        {label}
        {count !== undefined && count > 0 && (
          <Chip size="sm" variant="flat" className="h-4 min-w-4 px-1 text-[10px]">{count}</Chip>
        )}
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs
        aria-label="Agent profile sections"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        variant="underlined"
        classNames={{ tabList: "gap-4" }}
      >
        <Tab key="general" title="General" />
        <Tab key="prompt" title={tabTitle("Prompt", systemPrompt ? 1 : 0)} />
        <Tab key="subagents" title={tabTitle("Sub-agents", subAgentIds.length)} />
        <Tab key="mcp" title={tabTitle("MCP Servers", mcpServers.length)} />
        <Tab key="skills" title={tabTitle("Skills", skills.length)} />
        <Tab key="structured" title={tabTitle("Structured Output", useStructuredOutput ? 1 : 0)} />
      </Tabs>

      <div className="min-h-[300px]">
        {activeTab === "general" && renderGeneralTab()}
        {activeTab === "prompt" && renderSystemPromptTab()}
        {activeTab === "subagents" && renderSubAgentsTab()}
        {activeTab === "mcp" && renderMcpServersTab()}
        {activeTab === "skills" && renderSkillsTab()}
        {activeTab === "structured" && renderStructuredOutputTab()}
      </div>

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

// ── MCP Tool Selector sub-component ───────────────────────────────────────────

/**
 * Allows the user to pick which tools from an MCP server should be exposed
 * to the agent. By default all tools are used. When specific tools are selected,
 * only those are passed to the agent at runtime.
 */
function McpToolSelector({
  server,
  index,
  updateMcp,
}: {
  server: McpServer;
  index: number;
  updateMcp: (i: number, update: Partial<McpServer>) => void;
}) {
  const [toolNames, setToolNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState(false);

  const selectedTools = server.selected_tools ?? [];
  const useAll = selectedTools.length === 0;

  /** Discover available tools by calling the data-api MCP probe endpoint. */
  const discoverTools = async () => {
    setLoading(true);
    setError(null);
    try {
      const names = await discoverMcpTools({
        transport: server.transport,
        command: server.command,
        args: server.args,
        env: server.env,
        url: server.url,
        headers: server.headers,
      });
      setToolNames(names);
      setDiscovered(true);
    } catch {
      setError("Could not discover tools. Save the server config first and check connectivity.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = (name: string, checked: boolean) => {
    let next: string[];
    if (checked) {
      next = [...selectedTools, name];
    } else {
      next = selectedTools.filter((t) => t !== name);
    }
    updateMcp(index, { selected_tools: next.length > 0 ? next : undefined });
  };

  const handleUseAll = () => {
    updateMcp(index, { selected_tools: undefined });
  };

  // If the user already has selected_tools stored, show them even without discovering
  const displayTools = discovered ? toolNames : (selectedTools.length > 0 ? selectedTools : []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-default-600">Tool Selection</p>
        <div className="flex items-center gap-1.5">
          {selectedTools.length > 0 && (
            <Button size="sm" variant="flat" onPress={handleUseAll} className="h-6 px-2 text-[10px]">
              Use All
            </Button>
          )}
          <Button size="sm" variant="flat" onPress={discoverTools} isLoading={loading} className="h-6 px-2 text-[10px]">
            Discover Tools
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-[11px] text-danger">{error}</p>
      )}

      {!discovered && displayTools.length === 0 && !error && (
        <p className="text-[11px] text-default-400 italic">
          {useAll && "All tools from this server will be used. "}Click &quot;Discover Tools&quot; to see available tools and select specific ones.
        </p>
      )}

      {displayTools.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] text-default-400">
            {useAll
              ? `${displayTools.length} tools available — all will be used`
              : `${selectedTools.length} of ${displayTools.length > selectedTools.length ? displayTools.length : selectedTools.length} tools selected`}
          </p>
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg border border-divider p-2">
            {displayTools.map((toolName) => (
              <label
                key={toolName}
                className="flex items-center gap-2 py-0.5 px-1 rounded hover:bg-default-100 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={useAll || selectedTools.includes(toolName)}
                  onChange={(e) => {
                    if (useAll) {
                      // Switching from "all" to specific: select all except this one if unchecking
                      const allExcept = displayTools.filter((t) => t !== toolName);
                      updateMcp(index, { selected_tools: allExcept });
                    } else {
                      handleToggle(toolName, e.target.checked);
                    }
                  }}
                  className="accent-primary"
                />
                <span className="text-xs font-mono">{toolName}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Manual tool name entry */}
      {!discovered && (
        <ManualToolEntry
          selectedTools={selectedTools}
          onAdd={(name) => updateMcp(index, { selected_tools: [...selectedTools, name] })}
          onRemove={(name) => {
            const next = selectedTools.filter((t) => t !== name);
            updateMcp(index, { selected_tools: next.length > 0 ? next : undefined });
          }}
        />
      )}
    </div>
  );
}

/** Allows manually typing tool names when discovery isn't available. */
function ManualToolEntry({
  selectedTools,
  onAdd,
  onRemove,
}: {
  selectedTools: string[];
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [newTool, setNewTool] = useState("");

  const handleAdd = () => {
    const trimmed = newTool.trim();
    if (trimmed && !selectedTools.includes(trimmed)) {
      onAdd(trimmed);
      setNewTool("");
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          size="sm"
          placeholder="Tool name (e.g. read_file)"
          value={newTool}
          onValueChange={setNewTool}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
          aria-label="Add tool name"
          className="flex-1"
        />
        <Button size="sm" variant="flat" onPress={handleAdd} className="h-8 px-2 text-[11px]" isDisabled={!newTool.trim()}>
          Add
        </Button>
      </div>
      {selectedTools.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedTools.map((t) => (
            <Chip key={t} size="sm" variant="flat" color="primary" onClose={() => onRemove(t)}>
              {t}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
