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
  Switch,
} from "../ui";
import {
  getLlmProviders,
  discoverMcpTools,
  upsertWorkspaceAgentOverride,
  deleteWorkspaceAgentOverride,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type {
  AgentBaseProfile,
  AgentOverride,
  AgentOverrideUpsert,
  McpServer,
  McpToolConfig,
  McpToolPermission,
  LlmProviderDefinition,
} from "../../types";
import { McpToolBody } from "../McpToolBody";

interface Props {
  base: AgentBaseProfile;
  existing?: AgentOverride;
  workspaceId: string;
  onSaved: () => void;
  onCancel: () => void;
}

interface EnvEntry { key: string; value: string; }

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

/** Blue dot shown next to a field label when the user has set an override. */
function OverrideDot({ active, onReset }: { active: boolean; onReset: () => void }) {
  if (!active) return null;
  return (
    <button
      type="button"
      onClick={onReset}
      title="Reset to platform default"
      className="inline-flex items-center gap-0.5 ml-1.5 text-primary hover:text-primary/70 transition-colors"
      aria-label="Reset field to platform default"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
      <span className="text-[10px]">×</span>
    </button>
  );
}

export default function AgentOverrideForm({
  base,
  existing,
  workspaceId,
  onSaved,
  onCancel,
}: Props) {
  // LLM fields — null means "use platform default"
  const [llmProvider, setLlmProvider] = useState<string | null>(existing?.llm_provider ?? null);
  const [llmModel, setLlmModel] = useState<string | null>(existing?.llm_model ?? null);
  const [temperature, setTemperature] = useState<number | null>(existing?.llm_temperature ?? null);
  const [maxTokens, setMaxTokens] = useState<string>(
    existing?.llm_max_tokens != null ? String(existing.llm_max_tokens) : ""
  );
  const [topP, setTopP] = useState<string>(
    existing?.llm_top_p != null ? String(existing.llm_top_p) : ""
  );
  const [freqPenalty, setFreqPenalty] = useState<string>(
    existing?.llm_frequency_penalty != null ? String(existing.llm_frequency_penalty) : ""
  );
  const [presPenalty, setPresPenalty] = useState<string>(
    existing?.llm_presence_penalty != null ? String(existing.llm_presence_penalty) : ""
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // System prompt
  const [systemPrompt, setSystemPrompt] = useState<string | null>(existing?.system_prompt ?? null);
  const [systemPromptMode, setSystemPromptMode] = useState<"override" | "extend" | null>(
    (existing?.system_prompt_mode as "override" | "extend" | null) ?? null
  );

  // MCP + Skills
  const [mcpServers, setMcpServers] = useState<McpServer[]>(existing?.mcp_servers ?? []);
  const [mcpEnvEntries, setMcpEnvEntries] = useState<EnvEntry[][]>(
    (existing?.mcp_servers ?? []).map((s) => envRecordToEntries(s.env))
  );
  const [skills, setSkills] = useState(existing?.skills ?? []);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [llmProviders, setLlmProviders] = useState<LlmProviderDefinition[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  useEffect(() => {
    getLlmProviders()
      .then(setLlmProviders)
      .catch(() => {})
      .finally(() => setLoadingProviders(false));
  }, []);

  const effectiveProvider = llmProvider ?? base.llm_provider ?? "";
  const currentProvider = llmProviders.find((p) => p.id === effectiveProvider);
  const isOnPrem = currentProvider?.type === "onprem";

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

  const addSkill = () =>
    setSkills((prev) => [...prev, { name: "", description: "", instructions: "", inputSchema: { type: "object", properties: {}, required: [] } }]);

  const updateSkill = (i: number, update: Partial<typeof skills[0]>) =>
    setSkills((prev) => prev.map((s, j) => (j === i ? { ...s, ...update } : s)));

  const removeSkill = (i: number) =>
    setSkills((prev) => prev.filter((_, j) => j !== i));

  // ── Save / Reset ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: AgentOverrideUpsert = {
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_temperature: temperature,
        llm_max_tokens: maxTokens ? parseInt(maxTokens) : null,
        llm_top_p: topP ? parseFloat(topP) : null,
        llm_frequency_penalty: freqPenalty ? parseFloat(freqPenalty) : null,
        llm_presence_penalty: presPenalty ? parseFloat(presPenalty) : null,
        system_prompt: systemPrompt,
        system_prompt_mode: systemPromptMode,
        mcp_servers: mcpServers.length > 0 ? mcpServers : null,
        skills: skills.length > 0 ? skills : null,
      };
      await upsertWorkspaceAgentOverride(workspaceId, base.id, payload);
      toast.success("Agent customisation saved");
      onSaved();
    } catch {
      toast.error("Failed to save agent customisation");
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    setSaving(true);
    try {
      await deleteWorkspaceAgentOverride(workspaceId, base.id);
      toast.success("Agent reset to platform defaults");
      onSaved();
    } catch {
      toast.error("Failed to reset agent");
    } finally {
      setSaving(false);
    }
  };

  // ── Tab content ──────────────────────────────────────────────────────────────

  const renderGeneralTab = () => (
    <div className="space-y-4">
      {/* Role — read-only */}
      <div className="rounded-lg bg-default-50 px-3 py-2">
        <p className="text-xs text-default-400">Role</p>
        <p className="text-sm font-medium capitalize">{base.role}</p>
        {base.dispatch && (
          <p className="text-[11px] text-default-400 mt-0.5">
            {base.dispatch === "direct" ? "Engaged directly by TEOS" : "Part of workflow pipeline"}
          </p>
        )}
      </div>

      <Divider />
      <p className="font-semibold text-sm">LLM Configuration</p>

      {/* Provider */}
      <div className="relative">
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm text-default-600">Provider</span>
          <OverrideDot active={llmProvider !== null} onReset={() => setLlmProvider(null)} />
        </div>
        <Select
          selectedKeys={effectiveProvider ? [effectiveProvider] : []}
          onSelectionChange={(keys) => {
            const id = Array.from(keys)[0] as string;
            setLlmProvider(id);
            setLlmModel(null);
          }}
          isLoading={loadingProviders}
          placeholder={base.llm_provider ? `${base.llm_provider} (platform default)` : "No default"}
          aria-label="LLM provider"
        >
          {llmProviders.map((p) => (
            <SelectItem key={p.id} textValue={p.name}>
              <span>{p.name}</span>
            </SelectItem>
          ))}
        </Select>
      </div>

      {/* Model */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm text-default-600">Model</span>
          <OverrideDot active={llmModel !== null} onReset={() => setLlmModel(null)} />
        </div>
        {isOnPrem ? (
          <Input
            placeholder={base.llm_model ? `${base.llm_model} (platform default)` : "Model name"}
            value={llmModel ?? ""}
            onValueChange={(v) => setLlmModel(v || null)}
            aria-label="LLM model"
          />
        ) : (
          <Select
            selectedKeys={llmModel ? [llmModel] : []}
            onSelectionChange={(keys) => {
              const val = Array.from(keys)[0] as string;
              setLlmModel(val || null);
            }}
            isDisabled={!currentProvider || currentProvider.models.length === 0}
            placeholder={base.llm_model ? `${base.llm_model} (platform default)` : "Select a model"}
            aria-label="LLM model"
          >
            {(currentProvider?.models ?? []).map((m) => (
              <SelectItem key={m}>{m}</SelectItem>
            ))}
          </Select>
        )}
      </div>

      <Divider />
      <p className="font-semibold text-sm">LLM Parameters</p>

      {/* Temperature */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm text-default-600">Temperature</span>
          <OverrideDot active={temperature !== null} onReset={() => setTemperature(null)} />
        </div>
        <Slider
          step={0.01}
          minValue={0}
          maxValue={2}
          value={temperature ?? (base.llm_temperature ?? 1.0)}
          onChange={(v) => setTemperature(v as number)}
          getValue={(v) => String(v)}
          marks={[
            { value: 0, label: "0" },
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          classNames={{ label: "text-sm" }}
          aria-label="Temperature"
        />
        {temperature === null && base.llm_temperature != null && (
          <p className="text-[11px] text-default-400 mt-0.5">Platform default: {base.llm_temperature}</p>
        )}
      </div>

      {/* Max Tokens */}
      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm text-default-600">Max Tokens</span>
          <OverrideDot active={maxTokens !== ""} onReset={() => setMaxTokens("")} />
        </div>
        <Input
          type="number"
          placeholder={base.llm_max_tokens != null ? `${base.llm_max_tokens} (platform default)` : "model default"}
          value={maxTokens}
          min={1}
          onValueChange={setMaxTokens}
          aria-label="Max tokens"
        />
      </div>

      {/* Advanced */}
      <button
        type="button"
        onClick={() => setShowAdvanced((p) => !p)}
        className="flex items-center gap-1 text-xs text-default-400 hover:text-foreground transition-colors"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform ${showAdvanced ? "rotate-90" : ""}`} aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Advanced sampling parameters
      </button>

      {showAdvanced && (
        <div className="space-y-3 pl-3 border-l-2 border-divider">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-default-600">Top P</span>
              <OverrideDot active={topP !== ""} onReset={() => setTopP("")} />
            </div>
            <Input
              type="number"
              placeholder={base.llm_top_p != null ? `${base.llm_top_p} (platform default)` : "1.0"}
              min={0} max={1} step={0.01}
              value={topP}
              onValueChange={setTopP}
              aria-label="Top P"
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-default-600">Frequency Penalty</span>
              <OverrideDot active={freqPenalty !== ""} onReset={() => setFreqPenalty("")} />
            </div>
            <Input
              type="number"
              placeholder={base.llm_frequency_penalty != null ? `${base.llm_frequency_penalty} (platform default)` : "0"}
              min={-2} max={2} step={0.01}
              value={freqPenalty}
              onValueChange={setFreqPenalty}
              aria-label="Frequency penalty"
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-sm text-default-600">Presence Penalty</span>
              <OverrideDot active={presPenalty !== ""} onReset={() => setPresPenalty("")} />
            </div>
            <Input
              type="number"
              placeholder={base.llm_presence_penalty != null ? `${base.llm_presence_penalty} (platform default)` : "0"}
              min={-2} max={2} step={0.01}
              value={presPenalty}
              onValueChange={setPresPenalty}
              aria-label="Presence penalty"
            />
          </div>
        </div>
      )}
    </div>
  );

  const renderPromptTab = () => (
    <div className="space-y-4">
      <div>
        <p className="font-semibold text-sm">System Prompt</p>
        <p className="text-[11px] text-default-400 mt-0.5">
          Override or extend the platform default system prompt for this agent.
        </p>
      </div>

      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm text-default-600">Mode</span>
          <OverrideDot active={systemPromptMode !== null} onReset={() => setSystemPromptMode(null)} />
        </div>
        <Select
          selectedKeys={systemPromptMode ? [systemPromptMode] : []}
          onSelectionChange={(keys) => {
            const val = Array.from(keys)[0] as "override" | "extend";
            setSystemPromptMode(val || null);
          }}
          placeholder={base.system_prompt_mode ? `${base.system_prompt_mode} (platform default)` : "Select mode"}
          aria-label="System prompt mode"
        >
          <SelectItem key="override">Override — replace built-in prompt</SelectItem>
          <SelectItem key="extend">Extend — append to built-in prompt</SelectItem>
        </Select>
      </div>

      <div>
        <div className="flex items-center gap-1 mb-1">
          <span className="text-sm text-default-600">System Prompt</span>
          <OverrideDot active={systemPrompt !== null} onReset={() => setSystemPrompt(null)} />
        </div>
        <Textarea
          placeholder={
            base.system_prompt
              ? "(Platform default prompt is set — enter text to override)"
              : "Enter custom system prompt…"
          }
          value={systemPrompt ?? ""}
          onValueChange={(v) => setSystemPrompt(v || null)}
          minRows={6}
          description={systemPrompt ? `${systemPrompt.length} characters` : "Leave blank to use platform default."}
          aria-label="System prompt"
        />
      </div>
    </div>
  );

  const renderMcpServersTab = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm">MCP Servers</p>
          <p className="text-[11px] text-default-400">
            Override the platform default MCP servers for this agent.
          </p>
        </div>
        <Button size="sm" variant="bordered" onPress={addMcp}>+ Add Server</Button>
      </div>

      {mcpServers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-default-400">Using platform default MCP servers</p>
          <p className="text-xs text-default-300 mt-1">
            Add a server to override the platform configuration.
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
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-default-600">Environment Variables</p>
                    <Button size="sm" variant="flat" onPress={() => addEnvEntry(i)} className="h-6 px-2 text-[10px]">+ Add Var</Button>
                  </div>
                  {(mcpEnvEntries[i] ?? []).map((entry, ei) => (
                    <div key={ei} className="grid grid-cols-[1fr_1fr_28px] gap-1.5 items-center">
                      <Input size="sm" placeholder="KEY" value={entry.key} onValueChange={(v) => updateEnvEntry(i, ei, { key: v })} aria-label="Env var key" />
                      <Input size="sm" placeholder="value" value={entry.value} onValueChange={(v) => updateEnvEntry(i, ei, { value: v })} aria-label="Env var value" />
                      <button type="button" onClick={() => removeEnvEntry(i, ei)} className="text-danger text-xs leading-none hover:opacity-70" aria-label="Remove env var">✕</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <Divider className="my-1" />
            <McpToolSelectorOverride server={s} index={i} updateMcp={updateMcp} />
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
          <p className="text-[11px] text-default-400">Override the platform default skills for this agent.</p>
        </div>
        <Button size="sm" variant="bordered" onPress={addSkill}>+ Add Skill</Button>
      </div>

      {skills.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-sm text-default-400">Using platform default skills</p>
          <p className="text-xs text-default-300 mt-1">Add a skill to override the platform configuration.</p>
        </div>
      )}

      {skills.map((s, i) => (
        <Card key={i} className="bg-default-50">
          <CardBody className="space-y-3 py-3">
            <div className="grid grid-cols-2 gap-2">
              <Input size="sm" label="Tool Name (snake_case)" placeholder="run_tests" value={s.name} onValueChange={(v) => updateSkill(i, { name: v })} />
            </div>
            <Input size="sm" label="Description" value={s.description} onValueChange={(v) => updateSkill(i, { description: v })} />
            <Button size="sm" variant="light" color="danger" onPress={() => removeSkill(i)}>Remove Skill</Button>
          </CardBody>
        </Card>
      ))}
    </div>
  );

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

  const hasAnyOverride = Boolean(
    llmProvider || llmModel || temperature !== null ||
    maxTokens || topP || freqPenalty || presPenalty ||
    systemPrompt || systemPromptMode ||
    mcpServers.length > 0 || skills.length > 0
  );

  return (
    <div className="space-y-4">
      <Tabs
        aria-label="Agent customisation sections"
        selectedKey={activeTab}
        onSelectionChange={(key) => setActiveTab(key as string)}
        variant="underlined"
        classNames={{ tabList: "gap-4" }}
      >
        <Tab key="general" title="General" />
        <Tab key="prompt" title={tabTitle("Prompt", systemPrompt ? 1 : 0)} />
        <Tab key="mcp" title={tabTitle("MCP Servers", mcpServers.length)} />
        <Tab key="skills" title={tabTitle("Skills", skills.length)} />
      </Tabs>

      <div className="min-h-[300px]">
        {activeTab === "general" && renderGeneralTab()}
        {activeTab === "prompt" && renderPromptTab()}
        {activeTab === "mcp" && renderMcpServersTab()}
        {activeTab === "skills" && renderSkillsTab()}
      </div>

      <Divider />
      <div className="flex items-center justify-between pb-2">
        <div className="flex gap-2">
          <Button color="primary" isLoading={saving} onPress={handleSave}>
            Save Changes
          </Button>
          <Button variant="light" onPress={onCancel}>Cancel</Button>
        </div>
        {hasAnyOverride && existing && (
          <Button variant="flat" color="danger" size="sm" isLoading={saving} onPress={handleResetAll}>
            Reset all overrides
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Minimal MCP tool selector (reused from AgentProfileForm pattern) ──────────

const PERMISSION_OPTIONS: { value: McpToolPermission; label: string }[] = [
  { value: "read", label: "read" },
  { value: "write", label: "write" },
  { value: "execute", label: "execute" },
  { value: "require-confirmation", label: "confirm" },
];

function McpToolSelectorOverride({
  server,
  index,
  updateMcp,
}: {
  server: McpServer;
  index: number;
  updateMcp: (i: number, update: Partial<McpServer>) => void;
}) {
  const [discovering, setDiscovering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newToolName, setNewToolName] = useState("");

  const tools = server.tools ?? [];
  const setTools = (next: McpToolConfig[]) => updateMcp(index, { tools: next });

  const handleDiscover = async () => {
    setDiscovering(true);
    setError(null);
    try {
      const discovered = await discoverMcpTools({
        transport: server.transport,
        url: server.url,
        headers: server.headers,
        command: server.transport === "stdio" ? server.command : undefined,
        args: server.transport === "stdio" ? server.args : undefined,
        env: server.transport === "stdio" ? server.env : undefined,
      });
      if (discovered.length === 0) { setError("The server returned an empty tools list."); return; }
      const existingMap = new Map(tools.map((t) => [t.name, t]));
      setTools(discovered.map((d) => {
        const ex = existingMap.get(d.name);
        return ex
          ? { ...ex, description: d.description, inputSchema: d.inputSchema, annotations: d.annotations }
          : { name: d.name, description: d.description, inputSchema: d.inputSchema, annotations: d.annotations, allowed: true };
      }));
    } catch {
      setError("Could not discover tools. Check the server URL and connectivity.");
    } finally {
      setDiscovering(false);
    }
  };

  const addManual = () => {
    const trimmed = newToolName.trim();
    if (!trimmed || tools.some((t) => t.name === trimmed)) return;
    setTools([...tools, { name: trimmed, allowed: true }]);
    setNewToolName("");
  };

  const updateTool = (i: number, patch: Partial<McpToolConfig>) =>
    setTools(tools.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const removeTool = (i: number) => setTools(tools.filter((_, idx) => idx !== i));

  const togglePermission = (toolIdx: number, perm: McpToolPermission) => {
    const current = tools[toolIdx].permissions ?? [];
    updateTool(toolIdx, {
      permissions: current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm],
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium text-default-600">
          Tool Access
          {tools.length > 0 ? ` (${tools.filter((t) => t.allowed).length}/${tools.length} allowed)` : " (all tools)"}
        </p>
        <div className="flex items-center gap-1.5">
          {tools.length > 0 && (
            <Button size="sm" variant="flat" onPress={() => setTools([])} color="danger" className="h-6 px-2 text-[10px]">Clear</Button>
          )}
          <Button
            size="sm" variant="flat" onPress={handleDiscover} isLoading={discovering}
            isDisabled={server.transport === "streamable-http" ? !server.url : !server.command}
            className="h-6 px-2 text-[10px]"
          >
            {discovering ? "Discovering…" : "Fetch tools"}
          </Button>
        </div>
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}
      {tools.length > 0 && (
        <div className="max-h-[32rem] overflow-y-auto space-y-2 pr-0.5">
          {tools.map((tool, ti) => (
            <div key={ti} className="rounded-xl border border-divider bg-background/40 p-3 space-y-3">
              <div className="flex items-center gap-2">
                <Switch size="sm" isSelected={tool.allowed} onValueChange={(v) => updateTool(ti, { allowed: v })} color={tool.allowed ? "success" : "danger"} aria-label={`${tool.allowed ? "Allow" : "Deny"} ${tool.name}`} />
                <span className="font-mono text-xs font-semibold flex-1 truncate">{tool.name}</span>
                <Chip size="sm" variant="flat" color={tool.allowed ? "success" : "danger"} className="shrink-0 h-5 text-[10px]">{tool.allowed ? "allowed" : "blocked"}</Chip>
                <button type="button" onClick={() => removeTool(ti)} className="text-default-400 hover:text-danger transition-colors" aria-label="Remove tool">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <McpToolBody tool={tool} />
              <div className="flex flex-wrap gap-1 pt-1 border-t border-divider">
                {PERMISSION_OPTIONS.map(({ value, label }) => {
                  const active = (tool.permissions ?? []).includes(value);
                  return (
                    <Chip key={value} size="sm" variant={active ? "solid" : "bordered"} color={active ? "primary" : "default"} className="cursor-pointer select-none" onClick={() => togglePermission(ti, value)}>{label}</Chip>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <Input
          size="sm" placeholder="Tool name (e.g. read_file)" value={newToolName} onValueChange={setNewToolName}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addManual(); } }}
          aria-label="Add tool name manually" className="flex-1"
        />
        <Button size="sm" variant="flat" onPress={addManual} className="h-8 px-2 text-[11px]" isDisabled={!newToolName.trim()}>Add</Button>
      </div>
    </div>
  );
}
