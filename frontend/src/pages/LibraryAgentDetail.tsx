import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Chip,
  Modal,
  ModalBody,
  ModalContent,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
} from "@heroui/react";
import {
  cloneProjectAgentFromLibrary,
  getLibraryAgent,
  getProjects,
} from "../lib/api";
import { toast } from "../lib/toast";
import type { AgentRole, LibraryAgent, Project } from "../types";
import LibraryAgentForm from "../components/library/LibraryAgentForm";

const ROLE_COLOR: Record<
  AgentRole,
  "warning" | "success" | "primary" | "secondary" | "danger" | "default"
> = {
  planner: "primary",
  coder: "success",
  reviewer: "warning",
  tester: "secondary",
  infra: "danger",
  knowledge: "default",
  custom: "default",
  "document-copilot": "default",
};

const BackIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

const EditIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
    <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
    <path d="M19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
  </svg>
);

export default function LibraryAgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<LibraryAgent | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  // Add to project modal
  const [addOpen, setAddOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!agentId) return;
    setLoading(true);
    getLibraryAgent(agentId)
      .then(setAgent)
      .catch(() => toast.error("Failed to load agent"))
      .finally(() => setLoading(false));
  }, [agentId]);

  useEffect(() => {
    if (!addOpen || projects.length > 0) return;
    setProjectsLoading(true);
    getProjects()
      .then(setProjects)
      .catch(() => toast.error("Failed to load projects"))
      .finally(() => setProjectsLoading(false));
  }, [addOpen, projects.length]);

  const handleAddToProject = async () => {
    if (!agentId || !selectedProjectId) return;
    setAdding(true);
    try {
      await cloneProjectAgentFromLibrary(selectedProjectId, agentId);
      toast.success("Agent added to project", agent?.name ?? "");
      setAddOpen(false);
      navigate(`/projects/${selectedProjectId}`);
    } catch {
      toast.error("Failed to add agent to project");
    } finally {
      setAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" label="Loading agent…" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-default-400">
        <p>Agent not found.</p>
        <Button variant="flat" onPress={() => navigate("/library")}>Back to Library</Button>
      </div>
    );
  }

  // ── Edit mode ─────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div className="flex flex-col gap-6 w-full">
        {/* Top bar */}
        <div className="flex items-center gap-3">
          <Button
            size="sm"
            variant="flat"
            startContent={BackIcon}
            onPress={() => setEditing(false)}
          >
            Back to details
          </Button>
          <span className="text-sm text-default-400 truncate">{agent.name}</span>
        </div>
        <LibraryAgentForm
          initialData={agent}
          onSaved={(saved) => {
            setAgent(saved);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  // ── View mode ──────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 w-full">

      {/* Top bar: back + actions */}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="flat"
          startContent={BackIcon}
          onPress={() => navigate("/library")}
        >
          Library
        </Button>
        <span className="text-default-300">/</span>
        <span className="text-sm font-medium truncate flex-1">{agent.name}</span>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="flat" startContent={EditIcon} onPress={() => setEditing(true)}>
            Edit
          </Button>
          <Button size="sm" color="primary" onPress={() => setAddOpen(true)}>
            + Add to Project
          </Button>
        </div>
      </div>

      {/* Two-column layout: main content + sidebar */}
      <div className="flex gap-6 items-start">

        {/* ── Main column ── */}
        <div className="flex flex-col gap-5 flex-1 min-w-0">

          {/* Identity card */}
          <div className="bg-content1 border border-divider rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold">{agent.name}</h1>
              <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"}>{agent.role}</Chip>
            </div>
            {agent.published_by && (
              <p className="text-sm text-default-400">by {agent.published_by}</p>
            )}
            {agent.description && (
              <p className="text-sm text-default-600">{agent.description}</p>
            )}
            {agent.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {agent.tags.map((tag) => (
                  <Chip key={tag} size="sm" variant="flat">{tag}</Chip>
                ))}
              </div>
            )}
          </div>

          {/* System prompt */}
          {agent.system_prompt && (
            <div className="bg-content1 border border-divider rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">System Prompt</h2>
                <Chip size="sm" variant="flat" className="text-xs">{agent.system_prompt_mode}</Chip>
              </div>
              <pre className="text-xs bg-default-100 rounded-xl p-3 whitespace-pre-wrap font-mono overflow-auto max-h-64">
                {agent.system_prompt}
              </pre>
            </div>
          )}

          {/* MCP Servers */}
          {agent.mcp_servers.length > 0 && (
            <div className="bg-content1 border border-divider rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
              <h2 className="text-sm font-semibold">MCP Servers ({agent.mcp_servers.length})</h2>
              <div className="flex flex-col gap-2">
                {agent.mcp_servers.map((mcp, i) => (
                  <div key={i} className="flex items-center gap-2 p-3 rounded-xl border border-divider bg-default-50 text-sm">
                    <span className="font-medium flex-1">{mcp.name}</span>
                    <Chip size="sm" variant="flat" className="font-mono text-xs">{mcp.transport}</Chip>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          {agent.skills.length > 0 && (
            <div className="bg-content1 border border-divider rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
              <h2 className="text-sm font-semibold">Skills ({agent.skills.length})</h2>
              <div className="flex flex-col gap-2">
                {agent.skills.map((skill, i) => (
                  <div key={i} className="flex flex-col gap-0.5 p-3 rounded-xl border border-divider bg-default-50 text-sm">
                    <p className="font-medium">{skill.name}</p>
                    {skill.description && <p className="text-xs text-default-400">{skill.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sub-agents */}
          {agent.sub_agents.length > 0 && (
            <div className="bg-content1 border border-divider rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
              <h2 className="text-sm font-semibold">Sub-agents ({agent.sub_agents.length})</h2>
              <div className="flex flex-col gap-2">
                {agent.sub_agents.map((sa, i) => (
                  <div key={i} className="flex flex-col gap-0.5 p-3 rounded-xl border border-divider bg-default-50 text-sm">
                    <p className="font-medium font-mono text-xs">{sa.tool_name}</p>
                    <p className="text-xs text-default-400">{sa.tool_description}</p>
                    <p className="text-xs text-default-300 font-mono">{sa.agent_id}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="flex flex-col gap-4 w-72 shrink-0">

          {/* Meta */}
          <div className="bg-content1 border border-divider rounded-2xl p-4 flex flex-col gap-3 shadow-sm text-sm">
            <h2 className="text-xs font-semibold text-default-400 uppercase tracking-wide">Details</h2>
            <div className="flex flex-col gap-2">
              <div className="flex justify-between">
                <span className="text-default-400">Version</span>
                <span className="font-mono">v{agent.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-400">Usage</span>
                <span>{agent.usage_count} use{agent.usage_count !== 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-400">Created</span>
                <span>{new Date(agent.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-default-400">Type</span>
                <span>{agent.agent_type}</span>
              </div>
            </div>
          </div>

          {/* LLM Config */}
          {(agent.llm_provider || agent.llm_model) && (
            <div className="bg-content1 border border-divider rounded-2xl p-4 flex flex-col gap-3 shadow-sm text-sm">
              <h2 className="text-xs font-semibold text-default-400 uppercase tracking-wide">LLM Configuration</h2>
              <div className="flex flex-col gap-2">
                {agent.llm_provider && (
                  <div className="flex justify-between">
                    <span className="text-default-400">Provider</span>
                    <span>{agent.llm_provider}</span>
                  </div>
                )}
                {agent.llm_model && (
                  <div className="flex justify-between">
                    <span className="text-default-400">Model</span>
                    <span className="font-mono text-xs">{agent.llm_model}</span>
                  </div>
                )}
                {agent.llm_temperature != null && (
                  <div className="flex justify-between">
                    <span className="text-default-400">Temperature</span>
                    <span>{agent.llm_temperature}</span>
                  </div>
                )}
                {agent.llm_max_tokens != null && (
                  <div className="flex justify-between">
                    <span className="text-default-400">Max tokens</span>
                    <span>{agent.llm_max_tokens}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Add to project modal ── */}
      <Modal isOpen={addOpen} onOpenChange={() => setAddOpen((v) => !v)} size="sm">
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add to Project</ModalHeader>
              <ModalBody className="pb-6 flex flex-col gap-4">
                <p className="text-sm text-default-500">
                  Select a project to add <span className="font-semibold">{agent.name}</span> to.
                </p>
                {projectsLoading ? (
                  <div className="flex justify-center py-4"><Spinner size="sm" /></div>
                ) : (
                  <Select
                    label="Project"
                    placeholder="Select a project…"
                    selectedKeys={selectedProjectId ? new Set([selectedProjectId]) : new Set()}
                    onSelectionChange={(keys) => setSelectedProjectId(Array.from(keys)[0] as string)}
                  >
                    {projects.map((p) => (
                      <SelectItem key={p.id}>{p.name}</SelectItem>
                    ))}
                  </Select>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="light" onPress={onClose} isDisabled={adding}>Cancel</Button>
                  <Button color="primary" isLoading={adding} isDisabled={!selectedProjectId} onPress={handleAddToProject}>
                    Add
                  </Button>
                </div>
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}
