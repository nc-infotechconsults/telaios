import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Select,
  SelectItem,
  Slider,
  Textarea,
} from "@heroui/react";
import { createLibraryAgent, updateLibraryAgent, getLlmProviders } from "../../lib/api";
import { toast } from "../../lib/toast";
import type { AgentRole, InlineSkill, LibraryAgent, LlmProviderDefinition, McpServer } from "../../types";
import SubAgentEditor from "./SubAgentEditor";
import McpServerEditor from "./McpServerEditor";
import InlineSkillEditor from "./InlineSkillEditor";

const ROLE_OPTIONS: AgentRole[] = [
  "planner",
  "coder",
  "reviewer",
  "tester",
  "infra",
  "knowledge",
  "custom",
];

const PROMPT_MODE_OPTIONS = [
  { key: "append", label: "Append (extend default)" },
  { key: "override", label: "Override (replace default)" },
];

interface Props {
  initialData?: LibraryAgent;
  onSaved: (agent: LibraryAgent) => void;
  onCancel: () => void;
}

/**
 * Create / edit form for a LibraryAgent.
 * When `initialData` is provided the form is in edit mode.
 */
export default function LibraryAgentForm({ initialData, onSaved, onCancel }: Props) {
  const isEdit = !!initialData;

  const [name, setName] = useState(initialData?.name ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [role, setRole] = useState<AgentRole>(initialData?.role ?? "custom");
  const [systemPromptMode, setSystemPromptMode] = useState<"append" | "override">(
    initialData?.system_prompt_mode ?? "append",
  );
  const [systemPrompt, setSystemPrompt] = useState(initialData?.system_prompt ?? "");
  const [llmProvider, setLlmProvider] = useState(initialData?.llm_provider ?? "");
  const [llmModel, setLlmModel] = useState(initialData?.llm_model ?? "");
  const [llmProviders, setLlmProviders] = useState<LlmProviderDefinition[]>([]);

  useEffect(() => {
    getLlmProviders().then(setLlmProviders).catch(() => {});
  }, []);
  const [temperature, setTemperature] = useState<number>(
    initialData?.llm_temperature ?? 1.0,
  );
  const [maxTokens, setMaxTokens] = useState(
    initialData?.llm_max_tokens != null ? String(initialData.llm_max_tokens) : "",
  );
  const [tagsRaw, setTagsRaw] = useState((initialData?.tags ?? []).join(", "));
  const [subAgents, setSubAgents] = useState(initialData?.sub_agents ?? []);
  const [mcpServers, setMcpServers] = useState<McpServer[]>(initialData?.mcp_servers ?? []);
  const [skills, setSkills] = useState<InlineSkill[]>(initialData?.skills ?? []);

  const [saving, setSaving] = useState(false);

  const toSlug = (s: string) =>
    s
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const tags = tagsRaw
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const payload: Partial<LibraryAgent> = {
        name: name.trim(),
        ...(!isEdit ? { slug: toSlug(name) } : {}),
        description: description.trim(),
        role,
        system_prompt_mode: systemPromptMode,
        system_prompt: systemPrompt.trim() || null,
        ...(llmProvider.trim() ? { llm_provider: llmProvider.trim() } : {}),
        ...(llmModel.trim() ? { llm_model: llmModel.trim() } : {}),
        llm_temperature: temperature,
        llm_max_tokens: maxTokens !== "" ? Number(maxTokens) : null,
        tags,
        sub_agents: subAgents,
        mcp_servers: mcpServers,
        skills,
      };

      const saved = isEdit
        ? await updateLibraryAgent(initialData.id, payload)
        : await createLibraryAgent(payload);

      toast.success(isEdit ? "Agent updated" : "Agent created", saved.name);
      onSaved(saved);
    } catch {
      toast.error(isEdit ? "Failed to update agent" : "Failed to create agent");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Input
        autoFocus
        isRequired
        label="Name"
        placeholder="e.g. Senior Python Coder"
        value={name}
        onValueChange={setName}
        isDisabled={saving}
      />

      <Textarea
        label="Description"
        placeholder="What does this agent specialise in?"
        value={description}
        onValueChange={setDescription}
        isDisabled={saving}
        minRows={2}
      />

      <div className="flex gap-3">
        <Select
          label="Role"
          selectedKeys={new Set([role])}
          onSelectionChange={(keys) => setRole(Array.from(keys)[0] as AgentRole)}
          isDisabled={saving}
          className="flex-1"
        >
          {ROLE_OPTIONS.map((r) => (
            <SelectItem key={r}>{r}</SelectItem>
          ))}
        </Select>

        <Select
          label="Prompt mode"
          selectedKeys={new Set([systemPromptMode])}
          onSelectionChange={(keys) =>
            setSystemPromptMode(Array.from(keys)[0] as "append" | "override")
          }
          isDisabled={saving}
          className="flex-1"
        >
          {PROMPT_MODE_OPTIONS.map((o) => (
            <SelectItem key={o.key}>{o.label}</SelectItem>
          ))}
        </Select>
      </div>

      <Textarea
        label="System prompt"
        placeholder="Instructions for this agent…"
        value={systemPrompt}
        onValueChange={setSystemPrompt}
        isDisabled={saving}
        minRows={3}
      />

      <div className="flex gap-3">
        <Select
          label="LLM provider"
          selectedKeys={llmProvider ? [llmProvider] : []}
          onSelectionChange={(keys) => {
            const id = Array.from(keys)[0] as string;
            setLlmProvider(id);
            setLlmModel("");
          }}
          isDisabled={saving}
          className="flex-1"
          isLoading={llmProviders.length === 0}
        >
          {llmProviders.map((p) => (
            <SelectItem key={p.id} textValue={p.name}>
              <div className="flex items-center gap-2">
                <span>{p.name}</span>
                {p.type === "onprem" && (
                  <span className="text-[10px] text-default-400 border border-divider rounded px-1">on-prem</span>
                )}
              </div>
            </SelectItem>
          ))}
        </Select>

        {(() => {
          const currentProvider = llmProviders.find((p) => p.id === llmProvider);
          const isOnPrem = currentProvider?.type === "onprem";
          if (isOnPrem || !currentProvider) {
            return (
              <Input
                label="LLM model"
                placeholder={isOnPrem ? "e.g. llama3, mistral" : "e.g. gpt-4o"}
                value={llmModel}
                onValueChange={setLlmModel}
                isDisabled={saving}
                className="flex-1"
              />
            );
          }
          return (
            <Select
              label="LLM model"
              selectedKeys={llmModel ? [llmModel] : []}
              onSelectionChange={(keys) => setLlmModel(Array.from(keys)[0] as string)}
              isDisabled={saving || currentProvider.models.length === 0}
              placeholder="Select a model"
              className="flex-1"
            >
              {currentProvider.models.map((m) => (
                <SelectItem key={m}>{m}</SelectItem>
              ))}
            </Select>
          );
        })()}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm text-foreground">Temperature</span>
          <Input
            aria-label="Temperature value"
            type="number"
            min={0}
            max={2}
            step={0.01}
            value={String(temperature)}
            onValueChange={(v) => {
              const n = parseFloat(v);
              if (!isNaN(n)) setTemperature(Math.min(2, Math.max(0, n)));
            }}
            isDisabled={saving}
            className="w-20"
            size="sm"
          />
        </div>
        <Slider
          aria-label="Temperature"
          step={0.01}
          minValue={0}
          maxValue={2}
          value={temperature}
          onChange={(v) => setTemperature(v as number)}
          marks={[
            { value: 0, label: "0" },
            { value: 1, label: "1" },
            { value: 2, label: "2" },
          ]}
          isDisabled={saving}
        />
      </div>

      <Input
        label="Max tokens"
        placeholder="e.g. 4096"
        type="number"
        min={1}
        value={maxTokens}
        onValueChange={setMaxTokens}
        isDisabled={saving}
      />

      <Input
        label="Tags"
        placeholder="Comma-separated, e.g. python, testing, security"
        value={tagsRaw}
        onValueChange={setTagsRaw}
        isDisabled={saving}
      />

      {/* Sub-agents */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">Sub-agents</p>
        <SubAgentEditor value={subAgents} onChange={setSubAgents} />
      </div>

      {/* MCP Servers */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">MCP Servers</p>
        <McpServerEditor value={mcpServers} onChange={setMcpServers} />
      </div>

      {/* Skills */}
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-foreground">Skills</p>
        <InlineSkillEditor value={skills} onChange={setSkills} />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="light" onPress={onCancel} isDisabled={saving}>
          Cancel
        </Button>
        <Button
          color="primary"
          onPress={handleSave}
          isLoading={saving}
          isDisabled={!name.trim()}
        >
          {isEdit ? "Save changes" : "Create agent"}
        </Button>
      </div>

      {saving && (
        <div className="flex justify-center">
          <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
