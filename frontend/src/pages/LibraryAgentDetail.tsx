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

export default function LibraryAgentDetail() {
  const { agentId } = useParams<{ agentId: string }>();
  const navigate = useNavigate();

  const [agent, setAgent] = useState<LibraryAgent | null>(null);
  const [loading, setLoading] = useState(true);

  // Edit form modal
  const [editOpen, setEditOpen] = useState(false);

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

  // Load projects when add modal opens
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
        <Button variant="flat" onPress={() => navigate("/library")}>
          Back to Library
        </Button>
      </div>
    );
  }

  const isSystem = agent.agent_type === "system";

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-default-400">
        <button
          onClick={() => navigate("/library")}
          className="hover:text-foreground transition-colors"
        >
          Library
        </button>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium truncate">{agent.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{agent.name}</h1>
            <Chip size="sm" variant="flat" color={ROLE_COLOR[agent.role] ?? "default"}>
              {agent.role}
            </Chip>
            {isSystem && (
              <Chip size="sm" variant="flat" color="primary">
                system
              </Chip>
            )}
          </div>
          {agent.published_by && (
            <p className="text-sm text-default-400 mt-0.5">by {agent.published_by}</p>
          )}
          {agent.description && (
            <p className="text-sm text-default-600 mt-2">{agent.description}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 shrink-0">
          {!isSystem && (
            <Button
              size="sm"
              variant="flat"
              onPress={() => setEditOpen(true)}
            >
              Edit
            </Button>
          )}
          <Button
            size="sm"
            color="primary"
            onPress={() => setAddOpen(true)}
          >
            + Add to Project
          </Button>
        </div>
      </div>

      {/* Tags */}
      {agent.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agent.tags.map((tag) => (
            <Chip key={tag} size="sm" variant="flat">
              {tag}
            </Chip>
          ))}
        </div>
      )}

      {/* Stats */}
      <div className="flex gap-6 text-sm text-default-400 border-y border-divider py-3">
        <span>{agent.usage_count} use{agent.usage_count !== 1 ? "s" : ""}</span>
        <span>v{agent.version}</span>
        <span>Created {new Date(agent.created_at).toLocaleDateString()}</span>
      </div>

      {/* LLM Config */}
      {(agent.llm_provider || agent.llm_model) && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">LLM Configuration</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {agent.llm_provider && (
              <div>
                <p className="text-xs text-default-400 uppercase tracking-wide">Provider</p>
                <p>{agent.llm_provider}</p>
              </div>
            )}
            {agent.llm_model && (
              <div>
                <p className="text-xs text-default-400 uppercase tracking-wide">Model</p>
                <p>{agent.llm_model}</p>
              </div>
            )}
            {agent.llm_temperature != null && (
              <div>
                <p className="text-xs text-default-400 uppercase tracking-wide">Temperature</p>
                <p>{agent.llm_temperature}</p>
              </div>
            )}
            {agent.llm_max_tokens != null && (
              <div>
                <p className="text-xs text-default-400 uppercase tracking-wide">Max tokens</p>
                <p>{agent.llm_max_tokens}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* System prompt */}
      {agent.system_prompt && (
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-foreground">System Prompt</h2>
            <Chip size="sm" variant="flat" className="text-xs">
              {agent.system_prompt_mode}
            </Chip>
          </div>
          <pre className="text-xs bg-default-100 rounded-lg p-3 whitespace-pre-wrap font-mono overflow-auto max-h-48">
            {agent.system_prompt}
          </pre>
        </section>
      )}

      {/* Sub-agents */}
      {agent.sub_agents.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Sub-agents ({agent.sub_agents.length})
          </h2>
          <div className="flex flex-col gap-2">
            {agent.sub_agents.map((sa, i) => (
              <div
                key={i}
                className="flex flex-col gap-0.5 p-3 rounded-lg border border-divider bg-default-50 text-sm"
              >
                <p className="font-medium font-mono text-xs">{sa.tool_name}</p>
                <p className="text-xs text-default-400">{sa.tool_description}</p>
                <p className="text-xs text-default-300 font-mono">{sa.agent_id}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* MCP servers */}
      {agent.mcp_servers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            MCP Servers ({agent.mcp_servers.length})
          </h2>
          <div className="flex flex-col gap-2">
            {agent.mcp_servers.map((mcp, i) => (
              <div
                key={i}
                className="flex items-center gap-2 p-3 rounded-lg border border-divider bg-default-50 text-sm"
              >
                <span className="font-medium flex-1">{mcp.name}</span>
                <Chip size="sm" variant="flat" className="font-mono text-xs">
                  {mcp.transport}
                </Chip>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Skills */}
      {agent.skills.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            Skills ({agent.skills.length})
          </h2>
          <div className="flex flex-col gap-2">
            {agent.skills.map((skill, i) => (
              <div
                key={i}
                className="flex flex-col gap-0.5 p-3 rounded-lg border border-divider bg-default-50 text-sm"
              >
                <p className="font-medium">{skill.name}</p>
                {skill.description && (
                  <p className="text-xs text-default-400">{skill.description}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Edit modal ── */}
      <Modal
        isOpen={editOpen}
        onOpenChange={() => setEditOpen((v) => !v)}
        size="2xl"
        scrollBehavior="inside"
      >
        <ModalContent>
          {() => (
            <>
              <ModalHeader>Edit Agent</ModalHeader>
              <ModalBody className="pb-6">
                <LibraryAgentForm
                  initialData={agent}
                  onSaved={(saved) => {
                    setAgent(saved);
                    setEditOpen(false);
                  }}
                  onCancel={() => setEditOpen(false)}
                />
              </ModalBody>
            </>
          )}
        </ModalContent>
      </Modal>

      {/* ── Add to project modal ── */}
      <Modal
        isOpen={addOpen}
        onOpenChange={() => setAddOpen((v) => !v)}
        size="sm"
      >
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Add to Project</ModalHeader>
              <ModalBody className="pb-6 flex flex-col gap-4">
                <p className="text-sm text-default-500">
                  Select a project to add <span className="font-semibold">{agent.name}</span> to.
                </p>

                {projectsLoading ? (
                  <div className="flex justify-center py-4">
                    <Spinner size="sm" />
                  </div>
                ) : (
                  <Select
                    label="Project"
                    placeholder="Select a project…"
                    selectedKeys={selectedProjectId ? new Set([selectedProjectId]) : new Set()}
                    onSelectionChange={(keys) =>
                      setSelectedProjectId(Array.from(keys)[0] as string)
                    }
                  >
                    {projects.map((p) => (
                      <SelectItem key={p.id}>{p.name}</SelectItem>
                    ))}
                  </Select>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="light" onPress={onClose} isDisabled={adding}>
                    Cancel
                  </Button>
                  <Button
                    color="primary"
                    isLoading={adding}
                    isDisabled={!selectedProjectId}
                    onPress={handleAddToProject}
                  >
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
