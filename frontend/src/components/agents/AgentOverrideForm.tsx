import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Slider,
  Textarea,
  Divider,
  Chip,
  Tabs,
  Tab,
} from "../ui";
import {
  getLlmProviders,
  listLibraryMCPs,
  listLibrarySkills,
  upsertWorkspaceAgentOverride,
  deleteWorkspaceAgentOverride,
  upsertAgentOverride,
  deleteAgentOverride,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import type {
  AgentBaseProfile,
  AgentOverride,
  AgentOverrideUpsert,
  InlineSkill,
  LibraryMCP,
  LibrarySkill,
  LlmProviderDefinition,
  McpServer,
} from "../../types";

interface Props {
  base: AgentBaseProfile;
  existing?: AgentOverride;
  /** When empty, uses global (non-workspace-scoped) endpoints. */
  workspaceId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

/** Snapshot a Library MCP entry into the inline McpServer shape stored on the override. */
function libraryMcpToServer(m: LibraryMCP): McpServer {
  const base: McpServer = {
    name: m.name,
    transport: m.transport,
  };
  if (m.transport === "stdio") {
    if (m.command) base.command = m.command;
    if (m.args && m.args.length) base.args = m.args;
    if (m.env && Object.keys(m.env).length) base.env = m.env;
  } else {
    if (m.url) base.url = m.url;
    if (m.headers && Object.keys(m.headers).length) base.headers = m.headers;
  }
  return base;
}

function librarySkillToInline(s: LibrarySkill): InlineSkill {
  return {
    name: s.name,
    description: s.description,
    content: s.content,
  };
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
  const [llmBaseUrl, setLlmBaseUrl] = useState<string | null>(existing?.llm_base_url ?? null);
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

  // MCP + Skills (snapshots picked from the workspace Library)
  const [mcpServers, setMcpServers] = useState<McpServer[]>(existing?.mcp_servers ?? []);
  const [skills, setSkills] = useState<InlineSkill[]>(existing?.skills ?? []);

  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("general");
  const [llmProviders, setLlmProviders] = useState<LlmProviderDefinition[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  // Library catalog (loaded once)
  const [libraryMcps, setLibraryMcps] = useState<LibraryMCP[]>([]);
  const [librarySkills, setLibrarySkills] = useState<LibrarySkill[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);

  useEffect(() => {
    getLlmProviders()
      .then(setLlmProviders)
      .catch(() => {})
      .finally(() => setLoadingProviders(false));
  }, []);

  useEffect(() => {
    Promise.all([listLibraryMCPs(), listLibrarySkills()])
      .then(([mcps, sk]) => { setLibraryMcps(mcps); setLibrarySkills(sk); })
      .catch(() => {})
      .finally(() => setLoadingLibrary(false));
  }, []);

  const effectiveProvider = llmProvider ?? base.llm_provider ?? "";
  const currentProvider = llmProviders.find((p) => p.id === effectiveProvider);
  const isOnPrem = currentProvider?.type === "onprem";
  const needsBaseUrl =
    currentProvider?.needs_base_url ??
    ["ollama", "vllm", "lmstudio"].includes(effectiveProvider);

  // ── Library picker helpers ───────────────────────────────────────────────────

  const addMcpFromLibrary = (id: string) => {
    const lib = libraryMcps.find((m) => m.id === id);
    if (!lib) return;
    if (mcpServers.some((s) => s.name === lib.name)) {
      toast.error(`"${lib.name}" is already attached`);
      return;
    }
    setMcpServers((prev) => [...prev, libraryMcpToServer(lib)]);
  };

  const removeMcp = (i: number) =>
    setMcpServers((prev) => prev.filter((_, j) => j !== i));

  const addSkillFromLibrary = (id: string) => {
    const lib = librarySkills.find((s) => s.id === id);
    if (!lib) return;
    if (skills.some((s) => s.name === lib.name)) {
      toast.error(`"${lib.name}" is already attached`);
      return;
    }
    setSkills((prev) => [...prev, librarySkillToInline(lib)]);
  };

  const removeSkill = (i: number) =>
    setSkills((prev) => prev.filter((_, j) => j !== i));

  // ── Save / Reset ──────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: AgentOverrideUpsert = {
        llm_provider: llmProvider,
        llm_model: llmModel,
        llm_base_url: llmBaseUrl,
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
      if (workspaceId) {
        await upsertWorkspaceAgentOverride(workspaceId, base.id, payload);
      } else {
        await upsertAgentOverride(base.id, payload);
      }
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
      if (workspaceId) {
        await deleteWorkspaceAgentOverride(workspaceId, base.id);
      } else {
        await deleteAgentOverride(base.id);
      }
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
            placeholder={base.llm_model ? `${base.llm_model} (platform default)` : "e.g. llama3, mistral, phi3"}
            value={llmModel ?? ""}
            onValueChange={(v) => setLlmModel(v || null)}
            aria-label="LLM model"
            description="Enter the model name as it appears in your local server."
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

      {/* Base URL — shown for on-prem / OpenAI-compat providers */}
      {needsBaseUrl && (
        <div>
          <div className="flex items-center gap-1 mb-1">
            <span className="text-sm text-default-600">Base URL</span>
            <OverrideDot active={llmBaseUrl !== null} onReset={() => setLlmBaseUrl(null)} />
          </div>
          <Input
            placeholder={base.llm_base_url ? `${base.llm_base_url} (platform default)` : "http://localhost:11434/v1"}
            value={llmBaseUrl ?? ""}
            onValueChange={(v) => setLlmBaseUrl(v || null)}
            aria-label="LLM base URL"
            description="Endpoint the agent will use to reach this provider."
          />
        </div>
      )}

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

  const renderMcpServersTab = () => {
    const available = libraryMcps.filter(
      (m) => !mcpServers.some((s) => s.name === m.name)
    );
    return (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-sm">MCP Servers</p>
          <p className="text-[11px] text-default-400 mt-0.5">
            Attach MCP servers from your{" "}
            <a
              href="/library"
              className="text-primary hover:underline"
              onClick={(e) => { e.preventDefault(); window.location.href = "/library"; }}
            >
              workspace Library
            </a>
            . New servers can only be defined in the Library.
          </p>
        </div>

        <Select
          placeholder={
            loadingLibrary
              ? "Loading library…"
              : libraryMcps.length === 0
                ? "No MCP servers in the Library yet"
                : available.length === 0
                  ? "All library servers already attached"
                  : "+ Add server from Library"
          }
          selectedKeys={[]}
          isDisabled={loadingLibrary || available.length === 0}
          onSelectionChange={(keys) => {
            const id = Array.from(keys)[0] as string;
            if (id) addMcpFromLibrary(id);
          }}
          aria-label="Add MCP server from library"
        >
          {available.map((m) => (
            <SelectItem key={m.id} textValue={m.name}>
              <div className="flex flex-col py-0.5">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-[11px] text-default-400 truncate">
                  {m.transport === "stdio"
                    ? `stdio · ${m.command ?? ""}${m.args?.length ? " " + m.args.join(" ") : ""}`
                    : `http · ${m.url ?? ""}`}
                </span>
              </div>
            </SelectItem>
          ))}
        </Select>

        {mcpServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-default-400">Using platform default MCP servers</p>
            <p className="text-xs text-default-300 mt-1">
              Attach a server from the Library to override the platform configuration.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {mcpServers.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-divider bg-default-50 px-3 py-2.5"
              >
                <i
                  className={`fa-solid ${s.transport === "stdio" ? "fa-terminal" : "fa-globe"} text-primary mt-0.5`}
                  aria-hidden="true"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-[11px] text-default-400 font-mono truncate">
                    {s.transport === "stdio"
                      ? `${s.command ?? ""}${s.args?.length ? " " + s.args.join(" ") : ""}`
                      : (s.url ?? "")}
                  </p>
                </div>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  onPress={() => removeMcp(i)}
                  aria-label={`Detach ${s.name}`}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderSkillsTab = () => {
    const available = librarySkills.filter(
      (s) => !skills.some((existing) => existing.name === s.name)
    );
    return (
      <div className="space-y-4">
        <div>
          <p className="font-semibold text-sm">Skills</p>
          <p className="text-[11px] text-default-400 mt-0.5">
            Attach skills from your{" "}
            <a
              href="/library"
              className="text-primary hover:underline"
              onClick={(e) => { e.preventDefault(); window.location.href = "/library"; }}
            >
              workspace Library
            </a>
            . New skills can only be authored in the Library.
          </p>
        </div>

        <Select
          placeholder={
            loadingLibrary
              ? "Loading library…"
              : librarySkills.length === 0
                ? "No skills in the Library yet"
                : available.length === 0
                  ? "All library skills already attached"
                  : "+ Add skill from Library"
          }
          selectedKeys={[]}
          isDisabled={loadingLibrary || available.length === 0}
          onSelectionChange={(keys) => {
            const id = Array.from(keys)[0] as string;
            if (id) addSkillFromLibrary(id);
          }}
          aria-label="Add skill from library"
        >
          {available.map((s) => (
            <SelectItem key={s.id} textValue={s.name}>
              <div className="flex flex-col py-0.5">
                <span className="text-sm font-medium">{s.name}</span>
                {s.description && (
                  <span className="text-[11px] text-default-400 truncate">{s.description}</span>
                )}
              </div>
            </SelectItem>
          ))}
        </Select>

        {skills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <p className="text-sm text-default-400">Using platform default skills</p>
            <p className="text-xs text-default-300 mt-1">
              Attach a skill from the Library to override the platform configuration.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {skills.map((s, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-xl border border-divider bg-default-50 px-3 py-2.5"
              >
                <i className="fa-solid fa-bolt text-primary mt-0.5" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  {s.description && (
                    <p className="text-[11px] text-default-400 truncate">{s.description}</p>
                  )}
                </div>
                <Button
                  isIconOnly
                  size="sm"
                  variant="light"
                  color="danger"
                  onPress={() => removeSkill(i)}
                  aria-label={`Detach ${s.name}`}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

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
    llmProvider || llmModel || llmBaseUrl || temperature !== null ||
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

      <div className="modal-actions" data-align="between">
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
